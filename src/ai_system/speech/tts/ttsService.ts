/**
 * Ɔkwankyerɛfo Pa - TTS Service Orchestrator
 * High-level speech generation service supporting multiple backend providers.
 */

import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { geminiTtsAdapter } from "./ttsAdapter";
import { localGhanaianTtsProvider } from "./localGhanaianTts";
import { speechNormalizer } from "../speechNormalizer";
import { pronunciationEngine } from "../pronunciation/pronunciationEngine";
import { geminiClient } from "../../../services/geminiClient";

export class TtsService {
  private primaryProvider: TTSProvider;
  private fallbackProvider: TTSProvider;

  constructor(
    primary: TTSProvider = localGhanaianTtsProvider,
    fallback: TTSProvider = geminiTtsAdapter
  ) {
    this.primaryProvider = primary;
    this.fallbackProvider = fallback;
  }

  public setProvider(provider: TTSProvider): void {
    this.primaryProvider = provider;
  }

  public async speak(
    rawText: string,
    language: any = "tw",
    voiceProfile: string = "ghanaian-warm",
    userId?: string
  ): Promise<TtsSynthesisResponse> {
    // 1. Speech normalization (currency verbalization, phone cadence)
    const normalizedText = speechNormalizer.normalizeForSpeech(rawText, language);

    // 2. Pronunciation enrichment (names, places, user preferences)
    const { enrichedText, hints } = pronunciationEngine.prepareTextForTts(normalizedText, userId);

    const request: TtsSynthesisRequest = {
      text: enrichedText,
      language,
      voiceProfile,
      pronunciationHints: hints,
    };

    // If Gemini is available and preferred, try it first, but gracefully fallback to local
    if (geminiClient.isAvailable() && process.env.PREFER_GEMINI_TTS === "true") {
      try {
        const cloudResult = await this.fallbackProvider.synthesize(request);
        if (cloudResult.audioBuffer || cloudResult.audioBase64) {
          return cloudResult;
        }
      } catch (err) {
        console.warn("[TtsService] Cloud TTS notice, continuing to local Ghanaian TTS:", err);
      }
    }

    // Reliable Local Ghanaian TTS synthesis
    try {
      return await this.primaryProvider.synthesize(request);
    } catch (err: any) {
      // Guaranteed PCM WAV fallback
      return localGhanaianTtsProvider.synthesize(request);
    }
  }
}

export const ttsService = new TtsService();
