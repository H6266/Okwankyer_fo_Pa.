/**
 * Ɔkwankyerɛfo Pa - Structured AI Reasoning Engine (reasoningEngine.ts)
 *
 * Implements Google Gemini structured JSON reasoning using @google/genai
 * with strict deterministic fallback when offline or unavailable.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
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
import { geminiClient } from "../../services/geminiClient";
import { openAiClient } from "../../services/openAiClient";
import { fastLocalReasoner } from "./fastLocalReasoner";

const ModelReasoningSchema = z.object({
  intent: z.string().default("UNKNOWN"),
  confidence: z.number().min(0).max(1).default(0.5),
  language: z.string().default("en"),
  entities: z.object({
    amount: z.number().optional().nullable(),
    recipientPhone: z.string().optional().nullable(),
    recipientName: z.string().optional().nullable(),
    network: z.string().optional().nullable(),
  }).optional(),
  conversationAct: z.string().optional(),
  correction: z.object({
    isCorrection: z.boolean().optional(),
    field: z.string().optional(),
    oldValue: z.string().optional(),
    newValue: z.string().optional(),
    reason: z.string().optional(),
  }).optional(),
  referenceResolution: z.object({
    hasReference: z.boolean().optional(),
    referenceType: z.string().optional(),
    resolvedField: z.string().optional(),
    resolvedValue: z.string().optional(),
  }).optional(),
  ambiguity: z.object({
    isAmbiguous: z.boolean().optional(),
    candidates: z.array(z.string()).optional(),
  }).optional(),
  requestedAction: z.object({
    type: z.string().optional(),
    tool: z.string().optional(),
  }).optional(),
  requiresConfirmation: z.boolean().optional(),
  safetyFlags: z.array(z.string()).optional(),
});

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
  private client = geminiClient;

  public setClient(customClient: any): void {
    this.client = customClient;
  }

  public async reason(params: {
    utterance: string;
    languageHint?: AiLanguage;
    currentScreen?: string;
    currentStep?: string;
    existingSlots?: EntitySlotMap;
    recentTurns?: Array<{ role: string; text: string }>;
  }): Promise<StructuredReasoningResponse> {
    const cleanUtterance = params.utterance.trim();

    // 1. Ultra-fast local deterministic evaluation (<2ms)
    // Handles DTMF (0,1,2,8,9), yes/no, cancel, repeat, back, phone numbers, amounts,
    // greetings, thanks, goodbyes, help, and simple corrections without waiting for cloud LLMs.
    const fastResult = fastLocalReasoner.evaluate({
      input: cleanUtterance,
      currentStep: params.currentStep,
      existingSlots: params.existingSlots,
      languageHint: params.languageHint,
    });

    if (fastResult.canFastPath) {
      return {
        intent: fastResult.intent,
        confidence: fastResult.confidence,
        language: params.languageHint || "en",
        entities: fastResult.entities,
        conversationAct: fastResult.conversationAct || "UNKNOWN",
        correction: fastResult.isCorrection
          ? {
              isCorrection: true,
              field: fastResult.correctionField,
              newValue: String(fastResult.correctionNewValue),
            }
          : null,
        referenceResolution: null,
        ambiguity: { isAmbiguous: false, candidates: [] },
        requestedAction: {
          type: fastResult.intent,
          tool: null,
          arguments: fastResult.entities,
        },
        requiresConfirmation: fastResult.intent === "SEND_MONEY" || fastResult.intent === "CONFIRM",
        safetyFlags: [],
      };
    }

    // Fast-path: simple confirmations and cancellations (e.g. "yes", "aane", "cancel")
    if (this.isSimpleAffirmationOrDenial(cleanUtterance)) {
      return this.deterministicReasoning(params);
    }

    // 2. Deliberative Cloud Reasoning (Gemini primary -> OpenAI secondary -> Deterministic fallback)
    const canUseGemini = this.client.isAvailable();
    const canUseOpenAi = openAiClient.isAvailable();

    if (!canUseGemini && !canUseOpenAi) {
      return this.deterministicReasoning(params);
    }

    // Delimit caller utterance to prevent prompt injection (Item 3.8)
    const sanitizedUtterance = cleanUtterance.slice(0, 500).replace(/<{3,}|>{3,}/g, "");
    const prompt = `You are the natural language reasoning layer for Ɔkwankyerɛfo Pa (Ghana Voice Mobile Money).
Analyze this caller's utterance in English, Akan/Twi, or Ghanaian code-switching.

Caller utterance: <<<${sanitizedUtterance}>>>
Current screen: "${params.currentScreen || "HOME"}"
Current step: "${params.currentStep || "welcome"}"
Existing transaction slots: ${JSON.stringify(params.existingSlots || {})}
Recent conversation context: ${JSON.stringify(params.recentTurns || [])}

Rules:
1. Identify the caller's intent from [SEND_MONEY, PAY_BILL, BUY_AIRTIME, BUY_DATA, CASH_OUT, CHECK_BALANCE, CHECK_ACCOUNT, HELP, GO_BACK, GO_HOME, CANCEL, REPEAT, CHANGE_INFORMATION, CONFIRM, DENY, GREETING, THANKS, GOODBYE, QUESTION, EXPLANATION, CHITCHAT, CONFUSION, CLARIFICATION, MULTI_INTENT, OUT_OF_DOMAIN, INTERRUPTION, RECOVERY, UNKNOWN].
2. Extract financial entities: amount (number), recipientPhone (10 digits starting with 0), recipientName, network (MTN, Telecel, AT, G-Money).
3. Do NOT treat phone numbers as amounts.
4. Detect mid-turn corrections (e.g. "make it 200", "no send to Ama instead", "wrong number").
5. Detect pronoun/coreferences (e.g. "to him", "same amount", "that person").
6. If the user spoke a PIN or passcode, set safetyFlags: ["SPOKEN_PIN"].
7. Output valid JSON adhering strictly to the schema.`;

    let rawJson: string | null = null;

    // Try Gemini Primary
    if (canUseGemini) {
      try {
        rawJson = await geminiClient.executeWithTimeout(
          "REASONING",
          async (ai, signal) => {
            const resp = await ai.models.generateContent({
              model: AI_CONFIG.model,
              contents: prompt,
              config: {
                systemInstruction:
                  "You are an expert Ghanaian mobile financial voice cognitive engine. Analyze spoken English, Twi, and code-switched inputs accurately into structured JSON.",
                responseMimeType: "application/json",
                temperature: 0.1,
              },
            });
            return resp.text || "{}";
          },
          2000,
          0
        );
      } catch (err: any) {
        const errMessage = String(err.message || "");
        const isQuota =
          err.status === 429 ||
          errMessage.includes("429") ||
          errMessage.includes("RESOURCE_EXHAUSTED") ||
          errMessage.includes("Quota exceeded") ||
          errMessage.includes("quota");

        if (isQuota) {
          console.warn("[ReasoningEngine] Gemini API quota reached; attempting secondary cloud provider or local reasoning.");
        } else {
          console.warn("[ReasoningEngine] Gemini API unavailable or timed out:", err.message);
        }
      }
    }

    // Try OpenAI Secondary (if Gemini failed or unavailable)
    if (!rawJson && canUseOpenAi) {
      try {
        rawJson = await openAiClient.generateStructuredReasoning(prompt, 2000);
      } catch (err: any) {
        console.warn("[ReasoningEngine] OpenAI secondary provider unavailable or exhausted:", err.message);
      }
    }

    // Process structured model JSON if obtained
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        const validated = ModelReasoningSchema.safeParse(parsed);
        if (validated.success) {
          return this.normalizeModelResponse(validated.data, cleanUtterance, params.existingSlots);
        } else {
          console.warn(
            "[ReasoningEngine] Model returned off-schema JSON; falling back to deterministic reasoning:",
            validated.error.message
          );
        }
      } catch (parseErr: any) {
        console.warn("[ReasoningEngine] Failed to parse model response JSON; falling back:", parseErr.message);
      }
    }

    // Resilient local deterministic reasoning fallback
    return this.deterministicReasoning(params);
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
