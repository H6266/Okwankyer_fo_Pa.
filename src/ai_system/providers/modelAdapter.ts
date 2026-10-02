/**
 * Ɔkwankyerɛfo Pa - Google Gemini Model Adapter
 * Implements AIProvider with Gemini 3 series models and deterministic fallback.
 */

import { GoogleGenAI } from "@google/genai";
import { AIProvider, ModelReasoningRequest, ModelReasoningResponse } from "./aiProvider";
import { AI_CONFIG } from "../core/aiConfig";
import { intentEngine } from "../understanding/intentEngine";
import { entityEngine } from "../understanding/entityEngine";
import { correctionEngine } from "../understanding/correctionEngine";
import { languageDetector } from "../perception/languageDetector";

export class GeminiModelAdapter implements AIProvider {
  private ai: GoogleGenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    if (process.env.GEMINI_API_KEY) {
      this.ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": AI_CONFIG.userAgentHeader,
          },
        },
      });
    }
  }

  public async reason(request: ModelReasoningRequest): Promise<ModelReasoningResponse> {
    if (!this.ai) {
      this.initClient();
    }

    // Deterministic fallback if API is not available
    if (!this.ai) {
      return this.fallbackReasoning(request);
    }

    try {
      const prompt = `You are the natural language reasoning engine for Ɔkwankyerɛfo Pa (Ghana Voice MoMo).
Caller utterance: "${request.utterance}"
Current screen: "${request.currentScreen || "welcome"}"
Language hint: "${request.languageHint}"
Existing context slots: ${JSON.stringify(request.existingSlots || {})}

Tasks:
1. Identify intent from [SEND_MONEY, PAY_BILL, BUY_AIRTIME, BUY_DATA, CASH_OUT, CHECK_BALANCE, CHECK_ACCOUNT, HELP, GO_BACK, GO_HOME, CANCEL, REPEAT, CHANGE_INFORMATION, CONFIRM, DENY, UNKNOWN]
2. Extract financial entities: amount in GHS, 10-digit Ghanaian recipientPhone, recipientName, network (MTN, Telecel, AT).
3. If this is a correction of a previous slot (e.g. "make it 200", "send to Ama instead"), set isCorrection = true.
4. If caller spoke 4 or 6 digit PIN numbers, set pinDetected = true.

Respond strictly in valid JSON format:
{
  "intent": "SEND_MONEY",
  "confidence": 0.95,
  "amount": 50,
  "currency": "GHS",
  "recipientPhone": "0553838464",
  "recipientName": "Kwame",
  "network": "MTN",
  "isCorrection": false,
  "detectedLanguage": "tw",
  "pinDetected": false
}`;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Model reasoning timeout (2500ms)")), 2500)
      );

      const generatePromise = this.ai.models.generateContent({
        model: AI_CONFIG.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const parsed = JSON.parse(response.text || "{}");

      return {
        intent: (parsed.intent || "UNKNOWN") as any,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.85,
        entities: {
          amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
          currency: "GHS",
          recipientPhone: parsed.recipientPhone || undefined,
          recipientName: parsed.recipientName || undefined,
          network: parsed.network || undefined,
        },
        isCorrection: Boolean(parsed.isCorrection),
        detectedLanguage: (parsed.detectedLanguage as any) || request.languageHint,
        pinDetected: Boolean(parsed.pinDetected),
        rawResponse: response.text,
      };
    } catch (err: any) {
      console.warn("[GeminiModelAdapter] Fallback triggered due to:", err.message);
      return this.fallbackReasoning(request);
    }
  }

  private fallbackReasoning(request: ModelReasoningRequest): ModelReasoningResponse {
    const intentMatch = intentEngine.classify(request.utterance, request.currentStep);
    const extracted = entityEngine.extract(request.utterance);
    const correction = correctionEngine.applyCorrection(request.utterance, request.existingSlots || {});
    const lang = languageDetector.detect(request.utterance);

    const pinCheck = /\b(pin\s*[0-9]{4,6}|my pin)\b/i.test(request.utterance);

    return {
      intent: correction.isCorrection ? "CHANGE_INFORMATION" : intentMatch.intent,
      confidence: intentMatch.confidence,
      entities: correction.isCorrection ? correction.updatedSlots : extracted,
      isCorrection: correction.isCorrection,
      detectedLanguage: lang !== "unknown" ? lang : request.languageHint,
      pinDetected: pinCheck,
    };
  }
}

export const geminiModelAdapter = new GeminiModelAdapter();
