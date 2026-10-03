/**
 * Ɔkwankyerɛfo Pa - AI System Configuration & Ghanaian Linguistic Context
 */

import { AiSystemConfig, SupportedLanguage } from "./types";

export const DEFAULT_AI_CONFIG: AiSystemConfig = {
  geminiModel: "gemini-3.8-flash",
  transcriptionModel: "gemini-3.5-transcribe",
  ttsModel: "gemini-3.8-flash-lite-tts",
  confidenceThreshold: 0.75,
  defaultLanguage: "twi",
  enableZeroPinEnforcement: true,
  userAgentHeader: "aistudio-build",
};

/**
 * Ghanaian Akan (Twi) and English phonetic vocabulary dictionary
 * Tailored for high-accuracy speech recognition in financial transactions.
 */
export const GHANAIAN_AUDIO_HINTS: Record<SupportedLanguage, string[]> = {
  en: [
    "send money",
    "mobile money",
    "transfer",
    "cash out",
    "airtime",
    "MTN",
    "Telecel",
    "AirtelTigo",
    "cedis",
    "pesewas",
    "confirm",
    "cancel",
    "Kwame",
    "Kofi",
    "Ama",
    "Yaw",
    "Abena",
    "Akosua",
    "boateng",
    "mensah",
    "one",
    "two",
    "three",
    "zero",
    "hash",
    "star",
  ],
  twi: [
    "mane sika",
    "send sika",
    "sika",
    "Mobile Money",
    "cedi",
    "pesewa",
    "baako",
    "mmienu",
    "mmiɛnsa",
    "enan",
    "enum",
    "nsia",
    "nsoŋ",
    "nwɔtwe",
    "nkron",
    "du",
    "zero",
    "MTN",
    "Telecel",
    "AirtelTigo",
    "Kwame",
    "Ama",
    "Kofi",
    "Yaw",
    "Nyameba",
    "Nyamebere",
    "aane",
    "dabi",
    "ɛyɛ",
    "pene so",
    "twa mu",
    "san akyi",
    "bio",
    "me pɛ twi",
    "brofo",
    "kasa",
  ],
  bilingual: [
    "English",
    "Twi",
    "baako",
    "one",
    "mmienu",
    "two",
    "send money",
    "mane sika",
    "MTN",
    "cedis",
  ],
};

/**
 * Core Ghanaian Akan Twi system prompt context for NLU and transcription
 */
export const GHANA_NLU_SYSTEM_PROMPT = `
You are the voice accessibility and Natural Language Understanding intelligence engine for Ɔkwankyerɛfo Pa (Ghana Voice MoMo).
You assist Ghanaian users who speak Akan (Asante Twi / Akuapem Twi) or Ghanaian English.

Key cultural and linguistic rules:
1. Ghanaian numbers in Twi:
   - baako = 1
   - mmienu = 2
   - mmiɛnsa = 3
   - enan / anan = 4
   - enum = 5
   - aduonum = 50
   - ɔha = 100
   - ahanu = 200
   - ahanum = 500
   - apem = 1000
2. Common verbs:
   - "mane sika", "sendi sika", "fa sika kɔ" -> SEND_MONEY
   - "checki me balance", "me balance", "sika a aka" -> CHECK_BALANCE
   - "tua bill", "ecg", "gwcl" -> PAY_BILL
   - "tɔ airtime", "credit" -> BUY_AIRTIME
   - "allow cash out", "cash out" -> CASH_OUT
   - "aane", "ɛyɛ", "pene so", "okay", "yes" -> CONFIRM
   - "dabi", "twa mu", "cancel", "no", "stop" -> CANCEL
   - "san akyi", "kɔ back", "back" -> GO_BACK
   - "tie bio", "repeat" -> REPEAT
3. Phone number detection:
   - Ghanaian mobile numbers are 10 digits starting with 024, 054, 055, 059, 053 (MTN), 020, 050 (Telecel), 027, 057, 026, 056 (AT).
4. Zero-PIN Security Rule:
   - NEVER accept or parse user Mobile Money PINs over voice or text channels.
   - If a caller attempts to speak a PIN, flag it as a security hazard and instruct them to wait for the on-screen USSD/MoMo prompt.
`.trim();
