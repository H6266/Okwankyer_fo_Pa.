/**
 * Ɔkwankyerɛfo Pa - Structured AI Reasoning Engine (reasoningEngine.ts)
 *
 * Implements Google Gemini structured JSON reasoning using @google/genai
 * with strict deterministic fallback when offline or unavailable.
 */

import { GoogleGenAI, Type } from "@google/genai";
import {
  AiLanguage,
  EntitySlotMap,
  IntentName,
  StructuredReasoningResponse,
} from "../core/aiTypes";
import { AI_CONFIG } from "../core/aiConfig";
import { inputNormalizer } from "../perception/inputNormalizer";
import { languageDetector } from "../perception/languageDetector";
import { aiUnderstanding } from "../core/aiUnderstanding";

export class ReasoningEngine {
  private ai: GoogleGenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": AI_CONFIG.userAgentHeader,
          },
        },
      });
    }
  }

  /**
   * Main entry: interprets utterance using Gemini structured output or deterministic fallback.
   */
  public async reason(params: {
    utterance: string;
    languageHint?: AiLanguage;
    currentScreen?: string;
    currentStep?: string;
    existingSlots?: EntitySlotMap;
    recentTurns?: Array<{ role: string; text: string }>;
  }): Promise<StructuredReasoningResponse> {
    const cleanUtterance = params.utterance.trim();

    // Fast-path: simple confirmations and cancellations (e.g. "yes", "aane", "cancel")
    if (this.isSimpleAffirmationOrDenial(cleanUtterance)) {
      return this.deterministicReasoning(params);
    }

    // In automated unit tests without live internet connectivity, execute deterministic path
    if (process.env.VITEST && process.env.ENABLE_REMOTE_AI_TESTS !== "true") {
      return this.deterministicReasoning(params);
    }

    if (!this.ai) {
      this.initClient();
    }

    if (!this.ai || !process.env.GEMINI_API_KEY) {
      return this.deterministicReasoning(params);
    }

    try {
      const prompt = `You are the natural language reasoning layer for Ɔkwankyerɛfo Pa (Ghana Voice Mobile Money).
Analyze this caller's utterance in English, Akan/Twi, or Ghanaian code-switching.

Caller utterance: "${cleanUtterance}"
Current screen: "${params.currentScreen || "HOME"}"
Current step: "${params.currentStep || "welcome"}"
Existing transaction slots: ${JSON.stringify(params.existingSlots || {})}
Recent conversation context: ${JSON.stringify(params.recentTurns || [])}

Rules:
1. Identify the caller's intent from [SEND_MONEY, PAY_BILL, BUY_AIRTIME, BUY_DATA, CASH_OUT, CHECK_BALANCE, CHECK_ACCOUNT, HELP, GO_BACK, GO_HOME, CANCEL, REPEAT, CHANGE_INFORMATION, CONFIRM, DENY, UNKNOWN].
2. Extract financial entities: amount (number), recipientPhone (10 digits starting with 0), recipientName, network (MTN, Telecel, AT, G-Money).
3. Do NOT treat phone numbers as amounts.
4. Detect mid-turn corrections (e.g. "make it 200", "no send to Ama instead", "wrong number").
5. Detect pronoun/coreferences (e.g. "to him", "same amount", "that person").
6. If the user spoke a PIN or passcode, set safetyFlags: ["SPOKEN_PIN"].
7. Output valid JSON adhering strictly to the schema.`;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini reasoning timeout (2500ms)")), 2500)
      );

      const generatePromise = this.ai.models.generateContent({
        model: AI_CONFIG.model,
        contents: prompt,
        config: {
          systemInstruction: "You are an expert Ghanaian mobile financial voice cognitive engine. Analyze spoken English, Twi, and code-switched inputs accurately into structured JSON.",
          responseMimeType: "application/json",
          temperature: 0.1,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              language: { type: Type.STRING },
              entities: {
                type: Type.OBJECT,
                properties: {
                  amount: { type: Type.NUMBER },
                  recipientPhone: { type: Type.STRING },
                  recipientName: { type: Type.STRING },
                  network: { type: Type.STRING },
                },
              },
              conversationAct: { type: Type.STRING },
              correction: {
                type: Type.OBJECT,
                properties: {
                  isCorrection: { type: Type.BOOLEAN },
                  field: { type: Type.STRING },
                  oldValue: { type: Type.STRING },
                  newValue: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
              },
              referenceResolution: {
                type: Type.OBJECT,
                properties: {
                  hasReference: { type: Type.BOOLEAN },
                  referenceType: { type: Type.STRING },
                  resolvedField: { type: Type.STRING },
                  resolvedValue: { type: Type.STRING },
                },
              },
              ambiguity: {
                type: Type.OBJECT,
                properties: {
                  isAmbiguous: { type: Type.BOOLEAN },
                  candidates: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
              },
              requestedAction: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  tool: { type: Type.STRING },
                },
              },
              requiresConfirmation: { type: Type.BOOLEAN },
              safetyFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["intent", "confidence", "language"],
          },
        },
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const parsed = JSON.parse(response.text || "{}");

      return this.normalizeModelResponse(parsed, cleanUtterance, params.existingSlots);
    } catch (err: any) {
      console.warn("[ReasoningEngine] Gemini API unavailable or timed out; falling back to deterministic reasoning:", err.message);
      return this.deterministicReasoning(params);
    }
  }

  /**
   * Deterministic resilient reasoning fallback ensuring 100% safety and uptime without LLM.
   */
  public deterministicReasoning(params: {
    utterance: string;
    languageHint?: AiLanguage;
    currentScreen?: string;
    currentStep?: string;
    existingSlots?: EntitySlotMap;
  }): StructuredReasoningResponse {
    const understood = aiUnderstanding.understand(
      params.utterance,
      params.currentStep || "welcome",
      params.existingSlots || {}
    );

    const detectedLang = params.languageHint || languageDetector.detect(params.utterance);

    return {
      intent: understood.intent,
      confidence: understood.confidence,
      language: detectedLang,
      entities: understood.entities,
      conversationAct: understood.isConfirmation
        ? "CONFIRM"
        : understood.isDenial
        ? "DENY"
        : understood.isCorrection
        ? "CORRECT"
        : understood.isInterruption
        ? "INTERRUPT"
        : "INFORM",
      correction: understood.isCorrection && understood.correctionDetail
        ? {
            isCorrection: true,
            field: understood.correctionDetail.field,
            oldValue: understood.correctionDetail.oldValue,
            newValue: understood.correctionDetail.newValue,
            reason: understood.correctionDetail.reason,
          }
        : null,
      referenceResolution: null,
      ambiguity: {
        isAmbiguous: understood.isAmbiguous,
        candidates: understood.ambiguityCandidates || [],
      },
      requestedAction: {
        type: understood.intent,
        tool: null,
        arguments: understood.entities,
      },
      requiresConfirmation: understood.intent === "SEND_MONEY" || understood.intent === "CONFIRM",
      safetyFlags: [],
    };
  }

  private normalizeModelResponse(parsed: any, rawUtterance: string, existingSlots: EntitySlotMap = {}): StructuredReasoningResponse {
    const validIntents: IntentName[] = [
      "SEND_MONEY", "PAY_BILL", "BUY_AIRTIME", "BUY_DATA", "CASH_OUT",
      "CHECK_BALANCE", "CHECK_ACCOUNT", "HELP", "GO_BACK", "GO_HOME",
      "CANCEL", "REPEAT", "CHANGE_INFORMATION", "CONFIRM", "DENY", "UNKNOWN",
    ];

    const intent = validIntents.includes(parsed.intent) ? (parsed.intent as IntentName) : "UNKNOWN";
    const confidence = typeof parsed.confidence === "number" ? Math.min(1.0, Math.max(0.0, parsed.confidence)) : 0.85;

    // Normalization on extracted entities
    const entities: EntitySlotMap = { ...existingSlots, ...(parsed.entities || {}) };
    if (parsed.entities?.amount !== undefined && parsed.entities?.amount !== null) {
      entities.amount = Number(parsed.entities.amount);
      entities.currency = "GHS";
    }

    if (parsed.entities?.recipientPhone) {
      entities.recipientPhone = parsed.entities.recipientPhone.replace(/[^0-9]/g, "");
    }

    return {
      intent,
      confidence,
      language: (parsed.language as AiLanguage) || "tw",
      entities,
      conversationAct: (parsed.conversationAct as any) || "INFORM",
      correction: parsed.correction?.isCorrection ? parsed.correction : null,
      referenceResolution: parsed.referenceResolution?.hasReference ? parsed.referenceResolution : null,
      ambiguity: {
        isAmbiguous: Boolean(parsed.ambiguity?.isAmbiguous),
        candidates: parsed.ambiguity?.candidates || [],
      },
      requestedAction: {
        type: parsed.requestedAction?.type || intent,
        tool: parsed.requestedAction?.tool || null,
        arguments: entities,
      },
      requiresConfirmation: Boolean(parsed.requiresConfirmation),
      safetyFlags: Array.isArray(parsed.safetyFlags) ? parsed.safetyFlags : [],
    };
  }

  private isSimpleAffirmationOrDenial(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return /^(yes|yeah|yep|aane|ɛyɛ|eye|yoo|no|nope|dabi|cancel|gyae|stop|repeat|ka bio)$/i.test(lower);
  }
}

export const reasoningEngine = new ReasoningEngine();
