/**
 * Ɔkwankyerɛfo Pa - TTS Service Orchestrator
 * High-level speech generation service supporting multiple backend providers.
 */

import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { geminiTtsAdapter } from "./ttsAdapter";
import { speechNormalizer } from "../speechNormalizer";
import { pronunciationEngine } from "../pronunciation/pronunciationEngine";

export class TtsService {
  private activeProvider: TTSProvider;

  constructor(provider: TTSProvider = geminiTtsAdapter) {
    this.activeProvider = provider;
  }

  public setProvider(provider: TTSProvider): void {
    this.activeProvider = provider;
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

    // 3. Synthesize via active provider
    const request: TtsSynthesisRequest = {
      text: enrichedText,
      language,
      voiceProfile,
      pronunciationHints: hints,
    };

    return this.activeProvider.synthesize(request);
  }
}

export const ttsService = new TtsService();
