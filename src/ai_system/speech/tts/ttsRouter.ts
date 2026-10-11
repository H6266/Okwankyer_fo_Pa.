/**
 * Ɔkwankyerɛfo Pa - Local-only TTS Router.
 * Uses studio recordings first, then local Piper neural TTS.
 * No cloud TTS providers are called by this router.
 */
import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { studioCatalogProvider } from "./studioCatalogProvider";
import { piperProvider } from "./localTtsProvider";
import { localGhanaianTtsProvider } from "./localGhanaianTts";

export type TtsTier = "STUDIO_CATALOG" | "LOCAL_NEURAL_PIPER";
export interface TtsRouterReport {
  tier: TtsTier;
  provider: string;
  durationEstimateSec?: number;
  offlineReady: boolean;
}

export class TtsRouter implements TTSProvider {
  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
<<<<<<< HEAD
    if (studioCatalogProvider.hasMatch(request.text, request.language)) {
=======
    // Tier 1: Check authentic human studio recording catalog
    if (!request.skipCatalogCheck && studioCatalogProvider.hasMatch(request.text, request.language)) {
>>>>>>> origin/main
      try {
        return await studioCatalogProvider.synthesize(request);
      } catch (err: any) {
        console.warn("[TtsRouter] Studio recording unavailable:", err?.message || err);
      }
    }

    try {
      const result = await piperProvider.synthesize(request);
      if (result.audioBuffer && result.audioBuffer.length > 64) return result;
      throw new Error("Local Piper returned empty audio.");
    } catch (err: any) {
      console.warn("[TtsRouter] Local Piper unavailable:", err?.message || err);
    }

    // Only matching recordings or a test-only audio fixture may be returned here.
    return localGhanaianTtsProvider.synthesize(request);
  }

  public async synthesizeBrainReply(reply: { text: string; language: string; promptId?: string }): Promise<TtsSynthesisResponse> {
    const isTwi = reply.language === "tw" || reply.language === "ak" || reply.language.startsWith("twi");
    return this.synthesize({
      text: reply.text,
      language: isTwi ? "tw" : "en",
      voiceProfile: reply.promptId,
    });
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
