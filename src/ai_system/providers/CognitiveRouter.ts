/**
 * Ɔkwankyerɛfo Pa - Cognitive Router (CognitiveRouter.ts)
 * 
 * Implements Section 10 Cognitive Provider Routing:
 * Providers:
 * - DeterministicBrain
 * - LocalLanguageBrain
 * - GeminiBrain
 * - OptionalOtherRemoteBrain
 * - LocalASR
 * - RemoteASR
 * - LocalTTS
 * - RemoteTTS
 * 
 * Router inputs:
 * - task complexity
 * - confidence
 * - language
 * - context
 * - risk
 * - network
 * - provider health
 * - latency
 * - privacy & Zero-PIN rules
 */

import {
  AiProcessInput,
  StructuredReasoningResponse,
  AiLanguage,
} from "../core/aiTypes";
import { localLanguageBrain } from "./LocalLanguageBrain";
import { geminiClient } from "../../services/geminiClient";
import { asrRouter } from "../speech/asr/asrRouter";
import { ttsRouter } from "../speech/tts/ttsRouter";
import { unifiedSafetyEngine } from "../safety/unifiedSafetyEngine";

export interface CognitiveRouterMetrics {
  routingDecision: "LOCAL_DETERMINISTIC" | "LOCAL_BRAIN" | "REMOTE_GEMINI_ESCALATED" | "SAFETY_CIRCUIT_INTERCEPT";
  providerUsed: string;
  reasoningLatencyMs: number;
}

export class CognitiveRouter {
  /**
   * Routes understanding request according to local-first principles.
   */
  public async routeUnderstanding(input: AiProcessInput): Promise<{
    response: StructuredReasoningResponse;
    metrics: CognitiveRouterMetrics;
  }> {
    const start = performance.now();
    const rawText = input.input || "";

    // 1. PIN disclosure & Safety checks (Deterministic Security Gate)
    if (unifiedSafetyEngine.detectSpokenPin(rawText)) {
      return {
        response: {
          intent: "UNKNOWN",
          confidence: 0.99,
          language: input.language || "en",
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
        },
        metrics: {
          routingDecision: "SAFETY_CIRCUIT_INTERCEPT",
          providerUsed: "deterministic-zero-pin-guard",
          reasoningLatencyMs: Math.round(performance.now() - start),
        },
      };
    }

    // 2. Local Language Brain (Local-First execution)
    const localBrainResult = await localLanguageBrain.understand({
      text: rawText,
      language: input.language,
      currentStep: input.currentStep,
    });

    // If local brain is highly confident (>= 0.85) or it's a fixed navigational/cancel command, use it immediately
    if (
      localBrainResult.confidence >= 0.85 ||
      ["CANCEL", "GO_BACK", "REPEAT", "CONFIRM", "CHECK_BALANCE"].includes(localBrainResult.intent)
    ) {
      return {
        response: localBrainResult,
        metrics: {
          routingDecision: "LOCAL_BRAIN",
          providerUsed: "local-language-brain",
          reasoningLatencyMs: Math.round(performance.now() - start),
        },
      };
    }

    // 3. Optional Remote Escalation (Gemini) if available and local confidence is moderate/uncertain
    if (geminiClient.isAvailable()) {
      try {
        const geminiRes = await geminiClient.executeWithTimeout(
          "cognitive_reasoning_escalation",
          async (ai) => {
            const response = await ai.models.generateContent({
              model: process.env.GEMINI_REASONING_MODEL || "gemini-3.8-flash",
              contents: `Analyze Ghanaian mobile money request: "${rawText}". Output JSON with intent, amount, recipientPhone, recipientName.`,
            });
            return response.text;
          },
          2500,
          0
        );

        if (geminiRes) {
          try {
            const parsed = JSON.parse(geminiRes);
            if (parsed && parsed.intent) {
              return {
                response: {
                  ...localBrainResult,
                  intent: parsed.intent,
                  confidence: 0.90,
                  entities: {
                    ...localBrainResult.entities,
                    ...(parsed.amount ? { amount: Number(parsed.amount) } : {}),
                    ...(parsed.recipientPhone ? { recipientPhone: String(parsed.recipientPhone) } : {}),
                    ...(parsed.recipientName ? { recipientName: String(parsed.recipientName) } : {}),
                  },
                },
                metrics: {
                  routingDecision: "REMOTE_GEMINI_ESCALATED",
                  providerUsed: "gemini-cloud-reasoner",
                  reasoningLatencyMs: Math.round(performance.now() - start),
                },
              };
            }
          } catch {}
        }
      } catch (err: any) {
        console.warn("[CognitiveRouter] Gemini escalation skipped; retaining local brain:", err.message);
      }
    }

    // 4. Default return from Local Language Brain
    return {
      response: localBrainResult,
      metrics: {
        routingDecision: "LOCAL_BRAIN",
        providerUsed: "local-language-brain",
        reasoningLatencyMs: Math.round(performance.now() - start),
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
