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
import { pronunciationEngine } from "../pronunciation/pronunciationEngine";

export class GhanaianTtsProvider implements TTSProvider {
  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    // Enrich with Ghanaian pronunciation hints
    const { enrichedText } = pronunciationEngine.prepareTextForTts(request.text);

    // Delegate to local Ghanaian TTS provider
    const response = await localGhanaianTtsProvider.synthesize({
      ...request,
      text: enrichedText,
    });

    return {
      ...response,
      providerUsed: "local-ghanaian-phoneme-tts",
    };
  }
}

export const ghanaianTtsProvider = new GhanaianTtsProvider();
