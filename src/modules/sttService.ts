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

export interface SttResult {
  text: string;
  confidence: number;
  languageDetected?: "en" | "twi";
  provider: string;
  pinDiscarded?: boolean;
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
  deadlineMs: number = 3000
): Promise<SttResult> {
  if (!geminiClient.isAvailable()) {
    // Clean buffer
    buffer.fill(0);
    return {
      text: "empty",
      confidence: 0.0,
      languageDetected: "en",
      provider: "FallbackSTT",
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
3. Transcribe only what the caller actually spoke. Do not assume or hallucinate.`;

  const primaryModel = AI_CONFIG.transcriptionModel || "gemini-3.5-transcribe";
  const secondaryModel = "gemini-3.8-flash";

  try {
    const rawJsonText = await geminiClient.executeHedged(
      "STT_TRANSCRIBE",
      async (ai, signal) => {
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
      1200 // Hedge delay: start secondary after 1.2s if primary hasn't responded
    );

    const parsed = JSON.parse(rawJsonText);
    const transcript = (parsed.transcript || "").trim();
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.75;
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
    auditLogger.log("warn", "STT", `STT deadline exceeded or error: ${err.message}. Falling back closed to DTMF.`);
    return {
      text: "empty",
      confidence: 0.0,
      languageDetected: "en",
      provider: "FallbackSTT",
    };
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
        return await transcribeAudioBufferWithHedgedGemini(buffer, mime, step, 3000);
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
        return await transcribeAudioBufferWithHedgedGemini(buffer, mime, step, 3000);
      }
    }

    // 3. Raw Buffer
    if (Buffer.isBuffer(audioPayload)) {
      return await transcribeAudioBufferWithHedgedGemini(audioPayload, mimeType, step, 3000);
    }

    // 4. Direct text string (for testing or direct pipeline invocation)
    if (typeof audioPayload === "string") {
      const clean = audioPayload.trim();
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
): Promise<{ text: string; confidence: number; pinDiscarded?: boolean }> {
  const result = await speechToTextService.transcribe(audioBuffer, mimeType, step);
  return {
    text: result.text,
    confidence: result.confidence,
    pinDiscarded: result.pinDiscarded,
  };
}
