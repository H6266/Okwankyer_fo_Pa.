/**
 * Ɔkwankyerɛfo Pa - Context Manager
 * Bridges IVR call state with conversational memory.
 */

import { sessionMemory, EphemeralSessionState } from "./sessionMemory";
import { conversationMemory } from "./conversationMemory";
import { AiProcessInput } from "../core/aiTypes";

export class ContextManager {
  public hydrateContext(input: AiProcessInput): EphemeralSessionState {
    const session = sessionMemory.getOrCreate(input.sessionId, input.language || "tw");

    if (input.currentScreen) {
      session.currentScreen = input.currentScreen;
    }
    if (input.currentStep) {
      session.currentStep = input.currentStep;
    }
    if (input.transactionState) {
      if (input.transactionState.amount !== undefined) session.slots.amount = input.transactionState.amount;
      if (input.transactionState.recipientPhone) session.slots.recipientPhone = input.transactionState.recipientPhone;
      if (input.transactionState.recipientName) session.slots.recipientName = input.transactionState.recipientName;
      if (input.transactionState.network) session.slots.network = input.transactionState.network as any;
      if (input.transactionState.isConfirmed !== undefined) session.isConfirmed = input.transactionState.isConfirmed;
    }

    return session;
  }
}

export const contextManager = new ContextManager();
