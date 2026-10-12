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
    const filePath = localGhanaianTtsProvider.findPromptMatch(request.text, request.language);

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`STUDIO_CATALOG_MISS: No pre-recorded studio audio for: "${request.text}"`);
    }

    const buffer = fs.readFileSync(filePath);
    const mimeType = filePath.endsWith(".m4a") ? "audio/mp4" : filePath.endsWith(".mp3") ? "audio/mpeg" : "audio/wav";

    return {
      audioBuffer: buffer,
      audioBase64: buffer.toString("base64"),
      audioMimeType: mimeType,
      durationEstimateSec: filePath.endsWith(".m4a") ? 3.5 : Math.max(1, Math.round(buffer.length / 16000)),
      providerUsed: "authentic-studio-catalog-recording",
    };
  }
}

export const studioCatalogProvider = new StudioCatalogProvider();
