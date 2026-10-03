/**
 * Ɔkwankyerɛfo Pa - Correction Intelligence Engine
 * Handles natural conversational corrections without restarting transaction state.
 */

import { EntitySlotMap } from "../core/aiTypes";
import { entityEngine } from "./entityEngine";

export interface CorrectionResult {
  isCorrection: boolean;
  fieldModified?: "amount" | "recipientName" | "recipientPhone" | "network";
  updatedSlots: EntitySlotMap;
  explanation: string;
}

export class CorrectionEngine {
  /**
   * Evaluates if utterance is a correction and updates existing slots in-place.
   */
  public applyCorrection(
    utterance: string,
    existingSlots: EntitySlotMap
  ): CorrectionResult {
    const lower = utterance.toLowerCase();
    const updated: EntitySlotMap = { ...existingSlots };

    // 1. Amount correction
    // Matches: "no, i said 200", "actually make it 200", "change amount to 50", "make it 200 instead"
    if (
      lower.includes("make it") ||
      lower.includes("said") ||
      lower.includes("change amount") ||
      lower.includes("amount to") ||
      (lower.includes("no") && /\b\d+\b/.test(lower)) ||
      lower.includes("sesa sika")
    ) {
      const extracted = entityEngine.extract(utterance);
      if (extracted.amount !== undefined && extracted.amount !== null) {
        updated.amount = extracted.amount;
        return {
          isCorrection: true,
          fieldModified: "amount",
          updatedSlots: updated,
          explanation: `Updated amount to ${extracted.amount} GHS.`,
        };
      }
    }

    // 2. Recipient correction
    // Matches: "actually send it to Ama", "no, send to Kofi", "wrong person", "sesa din"
    if (
      lower.includes("send it to") ||
      lower.includes("send to") ||
      lower.includes("meant") ||
      lower.includes("wrong person") ||
      lower.includes("kɔma")
    ) {
      const extracted = entityEngine.extract(utterance);
      if (extracted.recipientName) {
        updated.recipientName = extracted.recipientName;
        if (extracted.recipientPhone) {
          updated.recipientPhone = extracted.recipientPhone;
        }
        return {
          isCorrection: true,
          fieldModified: "recipientName",
          updatedSlots: updated,
          explanation: `Updated recipient to ${extracted.recipientName}.`,
        };
      }
    }

    // 3. Network correction
    // Matches: "sorry, i meant Telecel", "change network to MTN", "no, AirtelTigo"
    if (lower.includes("network") || lower.includes("telecel") || lower.includes("mtn") || lower.includes("airteltigo")) {
      const extracted = entityEngine.extract(utterance);
      if (extracted.network) {
        updated.network = extracted.network;
        return {
          isCorrection: true,
          fieldModified: "network",
          updatedSlots: updated,
          explanation: `Updated network to ${extracted.network}.`,
        };
      }
    }

    // 4. Phone number correction
    // Matches: "that's not the right number", "wrong number", "nɔmba no nyɛ"
    if (lower.includes("wrong number") || lower.includes("not the right number") || lower.includes("nɔmba no nyɛ")) {
      const extracted = entityEngine.extract(utterance);
      if (extracted.recipientPhone) {
        updated.recipientPhone = extracted.recipientPhone;
        return {
          isCorrection: true,
          fieldModified: "recipientPhone",
          updatedSlots: updated,
          explanation: `Updated recipient phone to ${extracted.recipientPhone}.`,
        };
      }
    }

    return {
      isCorrection: false,
      updatedSlots: existingSlots,
      explanation: "No correction detected.",
    };
  }
}

export const correctionEngine = new CorrectionEngine();
