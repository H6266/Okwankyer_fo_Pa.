/**
 * Ɔkwankyerɛfo Pa - Voice Accessibility Layer for Ghana's Digital Financial Services
 * Main Server Entry Point
 */

import express, { Request, Response } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import helmet from "helmet";
import { WebSocketServer } from "ws";
import { config } from "./src/config/env";
import { auditLogger } from "./src/services/auditLogger";
import { resolveSafeAudioPath, streamAudioFile, PathTraversalError } from "./src/audio/streaming";
import { verifyAtWebhook } from "./src/providers/telephony/webhookGuard";
import { voiceRouter } from "./src/routes/voiceRoutes";
import { apiRouter } from "./src/routes/apiRoutes";
import { dashboardRouter } from "./src/routes/dashboardRoutes";
import { momoRouter } from "./src/routes/momoRoutes";
import { shippingRouter } from "./src/routes/shippingRoutes";
import { aiRouter } from "./src/routes/aiRoutes";
import { adminRouter } from "./src/routes/adminRoutes";
import { liveVoiceGateway } from "./src/ai_system/voice/liveVoiceGateway";
import { initialize as initAtClient } from "./africastalking";
import { requireAdminAuth } from "./src/middleware/adminAuth";
import { adminRateLimiter } from "./src/middleware/rateLimiter";
import { validateGhanaPhoneNumber } from "./src/domain/validation";

const app = express();

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

// Request body limits (strict 1MB limit for JSON and urlencoded)
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));

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

// Fallback for unmatched API routes to ensure clean JSON responses
app.all("/api/*", (_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: "API route not found" });
});

// ── Server Bootstrap & Frontend Serving ───────────────────────────────
async function startServer() {
  const isProd = config.nodeEnv === "production";
  const distClientDir = path.resolve(process.cwd(), "dist", "client");

  if (isProd && fs.existsSync(distClientDir)) {
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
        req.path === "/health" ||
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

  server.listen(config.port, "0.0.0.0", () => {
    console.log(`Ɔkwankyerɛfo Pa running on http://0.0.0.0:${config.port}`);
    auditLogger.log("info", "SYSTEM", `Server online on port ${config.port} (Env: ${config.nodeEnv})`);
  });
}

startServer();
