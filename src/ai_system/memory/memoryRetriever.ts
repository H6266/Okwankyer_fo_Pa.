/**
 * Ɔkwankyerɛfo Pa - Memory Retriever
 * Relevance-scored retrieval of contextual memory for active turns.
 */

import { workingMemory } from "./workingMemory";
import { sessionMemory } from "./sessionMemory";
import { taskMemory } from "./taskMemory";
import { preferenceMemory } from "./preferenceMemory";
import { pronunciationMemory } from "./pronunciationMemory";
import { transactionMemory } from "./transactionMemory";

export interface RetrievedContext {
  activeSlots: Record<string, any>;
  suspendedTask?: {
    intent: string;
    amount?: number | null;
    recipientName?: string | null;
  };
  preferredLanguage?: string;
  preferredSpokenName?: string;
  relevanceScore: number;
  relevanceMethod: "LEXICAL_OVERLAP" | "NO_QUERY";
}

export class MemoryRetriever {
  /**
   * Retrieves strictly relevant memory for the caller's utterance.
   */
  public async retrieve(sessionId: string, userId?: string, utterance?: string): Promise<RetrievedContext> {
    const working = workingMemory.getOrCreate(sessionId);
    const session = sessionMemory.getOrCreate(sessionId);
    const suspendedTask = taskMemory.getActiveTask(sessionId);
    const tx = transactionMemory.getTransaction(sessionId);

    let preferredLanguage: string | undefined;
    let preferredSpokenName: string | undefined;

    if (userId) {
      preferredLanguage = await preferenceMemory.getPreference(userId, "preferredLanguage", sessionId);
      const pron = pronunciationMemory.getPronunciation(userId);
      preferredSpokenName = pron?.preferredSpokenName;
    }

    // Merge slots from session and transaction
    const activeSlots = {
      ...session.slots,
      ...(tx?.amount ? { amount: tx.amount } : {}),
      ...(tx?.recipientPhone ? { recipientPhone: tx.recipientPhone } : {}),
      ...(tx?.recipientName ? { recipientName: tx.recipientName } : {}),
      ...(tx?.network ? { network: tx.network } : {}),
    };

    const contextTerms = [
      ...Object.entries(activeSlots).flatMap(([key, value]) => [key, String(value ?? "")]),
      suspendedTask?.intent || "",
      suspendedTask?.slots.recipientName || "",
    ].join(" ");
    const queryTerms = new Set((utterance || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
    const contextTermSet = new Set(contextTerms.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
    const overlapCount = [...queryTerms].filter((term) => contextTermSet.has(term)).length;

    return {
      activeSlots,
      suspendedTask: suspendedTask?.status === "SUSPENDED" ? {
        intent: suspendedTask.intent,
        amount: suspendedTask.slots.amount,
        recipientName: suspendedTask.slots.recipientName,
      } : undefined,
      preferredLanguage: preferredLanguage || session.language,
      preferredSpokenName,
      relevanceScore: queryTerms.size ? overlapCount / queryTerms.size : 0,
      relevanceMethod: queryTerms.size ? "LEXICAL_OVERLAP" : "NO_QUERY",
    };
  }
}

export const memoryRetriever = new MemoryRetriever();
