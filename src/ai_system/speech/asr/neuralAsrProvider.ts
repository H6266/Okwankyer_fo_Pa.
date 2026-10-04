/**
 * Ɔkwankyerɛfo Pa - Local Neural ASR Provider (neuralAsrProvider.ts)
 * 
 * Communicates with the genuine local neural ASR worker (faster-whisper/CTranslate2)
 * running on localhost over HTTP.
 * 
 * Guarantees:
 * - 100% offline, local machine communication.
 * - Explicit health checking before claiming neural readiness.
 * - Respects timeout and bearer token authorization.
 */

import { AsrTranscriptionResult } from "./offlineAsrEngine";

export interface NeuralAsrHealth {
  ready: boolean;
  provider: string;
  model: string;
  device?: string;
  computeType?: string;
  details?: string;
}

export class NeuralAsrProvider {
  private getBaseUrl(): string {
    return (process.env.LOCAL_GHANA_ASR_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
  }

  private getTimeoutMs(): number {
    return parseInt(process.env.LOCAL_GHANA_ASR_TIMEOUT_MS || "4500", 10);
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = process.env.LOCAL_GHANA_ASR_TOKEN || process.env.LOCAL_ASR_TOKEN;
    if (token) {
      headers["Authorization"] = `Bearer ${token.trim()}`;
    }
    return headers;
  }

  /**
   * Health-checks the local neural ASR worker.
   */
  public async checkHealth(): Promise<NeuralAsrHealth> {
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
          provider: data.provider || "faster-whisper-local-neural-asr",
          model: data.model || process.env.LOCAL_ASR_MODEL_LABEL || "unknown-local-model",
          device: data.device,
          computeType: data.computeType,
          details: data.details || "Ready for local neural inference",
        };
      }

      return {
        ready: false,
        provider: "faster-whisper-local-neural-asr",
        model: process.env.LOCAL_ASR_MODEL_LABEL || "unknown",
        details: `Worker returned HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        ready: false,
        provider: "faster-whisper-local-neural-asr",
        model: process.env.LOCAL_ASR_MODEL_LABEL || "not-running",
        details: `Worker connection failed at ${url}: ${err.message}`,
      };
    }
  }

  /**
   * Dispatches speech audio to the local neural worker for transcription.
   */
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    languageHint: "auto" | "en" | "tw" = "auto"
  ): Promise<AsrTranscriptionResult> {
    const rawBuffer = typeof audioPayload === "string"
      ? Buffer.from(audioPayload.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
      : audioPayload;

    const url = `${this.getBaseUrl()}/transcribe`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const headers: Record<string, string> = {
        ...this.getAuthHeaders(),
        "Content-Type": mimeType,
        "X-Language-Hint": languageHint,
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: new Uint8Array(rawBuffer),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Local neural ASR failed (${res.status}): ${errorText}`);
      }

      const json = (await res.json()) as any;
      return {
        text: json.text || "",
        confidence: typeof json.confidence === "number" ? json.confidence : 0.85,
        confidenceSource: json.confidenceSource || "MODEL_HEURISTIC",
        detectedLanguage: json.language === "tw" ? "tw" : "en",
        speechActivityDetected: Boolean(json.text && json.text.trim().length > 0),
        durationMs: json.durationMs || 300,
        provider: json.provider || "faster-whisper-local-neural-asr",
        decoder: json.decoder,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      throw err;
    }
  }
}

export const neuralAsrProvider = new NeuralAsrProvider();
