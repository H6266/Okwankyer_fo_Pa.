/**
 * Ɔkwankyerɛfo Pa - AI Provider Interface
 * Model abstraction allowing interchangeable reasoning backends.
 */

import { IntentName, EntitySlotMap, AiLanguage } from "../core/aiTypes";

export interface ModelReasoningRequest {
  utterance: string;
  languageHint: AiLanguage;
  currentScreen?: string;
  currentStep?: string;
  existingSlots?: EntitySlotMap;
}

export interface ModelReasoningResponse {
  intent: IntentName;
  confidence: number;
  entities: EntitySlotMap;
  isCorrection: boolean;
  detectedLanguage: AiLanguage;
  pinDetected: boolean;
  rawResponse?: string;
}

export interface AIProvider {
  reason(request: ModelReasoningRequest): Promise<ModelReasoningResponse>;
}
