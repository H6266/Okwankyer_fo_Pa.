/**
 * Ɔkwankyerɛfo Pa - Canonical Central AI Cognitive Engine (aiEngine.ts)
 *
 * Single, unified orchestrator implementing the 8-stage canonical pipeline:
 *
 * process(input)
 *  ↓
 * 1. prepareContext()  -> Normalize, PII scrub, detect language, hydrate memory
 * 2. understand()      -> Structured LLM reasoning or deterministic fallback, entities, corrections
 * 3. decide()          -> State machine transition, navigation, task stack, action planning
 * 4. authorize()       -> Unified safety engine, Zero-PIN gate, invariants INVARIANT_001..010
 * 5. execute()         -> Safe tool execution via unifiedToolRegistry & financialServices
 * 6. respond()         -> Culturally grounded dialogue generation, single-slot focus, verbatim facts
 * 7. speech()          -> Authentic Ghanaian voice planning & phone cadence
 * 8. remember()        -> Durable persistence, episodic logging, semantic indexing, draft audit
 */

import {
  ActionOutput,
  AiLanguage,
  AiProcessInput,
  AiProcessResult,
  CognitiveState,
  ConversationTurnRecord,
  DialogueOutput,
  EntitySlotMap,
  IntentName,
  NavigationOutput,
  PerformanceBreakdown,
  SafetyOutput,
  SpeechOutput,
  StructuredReasoningResponse,
  TaskState,
  TransactionDraft,
} from "./aiTypes";
import { AI_CONFIG } from "./aiConfig";
import { inputNormalizer } from "../perception/inputNormalizer";
import { languageDetector } from "../perception/languageDetector";
import { unifiedMemory } from "../memory/unifiedMemory";
import { reasoningEngine } from "../understanding/reasoningEngine";
import { aiNavigation } from "./aiNavigation";
import { aiAction } from "./aiAction";
import { unifiedSafetyEngine } from "../safety/unifiedSafetyEngine";
import { unifiedToolRegistry } from "../actions/unifiedToolRegistry";
import { aiDialogue } from "./aiDialogue";
import { aiSpeech } from "./aiSpeech";
import { aiUnderstanding } from "./aiUnderstanding";
import { audioIngestor } from "../perception/audioIngestor";
import { aiTrace } from "../observability/aiTrace";
import { financialPolicy } from "./financialPolicy";

export interface ExecutionContext {
  sessionId: string;
  channel: string;
  rawInput: string;
  sanitizedInput: string;
  normalizedInput: string;
  detectedLanguage: AiLanguage;
  currentScreen: string;
  currentStep: string;
  workingSlots: EntitySlotMap;
  activeTask: TaskState | null;
  activeDraft: TransactionDraft | null;
  recentTurns: ConversationTurnRecord[];
}

export class AiEngine {
  /**
   * Canonical single entry point for all voice, text, DTMF, and simulator interactions.
   */
  public async process(input: AiProcessInput): Promise<AiProcessResult> {
    const totalStart = performance.now();
    const latencies: Partial<PerformanceBreakdown> = {};

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 1: PREPARE CONTEXT & NORMALIZATION
    // ─────────────────────────────────────────────────────────────────────────
    const stage1Start = performance.now();
    let rawUtterance = input.input || "";

    // Stage 1 Audio Ingestion: If audio buffer supplied and text is empty, transcribe audio
    if (!rawUtterance.trim() && input.audioBuffer) {
      try {
        const transcript = await audioIngestor.transcribe(input.audioBuffer, input.mimeType || "audio/wav");
        rawUtterance = transcript.text;
      } catch (err: any) {
        console.warn("[AiEngine] Audio ingestion/transcription notice:", err.message);
      }
    }

    // Zero-PIN Pre-Masking: Mask credentials before anything else
    const piiMaskedInput = unifiedSafetyEngine.maskCredentials(rawUtterance);

    // Normalize spoken numbers (digits & Akan words), currency tokens, and phone numbers
    const normalizedInput = inputNormalizer.normalize(piiMaskedInput);

    // Language & Code-Switch Detection
    const detectedLanguage: AiLanguage = input.language && input.language !== "unknown"
      ? input.language
      : languageDetector.detect(normalizedInput);

    // Hydrate session and memory
    let session = await unifiedMemory.getSession(input.sessionId);
    if (!session) {
      session = {
        sessionId: input.sessionId,
        userId: input.userProfile?.userId,
        phoneNumber: input.userProfile?.phoneNumber,
        language: detectedLanguage,
        currentScreen: input.currentScreen || "HOME",
        currentStep: input.currentStep || "welcome",
        slots: input.transactionState ? {
          amount: input.transactionState.amount,
          recipientPhone: input.transactionState.recipientPhone,
          recipientName: input.transactionState.recipientName,
          network: (input.transactionState.network as any) || null,
        } : {},
        lastActiveTimestamp: Date.now(),
        turnCount: 0,
      };
      await unifiedMemory.saveSession(session);
    }

    const currentScreen = input.currentScreen || session.currentScreen || "HOME";
    const currentStep = input.currentStep || session.currentStep || "welcome";

    // Merge accumulated slots
    const workingSlots: EntitySlotMap = {
      ...(session.slots || {}),
      ...(unifiedMemory.getWorkingSlots(input.sessionId) || {}),
      ...(input.transactionState ? {
        amount: input.transactionState.amount ?? session.slots.amount,
        recipientPhone: input.transactionState.recipientPhone ?? session.slots.recipientPhone,
        recipientName: input.transactionState.recipientName ?? session.slots.recipientName,
        network: (input.transactionState.network as any) ?? session.slots.network,
      } : {}),
    };

    const activeTask = unifiedMemory.getActiveTask(input.sessionId);
    const activeDraft = activeTask?.draft || null;
    const history = await unifiedMemory.getConversationHistory(input.sessionId);

    const ctx: ExecutionContext = {
      sessionId: input.sessionId,
      channel: input.channel,
      rawInput: rawUtterance,
      sanitizedInput: piiMaskedInput,
      normalizedInput,
      detectedLanguage,
      currentScreen,
      currentStep,
      workingSlots,
      activeTask,
      activeDraft,
      recentTurns: history.slice(-4),
    };

    latencies.normalizationLatencyMs = Math.round(performance.now() - stage1Start);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 2: UNDERSTAND (Structured Reasoning + Corrections)
    // ─────────────────────────────────────────────────────────────────────────
    const stage2Start = performance.now();

    const reasoning = await reasoningEngine.reason({
      utterance: ctx.normalizedInput,
      languageHint: ctx.detectedLanguage,
      currentScreen: ctx.currentScreen,
      currentStep: ctx.currentStep,
      existingSlots: ctx.workingSlots,
      recentTurns: ctx.recentTurns.map(t => ({ role: t.role, text: t.sanitizedInput })),
    });

    const intent: IntentName = reasoning.intent;
    const confidence = reasoning.confidence;

    // Merge entities extracted by reasoning layer
    Object.assign(ctx.workingSlots, reasoning.entities);

    // Handle mid-turn corrections
    let isCorrection = Boolean(reasoning.correction?.isCorrection);
    if (isCorrection && reasoning.correction) {
      unifiedMemory.recordCorrection(
        ctx.sessionId,
        reasoning.correction.field || "amount",
        reasoning.correction.oldValue,
        reasoning.correction.newValue,
        reasoning.correction.reason || "User verbal correction"
      );
      ctx.workingSlots.correctionField = reasoning.correction.field;
      ctx.workingSlots.previousValue = reasoning.correction.oldValue;
      ctx.workingSlots[reasoning.correction.field || "amount"] = reasoning.correction.newValue;
    }

    // Handle Task Memory Interruption (e.g. check balance during transfer)
    if (intent === "CHECK_BALANCE" && (ctx.workingSlots.amount || ctx.workingSlots.recipientPhone) && ctx.currentStep !== "welcome") {
      unifiedMemory.interruptWithTask(ctx.sessionId, "CHECK_BALANCE");
    } else if (intent === "SEND_MONEY") {
      if (!unifiedMemory.getActiveTask(ctx.sessionId)) {
        unifiedMemory.setPrimaryTask(ctx.sessionId, "SEND_MONEY", ctx.workingSlots, ctx.currentStep);
      }
      ctx.activeDraft = unifiedMemory.getActiveTask(ctx.sessionId)?.draft ||
        unifiedMemory.createTransactionDraft(ctx.sessionId, "TRANSFER", ctx.workingSlots);
    }

    latencies.understandingLatencyMs = Math.round(performance.now() - stage2Start);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 3: DECIDE (Navigation & Action Planning)
    // ─────────────────────────────────────────────────────────────────────────
    const stage3Start = performance.now();

    const navigation: NavigationOutput = aiNavigation.plan(
      ctx.sessionId,
      intent,
      ctx.currentScreen,
      ctx.currentStep,
      ctx.workingSlots
    );

    const action: ActionOutput = aiAction.plan(
      intent,
      ctx.workingSlots,
      navigation.targetStep || ctx.currentStep,
      ctx.activeDraft?.confirmationState === "CONFIRMATION_REQUESTED",
    );

    latencies.navigationLatencyMs = Math.round(performance.now() - stage3Start);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 4: AUTHORIZE (Safety Engine, Zero-PIN, Security Invariants)
    // ─────────────────────────────────────────────────────────────────────────
    const stage4Start = performance.now();

    // INVARIANT_008: A caller can confirm only a persisted draft awaiting confirmation.
    const isAffirmative = (
      aiUnderstanding.checkConfirmation(ctx.rawInput) ||
      ctx.rawInput.toLowerCase().trim() === "yes" ||
      ctx.rawInput.toLowerCase().trim() === "aane" ||
      ctx.rawInput.trim() === "1"
    );
    const clientConfirmed = isAffirmative && ctx.activeDraft?.confirmationState === "CONFIRMATION_REQUESTED";
    if (clientConfirmed) {
      if (ctx.activeDraft) {
        ctx.activeDraft.confirmationState = "CONFIRMED";
      }
    }

    // If this turn prepares a confirmation prompt for caller, mark draft as CONFIRMATION_REQUESTED
    if (ctx.activeDraft && (dialogueTypeIsConfirmation(intent, ctx.workingSlots) || navigation.targetStep === "confirm")) {
      if (ctx.activeDraft.confirmationState === "UNCONFIRMED") {
        ctx.activeDraft.confirmationState = "CONFIRMATION_REQUESTED";
      }
    }

    const safetyEvaluation = unifiedSafetyEngine.evaluate(
      ctx.sessionId,
      ctx.rawInput,
      action,
      ctx.activeDraft,
      ctx.workingSlots
    );

    const safety: SafetyOutput = {
      riskLevel: safetyEvaluation.riskLevel,
      requiresConfirmation: safetyEvaluation.requiresConfirmation,
      pinDetectedInVoice: safetyEvaluation.pinDetectedInVoice,
      blockedReason: safetyEvaluation.blockedReason,
      sanitized: safetyEvaluation.sanitized,
      piiMaskedInput: safetyEvaluation.piiMaskedInput,
      rateLimitExceeded: safetyEvaluation.rateLimitExceeded,
      failedAttemptsCount: safetyEvaluation.failedAttemptsCount,
      socialEngineeringAlert: safetyEvaluation.socialEngineeringAlert,
    };

    // If Zero-PIN violated or action not permitted, block execution
    if (!safetyEvaluation.isActionPermitted || safety.pinDetectedInVoice || safety.rateLimitExceeded) {
      action.isExecutable = false;
      action.type = safety.pinDetectedInVoice ? "BLOCK_ZERO_PIN" : "BLOCK_SECURITY_VIOLATION";
      action.requiresClientConfirmation = true;
    } else if (action.requiresClientConfirmation && !clientConfirmed) {
      action.isExecutable = false;
    }

    latencies.safetyCheckLatencyMs = Math.round(performance.now() - stage4Start);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 5: EXECUTE (Deterministic Tool Registry & Financial Services)
    // ─────────────────────────────────────────────────────────────────────────
    const stage5Start = performance.now();

    if (action.isExecutable && action.tool !== "none") {
      const isTransferTool = action.tool === "execute_transfer" || action.tool === "momo_execute_transfer";

      let toolResult = await unifiedToolRegistry.execute({
        tool: action.tool,
        sessionId: ctx.sessionId,
        params: action.params,
        draft: ctx.activeDraft,
        clientConfirmed,
      });

      if (isTransferTool && toolResult.success) {
        const data = toolResult.data || {};
        const authoritative = financialPolicy.isAuthoritativeCompletion({
          status: data.status,
          source: toolResult.source,
          financialTransactionId: data.financialTransactionId,
        });
        if (!authoritative) {
          toolResult = {
            ...toolResult,
            success: false,
            error: "FINANCIAL_TRUTH_UNKNOWN: transfer result lacks authoritative provider completion evidence.",
          };
        }
      }

      action.executedResult = toolResult;

      // Update working balance if balance inquiry tool returned data
      if ((action.tool === "get_balance" || action.tool === "momo_get_balance") && toolResult.success && toolResult.data) {
        ctx.workingSlots.availableBalance = toolResult.data.availableBalance;
      }

      // Record only provider-evidenced completion in transactional memory.
      if (isTransferTool && toolResult.success) {
        const txRef = toolResult.data?.referenceId;
        await unifiedMemory.recordTransaction(ctx.sessionId, {
          referenceId: txRef || toolResult.data.financialTransactionId,
          type: "TRANSFER",
          amount: Number(ctx.workingSlots.amount),
          recipientPhone: ctx.workingSlots.recipientPhone || "",
          recipientName: ctx.workingSlots.recipientName || "",
          network: ctx.workingSlots.network!,
          status: "COMPLETED",
          source: toolResult.source,
        });
      }
    }

    latencies.actionPlanningLatencyMs = Math.round(performance.now() - stage5Start);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 6: RESPOND (Dialogue Generation & Fact Verification)
    // ─────────────────────────────────────────────────────────────────────────
    const stage6Start = performance.now();

    let dialogue: DialogueOutput = aiDialogue.generate(
      ctx.sessionId,
      intent,
      ctx.workingSlots,
      ctx.detectedLanguage,
      input.userProfile,
      isCorrection
    );

    const transferAttempted = action.tool === "execute_transfer" || action.tool === "momo_execute_transfer";
    if (transferAttempted && action.executedResult && !action.executedResult.success) {
      dialogue = {
        type: "ERROR_RECOVERY",
        response: ctx.detectedLanguage === "tw" || ctx.detectedLanguage === "ak"
          ? "Mepa wo kyɛw, mantumi anhwɛ sɛ sika no akɔ. Hwɛ wo MoMo akontaabu anaa frɛ wo network no ansa na wosan sɔ bio."
          : "I could not verify that the transfer completed. Please check your MoMo account or contact your provider before trying again.",
        promptLanguage: ctx.detectedLanguage,
        needsClarification: false,
      };
    }

    // Spoken PIN Educational Override
    if (safety.pinDetectedInVoice) {
      dialogue = {
        type: "ZERO_PIN_SECURITY_ALERT",
        response: ctx.detectedLanguage === "tw" || ctx.detectedLanguage === "ak"
          ? "Yɛmfa wo MoMo PIN wɔ fon ano. Mepa wo kyɛw, hwɛ wo fon screen na bɔ wo PIN wɔ hɔ pɛpɛɛpɛ."
          : ctx.detectedLanguage === "en-ak"
          ? "Never speak your MoMo PIN on a call! Please check your phone screen na bɔ wo PIN wɔ hɔ."
          : "Never speak your MoMo PIN on a call. Please check your phone screen to enter your PIN securely.",
        promptLanguage: ctx.detectedLanguage,
        needsClarification: false,
      };
    } else if (safety.rateLimitExceeded) {
      dialogue = {
        type: "ERROR_RECOVERY",
        response: ctx.detectedLanguage === "tw" || ctx.detectedLanguage === "ak"
          ? "Woabɔ nsaeɛ no boro so. Mepa wo kyɛw, gyina kakra na san yɛ bio akyire yi."
          : "Security threshold reached. For your protection, this session has been locked. Please try again later.",
        promptLanguage: ctx.detectedLanguage,
        needsClarification: false,
      };
    }

    // Ambiguity / Low Confidence check
    if (confidence < AI_CONFIG.confidenceThresholds.low || reasoning.ambiguity.isAmbiguous) {
      dialogue.needsClarification = true;
      dialogue.type = "ERROR_RECOVERY";
      dialogue.clarificationOptions = ["Send Money", "Check Balance", "Pay Bill"];
    }

    // Interrupted Task Resumption Check
    if (intent === "CHECK_BALANCE") {
      const interruptedTask = unifiedMemory.getInterruptedTask(ctx.sessionId) || unifiedMemory.getActiveTask(ctx.sessionId);
      if (interruptedTask?.resumptionPrompt) {
        const prompt = ctx.detectedLanguage === "tw" ? interruptedTask.resumptionPrompt.twi : interruptedTask.resumptionPrompt.en;
        dialogue.response = `${dialogue.response} ${prompt}`;
      }
    }

    latencies.dialogueLatencyMs = Math.round(performance.now() - stage6Start);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 7: SPEECH PLANNING & TTS
    // ─────────────────────────────────────────────────────────────────────────
    const stage7Start = performance.now();

    const speech: SpeechOutput = aiSpeech.plan(
      dialogue.response,
      ctx.detectedLanguage,
      input.userProfile,
      safety.pinDetectedInVoice
    );

    latencies.speechPlanningLatencyMs = Math.round(performance.now() - stage7Start);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 8: REMEMBER (Durable Persistence & Memory Update)
    // ─────────────────────────────────────────────────────────────────────────
    const stage8Start = performance.now();

    // 1. Update working memory slots
    unifiedMemory.updateWorkingSlots(ctx.sessionId, ctx.workingSlots);

    // 2. Record turn in episodic and vector semantic store
    await unifiedMemory.recordTurn(ctx.sessionId, {
      role: "user",
      rawInput: ctx.rawInput,
      sanitizedInput: safety.piiMaskedInput,
      detectedLanguage: ctx.detectedLanguage,
      intent,
      slots: ctx.workingSlots,
      response: dialogue.response,
      screen: navigation.targetScreen || ctx.currentScreen,
      step: navigation.targetStep || ctx.currentStep,
    });

    // 3. Persist session state durably
    await unifiedMemory.saveSession({
      sessionId: ctx.sessionId,
      userId: input.userProfile?.userId,
      phoneNumber: input.userProfile?.phoneNumber,
      language: ctx.detectedLanguage,
      currentScreen: navigation.targetScreen || ctx.currentScreen,
      currentStep: navigation.targetStep || ctx.currentStep,
      slots: ctx.workingSlots,
      lastActiveTimestamp: Date.now(),
      turnCount: (session.turnCount || 0) + 1,
      interruptedTask: unifiedMemory.getActiveTask(ctx.sessionId) || undefined,
    });

    latencies.memoryRetrievalLatencyMs = Math.round(performance.now() - stage8Start);
    latencies.totalLatencyMs = Math.round(performance.now() - totalStart);

    const cognitiveState: CognitiveState = safety.pinDetectedInVoice
      ? "AUTH_HANDOFF"
      : action.requiresClientConfirmation
      ? "CONFIRMING"
      : dialogue.needsClarification
      ? "CLARIFYING"
      : "IDLE";

    const performanceBreakdown: PerformanceBreakdown = {
      totalLatencyMs: latencies.totalLatencyMs,
      normalizationLatencyMs: latencies.normalizationLatencyMs || 1,
      memoryRetrievalLatencyMs: latencies.memoryRetrievalLatencyMs || 1,
      understandingLatencyMs: latencies.understandingLatencyMs || 1,
      navigationLatencyMs: latencies.navigationLatencyMs || 1,
      actionPlanningLatencyMs: latencies.actionPlanningLatencyMs || 1,
      safetyCheckLatencyMs: latencies.safetyCheckLatencyMs || 1,
      dialogueLatencyMs: latencies.dialogueLatencyMs || 1,
      speechPlanningLatencyMs: latencies.speechPlanningLatencyMs || 1,
    };

    // Observability Trace
    aiTrace.log({
      traceId: `tr_${Date.now()}`,
      sessionId: ctx.sessionId,
      timestamp: Date.now(),
      input: ctx.rawInput,
      normalizedInput: ctx.normalizedInput,
      detectedLanguage: ctx.detectedLanguage,
      intent,
      confidence,
      slots: ctx.workingSlots,
      navigationDecision: navigation.action,
      actionRequested: action.tool,
      riskLevel: action.riskLevel,
      safetyFlag: safety.pinDetectedInVoice,
      response: dialogue.response,
      speechVoiceProfile: speech.voiceProfile,
      latencies: {
        totalMs: performanceBreakdown.totalLatencyMs,
      },
    });

    return {
      sessionId: ctx.sessionId,
      state: cognitiveState,
      intent,
      confidence,
      language: ctx.detectedLanguage,
      entities: ctx.workingSlots,
      dialogue,
      navigation,
      action,
      safety,
      speech,
      performance: performanceBreakdown,
      sessionState: {
        breadcrumb: navigation.breadcrumb,
        turnCount: (session.turnCount || 0) + 1,
        activeTask: unifiedMemory.getActiveTask(ctx.sessionId)?.intent,
        suspendedTasksCount: 0,
      },
    };
  }
}

function dialogueTypeIsConfirmation(intent: IntentName, slots: EntitySlotMap): boolean {
  return intent === "SEND_MONEY" && Boolean(slots.amount && slots.recipientPhone && slots.network);
}

export const aiEngine = new AiEngine();
