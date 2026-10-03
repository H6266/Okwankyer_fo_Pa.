/**
 * Ɔkwankyerɛfo Pa - Phoneme Resolver & Pronunciation Engine
 * Resolves phonetic approximations for Ghanaian words without provider lock-in.
 */

import { pronunciationLexicon } from "./pronunciationLexicon";
import { userProfileManager } from "../../memory/userProfile";
import { phonemeResolver, PhonemeResolver } from "./phonemeResolver";

export { phonemeResolver, PhonemeResolver };

export class PronunciationEngine {
  /**
   * Enriches spoken text with phonetic hints or spoken substitutions.
   */
  public prepareTextForTts(text: string, userId?: string): { enrichedText: string; hints: Record<string, string> } {
    const hints: Record<string, string> = {};
    const words = text.split(/\s+/);
    const enrichedWords: string[] = [];

    // Check user preference first
    const userProfile = userId ? userProfileManager.getProfile(userId) : undefined;
    const userPreferredName = userProfile?.preferredSpokenName;

    for (const w of words) {
      const cleanWord = w.replace(/[^a-zA-ZɛɔƐƆ]/g, "");
      const entry = pronunciationLexicon.get(cleanWord);

      if (userPreferredName && cleanWord.toLowerCase() === userProfile?.displayName?.toLowerCase()) {
        hints[cleanWord] = userPreferredName;
        enrichedWords.push(w);
      } else if (entry) {
        hints[cleanWord] = entry.spokenForm;
        enrichedWords.push(w);
      } else {
        enrichedWords.push(w);
      }
    }

    return {
      enrichedText: enrichedWords.join(" "),
      hints,
    };
  }
}

export const pronunciationEngine = new PronunciationEngine();
