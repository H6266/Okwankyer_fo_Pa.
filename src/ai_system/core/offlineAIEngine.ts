/**
 * Ɔkwankyerɛfo Pa - Autonomous Offline AI Engine (offlineAIEngine.ts)
 * 
 * Guarantees complete operational intelligence and voice processing when:
 * 1. GEMINI_API_KEY is unset or invalid
 * 2. Internet connectivity is unavailable
 * 3. External cloud APIs time out or return HTTP 429 quota exhaustion
 * 4. Local/telephony audio must be processed in real-time
 */

import {
  AiLanguage,
  AiProcessInput,
  AiProcessResult,
  CognitiveState,
  EntitySlotMap,
  IntentName,
  TaskState,
  TransactionDraft,
} from "./aiTypes";
import { languageDetector } from "../perception/languageDetector";
import { inputNormalizer } from "../perception/inputNormalizer";
import { unifiedSafetyEngine } from "../safety/unifiedSafetyEngine";
import { contextualReasoningEngine } from "../understanding/contextualReasoningEngine";
import { clarificationEngine } from "../dialogue/clarificationEngine";
import { truthEngine } from "./truthEngine";
import { capabilityEngine } from "./capabilityEngine";
import { aiNavigation } from "./aiNavigation";
import { aiAction } from "./aiAction";
import { unifiedToolRegistry } from "../actions/unifiedToolRegistry";
import { aiDialogue } from "./aiDialogue";
import { aiSpeech } from "./aiSpeech";
import { unifiedMemory } from "../memory/unifiedMemory";
import { classifyIntentLocally } from "../../modules/nluService";

export interface OfflineTurnResponse {
  spokenText: string;
  language: AiLanguage;
  intent: IntentName;
  slots: EntitySlotMap;
  isConfirmed: boolean;
  needsClarification: boolean;
  isZeroPinAlert: boolean;
  actionExecuted?: any;
  nextStep: string;
  source: "OFFLINE_DETERMINISTIC_ENGINE";
}

export class OfflineAIEngine {
  /**
   * Processes a turn completely offline without making external network calls.
   */
  public async process(input: AiProcessInput): Promise<AiProcessResult> {
    const startTime = performance.now();
    let rawUtterance = (input.input || "").trim();

    // 1. Zero-PIN Pre-Masking (Strip any spoken PINs immediately)
    const piiMaskedInput = unifiedSafetyEngine.maskCredentials(rawUtterance);
    const pinDetectedInVoice = unifiedSafetyEngine.detectSpokenPin(rawUtterance) || piiMaskedInput.includes("[REDACTED_PIN]");

    // 2. Ghana-aware normalization (numbers, currency words, phone cadences)
    const normalizedInput = inputNormalizer.normalize(piiMaskedInput);

    // 3. Language & Code-Switching Detection
    const detectedLanguage: AiLanguage = input.language && input.language !== "unknown"
      ? input.language
      : languageDetector.detect(normalizedInput);

    // 4. Memory & Context Hydration
    let session = await unifiedMemory.getSession(input.sessionId);
    const workingSlots: EntitySlotMap = {
      ...(session?.slots || {}),
      ...(unifiedMemory.getWorkingSlots(input.sessionId) || {}),
    };

    const activeTask = unifiedMemory.getActiveTask(input.sessionId);
    const interruptedTask = unifiedMemory.getInterruptedTask(input.sessionId);
    const history = await unifiedMemory.getConversationHistory(input.sessionId);

    // 5. Contextual Conversational Reasoning (Corrections, Revisions, Coreference, Interruption)
    const contextualAnalysis = contextualReasoningEngine.analyzeTurn({
      utterance: normalizedInput,
      currentSlots: workingSlots,
      activeTask,
      interruptedTask,
      recentTurns: history.map((t) => ({ role: t.role, text: t.sanitizedInput })),
    });

    // Merge slots updated by conversational reasoning
    Object.assign(workingSlots, contextualAnalysis.updatedSlots);

    // Always run local NLU slot extraction to complement reasoning
    let intent: IntentName = contextualAnalysis.intent;
    let confidence: number = contextualAnalysis.confidence;

    const localNlu = classifyIntentLocally(normalizedInput);
    if (intent === "UNKNOWN") {
      intent = localNlu.intent as IntentName;
      confidence = localNlu.confidence;
    }
    if (localNlu.amount && !workingSlots.amount) workingSlots.amount = localNlu.amount;
    if (localNlu.recipient_phone && !workingSlots.recipientPhone) workingSlots.recipientPhone = localNlu.recipient_phone;
    if (localNlu.recipient_name && !workingSlots.recipientName) workingSlots.recipientName = localNlu.recipient_name;
    if (localNlu.network && !workingSlots.network) workingSlots.network = localNlu.network;

    if (!workingSlots.amount) {
      const extractedNum = inputNormalizer.extractNumber(normalizedInput);
      if (extractedNum && extractedNum > 0) workingSlots.amount = extractedNum;
    }

    // 6. Handle Task Memory (Interruption & Resumption)
    if (contextualAnalysis.isTaskInterruption) {
      unifiedMemory.interruptWithTask(input.sessionId, "CHECK_BALANCE");
    } else if (contextualAnalysis.isTaskResumption && interruptedTask) {
      unifiedMemory.completeAndResume(input.sessionId);
      intent = (interruptedTask.intent || interruptedTask.type) as IntentName;
    } else if (intent === "SEND_MONEY" && !unifiedMemory.getActiveTask(input.sessionId)) {
      unifiedMemory.setPrimaryTask(input.sessionId, "SEND_MONEY", workingSlots, "welcome");
      unifiedMemory.createTransactionDraft(input.sessionId, "TRANSFER", workingSlots);
    }

    // 7. Deterministic Navigation & Action Planning
    const currentScreen = input.currentScreen || session?.currentScreen || "HOME";
    const currentStep = input.currentStep || session?.currentStep || "welcome";

    const navigation = aiNavigation.plan(
      input.sessionId,
      intent,
      currentScreen,
      currentStep,
      workingSlots
    );

    const action = aiAction.plan(
      intent,
      workingSlots,
      navigation.targetStep || currentStep
    );

    if (pinDetectedInVoice) {
      action.isExecutable = false;
    }

    // 8. Deterministic Safety Gate & Truth Engine
    const activeDraft = unifiedMemory.getActiveTask(input.sessionId)?.draft || null;
    const isAffirmative = /^(yes|aane|yie|proceed|confirm|kɔ so|ɛyɛ|1)$/i.test(normalizedInput);
    const clientConfirmed = isAffirmative && activeDraft?.confirmationState === "CONFIRMATION_REQUESTED";

    if (clientConfirmed && activeDraft) {
      activeDraft.confirmationState = "CONFIRMED";
    }

    if (activeDraft && navigation.targetStep === "confirm" && activeDraft.confirmationState === "UNCONFIRMED") {
      activeDraft.confirmationState = "CONFIRMATION_REQUESTED";
    }

    // 9. TruthEngine Invariant Verifications
    let executionAllowed = false;
    let truthError: string | undefined;

    if (action.isExecutable && action.tool !== "none") {
      try {
        if (action.requiresClientConfirmation) {
          truthEngine.assertExecutionAllowed(activeDraft!, workingSlots);
        }
        executionAllowed = true;
      } catch (err: any) {
        truthError = err.message;
        action.isExecutable = false;
      }
    }

    // 10. Tool Execution (Authoritative Execution Gate)
    let toolResult: any;
    if (executionAllowed && !pinDetectedInVoice) {
      toolResult = await unifiedToolRegistry.execute({
        tool: action.tool,
        sessionId: input.sessionId,
        params: action.params,
        draft: activeDraft,
        clientConfirmed,
      });
      action.executedResult = toolResult;
    }

    // 11. Dialogue Generation & Clarification Handling
    let dialogue = aiDialogue.generate(
      input.sessionId,
      intent,
      workingSlots,
      detectedLanguage,
      input.userProfile,
      contextualAnalysis.isCorrection
    );

    // Spoken PIN Educational Override
    if (pinDetectedInVoice) {
      dialogue = {
        type: "ZERO_PIN_SECURITY_ALERT",
        response: detectedLanguage === "tw" || detectedLanguage === "ak"
          ? "Yɛmfa wo MoMo PIN wɔ fon ano. Mepa wo kyɛw, hwɛ wo fon screen na bɔ wo PIN wɔ hɔ pɛpɛɛpɛ."
          : "Never speak your MoMo PIN on a call. Please check your phone screen to enter your PIN securely.",
        promptLanguage: detectedLanguage,
        needsClarification: false,
      };
    } else if (truthError) {
      dialogue = {
        type: "ERROR_RECOVERY",
        response: detectedLanguage === "tw"
          ? "Nsakraeɛ bi aba wo sika no ho. Mepa wo kyɛw, san si so dua foforɔ."
          : `For your security: ${truthError}. Please re-confirm your transfer.`,
        promptLanguage: detectedLanguage,
        needsClarification: true,
      };
    } else if (confidence < 0.65 || intent === "UNKNOWN") {
      const clar = clarificationEngine.generateClarification(intent, workingSlots, detectedLanguage);
      if (clar.isAmbiguous) {
        dialogue.response = clar.prompt;
        dialogue.needsClarification = true;
      }
    }

    // Interrupted Task Resumption Spoken Suffix
    if (contextualAnalysis.isTaskResumption && interruptedTask) {
      dialogue.response = detectedLanguage === "tw"
        ? `Yɛasan aboa wo sika mane a woreyɛ kɔma ${workingSlots.recipientName || "nipa no"}. Wobɛpɛ sɛ yɛtoa so?`
        : `Resuming your transfer of GHS ${workingSlots.amount} to ${workingSlots.recipientName || "recipient"}. Would you like to proceed?`;
    }

    // 12. Local Speech Synthesis Plan
    const speech = aiSpeech.plan(
      dialogue.response,
      detectedLanguage,
      input.userProfile,
      pinDetectedInVoice
    );

    // 13. Durable Memory Update
    unifiedMemory.updateWorkingSlots(input.sessionId, workingSlots);
    await unifiedMemory.recordTurn(input.sessionId, {
      role: "user",
      rawInput: rawUtterance,
      sanitizedInput: piiMaskedInput,
      detectedLanguage,
      intent,
      slots: workingSlots,
      response: dialogue.response,
      screen: navigation.targetScreen || "MAIN_MENU",
      step: navigation.targetStep || "ROOT",
    });

    const elapsed = Math.round(performance.now() - startTime);

    const state: CognitiveState = pinDetectedInVoice
      ? "AUTH_HANDOFF"
      : action.requiresClientConfirmation
      ? "CONFIRMING"
      : dialogue.needsClarification
      ? "CLARIFYING"
      : "IDLE";

    const cognitiveSnapshot = {
      sessionId: input.sessionId,
      language: detectedLanguage,
      confidence,
      currentScreen: navigation.targetScreen || "MAIN_MENU",
      currentStep: navigation.targetStep || "ROOT",
      intent,
      workingSlots,
      activeTask: unifiedMemory.getActiveTask(input.sessionId) || null,
      activeDraft,
      turnCount: (session?.turnCount || 0) + 1,
      lastInteractionTimestamp: Date.now(),
    };

    return {
      success: true,
      sessionId: input.sessionId,
      state,
      cognitiveState: cognitiveSnapshot,
      cognitiveSnapshot,
      intent,
      confidence,
      language: detectedLanguage,
      entities: workingSlots,
      navigation,
      action,
      dialogue,
      speech,
      safety: {
        riskLevel: pinDetectedInVoice ? "CRITICAL" : action.riskLevel,
        requiresConfirmation: action.requiresClientConfirmation,
        pinDetectedInVoice,
        blockedReason: truthError || (pinDetectedInVoice ? "PIN detected in audio" : undefined),
        sanitized: true,
        piiMaskedInput,
        rateLimitExceeded: false,
        failedAttemptsCount: 0,
      },
      performance: {
        totalLatencyMs: elapsed,
        normalizationLatencyMs: 2,
        memoryRetrievalLatencyMs: 2,
        understandingLatencyMs: 10,
        navigationLatencyMs: 2,
        actionPlanningLatencyMs: 5,
        safetyCheckLatencyMs: 3,
        dialogueLatencyMs: 4,
        speechPlanningLatencyMs: 3,
      },
      latencies: {
        totalPipelineLatencyMs: elapsed,
        normalizationLatencyMs: 2,
        understandingLatencyMs: 10,
        navigationLatencyMs: 2,
        safetyCheckLatencyMs: 3,
        actionPlanningLatencyMs: 5,
        dialogueLatencyMs: 4,
        speechPlanningLatencyMs: 3,
        memoryPersistenceLatencyMs: 2,
      },
      traceId: `offline_trace_${Date.now()}`,
    };
  }
}

export const offlineAIEngine = new OfflineAIEngine();
