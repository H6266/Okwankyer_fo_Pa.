/**
 * Ɔkwankyerɛfo Pa - Ghanaian Neural TTS Provider (ghanaianTtsProvider.ts)
 * 
 * Provides authentic Akan Twi & Ghanaian English dynamic speech synthesis:
 * - Direct integration with local studio pre-recorded prompt catalog for fixed IVR phrases
 * - Formant acoustic synthesis with Akan vowel targets (a, e, ɛ, i, o, ɔ, u) for dynamic names and numbers
 * - Lexical tone modulation (high, low, falling pitch contours)
 * - Telephony 8 kHz / 16 kHz PCM WAV rendering
 */

import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { localGhanaianTtsProvider } from "./localGhanaianTts";
import { normalizeTtsLanguage } from "./ttsProvider";

export class GhanaianTtsProvider implements TTSProvider {
  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    const language = normalizeTtsLanguage(String(request.language || ""));
    if (!language) throw new Error("GHANAIAN_TTS_LANGUAGE_UNSUPPORTED: select English or Twi.");
    const response = await localGhanaianTtsProvider.synthesize({
      ...request,
      language: language === "twi" ? "tw" : "en",
    });

    return {
      ...response,
      providerUsed: "local-ghanaian-phoneme-tts",
    };
  }
}

export const ghanaianTtsProvider = new GhanaianTtsProvider();
