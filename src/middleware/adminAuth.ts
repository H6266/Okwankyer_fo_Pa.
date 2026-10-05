import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../config/env";
import { auditLogger } from "../services/auditLogger";

const ADMIN_SESSION_COOKIE = "okw_admin_session";
const SESSION_TTL_SECONDS = 3600;

function safeCompare(a: string, b: string): boolean {
  const A = Buffer.from(a);
  const B = Buffer.from(b);

  if (A.length !== B.length) return false;

  return crypto.timingSafeEqual(A, B);
}

function sessionSecret(): string {
  const secret = (process.env.SESSION_SECRET || "").trim();

  if (config.nodeEnv === "production" && !secret) {
    throw new Error(
      "SESSION_SECRET must be configured in production."
    );
  }

  return secret || config.adminToken || "development-session-secret";
}

function sign(expiry: string): string {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(expiry)
    .digest("hex");
}

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.cookie || "";

  for (const part of cookie.split(";")) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

function validSession(req: Request): boolean {
  const cookie = getCookie(req, ADMIN_SESSION_COOKIE);

  if (!cookie) return false;

  const [expiry, signature] = cookie.split(".");

  if (!expiry || !signature) return false;

  const expiryNumber = Number(expiry);

  if (!Number.isFinite(expiryNumber)) return false;

  if (expiryNumber <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = sign(expiry);

  return safeCompare(signature, expected);
}

export function isValidAdminToken(token: string): boolean {
  const clean = (token || "").trim();
  if (!clean) return false;

  const expected = (config.adminToken || "").trim();
  if (expected && safeCompare(clean, expected)) {
    return true;
  }

  // Non-production & demo convenience credentials
  if (config.nodeEnv !== "production" || config.demoMode) {
    if (
      safeCompare(clean, "admin") ||
      safeCompare(clean, "admin123") ||
      safeCompare(clean, "dev_admin_secret_token_12345")
    ) {
      return true;
    }
  }

  return false;
}

export function createAdminSessionCookie(): string {
  const expiry =
    Math.floor(Date.now() / 1000) +
    SESSION_TTL_SECONDS;

  const signature = sign(String(expiry));
  const isProd = config.nodeEnv === "production";

  return [
    `${ADMIN_SESSION_COOKIE}=${expiry}.${signature}`,
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    isProd ? "SameSite=None; Secure" : "SameSite=Lax",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearAdminSessionCookie(): string {
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
    config.nodeEnv === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function isAdminAuthenticated(req: Request): boolean {
  if (!config.adminToken) {
    return config.nodeEnv !== "production";
  }

  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();

    if (isValidAdminToken(token)) {
      return true;
    }
  }

  try {
    return validSession(req);
  } catch {
    return false;
  }
}

export function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (config.nodeEnv === "production" && !config.adminToken) {
    auditLogger.log(
      "error",
      "SECURITY",
      "ADMIN_TOKEN missing in production",
      req.ip
    );

    res.status(500).json({
      error:
        "Server configuration error: ADMIN_TOKEN missing in production.",
    });

    return;
  }

  if (isAdminAuthenticated(req)) {
    next();
    return;
  }

  auditLogger.log(
    "warn",
    "SECURITY",
    `Unauthorized admin attempt from ${req.ip} on ${req.originalUrl}`
  );

  res.status(401).json({
    error:
      "Unauthorized: valid admin authentication required.",
  });
}
