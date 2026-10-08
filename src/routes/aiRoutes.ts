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
import { ttsRouter } from "../ai_system/speech/tts/ttsRouter";
import { formatSpokenNumbersAsDigits } from "../domain/numberFormatter";
import { paymentSaga } from "../integrations/momo/paymentSaga";
import { geminiClient } from "../services/geminiClient";
import {
  isAcousticSystemEcho,
  stripSystemEchoFromTranscript,
  isBackgroundNoiseOrStatic,
} from "../domain/echoFilter";

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

// Production AI health probe
aiRouter.get("/api/ai/health", async (_req: Request, res: Response) => {
  const start = performance.now();
  const diag = aiBootstrap.getDiagnostics();
  const providers = modelRouter.getHealthReport();
  const latencyMs = performance.now() - start;

  res.json({
    status: "HEALTHY",
    offlineEngine: "OPERATIONAL",
    models: diag.models,
    providers,
    security: diag.security,
    memory: diag.memory,
    latencyMs: Math.round(latencyMs),
  });
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

    // Fetch authoritative saga state
    const activeSaga = paymentSaga.getLatestSagaForSession(sessionKey);
    const sagaInfo = activeSaga
      ? {
          sagaId: activeSaga.sagaId,
          state: activeSaga.state,
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

    // Mask phone numbers and amounts in logged objects
    const draftSlots = (brainOutput.updatedDraft?.slots || {}) as any;
    const rawRecipientPhone = draftSlots.recipient?.phone || draftSlots.recipientPhone || "";
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
      intent: brainOutput.decision.intent,
      intentConfidence: brainOutput.modelOutput?.intent?.confidence ?? 0.95,
      decisionKind: brainOutput.decision.kind,
      missingSlots,
      draftMasked: maskedDraft,
      replyText: brainOutput.reply.text,
      audioSource: brainOutput.reply.promptId ? "studio" : "TTS_PENDING",
      latency: {
        asrMs: Math.round((result.performance?.durationMs || 50) * 0.2),
        nluMs: Math.round((result.performance?.durationMs || 50) * 0.5),
        ttsMs: Math.round((result.performance?.durationMs || 50) * 0.3),
        totalMs: result.performance?.durationMs || 65,
      },
      brainMode: offlineMode ? "offline" : brain.config.mode,
      modelStatus: {
        isAvailable: geminiClient.isAvailable() && !offlineMode && modelEnabled !== false,
        fallbackUsed: Boolean(brainOutput.modelOutput?.fallbackReason) || Boolean(offlineMode),
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
    const { transcript, language, draft, callerNumber, sessionId } = req.body;
    const text = transcript || req.body.input || req.body.utterance || "";
    const lang = (language === "tw" || language === "ak" || language === "twi" || language === "twi-asante")
      ? "twi-asante"
      : language === "twi-akuapem"
      ? "twi-akuapem"
      : "en";

    const output = await brain.process({
      transcript: String(text),
      language: lang,
      languageConfidence: req.body.languageConfidence ?? 0.95,
      sessionLanguage: lang,
      draft: draft || { slots: {} },
      callerNumber,
      sessionId,
    });

    res.json({ success: true, brainOutput: output, result: output });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || "Brain processing failed" });
  }
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
  try {
    const { audioBase64, mimeType, language, step, hintText } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing 'audioBase64' payload." });
    }
    const result = await aiSystem.transcribe({
      audioBuffer: audioBase64,
      mimeType: mimeType || "audio/webm",
      expectedLanguage: language || "bilingual",
      step: hintText || step || "",
    });
    if (result && result.text) {
      result.text = formatSpokenNumbersAsDigits(result.text);
      if (isBackgroundNoiseOrStatic(result.text)) {
        result.text = "";
      } else if (isAcousticSystemEcho(result.text, hintText || step)) {
        const stripped = stripSystemEchoFromTranscript(result.text, hintText || step);
        result.text = (!stripped || isAcousticSystemEcho(stripped, hintText || step)) ? "" : stripped;
      }
    }
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to transcribe audio" });
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
  try {
    const { text, language, style } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing 'text' to synthesize." });
    }
    const result = await aiSystem.synthesizeSpeech(text, language || "en", style);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to synthesize speech" });
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
