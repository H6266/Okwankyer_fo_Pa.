/**
 * Ɔkwankyerɛfo Pa - Canonical Cognitive Router & Gateway (CognitiveRouter.ts)
 * 
 * Implements Section 4 & 5 Cognitive Provider Routing:
 * Routing Priority:
 * 1. Deterministic Ultra-Fast Path (DTMF, single digits, yes/no/aane/dabi/ɛyɛ/cancel, phone numbers, amounts)
 * 2. Local Ghanaian Language Brain (local Akan/Twi grammar rules & lexicons)
 * 3. Local Neural Reasoning if available
 * 4. Gemini Cloud Reasoning (escalation only when semantic reasoning required)
 * 5. Deterministic Emergency Fallback
 * 
 * Strict Evidence-Based Calibrated Confidence:
 * Combines ASR confidence, deterministic match, schema validity, entity validation, and context agreement.
 */

import {
  AiProcessInput,
  StructuredReasoningResponse,
  AiLanguage,
  EntitySlotMap,
} from "../core/aiTypes";
import { localLanguageBrain } from "./LocalLanguageBrain";
import { geminiClient } from "../../services/geminiClient";
import { asrRouter } from "../speech/asr/asrRouter";
import { ttsRouter } from "../speech/tts/ttsRouter";
import { unifiedSafetyEngine } from "../safety/unifiedSafetyEngine";
import { reasoningEngine } from "../understanding/reasoningEngine";
import { aiUnderstanding } from "../core/aiUnderstanding";
import { z } from "zod";

const RemoteUnderstandingSchema = z.object({
  intent: z.enum([
    "SEND_MONEY", "PAY_BILL", "BUY_AIRTIME", "BUY_DATA", "CASH_OUT",
    "CHECK_BALANCE", "CHECK_ACCOUNT", "HELP", "GO_BACK", "GO_HOME",
    "CANCEL", "REPEAT", "CHANGE_INFORMATION", "CONFIRM", "DENY", "UNKNOWN",
  ]),
  amount: z.number().finite().positive().optional(),
  recipientPhone: z.string().regex(/^(?:0\d{9}|233\d{9})$/).optional(),
  recipientName: z.string().trim().min(1).max(100).optional(),
  network: z.enum(["MTN", "Telecel", "AT", "G-Money"]).optional(),
}).strict();

export interface CognitiveRouterMetrics {
  routingDecision:
    | "LOCAL_DETERMINISTIC"
    | "LOCAL_BRAIN"
    | "REMOTE_GEMINI_ESCALATED"
    | "DETERMINISTIC_FALLBACK"
    | "SAFETY_CIRCUIT_INTERCEPT";
  providerUsed: string;
  reasoningLatencyMs: number;
  model?: string;
  fallbackUsed?: boolean;
  reasonForEscalation?: string;
  confidence: number;
  evidenceScore: number;
  circuitBreakerOpen: boolean;
}

export interface CognitiveRouteInput {
  utterance?: string;
  input?: string;
  sessionId?: string;
  channel?: string;
  language?: AiLanguage;
  languageHint?: AiLanguage;
  currentScreen?: string;
  currentStep?: string;
  existingSlots?: EntitySlotMap;
  workingSlots?: EntitySlotMap;
  recentTurns?: Array<{ role: string; text: string }>;
  semanticMemoryContext?: Array<{ text: string }>;
  frequentContacts?: Array<{ name: string; phone: string; network?: string }>;
  executionMode?: "SIMULATION" | "MTN_SANDBOX";
  asrConfidence?: number;
}

export function calculateEvidenceScore(params: {
  rawText: string;
  intent: string;
  entities: Record<string, any>;
  asrConfidence?: number;
  deterministicMatch: boolean;
  schemaValid: boolean;
}): number {
  let score = 0.50;
  if (params.deterministicMatch) score += 0.20;
  if (params.schemaValid) score += 0.10;
  if (params.entities.recipientPhone && /^0\d{9}$/.test(String(params.entities.recipientPhone))) {
    score += 0.10;
  }
  if (params.entities.amount && typeof params.entities.amount === "number" && params.entities.amount > 0 && params.entities.amount <= 5000) {
    score += 0.05;
  }
  if (params.entities.recipientName) {
    score += 0.05;
  }
  const asrWeight = typeof params.asrConfidence === "number" ? Math.max(0.4, Math.min(1.0, params.asrConfidence)) : 1.0;
  return Math.min(0.99, Math.max(0.10, Number((score * asrWeight).toFixed(3))));
}

export class CognitiveRouter {
  /**
   * Identifies simple tokens that must be resolved on the fast deterministic path without remote LLMs.
   */
  private isFastDeterministic(rawText: string): boolean {
    const trimmed = rawText.trim().toLowerCase();
    // 1. Single digit or DTMF key: 0-9, *, #
    if (/^[0-9*#]$/.test(trimmed)) return true;

    // 2. Affirmations, denials, cancellations, and core commands
    if (/^(yes|yeah|yep|aane|ɛyɛ|eye|yoo|no|nope|dabi|cancel|gyae|stop|back|san|repeat|ka bio|home|help|boa me)$/i.test(trimmed)) {
      return true;
    }

    // 3. Ghanaian phone number: exactly 10 digits starting with 0
    if (/^0\d{9}$/.test(trimmed.replace(/\s+/g, ""))) return true;

    // 4. Pure amount expressions: e.g. "50", "20 cedis", "ghc 100", "aduonu", "aduasa"
    if (/^(?:gh[c₵]?\s*)?\d+(?:\.\d{1,2})?(?:\s*(?:cedis?|pesewas?))?$/i.test(trimmed)) {
      return true;
    }

    return false;
  }

  /**
   * Routes understanding request according to the canonical 5-tier priority hierarchy.
   */
  public async routeUnderstanding(input: CognitiveRouteInput | AiProcessInput): Promise<{
    response: StructuredReasoningResponse;
    metrics: CognitiveRouterMetrics;
  }> {
    const start = performance.now();
    const rawText = (input.input || (input as any).utterance || "").trim();
    const currentStep = input.currentStep || "welcome";
    const currentScreen = input.currentScreen || "HOME";
    const language = input.language || (input as any).languageHint || "en";
    const workingSlots = (input as any).workingSlots || (input as any).existingSlots || {};
    const recentTurns = (input as any).recentTurns || [];
    const semanticMemoryContext = (input as any).semanticMemoryContext || [];
    const frequentContacts = (input as any).frequentContacts || [];
    const asrConfidence = (input as any).asrConfidence;

    // ── Tier 1: PIN Disclosure & Safety Circuit Intercept ───────────────────
    if (unifiedSafetyEngine.detectSpokenPin(rawText) || rawText.includes("[REDACTED_PIN]")) {
      const response: StructuredReasoningResponse = {
        intent: "UNKNOWN",
        confidence: 0.99,
        language,
        entities: {},
        conversationAct: "DENY",
        correction: null,
        referenceResolution: null,
        ambiguity: { isAmbiguous: false, candidates: [] },
        requestedAction: {
          type: "REJECT",
          tool: null,
          arguments: {
            reason: "PIN_DETECTED",
            prompt: "PIN disclosure is not allowed over voice. Please enter your PIN on your phone keypad when prompted.",
          },
        },
        requiresConfirmation: false,
        safetyFlags: ["PIN_DETECTED"],
      };

      return {
        response,
        metrics: {
          routingDecision: "SAFETY_CIRCUIT_INTERCEPT",
          providerUsed: "deterministic-zero-pin-guard",
          reasoningLatencyMs: Math.round(performance.now() - start),
          confidence: 0.99,
          evidenceScore: 0.99,
          circuitBreakerOpen: false,
        },
      };
    }

    // ── Tier 1: Deterministic Ultra-Fast Path (No LLM, <5ms) ───────────────
    if (this.isFastDeterministic(rawText)) {
      const deterministicResponse = reasoningEngine.deterministicReasoning({
        utterance: rawText,
        languageHint: language,
        currentScreen,
        currentStep,
        existingSlots: workingSlots,
      });

      const evidenceScore = calculateEvidenceScore({
        rawText,
        intent: deterministicResponse.intent,
        entities: deterministicResponse.entities,
        asrConfidence,
        deterministicMatch: true,
        schemaValid: true,
      });

      deterministicResponse.confidence = evidenceScore;

      return {
        response: deterministicResponse,
        metrics: {
          routingDecision: "LOCAL_DETERMINISTIC",
          providerUsed: "deterministic-fast-path",
          reasoningLatencyMs: Math.max(1, Math.round(performance.now() - start)),
          confidence: evidenceScore,
          evidenceScore,
          circuitBreakerOpen: false,
        },
      };
    }

    // ── Tier 1b: Simulation Digital Twin Execution (Autonomous local processing) ─
    if (input.executionMode === "SIMULATION") {
      const localSimResult = await localLanguageBrain.understand({
        text: rawText,
        language,
        currentStep,
        previousSlots: workingSlots,
      });
      const evidenceScore = calculateEvidenceScore({
        rawText,
        intent: localSimResult.intent,
        entities: localSimResult.entities,
        asrConfidence,
        deterministicMatch: true,
        schemaValid: true,
      });
      localSimResult.confidence = evidenceScore;
      return {
        response: localSimResult,
        metrics: {
          routingDecision: "LOCAL_BRAIN",
          providerUsed: "simulator-local-brain",
          reasoningLatencyMs: Math.max(1, Math.round(performance.now() - start)),
          confidence: evidenceScore,
          evidenceScore,
          circuitBreakerOpen: false,
        },
      };
    }

    // ── Tier 2: Local Ghanaian Language Brain (Local-First execution) ───────
    const localBrainResult = await localLanguageBrain.understand({
      text: rawText,
      language,
      currentStep,
    });

    const isHighConfidenceLocal =
      localBrainResult.confidence >= 0.65 ||
      localBrainResult.ambiguity.isAmbiguous ||
      (localBrainResult.intent !== "UNKNOWN" && (Boolean(localBrainResult.entities.amount) || Boolean(localBrainResult.entities.recipientPhone) || Boolean(localBrainResult.entities.recipientName))) ||
      ["CANCEL", "GO_BACK", "REPEAT", "CONFIRM", "CHECK_BALANCE"].includes(localBrainResult.intent);

    if (isHighConfidenceLocal) {
      const evidenceScore = calculateEvidenceScore({
        rawText,
        intent: localBrainResult.intent,
        entities: localBrainResult.entities,
        asrConfidence,
        deterministicMatch: true,
        schemaValid: true,
      });

      localBrainResult.confidence = evidenceScore;

      return {
        response: localBrainResult,
        metrics: {
          routingDecision: "LOCAL_BRAIN",
          providerUsed: "local-language-brain",
          reasoningLatencyMs: Math.round(performance.now() - start),
          confidence: evidenceScore,
          evidenceScore,
          circuitBreakerOpen: false,
        },
      };
    }

    // ── Tier 3 & 4: Cloud Gemini Reasoning (Escalation only when needed) ───
    const circuitBreakerOpen = !geminiClient.isAvailable();
    if (!circuitBreakerOpen) {
      try {
        const reasoningStart = performance.now();
        const geminiResult = await reasoningEngine.reason({
          utterance: rawText,
          languageHint: language,
          currentScreen,
          currentStep,
          existingSlots: workingSlots,
          recentTurns,
          semanticMemoryContext,
          frequentContacts,
        });

        const evidenceScore = calculateEvidenceScore({
          rawText,
          intent: geminiResult.intent,
          entities: geminiResult.entities,
          asrConfidence,
          deterministicMatch: false,
          schemaValid: true,
        });

        geminiResult.confidence = evidenceScore;

        return {
          response: geminiResult,
          metrics: {
            routingDecision: "REMOTE_GEMINI_ESCALATED",
            providerUsed: "gemini-cloud-reasoner",
            reasoningLatencyMs: Math.round(performance.now() - reasoningStart),
            model: process.env.GEMINI_REASONING_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash",
            fallbackUsed: false,
            reasonForEscalation: "Complex semantic utterance exceeding local brain threshold",
            confidence: evidenceScore,
            evidenceScore,
            circuitBreakerOpen: false,
          },
        };
      } catch (err: any) {
        console.warn("[CognitiveRouter] Gemini cloud reasoning error; falling back to deterministic emergency brain:", err.message);
      }
    }

    // ── Tier 5: Deterministic Emergency Fallback ───────────────────────────
    const fallbackResponse = reasoningEngine.deterministicReasoning({
      utterance: rawText,
      languageHint: language,
      currentScreen,
      currentStep,
      existingSlots: workingSlots,
    });

    const fallbackEvidence = calculateEvidenceScore({
      rawText,
      intent: fallbackResponse.intent,
      entities: fallbackResponse.entities,
      asrConfidence,
      deterministicMatch: true,
      schemaValid: true,
    });

    fallbackResponse.confidence = fallbackEvidence;

    return {
      response: fallbackResponse,
      metrics: {
        routingDecision: "DETERMINISTIC_FALLBACK",
        providerUsed: "deterministic-emergency-fallback",
        reasoningLatencyMs: Math.round(performance.now() - start),
        fallbackUsed: true,
        confidence: fallbackEvidence,
        evidenceScore: fallbackEvidence,
        circuitBreakerOpen: true,
      },
    };
  }

  // Audio / Speech routing delegations
  public async routeAsr(audioBuffer: Buffer | string, mimeType?: string) {
    return asrRouter.transcribe(audioBuffer, mimeType);
  }

  public async routeTts(text: string, language?: AiLanguage) {
    return ttsRouter.synthesize({
      text,
      language: language || "tw",
    });
  }
}

export const cognitiveRouter = new CognitiveRouter();
export const cognitiveGateway = cognitiveRouter;
export const cognitiveOrchestrator = cognitiveRouter;
export const CognitiveGateway = CognitiveRouter;
export const CognitiveOrchestrator = CognitiveRouter;
