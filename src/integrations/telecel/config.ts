/**
 * Ɔkwankyerɛfo Pa - Telecel Cash (Ghana) Configuration & Helpers
 */

import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

import { TelecelConfig, TelecelTargetEnvironment } from "./types";

export const TELECEL_SANDBOX_BASE_URL = "https://sandbox.telecel.com.gh/api";
export const TELECEL_PRODUCTION_BASE_URL = "https://api.telecel.com.gh/v1";

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
    lower.includes("dummy") ||
    lower.includes("changeme") ||
    lower.includes("not set") ||
    lower.includes("undefined") ||
    lower.includes("null") ||
    lower.includes("telecel_api_key")
  ) {
    return "";
  }

  return normalized;
}

/**
 * Validates and formats a Ghanaian phone number to standard Telecel MSISDN (e.g. "0201234567" -> "233201234567")
 */
export function formatTelecelMsisdn(phone: string): string {
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
 * Checks if a phone number belongs to Telecel Ghana (020, 050, 028)
 */
export function isTelecelNumber(phone: string): boolean {
  const cleaned = (phone || "").replace(/[^0-9]/g, "");
  let prefix = "";
  if (cleaned.startsWith("233") && cleaned.length >= 12) {
    prefix = `0${cleaned.slice(3, 5)}`;
  } else if (cleaned.startsWith("0")) {
    prefix = cleaned.slice(0, 3);
  }
  return ["020", "050", "028"].includes(prefix);
}

/**
 * Generates an RFC4122 v4 UUID or reference for Telecel API
 */
export function generateTelecelReferenceId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes.toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

/**
 * Loads Telecel configuration from environment variables
 */
export function loadTelecelConfigFromEnv(): TelecelConfig {
  const rawTargetEnv = (process.env.TELECEL_TARGET_ENV || "sandbox").toLowerCase();
  const targetEnv: TelecelTargetEnvironment =
    rawTargetEnv === "production" || rawTargetEnv === "live" ? "production" : "sandbox";

  const baseUrl =
    normalizeConfigValue(process.env.TELECEL_BASE_URL) ||
    (targetEnv === "production" ? TELECEL_PRODUCTION_BASE_URL : TELECEL_SANDBOX_BASE_URL);

  const currency = normalizeConfigValue(process.env.TELECEL_CURRENCY) || "GHS";

  const apiKey = normalizeConfigValue(
    process.env.TELECEL_API_KEY ||
    process.env.TELECEL_CASH_API_KEY ||
    process.env.VODAFONE_API_KEY ||
    ""
  );

  const clientId = normalizeConfigValue(
    process.env.TELECEL_CLIENT_ID ||
    process.env.TELECEL_CASH_CLIENT_ID ||
    ""
  );

  const clientSecret = normalizeConfigValue(
    process.env.TELECEL_CLIENT_SECRET ||
    process.env.TELECEL_CASH_CLIENT_SECRET ||
    ""
  );

  const merchantId = normalizeConfigValue(
    process.env.TELECEL_MERCHANT_ID ||
    process.env.TELECEL_CASH_MERCHANT_ID ||
    ""
  );

  const subscriptionKey = normalizeConfigValue(
    process.env.TELECEL_SUBSCRIPTION_KEY ||
    ""
  );

  return {
    baseUrl,
    targetEnv,
    currency,
    credentials: {
      apiKey,
      clientId,
      clientSecret,
      merchantId,
      subscriptionKey,
    },
    callbackUrl: normalizeConfigValue(process.env.TELECEL_CALLBACK_URL),
  };
}
