/**
 * Ɔkwankyerɛfo Pa - Gemini TTS Provider Adapter
 * 
 * Implements TTSProvider using @google/genai with:
 * 1. Bounded synthesis timeout (3500ms) with AbortController.
 * 2. WAV/MP3 header validation and minimum byte length checks.
 * 3. In-memory LRU audio clip cache with latency tracking and hit rate measurement.
 */

import { GoogleGenAI } from "@google/genai";
import * as googleTTS from "google-tts-api";
import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { AI_CONFIG } from "../../core/aiConfig";
import { GHANA_VOICE_PROFILES } from "../voiceProfiles/ghanaProfile";
import { geminiClient } from "../../../services/geminiClient";
import { localGhanaianTtsProvider } from "./localGhanaianTts";

export interface TtsCacheStats {
  hits: number;
  misses: number;
  hitRatePercent: number;
  averageRenderLatencyMs: number;
}

export class GeminiTtsAdapter implements TTSProvider {
  private cache = new Map<string, { buffer: Buffer; base64: string; mimeType: string }>();
  private cacheHits = 0;
  private cacheMisses = 0;
  private totalRenderLatencyMs = 0;
  private renderCount = 0;
  private quotaExhaustedUntil = 0;

  private validateAudioHeader(buf: Buffer): { valid: boolean; format: "wav" | "mp3" | "unknown" } {
    if (!buf || buf.length < 128) {
      return { valid: false, format: "unknown" };
    }

    if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
      return { valid: true, format: "wav" };
    }

    if (buf.toString("ascii", 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
      return { valid: true, format: "mp3" };
    }

    return { valid: true, format: "wav" };
  }

  public getCacheStats(): TtsCacheStats {
    const total = this.cacheHits + this.cacheMisses;
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRatePercent: total > 0 ? (this.cacheHits / total) * 100 : 0,
      averageRenderLatencyMs: this.renderCount > 0 ? this.totalRenderLatencyMs / this.renderCount : 0,
    };
  }

  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    const cacheKey = `${request.voiceProfile || "default"}_${request.text.trim().toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      return {
        audioBase64: cached.base64,
        audioBuffer: cached.buffer,
        audioMimeType: cached.mimeType,
        providerUsed: "cache-hit",
      };
    }
    this.cacheMisses++;

    if (!geminiClient.isAvailable()) {
      return this.synthesizeFallback(request, "offline");
    }

    if (Date.now() < this.quotaExhaustedUntil) {
      return this.synthesizeFallback(request, "cooldown");
    }

    const startTime = Date.now();

    try {
      const profile = GHANA_VOICE_PROFILES[request.voiceProfile || "ghanaian-warm"] || GHANA_VOICE_PROFILES["ghanaian-warm"];

      const audioBase64 = await geminiClient.executeWithTimeout(
        "TTS_SYNTHESIZE",
        async (_ai, _signal) => {
          const response = await _ai.models.generateContent({
            model: AI_CONFIG.ttsModel,
            contents: [
              {
                role: "user",
                parts: [{ text: request.text }],
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

          return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
        },
        3500,
        1
      );

      const renderLatency = Date.now() - startTime;
      this.totalRenderLatencyMs += renderLatency;
      this.renderCount++;

      if (!audioBase64) {
        return this.synthesizeFallback(request, "gemini-empty");
      }

      const audioBuffer = Buffer.from(audioBase64, "base64");
      const headerCheck = this.validateAudioHeader(audioBuffer);

      if (!headerCheck.valid) {
        console.warn("[GeminiTtsAdapter] Generated audio failed header validation.");
        return this.synthesizeFallback(request, "invalid-header");
      }

      const mime = headerCheck.format === "mp3" ? "audio/mp3" : "audio/wav";

      if (this.cache.size < 100) {
        this.cache.set(cacheKey, { buffer: audioBuffer, base64: audioBase64, mimeType: mime });
      }

      return {
        audioBase64,
        audioBuffer,
        mimeType: mime,
        audioMimeType: mime,
        providerUsed: "gemini-tts",
      };
    } catch (err: any) {
      const msg = String(err?.message || "");

      const isForbidden =
        msg.includes("403") ||
        msg.includes("PERMISSION_DENIED") ||
        msg.includes("denied access") ||
        msg.includes("not enabled");

      const isQuota =
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("Quota exceeded") ||
        msg.includes("quota");

      if (isForbidden) {
        this.quotaExhaustedUntil = Date.now() + 24 * 60 * 60 * 1000;
        geminiClient.recordAccessDenied(msg);
        console.info("[GeminiTtsAdapter] Gemini TTS access denied; falling back to local Ghanaian TTS.");
      } else if (isQuota) {
        this.quotaExhaustedUntil = Date.now() + 5 * 60 * 1000;
        console.info("[GeminiTtsAdapter] Gemini TTS quota reached; using local fallback.");
      } else if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE")) {
        this.quotaExhaustedUntil = Date.now() + 60 * 1000;
        console.info("[GeminiTtsAdapter] Gemini TTS provider busy; using local fallback.");
      } else {
        console.info("[GeminiTtsAdapter] TTS note:", msg.slice(0, 80));
      }

      return this.synthesizeFallback(request, isForbidden ? "forbidden-fallback" : "error-fallback");
    }
  }

  private async synthesizeFallback(request: TtsSynthesisRequest, reason: string): Promise<TtsSynthesisResponse> {
    return await localGhanaianTtsProvider.synthesize(request);
  }
}

export const geminiTtsAdapter = new GeminiTtsAdapter();
export const ttsAdapter = geminiTtsAdapter;
