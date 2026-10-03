/**
 * Ɔkwankyerɛfo Pa - Ghanaian Number & Digit Lexicon (numberLexicon.ts)
 * Comprehensive dictionary of English, Twi (with and without diacritics),
 * spoken digit sequences, and currency tokens.
 */

export const SPOKEN_DIGIT_MAP: Record<string, string> = {
  // English
  zero: "0", oh: "0", naught: "0",
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
  // Akan / Twi (standard and variant spellings without diacritics)
  hwee: "0", koraa: "0",
  baako: "1", bako: "1", koro: "1",
  mmienu: "2", mienu: "2", abien: "2",
  mmiɛnsa: "3", mmiensa: "3", meensa: "3", abiɛsa: "3", abiesa: "3",
  enan: "4", anan: "4",
  enum: "5", num: "5",
  nsia: "6",
  nsoŋ: "7", nson: "7",
  nwɔtwe: "8", nwotwe: "8",
  nkron: "9",
};

export const AKAN_NUMBER_WORDS: Record<string, number> = {
  hwee: 0,
  baako: 1, bako: 1, koro: 1,
  mmienu: 2, mienu: 2,
  mmiɛnsa: 3, mmiensa: 3,
  enan: 4, anan: 4,
  enum: 5, num: 5,
  nsia: 6,
  nson: 7, nsoŋ: 7,
  nwɔtwe: 8, nwotwe: 8,
  nkron: 9,
  du: 10,
  dubaako: 11, dubako: 11,
  dummienu: 12, dumienu: 12,
  dummiɛnsa: 13, dummiensa: 13,
  dunan: 14,
  dunum: 15,
  dunsia: 16,
  dunson: 17,
  dunwɔtwe: 18, dunwotwe: 18,
  dunkron: 19,
  aduonu: 20,
  aduasa: 30,
  aduanan: 40,
  aduonum: 50, aduonom: 50,
  aduosia: 60,
  aduoson: 70,
  aduowɔtwe: 80, aduowotwe: 80,
  aduonkron: 90,
  ɔha: 100, oha: 100,
  ahanu: 200,
  ahasa: 300,
  ahanan: 400,
  ahanum: 500,
  ahansia: 600,
  ahanson: 700,
  ahanwɔtwe: 800, ahanwotwe: 800,
  ahankron: 900,
  apem: 1000,
  mpenu: 2000,
  mpensa: 3000,
  mpenan: 4000,
  mpenum: 5000,
};

export const ENGLISH_NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000,
};
