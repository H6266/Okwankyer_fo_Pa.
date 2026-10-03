/**
 * Ɔkwankyerɛfo Pa - Deterministic Central AI Cognitive Engine (aiEngine.ts)
 *
 * Single, unified orchestrator receiving inputs across VOICE, DTMF, TEXT, SIMULATOR
 * and producing comprehensive outputs across all 10 deterministic subsystems:
 *
 * 1. Ultra-Fast Input Normalization (<5ms)
 * 2. Intelligent Persistent Memory with ANN Lookup (<10ms)
 * 3. Deterministic Smart Understanding & Bayesian Intent Scoring (<15ms)
 * 4. Context-Aware Hierarchical Navigation (<5ms)
 * 5. Safety-First Action Planning & Failure Prediction (<10ms)
 * 6. Zero-PIN & Social Engineering Safety Gate (<8ms)
 * 7. Culturally Grounded Dialogue Generation (<20ms)
 * 8. Authentic Ghanaian Speech & Voice Planning (<10ms)
 * 9. Fast & Reliable Session Persistence (LRU, 30m TTL, Recovery)
 * 10. Performance Telemetry (<80ms total latency target)
 */

import {
  AiLanguage,
  AiProcessInput,
  AiProcessResult,
  EntitySlotMap,
  IntentName,
  PerformanceBreakdown,
} from "./aiTypes";
import { inputProcessor } from "../perception/inputProcessor";
import { inputNormalizer } from "../perception/inputNormalizer";
import { languageDetector } from "../perception/languageDetector";
import { aiMemory } from "./aiMemory";
import { aiUnderstanding } from "./aiUnderstanding";
import { aiNavigation } from "./aiNavigation";
import { aiAction } from "./aiAction";
import { aiSafety } from "./aiSafety";
import { aiDialogue } from "./aiDialogue";
import { aiSpeech } from "./aiSpeech";
import { sessionMemoryBridge } from "../memory/sessionMemoryBridge";
import { aiTrace } from "../observability/aiTrace";

export class AiEngine {
  /**
   * Central orchestrator for all conversational, voice, DTMF, and IVR interactions.
   */
  public async process(input: AiProcessInput): Promise<AiProcessResult> {
    const totalStart = performance.now();

    // =========================================================================
    // SYSTEM 1: ULTRA-FAST INPUT NORMALIZATION (<5ms)
    // =========================================================================
    const normStart = performance.now();

    // Pre-mask credentials before any perception or model exposure
    const rawUtterance = input.input || "";
    const piiPreMasked = aiSafety.maskCredentials(rawUtterance);

    // Normalize spoken numbers, DTMF, currency tokens
    const normalizedUtterance = inputNormalizer.normalize(piiPreMasked);

    // Instant zero-model-latency language detection
    const detectedLanguage: AiLanguage = input.language && input.language !== "unknown"
      ? input.language
      : languageDetector.detect(normalizedUtterance);

    const normalizationLatencyMs = Math.round(performance.now() - normStart);

    // =========================================================================
    // SYSTEM 9: SESSION RECOVERY & HYDRATION
    // =========================================================================
    let cachedSession = sessionMemoryBridge.getSession(input.sessionId);
    if (!cachedSession) {
      cachedSession = sessionMemoryBridge.saveSession(input.sessionId, {
        language: detectedLanguage,
        currentScreen: input.currentScreen || "HOME",
        currentStep: input.currentStep || "welcome",
        slots: input.transactionState ? {
          amount: input.transactionState.amount,
          recipientPhone: input.transactionState.recipientPhone,
          recipientName: input.transactionState.recipientName,
          network: (input.transactionState.network as any) || null,
        } : {},
      });
    }

    const currentScreen = input.currentScreen || cachedSession.currentScreen || "HOME";
    const currentStep = input.currentStep || cachedSession.currentStep || "welcome";

    // =========================================================================
    // SYSTEM 2: COGNITIVE MEMORY RETRIEVAL (<10ms via ANN)
    // =========================================================================
    const memStart = performance.now();
    const retrievedMemory = aiMemory.retrieve(
      input.sessionId,
      normalizedUtterance,
      input.userProfile?.userId
    );

    // Merge active slots from session, input, and memory
    let accumulatedSlots: EntitySlotMap = {
      ...(cachedSession.slots || {}),
      ...(retrievedMemory.activeSlots || {}),
      ...(input.transactionState ? {
        amount: input.transactionState.amount ?? cachedSession.slots.amount,
        recipientPhone: input.transactionState.recipientPhone ?? cachedSession.slots.recipientPhone,
        recipientName: input.transactionState.recipientName ?? cachedSession.slots.recipientName,
        network: (input.transactionState.network as any) ?? cachedSession.slots.network,
      } : {}),
    };

    const memoryRetrievalLatencyMs = Math.round(performance.now() - memStart);

    // =========================================================================
    // SYSTEM 3: DETERMINISTIC SMART UNDERSTANDING & BAYESIAN SCORING (<15ms)
    // =========================================================================
    const underStart = performance.now();
    const historyIntents = aiMemory.getTurnHistory(input.sessionId).map((t) => ({ intent: t.intent }));

    const understanding = aiUnderstanding.understand(
      normalizedUtterance,
      currentStep,
      accumulatedSlots,
      historyIntents
    );

    const intent: IntentName = understanding.intent;
    const confidence = understanding.confidence;
    accumulatedSlots = { ...accumulatedSlots, ...understanding.entities };

    // If user provided a correction, record into intelligent memory
    if (understanding.isCorrection && understanding.correctionDetail) {
      aiMemory.recordCorrection(
        input.sessionId,
        understanding.correctionDetail.field,
        understanding.correctionDetail.oldValue,
        understanding.correctionDetail.newValue,
        understanding.correctionDetail.reason
      );
    }

    // Interruption Handling: user asks to check balance mid-transfer
    if (understanding.isInterruption) {
      aiMemory.interruptWithTask(input.sessionId, intent);
    } else if (intent === "SEND_MONEY" && !aiMemory.getActiveTask(input.sessionId)) {
      aiMemory.setPrimaryTask(input.sessionId, "SEND_MONEY", accumulatedSlots, currentStep);
    }

    const understandingLatencyMs = Math.round(performance.now() - underStart);

    // =========================================================================
    // SYSTEM 4: CONTEXT-AWARE HIERARCHICAL NAVIGATION (<5ms)
    // =========================================================================
    const navStart = performance.now();
    const navigation = aiNavigation.plan(
      input.sessionId,
      intent,
      currentScreen,
      currentStep,
      accumulatedSlots
    );
    const navigationLatencyMs = Math.round(performance.now() - navStart);

    // =========================================================================
    // SYSTEM 5: SAFETY-FIRST ACTION PLANNING (<10ms)
    // =========================================================================
    const actStart = performance.now();
    const action = aiAction.plan(intent, accumulatedSlots, navigation.targetStep || currentStep);
    const actionPlanningLatencyMs = Math.round(performance.now() - actStart);

    // =========================================================================
    // SYSTEM 6: ZERO-PIN & FRAUD SAFETY GATE (<8ms)
    // =========================================================================
    const safeStart = performance.now();
    const safety = aiSafety.evaluate(input.sessionId, rawUtterance, action, accumulatedSlots);

    // Unhackable Zero-PIN Enforcement: If PIN is spoken, block immediately
    if (safety.pinDetectedInVoice) {
      action.isExecutable = false;
      action.type = "BLOCK_ZERO_PIN";
      action.riskLevel = "CRITICAL";
      action.requiresClientConfirmation = true;
    }

    // Rate Limit Enforced
    if (safety.rateLimitExceeded) {
      action.isExecutable = false;
      action.type = "BLOCK_RATE_LIMIT";
      action.riskLevel = "CRITICAL";
    }

    const safetyCheckLatencyMs = Math.round(performance.now() - safeStart);

    // =========================================================================
    // SYSTEM 7: CULTURALLY GROUNDED DIALOGUE GENERATION (<20ms)
    // =========================================================================
    const dialStart = performance.now();
    let dialogue = aiDialogue.generate(
      input.sessionId,
      intent,
      accumulatedSlots,
      detectedLanguage,
      input.userProfile,
      understanding.isCorrection
    );

    // Spoken PIN Alert Override: Patiently educate caller to use phone screen
    if (safety.pinDetectedInVoice) {
      dialogue = {
        type: "ZERO_PIN_SECURITY_ALERT",
        response: detectedLanguage === "tw" || detectedLanguage === "ak"
          ? "Yɛmfa wo MoMo PIN wɔ fon ano. Mepa wo kyɛw, hwɛ wo fon screen na bɔ wo PIN wɔ hɔ pɛpɛɛpɛ."
          : detectedLanguage === "en-ak"
          ? "Never speak your MoMo PIN on a call! Please check your phone screen na bɔ wo PIN wɔ hɔ."
          : "Never speak your MoMo PIN on a call. Please check your phone screen to enter your PIN securely.",
        promptLanguage: detectedLanguage,
        needsClarification: false,
      };
    } else if (safety.rateLimitExceeded) {
      dialogue = {
        type: "ERROR_RECOVERY",
        response: detectedLanguage === "tw" || detectedLanguage === "ak"
          ? "Woabɔ nsaeɛ no boro so. Mepa wo kyɛw, gyina kakra na san yɛ bio akyire yi."
          : "Security threshold reached. For your protection, this session has been locked. Please try again later.",
        promptLanguage: detectedLanguage,
        needsClarification: false,
      };
    }

    // Check if resuming from an interrupted task
    if (intent === "CHECK_BALANCE") {
      const activeTask = aiMemory.getActiveTask(input.sessionId);
      if (activeTask?.resumptionPrompt) {
        const prompt = detectedLanguage === "tw" ? activeTask.resumptionPrompt.twi : activeTask.resumptionPrompt.en;
        dialogue.response = `${dialogue.response} ${prompt}`;
      }
    }

    const dialogueLatencyMs = Math.round(performance.now() - dialStart);

    // =========================================================================
    // SYSTEM 8: AUTHENTIC GHANAIAN SPEECH & VOICE PLANNING (<10ms)
    // =========================================================================
    const spStart = performance.now();
    const speech = aiSpeech.plan(
      dialogue.response,
      detectedLanguage,
      input.userProfile,
      safety.pinDetectedInVoice
    );
    const speechPlanningLatencyMs = Math.round(performance.now() - spStart);

    // =========================================================================
    // POST-PROCESSING: MEMORY RECORDING & PERSISTENCE
    // =========================================================================
    // Record turn into episodic memory & ANN index
    aiMemory.recordTurn(input.sessionId, {
      role: "user",
      rawInput: rawUtterance,
      sanitizedInput: safety.piiMaskedInput,
      detectedLanguage,
      intent,
      slots: accumulatedSlots,
      response: dialogue.response,
      screen: navigation.targetScreen || currentScreen,
      step: navigation.targetStep || currentStep,
    });

    // Update active task slots in task memory
    aiMemory.updateActiveTaskSlots(input.sessionId, accumulatedSlots, navigation.targetStep);

    // Persist updated session state into SessionMemoryBridge LRU
    sessionMemoryBridge.saveSession(input.sessionId, {
      language: detectedLanguage,
      currentScreen: navigation.targetScreen || currentScreen,
      currentStep: navigation.targetStep || currentStep,
      slots: accumulatedSlots,
      interruptedTask: aiMemory.getActiveTask(input.sessionId) || undefined,
    });

    const totalLatencyMs = Math.round(performance.now() - totalStart);

    const performanceData: PerformanceBreakdown = {
      totalLatencyMs,
      normalizationLatencyMs,
      memoryRetrievalLatencyMs,
      understandingLatencyMs,
      navigationLatencyMs,
      actionPlanningLatencyMs,
      safetyCheckLatencyMs,
      dialogueLatencyMs,
      speechPlanningLatencyMs,
    };

    // Log structured diagnostic observability trace
    aiTrace.log({
      traceId: `tr_${Date.now()}`,
      sessionId: input.sessionId,
      timestamp: Date.now(),
      input: rawUtterance,
      normalizedInput: normalizedUtterance,
      detectedLanguage,
      intent,
      confidence,
      slots: accumulatedSlots,
      navigationDecision: navigation.action,
      actionRequested: action.tool,
      riskLevel: action.riskLevel,
      safetyFlag: safety.pinDetectedInVoice,
      response: dialogue.response,
      speechVoiceProfile: speech.voiceProfile,
      latencies: {
        totalMs: totalLatencyMs,
      },
    });

    return {
      sessionId: input.sessionId,
      intent,
      confidence,
      language: detectedLanguage,
      entities: accumulatedSlots,
      dialogue,
      navigation,
      action,
      safety,
      speech,
      performance: performanceData,
      sessionState: {
        breadcrumb: navigation.breadcrumb,
        turnCount: aiMemory.getTurnHistory(input.sessionId).length,
        activeTask: aiMemory.getActiveTask(input.sessionId)?.intent,
        suspendedTasksCount: 0,
      },
    };
  }
}

export const aiEngine = new AiEngine();
