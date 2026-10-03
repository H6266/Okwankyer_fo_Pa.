/**
 * Ɔkwankyerɛfo Pa - Strict Admin Authentication Middleware
 * 
 * Enforces:
 * 1. Bearer token authentication via ADMIN_TOKEN.
 * 2. Constant-time comparison to prevent timing attacks.
 * 3. High-entropy token length requirement in production (min 16 chars).
 * 4. Audit logging of all authentication failures with caller IP.
 */

import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../config/env";
import { auditLogger } from "../services/auditLogger";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function validateAdminSecurityConfig(): void {
  const isProd = process.env.NODE_ENV === "production";
  const token = process.env.ADMIN_TOKEN;

  if (isProd) {
    if (!token || token.trim().length < 16) {
      throw new Error(
        "[FATAL SECURITY ERROR] In production, ADMIN_TOKEN must be configured with at least 16 characters. Server startup halted."
      );
    }
  }
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const expectedToken = config.adminToken;
  const isProd = config.nodeEnv === "production";

  if (!expectedToken) {
    if (isProd) {
      auditLogger.log("error", "SECURITY", "Admin endpoint accessed with unconfigured ADMIN_TOKEN in production", req.ip);
      res.status(500).json({ error: "Server configuration error: ADMIN_TOKEN missing in production." });
      return;
    }
    // Non-production dev notice
    auditLogger.log("warn", "SECURITY", "[DEV_BYPASS] Admin endpoint accessed without configured ADMIN_TOKEN");
    return next();
  }

  if (!token || !safeCompare(token, expectedToken)) {
    auditLogger.log("warn", "SECURITY", `Unauthorized admin attempt from IP ${req.ip} on ${req.originalUrl}`);
    res.status(401).json({ error: "Unauthorized: Valid ADMIN_TOKEN bearer authentication required." });
    return;
  }

  next();
}
