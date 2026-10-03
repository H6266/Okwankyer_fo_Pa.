/**
 * Ɔkwankyerɛfo Pa - MTN Mobile Money (MoMo) Configuration & Utility Helpers
 */

import crypto from "crypto";
import { MoMoConfig } from "./types";

export const MOMO_SANDBOX_BASE_URL = "https://sandbox.momodeveloper.mtn.com";
export const MOMO_PRODUCTION_BASE_URL = "https://proxy.momoapi.mtn.com";

export const DEFAULT_MOMO_PRIMARY_KEY = "251831ea3ce94c78b8afe1bb064683b2";
export const DEFAULT_MOMO_SECONDARY_KEY = "4ed7eac0354847b3acfefae8cf98d943";
export const DEFAULT_MOMO_API_USER_ID = "2c5a2786-8d18-4720-9118-8f85f39e3650";
export const DEFAULT_MOMO_API_KEY = "8db515fa8e414c26bfcec7cae06afccc";

/**
 * Strips non-ASCII characters and sanitizes text for telecom and banking gateways
 */
export function cleanAscii(str: string): string {
  return (str || "")
    .replace(/GH[₵c]/gi, "GHS")
    .replace(/[₵]/g, "GHS ")
    .replace(/[ɛƐ]/g, "e")
    .replace(/[ɔƆ]/g, "o")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

/**
 * Formats Ghanaian phone numbers to standard MTN MSISDN format (e.g. "0241234567" -> "233241234567")
 */
export function formatMsisdn(phone: string): string {
  const cleaned = (phone || "").replace(/[^0-9]/g, "");
  if (cleaned.startsWith("233") && cleaned.length >= 12) {
    return cleaned;
  }
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return `233${cleaned.slice(1)}`;
  }
  if (cleaned.length === 9) {
    return `233${cleaned}`;
  }
  return cleaned || "233241234567";
}

/**
 * Generates an RFC4122 v4 UUID for MTN X-Reference-Id
 */
export function generateReferenceId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Loads MoMo configuration from process.env with fallback defaults
 */
export function loadConfigFromEnv(): MoMoConfig {
  const rawTargetEnv = (process.env.MOMO_TARGET_ENV || "sandbox").toLowerCase();
  const targetEnv = (rawTargetEnv === "production" || rawTargetEnv === "live") ? "production" : "sandbox";
  
  const baseUrl = process.env.MOMO_BASE_URL || (
    targetEnv === "production"
      ? MOMO_PRODUCTION_BASE_URL
      : MOMO_SANDBOX_BASE_URL
  );

  const currency = process.env.MOMO_CURRENCY || (targetEnv === "production" ? "GHS" : "EUR");

  const sharedSubKey = process.env.MOMO_SUBSCRIPTION_KEY || DEFAULT_MOMO_PRIMARY_KEY;
  const sharedUserId = process.env.MOMO_API_USER_ID || DEFAULT_MOMO_API_USER_ID;
  const sharedApiKey = process.env.MOMO_API_KEY || DEFAULT_MOMO_API_KEY;

  return {
    baseUrl,
    targetEnv,
    currency,
    collection: {
      subscriptionKey: process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY || sharedSubKey,
      apiUserId: process.env.MOMO_COLLECTION_API_USER_ID || sharedUserId,
      apiKey: process.env.MOMO_COLLECTION_API_KEY || sharedApiKey,
    },
    disbursement: {
      subscriptionKey: process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY || sharedSubKey,
      apiUserId: process.env.MOMO_DISBURSEMENT_API_USER_ID || sharedUserId,
      apiKey: process.env.MOMO_DISBURSEMENT_API_KEY || sharedApiKey,
    },
    callbackHost: process.env.MOMO_CALLBACK_HOST,
  };
}
