/**
 * Ɔkwankyerɛfo Pa - AI Transcription Engine
 * Specialised for Ghanaian English and Akan Twi Speech-to-Text.
 */

import { GoogleGenAI } from "@google/genai";
import { TranscribeOptions, TranscriptionResult, SupportedLanguage } from "./types";
import { DEFAULT_AI_CONFIG, GHANAIAN_AUDIO_HINTS } from "./config";

export class TranscriptionEngine {
  private ai: GoogleGenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": DEFAULT_AI_CONFIG.userAgentHeader,
          },
        },
      });
    }
  }

  /**
   * Transcribes raw audio buffer or base64 string with Akan Twi / Ghanaian English optimization.
   */
  public async transcribe(options: TranscribeOptions): Promise<TranscriptionResult> {
    if (!this.ai) {
      this.initClient();
    }

    if (!this.ai) {
      console.warn("[TranscriptionEngine] No GEMINI_API_KEY configured. Returning fallback transcription.");
      return {
        text: "",
        confidence: 0,
        detectedLanguage: options.expectedLanguage || "en",
        languageConfidence: 0,
        isFallback: true,
      };
    }

    try {
      const buffer = typeof options.audioBuffer === "string"
        ? Buffer.from(options.audioBuffer.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
        : options.audioBuffer;

      const base64Data = buffer.toString("base64");
      const mimeType = options.mimeType || "audio/mp3";
      const lang = options.expectedLanguage || "bilingual";

      const hints = [
        ...(GHANAIAN_AUDIO_HINTS[lang] || []),
        ...(options.contextHints || []),
      ].join(", ");

      const prompt = `You are a Ghanaian Speech Recognition (ASR) system for Ɔkwankyerɛfo Pa.
The speaker may speak in Ghanaian English, Akan Twi (Asante or Akuapem), or a mix of both.
Vocabulary hints in this session: ${hints}.

Instructions:
1. Transcribe what the caller said word-for-word.
2. If spoken in Twi, write standard Akan orthography (using Ɔ, ɔ, Ɛ, ɛ when appropriate).
3. Detect whether the language spoken was 'en' (English) or 'twi'.
4. Estimate your transcription confidence score between 0.0 and 1.0.

Respond strictly in valid JSON:
{
  "transcription": "user utterance here",
  "language": "en" | "twi",
  "confidence": 0.95
}`;

      const audioPart = {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      };

      const response = await this.ai.models.generateContent({
        model: DEFAULT_AI_CONFIG.geminiModel,
        contents: [
          audioPart,
          { text: prompt },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      const responseText = response.text || "{}";
      const parsed = JSON.parse(responseText);

      const text = (parsed.transcription || "").trim();
      const detectedLanguage: SupportedLanguage = parsed.language === "twi" ? "twi" : "en";
      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.85;

      return {
        text,
        confidence,
        detectedLanguage,
        languageConfidence: 0.9,
        rawResponse: responseText,
      };
    } catch (err: any) {
      console.error("[TranscriptionEngine] Transcription error:", err.message);
      return {
        text: "",
        confidence: 0,
        detectedLanguage: options.expectedLanguage || "en",
        languageConfidence: 0,
        isFallback: true,
      };
    }
  }
}

export const transcriptionEngine = new TranscriptionEngine();
