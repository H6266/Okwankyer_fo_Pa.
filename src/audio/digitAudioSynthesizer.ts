/**
 * Ɔkwankyerɛfo Pa - Digit and Reference Audio Synthesizer
 *
 * Implements:
 * 1. Digit-by-digit pronunciation for full 10-digit phone numbers (OP21)
 * 2. Slow reference number readback with deliberate 400ms inter-digit pauses (OP52b)
 * 3. Both Akan Twi and Ghanaian English phonetic word maps
 * 4. SSML and audio playlist segment generation for Web Audio & Telephony VoiceXML
 */

export interface DigitPronunciation {
  char: string;
  wordEn: string;
  wordTwi: string;
  audioClipUrl?: string;
  pauseMsAfter: number;
}

export const TWI_DIGIT_MAP: Readonly<Record<string, string>> = {
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

export const EN_DIGIT_MAP: Readonly<Record<string, string>> = {
  "0": "zero",
  "1": "one",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
};

/**
 * Builds individual digit pronunciations with ~400ms inter-digit pauses
 */
export function buildDigitPronunciations(
  input: string,
  language: "en" | "twi" = "twi",
  options: { interDigitPauseMs?: number; blockPauseMs?: number } = {}
): DigitPronunciation[] {
  const interDigitPause = options.interDigitPauseMs ?? 400;
  const blockPause = options.blockPauseMs ?? 700;

  const results: DigitPronunciation[] = [];
  const chars = input.replace(/\s+/g, "").split("");

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const isLast = i === chars.length - 1;
    const isHyphenOrSeparator = ch === "-" || ch === "_" || ch === "/";

    if (isHyphenOrSeparator) {
      if (results.length > 0) {
        results[results.length - 1].pauseMsAfter = blockPause;
      }
      continue;
    }

    const upper = ch.toUpperCase();
    const isDigit = /\d/.test(ch);
    const wordEn = isDigit ? (EN_DIGIT_MAP[ch] || ch) : upper;
    const wordTwi = isDigit ? (TWI_DIGIT_MAP[ch] || ch) : upper;

    results.push({
      char: ch,
      wordEn,
      wordTwi,
      pauseMsAfter: isLast ? 0 : interDigitPause,
    });
  }

  return results;
}

/**
 * Generates natural spaced speech text for full 10-digit phone numbers (OP21)
 * Example: "0 5 4 3 5 4 6 0 1 0" or in Twi words: "hwee, mmienu, nnan..."
 */
export function formatFullPhoneNumberSpaced(
  phone: string,
  language: "en" | "twi" = "en",
  useWords = false
): string {
  const clean = phone.replace(/\D/g, "");
  const normalized =
    clean.length === 9
      ? "0" + clean
      : clean.length === 12 && clean.startsWith("233")
      ? "0" + clean.slice(3)
      : clean.slice(-10);

  if (useWords && language === "twi") {
    return normalized
      .split("")
      .map((d) => TWI_DIGIT_MAP[d] || d)
      .join(", ");
  }

  return normalized.split("").join(" ");
}

/**
 * Generates slow, deliberate speech text for transaction references (OP52b)
 * e.g. "OKP-272" -> "O ... K ... P ... two ... seven ... two"
 */
export function formatSlowReferenceSpoken(
  reference: string,
  language: "en" | "twi" = "en"
): string {
  if (!reference || !reference.trim()) {
    return language === "twi"
      ? "Reference nɔmba no nni hɔ seesei."
      : "The transaction reference is not currently available.";
  }

  const parts = reference.trim().split("-");
  const spokenParts = parts.map((part) => {
    return part
      .split("")
      .map((ch) => {
        if (/\d/.test(ch)) {
          return language === "twi" ? (TWI_DIGIT_MAP[ch] || ch) : (EN_DIGIT_MAP[ch] || ch);
        }
        return ch.toUpperCase();
      })
      .join(" ... ");
  });

  return spokenParts.join(" ... , ... ");
}

/**
 * Builds SSML for slow, paced speech synthesis
 */
export function buildSsmlForReference(
  reference: string,
  language: "en" | "twi" = "en"
): string {
  const pronunciations = buildDigitPronunciations(reference, language, {
    interDigitPauseMs: 400,
    blockPauseMs: 700,
  });

  const ssmlParts = pronunciations.map((p) => {
    const word = language === "twi" ? p.wordTwi : p.wordEn;
    const breakTag = p.pauseMsAfter > 0 ? `<break time="${p.pauseMsAfter}ms"/>` : "";
    return `${word} ${breakTag}`.trim();
  });

  return `<speak><prosody rate="80%">${ssmlParts.join(" ")}</prosody></speak>`;
}
