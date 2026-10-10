/**
 * Ɔkwankyerɛfo Pa - Akan / Twi Lexicon (twiLexicon.ts)
 * Keywords, intent markers, grammatical prepositions, and phonetic variations.
 */

export const TWI_INTENT_KEYWORDS = {
  SEND_MONEY: [
    "mane", "send", "kɔma", "fa kɔma", "sika", "remit", "transfer", "fa sika no kɔ",
  ],
  CHECK_BALANCE: [
    "balance", "sika a aka", "hwɛ sika", "checki", "check balance", "dodoɔ", "me sika no",
  ],
  BUY_AIRTIME: [
    "airtime", "kraditi", "credit", "top up", "kɔɔl card", "recharge",
  ],
  BUY_DATA: [
    "data", "bundle", "intanɛt", "internet bundle", "mb",
  ],
  CASH_OUT: [
    "cash out", "yi sika", "grom", "agent", "allow cash out",
  ],
  PAY_BILL: [
    "bill", "tua bill", "ecg", "gwcl", "light bill", "nsuo bill", "dstv",
  ],
  CONFIRM: [
    "aane", "ane", "aane yoo", "ɛyɛ", "eye", "yɛ", "ye", "ampa", "kɔ so", "ko so", "yoo", "proceed",
  ],
  DENY: [
    "dabi", "daabi", "ɛnyɛ", "enye", "sesa", "gyae", "twen", "twɛn",
  ],
  CANCEL: [
    "gyae", "twa mu", "abort", "cancel", "mempɛ bio",
  ],
  GO_BACK: [
    "san", "san kɔ akyi", "kɔ akyi", "back", "san bio",
  ],
  GO_HOME: [
    "kɔ fie", "main menu", "mfitiaseɛ", "home",
  ],
  REPEAT: [
    "ka bio", "tie bio", "repeat", "ka nea wokaae no",
  ],
  CHANGE_INFORMATION: [
    "sesa", "sesa no", "sesa amount", "sesa nɔma", "na mmom", "ɛnyɛ saa",
  ],
  HELP: [
    "boa me", "mmoa", "kyerɛ me kwan", "help",
  ],
};

export const TWI_CONNECTIVES = {
  to: ["kɔma", "ma", "kɔ"],
  from: ["firi"],
  and: ["ne", "na"],
  instead_of: ["na mmom", "sen sɛ"],
};
