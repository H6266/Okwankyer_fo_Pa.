/**
 * Ɔkwankyerɛfo Pa - AI Provider Compatibility Adapter (aiProviderAdapter.ts)
 *
 * Bridges legacy provider calls into the central deterministic AiEngine.
 * Guarantees NO competing brains: all calls to reason(...) route directly
 * through the single central cognitive orchestrator.
 */

import { AIProvider, ModelReasoningRequest, ModelReasoningResponse } from "./aiProvider";
import { aiEngine } from "../core/aiEngine";
import { IntentName, EntitySlotMap, AiLanguage } from "../core/aiTypes";

export class AiProviderAdapter implements AIProvider {
  /**
   * Adapts legacy ModelReasoningRequest into central aiEngine.process() execution.
   */
  public async reason(request: ModelReasoningRequest): Promise<ModelReasoningResponse> {
    const sessionId = `adapter_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const result = await aiEngine.process({
      sessionId,
      channel: "VOICE",
      input: request.utterance,
      language: request.languageHint,
      currentScreen: request.currentScreen,
      currentStep: request.currentStep,
      transactionState: request.existingSlots ? {
        amount: request.existingSlots.amount,
        recipientPhone: request.existingSlots.recipientPhone,
        recipientName: request.existingSlots.recipientName,
        network: request.existingSlots.network,
      } : undefined,
    });

    return {
      intent: result.intent,
      confidence: result.confidence,
      entities: result.entities,
      isCorrection: result.intent === "CHANGE_INFORMATION" || Boolean(result.entities.correctionField),
      detectedLanguage: result.language,
      pinDetected: result.safety.pinDetectedInVoice,
      rawResponse: result.dialogue.response,
    };
  }
}

export const aiProviderAdapter = new AiProviderAdapter();
