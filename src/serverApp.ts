/**
 * Ɔkwankyerɛfo Pa - Voice Accessibility Layer for Ghana's Digital Financial Services
 * Main Express & WebSocket Application Logic
 */

import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import helmet from "helmet";
import { WebSocketServer } from "ws";
import { config } from "./config/env";
import { auditLogger } from "./services/auditLogger";
import { resolveSafeAudioPath, streamAudioFile, PathTraversalError } from "./audio/streaming";
import { voiceRouter } from "./routes/voiceRoutes";
import { apiRouter } from "./routes/apiRoutes";
import { dashboardRouter } from "./routes/dashboardRoutes";
import { momoRouter } from "./routes/momoRoutes";
import { shippingRouter } from "./routes/shippingRoutes";
import { aiRouter } from "./routes/aiRoutes";
import { adminRouter } from "./routes/adminRoutes";
import { pilotRouter } from "./routes/pilotRoutes";
import { liveVoiceGateway } from "./ai_system/voice/liveVoiceGateway";
import { initialize as initAtClient } from "../africastalking";
import { requireAdminAuth } from "./middleware/adminAuth";
import { adminRateLimiter } from "./middleware/rateLimiter";
import { validateGhanaPhoneNumber } from "./domain/validation";
import { aiBootstrap } from "./ai_system/core/aiBootstrap";
import { validateProductionModelConfig } from "./ai_system/brain/brain";
import { approvalWorkflow } from "./ai_system/brain/approvalWorkflow";

const app = express();

// Trust reverse proxy (Google Cloud Run / Load Balancers) to read X-Forwarded-For correctly
app.set("trust proxy", 1);

// ── Security Middleware ───────────────────────────────────────────────
// Helmet configured for iframe embedding in AI Studio and mobile preview
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
  })
);

// CORS Allowlist
app.use((req: Request, res: Response, next) => {
  const origin = req.headers.origin as string;
  if (config.corsOrigins.includes("*") || (origin && config.corsOrigins.includes(origin))) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-reference-id, x-reference_id");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Request body limits (50MB to support audio recordings, ASR audio streams, and base64 uploads)
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

// Graceful handler for payload too large errors
app.use((err: any, _req: Request, res: Response, next: any) => {
  if (err && (err.type === "entity.too.large" || err.status === 413 || err.name === "PayloadTooLargeError")) {
    return res.status(413).json({
      success: false,
      error: "Payload too large. Audio file size exceeds maximum upload limit (50MB).",
    });
  }
  next(err);
});

// Static public directory (disable index to let Vite/SPA handle index.html)
app.use(express.static(path.resolve(process.cwd(), "public"), { index: false }));

// ── Safe Audio Streaming (HTTP 206 Partial Content + Path Traversal Guard) ─
app.all("/audio/*", (req: Request, res: Response) => {
  const rawSubpath = decodeURIComponent((req.params as any)[0] || "");
  try {
    const safePath = resolveSafeAudioPath(rawSubpath);
    if (!safePath) {
      return res.status(404).send("Audio file not found.");
    }
    streamAudioFile(req, res, safePath);
  } catch (err: any) {
    if (err instanceof PathTraversalError) {
      auditLogger.log("error", "SECURITY", `Path traversal attempt detected: ${rawSubpath}`, req.ip);
      return res.status(403).send("Forbidden: Invalid audio path traversal.");
    }
    res.status(500).send("Internal server error streaming audio.");
  }
});

// ── Telephony Outbound Callback Helper (Admin Protected) ──────────────
app.post("/ussd-trigger", adminRateLimiter, requireAdminAuth, async (req: Request, res: Response) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return res.status(400).json({ error: "Missing required 'phoneNumber' field." });
  }

  const phoneValidation = validateGhanaPhoneNumber(phoneNumber);
  if (!phoneValidation.valid || !phoneValidation.normalized) {
    return res.status(400).json({ error: phoneValidation.error || "Invalid Ghanaian phone number format." });
  }

  if (!config.at.configured) {
    auditLogger.log("info", "TELEPHONY", `Outbound call simulated for ${phoneValidation.normalized}`);
    return res.json({ success: true, simulated: true, message: "Outbound call simulated (no live AT credentials)." });
  }

  try {
    const at = initAtClient(config.at.username, config.at.apiKey);
    const result = await at.Voice.call({
      callFrom: config.at.voiceNumber,
      callTo: [phoneValidation.normalized],
    });
    auditLogger.log("info", "TELEPHONY", `Outbound call triggered to ${phoneValidation.normalized}`);
    res.json({ success: true, result });
  } catch (err: any) {
    auditLogger.log("error", "TELEPHONY", `Outbound call failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Mount Routers ─────────────────────────────────────────────────────
// Telephony voice routes with Africa's Talking webhook verification
app.use(voiceRouter);

// Public API & Developer routes
app.use(apiRouter);
app.use(dashboardRouter);
app.use(momoRouter);
app.use(shippingRouter);
app.use(aiRouter);
app.use(adminRouter);
app.use(pilotRouter);

// Fallback for unmatched API routes to ensure clean JSON responses
app.all("/api/*", (_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: "API route not found" });
});

// ── Server Bootstrap & Frontend Serving ───────────────────────────────
export async function startServer() {
  // Production Invariant Gates: Refuse startup on unapproved text or missing model
  try {
    validateProductionModelConfig();
    approvalWorkflow.validateProductionApprovals();
  } catch (err: any) {
    if (process.env.NODE_ENV === "production") {
      console.error("FATAL: Production Readiness Hardening Violation:", err.message);
      throw err;
    } else {
      console.warn("⚠️ Production readiness notice:", err.message);
    }
  }

  // Initialize AI Cognitive Core subsystem
  try {
    const bootReport = await aiBootstrap.initialize();
    console.log(`🤖 AI Cognitive Core Initialized: ${bootReport.status}`);
    auditLogger.log("info", "AI_BOOTSTRAP", `AI Core initialized with status: ${bootReport.status}`);
  } catch (err: any) {
    console.warn("⚠️ AI Core initialization warning:", err.message);
  }

  const isDev =
    process.env.npm_lifecycle_event === "dev" ||
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test";

  const distClientDir = path.resolve(process.cwd(), "dist", "client");
  const hasClientBundle = fs.existsSync(path.resolve(distClientDir, "index.html"));

  if (hasClientBundle && !isDev) {
    console.log(`📦 Serving production client bundle from ${distClientDir}`);
    app.use(express.static(distClientDir));
    app.get("*", (req: Request, res: Response, next) => {
      if (
        req.path.startsWith("/api") ||
        req.path.startsWith("/audio") ||
        req.path.startsWith("/voice") ||
        req.path.startsWith("/language") ||
        req.path.startsWith("/service") ||
        req.path.startsWith("/provider") ||
        req.path.startsWith("/action") ||
        req.path.startsWith("/enter") ||
        req.path.startsWith("/verify") ||
        req.path.startsWith("/safe") ||
        req.path.startsWith("/speech") ||
        req.path.startsWith("/momo") ||
        req.path.startsWith("/health") ||
        req.path === "/voice-menu"
      ) {
        return next();
      }
      res.sendFile(path.resolve(distClientDir, "index.html"));
    });
  } else {
    try {
      console.log("⚡ Mounting Vite dev server middleware...");
      const { createServer } = await import("vite");
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn("⚠️ Vite middleware notice:", err);
    }
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  liveVoiceGateway.attachServer(wss);

  const activePort = 3000;
  server.listen(activePort, "0.0.0.0", () => {
    console.log(`Ɔkwankyerɛfo Pa running on http://0.0.0.0:${activePort}`);
    auditLogger.log("info", "SYSTEM", `Server online on port ${activePort} (Env: ${config.nodeEnv})`);
  });

  return { app, server, wss };
}

// Auto-start if executed directly or bundled
startServer().catch((err) => {
  console.error("FATAL: Server startup failed:", err);
  process.exit(1);
});
