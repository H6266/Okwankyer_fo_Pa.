/**
 * Ɔkwankyerɛfo Pa - Express Rate Limiting Middleware
 * 
 * Protects telephony webhooks, admin endpoints, and public APIs from
 * abuse, denial of service, and brute-force toll fraud.
 */

import rateLimit from "express-rate-limit";

export const telephonyRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Max 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: "<Response><Say voice=\"female\">Too many requests. Please wait and try again later.</Say><Reject/></Response>",
});

export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many admin requests. Rate limit exceeded." },
});

export const kycLookupRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // 15 KYC queries per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "KYC directory rate limit exceeded. Please slow down." },
});

export const ussdTriggerRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // max 5 outbound calls per 5 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Outbound telephony trigger limit reached. Please wait." },
});

export const publicApiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
