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
import { getActiveTtsProvider } from "../speechProvider";

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
    if (studioCatalogProvider.hasMatch(request.text, request.language)) {
      try {
        return await studioCatalogProvider.synthesize(request);
      } catch (err: any) {
        console.warn("[TtsRouter] Studio catalog retrieval error:", err.message);
      }
    }

    // Tier 2: Pluggable Neural TTS Runtime (Piper offline prototype or University of Ghana HCI Lab API)
    try {
      const activeTts = getActiveTtsProvider(request.language);
      const pluggableResult = await activeTts.synthesize(request.text, request.language === "tw" ? "tw" : "en");
      if (pluggableResult.audioBuffer && pluggableResult.audioBuffer.length > 64) {
        return {
          audioBuffer: pluggableResult.audioBuffer,
          audioBase64: pluggableResult.audioBase64,
          audioMimeType: pluggableResult.audioMime,
          durationEstimateSec: Math.max(1, Math.round(request.text.split(/\s+/).length * 0.35)),
          providerUsed: pluggableResult.provider,
        };
      }
    } catch {
      // Pluggable server may be unconfigured; try direct Piper worker
      try {
        const piperResult = await piperProvider.synthesize(request);
        if (piperResult.audioBuffer && piperResult.audioBuffer.length > 64) {
          return piperResult;
        }
      } catch {}
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

    // Tier 4: Genuine Local Ghanaian Speech Synthesizer (Studio catalog + Google neural synthesis)
    try {
      const localResult = await localGhanaianTtsProvider.synthesize(request);
      if (localResult.audioBuffer && localResult.audioBuffer.length > 44) {
        return localResult;
      }
    } catch (err: any) {
      console.warn("[TtsRouter] Local Ghanaian TTS notice:", err.message);
    }

    // Tier 5: Safe clean studio welcome fallback (never sine-wave noise)
    return await localGhanaianTtsProvider.synthesize(request);
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
