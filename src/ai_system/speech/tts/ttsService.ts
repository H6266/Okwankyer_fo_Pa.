/**
 * Ɔkwankyerɛfo Pa - TTS Service Orchestrator
 * High-level speech generation service supporting multiple backend providers.
 */

import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { ttsRouter } from "./ttsRouter";
import { speechNormalizer } from "../speechNormalizer";
import { pronunciationEngine } from "../pronunciation/pronunciationEngine";

export class TtsService {
  private primaryProvider: TTSProvider;

  constructor(primary: TTSProvider = ttsRouter) {
    this.primaryProvider = primary;
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

    // The router tries verified recordings, actual Piper inference, and the
    // configured remote backend. A formant experiment is never an implicit fallback.
    return this.primaryProvider.synthesize(request);
  }
}

export const ttsService = new TtsService();
