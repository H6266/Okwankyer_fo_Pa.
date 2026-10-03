import { demoRecipientFixtures } from "../demo/recipientFixtures";
import {
  MtnRecipientResolver,
  SandboxRecipientResolver,
  normalizeGhanaPhone,
  type RecipientResolver,
  type RecipientResolution,
} from "../providers/recipientResolver";

export {
  normalizeGhanaPhone,
  MtnRecipientResolver,
  SandboxRecipientResolver,
  type RecipientResolver,
  type RecipientResolution,
};

export function resolveRecipient(input: string): RecipientResolution {
  const sandboxResolver = new SandboxRecipientResolver(demoRecipientFixtures);
  return sandboxResolver.resolve(input);
}

export function validateAmount(raw: string): { valid: boolean; value?: number; error?: string } {
  if (!raw || typeof raw !== "string") {
    return { valid: false, error: "Amount is required." };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, error: "Amount is required." };
  }

  if (trimmed.includes("*")) {
    const parts = trimmed.split("*");
    if (parts.length !== 2 || parts.some((part) => part === "")) {
      return { valid: false, error: "Malformed amount. Use digits or a single decimal separator like 25 or 25*50." };
    }
    const [whole, decimal] = parts;
    if (!/^\d+$/.test(whole) || !/^\d+$/.test(decimal) || decimal.length > 2) {
      return { valid: false, error: "Malformed amount. Use digits or a single decimal separator like 25 or 25*50." };
    }

    const parsed = Number(`${whole}.${decimal}`);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { valid: false, error: "Amount must be greater than zero." };
    }
    return { valid: true, value: parsed };
  }

  const asNumber = Number(trimmed);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return { valid: false, error: "Amount must be greater than zero." };
  }

  return { valid: true, value: asNumber };
}
