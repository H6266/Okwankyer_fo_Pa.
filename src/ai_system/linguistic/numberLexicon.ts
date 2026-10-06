/**
 * Ɔkwankyerɛfo Pa - Shared Ghanaian Number & Digit Lexicon (numberLexicon.ts)
 * 
 * Single authoritative shared lexicon data file for both twiNumberWords.ts
 * and numberDecoder.ts. Includes canonical mappings, English symmetry, and
 * a decoder-only alias table for dialectal and phonetic variants.
 */

// ── CANONICAL TWI NUMBER LEXICON (Authoritative) ─────────────────────────────

export const CANONICAL_TWI_UNITS: Record<number, string> = {
  0: 'hwee',
  1: 'baako',
  2: 'mmienu',
  3: 'mmiɛnsa',
  4: 'ɛnan',
  5: 'enum',
  6: 'nsia',
  7: 'nson',
  8: 'nwɔtwe',
  9: 'nkron',
};

export const CANONICAL_TWI_TEENS: Record<number, string> = {
  10: 'edu',
  11: 'dubaako',
  12: 'dummienu',
  13: 'dummiɛnsa',
  14: 'dunan',
  15: 'dunum',
  16: 'dunsia',
  17: 'dunson',
  18: 'dunwɔtwe',
  19: 'dunkron',
};

export const CANONICAL_TWI_TENS: Record<number, string> = {
  20: 'aduonu',
  30: 'aduasa',
  40: 'aduanan',
  50: 'aduonum',
  60: 'aduosia',
  70: 'aduoson',
  80: 'aduowɔtwe',
  90: 'aduonkron', // Canonical 90
};

export const CANONICAL_TWI_HUNDREDS: Record<number, string> = {
  100: 'ɔha',
  200: 'ahanu',
  300: 'ahasa',
  400: 'ahanan',
  500: 'ahanum',
  600: 'ahansia',
  700: 'ahanson',
  800: 'ahanwɔtwe',
  900: 'ahankron',
};

// ── CANONICAL ENGLISH NUMBER LEXICON ─────────────────────────────────────────

export const CANONICAL_EN_UNITS: Record<number, string> = {
  0: 'zero',
  1: 'one',
  2: 'two',
  3: 'three',
  4: 'four',
  5: 'five',
  6: 'six',
  7: 'seven',
  8: 'eight',
  9: 'nine',
  10: 'ten',
  11: 'eleven',
  12: 'twelve',
  13: 'thirteen',
  14: 'fourteen',
  15: 'fifteen',
  16: 'sixteen',
  17: 'seventeen',
  18: 'eighteen',
  19: 'nineteen',
};

export const CANONICAL_EN_TENS: Record<number, string> = {
  20: 'twenty',
  30: 'thirty',
  40: 'forty',
  50: 'fifty',
  60: 'sixty',
  70: 'seventy',
  80: 'eighty',
  90: 'ninety',
};

// ── TOKEN NORMALIZATION (Normalizes ɛ/e, ɔ/o, punctuation) ───────────────────

export function normalizeAkanToken(t: string): string {
  return t.toLowerCase()
    .replace(/ɛ/g, 'e')
    .replace(/ɔ/g, 'o')
    .replace(/[^a-z0-9]/g, '');
}

// ── TELECOM SPECIAL SYMBOLS (Star / Hash) ───────────────────────────────────
export interface TelecomConfig {
  useTwiSpecialSymbols: boolean;
}

export const telecomConfig: TelecomConfig = {
  // Default false: Speaks English loanwords "star" and "hash" by default.
  // Native Twi words (nsoroma, nsensaneeɛ) kept behind this flag, unapproved.
  useTwiSpecialSymbols: false,
};

export function setUseTwiSpecialSymbols(enabled: boolean): void {
  telecomConfig.useTwiSpecialSymbols = enabled;
}

export const TELECOM_SPECIAL_SYMBOLS: Record<string, { en: string; twi: string; approved: boolean }> = {
  '*': { en: 'star', twi: 'nsoroma', approved: false }, // Unverified Akan
  '#': { en: 'hash', twi: 'nsensaneeɛ', approved: false }, // Unverified Akan
};

/**
 * Items flagged and removed from automated normalization, queued for native speaker review.
 */
export const UNVERIFIED_LEXICON_ITEMS_FOR_REVIEW = [
  'koraa (Akan emphatic adverb meaning "at all/completely"; removed as zero alias)',
  'nsoroma (Akan literal "star" for telecom * symbol; unapproved)',
  'nsensaneeɛ (Akan literal "lines/hatching" for telecom # symbol; unapproved)',
];

/**
 * Formats a USSD string like *170# digit-by-digit into spoken words in English or Twi.
 * Rule: Speaks English loanwords "star" and "hash" by default in Twi (digits spoken in Twi).
 */
export function formatUssdCodeSpoken(code: string, language: string, options?: { useTwiSpecialSymbols?: boolean }): string {
  const isTwi = language.startsWith('twi');
  const useTwiSymbols = options?.useTwiSpecialSymbols ?? telecomConfig.useTwiSpecialSymbols;
  const chars = code.split('');
  const words: string[] = [];

  for (const ch of chars) {
    if (ch === '*') {
      if (isTwi && useTwiSymbols) {
        words.push(TELECOM_SPECIAL_SYMBOLS['*'].twi);
      } else {
        words.push('star');
      }
    } else if (ch === '#') {
      if (isTwi && useTwiSymbols) {
        words.push(TELECOM_SPECIAL_SYMBOLS['#'].twi);
      } else {
        words.push('hash');
      }
    } else if (ch in CANONICAL_EN_UNITS) {
      const digit = Number(ch);
      words.push(isTwi ? CANONICAL_TWI_UNITS[digit] : CANONICAL_EN_UNITS[digit]);
    } else {
      words.push(ch);
    }
  }

  return words.join(', ');
}

// ── DECODER-ONLY ALIAS TABLE ────────────────────────────────────────────────

/**
 * Normalizes variants (ASCII e/o, dialect spellings like aduesia/aduonson,
 * alternative short forms like du/bako, and digit variants).
 * Note: "koraa" removed from zero aliases pending native review.
 */
export const DECODER_ALIASES: Record<string, number> = {
  // Dialect & ASCII variations for Tens
  aduesia: 60,
  aduonson: 70,
  aduonwotwe: 80,
  aduokron: 90,
  aduonkron: 90,
  aduonom: 50,

  // Units & Teens variants
  koro: 1,
  bako: 1,
  mienu: 2,
  abien: 2,
  mmiensa: 3,
  abiensa: 3,
  meensa: 3,
  anan: 4,
  nan: 4,
  num: 5,
  nsoŋ: 7,
  nsonn: 7,
  nwotwe: 8,
  nwotwee: 8,
  du: 10,
  dubako: 11,
  dumienu: 12,
  dummiensa: 13,

  // Hundreds variants (e.g. eha for ɔha)
  eha: 100,

  // Direct thousand contractions
  mpenu: 2000,
  mpensa: 3000,
  mpenan: 4000,
  mpenum: 5000,

  // Zero aliases (koraa intentionally excluded)
  zero: 0,
  oh: 0,
  naught: 0,
  hwee: 0,
};

// ── COMPREHENSIVE COMBINED DECODER MAP ──────────────────────────────────────

function buildCombinedDecoderMap(): Record<string, number> {
  const map: Record<string, number> = {};

  // 1. Twi units, teens, tens, hundreds
  for (const [k, v] of Object.entries(CANONICAL_TWI_UNITS)) {
    map[normalizeAkanToken(v)] = Number(k);
  }
  for (const [k, v] of Object.entries(CANONICAL_TWI_TEENS)) {
    map[normalizeAkanToken(v)] = Number(k);
  }
  for (const [k, v] of Object.entries(CANONICAL_TWI_TENS)) {
    map[normalizeAkanToken(v)] = Number(k);
  }
  for (const [k, v] of Object.entries(CANONICAL_TWI_HUNDREDS)) {
    map[normalizeAkanToken(v)] = Number(k);
  }

  // 2. English words
  for (const [k, v] of Object.entries(CANONICAL_EN_UNITS)) {
    map[normalizeAkanToken(v)] = Number(k);
  }
  for (const [k, v] of Object.entries(CANONICAL_EN_TENS)) {
    map[normalizeAkanToken(v)] = Number(k);
  }
  map['hundred'] = 100;
  map['thousand'] = 1000;
  map['apem'] = 1000;

  // 3. Aliases
  for (const [alias, val] of Object.entries(DECODER_ALIASES)) {
    map[normalizeAkanToken(alias)] = val;
  }

  return map;
}

export const SHARED_TOKEN_VALUES = buildCombinedDecoderMap();
