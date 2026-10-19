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
  TranscriptFinal,
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
import { cognitiveRouter } from "../providers/CognitiveRouter";
import { eventBus } from "../../services/eventBus";
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
  interruptedTask: TaskState | null;
  activeDraft: TransactionDraft | null;
  recentTurns: ConversationTurnRecord[];
  semanticMemoryContext: ConversationTurnRecord[];
  frequentContacts: Array<{ name: string; phone: string; network?: string; count: number }>;
  userPreferences: any;
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
    let speechRecognition: TranscriptFinal | undefined;

    // Stage 1 Audio Ingestion: If audio buffer supplied and text is empty, transcribe audio
    if (!rawUtterance.trim() && input.audioBuffer) {
      try {
        speechRecognition = await audioIngestor.transcribe(
          input.audioBuffer,
          input.mimeType || "audio/wav",
          input.currentStep,
          input.language
        );
        rawUtterance = speechRecognition.text;
      } catch (err: any) {
        console.warn("[AiEngine] Audio ingestion/transcription notice:", err.message);
      }
    }

    // Zero-PIN Pre-Masking: Mask credentials before anything else
    const piiMaskedInput = unifiedSafetyEngine.maskCredentials(rawUtterance);

    // Normalize spoken numbers (digits & Akan words), currency tokens, and phone numbers
    const normalizedInput = inputNormalizer.normalize(piiMaskedInput);

    // Language & Code-Switch Detection
    const recognizedLanguage = speechRecognition?.language?.toLowerCase();
    const asrLanguage: AiLanguage | undefined = recognizedLanguage === "tw" || recognizedLanguage === "twi" || recognizedLanguage === "ak"
      ? "tw"
      : recognizedLanguage === "en" || recognizedLanguage === "eng" || recognizedLanguage === "english"
      ? "en"
      : undefined;
    const detectedLanguage: AiLanguage = input.language && input.language !== "unknown"
      ? input.language
      : asrLanguage || languageDetector.detect(normalizedInput);

    // Independent memory reads run together so durable storage latency is not additive.
    const userIdFromInput = input.userProfile?.userId;
    const [loadedSession, history, pastTransactions, inputPreferences] = await Promise.all([
      unifiedMemory.getSession(input.sessionId),
      unifiedMemory.getConversationHistory(input.sessionId),
      unifiedMemory.listTransactions(input.sessionId).catch(() => []),
      userIdFromInput
        ? unifiedMemory.getPreferences(userIdFromInput).catch(() => null)
        : Promise.resolve(null),
    ]);

    let session = loadedSession;
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
    const interruptedTask = unifiedMemory.getInterruptedTask(input.sessionId);
    const activeDraft = activeTask?.draft || null;
    // Embedding search can involve a remote call; only retrieve old turns when asked for them.
    let semanticMemoryContext: ConversationTurnRecord[] = [];
    if (shouldRetrieveSemanticMemory(normalizedInput, history.length)) {
      try {
        semanticMemoryContext = await unifiedMemory.searchSemanticMemory(input.sessionId, normalizedInput, 3);
      } catch (err: any) {
        // Graceful fallback to empty
      }
    }

    const contactMap = new Map<string, { name: string; phone: string; network?: string; count: number }>();
    for (const tx of pastTransactions) {
      if (tx.recipientName && tx.recipientPhoneMasked) {
        const key = tx.recipientName.toLowerCase().trim();
        const existing = contactMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          contactMap.set(key, {
            name: tx.recipientName,
            phone: tx.recipientPhoneMasked,
            network: tx.network,
            count: 1,
          });
        }
      }
    }
    const frequentContacts = Array.from(contactMap.values()).sort((a, b) => b.count - a.count);

    // Hydrate user profile preferences
    const userId = userIdFromInput || session.userId;
    let userPreferences = inputPreferences;
    if (userId && userId !== userIdFromInput) {
      try {
        userPreferences = await unifiedMemory.getPreferences(userId);
      } catch (err: any) {
        // Graceful fallback
      }
    }

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
      interruptedTask,
      activeDraft,
      recentTurns: history.slice(-4),
      semanticMemoryContext,
      frequentContacts,
      userPreferences,
    };

    latencies.normalizationLatencyMs = Math.round(performance.now() - stage1Start);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 2: UNDERSTAND (Canonical Cognitive Gateway Routing)
    // ─────────────────────────────────────────────────────────────────────────
    const stage2Start = performance.now();
    eventBus.emitEvent("ai.turn.received", ctx.sessionId, {
      rawInput: ctx.rawInput,
      channel: ctx.channel,
      currentStep: ctx.currentStep,
    });

    const cognitiveDecision = await cognitiveRouter.routeUnderstanding({
      utterance: ctx.normalizedInput,
      languageHint: ctx.detectedLanguage,
      currentScreen: ctx.currentScreen,
      currentStep: ctx.currentStep,
      existingSlots: ctx.workingSlots,
      recentTurns: ctx.recentTurns.map(t => ({ role: t.role, text: t.sanitizedInput })),
      semanticMemoryContext: ctx.semanticMemoryContext.map(t => ({ text: t.sanitizedInput })),
      frequentContacts: ctx.frequentContacts,
      channel: ctx.channel,
      sessionId: ctx.sessionId,
      executionMode: input.executionMode,
    });

    const reasoning = cognitiveDecision.response;
    const intent: IntentName = reasoning.intent;
    const confidence = reasoning.confidence;

    eventBus.emitEvent("ai.intent.detected", ctx.sessionId, {
      intent,
      confidence,
      entities: reasoning.entities,
      routingDecision: cognitiveDecision.metrics.routingDecision,
      providerUsed: cognitiveDecision.metrics.providerUsed,
    });

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

    const audioQualityStatus = speechRecognition?.audioQuality?.status;
    const reportedLowAsrConfidence =
      (speechRecognition?.confidenceSource === "provider" || speechRecognition?.confidenceSource === "calibrated") &&
      speechRecognition.confidence !== null &&
      speechRecognition.confidence !== undefined &&
      speechRecognition.confidence < AI_CONFIG.confidenceThresholds.medium;
    const requiresAudioRepeat = Boolean(
      speechRecognition &&
      (speechRecognition.pinDiscarded ||
        (action.riskLevel !== "LOW" &&
          (!speechRecognition.text.trim() ||
            audioQualityStatus === "NO_SPEECH" ||
            audioQualityStatus === "LOW_AUDIO_QUALITY" ||
            audioQualityStatus === "CORRUPT_AUDIO" ||
            reportedLowAsrConfidence)))
    );

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
    const allowToolExecution = input.executionPolicy !== "UNDERSTAND_ONLY";
    const clientConfirmed = allowToolExecution && !requiresAudioRepeat && isAffirmative && ctx.activeDraft?.confirmationState === "CONFIRMATION_REQUESTED";

    // If this turn prepares a confirmation prompt for caller, mark draft as CONFIRMATION_REQUESTED
    if (allowToolExecution && !requiresAudioRepeat && ctx.activeDraft && (dialogueTypeIsConfirmation(intent, ctx.workingSlots) || navigation.targetStep === "confirm")) {
      if (ctx.activeDraft.confirmationState === "UNCONFIRMED") {
        ctx.activeDraft.confirmationState = "CONFIRMATION_REQUESTED";
      }
      unifiedMemory.saveDraft(ctx.sessionId, ctx.activeDraft);
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

    if (requiresAudioRepeat) {
      action.isExecutable = false;
      action.requiresClientConfirmation = true;
      action.type = "ASK_REPEAT_UNCLEAR_AUDIO";
      safety.blockedReason = speechRecognition?.pinDiscarded
        ? "AUDIO_PIN_DISCARDED"
        : "AUDIO_UNCERTAIN_REQUIRES_REPEAT";
    }

    // If Zero-PIN violated or action not permitted, block execution
    if (!safetyEvaluation.isActionPermitted || safety.pinDetectedInVoice || safety.rateLimitExceeded) {
      action.isExecutable = false;
      action.type = safety.pinDetectedInVoice ? "BLOCK_ZERO_PIN" : "BLOCK_SECURITY_VIOLATION";
      action.requiresClientConfirmation = true;
    } else if (action.requiresClientConfirmation && !clientConfirmed) {
      action.isExecutable = false;
    } else if (clientConfirmed && ctx.activeDraft) {
      ctx.activeDraft.confirmationState = "CONFIRMED";
      unifiedMemory.saveDraft(ctx.sessionId, ctx.activeDraft);
    }

    if (!allowToolExecution) action.isExecutable = false;

    latencies.safetyCheckLatencyMs = Math.round(performance.now() - stage4Start);

    // ─────────────────────────────────────────────────────────────────────────
    // STAGE 5: EXECUTE (Deterministic Tool Registry & Financial Services)
    // ─────────────────────────────────────────────────────────────────────────
    const stage5Start = performance.now();

    if (allowToolExecution && action.isExecutable && action.tool !== "none") {
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

    if (requiresAudioRepeat) {
      dialogue = {
        type: "ERROR_RECOVERY",
        response: speechRecognition?.pinDiscarded
          ? (ctx.detectedLanguage === "tw" || ctx.detectedLanguage === "ak"
            ? "Mfa wo MoMo PIN nka wɔ frɛ yi mu. Fa wo handset so pene so."
            : "Do not say your Mobile Money PIN on this call. Approve securely on your handset.")
          : (ctx.detectedLanguage === "tw" || ctx.detectedLanguage === "ak"
            ? "Manteɛ no antɔ asom yie. Yɛsrɛ wo, san ka nsɛm no anaa fa phone keypad no di dwuma."
            : "I did not hear that clearly enough to act safely. Please repeat it or use the phone keypad."),
        promptLanguage: ctx.detectedLanguage,
        needsClarification: true,
        clarificationOptions: ["Repeat", "Use keypad"],
      };
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

    // 1. Update working memory slots synchronously
    unifiedMemory.updateWorkingSlots(ctx.sessionId, ctx.workingSlots);

    // 2. Record turn in episodic and vector semantic store asynchronously in background
    queueMicrotask(() => {
      unifiedMemory.recordTurn(ctx.sessionId, {
        role: "user",
        rawInput: ctx.rawInput,
        sanitizedInput: safety.piiMaskedInput,
        detectedLanguage: ctx.detectedLanguage,
        intent,
        slots: ctx.workingSlots,
        response: dialogue.response,
        screen: navigation.targetScreen || ctx.currentScreen,
        step: navigation.targetStep || ctx.currentStep,
      }).catch((err) => {
        console.warn("[AiEngine] Background turn indexing notice:", err.message);
      });
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
      input: ctx.sanitizedInput,
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
      success: true,
      sessionId: ctx.sessionId,
      state: cognitiveState,
      cognitiveState: {
        intent,
        workingSlots: ctx.workingSlots,
        language: ctx.detectedLanguage,
        state: cognitiveState,
      },
      intent,
      confidence,
      language: ctx.detectedLanguage,
      speechRecognition: speechRecognition ? {
        confidence: speechRecognition.confidence,
        confidenceSource: speechRecognition.confidenceSource,
        provider: speechRecognition.provider,
        providerAttempted: speechRecognition.providerAttempted,
        fallbackUsed: speechRecognition.fallbackUsed,
        pinDiscarded: speechRecognition.pinDiscarded,
        language: speechRecognition.language,
        audioQuality: speechRecognition.audioQuality,
      } : undefined,
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

export function shouldRetrieveSemanticMemory(text: string, historyCount: number): boolean {
  if (historyCount <= 0) return false;
  return /\b(?:same|usual|last(?:\s+(?:time|one|recipient|person))?|previous(?:ly)?|remember|before|again|him|her|them|his|hers)\b|\b(?:that|send\s+it\s+to)\s+(?:person|number|recipient|contact|it|him|her|them)\b/i.test(text);
}

export const aiEngine = new AiEngine();
