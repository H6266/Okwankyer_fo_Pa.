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
import { openAiReasoner } from "../../services/openai/openaiReasoner";

const ModelReasoningSchema = z.object({
  intent: z.string().default("UNKNOWN"),
  confidence: z.coerce.number().min(0).max(1).default(0.85),
  language: z.string().default("en"),
  entities: z.object({
    amount: z.union([z.number(), z.string()]).optional().nullable(),
    recipientPhone: z.string().optional().nullable(),
    recipientName: z.string().optional().nullable(),
    network: z.string().optional().nullable(),
  }).optional().nullable().default({}),
  conversationAct: z.string().optional().nullable(),
  correction: z.object({
    isCorrection: z.boolean().optional(),
    field: z.string().optional(),
    oldValue: z.string().optional(),
    newValue: z.string().optional(),
    reason: z.string().optional(),
  }).optional().nullable(),
  referenceResolution: z.object({
    hasReference: z.boolean().optional(),
    referenceType: z.string().optional(),
    resolvedField: z.string().optional(),
    resolvedValue: z.string().optional(),
  }).optional().nullable(),
  ambiguity: z.object({
    isAmbiguous: z.boolean().optional(),
    candidates: z.array(z.string()).optional(),
  }).optional().nullable(),
  requestedAction: z.object({
    type: z.string().optional(),
    tool: z.string().optional().nullable(),
  }).optional().nullable(),
  requiresConfirmation: z.boolean().optional(),
  safetyFlags: z.array(z.string()).optional(),
}).passthrough();

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
    semanticMemoryContext?: Array<{ text: string }>;
    frequentContacts?: Array<{ name: string; phone: string; network?: string }>;
  }): Promise<StructuredReasoningResponse> {
    const cleanUtterance = params.utterance.trim();

    // Fast-path: simple confirmations and cancellations (e.g. "yes", "aane", "cancel")
    if (this.isSimpleAffirmationOrDenial(cleanUtterance)) {
      return this.deterministicReasoning(params);
    }

    if (this.client && typeof (this.client as any).isAvailable === "function" && !(this.client as any).isAvailable()) {
      // If Gemini client unavailable, check OpenAI reasoner before deterministic
      if (openAiReasoner.isAvailable()) {
        try {
          return await openAiReasoner.reason({
            utterance: cleanUtterance,
            languageHint: params.languageHint,
            currentScreen: params.currentScreen,
            currentStep: params.currentStep,
            existingSlots: params.existingSlots,
            recentTurns: params.recentTurns,
            semanticMemoryContext: params.semanticMemoryContext,
            frequentContacts: params.frequentContacts,
          });
        } catch (err: any) {
          console.warn("[ReasoningEngine] OpenAI reasoner attempt notice:", err?.message || err);
        }
      }
      return this.deterministicReasoning(params);
    }

    const candidateModels = [
      AI_CONFIG.model || process.env.GEMINI_MODEL || "gemini-2.5-flash",
      "gemini-flash-latest",
    ];

    const availableCandidates = candidateModels.filter((m) => {
      if (typeof (this.client as any)?.isModelAvailable === "function") {
        return (this.client as any).isModelAvailable(m);
      }
      return true;
    });
    if (availableCandidates.length === 0) {
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
1. Identify the caller's intent from [SEND_MONEY, PAY_BILL, BUY_AIRTIME, BUY_DATA, CASH_OUT, CHECK_BALANCE, CHECK_ACCOUNT, HELP, GO_BACK, GO_HOME, CANCEL, REPEAT, CHANGE_INFORMATION, CONFIRM, DENY, UNKNOWN].
2. Extract financial entities: amount (number), recipientPhone (10 digits starting with 0), recipientName, network (MTN, Telecel, AT, G-Money).
3. Do NOT treat phone numbers as amounts.
4. Detect mid-turn corrections (e.g. "make it 200", "no send to Ama instead", "wrong number").
5. Detect pronoun/coreferences (e.g. "to him", "same amount", "that person").
6. If the user spoke a PIN or passcode, set safetyFlags: ["SPOKEN_PIN"].
7. Output valid JSON adhering strictly to the schema.`;

    for (const modelName of availableCandidates) {
      try {
        const rawJson = await geminiClient.executeWithTimeout(
          "REASONING",
          async (ai, signal) => {
            const resp = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: {
                systemInstruction: "You are an expert Ghanaian mobile financial voice cognitive engine. Analyze spoken English, Twi, and code-switched inputs accurately into structured JSON.",
                responseMimeType: "application/json",
                temperature: 0.1,
              },
            });
            return resp.text || "{}";
          },
          2500,
          0 // No inner retries; fail fast to next candidate
        );

        let cleanJson = (rawJson || "").trim();
        if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        }
        const parsed = JSON.parse(cleanJson);
        const validated = ModelReasoningSchema.safeParse(parsed);
        if (!validated.success) {
          console.warn("[ReasoningEngine] Model returned off-schema JSON; falling back to deterministic reasoning:", validated.error.message);
          continue;
        }

        return this.normalizeModelResponse(validated.data, cleanUtterance, params.existingSlots);
      } catch (err: any) {
        const msg = String(err?.message || "");
        const isForbidden =
          msg.includes("403") ||
          msg.includes("PERMISSION_DENIED") ||
          msg.includes("denied access");
        const isQuota = msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded") || msg.includes("429");
        const is503HighDemand =
          msg.includes("503") ||
          msg.includes("high demand") ||
          msg.includes("Spikes in demand") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("Overloaded");

        if (isForbidden) {
          if (typeof (this.client as any)?.recordAccessDenied === "function") {
            (this.client as any).recordAccessDenied(msg);
          }
          console.info(`[ReasoningEngine] Gemini API access not permitted on current project (403). Operating with 100% resilient Ghanaian deterministic reasoning.`);
          break; // Stop querying subsequent models when project access is denied
        } else if (is503HighDemand) {
          const cooldownMs = 3 * 60 * 1000;
          this.client.recordModelQuotaExhausted(modelName, cooldownMs);
          console.info(`[ReasoningEngine] Model '${modelName}' temporarily at high demand (503). Cooled down for 3m; proceeding with resilient reasoning.`);
        } else if (isQuota) {
          let cooldownMs = 15 * 60 * 1000;
          const retrySecMatch = msg.match(/retryDelay['":\s]+([0-9]+)/i);
          if (retrySecMatch && retrySecMatch[1]) {
            cooldownMs = Math.max(60 * 1000, parseInt(retrySecMatch[1], 10) * 1000);
          }
          this.client.recordModelQuotaExhausted(modelName, cooldownMs);
          console.info(`[ReasoningEngine] Model '${modelName}' free quota reached. Cooldown until ${new Date(Date.now() + cooldownMs).toLocaleTimeString()}.`);
        } else {
          console.warn(`[ReasoningEngine] Model '${modelName}' notice:`, msg.slice(0, 100));
        }
        continue;
      }
    }

    // If all Gemini candidates failed or were exhausted, try OpenAI Reasoner
    if (openAiReasoner.isAvailable()) {
      try {
        return await openAiReasoner.reason({
          utterance: cleanUtterance,
          languageHint: params.languageHint,
          currentScreen: params.currentScreen,
          currentStep: params.currentStep,
          existingSlots: params.existingSlots,
          recentTurns: params.recentTurns,
          semanticMemoryContext: params.semanticMemoryContext,
          frequentContacts: params.frequentContacts,
        });
      } catch (err: any) {
        console.warn("[ReasoningEngine] OpenAI reasoner candidate attempt notice:", err?.message || err);
      }
    }

    // All cloud candidates failed or exhausted; fall back to deterministic Ghanaian reasoning
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
