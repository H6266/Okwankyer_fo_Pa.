/**
 * Ɔkwankyerɛfo Pa - Phoneme Resolver
 * Resolves phonetic approximations for Ghanaian words without provider lock-in.
 */

import { pronunciationLexicon } from "./pronunciationLexicon";

export class PhonemeResolver {
  public resolvePhonemes(word: string): string {
    const entry = pronunciationLexicon.get(word);
    if (entry && entry.phonemes) {
      return entry.phonemes;
    }
    return `/${word.toLowerCase()}/`;
  }
}

export const phonemeResolver = new PhonemeResolver();
