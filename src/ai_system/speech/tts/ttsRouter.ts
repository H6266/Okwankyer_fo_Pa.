/**
 * Ɔkwankyerɛfo Pa - Honest Multi-Tier TTS Router (ttsRouter.ts)
 * 
 * Implements Batch 2 Honest Speech Synthesis Routing:
 * 1. STUDIO_CATALOG: Verified human studio audio recordings for fixed IVR prompts.
 * 2. LOCAL_NEURAL_PIPER: Genuine local Piper neural voice for dynamic speech (names, numbers, receipts).
 * 3. REMOTE_GEMINI_TTS: Optional cloud accelerator if configured.
 * 4. EXPERIMENTAL_FORMANT_TTS: Formant synthesis is explicitly disabled by default;
 *    allowed only when ALLOW_EXPERIMENTAL_FORMANT_TTS=true for development experiments.
 */

import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { studioCatalogProvider } from "./studioCatalogProvider";
import { piperProvider } from "./localTtsProvider";
import { localGhanaianTtsProvider } from "./localGhanaianTts";
import { ttsAdapter } from "./ttsAdapter";
import { geminiClient } from "../../../services/geminiClient";

export type TtsTier = "STUDIO_CATALOG" | "LOCAL_NEURAL_PIPER" | "REMOTE_GEMINI_TTS" | "EXPERIMENTAL_FORMANT_TTS";

export interface TtsRouterReport {
  tier: TtsTier;
  provider: string;
  durationEstimateSec?: number;
  offlineReady: boolean;
}

export class TtsRouter implements TTSProvider {
  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    // Tier 1: Check authentic human studio recording catalog
    if (studioCatalogProvider.hasMatch(request.text)) {
      try {
        return await studioCatalogProvider.synthesize(request);
      } catch (err: any) {
        console.warn("[TtsRouter] Studio catalog retrieval error:", err.message);
      }
    }

    // Tier 2: Genuine Local Neural Piper TTS Runtime
    try {
      const piperResult = await piperProvider.synthesize(request);
      if (piperResult.audioBuffer && piperResult.audioBuffer.length > 64) {
        return piperResult;
      }
    } catch {
      // Piper worker may be unstarted or offline
    }

    // Tier 3: Optional Remote Gemini TTS Accelerator
    if (geminiClient.isAvailable()) {
      try {
        const cloudResult = await ttsAdapter.synthesize(request);
        if (cloudResult.audioBuffer && cloudResult.audioBuffer.length > 44) {
          return cloudResult;
        }
      } catch (err: any) {
        console.warn("[TtsRouter] Remote Gemini TTS unavailable:", err.message);
      }
    }

    // Tier 4: Experimental Formant TTS (Strictly disabled by default)
    const allowExperimentalFormants =
      process.env.ALLOW_EXPERIMENTAL_FORMANT_TTS === "true";

    if (allowExperimentalFormants) {
      return localGhanaianTtsProvider.synthesize(request);
    }

    throw new Error(
      "LOCAL_NEURAL_TTS_UNAVAILABLE: Genuine local Piper TTS runtime (http://127.0.0.1:8766) is offline. " +
      "Start the worker with 'python ml/local_tts_server.py'. Set ALLOW_EXPERIMENTAL_FORMANT_TTS=true only for development experiments."
    );
  }

  public async getRouterReport(): Promise<TtsRouterReport> {
    const health = await piperProvider.checkHealth();
    return {
      tier: "LOCAL_NEURAL_PIPER",
      provider: health.provider,
      offlineReady: health.ready,
    };
  }
}

export const ttsRouter = new TtsRouter();
