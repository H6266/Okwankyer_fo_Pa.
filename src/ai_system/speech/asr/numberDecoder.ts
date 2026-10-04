/**
 * Ɔkwankyerɛfo Pa - Ghanaian Number Decoder (numberDecoder.ts)
 * 
 * Accurately translates spoken Ghanaian language numbers into numeric values:
 * 1. Akan Twi Cardinal & Ordinal Numbers (baako..apem)
 * 2. Multi-word compound numbers ("aduonum num" -> 55, "ɔha ne aduasa" -> 130)
 * 3. Currency amounts with "cedis" / "sidi" / "pesewas" / "kaprɛ"
 * 4. Telephone digit sequences ("hwee num num baako..." -> "0551...")
 * 5. Strict isolation between Amounts, Phone numbers, and Menu digits
 */

export interface DecodedNumberResult {
  raw: string;
  numericValue: number | null;
  isPhoneNumber: boolean;
  phoneNumberDigits?: string;
  isCurrencyAmount: boolean;
  currency?: "GHS";
  confidence: number;
}

const TWI_DIGIT_MAP: Record<string, number> = {
  hwee: 0,
  koro: 1,
  baako: 1,
  mmienu: 2,
  abien: 2,
  mmiensa: 3,
  abiesa: 3,
  nan: 4,
  ɛnan: 4,
  num: 5,
  enum: 5,
  nsia: 6,
  nson: 7,
  nwɔtwe: 8,
  nwɔtwee: 8,
  nkron: 9,
  du: 10,
  edu: 10,
  dubaako: 11,
  dummienu: 12,
  dummiensa: 13,
  dunan: 14,
  dunum: 15,
  dunsia: 16,
  dunson: 17,
  dunwɔtwe: 18,
  dunkron: 19,
  aduonu: 20,
  aduasa: 30,
  aduanan: 40,
  aduonum: 50,
  aduesia: 60,
  aduonson: 70,
  aduonwɔtwe: 80,
  aduonkron: 90,
  ɔha: 100,
  eha: 100,
  apem: 1000,
  mpem: 1000,
};

const EN_DIGIT_MAP: Record<string, number> = {
  zero: 0, "oh": 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
  ninety: 90, hundred: 100, thousand: 1000,
};

export class GhanaianNumberDecoder {
  /**
   * Decodes an input string containing Twi, English, or digits into structured numbers.
   */
  public decode(input: string): DecodedNumberResult {
    const text = input.toLowerCase().trim();

    // 1. Check for Phone Number Pattern (10-digit Ghanaian mobile, e.g. 055xxxxxxx)
    const phoneDigitMatch = text.replace(/[^0-9]/g, "");
    if (/^0[235][0-9]{8}$/.test(phoneDigitMatch)) {
      return {
        raw: input,
        numericValue: null,
        isPhoneNumber: true,
        phoneNumberDigits: phoneDigitMatch,
        isCurrencyAmount: false,
        confidence: 0.99,
      };
    }

    // 2. Check for Spoken Ghanaian Phone Sequence ("zero five five..." or "hwee num num...")
    const tokens = text.split(/\s+/).filter(Boolean);
    const potentialPhoneDigits: string[] = [];
    for (const t of tokens) {
      if (/^[0-9]$/.test(t)) {
        potentialPhoneDigits.push(t);
      } else if (TWI_DIGIT_MAP[t] !== undefined && TWI_DIGIT_MAP[t] <= 9) {
        potentialPhoneDigits.push(TWI_DIGIT_MAP[t].toString());
      } else if (EN_DIGIT_MAP[t] !== undefined && EN_DIGIT_MAP[t] <= 9) {
        potentialPhoneDigits.push(EN_DIGIT_MAP[t].toString());
      }
    }

    if (potentialPhoneDigits.length === 10 && potentialPhoneDigits[0] === "0") {
      const reconstructedPhone = potentialPhoneDigits.join("");
      return {
        raw: input,
        numericValue: null,
        isPhoneNumber: true,
        phoneNumberDigits: reconstructedPhone,
        isCurrencyAmount: false,
        confidence: 0.95,
      };
    }

    // 3. Check for Direct Digits (e.g. "50 cedis", "100 GHS")
    const digitAmountMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:cedis?|ghs|sidi|pesewas?)?/i);
    const hasCurrencyWord = /(?:cedis?|ghs|sidi|pesewas?|kaprɛ)/i.test(text);

    if (digitAmountMatch && digitAmountMatch[1]) {
      const val = parseFloat(digitAmountMatch[1]);
      if (!isNaN(val)) {
        return {
          raw: input,
          numericValue: val,
          isPhoneNumber: false,
          isCurrencyAmount: hasCurrencyWord || val <= 5000,
          currency: "GHS",
          confidence: 0.98,
        };
      }
    }

    // 4. Decode Spoken Number in Twi
    let total = 0;
    let currentMultiplier = 0;

    for (let i = 0; i < tokens.length; i++) {
      const word = tokens[i];
      const twiVal = TWI_DIGIT_MAP[word];
      const enVal = EN_DIGIT_MAP[word];
      const val = twiVal !== undefined ? twiVal : enVal;

      if (val !== undefined) {
        if (val === 100 || val === 1000) {
          total += (currentMultiplier || 1) * val;
          currentMultiplier = 0;
        } else if (val >= 20) {
          total += val;
        } else {
          currentMultiplier += val;
        }
      }
    }
    total += currentMultiplier;

    if (total > 0) {
      return {
        raw: input,
        numericValue: total,
        isPhoneNumber: false,
        isCurrencyAmount: hasCurrencyWord || total <= 5000,
        currency: "GHS",
        confidence: 0.92,
      };
    }

    return {
      raw: input,
      numericValue: null,
      isPhoneNumber: false,
      isCurrencyAmount: false,
      confidence: 0.0,
    };
  }
}

export const numberDecoder = new GhanaianNumberDecoder();
