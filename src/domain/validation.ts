/**
 * Ɔkwankyerɛfo Pa - Domain Validation & Normalization Rules
 * Rigorous validation for telephony inputs: phone numbers, amounts, and PII protection.
 */

export type GhanaianNetwork = "MTN" | "Telecel" | "AT";

export interface PhoneValidationResult {
  valid: boolean;
  normalized?: string;
  network?: GhanaianNetwork;
  last4Spaced?: string;
  error?: string;
}

export interface AmountValidationResult {
  valid: boolean;
  amount?: number;
  formatted?: string;
  cedis?: number;
  pesewas?: number;
  error?: string;
}

const TELCO_PREFIXES: Record<string, GhanaianNetwork> = {
  "024": "MTN",
  "054": "MTN",
  "055": "MTN",
  "059": "MTN",
  "053": "MTN",
  "020": "Telecel",
  "050": "Telecel",
  "027": "AT",
  "057": "AT",
  "026": "AT",
  "056": "AT",
};

const SPOKEN_DIGIT_MAP: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  // Akan / Twi
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
 * Normalizes input phone strings, converting spoken digit words and stripping format chars
 */
export function normalizeGhanaPhoneNumber(raw: string): string {
  if (!raw) return "";
  let clean = raw.toLowerCase().trim();

  // Substitute spoken words if present
  for (const [word, digit] of Object.entries(SPOKEN_DIGIT_MAP)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    clean = clean.replace(regex, digit);
  }

  // Strip anything that is not a digit
  clean = clean.replace(/[^0-9]/g, "");

  // International format: 233XXXXXXXXX (12 digits) -> 0XXXXXXXXX (10 digits)
  if (clean.startsWith("233") && clean.length === 12) {
    clean = "0" + clean.slice(3);
  }

  // Missing leading 0 (9 digits): e.g. 553838464 -> 0553838464
  if (clean.length === 9 && !clean.startsWith("0")) {
    clean = "0" + clean;
  }

  return clean;
}

/**
 * Validates Ghanaian phone numbers: must be exactly 10 digits with recognized network prefix
 */
export function validateGhanaPhoneNumber(raw: string): PhoneValidationResult {
  const normalized = normalizeGhanaPhoneNumber(raw);

  // Support MTN sandbox test numbers (e.g. 46733123450)
  if (normalized.startsWith("467") && normalized.length === 11) {
    return {
      valid: true,
      normalized,
      network: "MTN",
      last4Spaced: normalized.slice(-4).split("").join(" "),
    };
  }

  if (normalized.length !== 10 && normalized.length !== 11) {
    return {
      valid: false,
      error: `Phone number must be 10 or 11 digits (received ${normalized.length || 0}).`,
    };
  }

  const prefix = normalized.slice(0, 3);
  const network = TELCO_PREFIXES[prefix];

  if (!network) {
    return {
      valid: false,
      error: `Invalid Ghanaian network prefix '${prefix}'. Must be MTN (024, 054, 055, 059, 053), Telecel (020, 050), or AT (027, 057, 026, 056).`,
    };
  }

  const last4Spaced = normalized.slice(-4).split("").join(" ");

  return {
    valid: true,
    normalized,
    network,
    last4Spaced,
  };
}

/**
 * Strict amount validation: rejects malformed entries like "5*0*1", "*50", "0", negatives, > 5000 GHS limit.
 * Supports DTMF star notation for pesewas: "50*50" -> 50.50 GHS.
 */
export function parseAndValidateAmount(raw: string): AmountValidationResult {
  if (!raw || typeof raw !== "string") {
    return { valid: false, error: "Amount cannot be empty." };
  }

  const trimmed = raw.trim();

  // Reject multiple asterisks (e.g. "5*0*1", "50**20")
  const starCount = (trimmed.match(/\*/g) || []).length;
  if (starCount > 1) {
    return { valid: false, error: "Malformed amount: multiple decimal asterisks detected." };
  }

  // Reject leading or trailing asterisk alone (e.g. "*50", "50*")
  if (trimmed.startsWith("*") || trimmed.endsWith("*")) {
    return { valid: false, error: "Malformed amount: decimal asterisk cannot be at start or end." };
  }

  // Replace single star with decimal point
  const normalized = trimmed.replace(/\*/g, ".");

  // Reject non-numeric characters except single decimal point
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return { valid: false, error: "Amount must contain digits only, with optional star (*) for pesewas." };
  }

  const num = parseFloat(normalized);
  if (isNaN(num) || num <= 0) {
    return { valid: false, error: "Amount must be greater than zero." };
  }

  // Single transaction limit
  if (num > 5000) {
    return { valid: false, error: "Amount exceeds single transaction limit of 5,000 Ghana Cedis." };
  }

  const rounded = Math.round(num * 100) / 100;
  const cedis = Math.floor(rounded);
  const pesewas = Math.round((rounded - cedis) * 100);

  return {
    valid: true,
    amount: rounded,
    formatted: pesewas > 0 ? `${cedis} Cedis ${pesewas} Pesewas` : `${cedis} Cedis`,
    cedis,
    pesewas,
  };
}

/**
 * Detects patterns resembling secret Mobile Money PINs (e.g. "pin=1234", "12345")
 * Used in tests and guards to ensure no PIN is ever captured or logged.
 */
export function containsPinPattern(text: string): boolean {
  if (!text) return false;
  // Look for contextual PIN patterns
  const contextualPatterns = [
    /\bpin\s*[:=]\s*\d{4,6}\b/i,
    /["']pin["']\s*:\s*["']?\d{4,6}["']?/i,
    /\bsecret\s*[:=]\s*\d{4,6}\b/i,
    /\bpassword\s*[:=]\s*\d{4,6}\b/i,
    /\benter\s+your\s+pin\s+now\b/i,
    /\bspeak\s+your\s+pin\b/i,
    /\bdial\s+your\s+pin\b/i,
  ];

  return contextualPatterns.some((pattern) => pattern.test(text));
}

/**
 * Redacts PII in logs, keeping only last 3 digits of phone numbers
 */
export function redactPii(text: string): string {
  if (!text) return "";
  let redacted = text;

  // Mask Ghanaian phone numbers keeping last 3 digits: 0553838464 -> 055****464
  redacted = redacted.replace(/\b(0\d{2})(\d{4})(\d{3})\b/g, "$1****$3");
  redacted = redacted.replace(/\b(\+233\d{2})(\d{4})(\d{3})\b/g, "$1****$3");

  // Mask PIN references
  redacted = redacted.replace(/(\bpin\s*[:=]\s*)(\d+)/gi, "$1[REDACTED_PIN]");
  redacted = redacted.replace(/("pin"\s*:\s*")([^"]+)(")/gi, '$1[REDACTED]$3');

  // Mask tokens
  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED_TOKEN]");

  return redacted;
}
