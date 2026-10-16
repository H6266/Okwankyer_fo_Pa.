/**
 * Ɔkwankyerɛfo Pa - Speech Normalizer
 * Formats currencies, phone digit pauses, and dates into voice-first spoken phrasing.
 */

import { formatPhoneForSlowTts } from "../../audio/dynamicPromptBuilder";

export class SpeechNormalizer {
  /**
   * Converts numbers, currency, and phone numbers into voice-friendly spoken text.
   */
  public normalizeForSpeech(text: string, language: string = "en"): string {
    let result = text;

    // 1. Currency format: "50 GHS" or "50 cedis" -> "50 Ghana Cedis"
    result = result.replace(/\b(\d+(?:\.\d{1,2})?)\s*(?:GHS|cedis?)\b/gi, (_m, amt) => {
      return language === "tw" || language === "twi"
        ? `cedi ${amt}`
        : `${amt} Ghana cedis`;
    });

    // 2. Phone numbers: 10-digit Ghana numbers spoken in a slow, clear cadence with deliberate pauses
    result = result.replace(/\b(0[235]\d{8})\b/g, (_m, phone) => {
      const isTwi = language === "tw" || language === "twi" || language === "ak";
      return formatPhoneForSlowTts(phone, isTwi ? "twi" : "en");
    });

    return result;
  }
}

export const speechNormalizer = new SpeechNormalizer();
