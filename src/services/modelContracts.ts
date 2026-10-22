import type { AiLanguage, EntitySlotMap } from "../ai_system/core/aiTypes";

export interface ReasoningParams {
  utterance: string;
  languageHint?: AiLanguage;
  currentScreen?: string;
  currentStep?: string;
  existingSlots?: EntitySlotMap;
  recentTurns?: Array<{ role: string; text: string }>;
  semanticMemoryContext?: Array<{ text: string }>;
  frequentContacts?: Array<{ name: string; phone: string; network?: string }>;
}
