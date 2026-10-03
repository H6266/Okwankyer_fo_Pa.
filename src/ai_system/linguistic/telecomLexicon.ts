/**
 * Ɔkwankyerɛfo Pa - Telecom & MoMo Lexicon (telecomLexicon.ts, momoLexicon.ts)
 */

export const GHANA_TELCO_PREFIXES: Record<string, "MTN" | "Telecel" | "AT"> = {
  // MTN Ghana prefixes
  "024": "MTN", "054": "MTN", "055": "MTN", "059": "MTN", "053": "MTN",
  // Telecel Ghana (formerly Vodafone)
  "020": "Telecel", "050": "Telecel",
  // AT Ghana (formerly AirtelTigo)
  "027": "AT", "057": "AT", "026": "AT", "056": "AT",
};

export const TELCO_SYNONYMS = {
  MTN: ["mtn", "yellow", "momo", "mtn mobile money"],
  Telecel: ["telecel", "vodafone", "voda", "cash", "red"],
  AT: ["at", "airteltigo", "airtel", "tigo"],
  "G-Money": ["g-money", "gcb money", "g money"],
};

export const MOMO_TERMINOLOGY = [
  "mobile money", "momo", "wallet", "e-levy", "cash out", "allow cash out",
  "reference", "agent", "merchant", "subscriber", "biller", "token",
];
