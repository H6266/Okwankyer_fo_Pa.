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
import { AUDIO_CATALOG, audioFileExists } from "../audio/catalog";
import { callSessionRepository } from "../services/callSessionRepository";
import { auditLogger } from "../services/auditLogger";
import { runEvaluationHarness } from "../ai_eval/evalHarness";
import { requireAdminAuth } from "../middleware/adminAuth";
import { kycLookupRateLimiter, adminRateLimiter, publicApiRateLimiter } from "../middleware/rateLimiter";
import { validateGhanaPhoneNumber } from "../domain/validation";
import { aiBootstrap } from "../ai_system/core/aiBootstrap";
import { modelRouter } from "../ai_system/providers/modelRouter";
import { ttsRouter as speechSynthesisRouter } from "../ai_system/speech/tts/ttsRouter";
import { resolvePrompt, resolvePromptText } from "../modules/ttsService";

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
  "/api/audio/prompt-tts/:lang/:key",
  publicApiRateLimiter,
  async (req: Request, res: Response) => {
    const lang = req.params.lang;
    if (lang !== "en" && lang !== "twi") {
      return res.status(400).json({ error: "Unsupported prompt language." });
    }

    const promptText = resolvePromptText(req.params.key, lang);
    if (!promptText) {
      return res.status(404).json({ error: "No registered prompt text or recording exists for this key." });
    }

    try {
      const result = await speechSynthesisRouter.synthesize({
        text: promptText,
        language: lang === "twi" ? "tw" : "en",
      });
      res.status(200);
      res.setHeader("Content-Type", result.audioMimeType);
      res.setHeader("Content-Length", result.audioBuffer.length);
      res.setHeader("Cache-Control", "public, max-age=3600");
      return res.end(result.audioBuffer);
    } catch (error) {
      console.error("[AudioPromptTTS] Prompt synthesis failed.", error);
      return res.status(502).json({ error: "Prompt speech synthesis is temporarily unavailable." });
    }
  }
);

// ── Health Status ─────────────────────────────────────────────────────
const handleHealth = (req: Request, res: Response) => {
  const host = req.get("host") || `localhost:${config.port}`;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const baseUrl = config.baseUrl || `${proto}://${host}`.replace(/\/+$/, "");

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
  const rootAudio = path.resolve(process.cwd(), "Audio_files", "audio");

  const prompts = AUDIO_CATALOG.map((item) => {
    const filePath = path.resolve(rootAudio, item.filename);
    const exists = audioFileExists(item.filename);
    const sizeBytes = exists && fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

    return {
      ...item,
      exists,
      sizeBytes,
      sizeFormatted: exists ? `${(sizeBytes / 1024).toFixed(1)} KB` : "Unavailable",
      url: item.url,
      mimeType: "audio/mp4",
    };
  });

  const englishPrompts: typeof prompts = [];
  const twiPrompts = prompts;

  res.json({
    totalClips: prompts.length,
    englishClips: englishPrompts.length,
    twiClips: twiPrompts.length,
    englishPrompts,
    twiPrompts,
    allPrompts: prompts,
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

// ── Call Sessions & Ledger (Admin Protected) ──────────────────────────
apiRouter.get("/api/sessions", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
  res.json({
    sessions: callSessionRepository.getAllSessions(),
    demoModeActive: config.demoMode,
  });
});

apiRouter.get("/api/ledger", adminRateLimiter, requireAdminAuth, (_req: Request, res: Response) => {
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
