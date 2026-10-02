/**
 * Ɔkwankyerɛfo Pa - Gemini TTS Provider Adapter
 * Implements TTSProvider using @google/genai and Gemini 3 series audio models.
 */

import { GoogleGenAI } from "@google/genai";
import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { AI_CONFIG } from "../../core/aiConfig";
import { GHANA_VOICE_PROFILES } from "../voiceProfiles/ghanaProfile";

export class GeminiTtsAdapter implements TTSProvider {
  private ai: GoogleGenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    if (process.env.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": AI_CONFIG.userAgentHeader,
          },
        },
      });
    }
  }

  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    if (!this.ai) {
      this.initClient();
    }

    if (!this.ai) {
      return {
        audioMimeType: "audio/wav",
        providerUsed: "fallback-text-only",
      };
    }

    try {
      const profile = GHANA_VOICE_PROFILES[request.voiceProfile || "ghanaian-warm"] || GHANA_VOICE_PROFILES["ghanaian-warm"];
      const style = `Spoken with a natural ${profile.name} tone, patient and respectful.`;

      const response = await this.ai.models.generateContent({
        model: AI_CONFIG.ttsModel,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: request.text,
                speechMetadata: {
                  style,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: profile.providerVoiceName },
            },
          },
        },
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (audioBase64) {
        return {
          audioBase64,
          audioBuffer: Buffer.from(audioBase64, "base64"),
          audioMimeType: "audio/wav",
          providerUsed: "gemini-tts",
        };
      }

      return {
        audioMimeType: "audio/wav",
        providerUsed: "gemini-tts-empty",
      };
    } catch (err: any) {
      console.warn("[GeminiTtsAdapter] Notice:", err.message);
      return {
        audioMimeType: "audio/wav",
        providerUsed: "error-fallback",
      };
    }
  }
}

export const geminiTtsAdapter = new GeminiTtsAdapter();
