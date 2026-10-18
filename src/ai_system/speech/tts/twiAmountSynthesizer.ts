const TWI_NUMBERS: Readonly<Record<number, string>> = {
  1: "baako",
  2: "mmienu",
  3: "mmiɛnsa",
  4: "anan",
  5: "enum",
  6: "nsia",
  7: "nson",
  8: "nwɔtwe",
  9: "nkron",
  10: "du",
  20: "aduonu",
  30: "aduasa",
  40: "aduanan",
  50: "aduonum",
  100: "ɔha",
  200: "ahanu",
  500: "ahanum",
  1000: "apem",
};

export class TwiAmountSynthesizer {
  private static instance: TwiAmountSynthesizer;

  private constructor() {}

  public static getInstance(): TwiAmountSynthesizer {
    if (!TwiAmountSynthesizer.instance) TwiAmountSynthesizer.instance = new TwiAmountSynthesizer();
    return TwiAmountSynthesizer.instance;
  }

  public numberToTwi(amount: number): string {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("TWI_AMOUNT_INVALID: amount must be non-negative.");
    const number = Math.floor(amount);
    if (number === 0) return "zero";
    if (TWI_NUMBERS[number]) return TWI_NUMBERS[number];
    if (number > 1000) {
      const thousands = Math.floor(number / 1000);
      const remainder = number % 1000;
      const thousandsText = thousands === 1 ? "apem" : `mpem ${this.numberToTwi(thousands)}`;
      return remainder > 0 ? `${thousandsText} ne ${this.numberToTwi(remainder)}` : thousandsText;
    }
    if (number > 100) {
      const hundreds = Math.floor(number / 100);
      const remainder = number % 100;
      const hundredsText = hundreds === 2
        ? "ahanu"
        : hundreds === 5
          ? "ahanum"
          : hundreds > 1
            ? `aha ${this.numberToTwi(hundreds)}`
            : "ɔha";
      return remainder > 0 ? `${hundredsText} ne ${this.numberToTwi(remainder)}` : hundredsText;
    }
    if (number > 20) {
      const tens = Math.floor(number / 10) * 10;
      const remainder = number % 10;
      const tensText = TWI_NUMBERS[tens] || String(tens);
      return remainder > 0 ? `${tensText} ne ${this.numberToTwi(remainder)}` : tensText;
    }
    if (number > 10) return `du ${this.numberToTwi(number - 10)}`;
    return String(number);
  }

  public synthesizeTwiAmount(_amountCedi: number, _pesewas = 0): never {
    throw new Error("TWI_AMOUNT_TTS_UNAVAILABLE: no reviewed spoken-number recording or Twi speech model is installed.");
  }
}

export const twiAmountSynthesizer = TwiAmountSynthesizer.getInstance();
