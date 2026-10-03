/**
 * Ɔkwankyerɛfo Pa - Working Memory
 * Fast, ephemeral memory containing what the cognitive core needs in the active turn.
 */

import { IntentName, EntitySlotMap, AiLanguage, RiskLevel } from "../core/aiTypes";

export interface WorkingMemoryState {
  currentUtterance: string;
  currentIntent: IntentName | null;
  currentStep: string;
  currentScreen: string;
  currentNodeId: string;
  activeSlot: string | null;
  knownSlots: EntitySlotMap;
  missingSlots: string[];
  lastQuestionAsked?: string;
  lastUserAnswer?: string;
  currentLanguage: AiLanguage;
  currentConfidence: number;
  currentRiskLevel: RiskLevel;
  pinDetectedInVoice: boolean;
  isInterrupted: boolean;
  updatedAt: number;
}

export class WorkingMemory {
  private memoryMap = new Map<string, WorkingMemoryState>();

  public getOrCreate(sessionId: string): WorkingMemoryState {
    let state = this.memoryMap.get(sessionId);
    if (!state) {
      state = {
        currentUtterance: "",
        currentIntent: null,
        currentStep: "welcome",
        currentScreen: "welcome",
        currentNodeId: "HOME",
        activeSlot: null,
        knownSlots: { currency: "GHS" },
        missingSlots: [],
        currentLanguage: "tw",
        currentConfidence: 1.0,
        currentRiskLevel: "LOW",
        pinDetectedInVoice: false,
        isInterrupted: false,
        updatedAt: Date.now(),
      };
      this.memoryMap.set(sessionId, state);
    }
    return state;
  }

  public update(sessionId: string, patch: Partial<WorkingMemoryState>): WorkingMemoryState {
    const state = this.getOrCreate(sessionId);
    const updated = {
      ...state,
      ...patch,
      updatedAt: Date.now(),
    };
    this.memoryMap.set(sessionId, updated);
    return updated;
  }

  public clear(sessionId: string): void {
    this.memoryMap.delete(sessionId);
  }
}

export const workingMemory = new WorkingMemory();
