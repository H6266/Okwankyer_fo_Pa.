/**
 * Ɔkwankyerɛfo Pa - Express Rate Limiting Middleware
 * 
 * Protects telephony webhooks, admin endpoints, and public APIs from
 * abuse, denial of service, and brute-force toll fraud.
 */

import rateLimit from "express-rate-limit";
import { Request } from "express";

/**
 * Robust IP extractor that supports trusted proxies (Google Cloud Run / Load Balancers)
 * and resolves X-Forwarded-For and Forwarded headers accurately.
 */
const getClientIp = (req: Request): string => {
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string") {
    return xForwardedFor.split(",")[0].trim();
  }
  if (Array.isArray(xForwardedFor) && xForwardedFor[0]) {
    return xForwardedFor[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "127.0.0.1";
};

const getAdminKey = (req: Request): string => {
  const ip = getClientIp(req);
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return `${ip}:${auth.slice(-10)}`;
  }
  return ip;
};

const isNonApiOrStaticRequest = (req: Request): boolean => {
  const p = req.path || "";
  // Never rate-limit frontend UI navigation, static assets, or Vite bundles
  if (
    !p.startsWith("/api/") &&
    !p.startsWith("/ussd-trigger") &&
    p !== "/transactions/send"
  ) {
    return true;
  }
  // In development / test, allow bypassing rate limits if configured
  if (process.env.NODE_ENV !== "production" && process.env.DISABLE_RATE_LIMIT === "true") {
    return true;
  }
  return false;
};

const commonRateLimitOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientIp,
  validate: false,
};

export const telephonyRateLimiter = rateLimit({
  ...commonRateLimitOptions,
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Max 60 requests per minute per IP
  message: "<Response><Say voice=\"female\">Too many requests. Please wait and try again later.</Say><Reject/></Response>",
});

export const adminRateLimiter = rateLimit({
  ...commonRateLimitOptions,
  keyGenerator: getAdminKey,
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === "production" ? 300 : 1200, // Generous 300-1200 req/min for rich developer dashboard
  skip: isNonApiOrStaticRequest,
  message: { error: "Too many admin requests. Rate limit exceeded." },
});

export const kycLookupRateLimiter = rateLimit({
  ...commonRateLimitOptions,
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 KYC queries per minute
  skip: isNonApiOrStaticRequest,
  message: { error: "KYC directory rate limit exceeded. Please slow down." },
});

export const ussdTriggerRateLimiter = rateLimit({
  ...commonRateLimitOptions,
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // max 30 outbound calls per 5 minutes per IP
  message: { error: "Outbound telephony trigger limit reached. Please wait." },
});

export const publicApiRateLimiter = rateLimit({
  ...commonRateLimitOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600,
  skip: isNonApiOrStaticRequest,
  message: { error: "Too many requests. Please try again later." },
});
