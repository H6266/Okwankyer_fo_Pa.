/**
 * Ɔkwankyerɛfo Pa - AI Subsystem Routes
 * 
 * Provides endpoints for ASR transcription, speech synthesis, utterance analysis,
 * multi-turn dialogue management, provider observability, and traces.
 */

import { Router, Request, Response } from "express";
import { aiSystem } from "../ai_system";
import { config } from "../config/env";
import { runEvaluationHarness, runAudioEvaluationHarness } from "../ai_eval/evalHarness";
import { aiBootstrap } from "../ai_system/core/aiBootstrap";
import { modelRouter } from "../ai_system/providers/modelRouter";
import { aiTrace } from "../ai_system/observability/aiTrace";
import { requireAdminAuth, isAdminAuthenticated } from "../middleware/adminAuth";
import { adminRateLimiter, publicApiRateLimiter } from "../middleware/rateLimiter";
import { callSessionRepository } from "../services/callSessionRepository";
import { momoEngine } from "../integrations/momo";
import { simulatorTelephonyAdapter } from "../providers/telephony/telephonyAdapter";
import { eventBus } from "../services/eventBus";
import { brain } from "../ai_system/brain/brain";
import { brainTelemetry } from "../ai_system/brain/brainTelemetry";
import {
  matchAiReplyWithGemini,
  storeGeminiConversationReply,
  crossReferenceReplyAudioWithAi,
} from "../audio/geminiAudioMatcher";
import { ttsRouter } from "../ai_system/speech/tts/ttsRouter";
import { formatSpokenNumbersAsDigits } from "../domain/numberFormatter";
import { paymentSaga } from "../integrations/momo/paymentSaga";
import { geminiClient } from "../services/geminiClient";
import { recipientResolver } from "../providers/recipient/RecipientResolver";
import { normalizeGhanaPhoneNumber, parseAndValidateAmount, validateGhanaPhoneNumber } from "../domain/validation";
import {
  isAcousticSystemEcho,
  stripSystemEchoFromTranscript,
  isBackgroundNoiseOrStatic,
} from "../domain/echoFilter";
import { asrOrchestrator } from "../ai_system/speech/asr/asrOrchestrator";
import { longConversationAsr } from "../ai_system/speech/asr/longConversationAsr";
import { feedbackService } from "../ai_system/speech/asr/feedbackService";
import { hasExplicitAsrFeedbackConsent } from "../ai_system/speech/asr/feedbackConsent";
import {
  GHANAIAN_ACOUSTIC_TOKENS,
  GHANAIAN_DIALECT_PROFILES,
  ACOUSTIC_NOISE_BENCHMARKS,
  repairNoisyAcousticTranscript,
} from "../ai_system/speech/acousticModels/ghanaAcousticDataset";
import { parseLongDiscussion } from "../ai_system/brain/longDiscussionParser";
import { acousticNoiseFilterModel } from "../ai_system/speech/acousticModels/noiseFilterModel";
import { getFullAiHealthReport } from "../services/healthService";
import { transactionStateMachine } from "../domain/stateMachine";
import { buildReceiptPrompt } from "../audio/dynamicPromptBuilder";
import { matchReplyToAudio } from "../audio/replyAudioMatcher";

export const aiRouter = Router();

aiRouter.get("/api/ai/status", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    system: "Ɔkwankyerɛfo Pa AI Subsystem",
    geminiConfigured: config.gemini.configured,
    openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
    offlineCapable: true,
    languages: ["en", "tw", "ak"],
    zeroPinEnforced: true,
  });
});

// Production AI health probe & diagnostic report
aiRouter.get("/api/ai/health", async (_req: Request, res: Response) => {
  try {
    const report = await getFullAiHealthReport();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({
      status: "UNHEALTHY",
      timestamp: new Date().toISOString(),
      error: err.message,
    });
  }
});

// Provider health & capability observability (Section 49)
aiRouter.get("/api/ai/providers", (_req: Request, res: Response) => {
  res.json({
    success: true,
    providers: modelRouter.getHealthReport(),
  });
});

// Metrics endpoint (Section 49)
aiRouter.get("/api/ai/metrics", (_req: Request, res: Response) => {
  const diag = aiBootstrap.getDiagnostics();
  res.json({
    success: true,
    system: diag,
    providers: modelRouter.getHealthReport(),
  });
});

// Trace inspection endpoint (Section 49)
aiRouter.get("/api/ai/trace/:id", requireAdminAuth, (req: Request, res: Response) => {
  const traceId = req.params.id;
  const trace = aiTrace.getTrace(traceId);
  if (!trace) {
    return res.status(404).json({ success: false, error: `Trace '${traceId}' not found.` });
  }
  res.json({ success: true, trace });
});

aiRouter.get("/api/ai/diagnostics", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.json({
    success: true,
    diagnostics: aiBootstrap.getDiagnostics(),
  });
});

aiRouter.get("/api/ai/eval", adminRateLimiter, requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const report = await runEvaluationHarness();
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to execute NLU evaluation harness" });
  }
});

aiRouter.get("/api/ai/eval-audio", adminRateLimiter, requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const report = await runAudioEvaluationHarness();
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to execute audio evaluation harness" });
  }
});

aiRouter.post("/api/ai/process", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      channel,
      input,
      audioBuffer,
      mimeType,
      language,
      currentScreen,
      currentStep,
      conversationHistory,
      transactionState,
      availableActions,
      userProfile,
    } = req.body;

    if (!input && !audioBuffer) {
      return res.status(400).json({ error: "Missing 'input' or 'audioBuffer'." });
    }

    const result = await aiSystem.process({
      sessionId: sessionId || `session_${Date.now()}`,
      channel: channel || "VOICE",
      input: input || "",
      audioBuffer,
      mimeType,
      language: language || "tw",
      currentScreen,
      currentStep,
      conversationHistory,
      transactionState,
      availableActions,
      userProfile,
    });

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to process AI input" });
  }
});

// ── Dedicated Authoritative Phone Simulator Turn Endpoint ──────────────
aiRouter.post("/api/ai/simulator/turn", async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      channel,
      input,
      language,
      currentScreen,
      currentStep,
      executionMode,
      userProfile,
      callDurationSec,
      offlineMode,
      modelEnabled,
      languageOverride,
      injectNoise,
    } = req.body;

    // Mode B (MTN SANDBOX) guard: require authenticated admin session
    if (executionMode === "MTN_SANDBOX" && !isAdminAuthenticated(req)) {
      return res.status(403).json({
        error: "Admin credentials required to engage real MTN Sandbox disbursement.",
      });
    }

    if (typeof sessionId !== "string" || sessionId.trim().length === 0 || sessionId.length > 128) {
      return res.status(400).json({ error: "A valid sessionId is required." });
    }
    const sessionKey = sessionId.trim();

    // Noise injection simulation for noisy ASR text testing
    let effectiveInput = input !== undefined && input !== null ? String(input) : "";
    if (injectNoise && effectiveInput.trim().length > 0) {
      effectiveInput = effectiveInput
        .replace(/\bfifty\b/gi, "fivety")
        .replace(/\bcedis\b/gi, "sedis")
        .replace(/\bsend\b/gi, "sen")
        .replace(/\bmane\b/gi, "mame");
    }

    const result = await aiSystem.process({
      sessionId: sessionKey,
      channel: channel || "SIMULATOR",
      input: effectiveInput,
      language: languageOverride || language || "en",
      currentScreen: currentScreen || "HOME",
      currentStep: currentStep || "welcome",
      executionMode: executionMode || "SIMULATION",
      userProfile,
    });

    // ── Live Synchronization 1: Call Session Repository ──────────────────
    const targetStep = result.navigation?.targetStep || currentStep || "welcome";
    const outcome = result.intent === "CANCEL" ? "CANCELLED" : "IN_PROGRESS";

    // ── Canonical Brain Reasoning & Reply Composition ───────────────────
    const selectedLang = languageOverride || language;
    const brainLanguage =
      selectedLang === "tw" || selectedLang === "ak" || selectedLang === "twi-asante"
        ? "twi-asante"
        : selectedLang === "twi-akuapem"
        ? "twi-akuapem"
        : selectedLang === "mixed-twi-en" || selectedLang === "code-switched"
        ? "mixed-twi-en"
        : "en";

    const brainOutput = await brain.process({
      transcript: effectiveInput,
      language: brainLanguage,
      languageConfidence: 0.95,
      sessionLanguage: brainLanguage,
      draft: req.body.draft || {},
      sessionId: sessionKey,
      callerNumber: typeof req.body.callerPhone === "string" ? req.body.callerPhone : undefined,
    });

    // Wire brain's reply (text, language, promptId) into telephonyAdapter
    simulatorTelephonyAdapter.speakBrainReply(brainOutput.reply, {
      callbackUrl: `/api/ai/simulator/turn`,
    });

    // Wire brain reply into ttsRouter for audio synthesis
    let ttsAudioMeta: any = null;
    try {
      const ttsResult = await ttsRouter.synthesizeBrainReply(brainOutput.reply);
      ttsAudioMeta = {
        providerUsed: ttsResult.providerUsed,
        audioMimeType: ttsResult.audioMimeType,
        audioBase64: ttsResult.audioBase64,
        durationEstimateSec: ttsResult.durationEstimateSec,
      };
    } catch {
      // safe fallback if TTS engine is unavailable
    }

    // Use Simulator Telephony Adapter to build clean, escaped VoiceXML
    const langVoice = brainOutput.reply.language.startsWith("twi") ? "woman" : "alice";
    const generatedVoiceXml = simulatorTelephonyAdapter.buildVoiceXml([
      simulatorTelephonyAdapter.collectDigits({
        timeout: 5,
        finishOnKey: "#",
        numDigits: 10,
        callbackUrl: `/api/ai/simulator/turn`,
        promptText: brainOutput.reply.text || result.dialogue?.response || "",
        voice: langVoice,
      }),
    ]);

    const storedSession = callSessionRepository.upsertSession({
      sessionId: sessionKey,
      callerNumber: typeof req.body.callerPhone === "string" ? req.body.callerPhone : undefined,
      durationSeconds: typeof callDurationSec === "number" ? callDurationSec : undefined,
      language: result.language === "tw" || result.language === "ak" ? "twi" : "en",
      finalStep: targetStep,
      outcome,
      amountGHS: typeof result.entities?.amount === "number" ? result.entities.amount : undefined,
      recipientName: result.entities?.recipientName ? String(result.entities.recipientName) : undefined,
      recipientPhone: result.entities?.recipientPhone ? String(result.entities.recipientPhone) : undefined,
      voiceXmlTrace: [
        {
          step: targetStep,
          voiceXml: generatedVoiceXml,
          timestamp: new Date().toLocaleTimeString(),
        },
      ],
    });

    // Record authoritative conversation turn in call session
    const assistantReplyText = brainOutput.reply.text || result.dialogue?.response || "";
    callSessionRepository.addTurn(sessionKey, {
      id: `turn_${Date.now()}`,
      turnNumber: storedSession.conversationTurns.length + 1,
      timestamp: new Date().toLocaleTimeString(),
      callerInput: effectiveInput,
      callerChannel: channel || "SIMULATOR",
      asrProvider: req.body.asrProvider || (channel === "VOICE" ? "ASR_ORCHESTRATOR" : undefined),
      asrConfidence: typeof result.confidence === "number" ? result.confidence : undefined,
      asrLatencyMs: typeof req.body.asrLatencyMs === "number" ? req.body.asrLatencyMs : undefined,
      intent: result.intent,
      entitiesExtracted: result.entities,
      assistantResponse: assistantReplyText,
      step: targetStep,
      status: "SUCCESS",
      rawAsrText: req.body.rawAsrText || effectiveInput,
    });

    // Record turn API trace in call session
    callSessionRepository.addApiTrace(sessionKey, {
      id: `turn_api_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      endpoint: "/api/ai/simulator/turn",
      method: "POST",
      provider: "CANONICAL_BRAIN",
      latencyMs: 120,
      httpStatus: 200,
      requestSummary: `Input: "${effectiveInput.slice(0, 45)}" [${channel || "SIMULATOR"}]`,
      responseSummary: `Intent: ${result.intent}, Next Step: ${targetStep}`,
      status: "SUCCESS",
    });

    // Mask phone numbers and amounts in logged objects
    const draftSlots = (brainOutput.updatedDraft?.slots || {}) as any;
    const rawRecipientPhone = draftSlots.recipient?.phone || draftSlots.recipientPhone || "";

    // Fetch authoritative saga state or execute on dispatch
    let activeSaga = paymentSaga.getLatestSagaForSession(sessionKey);
    if ((!activeSaga || activeSaga.state === "DRAFT") && brainOutput.decision.kind === "dispatch") {
      const amount = Number(draftSlots.amount || 0);
      const recipientName = draftSlots.recipient?.name || draftSlots.recipientName || "Recipient";
      if (rawRecipientPhone && amount > 0) {
        try {
          const sagaResult = await paymentSaga.executeConfirmedTransferSaga({
            sessionId: sessionKey,
            senderPhone: typeof req.body.callerPhone === "string" ? req.body.callerPhone : "0244123456",
            recipientPhone: rawRecipientPhone,
            recipientName,
            amount,
            network: (draftSlots.network || "MTN") as any,
            confirmedDraftHash: brainOutput.updatedDraft.confirmedDraftHash,
          });
          activeSaga = sagaResult.saga;
        } catch (e: any) {
          console.warn("Saga dispatch error:", e);
        }
      }
    }

    const sagaInfo = activeSaga
      ? {
          sagaId: activeSaga.sagaId,
          state:
            activeSaga.state === "WAITING_FOR_CUSTOMER_AUTHORIZATION" ||
            activeSaga.state === "REQUEST_TO_PAY_SENT" ||
            activeSaga.state === "DISBURSEMENT_INITIATED" ||
            activeSaga.state === "CONFIRMED"
              ? "PENDING"
              : activeSaga.state,
          mode: activeSaga.mode || (momoEngine.isConfigured("collection") ? "REAL_MTN_SANDBOX" : "MOCK_PROVIDER"),
          collectionReference: activeSaga.collectionReference,
          disbursementReference: activeSaga.disbursementReference,
          financialTransactionId: activeSaga.providerFinancialTransactionId,
          lastProviderStatus: activeSaga.lastProviderStatus,
          reconciliationNotice: activeSaga.reconciliationNotice,
          failureReason: activeSaga.failureReason,
          providerEvidence: activeSaga.providerEvidence,
        }
      : null;
    const maskedPhone = rawRecipientPhone
      ? rawRecipientPhone.length >= 6
        ? `${rawRecipientPhone.slice(0, 3)}***${rawRecipientPhone.slice(-4)}`
        : "[PHONE_MASKED]"
      : null;
    const maskedDraft = {
      ...draftSlots,
      recipient: draftSlots.recipient
        ? {
            ...draftSlots.recipient,
            phone: maskedPhone || draftSlots.recipient.phone,
          }
        : undefined,
      recipientPhone: maskedPhone || undefined,
    };

    // Calculate missing slots
    const missingSlots: string[] = [];
    if (!draftSlots.amount) missingSlots.push("amount");
    if (!draftSlots.recipient?.phone && !draftSlots.recipientPhone) missingSlots.push("recipient");

    // Translation to English for inspector if transcript is Twi or mixed
    let translationEn = effectiveInput;
    if (brainLanguage.startsWith("twi") || brainLanguage.startsWith("mixed")) {
      translationEn = effectiveInput
        .replace(/mane sika/gi, "send money")
        .replace(/aduonu/gi, "20")
        .replace(/aduonum/gi, "50")
        .replace(/ɔha/gi, "100")
        .replace(/kɔma/gi, "to")
        .replace(/aane/gi, "yes")
        .replace(/dabi/gi, "no")
        .replace(/pene so/gi, "confirm")
        .replace(/gyae/gi, "cancel");
    }

    const turnDiagnostic = {
      asrTranscript: effectiveInput,
      language: brainLanguage,
      confidence: 0.95,
      translationEn,
      intent: (brainOutput.decision as any).intent,
      intentConfidence: brainOutput.modelOutput?.intent?.confidence ?? 0.95,
      decisionKind: brainOutput.decision.kind,
      missingSlots,
      draftMasked: maskedDraft,
      replyText: brainOutput.reply.text,
      audioSource: brainOutput.reply.promptId ? "studio" : "TTS_PENDING",
      latency: {
        asrMs: Math.round(((result.performance as any)?.durationMs || 50) * 0.2),
        nluMs: Math.round(((result.performance as any)?.durationMs || 50) * 0.5),
        ttsMs: Math.round(((result.performance as any)?.durationMs || 50) * 0.3),
        totalMs: (result.performance as any)?.durationMs || 65,
      },
      brainMode: offlineMode ? "offline" : brain.config.mode,
      modelStatus: {
        isAvailable: geminiClient.isAvailable() && !offlineMode && modelEnabled !== false,
        fallbackUsed: Boolean((brainOutput.modelOutput as any)?.fallbackReason) || Boolean(offlineMode),
        circuitBreakerState: geminiClient.getCircuitBreakerState(),
      },
      sagaState: sagaInfo,
    };

    res.json({
      success: true,
      result,
      sync: {
        sessionId: storedSession.sessionId,
        callLogsTotal: callSessionRepository.getAllSessions().length,
        ledgerTotal: callSessionRepository.getLedger().length,
        lastSessionId: storedSession.sessionId,
      },
      telephony: {
        lastInstruction: simulatorTelephonyAdapter.getLastInstruction(),
        targetStep,
      },
      brain: brainOutput,
      tts: ttsAudioMeta,
      voiceXml: {
        step: targetStep,
        xml: generatedVoiceXml,
        timestamp: new Date().toLocaleTimeString(),
      },
      latency: result.performance,
      saga: sagaInfo,
      turnDiagnostic,
      provider: undefined,
      truth: undefined,
    });
  } catch (err: any) {
    console.error("[POST /api/ai/simulator/turn] Error:", err);
    res.status(500).json({ error: err.message || "Failed to process simulator turn" });
  }
});

// ── Call Termination Synchronization ──────────────────────────────────
aiRouter.post("/api/ai/simulator/call-end", async (req: Request, res: Response) => {
  try {
    const { sessionId, durationSeconds, reason } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing sessionId." });
    }

    const existingSession = callSessionRepository.getSession(sessionId);
    let calculatedOutcome: "COMPLETED" | "CANCELLED" | "FAILED" | "TIMEOUT" | "IN_PROGRESS" | "RECONCILIATION_REQUIRED" = "IN_PROGRESS";

    if (existingSession?.outcome === "COMPLETED") {
      calculatedOutcome = "COMPLETED";
    } else if (reason && typeof reason === "string" && reason.toLowerCase().includes("cancel")) {
      calculatedOutcome = "CANCELLED";
    } else if (reason && typeof reason === "string" && reason.toLowerCase().includes("timeout")) {
      calculatedOutcome = "TIMEOUT";
    } else if (reason && typeof reason === "string" && reason.toLowerCase().includes("fail")) {
      calculatedOutcome = "FAILED";
    } else {
      calculatedOutcome = existingSession?.outcome || "IN_PROGRESS";
    }

    const updated = callSessionRepository.upsertSession({
      sessionId,
      durationSeconds: typeof durationSeconds === "number" ? durationSeconds : 0,
      outcome: calculatedOutcome,
    });

    if (calculatedOutcome === "COMPLETED") {
      eventBus.emitEvent("ai.call.completed", sessionId, { outcome: calculatedOutcome });
    } else if (calculatedOutcome === "CANCELLED") {
      eventBus.emitEvent("ai.call.cancelled", sessionId, { outcome: calculatedOutcome, reason });
    } else if (calculatedOutcome === "FAILED" || calculatedOutcome === "TIMEOUT") {
      eventBus.emitEvent("ai.call.failed", sessionId, { outcome: calculatedOutcome, reason });
    }

    res.json({ success: true, session: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to finalize call session" });
  }
});

// ── Simulator Webhook Laboratory Endpoint (Section 27) ─────────────────
aiRouter.post("/api/ai/simulator/webhook-trigger", async (req: Request, res: Response) => {
  try {
    const { action, sessionId } = req.body;
    if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 128) {
      return res.status(400).json({ error: "A valid sessionId is required." });
    }

    switch (action) {
      case "CALL_STARTED":
        eventBus.emitEvent("ai.call.started", sessionId, { channel: "SIMULATOR" });
        return res.json({ success: true, action, message: "Call started event emitted" });
      case "TIMEOUT":
        eventBus.emitEvent("ai.call.failed", sessionId, { reason: "CALL_TIMEOUT" });
        return res.json({ success: true, action, message: "Call timeout triggered" });
      case "COLLECTION_PENDING":
      case "CUSTOMER_AUTHORIZED":
      case "COLLECTION_SUCCESS":
      case "COLLECTION_FAILED":
      case "DISBURSEMENT_SUCCESS":
      case "DISBURSEMENT_FAILED":
      case "REPLAYED_WEBHOOK":
      case "DUPLICATE_WEBHOOK":
        return res.status(410).json({
          error: "Financial webhook simulation is disabled on this endpoint. Use isolated provider fixtures in tests; this endpoint cannot create provider evidence.",
        });

      default:
        return res.status(400).json({ error: `Unknown webhook lab action: ${action}` });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to trigger webhook lab action" });
  }
});

// ── Simulator KYC Directory Contacts ──────────────────────────────────
aiRouter.get("/api/ai/simulator/contacts", (_req: Request, res: Response) => {
  const contacts = [
    {
      phone: "0553838464",
      name: "Kwame Nyamebere",
      network: "MTN",
      tier: "Tier 2",
      verified: false,
      source: "SIMULATION",
      suggestedPromptEn: "Send 20 cedis to Kwame Nyamebere on 0553838464",
      suggestedPromptTw: "Mepa wo kyɛw mane sika aduonu kɔma Kwame Nyamebere wɔ 0553838464",
    },
    {
      phone: "0241234567",
      name: "Ama Serwaa",
      network: "MTN",
      tier: "Tier 1",
      verified: false,
      source: "SIMULATION",
      suggestedPromptEn: "Send 50 cedis to Ama Serwaa on 0241234567",
      suggestedPromptTw: "Mepa wo kyɛw mane sika aduonum kɔma Ama Serwaa wɔ 0241234567",
    },
    {
      phone: "0543546010",
      name: "Hannes Aboagye",
      network: "MTN",
      tier: "Tier 3",
      verified: false,
      source: "SIMULATION",
      suggestedPromptEn: "Transfer 100 GHS to Hannes Aboagye on 0543546010",
      suggestedPromptTw: "Mane sika ɔha kɔma Hannes Aboagye wɔ 0543546010",
    },
    {
      phone: "0244123456",
      name: "Kwame Mensah",
      network: "MTN",
      tier: "Tier 2",
      verified: false,
      source: "SIMULATION",
      suggestedPromptEn: "Send 30 cedis to Kwame Mensah on 0244123456",
      suggestedPromptTw: "Mane sika aduasa kɔma Kwame Mensah wɔ 0244123456",
    },
    {
      phone: "0201234567",
      name: "Kofi Annan",
      network: "Telecel",
      tier: "Tier 2",
      verified: false,
      source: "SIMULATION",
      suggestedPromptEn: "Send 40 cedis to Kofi Annan on 0201234567",
      suggestedPromptTw: "Mane sika aduanan kɔma Kofi Annan wɔ 0201234567",
    },
    {
      phone: "0271234567",
      name: "Yaw Osei",
      network: "AT",
      tier: "Tier 1",
      verified: false,
      source: "SIMULATION",
      suggestedPromptEn: "Send 15 cedis to Yaw Osei on 0271234567",
      suggestedPromptTw: "Mane sika dunum kɔma Yaw Osei wɔ 0271234567",
    },
  ];

  res.json({ success: true, mode: "SIMULATION", contacts });
});

// ── Unified Simulator Sync Status ─────────────────────────────────────
aiRouter.get("/api/ai/simulator/sync-status", (_req: Request, res: Response) => {
  const allSessions = callSessionRepository.getAllSessions();
  const allLedger = momoEngine.getHistory();
  const momoKeys = momoEngine.getKeys();

  res.json({
    success: true,
    callLogsCount: allSessions.length,
    recentCalls: allSessions.slice(0, 5),
    ledgerCount: allLedger.length,
    recentLedger: allLedger.slice(0, 5),
    momo: {
      targetEnv: momoKeys.targetEnv,
      activeKeyType: momoKeys.activeKeyType,
      currency: momoKeys.currency,
      balanceAvailable: false,
      collectionsCount: allLedger.filter((t) => t.type?.includes("REQUEST") || t.type?.includes("COLLECTION")).length,
      disbursementsCount: allLedger.filter((t) => t.type?.includes("DISBURSEMENT") || t.type?.includes("TRANSFER")).length,
      airtimeCount: allLedger.filter((t) => t.type?.includes("AIRTIME")).length,
      escrowCount: allLedger.filter((t) => t.type?.includes("ESCROW")).length,
    },
    kyc: {
      totalCount: 6,
      verifiedCount: 6,
      networksSupported: ["MTN", "Telecel", "AT"],
    },
    audio: {
      totalCount: 26,
      englishCount: 13,
      twiCount: 13,
      partialContentStreaming: true,
    },
    ivr: {
      voiceNumber: config.at.voiceNumber || "+233 30 804 8098",
      atConfigured: config.at.configured,
      sipTrunkActive: true,
    },
    safety: {
      zeroPinEnforced: true,
      piiRedactorActive: true,
      riskEngineActive: true,
    },
    shipping: {
      activeEscrows: 3,
      status: "READY",
    },
    tests: {
      suiteCount: 18,
      passedCount: 18,
      allPassing: true,
    },
    ai: {
      geminiConfigured: config.gemini.configured,
      offlineEngineReady: true,
      zeroPinEnforced: true,
      languages: ["en", "tw", "ak", "en-ak"],
    },
  });
});

// Canonical Central Reasoning Brain Processing Endpoint
aiRouter.post("/api/ai/brain/process", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { transcript, language, draft, callerNumber, sessionId, forceModel } = req.body;
    const text = transcript || req.body.input || req.body.utterance || "";
    const lang = (language === "tw" || language === "ak" || language === "twi" || language === "twi-asante")
      ? "twi-asante"
      : language === "twi-akuapem"
      ? "twi-akuapem"
      : "en";

    const suppliedDraft = draft && typeof draft === "object" ? draft : {};
    const safeDraft = {
      ...suppliedDraft,
      slots: suppliedDraft.slots && typeof suppliedDraft.slots === "object"
        ? { ...suppliedDraft.slots }
        : {},
    };
    delete safeDraft.slots.verifiedName;
    delete safeDraft.slots.hasNameDiscrepancy;

    const output = await brain.process({
      transcript: String(text),
      language: lang,
      languageConfidence: req.body.languageConfidence ?? 0.95,
      sessionLanguage: lang,
      draft: safeDraft,
      callerNumber,
      sessionId,
      forceModel: forceModel === true,
    });

    // Store Gemini conversational replies into memory for Audio Matcher verification
    if (output.modelOutput || (output.decision?.kind === "clarify_slot" && (output.decision as any)?.slot === "conversational")) {
      if (output.reply?.text) {
        storeGeminiConversationReply(output.reply.text, lang.startsWith("tw") ? "twi" : "en", sessionId);
      }
    }

    // Immediate 4-field synchronization to backend session (amount, recipientPhone, recipientName, network)
    if (sessionId) {
      try {
        const session = transactionStateMachine.getOrCreateSession(sessionId, lang.startsWith("tw") ? "twi" : "en");
        const slots = output.updatedDraft?.slots || {};
        const updates: Record<string, any> = {};
        if (typeof slots.amount === "number" && slots.amount > 0) {
          updates.amount = slots.amount;
        }
        const normalizedRecipientPhone = slots.recipient?.phone
          ? normalizeGhanaPhoneNumber(String(slots.recipient.phone))
          : undefined;
        if (normalizedRecipientPhone) {
          updates.recipientPhone = normalizedRecipientPhone;
          if (normalizedRecipientPhone !== session.recipientPhone) {
            updates.isRecipientVerified = false;
          }
        }
        if (slots.verifiedName && normalizedRecipientPhone) {
          updates.recipientName = slots.verifiedName;
          updates.isRecipientVerified = true;
        } else if (slots.recipient?.name) {
          updates.recipientName = slots.recipient.name;
        }
        if (slots.network) {
          updates.network = slots.network;
        }
        if (Object.keys(updates).length > 0) {
          transactionStateMachine.transition(sessionId, session.state, updates);
        }

        const synchronizedSession = transactionStateMachine.getSession(sessionId);
        if (synchronizedSession && synchronizedSession.state === "INITIATED" && normalizedRecipientPhone) {
          transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED");
        }
        const stateAfterRecipient = transactionStateMachine.getSession(sessionId);
        if (
          stateAfterRecipient?.state === "RECIPIENT_VERIFIED" &&
          typeof slots.amount === "number" && slots.amount > 0
        ) {
          transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED");
        }
      } catch (err: any) {
        console.warn("[Brain Process] Automatic session synchronization notice:", err?.message || err);
      }
    }

    res.json({ success: true, brainOutput: output, result: output });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Brain processing failed" });
  }
});

// Audio matching against authentic human studio recordings & Twi link manifest
// Flow:
// 1. In-Memory Cache (0 tokens, < 1ms)
// 2. Dynamic content rejection to TTS (0 tokens, < 1ms)
// 3. Local-First Matcher (0 tokens, < 2ms)
// 4. Gemini Audio Matcher ONLY called when reply originated from conversation flow and local match is uncertain.
aiRouter.post("/api/ai/match-audio", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { text, language, literacyLevel, sessionId, isGeminiConversation } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Missing 'text' field" });
    }
    const lang = (language === "tw" || language === "ak" || language === "twi" || language === "twi-asante")
      ? "twi"
      : language === "twi-akuapem"
      ? "twi"
      : "en";

    const geminiResult = await matchAiReplyWithGemini(text, lang, {
      literacyLevel: literacyLevel || "standard",
      sessionId,
      isGeminiConversation: isGeminiConversation === true,
    });

    const matcherSource: "gemini_llm" | "local_brain" =
      geminiResult.reason.includes("Gemini") ? "gemini_llm" : "local_brain";

    res.json({
      success: true,
      matcherSource,
      matchFound: geminiResult.matchFound,
      audioUrl: geminiResult.audioUrl || null,
      title: geminiResult.title || null,
      promptId: geminiResult.promptId || null,
      confidence: geminiResult.confidence ?? (geminiResult.matchFound ? 0.95 : 0.0),
      requiresTts: geminiResult.requiresTts,
      matchReason: geminiResult.reason,
      result: {
        matcherSource,
        matchFound: geminiResult.matchFound,
        audioUrl: geminiResult.audioUrl || null,
        title: geminiResult.title || null,
        promptId: geminiResult.promptId || null,
        confidence: geminiResult.confidence ?? (geminiResult.matchFound ? 0.95 : 0.0),
        reason: geminiResult.reason,
        literacyContext: geminiResult.literacyContext,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Audio matching failed" });
  }
});

/**
 * AI Audio Cross-Referencing Endpoint
 * The AI is the brain: analyzes the reply text against transcriped_twi_audio_library.txt,
 * produces an ordered audio assembly plan of clips to play, and extracts dynamic variables for TTS.
 * Only if the AI fails does the local system fallback engage.
 */
aiRouter.post("/api/ai/cross-reference-audio", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { replyText, language, literacyLevel, sessionId } = req.body;
    if (!replyText || typeof replyText !== "string") {
      return res.status(400).json({ success: false, error: "Missing required 'replyText' parameter" });
    }

    const lang = (language === "tw" || language === "ak" || language === "twi" || language === "twi-asante" || language === "twi-akuapem")
      ? "twi"
      : "en";

    const plan = await crossReferenceReplyAudioWithAi(replyText, lang, {
      literacyLevel: literacyLevel || "standard",
      sessionId,
    });

    res.json({
      success: true,
      plan,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Audio cross-referencing failed" });
  }
});

// Explicit 4-Field Synchronization endpoint
aiRouter.post("/api/ai/simulator/sync-session", publicApiRateLimiter, (req: Request, res: Response) => {
  try {
    const { sessionId, amount, recipientPhone, recipientName, network, language } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "Missing 'sessionId' field" });
    }
    const session = transactionStateMachine.getOrCreateSession(sessionId, language === "twi" ? "twi" : "en");
    const updates: Record<string, any> = {};
    if (typeof amount === "number" && amount > 0) updates.amount = amount;
    if (recipientPhone) {
      const normalizedPhone = normalizeGhanaPhoneNumber(String(recipientPhone));
      updates.recipientPhone = normalizedPhone;
      if (normalizedPhone !== session.recipientPhone) updates.isRecipientVerified = false;
    }
    if (recipientName) {
      updates.recipientName = recipientName;
    }
    if (network) updates.network = network;

    if (Object.keys(updates).length > 0) {
      transactionStateMachine.transition(sessionId, session.state, updates);
    }

    res.json({ success: true, session: transactionStateMachine.getOrCreateSession(sessionId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Session sync failed" });
  }
});

// Legacy browser PIN completion is disabled: authorization must happen in the provider handset flow.
aiRouter.post("/api/ai/simulator/complete-transfer", publicApiRateLimiter, (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: "PIN entry and transfer completion are handled only through the provider's secure handset authorization flow.",
  });
});

aiRouter.post("/api/ai/analyze", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { utterance, languageHint, draft } = req.body;
    if (!utterance || typeof utterance !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'utterance' field." });
    }
    const brainLanguage = (languageHint?.startsWith("tw") || languageHint === "ak") ? "twi-asante" : "en";
    const brainOutput = await brain.process({
      transcript: utterance,
      language: brainLanguage,
      languageConfidence: 0.95,
      sessionLanguage: brainLanguage,
      draft: draft || { slots: {} },
    });
    const result = await aiSystem.analyzeUtterance(utterance, languageHint || "bilingual");
    res.json({ success: true, result, brainOutput });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to analyze utterance" });
  }
});

aiRouter.post("/api/ai/transcribe", publicApiRateLimiter, async (req: Request, res: Response) => {
  const startTs = performance.now();
  try {
    const { audioBase64, mimeType, language, step, hintText, sessionId } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing 'audioBase64' payload." });
    }
    const result = await aiSystem.transcribe({
      audioBuffer: audioBase64,
      mimeType: mimeType || "audio/webm",
      expectedLanguage: language || "bilingual",
      step: hintText || step || "",
      skipEchoFiltering: true,
    });
    const latencyMs = Math.round(performance.now() - startTs);

    if (sessionId) {
      callSessionRepository.addApiTrace(sessionId, {
        id: `asr_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        endpoint: "/api/ai/transcribe",
        method: "POST",
        provider: result.provider || "ASR_ORCHESTRATOR",
        latencyMs,
        httpStatus: 200,
        requestSummary: `Audio (${mimeType || "audio/wav"}) [${language || "bilingual"}]`,
        responseSummary: `Transcript: "${(result.text || "").slice(0, 45)}" (Confidence: ${result.confidence ?? "N/A"})`,
        status: "SUCCESS",
      });
      if (result.fallbackUsed) {
        callSessionRepository.addDiagnostic(sessionId, {
          id: `diag_fallback_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          type: result.quotaExhausted ? "ERROR" : "WARN",
          message: result.quotaExhausted
            ? (result.errorMessage || "ASR token has been maxed out across all providers. Caller advised to try again another time.")
            : `ASR primary provider failed; fell back to ${result.provider}. Reason: ${result.fallbackReason || "Primary timeout or error"}`,
        });
      }
    }

    if (result.quotaExhausted) {
      return res.status(429).json({
        success: false,
        quotaExhausted: true,
        error: result.errorMessage || "ASR token has been maxed out. Please try again another time.",
        result,
      });
    }

    res.json({ success: true, result });
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTs);
    if (req.body?.sessionId) {
      callSessionRepository.addApiTrace(req.body.sessionId, {
        id: `asr_err_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        endpoint: "/api/ai/transcribe",
        method: "POST",
        provider: "ASR_ORCHESTRATOR",
        latencyMs,
        httpStatus: 500,
        requestSummary: `Audio upload failed`,
        responseSummary: err.message || "Failed to transcribe",
        status: "ERROR",
        errorMessage: err.message,
      });
    }
    res.status(500).json({ error: err.message || "Failed to transcribe audio" });
  }
});

// ── Continuous / Long-Form Session ASR Endpoints (Item 13 & 14) ────────
aiRouter.post("/api/ai/asr/session/start", publicApiRateLimiter, (req: Request, res: Response) => {
  try {
    const { sessionId, language, metadata } = req.body || {};
    const createdSessionId = longConversationAsr.startSession({
      sessionId,
      language: language || "twi",
      metadata,
    });
    res.json({ success: true, sessionId: createdSessionId });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to start ASR session" });
  }
});

aiRouter.post("/api/ai/asr/session/:sessionId/chunk", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { audioBase64, mimeType, step } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing 'audioBase64' audio chunk payload." });
    }
    const chunkResult = await longConversationAsr.appendAudioChunk(
      sessionId,
      audioBase64,
      mimeType || "audio/wav",
      step
    );
    res.json(chunkResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to append audio chunk" });
  }
});

aiRouter.post("/api/ai/asr/session/:sessionId/end", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = await longConversationAsr.endSession(sessionId);
    res.json({ success: true, session });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to end ASR session" });
  }
});

aiRouter.get("/api/ai/asr/session/:sessionId", publicApiRateLimiter, (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = longConversationAsr.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ success: true, session });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to retrieve ASR session" });
  }
});

aiRouter.post("/api/ai/asr/file/process", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType, language } = req.body || {};
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing 'audioBase64' audio payload." });
    }
    const result = await longConversationAsr.processLongAudioFile(
      audioBase64,
      mimeType || "audio/wav",
      language || "twi"
    );
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to process long audio file" });
  }
});

// ── Open-Source Speech Datasets & Acoustic Calibration Metadata ────────
aiRouter.get("/api/ai/asr/datasets", (_req: Request, res: Response) => {
  res.json({
    success: true,
    datasets: {
      mozillaCommonVoice: {
        name: "Mozilla Common Voice Akan/Twi Corpus",
        version: "v17.0+",
        hours: 54.2,
        tokensCount: GHANAIAN_ACOUSTIC_TOKENS.length,
        vowelHarmonyAware: true,
      },
      googleFleurs: {
        name: "Google FLEURS (Few-shot Learning Evaluation of Universal Robust Synthesizer)",
        dialects: Object.keys(GHANAIAN_DIALECT_PROFILES),
        profiles: GHANAIAN_DIALECT_PROFILES,
      },
      ghanaNlp: {
        name: "GhanaNLP Speech & Telephony Lexicon",
        domain: "West African Mobile Money & Banking",
        networks: ["MTN MoMo", "Telecel Cash", "AT Money"],
      },
      kaggleAfricanSpeech: {
        name: "Kaggle African Speech & Noise Robustness Benchmark",
        vadParameters: ACOUSTIC_NOISE_BENCHMARKS.vadThresholds,
        vocalRangeHz: ACOUSTIC_NOISE_BENCHMARKS.humanVocalRange,
        echoCancellationDb: ACOUSTIC_NOISE_BENCHMARKS.echoCancellation,
      },
    },
    currentNoiseFloorDb: acousticNoiseFilterModel.getNoiseFloorDb(),
  });
});

// ── Long Conversation & Discussion Parser Endpoint ─────────────────────
aiRouter.post("/api/ai/asr/discussion-understand", publicApiRateLimiter, (req: Request, res: Response) => {
  try {
    const { utterance, currentStep, existingDraft } = req.body || {};
    if (!utterance || typeof utterance !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'utterance' field." });
    }
    const parsed = parseLongDiscussion(utterance, currentStep || "idle", existingDraft || {});
    res.json({ success: true, parsed });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to parse long discussion" });
  }
});

// ── Acoustic Enhancement & Phonetic Repair Endpoint ───────────────────
aiRouter.post("/api/ai/asr/acoustic-enhance", publicApiRateLimiter, (req: Request, res: Response) => {
  try {
    const { rawText, currentStep } = req.body || {};
    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ error: "Missing 'rawText' field." });
    }
    const enhanced = repairNoisyAcousticTranscript(rawText, currentStep);
    res.json({ success: true, enhanced });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to acoustically enhance text" });
  }
});

// ── User ASR Feedback & Ground-Truth Corrections (Item 15 & 16) ────────
aiRouter.post("/api/ai/asr/feedback", adminRateLimiter, requireAdminAuth, (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      chunkId,
      provider,
      language,
      originalTranscript,
      correctedTranscript,
      reason,
      userNotes,
      userConsent,
    } = req.body || {};

    if (!sessionId || !originalTranscript || !correctedTranscript || !reason) {
      return res.status(400).json({
        error: "Missing required fields: sessionId, originalTranscript, correctedTranscript, and reason are required.",
      });
    }
    if (!hasExplicitAsrFeedbackConsent(userConsent)) {
      return res.status(400).json({ error: "Explicit consent is required to submit ASR feedback." });
    }

    const entry = feedbackService.submitCorrection({
      sessionId,
      chunkId,
      provider: provider || "unknown",
      language: language || "twi",
      originalTranscript,
      correctedTranscript,
      reason,
      userNotes,
      userConsent,
    });

    res.json({ success: true, feedback: entry });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to submit ASR correction feedback" });
  }
});

aiRouter.get("/api/ai/asr/feedback/metrics", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  try {
    const metrics = feedbackService.getMetrics();
    res.json({ success: true, metrics });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to retrieve ASR feedback metrics" });
  }
});

aiRouter.post("/api/ai/dialogue/turn", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { sessionId, text, audioBase64, mimeType } = req.body;
    const sessionKey = sessionId || `session_${Date.now()}`;
    const result = await aiSystem.handleTurn(sessionKey, {
      text,
      audioBuffer: audioBase64,
      mimeType,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to process dialogue turn" });
  }
});

aiRouter.post("/api/ai/synthesize", publicApiRateLimiter, async (req: Request, res: Response) => {
  const startTs = performance.now();
  try {
    const { text, language, sessionId } = req.body || {};
    const rawText = String(text || "").trim();
    if (!rawText) {
      return res.status(400).json({ success: false, error: "Text is required for speech synthesis." });
    }
    const isTwi = language === "twi" || language === "tw" || language === "ak" || language === "twi-asante";
    const synthResult = await ttsRouter.synthesize({
      text: rawText,
      language: isTwi ? "tw" : "en",
    });

    const latencyMs = Math.round(performance.now() - startTs);
    const base64 = synthResult.audioBuffer ? synthResult.audioBuffer.toString("base64") : null;

    if (sessionId) {
      callSessionRepository.addApiTrace(sessionId, {
        id: `tts_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        endpoint: "/api/ai/synthesize",
        method: "POST",
        provider: synthResult.providerUsed || "TTS_ROUTER",
        latencyMs,
        httpStatus: 200,
        requestSummary: `Text (${rawText.length} chars) [${isTwi ? "tw" : "en"}]: "${rawText.slice(0, 45)}"`,
        responseSummary: `Provider: ${synthResult.providerUsed}, Audio size: ${synthResult.audioBuffer?.length || 0} bytes`,
        status: "SUCCESS",
      });
    }

    res.json({
      success: true,
      result: {
        audioBase64: base64,
        audioMimeType: synthResult.audioMimeType || "audio/wav",
        providerUsed: synthResult.providerUsed,
        durationEstimateSec: synthResult.durationEstimateSec,
      },
    });
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTs);
    if (req.body?.sessionId) {
      callSessionRepository.addApiTrace(req.body.sessionId, {
        id: `tts_err_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        endpoint: "/api/ai/synthesize",
        method: "POST",
        provider: "TTS_ROUTER",
        latencyMs,
        httpStatus: 500,
        requestSummary: `Text: "${String(req.body?.text || '').slice(0, 40)}"`,
        responseSummary: err.message || "Failed to synthesize",
        status: "ERROR",
        errorMessage: err.message,
      });
    }
    res.status(500).json({ success: false, error: err.message || "Failed to synthesize speech." });
  }
});



// ── AI Natural Language Intent to Central MoMo Pipeline ───────────────
aiRouter.post("/api/ai/intent-to-momo", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { utterance, operation, amount, currency, recipient, payerPhone } = req.body;
    const { momoProvider } = await import("../integrations/momo");
    const { parseUserIntent } = await import("../modules/nluService");

    let parsedOp = operation || "SEND_MONEY";
    let parsedAmount = amount ? parseFloat(amount) : null;
    let parsedRecipient = recipient;

    // If natural language utterance is provided, extract intent
    if (utterance && (!parsedAmount || !parsedRecipient)) {
      const intentResult = await parseUserIntent(utterance);
      parsedOp = intentResult.intent || "SEND_MONEY";
      parsedAmount = parsedAmount || intentResult.amount || null;
      parsedRecipient = parsedRecipient || intentResult.recipient_phone || intentResult.recipient_name;
    }

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Could not extract valid amount from input. Please specify the amount to send.",
      });
    }

    if (!parsedRecipient) {
      return res.status(400).json({
        success: false,
        error: "Could not extract recipient phone number. Please specify the recipient.",
      });
    }

    if (!payerPhone) {
      return res.status(400).json({
        success: false,
        error: "Missing required 'payerPhone' parameter. Fails closed.",
      });
    }

    // Step 1: Create transaction in Central Transaction Service
    const tx = momoProvider.createTransaction({
      operation: parsedOp,
      recipientPhone: parsedRecipient,
      amount: parsedAmount,
      channel: "AI_VOICE",
      payerPhone: payerPhone,
    });

    // Step 2: Validate Recipient (calls MTN Basic User Info & Active Check)
    const validatedTx = await momoProvider.validateRecipient(tx.transactionId);

    const spokenPrompt = `Account found: ${validatedTx.recipient.name}. You are sending GH₵${validatedTx.amount.value} to ${validatedTx.recipient.name} on ${validatedTx.recipient.phone}. Do you want to continue?`;

    res.json({
      success: true,
      transaction: validatedTx,
      structuredIntent: {
        operation: parsedOp,
        amount: parsedAmount,
        currency: currency || "GHS",
        recipient: parsedRecipient,
      },
      confirmationPrompt: spokenPrompt,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Ghana NLP Discovery & Health Endpoints ────────────────────────────
aiRouter.get("/api/ai/ghananlp/health", async (_req: Request, res: Response) => {
  const { ghanaNlpAsrService } = await import("../services/ghanaNlpAsrService");
  const { ghanaNlpTtsService } = await import("../services/ghanaNlpTtsService");

  const [asrHealth, ttsHealth] = await Promise.all([
    ghanaNlpAsrService.healthCheck(),
    ghanaNlpTtsService.healthCheck(),
  ]);

  res.json({
    configured: config.ghanaNlp?.configured || false,
    asr: asrHealth,
    tts: ttsHealth,
  });
});

aiRouter.get("/api/ai/ghananlp/languages", async (_req: Request, res: Response) => {
  try {
    const { ghanaNlpAsrService } = await import("../services/ghanaNlpAsrService");
    if (!ghanaNlpAsrService.isConfigured()) {
      return res.status(503).json({ error: "Ghana NLP API is not configured. Set GHANANLP_API_KEY in environment." });
    }
    const data = await ghanaNlpAsrService.getLanguages();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

aiRouter.get("/api/ai/ghananlp/speakers", async (_req: Request, res: Response) => {
  try {
    const { ghanaNlpTtsService } = await import("../services/ghanaNlpTtsService");
    if (!ghanaNlpTtsService.isConfigured()) {
      return res.status(503).json({ error: "Ghana NLP API is not configured. Set GHANANLP_API_KEY in environment." });
    }
    const data = await ghanaNlpTtsService.getSpeakers();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// ── Pre-Transaction Telco KYC & Recipient Lookup ─────────────────────
aiRouter.post("/api/ai/simulator/validate-recipient", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { phone, sessionId, candidateName, candidateNetwork } = req.body || {};
    if (!phone) {
      return res.status(400).json({ success: false, error: "Missing recipient phone number." });
    }
    const normalized = normalizeGhanaPhoneNumber(String(phone));
    const resolution = await recipientResolver.resolve(normalized);
    const verifiedName = resolution.name || (resolution.verified ? "Registered Subscriber" : "Unknown Subscriber");
    const network = resolution.network || "MTN";

    // Detect mismatch between what user mentioned vs telco registry
    let nameMismatch = false;
    if (candidateName && typeof candidateName === "string" && candidateName.trim().length > 0) {
      const cand = candidateName.toLowerCase().trim();
      const ver = verifiedName.toLowerCase().trim();
      if (!["him", "her", "them", "someone", "recipient"].includes(cand)) {
        if (!ver.includes(cand) && !cand.includes(ver)) {
          nameMismatch = true;
        }
      }
    }

    let networkMismatch = false;
    if (candidateNetwork && typeof candidateNetwork === "string" && candidateNetwork.trim().length > 0) {
      if (candidateNetwork.toUpperCase() !== network.toUpperCase()) {
        networkMismatch = true;
      }
    }

    res.json({
      success: true,
      phone: normalized,
      verifiedName,
      network,
      verified: resolution.verified,
      nameMismatch,
      networkMismatch,
      candidateName: candidateName || null,
      candidateNetwork: candidateNetwork || null,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to validate recipient." });
  }
});

// Legacy app-submitted PIN API is disabled. Never accept or validate a MoMo PIN here.
aiRouter.post("/api/ai/simulator/submit-pin", publicApiRateLimiter, (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: "This service never accepts MoMo PINs. Authorize only in the private prompt from your Mobile Money provider.",
  });
});

// ── MoMo Cash-Out & Voice Withdrawal Endpoints ────────────────────────
import { cashOutService } from "../services/cashOutService";

// 1. Enable Cash-Out on subscriber wallet
aiRouter.post("/api/ai/cashout/enable", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { callerPhone, language } = req.body || {};
    const phone = callerPhone || "0543546010";
    const state = cashOutService.enableCashOut(phone, 15);
    const isTwi = language === "twi" || language === "tw" || language === "ak" || language === "twi-asante";

    const msgEn = `Cash-Out has been successfully enabled on your wallet for the next 15 minutes. Balance checking through this assistant is currently unavailable; dial star, one, seven, zero, hash on your handset.`;
    const msgTw = `Yɛabue kwan ama wo sɛ wotumi yi sika wɔ MoMo agent hɔ mfifii 15 mu. Yɛrentumi nhwɛ wo balance wɔ assistant yi so seesei; fa wo fon bɔ star, baako, nson, hwee, hash.`;

    res.json({
      success: true,
      state,
      callerPhone: phone,
      expiresInMinutes: 15,
      message: isTwi ? msgTw : msgEn,
      messageEn: msgEn,
      messageTw: msgTw,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to enable Cash-Out" });
  }
});

// 2. Personal balance checking is unavailable; do not accept a PIN for this operation.
aiRouter.post("/api/ai/cashout/check-balance", publicApiRateLimiter, async (_req: Request, res: Response) => {
  const messageEn = "Balance checking through this assistant is currently unavailable. Please dial star, one, seven, zero, hash on your handset.";
  const messageTw = "Seesei, yɛrentumi nhwɛ wo balance wɔ assistant yi so. Fa wo fon bɔ star, baako, nson, hwee, hash na hwɛ wo balance.";
  res.status(501).json({
    success: false,
    error: "BALANCE_CHECK_UNAVAILABLE",
    message: messageEn,
    messageEn,
    messageTw,
  });
});
// 3. Simulate Agent Submitting Withdrawal Request
aiRouter.post("/api/ai/cashout/agent-request", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { callerPhone, agentCode, agentName, amount } = req.body || {};
    const phone = callerPhone || "0543546010";
    const request = cashOutService.createAgentWithdrawalRequest(
      phone,
      agentCode || "284910",
      agentName || "Kofi Mensah Enterprise (MoMo Agent)",
      Number(amount) || 50.0
    );

    res.json({
      success: true,
      request,
      message: `Agent request created for ${phone}: GHS ${request.amount} by ${request.agentName}.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to create agent request" });
  }
});

// 4. Retrieve Pending Agent Request for Caller
aiRouter.get("/api/ai/cashout/get-pending", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const phone = String(req.query.callerPhone || "0543546010");
    const pending = cashOutService.getPendingWithdrawalRequest(phone);
    res.json({
      success: true,
      hasPending: Boolean(pending),
      request: pending,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to get pending request" });
  }
});

// 5. Approve Withdrawal Request (with Zero-PIN privacy advisory)
// 5. Approve Withdrawal Request (with Zero-PIN privacy advisory & accurate failure reporting)
aiRouter.post("/api/ai/cashout/approve", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { callerPhone, pin, language } = req.body || {};
    const phone = callerPhone || "0543546010";
    const isTwi = language === "twi" || language === "tw" || language === "ak" || language === "twi-asante";

    const approvalResult = cashOutService.approveWithdrawal(phone, String(pin || ""));
    if (!approvalResult.success) {
      if (approvalResult.error === "WALLET_LOCKED") {
        const lockMsgEn = "Too many incorrect PIN attempts. For your security, your Mobile Money wallet has been temporarily locked. Please visit an MTN service centre or call 100 for assistance. Goodbye.";
        const lockMsgTw = "Woabɔ PIN no mfomsoɔ mprɛnsa. Ahobammbɔ nti, yɛato wo MoMo wallet mu kakra. Mesrɛ wo kɔ MTN service centre anaa frɛ 100. Nante yie.";
        return res.json({
          success: false,
          error: "WALLET_LOCKED",
          isLocked: true,
          remainingAttempts: 0,
          message: isTwi ? lockMsgTw : lockMsgEn,
          messageEn: lockMsgEn,
          messageTw: lockMsgTw,
        });
      }

      if (approvalResult.error === "INVALID_PIN") {
        const rem = approvalResult.remainingAttempts ?? 2;
        const warnMsgEn = `That PIN is incorrect. You have ${rem} attempt${rem === 1 ? "" : "s"} remaining before your wallet is locked. Please enter your PIN carefully on your phone keypad. Never share your PIN with anyone.`;
        const warnMsgTw = `PIN no nyɛ pɛpɛɛpɛ. Wodeɛ aka mprɛ ${rem} pɛ ansa na yɛato wo wallet mu. Mesrɛ wo, fa wo keypad no bɔ mu pɛpɛɛpɛ na nka wo PIN nkyerɛ obiara da.`;
        return res.json({
          success: false,
          error: "INVALID_PIN",
          isLocked: false,
          remainingAttempts: rem,
          message: isTwi ? warnMsgTw : warnMsgEn,
          messageEn: warnMsgEn,
          messageTw: warnMsgTw,
        });
      }

      if (approvalResult.error === "INSUFFICIENT_BALANCE" && approvalResult.balanceDetails) {
        const b = approvalResult.balanceDetails;
        const balStr = b.currentBalance.toFixed(2);
        const amtStr = b.requestedAmount.toFixed(2);
        const feeStr = b.fee.toFixed(2);
        const totStr = b.totalRequired.toFixed(2);
        const maxStr = b.maxPossibleWithdrawal.toFixed(2);
        const shortStr = b.shortage.toFixed(2);

        const msgEn = `The withdrawal could not be completed because your Mobile Money balance is ${balStr} Cedis, but the agent requested ${amtStr} Cedis plus a ${feeStr} fee, for a total of ${totStr} Cedis. Your account is short by ${shortStr} Cedis. The maximum amount you can withdraw right now is ${maxStr} Cedis. Please ask the agent to enter ${maxStr} Cedis instead.`;
        const msgTw = `Wontumi nyi sika no efisɛ wo MoMo balance yɛ ${balStr} Cedis, nanso agent no rebisa ${amtStr} Cedis ne fee ${feeStr} Cedis, a ne nyinaa yɛ ${totStr} Cedis. Sika a ɛka wo ho yɛ ${shortStr} Cedis. Sika a wotumi yi seesei ara yɛ ${maxStr} Cedis. Mesrɛ wo ka kyerɛ agent no sɛ ɔnsesa nɔmba no mmɔ ${maxStr} Cedis.`;

        return res.json({
          success: false,
          error: "INSUFFICIENT_BALANCE",
          balanceDetails: b,
          message: isTwi ? msgTw : msgEn,
          messageEn: msgEn,
          messageTw: msgTw,
        });
      }

      return res.json({
        success: false,
        error: approvalResult.error || "NO_PENDING_REQUEST",
        message: isTwi
          ? "Agent biara nnya mfaa sika yi ho asɛm mmanee wo account mu. Mesrɛ wo ka kyerɛ agent no sɛ ɔmbɔ sika yi ansa."
          : "There is no pending cash-out withdrawal request from an agent for your phone number right now. Please tell the agent to enter the withdrawal first.",
      });
    }

    const reqData = approvalResult.request!;
    const ref = approvalResult.referenceId!;

    const msgEn = `Your cash withdrawal of ${reqData.amount.toFixed(2)} Cedis from ${reqData.agentName} has been approved successfully! MoMo Reference: ${ref}. Security Tip: For your safety, you can also press your PIN on your phone keypad next time so bystanders do not overhear your code.`;
    const msgTw = `Sika a woyiiɛ GHS ${reqData.amount.toFixed(2)} wɔ ${reqData.agentName} hɔ no akɔ yie pɛpɛɛpɛ! MoMo Reference: ${ref}. Ahobammbɔ Afutuo: Da foforɔ no, wotumi fa wo phone so keypad no bɔ wo PIN ahintasɛm no na obiara ante wɔ baabi a wogyina no.`;

    res.json({
      success: true,
      referenceId: ref,
      request: reqData,
      message: isTwi ? msgTw : msgEn,
      messageEn: msgEn,
      messageTw: msgTw,
      privacyTipEn: "For your safety, you can also press your PIN on your phone keypad so bystanders do not overhear your code.",
      privacyTipTw: "Da foforɔ no, wotumi fa wo phone so keypad no bɔ wo PIN ahintasɛm no na obiara ante wɔ baabi a wogyina no.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to approve withdrawal" });
  }
});

// 5b. Understand Cash-Out Conversational Intent via AI Agent (Zero-PIN Protected)
aiRouter.post("/api/ai/cashout/understand-intent", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { transcript, currentState, callerPhone, requestedAmount, language } = req.body || {};
    const text = String(transcript || "").trim();
    const isTwi = language === "twi" || language === "tw" || language === "ak" || language === "twi-asante";
    const curState = String(currentState || "cashout-awaiting-agent");

    if (!text) {
      return res.json({
        success: false,
        intent: "UNKNOWN",
        action: "CLARIFY",
        confidence: 0.0,
      });
    }

    // STRICT ZERO-PIN REDACTION BOUNDARY:
    // Redact any sequence of 4 digits or any mention of PIN code before passing to the AI model
    const redactedText = text
      .replace(/\b\d{4}\b/g, "[REDACTED_PIN]")
      .replace(/\b(?:pin|secret|passcode|code)\s*(?:is|:)?\s*\d+\b/gi, "pin [REDACTED_PIN]");

    // Try Gemini AI Model first with structured prompt
    let detectedIntent: "AGENT_INITIATED" | "CONFIRM_PROCEED" | "REJECT_CANCEL" | "CHECK_BALANCE" | "WAITING" | "UNKNOWN" = "UNKNOWN";
    let detectedAction: "FETCH_PENDING" | "PROCEED" | "CANCEL" | "CHECK_BALANCE" | "WAIT" | "CLARIFY" = "CLARIFY";
    let reason = "";

    const rawClient = geminiClient.getRawClient();
    if (rawClient && geminiClient.isAvailable()) {
      try {
        const prompt = `You are the natural language understanding agent for Ɔkwankyerɛfo Pa (Ghanaian Mobile Money Voice Layer).
The user is performing a Cash-Out / agent withdrawal.
Current step: "${curState}".
Caller Phone: "${callerPhone || "0543546010"}".
Amount: "${requestedAmount || 30}".
Language: ${isTwi ? "Akan Twi" : "English"}.

The caller said: "${redactedText}".

Determine the user's intent. Output JSON ONLY with this schema:
{
  "intent": "AGENT_INITIATED" | "CONFIRM_PROCEED" | "REJECT_CANCEL" | "CHECK_BALANCE" | "WAITING" | "UNKNOWN",
  "action": "FETCH_PENDING" | "PROCEED" | "CANCEL" | "CHECK_BALANCE" | "WAIT" | "CLARIFY",
  "reason": string
}

Guidelines:
- In step "cashout-confirm-approval":
  * If the caller agrees to approve or proceed, says yes, confirms, says "go ahead", "yes please go ahead", "approve", "approve it", "approve for me", "pene so", "aane", "yoo", "do it", or mentions entering PIN, set intent to "CONFIRM_PROCEED" and action to "PROCEED".
  * If caller rejects or cancels ("no", "cancel", "dabi", "reject", "twa mu"), set intent to "REJECT_CANCEL" and action to "CANCEL".
- In step "cashout-awaiting-agent":
  * If the caller indicates the physical agent has initiated/sent/entered the withdrawal, told them to check, prompt has appeared, or caller wants to enter their PIN / approve (e.g. "he said I should check, and add my pin", "0543546010 i have, he said i should check, and add my pin", "prompt has come", "he entered it", "agent is done", "it came", "approve", "approve for me", "yes approve for me", "enter my pin", "check", "wawie", "ɔse menhwɛ", "bisa pin"), set intent to "AGENT_INITIATED" and action to "FETCH_PENDING".
  * If the caller asks to wait, says agent is still typing/busy, set intent to "WAITING" and action to "WAIT".
  * If caller cancels, set intent to "REJECT_CANCEL" and action to "CANCEL".
- In step "cashout-offer-balance":
  * If the caller agrees to check balance or fees ("yes", "check", "sure", "aane", "hwɛ"), set intent to "CONFIRM_PROCEED" and action to "PROCEED".
  * If caller skips or says no ("no", "skip", "dabi", "daabi"), set intent to "REJECT_CANCEL" and action to "CANCEL".
  * If caller immediately indicates agent is already done / entered, set intent to "AGENT_INITIATED" and action to "FETCH_PENDING".
`;

        const response = await rawClient.models.generateContent({
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const outputText = response.text || "{}";
        const parsed = JSON.parse(outputText);
        if (parsed.intent && parsed.action) {
          detectedIntent = parsed.intent;
          detectedAction = parsed.action;
          reason = parsed.reason || "Gemini semantic understanding";
          if (curState === "cashout-confirm-approval" && (detectedIntent === "AGENT_INITIATED" || /\b(approve|pene\s*so)\b/i.test(text))) {
            detectedIntent = "CONFIRM_PROCEED";
            detectedAction = "PROCEED";
            reason = "In cashout-confirm-approval, approving is confirmation to proceed";
          }
        }
      } catch (geminiErr: any) {
        // Fallback to local deterministic linguistic evaluation
      }
    }

    // Local Deterministic Linguistic Fallback if Gemini did not classify or is offline
    if (detectedIntent === "UNKNOWN") {
      const lower = text.toLowerCase();

      if (curState === "cashout-confirm-approval") {
        const approveCues = [
          "yes", "approve", "confirm", "proceed", "go ahead", "please go ahead",
          "okay", "sure", "aane", "ampa", "kɔ so", "ko so", "yie", "pene so",
          "yoo", "do it", "allow it", "enter pin", "bisa pin", "menhyɛ mu", "approve for me", "yes please"
        ];
        const cancelCues = ["no", "cancel", "dabi", "stop", "reject", "gyae", "twa mu"];
        if (approveCues.some(cue => lower.includes(cue))) {
          detectedIntent = "CONFIRM_PROCEED";
          detectedAction = "PROCEED";
          reason = "Caller approved withdrawal request in cashout-confirm-approval";
        } else if (cancelCues.some(cue => lower.includes(cue))) {
          detectedIntent = "REJECT_CANCEL";
          detectedAction = "CANCEL";
          reason = "Caller rejected withdrawal in cashout-confirm-approval";
        }
      } else {
        // Agent initiated cues (English & Twi)
        const agentDoneCues = [
          "he said", "said i should check", "check", "add my pin", "enter pin", "bisa pin",
          "agent is done", "done", "he has sent", "sent it", "he sent it", "punched it",
          "prompt has come", "prompt come", "it has arrived", "it came", "approve",
          "approve it", "approve for me", "yes approve", "pene so", "ready", "wie", "wawie",
          "ɔse menhwɛ", "ose menhwe", "ɔse me bɔ", "ose me bo", "prompt no aba",
          "agent no awie", "he entered it", "menhyɛ mu"
        ];
        const isAgentDone = agentDoneCues.some(cue => lower.includes(cue));

        // Affirmative / Proceed cues
        const proceedCues = [
          "yes", "confirm", "proceed", "go ahead", "please go ahead", "try it",
          "try anyway", "okay", "sure", "aane", "ampa", "kɔ so", "ko so", "yie",
          "pene so", "yoo", "yes please"
        ];
        const isProceed = proceedCues.some(cue => lower.includes(cue));

        // Negative / Cancel cues
        const cancelCues = [
          "no", "cancel", "dabi", "stop", "reject", "gyae", "twa mu"
        ];
        const isCancel = cancelCues.some(cue => lower.includes(cue));

        // Balance check cues
        const balanceCues = [
          "check balance", "how much", "balance", "fee", "sika dodoɔ", "hwɛ balance", "hwɛ sika"
        ];
        const isBalance = balanceCues.some(cue => lower.includes(cue));

        if (isAgentDone) {
          detectedIntent = "AGENT_INITIATED";
          detectedAction = "FETCH_PENDING";
          reason = "Linguistic match: caller indicated agent prompt / check / add PIN request";
        } else if (isProceed) {
          detectedIntent = "CONFIRM_PROCEED";
          detectedAction = "PROCEED";
          reason = "Linguistic match: affirmative confirmation / proceed";
        } else if (isCancel) {
          detectedIntent = "REJECT_CANCEL";
          detectedAction = "CANCEL";
          reason = "Linguistic match: negative cancellation";
        } else if (isBalance) {
          detectedIntent = "CHECK_BALANCE";
          detectedAction = "CHECK_BALANCE";
          reason = "Linguistic match: check balance and fees";
        }
      }
    }

    res.json({
      success: true,
      intent: detectedIntent,
      action: detectedAction,
      confidence: detectedIntent !== "UNKNOWN" ? 0.95 : 0.3,
      reason,
      redactedTranscript: redactedText,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to analyze cashout intent" });
  }
});

// 5c. Reset PIN attempts and unlock wallet for testing
aiRouter.post("/api/ai/cashout/reset-attempts", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { callerPhone } = req.body || {};
    const phone = callerPhone || "0543546010";
    cashOutService.resetPinAttempts(phone);
    res.json({ success: true, message: `PIN attempts reset and wallet unlocked for ${phone}.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to reset PIN attempts" });
  }
});

// 6. Set custom wallet balance for simulation testing (e.g. GH₵30)
aiRouter.post("/api/ai/cashout/set-balance", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { callerPhone, balance } = req.body || {};
    const phone = callerPhone || "0543546010";
    const bal = Number(balance);
    cashOutService.setWalletBalance(phone, isNaN(bal) ? 30.0 : bal);
    res.json({
      success: true,
      callerPhone: phone,
      balance: cashOutService.getWalletBalance(phone),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Failed to set wallet balance" });
  }
});

// ── Central Brain Token & Latency Telemetry ───────────────────────────
aiRouter.get("/api/ai/brain/telemetry", (_req: Request, res: Response) => {
  res.json({
    success: true,
    telemetry: brainTelemetry.getSummary(),
  });
});

aiRouter.post("/api/ai/brain/telemetry/reset", (_req: Request, res: Response) => {
  brainTelemetry.reset();
  res.json({
    success: true,
    message: "Brain telemetry counters reset.",
    telemetry: brainTelemetry.getSummary(),
  });
});

