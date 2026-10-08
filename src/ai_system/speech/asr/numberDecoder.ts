/**
 * Ɔkwankyerɛfo Pa - Ghanaian Number Decoder (numberDecoder.ts)
 * 
 * Accurately translates spoken Ghanaian language numbers into numeric values:
 * 1. Akan Twi Cardinal & Ordinal Numbers (baako..mpem)
 * 2. Multi-word compound numbers ("aduonum num" -> 55, "ɔha ne aduasa" -> 130, "apem ahanu ne aduonum" -> 1250)
 * 3. Shared lexicon integration with twiNumberWords.ts and alias table normalization
 * 4. Telephone digit sequences ("hwee num num baako..." -> "0551...")
 * 5. Strict isolation between Amounts, Phone numbers, and Menu digits
 */

import {
  SHARED_TOKEN_VALUES,
  normalizeAkanToken,
} from '../../linguistic/numberLexicon';
import { convertNumberToTwiWords } from '../../linguistic/twiNumberWords';

export interface DecodedNumberResult {
  raw: string;
  value: number | null;
  numericValue: number | null;
  ambiguous?: boolean;
  candidates?: number[];
  isPhoneNumber: boolean;
  phoneNumberDigits?: string;
  isCurrencyAmount: boolean;
  currency?: "GHS";
  confidence: number;
}

export interface SpokenParseResult {
  value: number | null;
  ambiguous: boolean;
  candidates: number[];
}

export class GhanaianNumberDecoder {
  /**
   * Decodes an input string containing Twi, English, or digits into structured numbers.
   */
  public decode(input: string): DecodedNumberResult {
    const text = input.toLowerCase().trim();

    // 1. Check for Pure Phone Number Pattern (e.g. "0553838464", "055-383-8464" with no letter words)
    const phoneDigitMatch = text.replace(/[^0-9]/g, "");
    const letterTokensCount = text.replace(/[^a-zA-ZɛɔƐƆ]/g, "").length;

    if (/^0[235][0-9]{8}$/.test(phoneDigitMatch) && letterTokensCount === 0) {
      return {
        raw: input,
        value: null,
        numericValue: null,
        ambiguous: false,
        candidates: [],
        isPhoneNumber: true,
        phoneNumberDigits: phoneDigitMatch,
        isCurrencyAmount: false,
        confidence: 0.99,
      };
    }

    // Extract any phone number present in mixed text
    let embeddedPhoneNumber: string | undefined;
    const phoneRegexMatch = text.match(/\b(0[235]\d{8})\b/);
    if (phoneRegexMatch) {
      embeddedPhoneNumber = phoneRegexMatch[1];
    }

    // 2. Check for Spoken Ghanaian Phone Sequence ("zero five five..." or "hwee num num...")
    const rawTokens = text.split(/\s+/).filter(Boolean);

    // Scan for a contiguous run of 10 spoken digits starting with 0 (e.g. 055...)
    let spokenPhoneTokensIndex = -1;
    let spokenPhoneDigits: string | undefined;

    for (let i = 0; i <= rawTokens.length - 10; i++) {
      const slice = rawTokens.slice(i, i + 10);
      const digits: string[] = [];
      for (const t of slice) {
        const norm = normalizeAkanToken(t);
        if (/^[0-9]$/.test(t)) {
          digits.push(t);
        } else if (norm === 'nnum') {
          digits.push('5');
        } else {
          const val = SHARED_TOKEN_VALUES[norm];
          if (val !== undefined && val <= 9) {
            digits.push(val.toString());
          } else {
            break;
          }
        }
      }
      if (digits.length === 10 && digits[0] === '0') {
        spokenPhoneTokensIndex = i;
        spokenPhoneDigits = digits.join('');
        break;
      }
    }

    if (spokenPhoneDigits && !embeddedPhoneNumber) {
      embeddedPhoneNumber = spokenPhoneDigits;
    }

    // Pure phone utterance check (entire input is just the 10 spoken phone digits)
    if (spokenPhoneDigits && rawTokens.length === 10) {
      return {
        raw: input,
        value: null,
        numericValue: null,
        ambiguous: false,
        candidates: [],
        isPhoneNumber: true,
        phoneNumberDigits: spokenPhoneDigits,
        isCurrencyAmount: false,
        confidence: 0.95,
      };
    }

    // 3. Check for Direct Digits (e.g. "50 cedis", "100 GHS")
    // Remove the embedded phone number so phone digits aren't treated as currency amounts
    const textWithoutPhone = embeddedPhoneNumber ? text.replace(embeddedPhoneNumber, ' ') : text;
    // Prefer explicit currency-tagged number (e.g. "40 cedis" over untagged meter number "123456")
    const currencyTaggedMatch = textWithoutPhone.match(/\b(\d+(?:\.\d+)?)\s*(?:cedis?|ghs|sidi|pesewas?)\b/i);
    const digitAmountMatch = currencyTaggedMatch || textWithoutPhone.match(/(\d+(?:\.\d+)?)\s*(?:cedis?|ghs|sidi|pesewas?)?/i);
    const hasCurrencyWord = /(?:cedis?|ghs|sidi|pesewas?|kaprɛ)/i.test(text);

    if (digitAmountMatch && digitAmountMatch[1]) {
      const val = parseFloat(digitAmountMatch[1]);
      if (!isNaN(val)) {
        return {
          raw: input,
          value: val,
          numericValue: val,
          ambiguous: false,
          candidates: [val],
          isPhoneNumber: Boolean(embeddedPhoneNumber),
          phoneNumberDigits: embeddedPhoneNumber,
          isCurrencyAmount: hasCurrencyWord || val <= 5000,
          currency: "GHS",
          confidence: 0.98,
        };
      }
    }

    // 4. Decode Spoken Number in Twi or English
    // CRITICAL INVARIANT: Strip spoken phone digits from amount token stream so phone digits NEVER leak into amount!
    const tokensForSpoken = spokenPhoneTokensIndex !== -1
      ? rawTokens.filter((_, idx) => idx < spokenPhoneTokensIndex || idx >= spokenPhoneTokensIndex + 10)
      : textWithoutPhone.split(/\s+/).filter(Boolean);
    const spokenResult = this.parseSpokenNumber(tokensForSpoken);

    if (spokenResult.ambiguous) {
      return {
        raw: input,
        value: null,
        numericValue: null,
        ambiguous: true,
        candidates: spokenResult.candidates,
        isPhoneNumber: Boolean(embeddedPhoneNumber),
        phoneNumberDigits: embeddedPhoneNumber,
        isCurrencyAmount: true,
        currency: "GHS",
        confidence: 0.5,
      };
    }

    if (spokenResult.value !== null && spokenResult.value >= 0) {
      return {
        raw: input,
        value: spokenResult.value,
        numericValue: spokenResult.value,
        ambiguous: false,
        candidates: spokenResult.candidates,
        isPhoneNumber: Boolean(embeddedPhoneNumber),
        phoneNumberDigits: embeddedPhoneNumber,
        isCurrencyAmount: hasCurrencyWord || spokenResult.value <= 5000,
        currency: "GHS",
        confidence: 0.95,
      };
    }

    return {
      raw: input,
      value: null,
      numericValue: null,
      ambiguous: false,
      candidates: [],
      isPhoneNumber: false,
      isCurrencyAmount: false,
      confidence: 0.0,
    };
  }

  /**
   * High-precision parser for Akan Twi and English compound spoken numbers.
   * Handles compound hundreds, thousands, and the "ne" / "and" connector.
   * Returns candidates and sets ambiguous: true for morphologically ambiguous phrases.
   */
  private parseSpokenNumber(rawTokens: string[]): SpokenParseResult {
    // Strip punctuation, normalize vowels (ɛ->e, ɔ->o), filter out non-number noise tokens
    const tokens = rawTokens
      .map(normalizeAkanToken)
      .filter((t) => Boolean(t) && t !== 'cedi' && t !== 'cedis' && t !== 'sika' && t !== 'ghs' && t !== 'pesewas' &&
        (SHARED_TOKEN_VALUES[t] !== undefined || t === 'ne' || t === 'and' || t === 'apem' || t === 'mpem')
      );

    if (tokens.length === 0) return { value: null, ambiguous: false, candidates: [] };

    // Check for single zero token (hwee, zero, oh, naught)
    if (tokens.length === 1 && SHARED_TOKEN_VALUES[tokens[0]] === 0) {
      return { value: 0, ambiguous: false, candidates: [0] };
    }

    // Check for English thousands / hundreds structure first
    if (tokens.includes('thousand') || tokens.includes('hundred')) {
      const enParsed = this.parseEnglishSpoken(tokens);
      if (enParsed !== null) return { value: enParsed, ambiguous: false, candidates: [enParsed] };
    }

    // Akan Twi Parsing
    const apemIdx = tokens.indexOf('apem');
    const mpemIdx = tokens.indexOf('mpem');

    // Case A: Pure Sub-Thousand (no apem or mpem)
    if (apemIdx === -1 && mpemIdx === -1) {
      const val = this.parseSubThousand(tokens);
      if (val === 0 && tokens.length === 1 && SHARED_TOKEN_VALUES[tokens[0]] === 0) {
        return { value: 0, ambiguous: false, candidates: [0] };
      }
      return val > 0 ? { value: val, ambiguous: false, candidates: [val] } : { value: null, ambiguous: false, candidates: [] };
    }

    // Case B: Starts with apem (1,000 + remainder)
    if (apemIdx !== -1) {
      const remTokens = tokens.slice(apemIdx + 1);
      const rem = this.parseSubThousand(remTokens);
      const total = 1000 + rem;
      return { value: total, ambiguous: false, candidates: [total] };
    }

    // Case C: Starts with mpem (mpem <thousands> <remainder>)
    const afterMpem = tokens.slice(mpemIdx + 1);
    if (afterMpem.length === 0) return { value: 1000, ambiguous: false, candidates: [1000] };

    // Evaluate split points between thousands and remainder
    const matchingCandidates: number[] = [];
    for (let k = 1; k <= afterMpem.length; k++) {
      const thousandsTokens = afterMpem.slice(0, k);
      const remTokens = afterMpem.slice(k);

      const thousandsVal = this.parseSubThousand(thousandsTokens);
      if (thousandsVal > 0 && thousandsVal < 1000) {
        const remVal = this.parseSubThousand(remTokens);
        if (remVal >= 0 && remVal < 1000) {
          const total = thousandsVal * 1000 + remVal;
          const reconstructed = convertNumberToTwiWords(total)
            .split(/\s+/)
            .map(normalizeAkanToken)
            .filter(Boolean);
          if (reconstructed.join(' ') === tokens.join(' ')) {
            if (!matchingCandidates.includes(total)) {
              matchingCandidates.push(total);
            }
          }
        }
      }
    }

    if (matchingCandidates.length > 1) {
      return { value: null, ambiguous: true, candidates: matchingCandidates.sort((a, b) => a - b) };
    }
    if (matchingCandidates.length === 1) {
      return { value: matchingCandidates[0], ambiguous: false, candidates: matchingCandidates };
    }

    // Fallback additive estimate
    let sum = 0;
    for (const t of tokens) {
      if (t === 'ne' || t === 'and') continue;
      const val = SHARED_TOKEN_VALUES[t];
      if (val !== undefined) sum += val;
    }
    return sum > 0 || (tokens.length === 1 && SHARED_TOKEN_VALUES[tokens[0]] === 0)
      ? { value: sum, ambiguous: false, candidates: [sum] }
      : { value: null, ambiguous: false, candidates: [] };
  }

  private parseSubThousand(tokens: string[]): number {
    if (tokens.length === 0) return 0;
    let sum = 0;
    for (const t of tokens) {
      if (t === 'ne' || t === 'and') continue;
      const val = SHARED_TOKEN_VALUES[t];
      if (val !== undefined) {
        sum += val;
      }
    }
    return sum;
  }

  private parseEnglishSpoken(tokens: string[]): number | null {
    let total = 0;
    let currentMultiplier = 0;

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t === 'and') continue;

      if (t === 'thousand') {
        total += (currentMultiplier || 1) * 1000;
        currentMultiplier = 0;
      } else if (t === 'hundred') {
        currentMultiplier = (currentMultiplier || 1) * 100;
      } else {
        const val = SHARED_TOKEN_VALUES[t];
        if (val !== undefined) {
          if (val >= 20 && val < 100) {
            currentMultiplier += val;
          } else if (val < 20) {
            currentMultiplier += val;
          } else {
            total += val;
          }
        }
      }
    }
    total += currentMultiplier;
    return total > 0 ? total : null;
  }
}

export const numberDecoder = new GhanaianNumberDecoder();
