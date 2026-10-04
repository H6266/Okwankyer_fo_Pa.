/**
 * Ɔkwankyerɛfo Pa - MTN Mobile Money (MoMo) Configuration & Utility Helpers
 */

import crypto from "crypto";
import dotenv from "dotenv";
import { MoMoConfig } from "./types";

dotenv.config();

export const MOMO_SANDBOX_BASE_URL = "https://sandbox.momodeveloper.mtn.com";
export const MOMO_PRODUCTION_BASE_URL = "https://proxy.momoapi.mtn.com";

/**
 * Strips non-ASCII characters and sanitizes text for telecom and banking gateways.
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
 * Formats Ghanaian phone numbers to MTN MSISDN format.
 * Example: 0241234567 -> 233241234567
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
 * Generates an RFC4122 v4 UUID for MTN X-Reference-Id.
 */
export function generateReferenceId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  // Use cryptographically secure bytes if randomUUID is unavailable.
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes.toString("hex").replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    "$1-$2-$3-$4-$5",
  );
}

type Credentials = {
  subscriptionKey: string;
  apiUserId: string;
  apiKey: string;
};

function firstNonBlank(...values: Array<string | undefined>): string {
  return values.find((value) => Boolean(value && value.trim()))?.trim() || "";
}

function isComplete(credentials: Credentials): boolean {
  return Boolean(
    credentials.subscriptionKey &&
    credentials.apiUserId &&
    credentials.apiKey
  );
}

/**
 * Loads MoMo configuration from environment variables.
 *
 * Complete product-specific credentials take priority. Legacy shared
 * credentials remain supported for older setups and local testing.
 */
export function loadConfigFromEnv(): MoMoConfig {
  const rawTargetEnv = (process.env.MOMO_TARGET_ENV || "sandbox").toLowerCase();
  const targetEnv =
    rawTargetEnv === "production" || rawTargetEnv === "live"
      ? "production"
      : "sandbox";

  const baseUrl = firstNonBlank(process.env.MOMO_BASE_URL) || (
    targetEnv === "production"
      ? MOMO_PRODUCTION_BASE_URL
      : MOMO_SANDBOX_BASE_URL
  );

  const currency =
    firstNonBlank(process.env.MOMO_CURRENCY) ||
    (targetEnv === "production" ? "GHS" : "EUR");

  const sharedCredentials: Credentials = {
    subscriptionKey: firstNonBlank(
      process.env.MOMO_SUBSCRIPTION_KEY,
      process.env.MTN_API_PRIMARY_KEY,
      process.env.mtn_api_primary_key
    ),
    apiUserId: firstNonBlank(process.env.MOMO_API_USER_ID),
    apiKey: firstNonBlank(process.env.MOMO_API_KEY),
  };
  const hasSharedCredentials = isComplete(sharedCredentials);

  const collectionCredentials: Credentials = {
    subscriptionKey: firstNonBlank(
      process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY,
      process.env.MTN_COLLECTION_SUBSCRIPTION_KEY,
      process.env.MTN_API_PRIMARY_KEY,
      process.env.mtn_api_primary_key
    ),
    apiUserId: firstNonBlank(
      process.env.MOMO_COLLECTION_API_USER_ID,
      process.env.MTN_COLLECTION_API_USER_ID,
      process.env.MTN_COLLECTION_X_REFERENCE_ID
    ),
    apiKey: firstNonBlank(
      process.env.MOMO_COLLECTION_API_KEY,
      process.env.MTN_COLLECTION_API_KEY
    ),
  };

  const hasCompleteCollectionCredentials = isComplete(collectionCredentials);

  const disbursementCredentials: Credentials = {
    subscriptionKey: firstNonBlank(
      process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY,
      process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY,
      process.env.MTN_API_SECONDARY_KEY,
      process.env.mtn_api_secondary_key,
      process.env.MOMO_SUBSCRIPTION_KEY_SECONDARY
    ),
    apiUserId: firstNonBlank(
      process.env.MOMO_DISBURSEMENT_API_USER_ID,
      process.env.MTN_DISBURSEMENT_API_USER_ID
    ),
    apiKey: firstNonBlank(
      process.env.MOMO_DISBURSEMENT_API_KEY,
      process.env.MTN_DISBURSEMENT_API_KEY
    ),
  };

  const hasAnyDisbursementCredentials = Boolean(
    disbursementCredentials.subscriptionKey ||
    disbursementCredentials.apiUserId ||
    disbursementCredentials.apiKey
  );

  const collection = hasCompleteCollectionCredentials
    ? collectionCredentials
    : hasSharedCredentials
      ? sharedCredentials
      : collectionCredentials;

  // Use shared credentials for Disbursement only when there is no
  // product-specific Collection setup and no Disbursement setup at all.
  const useSharedCredentials =
    !hasCompleteCollectionCredentials &&
    !hasAnyDisbursementCredentials &&
    hasSharedCredentials;

  const disbursement = isComplete(disbursementCredentials)
    ? disbursementCredentials
    : hasAnyDisbursementCredentials
      ? disbursementCredentials
      : useSharedCredentials
        ? sharedCredentials
        : disbursementCredentials;

  return {
    baseUrl,
    targetEnv,
    currency,
    collection,
    disbursement,
    callbackHost: process.env.MOMO_CALLBACK_HOST,
  };
}
