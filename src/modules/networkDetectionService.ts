/**
 * Ɔkwankyerɛfo Pa - Deterministic Telecom Network Detection & Number Validation Service
 * 
 * Strict architectural rule:
 * The AI model must NOT be the source of truth for telephone number validation or network detection.
 * All phone validation and network routing is strictly determined by this deterministic application service.
 * 
 * MTN-Only Restriction:
 * In accordance with Phase 1 requirements, money transfer is restricted exclusively to MTN Mobile Money.
 * Any other network (Telecel, AT) is detected and politely declined by deterministic logic.
 */

export type GhanaianNetwork = "MTN" | "Telecel" | "AT" | "UNKNOWN";

export interface PhoneValidationResult {
  isValid: boolean;
  rawInput: string;
  normalizedNumber: string | null; // Canonical 10-digit format (e.g. 0244123456)
  internationalFormat: string | null; // e.g. +233244123456
  network: GhanaianNetwork;
  isMtn: boolean;
  error?: string;
  userExplanationEn?: string;
  userExplanationTwi?: string;
}

/**
 * Spoken digit words across English and Akan Twi
 */
const SPOKEN_DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  // Akan Twi digits
  hwee: "0",
  koraa: "0",
  baako: "1",
  bako: "1",
  koro: "1",
  mmienu: "2",
  mienu: "2",
  abien: "2",
  mmiensa: "3",
  mmiɛnsa: "3",
  miensa: "3",
  abiesa: "3",
  anan: "4",
  enan: "4",
  nan: "4",
  enum: "5",
  num: "5",
  anom: "5",
  nsia: "6",
  sia: "6",
  nson: "7",
  son: "7",
  nwɔtwe: "8",
  nwotwe: "8",
  motwe: "8",
  wotwe: "8",
  nkron: "9",
  kron: "9",
};

/**
 * Normalizes input text/digits into canonical Ghanaian 10-digit format.
 * Handles:
 *  - "0244 123 4567" -> "02441234567"
 *  - "+233244123456" -> "0244123456"
 *  - "233244123456"  -> "0244123456"
 *  - Spoken words: "zero two four four one two three four five six" -> "0244123456"
 */
export function normalizeGhanaianPhoneNumber(raw: string): string {
  if (!raw) return "";
  let clean = raw.toLowerCase().trim();

  // Convert spoken words if present
  for (const [word, digit] of Object.entries(SPOKEN_DIGIT_WORDS)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    clean = clean.replace(regex, digit);
  }

  // Strip non-numeric characters except leading +
  clean = clean.replace(/[^0-9+]/g, "");

  // Remove leading +
  if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }

  // Convert Ghana international prefix 233
  if (clean.startsWith("233")) {
    clean = "0" + clean.slice(3);
  }

  // If user omitted leading 0 on a 9-digit number
  if (clean.length === 9 && !clean.startsWith("0")) {
    clean = "0" + clean;
  }

  return clean;
}

/**
 * Detects telecom operator based on the first 3 digits of a canonical Ghanaian number.
 * 
 * Ghanaian Mobile Numbering Plan:
 * MTN: 024, 054, 055, 059, 025, 053
 * Telecel (formerly Vodafone): 020, 050
 * AT (formerly AirtelTigo): 027, 057, 026, 056
 */
export function detectGhanaianNetwork(normalizedPhone: string): GhanaianNetwork {
  if (!normalizedPhone || normalizedPhone.length < 3) return "UNKNOWN";
  const prefix = normalizedPhone.slice(0, 3);

  const mtnPrefixes = ["024", "054", "055", "059", "025", "053"];
  const telecelPrefixes = ["020", "050"];
  const atPrefixes = ["027", "057", "026", "056"];

  if (mtnPrefixes.includes(prefix)) return "MTN";
  if (telecelPrefixes.includes(prefix)) return "Telecel";
  if (atPrefixes.includes(prefix)) return "AT";

  return "UNKNOWN";
}

export class NetworkDetectionService {
  /**
   * Deterministically validates and analyzes a Ghanaian telephone number.
   */
  public validatePhoneNumber(rawInput: string): PhoneValidationResult {
    const normalized = normalizeGhanaianPhoneNumber(rawInput);

    // Rule: Must be exactly 10 digits starting with '0'
    const isTenDigits = /^[0-9]{10}$/.test(normalized);
    const startsWithZero = normalized.startsWith("0");

    if (!isTenDigits || !startsWithZero) {
      return {
        isValid: false,
        rawInput,
        normalizedNumber: null,
        internationalFormat: null,
        network: "UNKNOWN",
        isMtn: false,
        error: "Phone number must be a valid 10-digit Ghanaian mobile number.",
        userExplanationEn: "That phone number does not appear to be a valid 10-digit Ghanaian mobile number.",
        userExplanationTwi: "Saa telefon nɔma no nyɛ Ghana nɔma kronkron a ɛwɔ nɔma du.",
      };
    }

    const network = detectGhanaianNetwork(normalized);
    const isMtn = network === "MTN";
    const internationalFormat = `+233${normalized.slice(1)}`;

    if (!isMtn) {
      const netLabel = network === "UNKNOWN" ? "another network" : network;
      return {
        isValid: true,
        rawInput,
        normalizedNumber: normalized,
        internationalFormat,
        network,
        isMtn: false,
        error: `Transfers currently restricted to MTN Mobile Money. Detected network: ${network}`,
        userExplanationEn: `I can currently send money only to MTN Mobile Money numbers. This number belongs to ${netLabel}.`,
        userExplanationTwi: `Seisei mebetumi amane sika akɔ MTN Mobile Money nko ara. Saa nɔma yi yɛ ${netLabel} nɔma.`,
      };
    }

    return {
      isValid: true,
      rawInput,
      normalizedNumber: normalized,
      internationalFormat,
      network: "MTN",
      isMtn: true,
      userExplanationEn: "Number verified on MTN Mobile Money.",
      userExplanationTwi: "Yɛahu nɔma yi wɔ MTN Mobile Money so.",
    };
  }

  /**
   * Quick check if a phone number belongs to MTN
   */
  public isMtnNumber(rawInput: string): boolean {
    const res = this.validatePhoneNumber(rawInput);
    return res.isValid && res.isMtn;
  }
}

export const networkDetectionService = new NetworkDetectionService();
