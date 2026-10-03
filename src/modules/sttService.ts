/**
 * Ɔkwankyerɛfo Pa - Speech-to-Text (STT) Abstraction Layer
 * 
 * Provides a provider-swappable interface for transcribing voice audio
 * into normalized text + confidence score.
 * 
 * NOTE: For future Ghanaian language support (Akan Twi, Ga, Ewe),
 * fine-tuned models can be plugged in behind this interface.
 */

import { GoogleGenAI } from "@google/genai";

export interface SttResult {
  text: string;
  confidence: number;
  languageDetected?: string;
  provider: string;
}

export interface SpeechToTextProvider {
  transcribe(audioBuffer: Buffer | string, mimeType?: string): Promise<SttResult>;
}

let aiClient: GoogleGenAI | null = null;
function getAi(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

async function transcribeAudioBufferWithGemini(buffer: Buffer, mime: string): Promise<SttResult> {
  const ai = getAi();
  if (!ai) {
    console.error("❌ [CRITICAL] GEMINI_API_KEY is not configured in process.env!");
    console.error("👉 To enable spoken voice recognition (English & Akan Twi):");
    console.error("   Open your Render Dashboard -> Environment -> Add 'GEMINI_API_KEY'");
    return {
      text: "empty",
      confidence: 0,
      languageDetected: "en",
      provider: "FallbackSTT",
    };
  }

  try {
    const base64Data = buffer.toString("base64");
    const promptText = `You are an automated speech recognition engine for an IVR phone banking and mobile money system in Ghana (Okwankyerɛfo Pa).
The caller spoke in English or Ghanaian Akan Twi.
Listen to the recording and transcribe the user's spoken command, number, name, or amount.

Common Ghanaian caller speech:
- Numbers: '1', '2', '3', 'one', 'two', 'three', 'baako', 'mmienu', 'mmeensa', 'first', 'second', 'option one', 'option two'
- Languages: 'English', 'Twi', 'Akan', 'me pɛ Twi', 'kasa Twi', 'brofo'
- Providers: 'MTN', 'Telecel', 'Vodafone', 'AirtelTigo', 'AT'
- Actions: 'send money', 'transfer', 'check balance', 'balance', 'airtime', 'bills', 'sika', 'mane sika'
- Recipients: 'Kwame', 'Ama', '0241234567', phone numbers
- Amounts: '50', 'fifty cedis', '500', 'two hundred', 'ahankron'
- Confirmation: 'yes', 'confirm', 'no', 'change', 'repeat', 'back', 'cancel', 'stop', 'aane', 'ɛyɛ', 'dabi', 'sesa'

Return ONLY the plain transcribed words or numbers. Do NOT include markdown, punctuation, quotes, or conversational filler. If the recording is silent, background static, inaudible, or empty, return 'empty'.`;

    let response: any = null;
    // Multi-model cascade for quota and rate-limit resilience:
    // Starts with gemini-3.1-flash-lite (high token throughput pool), then gemini-flash-latest, then gemini-3.8-flash
    const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
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
        });
        if (response?.text) {
          break;
        }
      } catch (modelErr: any) {
        const isQuota = modelErr?.message?.includes("quota") || modelErr?.message?.includes("resource_exhausted") || modelErr?.status === 429;
        if (isQuota) {
          console.warn(`[STT Service] Model ${modelName} quota exceeded, automatically failing over to next model candidate...`);
        } else {
          console.warn(`[STT Service] Model ${modelName} failed (${modelErr?.message || modelErr}), trying next candidate...`);
        }
      }
    }

    if (!response || !response.text) {
      console.warn("⚠️ All STT models exhausted or quota reached. Using fallback empty speech detection.");
      return { text: "empty", confidence: 0.1, provider: "FallbackSTT" };
    }

    const text = (response.text || "").trim().replace(/["'`]/g, "");
    console.log(`🤖 Gemini Speech Recognition result: "${text}"`);
    const isEmpty = !text || text.toLowerCase() === "empty" || text.toLowerCase() === "inaudible";
    return {
      text: isEmpty ? "empty" : text,
      confidence: isEmpty ? 0.2 : 0.95,
      languageDetected: "en",
      provider: "GeminiSTT",
    };
  } catch (err: any) {
    console.error("❌ Gemini audio transcription error:", err);
    return { text: "empty", confidence: 0.1, provider: "GeminiSTTError" };
  }
}

/**
 * Standard Telephony Audio STT Adapter
 */
export class TelephonySpeechService implements SpeechToTextProvider {
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav"
  ): Promise<SttResult> {
    // 1. If incoming payload is a remote recording URL (from Africa's Talking)
    if (
      typeof audioPayload === "string" &&
      (audioPayload.startsWith("http://") || audioPayload.startsWith("https://"))
    ) {
      console.log(`📥 Downloading Africa's Talking recording from: ${audioPayload}`);
      try {
        let resp = await fetch(audioPayload);
        if (!resp.ok && process.env.AT_API_KEY) {
          resp = await fetch(audioPayload, { headers: { apiKey: process.env.AT_API_KEY } });
        }
        if (!resp.ok) {
          console.error(`Failed to download recording from ${audioPayload}: HTTP ${resp.status}`);
          return { text: "empty", confidence: 0, provider: "TelephonySpeechService" };
        }
        const arrayBuffer = await resp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`📥 Recording downloaded successfully: ${buffer.length} bytes`);
        if (buffer.length < 500) {
          console.warn("⚠️ Audio payload is very small (<500 bytes), likely empty recording.");
          return { text: "empty", confidence: 0.1, provider: "TelephonySpeechService" };
        }
        const contentType = (resp.headers.get("content-type") || "").toLowerCase();
        let mime = "audio/mp3";
        if (contentType.includes("wav") || audioPayload.toLowerCase().includes(".wav")) {
          mime = "audio/wav";
        } else if (contentType.includes("mpeg") || contentType.includes("mp3") || audioPayload.toLowerCase().includes(".mp3")) {
          mime = "audio/mp3";
        }
        return await transcribeAudioBufferWithGemini(buffer, mime);
      } catch (err: any) {
        console.error("Failed to fetch recording URL:", err.message);
        return { text: "empty", confidence: 0, provider: "TelephonySpeechService" };
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

    // 4. Direct text string (for testing or simulated speech)
    if (typeof audioPayload === "string") {
      return {
        text: audioPayload.trim(),
        confidence: 0.95,
        languageDetected: "en",
        provider: "TelephonySpeechService",
      };
    }

    return {
      text: "empty",
      confidence: 0,
      languageDetected: "en",
      provider: "TelephonySpeechService",
    };
  }
}

export const speechToTextService = new TelephonySpeechService();

/**
 * Convenience helper matching the prompt signature:
 * speechToText(audioBuffer) -> { text: string, confidence: number }
 */
export async function speechToText(
  audioBuffer: Buffer | string,
  mimeType?: string
): Promise<{ text: string; confidence: number }> {
  const result = await speechToTextService.transcribe(audioBuffer, mimeType);
  return {
    text: result.text,
    confidence: result.confidence,
  };
}

