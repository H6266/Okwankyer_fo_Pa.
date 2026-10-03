export type RecipientVerificationStatus = "verified" | "unverified" | "invalid";

export interface RecipientResolution {
  valid: boolean;
  verified: boolean;
  status: RecipientVerificationStatus;
  normalizedPhone: string;
  name: string | null;
  network: "MTN" | "Telecel" | "AT" | null;
  error?: string;
}

export interface RecipientResolver {
  resolve(input: string): Promise<RecipientResolution> | RecipientResolution;
}

const GHANA_PREFIXES = new Set([
  "020",
  "024",
  "026",
  "027",
  "050",
  "053",
  "054",
  "055",
  "056",
  "057",
  "059",
]);

export function normalizeGhanaPhone(input: string): string {
  const raw = (input || "").replace(/[^0-9+]/g, "").trim();
  if (!raw) return "";

  let digits = raw.replace(/\+/g, "");
  if (digits.startsWith("233") && digits.length === 12) {
    digits = `0${digits.slice(3)}`;
  }
  if (digits.length === 9) {
    digits = `0${digits}`;
  }
  if (digits.length !== 10) {
    return "";
  }

  const prefix = digits.slice(0, 3);
  if (!GHANA_PREFIXES.has(prefix)) {
    return "";
  }
  return digits;
}

export function isValidGhanaPhone(input: string): boolean {
  return normalizeGhanaPhone(input).length === 10;
}

export class SandboxRecipientResolver implements RecipientResolver {
  private readonly fixtures: Record<string, { phone: string; name: string; network: "MTN" | "Telecel" | "AT"; verified: boolean }>;

  constructor(fixtures: Record<string, { phone: string; name: string; network: "MTN" | "Telecel" | "AT"; verified: boolean }>) {
    this.fixtures = fixtures;
  }

  resolve(input: string): RecipientResolution {
    const normalized = normalizeGhanaPhone(input);
    if (!normalized) {
      return {
        valid: false,
        verified: false,
        status: "invalid",
        normalizedPhone: "",
        name: null,
        network: null,
        error: "Invalid Ghanaian mobile number.",
      };
    }

    const fixture = this.fixtures[normalized];
    if (!fixture) {
      return {
        valid: false,
        verified: false,
        status: "unverified",
        normalizedPhone: normalized,
        name: "Unknown subscriber",
        network: null,
        error: "Phone number is valid, but recipient identity is not verified. Please confirm again.",
      };
    }

    return {
      valid: true,
      verified: true,
      status: "verified",
      normalizedPhone: normalized,
      name: fixture.name,
      network: fixture.network,
    };
  }
}

export class MtnRecipientResolver implements RecipientResolver {
  resolve(input: string): RecipientResolution {
    const normalized = normalizeGhanaPhone(input);
    if (!normalized) {
      return {
        valid: false,
        verified: false,
        status: "invalid",
        normalizedPhone: "",
        name: null,
        network: null,
        error: "Invalid Ghanaian mobile number.",
      };
    }

    return {
      valid: true,
      verified: false,
      status: "unverified",
      normalizedPhone: normalized,
      name: "Unknown subscriber",
      network: "MTN",
      error: "Recipient identity is not yet verified by the live MTN provider. Please confirm again.",
    };
  }
}
