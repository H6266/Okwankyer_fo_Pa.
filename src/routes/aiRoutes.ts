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
import { requireAdminAuth } from "../middleware/adminAuth";
import { adminRateLimiter, publicApiRateLimiter } from "../middleware/rateLimiter";

export const aiRouter = Router();

aiRouter.get("/api/ai/status", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    system: "Ɔkwankyerɛfo Pa AI Subsystem",
    geminiConfigured: config.gemini.configured,
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

aiRouter.post("/api/ai/analyze", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { utterance, languageHint } = req.body;
    if (!utterance || typeof utterance !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'utterance' field." });
    }
    const result = await aiSystem.analyzeUtterance(utterance, languageHint || "bilingual");
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to analyze utterance" });
  }
});

aiRouter.post("/api/ai/transcribe", publicApiRateLimiter, async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType, language } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "Missing 'audioBase64' payload." });
    }
    const result = await aiSystem.transcribe({
      audioBuffer: audioBase64,
      mimeType: mimeType || "audio/webm",
      expectedLanguage: language || "bilingual",
    });
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
