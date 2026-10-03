/**
 * Ɔkwankyerɛfo Pa - Speech Context & Vocabulary Priming
 */

import { AiLanguage } from "../core/aiTypes";

export const GHANA_TELECOM_LEXICON = [
  "MTN", "Telecel", "Vodafone", "AirtelTigo", "AT", "G-Money",
  "MoMo", "Mobile Money", "Cash Out", "Airtime", "Bundle",
  "Withdraw", "Deposit", "Wallet", "Account", "Balance"
];

export const GHANA_COMMON_NAMES = [
  "Kwame", "Kofi", "Ama", "Yaw", "Kwesi", "Kwaku", "Kwadwo", "Akosua", "Abena",
  "Yaa", "Afia", "Boateng", "Mensah", "Nyameba", "Nyamebere", "Osei", "Appiah",
  "Aboagye", "Asante", "Agyei", "Acheampong", "Danquah", "Antwi", "Frimpong"
];

export const GHANA_COMMON_PLACES = [
  "Accra", "Kumasi", "Tamale", "Takoradi", "Cape Coast", "Sunyani", "Koforidua",
  "Ho", "Wa", "Bolgatanga", "Tema", "Madina", "Kasoa", "Kejetia", "Makola",
  "Adum", "Tafo", "Bantama", "Osu", "Legon", "Circle", "Teshie", "Spintex"
];

export class SpeechContext {
  public getContextHints(language: AiLanguage = "tw"): string[] {
    const base = [...GHANA_TELECOM_LEXICON, ...GHANA_COMMON_NAMES];

    if (language === "tw" || language === "ak" || language === "en-ak") {
      return [
        ...base,
        "mane sika", "sendi sika", "sika", "tua bill", "tɔ airtime",
        "baako", "mmienu", "mmiɛnsa", "enan", "enum",
        "aduonum", "ahanu", "ahanum", "apem",
        "aane", "dabi", "ɛyɛ", "pene so", "twa mu", "san akyi"
      ];
    }

    return [
      ...base,
      "send money", "check balance", "pay bill", "buy airtime", "cash out",
      "confirm", "cancel", "back", "home", "repeat", "help"
    ];
  }
}

export const speechContext = new SpeechContext();
