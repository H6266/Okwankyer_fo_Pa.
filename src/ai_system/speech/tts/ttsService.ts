/**
 * Ɔkwankyerɛfo Pa - TTS Service Orchestrator
 * High-level speech generation service supporting multiple backend providers.
 */

import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { ttsRouter } from "./ttsRouter";
import { speechNormalizer } from "../speechNormalizer";
import { pronunciationEngine } from "../pronunciation/pronunciationEngine";
import { findRecordedReplyAudio, matchReplyToAudio } from "../../../audio/replyAudioMatcher";

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
    // 0. Confidence-based Audio Matcher (Plays studio audio if >= 50% confidence, falls back to TTS if < 50%)
    const match = matchReplyToAudio(rawText, language, { minConfidence: 0.50 });
    if (match.match && match.audioBuffer) {
      const mimeType = match.audioUrl?.endsWith(".m4a")
        ? "audio/mp4"
        : match.audioUrl?.endsWith(".aac")
        ? "audio/aac"
        : "audio/mpeg";
      return {
        audioBuffer: match.audioBuffer,
        audioBase64: match.audioBuffer.toString("base64"),
        audioMimeType: mimeType,
        mimeType,
        durationEstimateSec: Math.max(1, Math.round(match.audioBuffer.length / 16000)),
        providerUsed: `studio-audio:${match.title || match.audioUrl} (confidence: ${Math.round(match.confidence * 100)}%)`,
      };
    }

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
