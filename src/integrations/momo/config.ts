/**
 * Ɔkwankyerɛfo Pa - MTN Mobile Money (MoMo) Configuration & Utility Helpers
 */

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

import { MoMoConfig } from "./types";

export const MOMO_SANDBOX_BASE_URL = "https://sandbox.momodeveloper.mtn.com";
export const MOMO_PRODUCTION_BASE_URL = "https://proxy.momoapi.mtn.com";

export function normalizeConfigValue(value?: string): string {
  const normalized = (value || "").trim();
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  if (
    lower.includes("paste the") ||
    lower.includes("replace the") ||
    lower.includes("your_") ||
    lower.includes("your ") ||
    lower.includes("example") ||
    lower.includes("placeholder") ||
    lower.includes("mock-test-key") ||
    lower.includes("mock_test_key") ||
    lower.includes("mock-") ||
    lower.includes("dummy") ||
    lower.includes("changeme") ||
    lower.includes("not set") ||
    lower.includes("undefined") ||
    lower.includes("null") ||
    lower.includes("momo_api_user_id") ||
    lower.includes("momo_subscription_key") ||
    lower.includes("momo_api_key") ||
    lower.includes("your api key") ||
    lower.includes("your subscription key") ||
    /^sk-(test|mock|dummy)/i.test(normalized)
  ) {
    return "";
  }

  return normalized;
}

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
  if (cleaned.startsWith("0") && (cleaned.length === 10 || cleaned.length === 11)) {
    return `233${cleaned.slice(1)}`;
  }
  if (cleaned.length === 9) {
    return `233${cleaned}`;
  }
  return cleaned;
}

/**
 * Generates an RFC4122 v4 UUID for MTN X-Reference-Id
 */
export function generateReferenceId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes.toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

/**
 * Loads MoMo configuration exclusively from environment variables
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

  // In MTN MoMo Open API, Collections and Disbursements are separate product subscriptions.
  // A Disbursement key is invalid for Collections endpoints and vice versa.
  const collSubKey = normalizeConfigValue(
    process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ||
    process.env.MTN_COLLECTION_SUBSCRIPTION_KEY ||
    ""
  );

  const disbSubKey = normalizeConfigValue(
    process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY ||
    ""
  );

  const collUserId = normalizeConfigValue(
    process.env.MOMO_COLLECTION_API_USER_ID ||
    process.env.MTN_COLLECTION_API_USER_ID ||
    process.env.MTN_COLLECTION_X_REFERENCE_ID ||
    ""
  );

  const collApiKey = normalizeConfigValue(
    process.env.MOMO_COLLECTION_API_KEY ||
    process.env.MTN_COLLECTION_API_KEY ||
    ""
  );

  const disbUserId = normalizeConfigValue(
    process.env.MOMO_DISBURSEMENT_API_USER_ID ||
    process.env.MTN_DISBURSEMENT_API_USER_ID ||
    ""
  );

  const disbApiKey = normalizeConfigValue(
    process.env.MOMO_DISBURSEMENT_API_KEY ||
    process.env.MTN_DISBURSEMENT_API_KEY ||
    ""
  );

  const legacySubKey = normalizeConfigValue(process.env.MOMO_SUBSCRIPTION_KEY || "");
  const legacyUserId = normalizeConfigValue(process.env.MOMO_API_USER_ID || "");
  const legacyApiKey = normalizeConfigValue(process.env.MOMO_API_KEY || "");

  const legacyIsComplete = Boolean(legacySubKey && legacyUserId && legacyApiKey);
  const collIsComplete = Boolean(collSubKey && collUserId && collApiKey);
  const disbIsComplete = Boolean(disbSubKey && disbUserId && disbApiKey);

  const collection = collIsComplete
    ? { subscriptionKey: collSubKey, apiUserId: collUserId, apiKey: collApiKey }
    : legacyIsComplete
      ? { subscriptionKey: legacySubKey, apiUserId: legacyUserId, apiKey: legacyApiKey }
      : {
          subscriptionKey: collSubKey || legacySubKey,
          apiUserId: collUserId || legacyUserId,
          apiKey: collApiKey || legacyApiKey,
        };

  const disbursement = disbIsComplete
    ? { subscriptionKey: disbSubKey, apiUserId: disbUserId, apiKey: disbApiKey }
    : legacyIsComplete
      ? { subscriptionKey: legacySubKey, apiUserId: legacyUserId, apiKey: legacyApiKey }
      : {
          subscriptionKey: disbSubKey || legacySubKey,
          apiUserId: disbUserId || legacyUserId,
          apiKey: disbApiKey || legacyApiKey,
        };

  return {
    baseUrl,
    targetEnv,
    currency,
    collection,
    disbursement,
    callbackHost: process.env.MOMO_CALLBACK_HOST,
  };
}
