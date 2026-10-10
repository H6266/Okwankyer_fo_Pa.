/**
 * Ɔkwankyerɛfo Pa - Production Speech-To-Text (STT) Service
 * 
 * Enforces:
 * 1. Step-aware PIN Safety Gate (Item 3.1): Discards PINs at menus, permits 1-5000 GHS amounts.
 * 2. Per-turn Deadline (Item 3.2): Strict overall timeout (default 3s) with hedged model requests.
 * 3. Log PII Scrubbing: NEVER logs raw transcripts; logs only redacted intent/slots.
 * 4. Best-Effort Memory Hygiene (Item 3.7): Zeroes native buffers immediately.
 * 5. Closed fallback to keypad DTMF on timeout, error, or silence.
 */

import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG } from "../ai_system/core/aiConfig";
import { geminiClient } from "../services/geminiClient";
import { auditLogger } from "../services/auditLogger";
import { offlineSpeechRecognizer } from "../ai_system/speech/asr/offlineAsrEngine";
import { ghanaNlpAsrService } from "../services/ghanaNlpAsrService";
import { formatSpokenNumbersAsDigits } from "../domain/numberFormatter";
import {
  isAcousticSystemEcho,
  stripSystemEchoFromTranscript,
  isBackgroundNoiseOrStatic,
} from "../domain/echoFilter";
import { asrOrchestrator } from "../ai_system/speech/asr/asrOrchestrator";

export interface SttResult {
  text: string;
  confidence: number | null;
  confidenceSource?: "provider" | "calibrated" | "provider_unreported" | "unavailable";
  languageDetected?: "en" | "twi" | string;
  provider: string;
  providerAttempted?: string;
  fallbackUsed?: boolean;
  pinDiscarded?: boolean;
  audioQuality?: any;
}

export interface SpeechToTextProvider {
  transcribe(audioPayload: Buffer | string, mimeType?: string, step?: string): Promise<SttResult>;
}

/**
 * Step-Aware PIN Safety Gate (Item 3.1)
 * Decides whether an utterance is a potential leaked PIN based on the dialogue step.
 */
export function isSpokenPinPattern(text: string, step?: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();

  // 1. Explicit PIN/secret keywords: ALWAYS dropped anywhere
  if (/\b(pin|momo\s*pin|password|secret|passcode|kokoam|ahintasɛm)\b/i.test(lower)) {
    return true;
  }

  // Spoken credentials like "my secret is one two three"
  if (/(secret|password|pin)/i.test(lower) && /(one|two|three|four|five|six|seven|eight|nine|zero)/i.test(lower)) {
    return true;
  }

  const digitsOnly = text.trim().replace(/[^0-9]/g, "");
  const normalizedStep = (step || "").toLowerCase();

  // 2. Step: Amount Input ("enter-amount", "amount")
  if (normalizedStep.includes("amount")) {
    // Legitimate amounts: 1 to 4 digits (up to 5,000 GHS) or spoken cedi amounts
    // Do NOT drop legitimate amounts like "1000", "2500", "5000", "send 3000", "1 0 0 0"
    if (digitsOnly.length >= 1 && digitsOnly.length <= 4) {
      return false; // Permitted amount
    }
    // If someone speaks 5-6 standalone digits without cedi words at amount step, drop as probable PIN
    if (digitsOnly.length > 4 && digitsOnly.length <= 6 && !/(cedis?|ghs|pesewas|ghana)/i.test(lower)) {
      return true;
    }
    return false;
  }

  // 3. Step: Menu / Selection ("language-selection", "service-choice", "menu")
  if (
    normalizedStep.includes("menu") ||
    normalizedStep.includes("selection") ||
    normalizedStep.includes("choice")
  ) {
    // Menu step accepts only 1 single digit or single command word.
    // ANY multi-digit input (e.g. "1234", "5544") is suspicious and dropped
    if (digitsOnly.length >= 2) {
      return true;
    }
    // Check spoken digits (e.g. "one two three four")
    const digitWords = lower.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|baako|mmienu|mmiensa)\b/g);
    if (digitWords && digitWords.length >= 2) {
      return true;
    }
    return false;
  }

  // 4. Step: Recipient Phone Input ("enter-recipient", "recipient")
  if (normalizedStep.includes("recipient")) {
    // Recipient phone numbers have 9-10 digits.
    // Standalone 4-6 digits is not a phone number and dropped as a PIN candidate
    if (digitsOnly.length >= 4 && digitsOnly.length <= 6 && !/(phone|number|recipient)/i.test(lower)) {
      return true;
    }
    return false;
  }

  // 5. Default fallback if step is unknown
  if (
    digitsOnly.length >= 4 &&
    digitsOnly.length <= 6 &&
    !/(cedis?|ghs|pesewas|ghana|phone|number)/i.test(lower)
  ) {
    return true;
  }

  return false;
}

/**
 * Downloads a remote telephony audio recording with strict timeout and one retry.
 */
async function fetchRemoteRecording(url: string, timeoutMs: number = 1500): Promise<Buffer> {
  let attempt = 0;
  while (attempt <= 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {};
      if (process.env.AT_API_KEY) {
        headers["apiKey"] = process.env.AT_API_KEY;
      }
      const resp = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (resp.ok) {
        const arrayBuf = await resp.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch {
      clearTimeout(timer);
    }
    attempt++;
  }
  throw new Error(`Failed to fetch audio recording from remote within deadline.`);
}

/**
 * Transcribes audio buffer with Gemini using hedged requests and strict per-turn deadline.
 */
async function transcribeAudioBufferWithHedgedGemini(
  buffer: Buffer,
  mime: string,
  step?: string,
  deadlineMs: number = 1200
): Promise<SttResult> {
  const primaryModel = (AI_CONFIG.transcriptionModel && AI_CONFIG.transcriptionModel !== "gemini-3.5-transcribe")
    ? AI_CONFIG.transcriptionModel
    : (process.env.GEMINI_MODEL || "gemini-2.5-flash");
  const secondaryModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const hasAnyModel = geminiClient.isAvailable() && (
    geminiClient.isModelAvailable(primaryModel) ||
    geminiClient.isModelAvailable(secondaryModel)
  );

  if (!hasAnyModel) {
    const offlineRes = await offlineSpeechRecognizer.transcribe(buffer, mime, step);
    buffer.fill(0);
    return {
      text: formatSpokenNumbersAsDigits(offlineRes.text),
      confidence: offlineRes.confidence,
      languageDetected: offlineRes.detectedLanguage === "tw" ? "twi" : "en",
      provider: offlineRes.provider,
    };
  }

  // Convert to base64 for payload
  const base64Data = buffer.toString("base64");

  // Best-effort memory hygiene: native buffer memory is zeroed out immediately.
  // Note: V8 JavaScript strings are immutable and cannot be synchronously zeroed;
  // they remain in garbage collection memory until pruned.
  buffer.fill(0);

  const promptText = `You are a speech-to-text engine for an IVR phone banking service in Ghana (Ɔkwankyerɛfo Pa).
The caller spoke in Ghanaian English, Akan Twi, or Ghanaian code-switched speech.
Listen to the recording and transcribe the caller's spoken words or numbers.

Vocabulary context:
- Numbers: '1', '2', '3', 'one', 'two', 'three', 'baako', 'mmienu', 'mmeensa', 'fifty', 'hundred', 'thousand'
- Languages: 'English', 'Twi', 'Akan', 'me pɛ Twi', 'kasa Twi', 'brofo'
- Providers: 'MTN', 'Telecel', 'Vodafone', 'AT'
- Actions: 'send money', 'transfer', 'check balance', 'balance', 'airtime', 'bills', 'sika', 'mane sika'
- Common names: 'Kwame', 'Ama', 'Kofi', 'Akua'
- Confirmation: 'yes', 'confirm', 'no', 'change', 'repeat', 'back', 'cancel', 'stop', 'aane', 'ɛyɛ', 'dabi', 'sesa'

Instructions:
1. Return strictly valid JSON with keys: "transcript", "confidence" (0.0 to 1.0), "languageDetected" ("en" or "twi").
2. If the audio is silent, inaudible, noisy, or background static, set "transcript": "" and "confidence": 0.0.
3. Transcribe only what the caller actually spoke. Do not assume or hallucinate.
4. NUMBER FORMATTING MANDATE: Always write numbers and digits as numeric digits (e.g. write '2' NOT 'two', write '1' NOT 'one', write '20' NOT 'twenty', write '50 cedis' NOT 'fifty cedis', write '0553838464' NOT 'zero five five...'). Never spell out numbers as words.`;

  try {
    const rawJsonText = await geminiClient.executeHedged(
      "STT_TRANSCRIBE",
      async (ai, signal) => {
        const isTranscribeModel = primaryModel.includes("transcribe");
        if (isTranscribeModel) {
          // Dedicated transcribe models (e.g. gemini-3.5-transcribe) output plain text and do NOT support JSON mode
          const resp = await ai.models.generateContent({
            model: primaryModel,
            contents: [
              { inlineData: { data: base64Data, mimeType: mime } },
              { text: "Transcribe the caller's spoken words or numbers accurately in Ghanaian English or Akan Twi. Output only the spoken words. Write all numbers as digits (e.g. 2 not two, 20 not twenty)." },
            ],
          });
          const text = formatSpokenNumbersAsDigits((resp.text || "").trim());
          const isTwi = /[\u0190\u0254\u025b\u0186]|sika|mane|akwaaba|kasa|brofo|baako|mmienu|mmeensa|dabi|aane|mepa|kyɛ/i.test(text);
          return JSON.stringify({
            transcript: text,
            confidence: text.length > 0 ? 0.92 : 0.0,
            languageDetected: isTwi ? "twi" : "en",
          });
        }

        const resp = await ai.models.generateContent({
          model: primaryModel,
          contents: [
            { inlineData: { data: base64Data, mimeType: mime } },
            { text: promptText },
          ],
          config: { responseMimeType: "application/json" },
        });
        return resp.text || "{}";
      },
      async (ai, signal) => {
        const isTranscribeModel = secondaryModel.includes("transcribe");
        if (isTranscribeModel) {
          const resp = await ai.models.generateContent({
            model: secondaryModel,
            contents: [
              { inlineData: { data: base64Data, mimeType: mime } },
              { text: "Transcribe the caller's spoken words or numbers accurately in Ghanaian English or Akan Twi. Output only the spoken words. Write all numbers as digits (e.g. 2 not two, 20 not twenty)." },
            ],
          });
          const text = formatSpokenNumbersAsDigits((resp.text || "").trim());
          const isTwi = /[\u0190\u0254\u025b\u0186]|sika|mane|akwaaba|kasa|brofo|baako|mmienu|mmeensa|dabi|aane|mepa|kyɛ/i.test(text);
          return JSON.stringify({
            transcript: text,
            confidence: text.length > 0 ? 0.92 : 0.0,
            languageDetected: isTwi ? "twi" : "en",
          });
        }

        const resp = await ai.models.generateContent({
          model: secondaryModel,
          contents: [
            { inlineData: { data: base64Data, mimeType: mime } },
            { text: promptText },
          ],
          config: { responseMimeType: "application/json" },
        });
        return resp.text || "{}";
      },
      deadlineMs,
      Math.min(800, Math.floor(deadlineMs * 0.67)) // Hedge delay: start secondary after 800ms if primary hasn't responded
    );

    let cleanJson = (rawJsonText || "").trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }
    let parsed: any = {};
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      parsed = { transcript: cleanJson, confidence: cleanJson.length > 0 ? 0.8 : 0.0, languageDetected: "en" };
    }

    const rawTranscript = (parsed.transcript || "").trim();
    let transcript = formatSpokenNumbersAsDigits(rawTranscript);

    // Suppress acoustic echo and background noise from recorded audio
    if (isBackgroundNoiseOrStatic(transcript)) {
      transcript = "";
    } else if (isAcousticSystemEcho(transcript)) {
      const stripped = stripSystemEchoFromTranscript(transcript);
      transcript = (!stripped || isAcousticSystemEcho(stripped)) ? "" : stripped;
    }

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : (transcript.length > 0 ? 0.75 : 0.0);
    const languageDetected = parsed.languageDetected === "twi" ? "twi" : "en";

    // Item 3.1: Step-aware PIN gate
    if (isSpokenPinPattern(transcript, step)) {
      auditLogger.log("warn", "PIN_SAFETY", `Spoken PIN pattern intercepted and discarded at step '${step || "unknown"}'`);
      return {
        text: "[DISCARDED_PIN]",
        confidence: 0.0,
        languageDetected,
        provider: "PIN_SAFETY_GATE",
        pinDiscarded: true,
      };
    }

    // Item 3.1: NEVER log raw transcript in audit logs; log intent/length only
    auditLogger.log("info", "STT", `Transcribed utterance at step '${step || "unknown"}': length=${transcript.length}, confidence=${confidence.toFixed(2)}`);

    return {
      text: transcript.length > 0 ? transcript : "empty",
      confidence: transcript.length > 0 ? confidence : 0.0,
      languageDetected,
      provider: "HedgedGeminiSTT",
    };
  } catch (err: any) {
    const msg = String(err?.message || "");
    const isQuota =
      err?.status === 429 ||
      msg.includes("429") ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes("Quota exceeded");
    const isForbidden =
      err?.status === 403 ||
      msg.includes("403") ||
      msg.includes("PERMISSION_DENIED") ||
      msg.includes("denied access");

    if (isQuota) {
      let cooldownMs = 60 * 60 * 1000;
      const retrySecMatch = msg.match(/retryDelay['":\s]+([0-9]+)/i);
      if (retrySecMatch && retrySecMatch[1]) {
        cooldownMs = Math.max(60 * 1000, parseInt(retrySecMatch[1], 10) * 1000);
      }
      geminiClient.recordModelQuotaExhausted(primaryModel, cooldownMs);
      geminiClient.recordModelQuotaExhausted(secondaryModel, cooldownMs);
      geminiClient.recordQuotaExhausted(cooldownMs);
      auditLogger.log("info", "STT", `Gemini STT quota limit reached (429). Seamlessly routing speech turns to offline recognizer & DTMF.`);
    } else if (isForbidden) {
      geminiClient.recordAccessDenied(msg);
      auditLogger.log("info", "STT", `Gemini STT access not permitted (403). Operating with offline recognizer & DTMF.`);
    } else {
      auditLogger.log("info", "STT", `STT notice (${msg.slice(0, 80)}). Falling back to offline speech recognizer.`);
    }

    try {
      const offlineRes = await offlineSpeechRecognizer.transcribe(base64Data, mime, step);
      if (offlineRes.text && offlineRes.text.length > 0) {
        return {
          text: formatSpokenNumbersAsDigits(offlineRes.text),
          confidence: offlineRes.confidence,
          languageDetected: offlineRes.detectedLanguage === "tw" ? "twi" : "en",
          provider: offlineRes.provider,
        };
      }
    } catch {
      // offline recognizer fallback
    }

    auditLogger.log("info", "STT", `Falling back closed to DTMF.`);
    return {
      text: "empty",
      confidence: 0.0,
      languageDetected: "en",
      provider: "FallbackSTT",
    };
  }
}

/**
 * Authoritative unified ASR transcription delegating to asrOrchestrator:
 * Primary: Ghana NLP ASR v3
 * Fallback: Hedged Gemini STT / Offline Speech Recognizer
 */
async function transcribeAudioBufferUnified(
  buffer: Buffer,
  mime: string,
  step?: string,
  _deadlineMs?: number
): Promise<SttResult> {
  try {
    const orchResult = await asrOrchestrator.transcribe(
      buffer,
      mime,
      { step, allowFallback: true }
    );
    return {
      text: orchResult.text.length > 0 ? orchResult.text : "empty",
      confidence: orchResult.confidence,
      confidenceSource: orchResult.confidenceSource,
      languageDetected: orchResult.languageDetected.includes("tw") ? "twi" : "en",
      provider: orchResult.providerUsed,
      providerAttempted: orchResult.providerAttempted,
      fallbackUsed: orchResult.fallbackUsed,
      pinDiscarded: orchResult.pinDiscarded,
      audioQuality: orchResult.audioQuality,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    // Invalid or truncated recordings should safely fall back to an empty
    // result, not crash the telephony request.
    if (message.startsWith("EMPTY_AUDIO:") || message.startsWith("CORRUPT_AUDIO:")) {
      return {
        text: "empty",
        confidence: 0,
        languageDetected: "en",
        provider: "AudioValidationFallback",
      };
    }

    throw error;
  } finally {
    // Audio may contain sensitive speech. Clear the supplied buffer even
    // when normalization, transcription, or validation throws.
    buffer.fill(0);
  }
}

export class TelephonySpeechService implements SpeechToTextProvider {
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    step?: string
  ): Promise<SttResult> {
    // 1. Remote Africa's Talking recording URL
    if (
      typeof audioPayload === "string" &&
      (audioPayload.startsWith("http://") || audioPayload.startsWith("https://"))
    ) {
      try {
        const buffer = await fetchRemoteRecording(audioPayload, 1500);
        if (buffer.length < 300) {
          buffer.fill(0);
          return { text: "empty", confidence: 0.0, provider: "TelephonySpeechService" };
        }

        let mime = "audio/mp3";
        if (audioPayload.toLowerCase().includes(".wav")) {
          mime = "audio/wav";
        }
        return await transcribeAudioBufferUnified(buffer, mime, step, 3000);
      } catch (err: any) {
        return { text: "empty", confidence: 0.0, provider: "TelephonySpeechService" };
      }
    }

    // 2. Base64 data URI
    if (typeof audioPayload === "string" && audioPayload.startsWith("data:audio")) {
      const match = audioPayload.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        const buffer = Buffer.from(match[2], "base64");
        return await transcribeAudioBufferUnified(buffer, mime, step, 3000);
      }
    }

    // 3. Raw Buffer
    if (Buffer.isBuffer(audioPayload)) {
      try {
        return await transcribeAudioBufferUnified(audioPayload, mimeType, step, 3000);
      } catch {
        return {
          text: "empty",
          confidence: 0.0,
          languageDetected: "en",
          provider: "TelephonySpeechService",
        };
      } finally {
        audioPayload.fill(0);
      }
    }

    // 4. Direct text string (for testing or direct pipeline invocation)
    if (typeof audioPayload === "string") {
      const clean = formatSpokenNumbersAsDigits(audioPayload.trim());
      if (isSpokenPinPattern(clean, step)) {
        return {
          text: "[DISCARDED_PIN]",
          confidence: 0.0,
          languageDetected: "en",
          provider: "PIN_SAFETY_GATE",
          pinDiscarded: true,
        };
      }
      return {
        text: clean,
        confidence: clean.length > 0 ? 1.0 : 0.0,
        languageDetected: "en",
        provider: "DirectInputAdapter",
      };
    }

    return {
      text: "empty",
      confidence: 0.0,
      languageDetected: "en",
      provider: "TelephonySpeechService",
    };
  }
}

export const speechToTextService = new TelephonySpeechService();

export async function speechToText(
  audioBuffer: Buffer | string,
  mimeType?: string,
  step?: string
): Promise<{ text: string; confidence: number; languageDetected?: "en" | "twi" | string; pinDiscarded?: boolean }> {
  const result = await speechToTextService.transcribe(audioBuffer, mimeType, step);
  return {
    text: result.text,
    confidence: result.confidence,
    languageDetected: result.languageDetected,
    pinDiscarded: result.pinDiscarded,
  };
}
