/**
 * Ɔkwankyerɛfo Pa - MTN Mobile Money (MoMo) Configuration & Utility Helpers
 */

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

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
  if (cleaned.startsWith("0") && cleaned.length === 10) {
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
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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
  const collSubKey = (process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY || "").trim();
  const collUserId = (process.env.MOMO_COLLECTION_API_USER_ID || (collSubKey ? process.env.MOMO_API_USER_ID : "") || "").trim();
  const collApiKey = (process.env.MOMO_COLLECTION_API_KEY || (collSubKey ? process.env.MOMO_API_KEY : "") || "").trim();

  const disbSubKey = (process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY || process.env.MOMO_SUBSCRIPTION_KEY || "").trim();
  const disbUserId = (process.env.MOMO_DISBURSEMENT_API_USER_ID || process.env.MOMO_API_USER_ID || "").trim();
  const disbApiKey = (process.env.MOMO_DISBURSEMENT_API_KEY || process.env.MOMO_API_KEY || "").trim();

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
