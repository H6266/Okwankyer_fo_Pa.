/**
 * Ɔkwankyerɛfo Pa - Spoken Number Normalizer (formatSpokenNumbersAsDigits)
 *
 * Translates spelled-out spoken numbers (both English and Akan Twi) into numeric digits.
 * E.g.:
 *  "two" -> "2"
 *  "one" -> "1"
 *  "for twi press two" -> "for twi press 2"
 *  "Send twenty cedis to Kwame" -> "Send 20 cedis to Kwame"
 *  "Send two cedis to Kwame" -> "Send 2 cedis to Kwame"
 *  "Mepa wo kyɛw, mane sika aduonu kɔma Ama" -> "Mepa wo kyɛw, mane sika 20 kɔma Ama"
 *  "Mepa wo kyɛw, mane sika mmienu kɔma Ama" -> "Mepa wo kyɛw, mane sika 2 kɔma Ama"
 *  "zero five five three eight three eight four six four" -> "0553838464"
 *  "0 5 5 3 8 3 8 4 6 4" -> "0553838464"
 *  "baako" -> "1", "mmienu" -> "2", "mmiɛnsa" -> "3"
 *  "aduonum" -> "50", "ahanum" -> "500"
 */

// English tens values
const EN_TENS_MAP: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

// English units values
const EN_UNITS_MAP: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

// Akan Twi tens values
const TWI_TENS_MAP: Record<string, number> = {
  aduonu: 20,
  aduasa: 30,
  aduanan: 40,
  aduonum: 50,
  aduonom: 50,
  aduosia: 60,
  aduesia: 60,
  aduoson: 70,
  aduonson: 70,
  aduowɔtwe: 80,
  aduowotwe: 80,
  aduonwotwe: 80,
  aduonkron: 90,
  aduokron: 90,
};

// Akan Twi units values
const TWI_UNITS_MAP: Record<string, number> = {
  baako: 1,
  bako: 1,
  koro: 1,
  mmienu: 2,
  mienu: 2,
  abien: 2,
  mmiɛnsa: 3,
  mmiensa: 3,
  mmeensa: 3,
  abiɛsa: 3,
  abiesa: 3,
  meensa: 3,
  ɛnan: 4,
  enan: 4,
  anan: 4,
  nan: 4,
  enum: 5,
  num: 5,
  anum: 5,
  nsia: 6,
  nson: 7,
  nsoŋ: 7,
  nsonn: 7,
  nwɔtwe: 8,
  nwotwe: 8,
  motwe: 8,
  wotwe: 8,
  nkron: 9,
  kron: 9,
};

// Spoken double digits in phone/PIN dictation
const SPOKEN_DOUBLES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\bdouble\s+zero\b/gi, value: "00" },
  { pattern: /\bdouble\s+oh\b/gi, value: "00" },
  { pattern: /\bdouble\s+one\b/gi, value: "11" },
  { pattern: /\bdouble\s+two\b/gi, value: "22" },
  { pattern: /\bdouble\s+three\b/gi, value: "33" },
  { pattern: /\bdouble\s+four\b/gi, value: "44" },
  { pattern: /\bdouble\s+five\b/gi, value: "55" },
  { pattern: /\bdouble\s+six\b/gi, value: "66" },
  { pattern: /\bdouble\s+seven\b/gi, value: "77" },
  { pattern: /\bdouble\s+eight\b/gi, value: "88" },
  { pattern: /\bdouble\s+nine\b/gi, value: "99" },
  { pattern: /\btriple\s+zero\b/gi, value: "000" },
  { pattern: /\btriple\s+five\b/gi, value: "555" },
];

// Thousands & Hundreds combinations (English & Akan)
const LARGE_COMPOUND_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  // Thousands + Hundreds
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:one\s+thousand\s+(?:and\s+)?five\s+hundred|apem\s+ne\s+ahanum|apem\s+ahanum)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "1500" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:two\s+thousand\s+(?:and\s+)?five\s+hundred|mpem\s+mmienu\s+ahanum|mpenu\s+ahanum)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "2500" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:one\s+thousand\s+(?:and\s+)?two\s+hundred|apem\s+ahanu)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "1200" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:two\s+thousand\s+(?:and\s+)?two\s+hundred)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "2200" },

  // Thousands
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:five\s+thousand|mpem\s+(?:enum|num)|mpenum)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "5000" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:four\s+thousand|mpem\s+(?:ɛnan|anan)|mpenan)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "4000" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:three\s+thousand|mpem\s+(?:mmiɛnsa|mmiensa)|mpensa)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "3000" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:two\s+thousand|mpem\s+(?:mmienu|abien)|mpenu)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "2000" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:one\s+thousand|a\s+thousand|apem)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "1000" },

  // Hundreds with Tens/Units
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:five\s+hundred\s+(?:and\s+)?fifty|ahanum\s+ne\s+aduonum)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "550" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:two\s+hundred\s+(?:and\s+)?fifty|ahanu\s+ne\s+aduonum)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "250" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:one\s+hundred\s+(?:and\s+)?fifty|ɔha\s+ne\s+aduonum|oha\s+ne\s+aduonum)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "150" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:one\s+hundred\s+(?:and\s+)?twenty|ɔha\s+ne\s+aduonu|oha\s+ne\s+aduonu)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "120" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:one\s+hundred\s+(?:and\s+)?thirty|ɔha\s+ne\s+aduasa|oha\s+ne\s+aduasa)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "130" },

  // Hundreds alone
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:nine\s+hundred|ahankron)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "900" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:eight\s+hundred|ahanwɔtwe|ahanwotwe)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "800" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:seven\s+hundred|ahanson)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "700" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:six\s+hundred|ahansia)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "600" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:five\s+hundred|ahanum)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "500" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:four\s+hundred|ahanan)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "400" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:three\s+hundred|ahasa)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "300" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:two\s+hundred|ahanu)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "200" },
  { pattern: /(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(?:one\s+hundred|a\s+hundred|ɔha|oha|eha)(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi, value: "100" },
];

// Single-word numbers (English & Akan Twi)
const SINGLE_NUMBER_WORDS: Array<{ word: string; digit: string }> = [
  // English tens
  { word: "ninety", digit: "90" },
  { word: "eighty", digit: "80" },
  { word: "seventy", digit: "70" },
  { word: "sixty", digit: "60" },
  { word: "fifty", digit: "50" },
  { word: "forty", digit: "40" },
  { word: "thirty", digit: "30" },
  { word: "twenty", digit: "20" },

  // English teens
  { word: "nineteen", digit: "19" },
  { word: "eighteen", digit: "18" },
  { word: "seventeen", digit: "17" },
  { word: "sixteen", digit: "16" },
  { word: "fifteen", digit: "15" },
  { word: "fourteen", digit: "14" },
  { word: "thirteen", digit: "13" },
  { word: "twelve", digit: "12" },
  { word: "eleven", digit: "11" },
  { word: "ten", digit: "10" },

  // Akan Twi tens
  { word: "aduonkron", digit: "90" },
  { word: "aduokron", digit: "90" },
  { word: "aduowɔtwe", digit: "80" },
  { word: "aduowotwe", digit: "80" },
  { word: "aduonwotwe", digit: "80" },
  { word: "aduoson", digit: "70" },
  { word: "aduonson", digit: "70" },
  { word: "aduosia", digit: "60" },
  { word: "aduesia", digit: "60" },
  { word: "aduonum", digit: "50" },
  { word: "aduonom", digit: "50" },
  { word: "aduanan", digit: "40" },
  { word: "aduasa", digit: "30" },
  { word: "aduonu", digit: "20" },

  // Akan Twi teens
  { word: "dunkron", digit: "19" },
  { word: "dunwɔtwe", digit: "18" },
  { word: "dunwotwe", digit: "18" },
  { word: "dunson", digit: "17" },
  { word: "dunsia", digit: "16" },
  { word: "duenum", digit: "15" },
  { word: "dunum", digit: "15" },
  { word: "duanan", digit: "14" },
  { word: "dunan", digit: "14" },
  { word: "dummiɛnsa", digit: "13" },
  { word: "dummiensa", digit: "13" },
  { word: "dumiɛnsa", digit: "13" },
  { word: "dumiensa", digit: "13" },
  { word: "dummienu", digit: "12" },
  { word: "dumienu", digit: "12" },
  { word: "dubaako", digit: "11" },
  { word: "dubako", digit: "11" },
  { word: "du", digit: "10" },
  { word: "edu", digit: "10" },

  // Hundreds / Thousands
  { word: "thousand", digit: "1000" },
  { word: "apem", digit: "1000" },
  { word: "mpenu", digit: "2000" },
  { word: "mpensa", digit: "3000" },
  { word: "mpenan", digit: "4000" },
  { word: "mpenum", digit: "5000" },
  { word: "hundred", digit: "100" },
  { word: "ahankron", digit: "900" },
  { word: "ahanwɔtwe", digit: "800" },
  { word: "ahanwotwe", digit: "800" },
  { word: "ahanson", digit: "700" },
  { word: "ahansia", digit: "600" },
  { word: "ahanum", digit: "500" },
  { word: "ahanan", digit: "400" },
  { word: "ahasa", digit: "300" },
  { word: "ahanu", digit: "200" },
  { word: "ɔha", digit: "100" },
  { word: "oha", digit: "100" },
  { word: "eha", digit: "100" },

  // Digits (0 to 9) - English
  { word: "zero", digit: "0" },
  { word: "oh", digit: "0" },
  { word: "one", digit: "1" },
  { word: "two", digit: "2" },
  { word: "three", digit: "3" },
  { word: "four", digit: "4" },
  { word: "five", digit: "5" },
  { word: "six", digit: "6" },
  { word: "seven", digit: "7" },
  { word: "eight", digit: "8" },
  { word: "nine", digit: "9" },

  // Digits (0 to 9) - Akan Twi
  { word: "hwee", digit: "0" },
  { word: "baako", digit: "1" },
  { word: "bako", digit: "1" },
  { word: "koro", digit: "1" },
  { word: "mmienu", digit: "2" },
  { word: "mienu", digit: "2" },
  { word: "abien", digit: "2" },
  { word: "mmiɛnsa", digit: "3" },
  { word: "mmiensa", digit: "3" },
  { word: "mmeensa", digit: "3" },
  { word: "abiɛsa", digit: "3" },
  { word: "abiesa", digit: "3" },
  { word: "meensa", digit: "3" },
  { word: "ɛnan", digit: "4" },
  { word: "enan", digit: "4" },
  { word: "anan", digit: "4" },
  { word: "enum", digit: "5" },
  { word: "num", digit: "5" },
  { word: "anum", digit: "5" },
  { word: "nsia", digit: "6" },
  { word: "nson", digit: "7" },
  { word: "nsoŋ", digit: "7" },
  { word: "nsonn", digit: "7" },
  { word: "nwɔtwe", digit: "8" },
  { word: "nwotwe", digit: "8" },
  { word: "motwe", digit: "8" },
  { word: "wotwe", digit: "8" },
  { word: "nkron", digit: "9" },
  { word: "kron", digit: "9" },
];

// Spoken Ordinals in IVR selections
const ORDINAL_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(?:the\s+)?first(?:\s+option|\s+one|\s+choice)?\b/gi, value: "1" },
  { pattern: /\b(?:the\s+)?second(?:\s+option|\s+one|\s+choice)?\b/gi, value: "2" },
  { pattern: /\b(?:the\s+)?third(?:\s+option|\s+one|\s+choice)?\b/gi, value: "3" },
  { pattern: /\b(?:the\s+)?fourth(?:\s+option|\s+one|\s+choice)?\b/gi, value: "4" },
  { pattern: /\b(?:the\s+)?fifth(?:\s+option|\s+one|\s+choice)?\b/gi, value: "5" },
];

/**
 * Normalizes all spoken numbers in text into numeric digits.
 *
 * Examples:
 *  "two" -> "2"
 *  "one" -> "1"
 *  "for twi press two" -> "for twi press 2"
 *  "Send twenty cedis to Kwame" -> "Send 20 cedis to Kwame"
 *  "zero five five three eight three eight four six four" -> "0553838464"
 *  "mmienu" -> "2"
 *  "baako" -> "1"
 */
export function formatSpokenNumbersAsDigits(text: string): string {
  if (!text) return "";
  let result = text;

  // 1. Spoken Doubles / Triples ("double five" -> "55", "double zero" -> "00")
  for (const { pattern, value } of SPOKEN_DOUBLES) {
    result = result.replace(pattern, value);
  }

  // 2. Thousands & Hundreds combinations
  for (const { pattern, value } of LARGE_COMPOUND_PATTERNS) {
    result = result.replace(pattern, value);
  }

  // 3. Dynamic English compound numbers (twenty-one .. ninety-nine)
  result = result.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_match, tenWord: string, unitWord: string) => {
      const ten = EN_TENS_MAP[tenWord.toLowerCase()] || 0;
      const unit = EN_UNITS_MAP[unitWord.toLowerCase()] || 0;
      return String(ten + unit);
    }
  );

  // 4. Dynamic Akan Twi compound numbers (aduonu baako .. aduonkron nkron)
  result = result.replace(
    /(^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])(aduonu|aduasa|aduanan|aduonum|aduonom|aduosia|aduesia|aduoson|aduonson|aduowɔtwe|aduowotwe|aduonwotwe|aduonkron|aduokron)[\s-]+(baako|bako|koro|mmienu|mienu|abien|mmiɛnsa|mmiensa|mmeensa|abiɛsa|abiesa|meensa|ɛnan|enan|anan|nan|enum|num|anum|nsia|nson|nsoŋ|nsonn|nwɔtwe|nwotwe|motwe|wotwe|nkron|kron)($|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])/gi,
    (_match, prefix: string, tenWord: string, unitWord: string, suffix: string) => {
      const ten = TWI_TENS_MAP[tenWord.toLowerCase()] || 0;
      const unit = TWI_UNITS_MAP[unitWord.toLowerCase()] || 0;
      return `${prefix}${ten + unit}${suffix}`;
    }
  );

  // 5. Ordinal numbers in selections (e.g. "press first" -> "press 1")
  for (const { pattern, value } of ORDINAL_PATTERNS) {
    result = result.replace(pattern, value);
  }

  // 6. Substitute single number words (using Akan-aware zero-width boundary match)
  for (const { word, digit } of SINGLE_NUMBER_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<=^|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])${escaped}(?=$|[^a-zA-Z0-9_\u0190\u0254\u025b\u0186])`, "gi");
    result = result.replace(regex, digit);
  }

  // 7. Collapse spaced digit sequences that form Ghanaian phone numbers (e.g. "0 5 5 3 8 3 8 4 6 4" -> "0553838464")
  // Matches 02X, 03X, 05X phone numbers with spaces between single digits
  result = result.replace(/\b(0\s*[235](?:\s*\d){8})\b/g, (match) => {
    return match.replace(/\s+/g, "");
  });

  // 8. Collapse general sequences of 4 to 10 isolated single digits (e.g. PINs, accounts, or amounts like "1 0 0 0")
  result = result.replace(/\b(\d(?:\s+\d){3,9})\b/g, (match) => {
    return match.replace(/\s+/g, "");
  });

  // Clean up any double spaces created by substitutions
  return result.replace(/\s+/g, " ").trim();
}

