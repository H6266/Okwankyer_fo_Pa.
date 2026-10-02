/**
 * Ɔkwankyerɛfo Pa - Slot Manager
 * Tracks which slots are needed, missing, or confirmed for transactions.
 */

import { EntitySlotMap, IntentName } from "../core/aiTypes";

export interface SlotStatus {
  isComplete: boolean;
  missingSlotName?: "recipient" | "amount" | "network" | "biller";
  promptEn?: string;
  promptTwi?: string;
}

export class SlotManager {
  public checkRequiredSlots(intent: IntentName, slots: EntitySlotMap): SlotStatus {
    if (intent === "SEND_MONEY") {
      if (!slots.recipientPhone && !slots.recipientName) {
        return {
          isComplete: false,
          missingSlotName: "recipient",
          promptEn: "Who do you want to send the money to? Please say their name or phone number.",
          promptTwi: "Hwan na wopɛ sɛ womane sika no kɔma no? Mepa wo kyɛw, bɔ ne din anaa ne phone nɔmba.",
        };
      }

      if (!slots.amount || slots.amount <= 0) {
        const target = slots.recipientName || "them";
        return {
          isComplete: false,
          missingSlotName: "amount",
          promptEn: `How much would you like to send to ${target}?`,
          promptTwi: `Sika dodow bɛn na wopɛ sɛ womane kɔma ${target}?`,
        };
      }
    }

    if (intent === "PAY_BILL") {
      if (!slots.biller) {
        return {
          isComplete: false,
          missingSlotName: "biller",
          promptEn: "Which bill would you like to pay? ECG electricity or GWCL water?",
          promptTwi: "Bill bɛn na wopɛ sɛ wotua? ECG anyinam ahoɔden anaa nsuo bill?",
        };
      }
    }

    return { isComplete: true };
  }
}

export const slotManager = new SlotManager();
