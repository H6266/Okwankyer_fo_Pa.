/**
 * Ɔkwankyerɛfo Pa - Conversation Memory
 * Records turns and provides rollback/undo capabilities.
 */

import { IntentName, AiLanguage } from "../core/aiTypes";

export interface ConversationTurn {
  turnId: string;
  role: "user" | "assistant" | "system";
  text: string;
  language: AiLanguage;
  intent?: IntentName;
  timestamp: number;
}

export class ConversationMemory {
  private history = new Map<string, ConversationTurn[]>();

  public addTurn(sessionId: string, turn: Omit<ConversationTurn, "turnId" | "timestamp">): ConversationTurn {
    const list = this.history.get(sessionId) || [];
    const fullTurn: ConversationTurn = {
      ...turn,
      turnId: `turn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    list.push(fullTurn);
    this.history.set(sessionId, list);
    return fullTurn;
  }

  public getHistory(sessionId: string, limit: number = 10): ConversationTurn[] {
    const list = this.history.get(sessionId) || [];
    return list.slice(-limit);
  }

  public rollbackLastUserTurn(sessionId: string): ConversationTurn | null {
    const list = this.history.get(sessionId) || [];
    const last = list.pop();
    this.history.set(sessionId, list);
    return last || null;
  }

  public clear(sessionId: string): void {
    this.history.delete(sessionId);
  }
}

export const conversationMemory = new ConversationMemory();
