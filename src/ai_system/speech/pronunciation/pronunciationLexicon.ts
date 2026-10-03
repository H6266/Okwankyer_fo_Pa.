/**
 * Ɔkwankyerɛfo Pa - Pronunciation Lexicon & Registry
 */

import { PronunciationEntry, GHANAIAN_NAMES } from "./nameDictionary";
import { GHANAIAN_PLACES, GHANAIAN_TERMS } from "./placeDictionary";

export class PronunciationLexicon {
  private customEntries = new Map<string, PronunciationEntry>();

  public get(word: string): PronunciationEntry | undefined {
    const key = word.toLowerCase().trim();
    if (this.customEntries.has(key)) {
      return this.customEntries.get(key);
    }
    if (GHANAIAN_NAMES[key]) {
      return GHANAIAN_NAMES[key];
    }
    if (GHANAIAN_PLACES[key]) {
      return GHANAIAN_PLACES[key];
    }
    if (GHANAIAN_TERMS[key]) {
      return GHANAIAN_TERMS[key];
    }
    return undefined;
  }

  public registerCustom(entry: PronunciationEntry): void {
    const key = entry.displayName.toLowerCase().trim();
    this.customEntries.set(key, entry);
  }
}

export const pronunciationLexicon = new PronunciationLexicon();
