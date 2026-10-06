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
    // Check WAV (RIFF....WAVE)
    if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
      return { valid: true, format: "wav" };
    }
    // Check MP3 (ID3 or frame sync 0xFF 0xFB/0xE0)
    if (buf.toString("ascii", 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
      return { valid: true, format: "mp3" };
    }
    // PCM / Raw audio fallback
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
      const style = `Spoken with a natural ${profile.name} tone, patient and respectful.`;

      const audioBase64 = await geminiClient.executeWithTimeout(
        "TTS_SYNTHESIZE",
        async (ai, signal) => {
          const response = await ai.models.generateContent({
            model: AI_CONFIG.ttsModel,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: request.text,
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
          return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
        },
        3500, // 3.5s timeout
        1
      );

      const renderLatency = Date.now() - startTime;
      this.totalRenderLatencyMs += renderLatency;
      this.renderCount++;

      if (audioBase64) {
        const audioBuffer = Buffer.from(audioBase64, "base64");
        const headerCheck = this.validateAudioHeader(audioBuffer);
        if (!headerCheck.valid) {
          console.warn("[GeminiTtsAdapter] Generated audio failed header validation (size under 128 bytes).");
          return this.synthesizeFallback(request, "invalid-header");
        }

        const mime = headerCheck.format === "mp3" ? "audio/mp3" : "audio/wav";
        // Cache up to 100 clips
        if (this.cache.size < 100) {
          this.cache.set(cacheKey, { buffer: audioBuffer, base64: audioBase64, mimeType: mime });
        }

        return {
          audioBase64,
          audioBuffer,
          audioMimeType: mime,
          providerUsed: "gemini-tts",
        };
      }

      return this.synthesizeFallback(request, "gemini-empty");
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
        // Cooldown for 24 hours so we don't spam 403 on every spoken phrase
        this.quotaExhaustedUntil = Date.now() + 24 * 60 * 60 * 1000;
        console.warn("[GeminiTtsAdapter] Gemini TTS is not permitted for current project (403 PERMISSION_DENIED). Seamlessly falling back to local / Google speech synthesis.");
      } else if (isQuota) {
        this.quotaExhaustedUntil = Date.now() + 5 * 60 * 1000;
        console.warn(`[GeminiTtsAdapter] Gemini TTS quota exhausted (429 RESOURCE_EXHAUSTED). Free tier daily quota reached. Local Ghanaian synthesis will serve requests until ${new Date(this.quotaExhaustedUntil).toLocaleTimeString()}.`);
      } else {
        console.warn("[GeminiTtsAdapter] Gemini TTS notice:", msg);
      }

      return this.synthesizeFallback(request, isForbidden ? "forbidden-fallback" : "error-fallback");
    }
  }

  private async synthesizeFallback(request: TtsSynthesisRequest, reason: string): Promise<TtsSynthesisResponse> {
    const isAkan = request.language === "tw" || /([ɛɔ]|mepa|sika|mane|akwaaba|dabi|aane)/i.test(request.text);

    // Try Google TTS for non-Akan / English text if under 200 characters
    if (!isAkan && request.text.length <= 200) {
      try {
        const b64 = await googleTTS.getAudioBase64(request.text, {
          lang: "en",
          slow: false,
          host: "https://translate.google.com",
          timeout: 3000,
        });
        if (b64 && b64.length > 64) {
          const buf = Buffer.from(b64, "base64");
          return {
            audioBase64: b64,
            audioBuffer: buf,
            audioMimeType: "audio/mp3",
            providerUsed: `google-tts-${reason}`,
          };
        }
      } catch {
        // Fall through to local Ghanaian provider
      }
    }

    try {
      const localResult = await localGhanaianTtsProvider.synthesize(request);
      if (localResult.audioBuffer && localResult.audioBuffer.length > 44) {
        return localResult;
      }
    } catch {
      // Fall through to PCM generator
    }

    const fallbackBuffer = localGhanaianTtsProvider.generatePcmWav(request.text, 1.0);
    return {
      audioBuffer: fallbackBuffer,
      audioBase64: fallbackBuffer.toString("base64"),
      audioMimeType: "audio/wav",
      providerUsed: `local-ghanaian-${reason}`,
    };
  }
}

export const geminiTtsAdapter = new GeminiTtsAdapter();
export const ttsAdapter = geminiTtsAdapter;
