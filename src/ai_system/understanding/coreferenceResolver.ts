/**
 * Ɔkwankyerɛfo Pa - Coreference & Anaphora Resolver
 * Resolves context references like 'him', 'her', 'the same person', 'again', 'that one', 'same amount'.
 */

import { EntitySlotMap } from "../core/aiTypes";

export interface CoreferenceResolutionResult {
  hasReference: boolean;
  resolvedSlots: EntitySlotMap;
  referenceType?: "SAME_RECIPIENT" | "SAME_AMOUNT" | "PREVIOUS_RECIPIENT";
}

export class CoreferenceResolver {
  public resolve(
    utterance: string,
    existingSlots: EntitySlotMap,
    previousTransactions?: Array<{ recipientPhone: string; recipientName: string; amount: number }>
  ): CoreferenceResolutionResult {
    const lower = utterance.toLowerCase();
    const resolved: EntitySlotMap = { ...existingSlots };

    // 1. Same person / him / her / again
    // Matches: "send to him", "send to her", "to the same person", "send again", "use the same person"
    if (
      lower.includes("him") ||
      lower.includes("her") ||
      lower.includes("same person") ||
      lower.includes("same number") ||
      lower.includes("send again") ||
      lower.includes("onipakorɔ no ara")
    ) {
      if (existingSlots.recipientName || existingSlots.recipientPhone) {
        return {
          hasReference: true,
          resolvedSlots: resolved,
          referenceType: "SAME_RECIPIENT",
        };
      }
      if (previousTransactions && previousTransactions.length > 0) {
        const last = previousTransactions[previousTransactions.length - 1];
        resolved.recipientName = last.recipientName;
        resolved.recipientPhone = last.recipientPhone;
        return {
          hasReference: true,
          resolvedSlots: resolved,
          referenceType: "PREVIOUS_RECIPIENT",
        };
      }
    }

    // 2. Same amount
    // Matches: "same amount", "use the same amount", "send the same"
    if (lower.includes("same amount") || lower.includes("sika koro no ara")) {
      if (previousTransactions && previousTransactions.length > 0) {
        resolved.amount = previousTransactions[previousTransactions.length - 1].amount;
        return {
          hasReference: true,
          resolvedSlots: resolved,
          referenceType: "SAME_AMOUNT",
        };
      }
    }

    return {
      hasReference: false,
      resolvedSlots: existingSlots,
    };
  }
}

export const coreferenceResolver = new CoreferenceResolver();
