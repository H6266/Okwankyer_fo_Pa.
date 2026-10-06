/**
 * Ɔkwankyerɛfo Pa - Africa's Talking Telephony Webhook Verification Guard
 * 
 * Protects IVR callback endpoints from spoofing, replay, and malformed payloads:
 * 1. Request Authenticity: Constant-time comparison (crypto.timingSafeEqual) with AT_WEBHOOK_SECRET.
 * 2. Replay Protection: Sliding window nonce / timestamp caching rejecting duplicate or stale requests.
 * 3. Per-Caller Rate Limiting: Throttles abusive or looping callers to prevent telephony exhaustion.
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
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// ── REPLAY ATTACK DEFENSE ───────────────────────────────────────────────────

interface ReplayEntry {
  timestamp: number;
}

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes window
const seenNonces = new Map<string, ReplayEntry>();

export function checkReplayGuard(req: Request): { valid: boolean; reason?: string } {
  const now = Date.now();

  // Clean expired nonces older than REPLAY_WINDOW_MS
  for (const [key, entry] of seenNonces.entries()) {
    if (now - entry.timestamp > REPLAY_WINDOW_MS) {
      seenNonces.delete(key);
    }
  }

  const sessionId = (req.body?.sessionId || req.query?.sessionId || "") as string;
  const nonce = (
    req.headers["x-at-nonce"] ||
    req.headers["x-request-id"] ||
    req.body?.nonce ||
    req.query?.nonce ||
    ""
  ) as string;

  const timestampHeader = (
    req.headers["x-at-timestamp"] ||
    req.body?.timestamp ||
    req.query?.timestamp ||
    ""
  ) as string;

  // 1. Check timestamp freshness if provided
  if (timestampHeader) {
    const reqTime = parseInt(timestampHeader, 10);
    if (!isNaN(reqTime)) {
      const ageMs = Math.abs(now - reqTime);
      if (ageMs > REPLAY_WINDOW_MS) {
        return { valid: false, reason: "STALE_TIMESTAMP_REPLAY" };
      }
    }
  }

  // 2. Check nonce uniqueness if provided
  if (nonce) {
    const nonceKey = `${sessionId}:${nonce}`;
    if (seenNonces.has(nonceKey)) {
      return { valid: false, reason: "DUPLICATE_NONCE_REPLAY" };
    }
    seenNonces.set(nonceKey, { timestamp: now });
  }

  return { valid: true };
}

export function resetReplayCache(): void {
  seenNonces.clear();
}

// ── PER-CALLER RATE LIMITING ────────────────────────────────────────────────

interface CallerRateRecord {
  count: number;
  resetAt: number;
}

const CALLER_RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_CALLER_PER_MINUTE = 15;
const callerLimits = new Map<string, CallerRateRecord>();

export function checkCallerRateLimit(
  callerPhone: string,
  limit: number = MAX_REQUESTS_PER_CALLER_PER_MINUTE
): { allowed: boolean; remaining: number } {
  if (!callerPhone) {
    return { allowed: true, remaining: limit };
  }

  const now = Date.now();
  const cleanPhone = callerPhone.replace(/\D/g, "");
  const record = callerLimits.get(cleanPhone);

  if (!record || now >= record.resetAt) {
    callerLimits.set(cleanPhone, {
      count: 1,
      resetAt: now + CALLER_RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, remaining: limit - 1 };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  record.count++;
  return { allowed: true, remaining: limit - record.count };
}

export function resetCallerRateLimits(): void {
  callerLimits.clear();
}

// ── MAIN TELEPHONY WEBHOOK VERIFICATION MIDDLEWARE ──────────────────────────

export function verifyAtWebhook(req: Request, res: Response, next: NextFunction): void {
  const isProd = process.env.NODE_ENV === "production";
  const expectedSecret = process.env.AT_WEBHOOK_SECRET;

  const sessionId = (req.body?.sessionId || req.query?.sessionId || "") as string;
  const callerNumber = (
    req.body?.callerNumber ||
    req.query?.callerNumber ||
    req.body?.phoneNumber ||
    req.query?.phoneNumber ||
    ""
  ) as string;

  // 1. Check required Africa's Talking session identifier
  if (!sessionId) {
    auditLogger.log("warn", "SECURITY", "Rejected telephony callback without sessionId", req.ip);
    res.status(400).send("<Response><Reject/></Response>");
    return;
  }

  // 2. Validate format of sessionId (alphanumeric, dashes, colons, underscores)
  if (!/^[a-zA-Z0-9_\-.:]{3,128}$/.test(sessionId)) {
    auditLogger.log("warn", "SECURITY", `Rejected malformed sessionId: "${sessionId.slice(0, 32)}"`, req.ip);
    res.status(400).send("<Response><Reject/></Response>");
    return;
  }

  // 3. Webhook signature/secret verification
  const rawProvided = (
    req.headers["x-at-webhook-secret"] ||
    req.query?.secret ||
    req.headers["authorization"] ||
    ""
  ) as string;
  const providedSecret = rawProvided.startsWith("Bearer ") ? rawProvided.slice(7).trim() : rawProvided.trim();

  // If secret is configured, strictly enforce constant-time matching
  if (expectedSecret) {
    if (!providedSecret || !safeCompare(providedSecret, expectedSecret)) {
      auditLogger.log("error", "SECURITY", `Telephony webhook signature verification failed for session ${sessionId}`, req.ip);
      res.status(401).send("<Response><Reject/></Response>");
      return;
    }
  } else if (isProd) {
    auditLogger.log("error", "SECURITY", "Telephony webhook rejected: Missing server AT_WEBHOOK_SECRET in production", req.ip);
    res.status(401).send("<Response><Reject/></Response>");
    return;
  }

  // 4. Replay Guard
  const replayResult = checkReplayGuard(req);
  if (!replayResult.valid) {
    auditLogger.log(
      "warn",
      "SECURITY",
      `Telephony webhook replay detected (${replayResult.reason}) for session ${sessionId}`,
      req.ip
    );
    res.status(409).send("<Response><Reject/></Response>");
    return;
  }

  // 5. Per-Caller Rate Limiting
  if (callerNumber) {
    const rateCheck = checkCallerRateLimit(callerNumber);
    if (!rateCheck.allowed) {
      auditLogger.log(
        "warn",
        "SECURITY",
        `Per-caller rate limit exceeded for session ${sessionId} (Caller: masked)`,
        req.ip
      );
      res.status(429).send("<Response><Reject/></Response>");
      return;
    }
  }

  next();
}
