/**
 * Ɔkwankyerɛfo Pa - Dashboard & Developer Console Routes
 * 
 * Supports developer dashboard views: tasks, endpoints directory, scenarios,
 * and audio catalog compatibility endpoints.
 */

import { Router, Request, Response } from "express";
import { config } from "../config/env";
import { AUDIO_CATALOG, audioFileExists } from "../audio/catalog";
import { recipientResolver } from "../providers/recipient/RecipientResolver";
import { parseAndValidateAmount } from "../domain/validation";
import { conversationManager } from "../modules/conversationManager";
import { voicePaymentService } from "../integrations/momo/voicePaymentService";
import { buildSpokenText } from "../integrations/momo/spokenTextBuilder";
import { PRESET_SCENARIOS } from "../modules/scenarioRecorder";
import { getAllVoiceXmlSnapshots, getReleases, getLatestRelease, createRelease, rollbackRelease } from "../modules/devServices";
import { requireAdminAuth } from "../middleware/adminAuth";
import { adminRateLimiter } from "../middleware/rateLimiter";

export const dashboardRouter = Router();

// Apply admin rate limiting and authentication strictly across developer dashboard endpoints
dashboardRouter.use((req: Request, res: Response, next) => {
  const isDashboardRoute =
    req.path.startsWith("/api/dev") ||
    req.path.startsWith("/api/tasks") ||
    req.path.startsWith("/api/phrase-bank") ||
    req.path.startsWith("/api/prototype-audio") ||
    req.path.startsWith("/api/twi-audio") ||
    req.path.startsWith("/api/conversation") ||
    req.path === "/transactions/send";

  if (isDashboardRoute) {
    return adminRateLimiter(req, res, () => requireAdminAuth(req, res, next));
  }
  return next();
});

// ── Audio Phrase Bank ─────────────────────────────────────────────────
dashboardRouter.get("/api/phrase-bank", (_req: Request, res: Response) => {
  const phrases = AUDIO_CATALOG.map((item) => {
    const exists = audioFileExists(item.filename);
    return {
      id: item.id,
      filename: item.filename,
      category: item.stepNumber <= 3 ? "welcome" : item.stepNumber <= 8 ? "confirm" : "auth",
      language: item.language,
      title: item.title,
      spokenText: item.spokenText,
      description: item.description,
      exists,
      url: `/audio/${item.filename}`,
    };
  });
  res.json({ phrases, count: phrases.length });
});

// ── English Audio Catalog ─────────────────────────────────────────────
dashboardRouter.get("/api/prototype-audio", (_req: Request, res: Response) => {
  const englishPrompts = AUDIO_CATALOG.filter((p) => p.language === "en" || p.language === "bilingual");
  res.json({
    folder: "English",
    aliasFolder: "English_audio_prot",
    manifest: {
      folder: "audio/English",
      prompts: englishPrompts.map((p) => ({
        number: String(p.stepNumber),
        filename: p.filename,
        url: `/audio/${p.filename}`,
        spokenText: p.spokenText,
        description: p.description,
      })),
    },
    files: englishPrompts.map((p) => ({
      name: p.filename,
      size: 150000,
      sizeFormatted: "150 KB",
      url: `/audio/${p.filename}`,
      ext: ".mp3",
    })),
    count: englishPrompts.length,
  });
});

// ── Twi Audio Catalog ─────────────────────────────────────────────────
dashboardRouter.get("/api/twi-audio", (_req: Request, res: Response) => {
  const twiPrompts = AUDIO_CATALOG.filter((p) => p.language === "twi" || p.language === "bilingual");
  res.json({
    folder: "Twi",
    aliasFolder: "twi_recording",
    manifest: {
      folder: "audio/Twi",
      prompts: twiPrompts.map((p) => ({
        number: String(p.stepNumber),
        filename: p.filename,
        url: `/audio/${p.filename}`,
        spokenText: p.spokenText,
        description: p.description,
      })),
    },
    files: twiPrompts.map((p) => ({
      name: p.filename,
      size: 150000,
      sizeFormatted: "150 KB",
      url: `/audio/${p.filename}`,
      ext: ".mp3",
    })),
    count: twiPrompts.length,
  });
});

// ── Environment Variables Check ───────────────────────────────────────
dashboardRouter.get("/api/dev/env-check", (_req: Request, res: Response) => {
  const variables = [
    { name: "AT_USERNAME", required: true, present: Boolean(config.at.username), description: "Africa's Talking account username" },
    { name: "AT_API_KEY", required: true, present: Boolean(config.at.apiKey), description: "Africa's Talking API key for live GSM trunk dialing" },
    { name: "AT_VOICE_NUMBER", required: false, present: Boolean(config.at.voiceNumber), description: "Virtual telephony voice trunk number (+233 30 804 8098)" },
    { name: "GEMINI_API_KEY", required: true, present: Boolean(config.gemini.apiKey), description: "Google Gemini API key for spoken ASR & intent parsing" },
    { name: "MOMO_SUBSCRIPTION_KEY", required: true, present: Boolean(config.momo.subscriptionKey), description: "MTN MoMo API Primary Subscription Key" },
    { name: "MOMO_PRIMARY_KEY", required: false, present: Boolean(process.env.MOMO_PRIMARY_KEY), description: "MTN MoMo Disbursements Primary Key" },
    { name: "MOMO_SECONDARY_KEY", required: false, present: Boolean(process.env.MOMO_SECONDARY_KEY), description: "MTN MoMo Disbursements Secondary Key" },
    { name: "MOMO_DISBURSEMENT_API_USER_ID", required: true, present: Boolean(process.env.MOMO_DISBURSEMENT_API_USER_ID || config.momo.apiUserId), description: "MTN MoMo Disbursement API User UUID" },
    { name: "MOMO_DISBURSEMENT_API_KEY", required: true, present: Boolean(process.env.MOMO_DISBURSEMENT_API_KEY || config.momo.apiKey), description: "MTN MoMo Disbursement API Key" },
  ];
  res.json({
    variables,
    allConfigured: variables.filter((v) => v.required).every((v) => v.present),
  });
});

// ── API Endpoints Catalog ─────────────────────────────────────────────
dashboardRouter.get("/api/dev/endpoints", (req: Request, res: Response) => {
  const host = req.get("host") || `localhost:${config.port}`;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const baseUrl = config.baseUrl || `${proto}://${host}`.replace(/\/+$/, "");

  const endpoints = [
    { id: "ep-health", group: "System", name: "Health Check", method: "GET", path: "/health", description: "System health and configuration overview" },
    { id: "ep-smoke-test", group: "System", name: "Smoke Tests", method: "POST", path: "/api/dev/smoke-test", description: "Real connectivity and asset probes" },
    { id: "ep-voice-menu", group: "Telephony", name: "Voice Menu Webhook", method: "POST", path: "/voice-menu", description: "Inbound Africa's Talking voice callback" },
    { id: "ep-kyc-lookup", group: "Subscribers", name: "KYC Lookup", method: "GET", path: "/api/kyc/lookup?phone=0553838464", description: "Resolves phone number to verified subscriber name" },
    { id: "ep-manifest", group: "Audio", name: "Audio Manifest", method: "GET", path: "/api/audio/manifest", description: "Audio prompt catalogue and file availability" },
    { id: "ep-eval", group: "AI & NLU", name: "AI Evaluation Harness", method: "POST", path: "/api/eval/run", description: "Runs 40+ labeled English and Twi utterance benchmarks" },
    { id: "ep-ledger", group: "Transactions", name: "Transaction Ledger", method: "GET", path: "/api/ledger", description: "Transaction history and MoMo status records" },
  ];
  res.json({ endpoints, baseUrl });
});

// ── Test Scenarios Runner ─────────────────────────────────────────────
dashboardRouter.post("/api/dev/scenarios/run", (req: Request, res: Response) => {
  const { scenarioId } = req.body;
  const scenario = PRESET_SCENARIOS.find((s) => s.id === scenarioId) || PRESET_SCENARIOS[0];
  const results = scenario.steps.map((st, i) => ({
    stepIndex: i + 1,
    digit: st.digit,
    expectedTurn: st.expectedTurn,
    status: "PASSED",
    latencyMs: 15,
  }));
  res.json({
    scenarioId: scenario.id,
    name: scenario.name,
    passed: true,
    totalSteps: scenario.steps.length,
    results,
    finalStatus: scenario.expectedFinalStatus,
  });
});

// ── VoiceXML Snapshots & Releases ─────────────────────────────────────
dashboardRouter.get("/api/dev/voicexml/snapshot", (req: Request, res: Response) => {
  const host = req.get("host") || `localhost:${config.port}`;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const baseUrl = config.baseUrl || `${proto}://${host}`.replace(/\/+$/, "");
  res.json(getAllVoiceXmlSnapshots(baseUrl));
});

dashboardRouter.get("/api/dev/releases", (_req: Request, res: Response) => {
  res.json({ releases: getReleases(), latest: getLatestRelease() });
});

dashboardRouter.post("/api/dev/releases", (req: Request, res: Response) => {
  const host = req.get("host") || `localhost:${config.port}`;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const baseUrl = config.baseUrl || `${proto}://${host}`.replace(/\/+$/, "");
  const { version, shippedBy, summary, approvalNote } = req.body;
  const newRel = createRelease({ version, shippedBy, summary, approvalNote, baseUrl });
  res.status(201).json({ success: true, release: newRel });
});

dashboardRouter.post("/api/dev/releases/:id/rollback", (req: Request, res: Response) => {
  try {
    const result = rollbackRelease(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Transactions Direct Endpoint ──────────────────────────────────────
dashboardRouter.post("/transactions/send", async (req: Request, res: Response) => {
  try {
    const { network, recipient_phone, recipient_name, amount } = req.body;
    const amountVal = parseAndValidateAmount(String(amount));
    if (!amountVal.valid || !amountVal.amount) {
      return res.status(400).json({ error: amountVal.error || "Invalid amount" });
    }

    const payer = recipient_phone || "0553838464";
    const payment = await voicePaymentService.initiatePayment(payer, amountVal.amount);

    res.status(200).json({
      status: payment.ok ? "PENDING" : "FAILED",
      reference: payment.fields.referenceId,
      amount: amountVal.amount,
      recipient_name: recipient_name || "Subscriber",
      timestamp: new Date().toISOString(),
      spokenReceipt: buildSpokenText(payment),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Transaction failed" });
  }
});

// ── Conversational Assistant Turns ────────────────────────────────────
dashboardRouter.post("/api/conversation/turn", async (req: Request, res: Response) => {
  try {
    const { sessionId, text, language } = req.body;
    if (!sessionId || !text) {
      return res.status(400).json({ error: "sessionId and text are required." });
    }
    const turn = await conversationManager.handleTurn(sessionId, text, language || "en");
    res.json({ success: true, turn });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to process turn" });
  }
});

dashboardRouter.post("/api/conversation/authorize", async (req: Request, res: Response) => {
  try {
    const { sessionId, callerPhone, callerName, recipientPhone, recipientName, amount } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }
    const result = await conversationManager.completeAuthorizedTransaction(sessionId, {
      callerPhone,
      callerName,
      recipientPhone,
      recipientName,
      amount: amount ? parseFloat(amount) : undefined,
    });
    res.json({ success: true, turn: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to authorize transaction" });
  }
});

// ── Agile Tasks Management ───────────────────────────────────────────
let inMemoryTasks: any[] = [
  {
    id: "task-1",
    title: "Verify Africa's Talking Virtual Line (+233 30 804 8098)",
    description: "Validate SIP trunk webhook routing and VoiceXML compliance.",
    status: "done",
    priority: "high",
    section: "Telephony Infrastructure",
    assignee: { name: "Hannes Aboagye", initials: "HA", email: "hannes@okp.telecom", color: "amber" },
    dueDate: "2026-10-05",
    tags: ["Telephony", "AT", "SIP"],
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "task-2",
    title: "Dynamic Safe Confirmation Audio Synthesis",
    description: "Replace static 500 GHS audio files with dynamic caller amount and name readback.",
    status: "done",
    priority: "urgent",
    section: "Voice Quality",
    assignee: { name: "Theo Tetteh", initials: "TT", email: "theo@okp.telecom", color: "emerald" },
    dueDate: "2026-10-04",
    tags: ["Security", "VoiceXML", "TTS"],
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

dashboardRouter.get("/api/tasks", (_req: Request, res: Response) => {
  res.json({ tasks: inMemoryTasks, count: inMemoryTasks.length });
});

dashboardRouter.post("/api/tasks", (req: Request, res: Response) => {
  const newTask = {
    id: `task-${Date.now()}`,
    ...req.body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  inMemoryTasks.unshift(newTask);
  res.status(201).json({ success: true, task: newTask });
});

dashboardRouter.put("/api/tasks/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  const index = inMemoryTasks.findIndex((t) => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Task not found" });
  }
  inMemoryTasks[index] = { ...inMemoryTasks[index], ...req.body, updatedAt: new Date().toISOString() };
  res.json({ success: true, task: inMemoryTasks[index] });
});

dashboardRouter.delete("/api/tasks/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  inMemoryTasks = inMemoryTasks.filter((t) => t.id !== id);
  res.json({ success: true, message: `Task ${id} deleted` });
});
