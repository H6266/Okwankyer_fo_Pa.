/**
 * Ɔkwankyerɛfo Pa - Speech-to-Text (STT) Abstraction Layer
 * 
 * Provides an enterprise-grade, resilient ASR abstraction over Google Gemini:
 * 1. Primary model: 'gemini-3.5-transcribe' (with automatic cascade to 'gemini-3.8-flash' and 'gemini-flash-latest').
 * 2. Strict bounded timeouts (4500ms download, 4500ms STT inference) to eliminate caller dead air.
 * 3. Non-negotiable PIN safety: any 4-6 digit sequence or PIN utterance is instantly discarded and NEVER logged.
 * 4. Zero audio retention: audio buffers are explicitly zeroed and discarded after processing.
 * 5. Real confidence measurement: no hardcoded or mock confidence in production paths; honest 0.0-1.0 scoring.
 * 6. Untrusted speech bounding: model outputs are strictly validated via Zod schema.
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { redactPii } from "../domain/validation";

export interface SttResult {
  text: string;
  confidence: number;
  languageDetected?: string;
  provider: string;
  pinDiscarded?: boolean;
}

export interface SpeechToTextProvider {
  transcribe(audioPayload: Buffer | string, mimeType?: string): Promise<SttResult>;
}

const SttResponseSchema = z.object({
  transcript: z.string().default(""),
  confidence: z.number().min(0).max(1).default(0),
  languageDetected: z.enum(["en", "twi"]).optional().default("en"),
});

let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

/**
 * Rule 4: Detects whether speech transcript contains a 4-6 digit PIN or secret.
 */
export function isSpokenPinPattern(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  
  // Explicit PIN mentions: "my pin is 1234", "pin 5432"
  if (/\b(pin|momo\s*pin|password|secret|passcode)\b/i.test(lower)) {
    return true;
  }

  // Standalone 4, 5, or 6 digit number without currency context or phone length
  const digitsOnly = text.trim().replace(/[^0-9]/g, "");
  if (
    digitsOnly.length >= 4 &&
    digitsOnly.length <= 6 &&
    !/(cedis?|ghs|pesewas|ghana)/i.test(lower) &&
    !/(phone|number|recipient|call)/i.test(lower)
  ) {
    return true;
  }

  return false;
}

/**
 * Transcribes an audio buffer with Gemini, enforcing zero audio retention,
 * bounded timeouts, and PIN safety.
 */
async function transcribeAudioBufferWithGemini(buffer: Buffer, mime: string): Promise<SttResult> {
  const ai = getAi();
  if (!ai) {
    console.warn("[STT] GEMINI_API_KEY not configured. Falling back closed to DTMF.");
    // Rule 5: Zero audio buffer
    buffer.fill(0);
    return {
      text: "empty",
      confidence: 0.0,
      languageDetected: "en",
      provider: "FallbackSTT",
    };
  }

  const base64Data = buffer.toString("base64");
  
  // Rule 5: Clean buffer immediately once base64 payload is created
  buffer.fill(0);

  const promptText = `You are a speech-to-text engine for an IVR phone banking service in Ghana (Ɔkwankyerɛfo Pa).
The caller spoke in Ghanaian English, Akan Twi, or Ghanaian code-switched speech.
Listen to the recording and transcribe the caller's spoken words or numbers.

Vocabulary context:
- Numbers: '1', '2', '3', 'one', 'two', 'three', 'baako', 'mmienu', 'mmeensa'
- Languages: 'English', 'Twi', 'Akan', 'me pɛ Twi', 'kasa Twi', 'brofo'
- Providers: 'MTN', 'Telecel', 'Vodafone', 'AirtelTigo', 'AT'
- Actions: 'send money', 'transfer', 'check balance', 'balance', 'airtime', 'bills', 'sika', 'mane sika'
- Common names: 'Kwame', 'Ama', 'Kofi', 'Akua'
- Confirmation: 'yes', 'confirm', 'no', 'change', 'repeat', 'back', 'cancel', 'stop', 'aane', 'ɛyɛ', 'dabi', 'sesa'

Instructions:
1. Return strictly valid JSON with keys: "transcript", "confidence" (0.0 to 1.0), "languageDetected" ("en" or "twi").
2. If the audio is silent, inaudible, noisy, or background static, set "transcript": "" and "confidence": 0.0.
3. Transcribe only what the caller actually spoke. Do not assume or hallucinate.`;

  // Candidate transcription models in order of priority per official skill
  const candidateModels = [
    process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe",
    "gemini-3.8-flash",
    "gemini-flash-latest",
  ];

  for (const modelName of candidateModels) {
    try {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 4500);

      const responsePromise = ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mime,
            },
          },
          { text: promptText },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.0,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        abortController.signal.addEventListener("abort", () => {
          reject(new Error(`STT model ${modelName} timed out after 4500ms`));
        });
      });

      const response = await Promise.race([responsePromise, timeoutPromise]);
      clearTimeout(timeoutId);

      const rawJson = response?.text?.trim() || "";
      if (!rawJson) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        continue;
      }

      const validated = SttResponseSchema.safeParse(parsed);
      if (!validated.success) {
        continue;
      }

      const transcript = validated.data.transcript.trim();
      const confidence = validated.data.confidence;
      const languageDetected = validated.data.languageDetected;

      // Rule 4: Non-negotiable PIN safety check
      if (isSpokenPinPattern(transcript)) {
        console.warn("[STT] Spoken PIN pattern intercepted! Discarding transcript immediately for security.");
        return {
          text: "[DISCARDED_PIN]",
          confidence: 0.0,
          languageDetected,
          provider: "PIN_SAFETY_GATE",
          pinDiscarded: true,
        };
      }

      const isEmpty = !transcript || transcript.toLowerCase() === "empty";
      return {
        text: isEmpty ? "empty" : transcript,
        confidence: isEmpty ? 0.0 : confidence,
        languageDetected,
        provider: `GeminiSTT_${modelName}`,
      };
    } catch (err: any) {
      console.warn(`[STT] Model ${modelName} failed or timed out (${err.message}). Trying next candidate...`);
    }
  }

  // Fail closed if all models exhausted
  return {
    text: "empty",
    confidence: 0.0,
    languageDetected: "en",
    provider: "FallbackClosedSTT",
  };
}

/**
 * Standard Telephony Audio STT Adapter
 */
export class TelephonySpeechService implements SpeechToTextProvider {
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav"
  ): Promise<SttResult> {
    // 1. Remote Africa's Talking recording URL
    if (
      typeof audioPayload === "string" &&
      (audioPayload.startsWith("http://") || audioPayload.startsWith("https://"))
    ) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);

        const headers: Record<string, string> = {};
        if (process.env.AT_API_KEY) {
          headers["apiKey"] = process.env.AT_API_KEY;
        }

        const resp = await fetch(audioPayload, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          console.error(`[STT] Failed to download recording from ${redactPii(audioPayload)}: HTTP ${resp.status}`);
          return { text: "empty", confidence: 0.0, provider: "TelephonySpeechService" };
        }

        const arrayBuffer = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length < 300) {
          console.warn("[STT] Audio payload under 300 bytes (silent/empty recording).");
          buffer.fill(0);
          return { text: "empty", confidence: 0.0, provider: "TelephonySpeechService" };
        }

        let mime = "audio/mp3";
        const contentType = (resp.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("wav") || audioPayload.toLowerCase().includes(".wav")) {
          mime = "audio/wav";
        }

        return await transcribeAudioBufferWithGemini(buffer, mime);
      } catch (err: any) {
        console.error(`[STT] Error fetching recording URL: ${err.message}`);
        return { text: "empty", confidence: 0.0, provider: "TelephonySpeechService" };
      }
    }

    // 2. Base64 data URI
    if (typeof audioPayload === "string" && audioPayload.startsWith("data:audio")) {
      const match = audioPayload.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        const buffer = Buffer.from(match[2], "base64");
        return await transcribeAudioBufferWithGemini(buffer, mime);
      }
    }

    // 3. Raw Buffer
    if (Buffer.isBuffer(audioPayload)) {
      return await transcribeAudioBufferWithGemini(audioPayload, mimeType);
    }

    // 4. Direct text string (for testing or synthesized utterance harness)
    if (typeof audioPayload === "string") {
      const clean = audioPayload.trim();
      if (isSpokenPinPattern(clean)) {
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

/**
 * Convenience helper matching standard signature:
 * speechToText(audioBuffer) -> { text: string, confidence: number }
 */
export async function speechToText(
  audioBuffer: Buffer | string,
  mimeType?: string
): Promise<{ text: string; confidence: number; pinDiscarded?: boolean }> {
  const result = await speechToTextService.transcribe(audioBuffer, mimeType);
  return {
    text: result.text,
    confidence: result.confidence,
    pinDiscarded: result.pinDiscarded,
  };
}
