/**
 * Ɔkwankyerɛfo Pa - Memory Policy & Security Governance
 * Strictly controls what can be remembered, confidence tiers, and forbids credential storage.
 */

export type MemorySource =
  | "USER_EXPLICIT"    // Stated directly by the user (confidence 1.0)
  | "SYSTEM_DEFINED"   // Application rules / telco specifications
  | "INFERRED"         // Rule-inferred from behavior
  | "MODEL_INFERRED"   // Model extraction
  | "SESSION_ONLY";    // Transient session data

export interface MemoryRecord<T = any> {
  key: string;
  value: T;
  source: MemorySource;
  confidence: number;
  createdAt: number;
  lastConfirmedAt: number;
  expiresAt: number | null; // null = permanent until explicitly modified
}

const FORBIDDEN_MEMORY_KEYS = [
  "pin", "momo_pin", "password", "otp", "cvv", "card_number", "secret", "auth_token"
];

export class MemoryPolicy {
  /**
   * Evaluates if a key-value pair is permissible to write to memory.
   */
  public isPermissible(key: string, value: any): { allowed: boolean; reason?: string } {
    const lowerKey = key.toLowerCase();
    for (const forbidden of FORBIDDEN_MEMORY_KEYS) {
      if (lowerKey.includes(forbidden)) {
        return {
          allowed: false,
          reason: `SECURITY VIOLATION: Memory storage of credential key '${key}' is strictly forbidden by Zero-PIN policy.`,
        };
      }
    }

    // Check if value looks like a 4-6 digit numeric credential
    if (typeof value === "string" && /^\d{4,6}$/.test(value) && (lowerKey.includes("code") || lowerKey.includes("secret"))) {
      return {
        allowed: false,
        reason: "SECURITY VIOLATION: Numerical passcode detected in memory payload.",
      };
    }

    return { allowed: true };
  }

  /**
   * Resolves conflicts between older memory and new statements.
   * Latest explicit user statement always supersedes previous preferences.
   */
  public resolveConflict<T>(existing: MemoryRecord<T>, incoming: MemoryRecord<T>): MemoryRecord<T> {
    if (incoming.source === "USER_EXPLICIT") {
      return incoming;
    }
    if (existing.source === "USER_EXPLICIT") {
      return existing;
    }
    return incoming.confidence >= existing.confidence ? incoming : existing;
  }
}

export const memoryPolicy = new MemoryPolicy();
