/**
 * Ɔkwankyerɛfo Pa - Gemini TTS Provider Adapter
 * 
 * Implements TTSProvider using @google/genai with:
 * 1. Bounded synthesis timeout (3500ms) with AbortController.
 * 2. WAV/MP3 header validation and minimum byte length checks.
 * 3. In-memory LRU audio clip cache with latency tracking and hit rate measurement.
 */

import { GoogleGenAI } from "@google/genai";
import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { assertTtsResponse, getTtsErrorCode, isAudioContainerValid, normalizeTtsLanguage } from "./ttsProvider";
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
    const language = normalizeTtsLanguage(String(request.language || ""));
    if (!language) throw new Error("TTS_LANGUAGE_UNSUPPORTED: select English or Twi.");
    if (language !== "en") {
      throw new Error("TTS_LANGUAGE_UNAVAILABLE: Gemini English voice is not approved for Twi speech.");
    }
    const cacheKey = `${language}:${AI_CONFIG.ttsModel}:${request.voiceProfile || "default"}:${request.text.trim().toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      return assertTtsResponse(request, {
        audioBase64: cached.base64,
        audioBuffer: cached.buffer,
        audioMimeType: cached.mimeType,
        providerUsed: "cache-hit",
        language: "en",
        model: AI_CONFIG.ttsModel,
      });
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

          const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          return { data: inlineData?.data || "", mimeType: inlineData?.mimeType || "" };
        },
        3500,
        1
      );

      const renderLatency = Date.now() - startTime;
      this.totalRenderLatencyMs += renderLatency;
      this.renderCount++;

      if (!audioBase64.data) {
        return this.synthesizeFallback(request, "gemini-empty");
      }

      let audioBuffer = Buffer.from(audioBase64.data, "base64");
      let mime = audioBase64.mimeType.split(";")[0].toLowerCase();
      if (mime === "audio/l16" || mime === "audio/pcm") {
        const pcm = convertPcmToWav(audioBuffer, audioBase64.mimeType);
        if (!pcm) throw new Error("TTS_PCM_FORMAT_UNSUPPORTED: sample rate, channel count, bit depth, or byte order is missing.");
        audioBuffer = pcm;
        mime = "audio/wav";
      }
      if (!isAudioContainerValid(audioBuffer, mime)) {
        throw new Error(`TTS_AUDIO_INVALID: Gemini returned ${audioBase64.mimeType || "unknown MIME type"} without a matching supported container.`);
      }

      const response: TtsSynthesisResponse = {
        audioBase64: audioBuffer.toString("base64"),
        audioBuffer,
        mimeType: mime,
        audioMimeType: mime,
        providerUsed: "gemini-tts",
        language,
        model: AI_CONFIG.ttsModel,
      };
      if (this.cache.size < 100) {
        this.cache.set(cacheKey, { buffer: audioBuffer, base64: response.audioBase64!, mimeType: mime });
      }
      return assertTtsResponse(request, response, "en");
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
        console.info("[GeminiTtsAdapter] TTS provider error code:", getTtsErrorCode(err));
      }

      return this.synthesizeFallback(request, isForbidden ? "forbidden" : "provider-error");
    }
  }

  private async synthesizeFallback(request: TtsSynthesisRequest, reason: string): Promise<TtsSynthesisResponse> {
    const recording = await localGhanaianTtsProvider.synthesize(request);
    return assertTtsResponse(request, { ...recording, providerUsed: `verified-recording:${reason}` }, "en");
  }
}

function convertPcmToWav(audio: Buffer, mimeType: string): Buffer | null {
  const parameters = Object.fromEntries(
    [...mimeType.matchAll(/(?:^|;)\s*([\w-]+)=([\w-]+)/g)].map((match) => [match[1].toLowerCase(), match[2].toLowerCase()])
  );
  const sampleRate = Number(parameters.rate || parameters.samplerate);
  const channels = Number(parameters.channels || parameters.channel);
  const bitsPerSample = Number(parameters.bits || (mimeType.toLowerCase().startsWith("audio/l16") ? 16 : 0));
  const byteOrder = parameters.endian || parameters.endianness
    || (mimeType.toLowerCase().startsWith("audio/l16") ? "big" : "");
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000
    || !Number.isInteger(channels) || channels < 1 || channels > 8
    || bitsPerSample !== 16 || !["big", "little", "be", "le"].includes(byteOrder)
    || audio.length === 0 || audio.length % (channels * 2) !== 0) return null;

  const pcm = Buffer.from(audio);
  if (["big", "be"].includes(byteOrder)) {
    for (let offset = 0; offset < pcm.length; offset += 2) {
      const first = pcm[offset];
      pcm[offset] = pcm[offset + 1];
      pcm[offset + 1] = first;
    }
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export const geminiTtsAdapter = new GeminiTtsAdapter();
export const ttsAdapter = geminiTtsAdapter;
