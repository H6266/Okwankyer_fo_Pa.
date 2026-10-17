/**
 * Ɔkwankyerɛfo Pa - Public & Developer API Routes
 * 
 * Provides honest endpoints for health checks, KYC lookup, audio manifest,
 * evaluation runner, and real call session history.
 */

import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { config } from "../config/env";
import { runRealSmokeTests } from "../services/healthService";
import { recipientResolver } from "../providers/recipient/RecipientResolver";
import { AUDIO_ASSET_INVENTORY, AUDIO_CATALOG, audioFileExists, getAudioFileSize } from "../audio/catalog";
import { getPromptManifestEntries, getRecordingByPromptId } from "../audio/recordingRegistry";
import { callSessionRepository } from "../services/callSessionRepository";
import { auditLogger } from "../services/auditLogger";
import { runEvaluationHarness } from "../ai_eval/evalHarness";
import { requireAdminAuth } from "../middleware/adminAuth";
import { kycLookupRateLimiter, adminRateLimiter, publicApiRateLimiter } from "../middleware/rateLimiter";
import { validateGhanaPhoneNumber } from "../domain/validation";
import { modelRouter } from "../ai_system/providers/modelRouter";
import { ttsRouter as speechSynthesisRouter } from "../ai_system/speech/tts/ttsRouter";
import { resolvePrompt, resolvePromptText } from "../modules/ttsService";
import { isDynamicPrompt, resolvePromptSpokenText } from "../audio/canonicalRegistry";
import { aiBootstrap } from "../ai_system/core/aiBootstrap";

export const apiRouter = Router();

apiRouter.get(
  "/api/audio/prompt/:lang/:key",
  publicApiRateLimiter,
  (req: Request, res: Response) => {
    const lang = req.params.lang;
    if (lang !== "en" && lang !== "twi") {
      return res.status(400).json({ error: "Unsupported prompt language." });
    }

    const promptUrl = resolvePrompt(req.params.key, lang);
    if (!promptUrl) {
      return res.status(404).json({ error: "No registered recording or TTS script exists for this prompt." });
    }
    return res.redirect(302, promptUrl);
  }
);

apiRouter.get(
  ["/api/audio/prompt-tts/:lang/:key", "/audio/prompt-tts/:lang/:key"],
  publicApiRateLimiter,
  async (req: Request, res: Response) => {
    const lang = req.params.lang;
    if (lang !== "en" && lang !== "twi") {
      return res.status(400).json({ error: "Unsupported prompt language." });
    }

    const {
      name,
      recipientName,
      phone,
      recipientPhone,
      amount,
      ref,
      referenceId,
      response: userResponse,
      utterance,
    } = req.query as Record<string, string>;

    let promptText: string | null = null;
    if (isDynamicPrompt(req.params.key) || Object.keys(req.query).length > 0) {
      promptText = resolvePromptSpokenText(req.params.key, lang as "en" | "twi", {
        name,
        recipientName,
        phone,
        recipientPhone,
        amount,
        ref,
        referenceId,
        response: userResponse,
        utterance,
      });
    }

    if (!promptText) {
      promptText = resolvePromptText(req.params.key, lang);
    }

    if (!promptText) {
      return res.status(404).json({ error: "No registered prompt text or recording exists for this key." });
    }

    try {
      const result = await speechSynthesisRouter.synthesize({
        text: promptText,
        language: lang === "twi" ? "tw" : "en",
      });

      const buffer = result.audioBuffer;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;
        const chunk = buffer.subarray(start, end + 1);

        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${buffer.length}`);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Length", chunk.length);
        res.setHeader("Content-Type", result.audioMimeType);
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.end(chunk);
      }

      res.status(200);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", result.audioMimeType);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.end(buffer);
    } catch (error) {
      console.error("[AudioPromptTTS] Prompt synthesis failed.", error);
      return res.status(502).json({ error: "Prompt speech synthesis is temporarily unavailable." });
    }
  }
);

// ── Health Status ─────────────────────────────────────────────────────
const handleHealth = (req: Request, res: Response) => {
  const forwardedHost = ((req.headers["x-forwarded-host"] as string) || "").split(",")[0]?.trim();
  const host = forwardedHost || req.get("host") || `localhost:${config.port}`;
  const forwardedProto = ((req.headers["x-forwarded-proto"] as string) || "").split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || (host.includes("run.app") ? "https" : "http");
  const baseUrl = host.includes("localhost") && config.baseUrl && !config.baseUrl.includes("localhost")
    ? config.baseUrl
    : `${proto}://${host}`.replace(/\/+$/, "");

  res.json({
    status: "ok",
    service: "Ɔkwankyerɛfo Pa",
    team: "Anidasoɔ (Hope)",
    abstract: "A Voice Accessibility Layer for Ghana's Digital Services (MoMo Pilot)",
    voiceNumber: config.at.voiceNumber,
    environment: config.nodeEnv,
    demoMode: config.demoMode,
    atConfigured: config.at.configured,
    geminiConfigured: config.gemini.configured,
    momoConfigured: config.momo.configured,
    baseUrl,
    callbackUrl: `${baseUrl}/voice-menu`,
    features: [
      "Dynamic Spoken Safe Confirmation",
      "Provider-Backed Recipient KYC Resolution",
      "Zero-PIN Voice Security Gate",
      "Instant DTMF Barge-In (<GetDigits><Play/></GetDigits>)",
      "Universal Navigation Grammar (#, 0, 8, 9)",
      "Dual-Track Language Isolation (English & Akan Twi)",
      "HTTP 206 Byte-Range Audio Streaming",
    ],
  });
};

apiRouter.get("/health", handleHealth);
apiRouter.get("/api/health", handleHealth);

// ── Africa's Talking Public Webhook Info Endpoint ─────────────────────
apiRouter.get(["/api/telephony/public-url", "/api/telephony/webhook-info"], (req: Request, res: Response) => {
  const forwardedHost = ((req.headers["x-forwarded-host"] as string) || "").split(",")[0]?.trim();
  const host = forwardedHost || req.get("host") || `localhost:${config.port}`;
  const forwardedProto = ((req.headers["x-forwarded-proto"] as string) || "").split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || (host.includes("run.app") ? "https" : "http");
  const publicBaseUrl = `${proto}://${host}`.replace(/\/+$/, "");

  res.json({
    success: true,
    port: 3000,
    publicHttpsPort: 443,
    publicBaseUrl,
    voiceWebhookUrl: `${publicBaseUrl}/voice-menu`,
    alternativeWebhookUrls: [
      `${publicBaseUrl}/voice-menu`,
      `${publicBaseUrl}/voice`,
      `${publicBaseUrl}/voice/callback`,
      `${publicBaseUrl}/`,
    ],
    atVoiceNumber: config.at.voiceNumber || "+233 30 804 8098",
    autoConnectEnabled: true,
    instructions: "Paste 'voiceWebhookUrl' into Africa's Talking Voice dashboard under Numbers > Voice Callback URL. Calls to your AT number will connect automatically.",
  });
});

// Section 62: Dedicated Subsystem Health Endpoints
apiRouter.get("/health/ai", (_req: Request, res: Response) => {
  const diag = aiBootstrap.getDiagnostics();
  res.json({
    status: "HEALTHY",
    offlineEngine: "OPERATIONAL",
    localAiReady: true,
    localAsrReady: true,
    localTtsReady: true,
    geminiConfigured: diag.providers.geminiConfigured,
    zeroPinEnforced: diag.security.zeroPinEnforced,
    languagesSupported: ["en", "tw", "ak"],
    timestamp: new Date().toISOString(),
  });
});
apiRouter.get("/api/health/ai", (_req: Request, res: Response) => {
  res.redirect(307, "/health/ai");
});

apiRouter.get("/health/models", (_req: Request, res: Response) => {
  const diag = aiBootstrap.getDiagnostics();
  res.json({
    status: "OK",
    models: diag.models,
    sdkVerified: diag.modelsVerifiedAgainstSdk,
    verifiedModelList: diag.sdkVerifiedModels,
  });
});
apiRouter.get("/api/health/models", (_req: Request, res: Response) => {
  res.redirect(307, "/health/models");
});

apiRouter.get("/health/providers", (_req: Request, res: Response) => {
  res.json({
    status: "OK",
    providers: modelRouter.getHealthReport(),
    momoConfigured: config.momo.configured,
    atConfigured: config.at.configured,
  });
});
apiRouter.get("/api/health/providers", (_req: Request, res: Response) => {
  res.redirect(307, "/health/providers");
});

// ── Smoke Test Suite (Real Probes - Admin Protected) ──────────────────
apiRouter.post("/api/dev/smoke-test", adminRateLimiter, requireAdminAuth, async (_req: Request, res: Response) => {
  try {
    const report = await runRealSmokeTests();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: `Smoke test execution failed: ${err.message}` });
  }
});

// ── Audio Manifest & Catalog ──────────────────────────────────────────
apiRouter.get("/api/audio/manifest", (_req: Request, res: Response) => {
  const enrichAsset = (item: (typeof AUDIO_ASSET_INVENTORY)[number]) => {
    const exists = audioFileExists(item.filename, item.assetRoot);
    const sizeBytes = getAudioFileSize(item.filename, item.assetRoot);

    return {
      ...item,
      exists,
      sizeBytes,
      sizeFormatted: exists && sizeBytes > 0 ? `${(sizeBytes / 1024).toFixed(1)} KB` : exists ? "Ready" : "Unavailable",
    };
  };
  const prompts = AUDIO_CATALOG.map(enrichAsset);

  const englishPrompts = prompts.filter((prompt) => prompt.language === "en");
  const twiPrompts = prompts.filter((prompt) => prompt.language === "twi");
  const unresolvedAssets = AUDIO_ASSET_INVENTORY
    .filter((item) => item.language === "unresolved")
    .map(enrichAsset);
  const missingPromptVariants = getPromptManifestEntries().flatMap((prompt) =>
    (["en", "twi"] as const)
      .filter((language) => !getRecordingByPromptId(prompt.id, language))
      .map((language) => ({
        promptId: prompt.id,
        language,
        state: prompt.state,
        status: "recording_unavailable",
      }))
  );

  res.json({
    totalClips: prompts.length,
    englishClips: englishPrompts.length,
    twiClips: twiPrompts.length,
    englishPrompts,
    twiPrompts,
    allPrompts: prompts,
    unresolvedAssets,
    missingPromptVariants,
    sessions: callSessionRepository.getAllSessions(),
  });
});

// ── KYC Lookup (Admin Protected Oracle Guard) ─────────────────────────
apiRouter.get("/api/kyc/lookup", kycLookupRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  const phone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
  if (!phone) {
    return res.status(400).json({
      valid: false,
      error: "Missing required query parameter: 'phone'. Please provide a valid phone number.",
    });
  }

  const phoneValidation = validateGhanaPhoneNumber(phone);
  if (!phoneValidation.valid || !phoneValidation.normalized) {
    return res.status(400).json({
      valid: false,
      error: phoneValidation.error || "Invalid Ghanaian phone number format.",
    });
  }

  const result = await recipientResolver.resolve(phoneValidation.normalized);
  res.json({
    valid: result.valid,
    record: result.valid
      ? {
          phoneNumber: result.normalizedPhone,
          name: result.name || "Unverified Subscriber",
          network: result.network,
          isVerified: result.verified,
          source: result.source,
        }
      : undefined,
    error: result.error,
    warning: result.warning,
  });
});

// ── Call Sessions & Ledger (Dashboard & Simulator Tracing) ─────────────
apiRouter.get("/api/sessions", adminRateLimiter, (_req: Request, res: Response) => {
  res.json({
    sessions: callSessionRepository.getAllSessions(),
    demoModeActive: config.demoMode,
  });
});

apiRouter.get("/api/sessions/:sessionId", (req: Request, res: Response) => {
  const session = callSessionRepository.getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json({ success: true, session });
});

apiRouter.post("/api/sessions/:sessionId/turn", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const turn = req.body;
  if (!turn) {
    return res.status(400).json({ error: "Turn payload required" });
  }
  const turnItem = {
    id: turn.id || `turn_${Date.now()}`,
    turnNumber: typeof turn.turnNumber === "number" ? turn.turnNumber : 1,
    timestamp: turn.timestamp || new Date().toLocaleTimeString(),
    callerInput: turn.callerInput || "",
    callerChannel: turn.callerChannel || "VOICE",
    asrProvider: turn.asrProvider,
    asrConfidence: turn.asrConfidence,
    asrLatencyMs: turn.asrLatencyMs,
    intent: turn.intent,
    entitiesExtracted: turn.entitiesExtracted,
    assistantResponse: turn.assistantResponse || "",
    assistantAudioUrl: turn.assistantAudioUrl,
    ttsProvider: turn.ttsProvider,
    step: turn.step || "active",
    status: turn.status || "SUCCESS",
    rawAsrText: turn.rawAsrText,
  };
  const updated = callSessionRepository.addTurn(sessionId, turnItem);
  res.json({ success: true, session: updated });
});

apiRouter.post("/api/sessions/:sessionId/api-trace", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const trace = req.body;
  if (!trace) {
    return res.status(400).json({ error: "API trace payload required" });
  }
  const traceItem = {
    id: trace.id || `trace_${Date.now()}`,
    timestamp: trace.timestamp || new Date().toLocaleTimeString(),
    endpoint: trace.endpoint || "/unknown",
    method: trace.method || "POST",
    provider: trace.provider || "EXTERNAL",
    latencyMs: typeof trace.latencyMs === "number" ? trace.latencyMs : 0,
    httpStatus: typeof trace.httpStatus === "number" ? trace.httpStatus : 200,
    requestSummary: trace.requestSummary,
    responseSummary: trace.responseSummary,
    status: trace.status || "SUCCESS",
    errorMessage: trace.errorMessage,
  };
  const updated = callSessionRepository.addApiTrace(sessionId, traceItem);
  res.json({ success: true, session: updated });
});

apiRouter.post("/api/sessions/:sessionId/diagnostic", (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const diag = req.body;
  if (!diag) {
    return res.status(400).json({ error: "Diagnostic payload required" });
  }
  const diagItem = {
    id: diag.id || `diag_${Date.now()}`,
    timestamp: diag.timestamp || new Date().toLocaleTimeString(),
    type: diag.type || "INFO",
    message: diag.message || "",
    details: diag.details,
  };
  const updated = callSessionRepository.addDiagnostic(sessionId, diagItem);
  res.json({ success: true, session: updated });
});

apiRouter.get("/api/ledger", adminRateLimiter, (_req: Request, res: Response) => {
  res.json({ ledger: callSessionRepository.getLedger() });
});

// ── Structured Redacted Logs ──────────────────────────────────────────
apiRouter.get("/api/dev/logs/stream", (_req: Request, res: Response) => {
  res.json({ logs: auditLogger.getRecentLogs() });
});

// ── AI Evaluation Runner ──────────────────────────────────────────────
apiRouter.post("/api/eval/run", async (_req: Request, res: Response) => {
  try {
    const report = await runEvaluationHarness();
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: `Evaluation harness failed: ${err.message}` });
  }
});
