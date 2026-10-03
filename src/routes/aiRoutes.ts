/**
 * Ɔkwankyerɛfo Pa - AI Subsystem Routes
 * 
 * Provides endpoints for ASR transcription, speech synthesis, utterance analysis,
 * and multi-turn dialogue management.
 */

import { Router, Request, Response } from "express";
import { aiSystem } from "../ai_system";
import { config } from "../config/env";
import { runEvaluationHarness, runAudioEvaluationHarness } from "../ai_eval/evalHarness";
import { aiBootstrap } from "../ai_system/core/aiBootstrap";
import { requireAdminAuth } from "../middleware/adminAuth";
import { adminRateLimiter } from "../middleware/rateLimiter";

export const aiRouter = Router();

aiRouter.get("/api/ai/status", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    system: "Ɔkwankyerɛfo Pa AI Subsystem",
    geminiConfigured: config.gemini.configured,
    languages: ["en", "twi"],
    zeroPinEnforced: true,
  });
});

// Item 3.4: Production AI health probe
aiRouter.get("/api/ai/health", async (_req: Request, res: Response) => {
  const start = performance.now();
  const diag = aiBootstrap.getDiagnostics();
  const latencyMs = performance.now() - start;
  res.json({
    status: diag.models.reasoning.valid ? "HEALTHY" : "DEGRADED",
    models: diag.models,
    modelsVerifiedAgainstSdk: diag.modelsVerifiedAgainstSdk,
    sdkVerifiedModels: diag.sdkVerifiedModels,
    providers: diag.providers,
    security: diag.security,
    memory: diag.memory,
    latencyMs,
  });
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

aiRouter.post("/api/ai/process", async (req: Request, res: Response) => {
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

aiRouter.post("/api/ai/analyze", async (req: Request, res: Response) => {
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

aiRouter.post("/api/ai/transcribe", async (req: Request, res: Response) => {
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

aiRouter.post("/api/ai/dialogue/turn", async (req: Request, res: Response) => {
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

aiRouter.post("/api/ai/synthesize", async (req: Request, res: Response) => {
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
aiRouter.post("/api/ai/intent-to-momo", async (req: Request, res: Response) => {
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
      parsedRecipient = parsedRecipient || intentResult.recipient_phone || intentResult.recipient_name || "0553838464";
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

    // Step 1: Create transaction in Central Transaction Service
    const tx = momoProvider.createTransaction({
      operation: parsedOp,
      recipientPhone: parsedRecipient,
      amount: parsedAmount,
      channel: "AI_VOICE",
      payerPhone: payerPhone || "0553838464",
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
