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
import { kycLookupRateLimiter, adminRateLimiter } from "../middleware/rateLimiter";
import { validateGhanaPhoneNumber } from "../domain/validation";

export const apiRouter = Router();

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
  const rootAudio = path.resolve(process.cwd(), "audio");

  const prompts = AUDIO_CATALOG.map((item) => {
    const filePath = path.resolve(rootAudio, item.filename);
    const exists = audioFileExists(item.filename);
    let sizeBytes = 0;
    if (exists && fs.existsSync(filePath)) {
      try {
        sizeBytes = fs.statSync(filePath).size;
      } catch {}
    }

    return {
      ...item,
      exists,
      sizeBytes,
      sizeFormatted: exists ? `${(sizeBytes / 1024).toFixed(1)} KB` : "Dynamic TTS",
      url: `/audio/${item.filename}`,
    };
  });

  const englishPrompts = prompts.filter((p) => p.language === "en" || p.language === "bilingual");
  const twiPrompts = prompts.filter((p) => p.language === "twi" || p.language === "bilingual");

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
