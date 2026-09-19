/**
 * Ɔkwankyerɛfo Pa - Mock Contact & Number Normalization Module
 * Isolated mock directory and telephony normalization rules.
 * 
 * NOTE: This is a prototype mock repository for the hackathon.
 * In production, this would query verified national telecom KYC databases.
 */

export interface ContactRecord {
  phoneNumber: string;
  name: string;
  network: "MTN" | "Telecel" | "AT";
  relationship?: string;
}

export const MOCK_CONTACTS: Record<string, ContactRecord> = {
  "0553838464": {
    phoneNumber: "0553838464",
    name: "Kwame Nyamebere",
    network: "MTN",
    relationship: "Brother",
  },
  "0241234567": {
    phoneNumber: "0241234567",
    name: "Ama Mensah",
    network: "MTN",
    relationship: "Sister",
  },
  "0201234567": {
    phoneNumber: "0201234567",
    name: "Kojo Mensah",
    network: "Telecel",
    relationship: "Colleague",
  },
};

/**
 * Spoken English digit words mapped to numerals
 */
const WORD_TO_DIGIT: Record<string, string> = {
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
};

/**
 * Normalizes spoken phone numbers (e.g. "zero five five three eight...") into standard 10-digit format
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return "";
  let clean = raw.toLowerCase().trim();

  // Convert spoken digit words
  for (const [word, digit] of Object.entries(WORD_TO_DIGIT)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    clean = clean.replace(regex, digit);
  }

  // Strip all non-digits
  clean = clean.replace(/[^0-9]/g, "");

  // Convert international Ghana +233 prefix to local 0
  if (clean.startsWith("233") && clean.length === 12) {
    clean = "0" + clean.slice(3);
  }

  // If 9 digits (missing leading 0), add it
  if (clean.length === 9) {
    clean = "0" + clean;
  }

  return clean;
}

/**
 * Disambiguation rule: Check if a numeric token is a phone number rather than an amount.
 * In Ghana, 9-10 digits starting with 0 or 233 is a phone number.
 */
export function isPhoneNumber(token: string): boolean {
  const norm = normalizePhoneNumber(token);
  return norm.length === 10 && norm.startsWith("0");
}

/**
 * Masks phone number for voice readback (Section 8: "ends in 8464")
 */
export function maskPhoneNumber(phoneNumber: string): string {
  const clean = normalizePhoneNumber(phoneNumber);
  if (clean.length >= 4) {
    return `ending in ${clean.slice(-4)}`;
  }
  return clean;
}

/**
 * Lookup contact by phone number or by name
 */
export function findContact(query: string): ContactRecord | null {
  if (!query) return null;
  const trimmed = query.trim();

  // 1. Direct phone lookup
  const cleanPhone = normalizePhoneNumber(trimmed);
  if (cleanPhone && MOCK_CONTACTS[cleanPhone]) {
    return MOCK_CONTACTS[cleanPhone];
  }

  // 2. Name search (case-insensitive substring or first name match)
  const queryLower = trimmed.toLowerCase();
  for (const contact of Object.values(MOCK_CONTACTS)) {
    const contactNameLower = contact.name.toLowerCase();
    if (
      contactNameLower === queryLower ||
      contactNameLower.includes(queryLower) ||
      queryLower.includes(contactNameLower.split(" ")[0].toLowerCase())
    ) {
      return contact;
    }
  }

  // 3. Dynamic fallback if valid phone number but not in pre-seeded contact book
  if (isPhoneNumber(trimmed)) {
    const prefix = cleanPhone.slice(0, 3);
    const network: "MTN" | "Telecel" | "AT" =
      ["020", "050"].includes(prefix)
        ? "Telecel"
        : ["027", "057", "026", "056"].includes(prefix)
        ? "AT"
        : "MTN";

    return {
      phoneNumber: cleanPhone,
      name: `Subscriber (${maskPhoneNumber(cleanPhone)})`,
      network,
    };
  }

  return null;
}
