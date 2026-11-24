/**
 * Ɔkwankyerɛfo Pa - Africa's Talking Telephony Webhook Verification Guard
 * 
 * Verifies shared-secret ingress and short-lived, session-bound callback capabilities.
 */

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { auditLogger } from "../../services/auditLogger";

export const DEFAULT_AT_WEBHOOK_SECRET = "okwankyer_telephony_webhook_secret_default_prod_key_32b";
const CALLBACK_CAPABILITY_TTL_MS = 5 * 60 * 1000;
const usedCallbackNonces = new Map<string, number>();
const authenticatedEntrySessions = new Map<string, number>();
const callbackProcessId = crypto.randomBytes(16).toString("hex");
const ENTRY_SESSION_REPLAY_TTL_MS = 24 * 60 * 60 * 1000;
const INITIAL_CALLBACK_PATHS = new Set([
  "/",
  "/voice-menu",
  "/voice",
  "/voice/callback",
  "/voice/webhook",
  "/voice-callback",
  "/callback",
  "/telephony/callback",
  "/api/voice",
  "/api/voice/callback",
]);

/**
 * Validates that webhook security configuration is sound at boot time.
 * In production, fails boot if AT_WEBHOOK_SECRET is missing or weak.
 */
export function validateWebhookSecurityConfig(): void {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.AT_WEBHOOK_SECRET;

  if (isProd) {
    if (!secret || secret.trim().length < 32 || secret === DEFAULT_AT_WEBHOOK_SECRET) {
      throw new Error(
        "[FATAL SECURITY ERROR] In production, AT_WEBHOOK_SECRET must be an independently generated secret of at least 32 characters. Server startup halted."
      );
    }
  }
}

/**
 * Constant-time string equality check to prevent timing side-channel attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

interface CallbackCapability {
  sessionId: string;
  path: string;
  expiresAt: number;
  nonce: string;
  processId: string;
}

export function createCallbackCapability(sessionId: string, callbackPath: string): string {
  const secret = process.env.AT_WEBHOOK_SECRET;
  if (!secret || secret.trim().length < 32 || secret === DEFAULT_AT_WEBHOOK_SECRET) {
    throw new Error("A strong AT_WEBHOOK_SECRET is required to issue callback capabilities.");
  }
  const payload: CallbackCapability = {
    sessionId,
    path: callbackPath,
    expiresAt: Date.now() + CALLBACK_CAPABILITY_TTL_MS,
    nonce: crypto.randomBytes(16).toString("base64url"),
    processId: callbackProcessId,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyCallbackCapability(
  token: string,
  sessionId: string,
  callbackPath: string,
): { valid: boolean; reason?: string } {
  const secret = process.env.AT_WEBHOOK_SECRET;
  if (!secret || secret.trim().length < 32 || secret === DEFAULT_AT_WEBHOOK_SECRET) {
    return { valid: false, reason: "CALLBACK_SIGNING_KEY_UNAVAILABLE" };
  }
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) {
    return { valid: false, reason: "MALFORMED_CALLBACK_CAPABILITY" };
  }
  const expectedSignature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  if (!safeCompare(suppliedSignature, expectedSignature)) {
    return { valid: false, reason: "INVALID_CALLBACK_CAPABILITY" };
  }

  let payload: CallbackCapability;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CallbackCapability;
  } catch {
    return { valid: false, reason: "MALFORMED_CALLBACK_CAPABILITY" };
  }
  const now = Date.now();
  if (
    payload.sessionId !== sessionId ||
    payload.path !== callbackPath ||
    payload.processId !== callbackProcessId ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= now ||
    payload.expiresAt > now + CALLBACK_CAPABILITY_TTL_MS ||
    typeof payload.nonce !== "string" ||
    !payload.nonce
  ) {
    return { valid: false, reason: "CALLBACK_CAPABILITY_SCOPE_OR_EXPIRY_INVALID" };
  }

  for (const [nonce, expiry] of usedCallbackNonces) {
    if (expiry <= now) usedCallbackNonces.delete(nonce);
  }
  if (usedCallbackNonces.has(payload.nonce)) {
    return { valid: false, reason: "CALLBACK_CAPABILITY_REPLAYED" };
  }
  usedCallbackNonces.set(payload.nonce, payload.expiresAt);
  return { valid: true };
}

export function resetCallbackCapabilities(): void {
  usedCallbackNonces.clear();
  authenticatedEntrySessions.clear();
}

const callerCounts = new Map<string, { count: number; resetAt: number }>();

export function resetCallerRateLimits(): void {
  callerCounts.clear();
}

export function checkCallerRateLimit(caller: string, limit: number = 30): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = callerCounts.get(caller);
  if (!entry || now > entry.resetAt) {
    callerCounts.set(caller, { count: 1, resetAt: now + 60000 });
    return { allowed: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: limit - entry.count };
}

export function verifyAtWebhook(req: Request, res: Response, next: NextFunction): void {
  const expectedSecret = process.env.AT_WEBHOOK_SECRET;

  // Attach diagnostic response headers helper
  const rejectWithReason = (status: number, reason: string) => {
    res.setHeader("X-Telephony-Guard-Reason", reason);
    res.setHeader("X-Telephony-Status", status.toString());
    res.status(status).send("<Response><Reject/></Response>");
  };

  const sessionId = String(req.body?.sessionId || req.query?.sessionId || "");
  if (!sessionId) {
    auditLogger.log("warn", "SECURITY", "Rejected telephony callback without sessionId", req.ip);
    rejectWithReason(400, "Missing sessionId in telephony callback");
    return;
  }

  if (!/^[a-zA-Z0-9_\-.:]{3,128}$/.test(sessionId)) {
    auditLogger.log("warn", "SECURITY", "Rejected malformed telephony sessionId", req.ip);
    rejectWithReason(400, "Malformed sessionId format");
    return;
  }

  const rawProvided = (req.headers["x-at-webhook-secret"] || req.headers["authorization"] || "") as string;
  const providedSecret = rawProvided.startsWith("Bearer ") ? rawProvided.slice(7).trim() : rawProvided.trim();
  const capability = req.query?.callbackCapability;
  if (typeof capability === "string") {
    const result = verifyCallbackCapability(capability, sessionId, req.path);
    if (result.valid) return next();
    auditLogger.log("warn", "SECURITY", `Rejected telephony callback capability: ${result.reason}`, req.ip);
    rejectWithReason(401, "Invalid or expired callback capability");
    return;
  }

  if (
    expectedSecret &&
    providedSecret &&
    safeCompare(providedSecret, expectedSecret) &&
    INITIAL_CALLBACK_PATHS.has(req.path)
  ) {
    const now = Date.now();
    for (const [knownSession, expiry] of authenticatedEntrySessions) {
      if (expiry <= now) authenticatedEntrySessions.delete(knownSession);
    }
    if (authenticatedEntrySessions.has(sessionId)) {
      auditLogger.log("warn", "SECURITY", "Rejected replayed initial telephony callback", req.ip);
      rejectWithReason(401, "Initial callback already received for this session");
      return;
    }
    authenticatedEntrySessions.set(sessionId, now + ENTRY_SESSION_REPLAY_TTL_MS);
    return next();
  }

  if (process.env.NODE_ENV !== "production" && !expectedSecret) {
    return next();
  }

  auditLogger.log("warn", "SECURITY", "Rejected unauthenticated telephony callback", req.ip);
  rejectWithReason(401, expectedSecret ? "Missing or invalid callback authentication" : "Callback authentication is not configured");
}
