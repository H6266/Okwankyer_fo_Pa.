/**
 * Ɔkwankyerɛfo Pa - Piper & Local Neural TTS Adapter (piperProvider.ts)
 * 
 * Supports local execution of Piper-compatible Ghanaian voice models
 * (e.g. ghananlpcommunity/stable-twi-tts or local VITS ONNX model).
 * When local neural binary or HTTP daemon is available, synthesizes via Piper;
 * otherwise cascades smoothly to ghanaianTtsProvider.
 */

import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { ghanaianTtsProvider } from "./ghanaianTtsProvider";

export interface PiperConfig {
  endpointUrl?: string;
  modelPath?: string;
  voiceName: string;
}

export class PiperTtsProvider implements TTSProvider {
  private config: PiperConfig;

  constructor() {
    this.config = {
      endpointUrl: process.env.PIPER_TTS_URL,
      modelPath: process.env.PIPER_MODEL_PATH,
      voiceName: process.env.PIPER_VOICE_NAME || "tw_gh_akuapem",
    };
  }

  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    const start = performance.now();

    // If local daemon is running, call it
    if (this.config.endpointUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`${this.config.endpointUrl}/synthesize`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: request.text,
            voice: this.config.voiceName,
            speed: request.speed || 1.0,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.ok) {
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          return {
            audioBuffer: buffer,
            audioMimeType: "audio/wav",
            durationEstimateSec: Math.round((performance.now() - start) / 1000),
            providerUsed: `piper-vits:${this.config.voiceName}`,
          };
        }
      } catch {
        // Fall through to Ghanaian acoustic synthesis
      }
    }

    return ghanaianTtsProvider.synthesize(request);
  }
}

export const piperTtsProvider = new PiperTtsProvider();
