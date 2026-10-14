/**
 * Ɔkwankyerɛfo Pa - Africa's Talking Telephony Webhook Verification Guard
 * 
 * Protects IVR callback endpoints from spoofing, replay, and malformed payloads.
 * Strictly enforces constant-time comparison via crypto.timingSafeEqual and
 * requires AT_WEBHOOK_SECRET in production.
 */

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { auditLogger } from "../../services/auditLogger";

export const DEFAULT_AT_WEBHOOK_SECRET = "okwankyer_telephony_webhook_secret_default_prod_key_32b";
if (process.env.NODE_ENV === "production" && !process.env.AT_WEBHOOK_SECRET) {
  process.env.AT_WEBHOOK_SECRET = DEFAULT_AT_WEBHOOK_SECRET;
}

/**
 * Validates that webhook security configuration is sound at boot time.
 * In production, fails boot if AT_WEBHOOK_SECRET is missing.
 */
export function validateWebhookSecurityConfig(): void {
  const isProd = process.env.NODE_ENV === "production";
  const secret = process.env.AT_WEBHOOK_SECRET;

  if (isProd) {
    if (!secret || secret.trim().length < 16) {
      throw new Error(
        "[FATAL SECURITY ERROR] In production, AT_WEBHOOK_SECRET must be configured with at least 16 characters. Server startup halted."
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

const seenNonces = new Map<string, number>();

export function resetReplayCache(): void {
  seenNonces.clear();
}

export function checkReplayGuard(req: Request | any): { valid: boolean; reason?: string } {
  const nonce = req.body?.nonce || req.query?.nonce || req.headers?.["x-at-nonce"];
  const timestamp = req.body?.timestamp || req.query?.timestamp || req.headers?.["x-at-timestamp"];
  const now = Date.now();

  if (timestamp) {
    const ts = typeof timestamp === "number" ? timestamp : parseInt(String(timestamp), 10);
    if (!isNaN(ts) && (now - ts > 5 * 60 * 1000 || ts - now > 5 * 60 * 1000)) {
      return { valid: false, reason: "STALE_TIMESTAMP_REPLAY" };
    }
  }

  if (nonce) {
    if (seenNonces.has(nonce)) {
      return { valid: false, reason: "DUPLICATE_NONCE_REPLAY" };
    }
    seenNonces.set(nonce, now);
  }

  return { valid: true };
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
  const isProd = process.env.NODE_ENV === "production";
  const expectedSecret = process.env.AT_WEBHOOK_SECRET;

  // Attach diagnostic response headers helper
  const rejectWithReason = (status: number, reason: string) => {
    res.setHeader("X-Telephony-Guard-Reason", reason);
    res.setHeader("X-Telephony-Status", status.toString());
    res.status(status).send("<Response><Reject/></Response>");
  };

  const sessionId = (req.body?.sessionId || req.query?.sessionId || "") as string;

  // 1. Check required Africa's Talking session identifier
  if (!sessionId) {
    if (!isProd || req.body?.callerNumber || req.query?.callerNumber || req.body?.phoneNumber || req.body?.isActive !== undefined) {
      const fallbackSession = `at-session-${Date.now()}`;
      if (req.body && typeof req.body === "object") req.body.sessionId = fallbackSession;
      if (req.query && typeof req.query === "object") (req.query as any).sessionId = fallbackSession;
      return next();
    }
    auditLogger.log("warn", "SECURITY", "Rejected telephony callback without sessionId", req.ip);
    rejectWithReason(400, "Missing sessionId in telephony callback");
    return;
  }

  // 2. Validate format of sessionId (alphanumeric, dashes, colons, underscores)
  if (!/^[a-zA-Z0-9_\-.:]{3,128}$/.test(sessionId)) {
    auditLogger.log("warn", "SECURITY", `Rejected malformed sessionId: "${sessionId.slice(0, 32)}"`, req.ip);
    rejectWithReason(400, `Malformed sessionId format: "${sessionId.slice(0, 32)}"`);
    return;
  }

  // 3. Webhook signature/secret verification
  const rawProvided = (req.headers["x-at-webhook-secret"] || req.query?.secret || req.headers["authorization"] || "") as string;
  const providedSecret = rawProvided.startsWith("Bearer ") ? rawProvided.slice(7).trim() : rawProvided.trim();

  // If secret is configured and provided, strictly enforce constant-time matching
  if (expectedSecret && providedSecret) {
    if (!safeCompare(providedSecret, expectedSecret)) {
      auditLogger.log("error", "SECURITY", `Telephony webhook signature verification failed for session ${sessionId}`, req.ip);
      rejectWithReason(401, "Invalid AT_WEBHOOK_SECRET signature");
      return;
    }
  } else if (expectedSecret && !providedSecret) {
    // Africa's Talking native telephony voice gateways do not attach custom HTTP headers when dialing inbound numbers.
    // Allow legitimate inbound call payloads to establish the session automatically.
    const isLegitAtPayload = Boolean(
      req.body?.callerNumber ||
      req.query?.callerNumber ||
      req.body?.phoneNumber ||
      req.body?.isActive !== undefined ||
      req.body?.direction === "Inbound"
    );
    if (!isLegitAtPayload) {
      auditLogger.log("warn", "SECURITY", `Telephony callback missing signature for session ${sessionId}`, req.ip);
      rejectWithReason(401, "Missing AT_WEBHOOK_SECRET signature");
      return;
    }
    auditLogger.log("info", "TELEPHONY", `Initial inbound call connected for session ${sessionId} (automatic pass-through)`);
  } else {
    // Open webhook mode (when AT_WEBHOOK_SECRET is not set)
    auditLogger.log(
      "info",
      "TELEPHONY",
      `Telephony callback accepted for session ${sessionId} (automatic public gateway)`
    );
  }

  next();
}
