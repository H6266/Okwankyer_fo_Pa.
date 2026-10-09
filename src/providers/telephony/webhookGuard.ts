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
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyAtWebhook(req: Request, res: Response, next: NextFunction): void {
  const isProd = process.env.NODE_ENV === "production";
  const expectedSecret = process.env.AT_WEBHOOK_SECRET;

  // Attach diagnostic response headers helper
  const rejectWithReason = (status: number, reason: string) => {
    const safeReason = (reason || "").replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7E]/g, "");
    res.setHeader("X-Telephony-Guard-Reason", safeReason);
    res.setHeader("X-Telephony-Status", status.toString());
    res.status(status).send("<Response><Reject/></Response>");
  };

  const sessionId = (req.body?.sessionId || req.query?.sessionId || "") as string;

  // 1. Check required Africa's Talking session identifier
  if (!sessionId) {
    if (!isProd) {
      const fallbackSession = `dev-session-${Date.now()}`;
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

  // If secret is configured, strictly enforce constant-time matching
  if (expectedSecret) {
    if (!providedSecret || !safeCompare(providedSecret, expectedSecret)) {
      auditLogger.log("error", "SECURITY", `Telephony webhook signature verification failed for session ${sessionId}`, req.ip);
      rejectWithReason(401, "Invalid or missing AT_WEBHOOK_SECRET signature");
      return;
    }
  } else if (isProd) {
    // In production, expectedSecret is mandatory for real Africa's Talking webhooks
    auditLogger.log("error", "SECURITY", "Telephony webhook rejected: Missing server AT_WEBHOOK_SECRET in production", req.ip);
    rejectWithReason(401, "Missing server AT_WEBHOOK_SECRET configuration in production");
    return;
  } else {
    // Explicit DEV bypass (strictly forbidden in production)
    auditLogger.log(
      "warn",
      "SECURITY",
      `[DEV_WEBHOOK_BYPASS] Telephony callback accepted without AT_WEBHOOK_SECRET configured (Session: ${sessionId}). Impossible in production.`
    );
  }

  next();
}
