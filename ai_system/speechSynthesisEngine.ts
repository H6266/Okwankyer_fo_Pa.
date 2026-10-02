/**
 * Ɔkwankyerɛfo Pa - AI Speech Synthesis (TTS) Engine
 * Produces natural spoken audio prompts in Ghanaian English and Akan Twi.
 */

import { GoogleGenAI } from "@google/genai";
import { SupportedLanguage, VoicePromptResult } from "./types";
import { DEFAULT_AI_CONFIG } from "./config";

export class SpeechSynthesisEngine {
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
   * Generates spoken audio for text using Gemini TTS with Ghanaian accent adaptation.
   */
  public async synthesize(
    text: string,
    language: SupportedLanguage = "en",
    stylePrompt: string = "Warm, patient, clear Ghanaian assistant"
  ): Promise<VoicePromptResult> {
    if (!this.ai) {
      this.initClient();
    }

    if (!this.ai) {
      return {
        spokenText: text,
        language,
      };
    }

    try {
      const response = await this.ai.models.generateContent({
        model: DEFAULT_AI_CONFIG.ttsModel,
        contents: [
          {
            role: "user",
            parts: [
              {
                text,
                speechMetadata: {
                  style: stylePrompt,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      return {
        spokenText: text,
        language,
        audioBase64,
        audioMimeType: "audio/wav",
      };
    } catch (err: any) {
      console.warn("[SpeechSynthesisEngine] Synthesis notice:", err.message);
      return {
        spokenText: text,
        language,
      };
    }
  }
}

export const speechSynthesisEngine = new SpeechSynthesisEngine();
