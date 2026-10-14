/**
 * Ɔkwankyerɛfo Pa - Data-Driven Twi & English Number-to-Spoken-Words Generator
 * (src/ai_system/linguistic/twiNumberWords.ts)
 * 
 * Uses shared lexicon from numberLexicon.ts and representative test vectors
 * from numberVectors.json.
 * 
 * INVARIANT: Fail-closed in production (requireApprovedNumbers defaults to true).
 * When unapproved, NEVER speaks unapproved Twi; falls back strictly to the
 * approved keypad entry prompt.
 */

import numberVectorsData from './numberVectors.json';
import {
  CANONICAL_TWI_UNITS,
  CANONICAL_TWI_TEENS,
  CANONICAL_TWI_TENS,
  CANONICAL_TWI_HUNDREDS,
  CANONICAL_EN_UNITS,
  CANONICAL_EN_TENS,
} from './numberLexicon';

export interface NumberVectorEntry {
  n: number;
  twi: string;
  approved: boolean;
}

export const NUMBER_VECTORS: NumberVectorEntry[] = numberVectorsData as NumberVectorEntry[];

// ── CONFIGURATION: FAIL-CLOSED IN PRODUCTION ────────────────────────────────

export interface NumberConfig {
  requireApprovedNumbers: boolean;
  maxTransferAmount: number;
}

export const numberConfig: NumberConfig = {
  // Defaults to TRUE in production for fail-closed security
  requireApprovedNumbers: true,
  // Single transaction limit (default: 5,000 GHS per transaction cap)
  maxTransferAmount: 5000,
};

export function setRequireApprovedNumbers(enabled: boolean): void {
  numberConfig.requireApprovedNumbers = enabled;
}

export function setMaxTransferAmount(cap: number): void {
  numberConfig.maxTransferAmount = cap;
}

export function isNumberApproved(n: number): boolean {
  const match = NUMBER_VECTORS.find((v) => v.n === n);
  return Boolean(match && match.approved === true);
}

// ── RE-EXPORT CANONICAL MAPPINGS FOR CONSUMERS ──────────────────────────────

export const TWI_UNITS = CANONICAL_TWI_UNITS;
export const TWI_TEENS = CANONICAL_TWI_TEENS;
export const TWI_TENS = CANONICAL_TWI_TENS;
export const TWI_HUNDREDS = CANONICAL_TWI_HUNDREDS;
export const EN_UNITS = CANONICAL_EN_UNITS;
export const EN_TENS = CANONICAL_EN_TENS;

// ── DETERMINISTIC TWI GENERATOR (1 to 999,999) ──────────────────────────────

export function convertNumberToTwiWords(num: number): string {
  if (!Number.isFinite(num)) return 'hwee';
  const n = Math.floor(Math.abs(num));

  if (n === 0) return TWI_UNITS[0];
  if (n < 10) return TWI_UNITS[n];
  if (n <= 19) return TWI_TEENS[n];

  // 20 - 99
  if (n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const units = n % 10;
    const tenWord = TWI_TENS[tens];
    if (units === 0) return tenWord;
    return `${tenWord} ${TWI_UNITS[units]}`;
  }

  // 100 - 999
  if (n < 1000) {
    const hundreds = Math.floor(n / 100) * 100;
    const rem = n % 100;
    const hundredWord = TWI_HUNDREDS[hundreds] || `${TWI_UNITS[hundreds / 100]} ɔha`;
    if (rem === 0) return hundredWord;
    return `${hundredWord} ne ${convertNumberToTwiWords(rem)}`;
  }

  // 1,000 - 999,999
  if (n < 1000000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;

    let thousandWord: string;
    if (thousands === 1) {
      thousandWord = 'apem';
    } else if (thousands >= 2 && thousands <= 9) {
      thousandWord = `mpem ${TWI_UNITS[thousands]}`;
    } else {
      thousandWord = `mpem ${convertNumberToTwiWords(thousands)}`;
    }

    if (rem === 0) return thousandWord;

    if (rem < 100) {
      return `${thousandWord} ne ${convertNumberToTwiWords(rem)}`;
    } else {
      return `${thousandWord} ${convertNumberToTwiWords(rem)}`;
    }
  }

  return String(n);
}

// ── DETERMINISTIC ENGLISH GENERATOR (1 to 999,999) ──────────────────────────

export function convertNumberToEnglishWords(num: number): string {
  if (!Number.isFinite(num)) return 'zero';
  const n = Math.floor(Math.abs(num));

  if (n <= 19) return EN_UNITS[n] || String(n);

  if (n < 100) {
    const tens = Math.floor(n / 10) * 10;
    const rem = n % 10;
    return rem === 0 ? EN_TENS[tens] : `${EN_TENS[tens]} ${EN_UNITS[rem]}`;
  }

  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rem = n % 100;
    const hStr = `${EN_UNITS[hundreds]} hundred`;
    return rem === 0 ? hStr : `${hStr} and ${convertNumberToEnglishWords(rem)}`;
  }

  if (n < 1000000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;
    const tStr = `${convertNumberToEnglishWords(thousands)} thousand`;
    if (rem === 0) return tStr;
    if (rem < 100) {
      return `${tStr} and ${convertNumberToEnglishWords(rem)}`;
    }
    return `${tStr} ${convertNumberToEnglishWords(rem)}`;
  }

  return String(n);
}

// ── CURRENCY FORMATTERS & KEYPAD FALLBACK ────────────────────────────────────

export const APPROVED_KEYPAD_FALLBACK_PROMPT = 'Please enter the amount on your phone keypad.';

export function formatAmountAsSpokenWords(
  amount: number,
  language: string,
  options?: { requireApprovedNumbers?: boolean; maxTransferAmount?: number }
): string {
  const rounded = Math.round(amount);
  const isTwi = language.startsWith('twi') || language === 'mixed-twi-en';
  const checkApproved = options?.requireApprovedNumbers ?? numberConfig.requireApprovedNumbers;
  const maxCap = options?.maxTransferAmount ?? numberConfig.maxTransferAmount;

  // Security Gate 1: Amounts above maxTransferAmount get keypad entry
  if (rounded > maxCap) {
    return APPROVED_KEYPAD_FALLBACK_PROMPT;
  }

  // Security Gate 2: Fail-closed. Never speak an unapproved Twi string.
  if (checkApproved && !isNumberApproved(rounded)) {
    return APPROVED_KEYPAD_FALLBACK_PROMPT;
  }

  if (isTwi) {
    const words = convertNumberToTwiWords(rounded);
    return `cedi ${words}`;
  }

  // English: "one Ghana cedi" for 1, "Ghana cedis" otherwise
  if (rounded === 1) {
    return 'one Ghana cedi';
  }

  const words = convertNumberToEnglishWords(rounded);
  return `${words} Ghana cedis`;
}
