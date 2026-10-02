/**
 * Ɔkwankyerɛfo Pa - Language Detector
 * Detects English ('en'), Akan/Twi ('tw'/'ak'), or Code-Switched Ghanaian English ('en-ak').
 */

import { AiLanguage } from "../core/aiTypes";

const TWI_MARKERS = [
  "mepɛ", "me pɛ", "sɛ", "kɔma", "kɔ", "ma", "sika", "mane", "sendi", "tua",
  "baako", "mmienu", "mmiɛnsa", "enan", "anan", "enum", "nsia", "nsoŋ", "nwɔtwe", "nkron", "du",
  "aane", "dabi", "ɛyɛ", "pene", "twa", "san", "akyi", "bio", "kasa", "brofo", "akwaaba",
  "aden", "nɔmba", "cedi", "pesewa", "firi", "hwɛ", "wo", "me", "yɛ", "dwumadie", "sikakorabea"
];

const ENGLISH_MARKERS = [
  "send", "money", "transfer", "check", "balance", "airtime", "bundle", "bill",
  "telecom", "bank", "confirm", "cancel", "yes", "no", "one", "two", "three",
  "four", "five", "take", "home", "back", "help", "who", "amount", "cedis", "please", "want"
];

export class LanguageDetector {
  public detect(text: string): AiLanguage {
    if (!text || text.trim().length === 0) return "unknown";

    const clean = text.toLowerCase().replace(/[^a-z0-9ɛɔ\s]/g, " ");
    const words = clean.split(/\s+/).filter(Boolean);

    if (words.length === 0) return "unknown";

    let twiHits = 0;
    let englishHits = 0;

    for (const w of words) {
      if (TWI_MARKERS.includes(w) || w.includes("ɛ") || w.includes("ɔ")) {
        twiHits++;
      }
      if (ENGLISH_MARKERS.includes(w)) {
        englishHits++;
      }
    }

    if (twiHits > 0 && englishHits > 0) {
      return "en-ak"; // Code-switching
    } else if (twiHits > 0) {
      return "tw";
    } else if (englishHits > 0) {
      return "en";
    }

    return "unknown";
  }
}

export const languageDetector = new LanguageDetector();
