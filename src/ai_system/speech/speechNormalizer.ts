/**
 * Ɔkwankyerɛfo Pa - Speech Normalizer
 * Formats currencies, phone digit pauses, and dates into voice-first spoken phrasing.
 */

export class SpeechNormalizer {
  /**
   * Converts numbers, currency, and phone numbers into voice-friendly spoken text.
   */
  public normalizeForSpeech(text: string, language: string = "en"): string {
    let result = text;

    // 1. Currency format: "50 GHS" or "50 cedis" -> "50 Ghana Cedis"
    result = result.replace(/\b(\d+(?:\.\d{1,2})?)\s*(?:GHS|cedis?)\b/gi, (_m, amt) => {
      return language === "tw"
        ? `cedi ${amt}`
        : `${amt} Ghana cedis`;
    });

    // 2. Phone numbers: "0553838464" -> "0 5 5, 3 8 3, 8 4 6 4" for natural spoken cadence
    result = result.replace(/\b(0[25]\d)(\d{3})(\d{4})\b/g, (_m, p1, p2, p3) => {
      const spaced1 = p1.split("").join(" ");
      const spaced2 = p2.split("").join(" ");
      const spaced3 = p3.split("").join(" ");
      return `${spaced1}, ${spaced2}, ${spaced3}`;
    });

    return result;
  }
}

export const speechNormalizer = new SpeechNormalizer();
