/**
 * Ɔkwankyerɛfo Pa - Genuine Local Piper Neural TTS Provider (piperProvider.ts)
 * 
 * Communicates with the local Piper neural voice server (running on localhost:8766).
 * 
 * Guarantees:
 * - 100% offline, local neural speech synthesis.
 * - Does NOT generate formant or sine-wave placeholders.
 * - Validates generated audio response headers and WAV byte streams.
 */

import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";

export interface PiperHealth {
  ready: boolean;
  provider: string;
  model: string;
  dataDir?: string;
  details?: string;
}

export class PiperTtsProvider implements TTSProvider {
  private getBaseUrl(): string {
    return (process.env.PIPER_TTS_URL || "http://127.0.0.1:8766").replace(/\/$/, "");
  }

  private getTimeoutMs(): number {
    return parseInt(process.env.PIPER_TTS_TIMEOUT_MS || "3500", 10);
  }

  private validateWavHeader(buf: Buffer): boolean {
    if (!buf || buf.length < 128) return false;
    return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE";
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = process.env.PIPER_TTS_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token.trim()}`;
    }
    return headers;
  }

  /**
   * Health-checks the local Piper neural TTS worker.
   */
  public async checkHealth(): Promise<PiperHealth> {
    const url = `${this.getBaseUrl()}/health`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(url, {
        headers: this.getAuthHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as any;
        return {
          ready: Boolean(data.ready),
          provider: data.provider || "piper-local-neural-tts",
          model: data.model || process.env.PIPER_MODEL || "en_US-lessac-medium",
          dataDir: data.dataDir,
          details: data.details || "Ready for local neural TTS synthesis",
        };
      }

      return {
        ready: false,
        provider: "piper-local-neural-tts",
        model: process.env.PIPER_MODEL || "en_US-lessac-medium",
        details: `Worker returned HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        ready: false,
        provider: "piper-local-neural-tts",
        model: process.env.PIPER_MODEL || "en_US-lessac-medium",
        details: `Worker connection failed at ${url}: ${err.message}`,
      };
    }
  }

  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    const url = `${this.getBaseUrl()}/synthesize`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const headers: Record<string, string> = {
        ...this.getAuthHeaders(),
        "Content-Type": "application/json",
      };

      const body = {
        text: request.text,
        language: request.language || "en",
        voiceProfile: request.voiceProfile || "ghanaian-clear",
        speed: request.speed || 1.0,
        pitch: request.pitch,
        model: process.env.PIPER_MODEL || "en_US-lessac-medium",
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Local Piper TTS synthesis failed (${res.status}): ${errorText}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      if (!this.validateWavHeader(audioBuffer)) {
        throw new Error("Piper worker returned invalid WAV header or undersized payload (<128 bytes)");
      }

      const durationSec = parseFloat(res.headers.get("X-Piper-Duration-Seconds") || "1.0");

      return {
        audioBuffer,
        audioBase64: audioBuffer.toString("base64"),
        audioMimeType: "audio/wav",
        durationEstimateSec: Math.round(durationSec),
        providerUsed: `piper-local-neural-tts:${res.headers.get("X-Piper-Model") || "en_US-lessac-medium"}`,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      throw err;
    }
  }
}

export const piperTtsProvider = new PiperTtsProvider();
export const piperProvider = piperTtsProvider;
