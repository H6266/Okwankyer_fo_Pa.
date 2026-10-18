/**
 * Ɔkwankyerɛfo Pa - Authentic Studio Prompt Catalog Provider (studioCatalogProvider.ts)
 * 
 * Provides authentic, pre-recorded human studio recordings for canonical IVR steps.
 * 
 * Guarantees:
 * - 100% human studio quality audio for fixed prompts.
 * - Does NOT fake dynamic text (amounts, names) as pre-recorded studio recordings.
 * - Returns exact audio files from the audio catalog.
 */

import fs from "fs";
import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { isAudioContainerValid, normalizeTtsLanguage } from "./ttsProvider";
import { localGhanaianTtsProvider } from "./localGhanaianTts";

export class StudioCatalogProvider implements TTSProvider {
  /**
   * Checks if an exact or semantic matching human recording exists in the catalog.
   */
  public hasMatch(text: string, language?: string): boolean {
    return localGhanaianTtsProvider.findPromptMatch(text, language) !== null;
  }

  /**
   * Retrieves the authentic audio file for a catalog prompt.
   */
  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    const language = normalizeTtsLanguage(String(request.language || ""));
    if (!language) throw new Error("TTS_LANGUAGE_UNSUPPORTED: select English or Twi.");
    const filePath = localGhanaianTtsProvider.findPromptMatch(request.text, request.language);

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error("STUDIO_CATALOG_MISS: No verified pre-recorded studio audio is available.");
    }

    const buffer = fs.readFileSync(filePath);
    const mimeType = filePath.endsWith(".m4a") ? "audio/mp4" : filePath.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
    if (!isAudioContainerValid(buffer, mimeType)) {
      throw new Error("STUDIO_CATALOG_INVALID: recording bytes do not match their declared container.");
    }

    return {
      audioBuffer: buffer,
      audioBase64: buffer.toString("base64"),
      audioMimeType: mimeType,
      durationEstimateSec: filePath.endsWith(".m4a") ? 3.5 : Math.max(1, Math.round(buffer.length / 16000)),
      providerUsed: "authentic-studio-catalog-recording",
      language,
      model: "studio-recording",
    };
  }
}

export const studioCatalogProvider = new StudioCatalogProvider();
