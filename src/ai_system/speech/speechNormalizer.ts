const TWI_DIGIT_WORDS: Record<string, string> = {
  "0": "hwee",
  "1": "baako",
  "2": "mmienu",
  "3": "mmiɛnsa",
  "4": "nnan",
  "5": "nnum",
  "6": "nsia",
  "7": "nson",
  "8": "nwɔtwe",
  "9": "nkron",
};

export class SpeechNormalizer {
  /**
   * Formats a 10-digit phone number in a slower, well-spaced manner with pauses so the user can easily follow.
   */
  public formatPhoneSlowlyForSpeech(phone: string, language: string = "en"): string {
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 9) return clean.split("").join(" , ");

    const normalized = clean.length === 9 ? "0" + clean : clean.length === 12 && clean.startsWith("233") ? "0" + clean.slice(3) : clean.slice(-10);
    const p1 = normalized.slice(0, 3);
    const p2 = normalized.slice(3, 6);
    const p3 = normalized.slice(6);

    const isTwi = language === "tw" || language === "twi" || language.startsWith("twi");
    if (isTwi) {
      const g1 = p1.split("").map((d) => TWI_DIGIT_WORDS[d] || d).join(", ");
      const g2 = p2.split("").map((d) => TWI_DIGIT_WORDS[d] || d).join(", ");
      const g3 = p3.split("").map((d) => TWI_DIGIT_WORDS[d] || d).join(", ");
      return `${g1} , , ... ${g2} , , ... ${g3}`;
    }

    const g1 = p1.split("").join(" , ");
    const g2 = p2.split("").join(" , ");
    const g3 = p3.split("").join(" , ");
    return `${g1} , , ... ${g2} , , ... ${g3}`;
  }

  /**
   * Extracts digit sequence from spoken utterance, translating word forms (English & Twi) to digits.
   */
  public extractSpokenDigits(text: string): string {
    const wordMap: Record<string, string> = {
      zero: "0", oh: "0", hwee: "0", koraa: "0",
      one: "1", baako: "1", bako: "1", koro: "1",
      two: "2", mmienu: "2", mienu: "2", abien: "2",
      three: "3", mmiensa: "3", mmiɛnsa: "3", miensa: "3", abiesa: "3",
      four: "4", anan: "4", enan: "4", nan: "4",
      five: "5", enum: "5", num: "5", anom: "5",
      six: "6", nsia: "6", sia: "6",
      seven: "7", nson: "7", son: "7",
      eight: "8", nwɔtwe: "8", nwotwe: "8", motwe: "8", wotwe: "8",
      nine: "9", nkron: "9", kron: "9",
    };

    const tokens = text.toLowerCase().replace(/[^a-z0-9ɛɔ\s]/g, " ").split(/\s+/).filter(Boolean);
    let digits = "";
    for (const token of tokens) {
      if (/^\d+$/.test(token)) {
        digits += token;
      } else if (wordMap[token]) {
        digits += wordMap[token];
      }
    }
    return digits;
  }

  /**
   * Converts numbers, currency, and phone numbers into voice-friendly spoken text with slow cadence.
   */
  public normalizeForSpeech(text: string, language: string = "en"): string {
    let result = text;

    // 1. Currency format: "50 GHS" or "50 cedis" -> "50 Ghana Cedis"
    result = result.replace(/\b(\d+(?:\.\d{1,2})?)\s*(?:GHS|cedis?)\b/gi, (_m, amt) => {
      return language === "tw" || language === "twi"
        ? `cedi ${amt}`
        : `${amt} Ghana cedis`;
    });

    // 2. Phone numbers: 10-digit phone formatted slowly with pauses
    result = result.replace(/\b(0[235]\d)(\d{3})(\d{4})\b/g, (_m, _p1, _p2, _p3, _offset, full) => {
      const match = full.slice(_offset, _offset + 10);
      return this.formatPhoneSlowlyForSpeech(match, language);
    });

    return result;
  }
}

export const speechNormalizer = new SpeechNormalizer();
