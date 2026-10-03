/**
 * Ɔkwankyerɛfo Pa - Session Memory
 * Maintains ephemeral conversational slots and session state across turns.
 */

import { EntitySlotMap, IntentName, AiLanguage } from "../core/aiTypes";

export interface EphemeralSessionState {
  sessionId: string;
  callerPhone?: string;
  language: AiLanguage;
  intent: IntentName | null;
  slots: EntitySlotMap;
  currentScreen: string;
  currentStep: string;
  retryCount: number;
  lastUpdated: number;
  isConfirmed: boolean;
}

export class SessionMemory {
  private sessions = new Map<string, EphemeralSessionState>();

  public getOrCreate(sessionId: string, initialLanguage: AiLanguage = "tw"): EphemeralSessionState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        language: initialLanguage,
        intent: null,
        slots: { currency: "GHS" },
        currentScreen: "HOME",
        currentStep: "welcome",
        retryCount: 0,
        lastUpdated: Date.now(),
        isConfirmed: false,
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  public updateSlots(sessionId: string, newSlots: Partial<EntitySlotMap>): EphemeralSessionState {
    const session = this.getOrCreate(sessionId);
    session.slots = { ...session.slots, ...newSlots };
    session.lastUpdated = Date.now();
    return session;
  }

  public clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export const sessionMemory = new SessionMemory();
