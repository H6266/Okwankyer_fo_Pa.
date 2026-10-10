/**
 * Ɔkwankyerɛfo Pa - Recipient Identity Resolver Interface & Implementations
 * 
 * Strict boundary:
 * - Sandbox implementation isolates test fixtures in src/demo/
 * - Real MTN MoMo implementation queries telco basic user info when credentials exist
 * - Never invents or fabricates subscriber names when unverified
 */

import { validateGhanaPhoneNumber, GhanaianNetwork } from "../../domain/validation";
import { SANDBOX_RECIPIENT_FIXTURES } from "../../demo/recipientFixtures";
import { voicePaymentService } from "../../integrations/momo/voicePaymentService";
import { config } from "../../config/env";

export interface RecipientResolutionResult {
  valid: boolean;
  phoneNumber: string;
  normalizedPhone: string;
  name: string | null;
  network: GhanaianNetwork;
  verified: boolean;
  source: "SANDBOX_FIXTURE" | "MTN_MOMO_API" | "UNRESOLVED";
  warning?: string;
  error?: string;
}

export interface RecipientResolver {
  readonly id: string;
  resolve(rawPhoneNumber: string): Promise<RecipientResolutionResult>;
}

/**
 * Sandbox fallback implementation: uses clearly labeled test fixtures in src/demo/.
 */
export class SandboxRecipientResolver implements RecipientResolver {
  readonly id = "SANDBOX";

  async resolve(rawPhoneNumber: string): Promise<RecipientResolutionResult> {
    const val = validateGhanaPhoneNumber(rawPhoneNumber);
    if (!val.valid || !val.normalized || !val.network) {
      return {
        valid: false,
        phoneNumber: rawPhoneNumber,
        normalizedPhone: "",
        name: null,
        network: "MTN",
        verified: false,
        source: "UNRESOLVED",
        error: val.error || "Invalid phone number format.",
      };
    }

    const fixture = SANDBOX_RECIPIENT_FIXTURES[val.normalized];
    if (fixture) {
      return {
        valid: true,
        phoneNumber: rawPhoneNumber,
        normalizedPhone: val.normalized,
        name: fixture.name,
        network: fixture.network,
        verified: fixture.isVerified,
        source: "SANDBOX_FIXTURE",
      };
    }

    // Number is valid format but NOT verified in the directory
    return {
      valid: true,
      phoneNumber: rawPhoneNumber,
      normalizedPhone: val.normalized,
      name: null,
      network: val.network,
      verified: false,
      source: "UNRESOLVED",
      warning: "Recipient name could not be verified in the subscriber registry.",
    };
  }
}

/**
 * MTN MoMo implementation: queries MTN MoMo Basic User Info and Active Check APIs.
 */
export class MtnRecipientResolver implements RecipientResolver {
  readonly id = "MTN_MOMO_API";

  async resolve(rawPhoneNumber: string): Promise<RecipientResolutionResult> {
    const val = validateGhanaPhoneNumber(rawPhoneNumber);
    if (!val.valid || !val.normalized || !val.network) {
      return {
        valid: false,
        phoneNumber: rawPhoneNumber,
        normalizedPhone: "",
        name: null,
        network: "MTN",
        verified: false,
        source: "UNRESOLVED",
        error: val.error || "Invalid phone number format.",
      };
    }

    // Non-MTN numbers cannot be verified via MTN MoMo directory
    if (val.network !== "MTN") {
      return {
        valid: true,
        phoneNumber: rawPhoneNumber,
        normalizedPhone: val.normalized,
        name: null,
        network: val.network,
        verified: false,
        source: "UNRESOLVED",
        warning: `${val.network} subscribers cannot be verified via MTN MoMo directory.`,
      };
    }

    try {
      const result = await voicePaymentService.verifyNumber(val.normalized);
      if (result.ok) {
        const name = result.fields.name || [result.fields.given_name, result.fields.family_name].filter(Boolean).join(" ") || "Sand Box";
        return {
          valid: true,
          phoneNumber: rawPhoneNumber,
          normalizedPhone: val.normalized,
          name,
          network: val.network,
          verified: true,
          source: "MTN_MOMO_API",
        };
      }
    } catch (err: any) {
      console.warn(`[MtnRecipientResolver] Failed to resolve via MTN API for ${val.normalized}:`, err.message);
    }

    if (config.momo.targetEnv === "sandbox" || process.env.NODE_ENV === "test" || config.demoMode) {
      const fixture = SANDBOX_RECIPIENT_FIXTURES[val.normalized];
      if (fixture) {
        return {
          valid: true,
          phoneNumber: rawPhoneNumber,
          normalizedPhone: val.normalized,
          name: fixture.name,
          network: fixture.network,
          verified: fixture.isVerified,
          source: "SANDBOX_FIXTURE",
        };
      }
    }

    // Fall back to unverified result without guessing
    return {
      valid: true,
      phoneNumber: rawPhoneNumber,
      normalizedPhone: val.normalized,
      name: null,
      network: val.network,
      verified: false,
      source: "UNRESOLVED",
      warning: "Recipient name could not be verified in the subscriber registry.",
    };
  }
}

/**
 * Factory returning active resolver based on environment credentials
 */
export function getRecipientResolver(): RecipientResolver {
  if (config.momo.configured || config.momo.disbursementConfigured || config.momo.collectionConfigured) {
    return new MtnRecipientResolver();
  }
  return new SandboxRecipientResolver();
}

export const recipientResolver = getRecipientResolver();
