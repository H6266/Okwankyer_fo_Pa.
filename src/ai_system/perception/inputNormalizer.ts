/**
 * Ɔkwankyerɛfo Pa - Input Normalizer
 * Normalizes numbers, currency tokens, phone digits, and Ghanaian code-switched phrases.
 */

const SPOKEN_NUMBER_MAP: Record<string, number> = {
  // English
  zero: 0, oh: 0,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000,
  // Akan / Twi
  hwee: 0, koraa: 0,
  baako: 1, bako: 1, koro: 1,
  mmienu: 2, mienu: 2, abien: 2,
  mmiɛnsa: 3, mmiensa: 3, meensa: 3, abiɛsa: 3,
  enan: 4, anan: 4,
  enum: 5, num: 5,
  nsia: 6,
  nsoŋ: 7, nson: 7,
  nwɔtwe: 8, nwotwe: 8,
  nkron: 9,
  du: 10,
  aduonu: 20,
  aduasa: 30,
  aduanan: 40,
  aduonum: 50, aduonom: 50,
  aduosia: 60,
  aduoson: 70,
  aduowɔtwe: 80,
  aduonkron: 90,
  ɔha: 100, oha: 100,
  ahanu: 200,
  ahasa: 300,
  ahanan: 400,
  ahanum: 500,
  apem: 1000, mpenu: 2000,
};

export class InputNormalizer {
  /**
   * Normalizes raw user speech or text into consistent format.
   */
  public normalize(raw: string): string {
    if (!raw) return "";

    let normalized = raw.trim();

    // Normalize DTMF star to decimal if in amount context
    if (/^[0-9]+\*[0-9]+$/.test(normalized)) {
      normalized = normalized.replace(/\*/g, ".");
    }

    // Replace spoken digit sequences in phone numbers
    normalized = this.normalizeSpokenDigits(normalized);

    // Normalize Ghanaian currency words
    normalized = normalized
      .replace(/\b(cedi|cedis|ghs|gh\s*cedis?)\b/gi, " GHS ")
      .replace(/\s+/g, " ")
      .trim();

    return normalized;
  }

  /**
   * Converts sequences of spoken digit words ("zero two four...") to digits ("024...").
   */
  public normalizeSpokenDigits(text: string): string {
    const digitWords: Record<string, string> = {
      zero: "0", oh: "0", hwee: "0", koraa: "0",
      one: "1", baako: "1", bako: "1", koro: "1",
      two: "2", mmienu: "2", mienu: "2",
      three: "3", mmiɛnsa: "3", mmiensa: "3",
      four: "4", enan: "4", anan: "4",
      five: "5", enum: "5",
      six: "6", nsia: "6",
      seven: "7", nsoŋ: "7", nson: "7",
      eight: "8", nwɔtwe: "8", nwotwe: "8",
      nine: "9", nkron: "9",
    };

    const words = text.split(/\s+/);
    const result: string[] = [];
    let currentDigits: string[] = [];

    for (const w of words) {
      const lower = w.toLowerCase().replace(/[^a-z0-9ɛɔ]/g, "");
      if (digitWords[lower] !== undefined) {
        currentDigits.push(digitWords[lower]);
      } else if (/^\d+$/.test(lower) && lower.length === 1) {
        currentDigits.push(lower);
      } else {
        if (currentDigits.length > 0) {
          result.push(currentDigits.join(""));
          currentDigits = [];
        }
        result.push(w);
      }
    }

    if (currentDigits.length > 0) {
      result.push(currentDigits.join(""));
    }

    return result.join(" ");
  }

  /**
   * Extracts numerical value from text including Akan words like 'aduonum' (50), 'ahanum' (500).
   */
  public extractNumber(text: string): number | null {
    // 1. Direct digit match
    const digitMatch = text.match(/\b\d+(\.\d{1,2})?\b/);
    if (digitMatch) {
      return parseFloat(digitMatch[0]);
    }

    // 2. Check Akan & English word numbers
    const words = text.toLowerCase().split(/\s+/);
    for (const w of words) {
      const cleanWord = w.replace(/[^a-zɛɔ]/g, "");
      if (SPOKEN_NUMBER_MAP[cleanWord] !== undefined) {
        return SPOKEN_NUMBER_MAP[cleanWord];
      }
    }

    return null;
  }
}

export const inputNormalizer = new InputNormalizer();
