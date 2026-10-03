/**
 * Ɔkwankyerɛfo Pa - Google Gemini Model Adapter
 * Implements AIProvider by delegating to the unified ReasoningEngine per Item 3.5.
 */

import { AIProvider, ModelReasoningRequest, ModelReasoningResponse } from "./aiProvider";
import { ReasoningEngine } from "../understanding/reasoningEngine";

export class GeminiModelAdapter implements AIProvider {
  private engine: ReasoningEngine;

  constructor() {
    this.engine = new ReasoningEngine();
  }

  public async reason(request: ModelReasoningRequest): Promise<ModelReasoningResponse> {
    const structured = await this.engine.reason({
      utterance: request.utterance,
      languageHint: request.languageHint,
      currentScreen: request.currentScreen,
      existingSlots: request.existingSlots,
    });

    return {
      intent: structured.intent,
      confidence: structured.confidence,
      entities: {
        amount: structured.entities?.amount !== undefined ? (typeof structured.entities.amount === "number" ? structured.entities.amount : parseFloat(String(structured.entities.amount)) || null) : null,
        recipientPhone: structured.entities?.recipientPhone || null,
        recipientName: structured.entities?.recipientName || null,
        network: structured.entities?.network || null,
      },
      isCorrection: Boolean(structured.correction?.isCorrection),
      detectedLanguage: request.languageHint || "tw",
      pinDetected: Boolean(structured.safetyFlags?.includes("SPOKEN_PIN")),
      rawResponse: JSON.stringify(structured),
    };
  }
}

export const geminiModelAdapter = new GeminiModelAdapter();
