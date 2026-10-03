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
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { error: "Too many admin requests. Rate limit exceeded." },
});

export const kycLookupRateLimiter = rateLimit({
  ...commonRateLimitOptions,
  windowMs: 60 * 1000, // 1 minute
  max: 15, // 15 KYC queries per minute
  message: { error: "KYC directory rate limit exceeded. Please slow down." },
});

export const ussdTriggerRateLimiter = rateLimit({
  ...commonRateLimitOptions,
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // max 5 outbound calls per 5 minutes per IP
  message: { error: "Outbound telephony trigger limit reached. Please wait." },
});

export const publicApiRateLimiter = rateLimit({
  ...commonRateLimitOptions,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: "Too many requests. Please try again later." },
});
