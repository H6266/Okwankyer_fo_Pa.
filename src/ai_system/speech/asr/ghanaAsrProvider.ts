/**
 * Ɔkwankyerɛfo Pa - Ghanaian Neural ASR Adapter (ghanaAsrProvider.ts)
 * 
 * Provides an interface for local neural ASR models
 * (e.g. qwen3-asr-akuapem-twi, whisper-twi, or local ONNX inference).
 * When neural model server is not reachable, falls back seamlessly to localAsrProvider.
 */

import { AsrTranscriptionResult } from "./offlineAsrEngine";
import { localAsrProvider } from "./localAsrProvider";

export interface GhanaAsrConfig {
  endpointUrl?: string;
  modelName: string;
  timeoutMs: number;
}

export class GhanaAsrProvider {
  private config: GhanaAsrConfig;

  constructor() {
    this.config = {
      endpointUrl: process.env.LOCAL_GHANA_ASR_URL,
      modelName: process.env.LOCAL_GHANA_ASR_MODEL || "ghananlpcommunity/qwen3-asr-akuapem-twi",
      timeoutMs: 4000,
    };
  }

  public async transcribe(audioPayload: Buffer | string, mimeType: string = "audio/wav"): Promise<AsrTranscriptionResult> {
    // If local neural server endpoint is configured and active, attempt inference
    if (this.config.endpointUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
        const buffer = typeof audioPayload === "string"
          ? Buffer.from(audioPayload.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
          : audioPayload;

        const res = await fetch(`${this.config.endpointUrl}/transcribe`, {
          method: "POST",
          headers: {
            "Content-Type": mimeType,
            "X-Model-Name": this.config.modelName,
          },
          body: new Uint8Array(buffer),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const json = await res.json() as any;
          return {
            text: json.text || "",
            confidence: json.confidence || 0.88,
            detectedLanguage: json.language === "tw" ? "tw" : "en",
            speechActivityDetected: true,
            durationMs: json.durationMs || 300,
            provider: `ghana-neural-asr:${this.config.modelName}`,
          };
        }
      } catch {
        // Fall through to deterministic local ASR provider
      }
    }

    // Default to authoritative local provider
    return localAsrProvider.transcribe(audioPayload, mimeType);
  }
}

export const ghanaAsrProvider = new GhanaAsrProvider();
