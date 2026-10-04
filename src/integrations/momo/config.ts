/**
 * Ɔkwankyerɛfo Pa - MTN Mobile Money (MoMo) Configuration & Utility Helpers
 */

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config({ override: true });

import { MoMoConfig } from "./types";

export const MOMO_SANDBOX_BASE_URL = "https://sandbox.momodeveloper.mtn.com";
export const MOMO_PRODUCTION_BASE_URL = "https://proxy.momoapi.mtn.com";


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
  const collSubKey = (
    process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ||
    process.env.MTN_COLLECTION_SUBSCRIPTION_KEY ||
    process.env.MTN_API_PRIMARY_KEY ||
    process.env.mtn_api_primary_key ||
    process.env.MOMO_SUBSCRIPTION_KEY ||
    ""
  ).trim();

  const disbSubKey = (
    process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MOMO_PRIMARY_KEY ||
    process.env.MOMO_SECONDARY_KEY ||
    process.env.MTN_API_SECONDARY_KEY ||
    process.env.mtn_api_secondary_key ||
    process.env.MOMO_SUBSCRIPTION_KEY_SECONDARY ||
    collSubKey
  ).trim();

  const collUserId = (
    process.env.MOMO_COLLECTION_API_USER_ID ||
    process.env.MTN_COLLECTION_API_USER_ID ||
    process.env.MTN_COLLECTION_X_REFERENCE_ID ||
    process.env.MOMO_API_USER_ID ||
    ""
  ).trim();

  const collApiKey = (
    process.env.MOMO_COLLECTION_API_KEY ||
    process.env.MTN_COLLECTION_API_KEY ||
    process.env.MOMO_API_KEY ||
    ""
  ).trim();

  const disbUserId = (
    process.env.MOMO_DISBURSEMENT_API_USER_ID ||
    process.env.MTN_DISBURSEMENT_API_USER_ID ||
    process.env.MOMO_API_USER_ID ||
    collUserId
  ).trim();

  const disbApiKey = (
    process.env.MOMO_DISBURSEMENT_API_KEY ||
    process.env.MTN_DISBURSEMENT_API_KEY ||
    process.env.MOMO_API_KEY ||
    collApiKey
  ).trim();

  return {
    baseUrl,
    targetEnv,
    currency,
    collection: {
      subscriptionKey: collSubKey,
      apiUserId: collUserId,
      apiKey: collApiKey,
    },
    disbursement: {
      subscriptionKey: disbSubKey,
      apiUserId: disbUserId,
      apiKey: disbApiKey,
    },
    callbackHost: process.env.MOMO_CALLBACK_HOST,
  };
}
