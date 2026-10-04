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
import path from "path";
import { AUDIO_CATALOG } from "../../../audio/catalog";
import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";

export class StudioCatalogProvider implements TTSProvider {
  private catalog = new Map<string, string>(); // normalizedText -> absoluteFilePath

  constructor() {
    this.initCatalog();
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\sɛɔƐƆ]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private initCatalog(): void {
    const cwd = process.cwd();
    for (const item of AUDIO_CATALOG) {
      const fullPath = path.resolve(cwd, "audio", item.filename);
      if (fs.existsSync(fullPath)) {
        this.catalog.set(this.normalizeText(item.id), fullPath);
        this.catalog.set(this.normalizeText(item.title), fullPath);
        if (item.spokenText) {
          this.catalog.set(this.normalizeText(item.spokenText), fullPath);
        }
      }
    }

    // Common short aliases
    const registerAlias = (alias: string, relativePath: string) => {
      const full = path.resolve(cwd, relativePath);
      if (fs.existsSync(full)) {
        this.catalog.set(this.normalizeText(alias), full);
      }
    };

    registerAlias("welcome", "audio/Welcome_prompt_01.mp3");
    registerAlias("akwaaba", "audio/Twi/Welcome_prompt_01.mp3");
    registerAlias("select network", "audio/English/Audio_prompt_03.mp3");
    registerAlias("enter recipient", "audio/English/Audio_prompt_06.mp3");
    registerAlias("enter amount", "audio/English/Audio_prompt_07.mp3");
    registerAlias("confirm transaction", "audio/English/Audio_prompt_08.mp3");
  }

  /**
   * Checks if an exact matching human recording exists in the catalog.
   */
  public hasMatch(text: string): boolean {
    return this.catalog.has(this.normalizeText(text));
  }

  /**
   * Retrieves the authentic audio file for a catalog prompt.
   */
  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    const key = this.normalizeText(request.text);
    const filePath = this.catalog.get(key);

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`STUDIO_CATALOG_MISS: No pre-recorded studio audio for: "${request.text}"`);
    }

    const buffer = fs.readFileSync(filePath);
    const mimeType = filePath.endsWith(".wav") ? "audio/wav" : "audio/mpeg";

    return {
      audioBuffer: buffer,
      audioBase64: buffer.toString("base64"),
      audioMimeType: mimeType,
      durationEstimateSec: Math.max(1, Math.round(buffer.length / 16000)),
      providerUsed: "authentic-studio-catalog-recording",
    };
  }
}

export const studioCatalogProvider = new StudioCatalogProvider();
