/**
 * Ɔkwankyerɛfo Pa - Confirmation Guard
 * Enforces two-step human-readable verification before any money moves.
 */

import { EntitySlotMap } from "../core/aiTypes";

export interface ConfirmationReadback {
  isReadyForConfirmation: boolean;
  readbackEnglish: string;
  readbackTwi: string;
  missingSlots: string[];
}

export class ConfirmationGuard {
  public check(slots: EntitySlotMap): ConfirmationReadback {
    const missing: string[] = [];

    if (!slots.amount || slots.amount <= 0) {
      missing.push("amount");
    }
    if (!slots.recipientPhone && !slots.recipientName) {
      missing.push("recipient");
    }

    if (missing.length > 0) {
      return {
        isReadyForConfirmation: false,
        readbackEnglish: `Please provide ${missing.join(" and ")} before confirming.`,
        readbackTwi: `Mepa wo kyɛw, fa ${missing.join(" ne ")} ma ansa na woapene so.`,
        missingSlots: missing,
      };
    }

    const name = slots.recipientName || "verified recipient";
    const phone = slots.recipientPhone || "";
    const amt = slots.amount;

    return {
      isReadyForConfirmation: true,
      readbackEnglish: `You are about to send ${amt} Ghana Cedis to ${name}${phone ? ` (${phone})` : ""}. To confirm, press 1 or say yes. To cancel, press 2 or say no.`,
      readbackTwi: `Woremane cedi ${amt} akɔma ${name}${phone ? ` (${phone})` : ""}. Sɛ wopene so a, mia 1 anaa ka aane. Sɛ woampene so a, mia 2 anaa ka dabi.`,
      missingSlots: [],
    };
  }
}

export const confirmationGuard = new ConfirmationGuard();
