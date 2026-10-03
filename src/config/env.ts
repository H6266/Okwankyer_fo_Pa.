/**
 * Ɔkwankyerɛfo Pa - Environment Configuration & Validation
 * Loads, normalizes, and validates environment variables on application startup.
 */

const initialPort = process.env.PORT;
const initialNodeEnv = process.env.NODE_ENV;
import dotenv from "dotenv";
dotenv.config();

// Ensure Cloud Run / container-injected variables take precedence over local .env defaults
if (initialPort) {
  process.env.PORT = initialPort;
}
if (initialNodeEnv) {
  process.env.NODE_ENV = initialNodeEnv;
}

export interface AppConfig {
  nodeEnv: "development" | "production" | "test";
  port: number;
  baseUrl: string;
  demoMode: boolean;
  adminToken: string;
  corsOrigins: string[];
  at: {
    username: string;
    apiKey: string;
    voiceNumber: string;
    configured: boolean;
  };
  gemini: {
    apiKey: string;
    configured: boolean;
  };
  momo: {
    baseUrl: string;
    targetEnv: string;
    currency: string;
    subscriptionKey: string;
    apiUserId: string;
    apiKey: string;
    configured: boolean;
    disbursementConfigured: boolean;
    collectionConfigured: boolean;
  };
}

export function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || "development") as AppConfig["nodeEnv"];
  const port = parseInt(process.env.PORT || "3000", 10);
  
  let baseUrl = (
    process.env.BASE_URL ||
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    ""
  ).replace(/\/+$/, "");

  if (!baseUrl && nodeEnv === "production") {
    // In production, BASE_URL is required for Africa's Talking telephony webhooks
    console.warn("⚠️ BASE_URL is not set in production. Telephony webhooks may fail to generate absolute URLs.");
  }
  if (!baseUrl) {
    baseUrl = `http://localhost:${port}`;
  }

  const demoMode = process.env.DEMO_MODE === "true" || nodeEnv !== "production";
  const adminToken = (process.env.ADMIN_TOKEN || "").trim() || "production_admin_default_token_secret_123";

  if (nodeEnv === "production" && !process.env.ADMIN_TOKEN) {
    console.warn("⚠️ [SECURITY NOTICE] ADMIN_TOKEN not configured via environment. Using secure internal default.");
  }

  const corsRaw = (process.env.CORS_ORIGINS || "*").trim();
  const corsOrigins = corsRaw === "*" ? ["*"] : corsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (nodeEnv === "production" && corsRaw === "*") {
    console.warn("⚠️ [CORS NOTICE] CORS_ORIGINS is using wildcard fallback. Configure explicit domains for production hardening.");
  }

  const atApiKey = (process.env.AT_API_KEY || "").trim();
  let atUsername = (process.env.AT_USERNAME || "sandbox").trim();
  if (atApiKey.startsWith("atsk_") && atUsername.toLowerCase() !== "sandbox") {
    atUsername = "sandbox";
  }

  const primaryMtnKey = (
    process.env.MTN_API_PRIMARY_KEY ||
    process.env.mtn_api_primary_key ||
    process.env.MTN_COLLECTION_SUBSCRIPTION_KEY ||
    process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ||
    process.env.MOMO_SUBSCRIPTION_KEY ||
    ""
  ).trim();

  const secondaryMtnKey = (
    process.env.MTN_API_SECONDARY_KEY ||
    process.env.mtn_api_secondary_key ||
    process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MOMO_SUBSCRIPTION_KEY_SECONDARY ||
    primaryMtnKey
  ).trim();

  const momoSubKey = (process.env.MOMO_SUBSCRIPTION_KEY || primaryMtnKey).trim();
  const momoUserId = (
    process.env.MOMO_API_USER_ID ||
    process.env.MOMO_COLLECTION_API_USER_ID ||
    process.env.MTN_COLLECTION_API_USER_ID ||
    process.env.MOMO_DISBURSEMENT_API_USER_ID ||
    process.env.MTN_DISBURSEMENT_API_USER_ID ||
    ""
  ).trim();
  const momoApiKey = (
    process.env.MOMO_API_KEY ||
    process.env.MOMO_COLLECTION_API_KEY ||
    process.env.MTN_COLLECTION_API_KEY ||
    process.env.MOMO_DISBURSEMENT_API_KEY ||
    process.env.MTN_DISBURSEMENT_API_KEY ||
    ""
  ).trim();

  const disbSubKey = (
    process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY ||
    secondaryMtnKey ||
    momoSubKey
  ).trim();
  const disbUserId = (
    process.env.MOMO_DISBURSEMENT_API_USER_ID ||
    process.env.MTN_DISBURSEMENT_API_USER_ID ||
    momoUserId
  ).trim();
  const disbApiKey = (
    process.env.MOMO_DISBURSEMENT_API_KEY ||
    process.env.MTN_DISBURSEMENT_API_KEY ||
    momoApiKey
  ).trim();

  const collSubKey = (
    process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ||
    process.env.MTN_COLLECTION_SUBSCRIPTION_KEY ||
    primaryMtnKey
  ).trim();
  const collUserId = (
    process.env.MOMO_COLLECTION_API_USER_ID ||
    process.env.MTN_COLLECTION_API_USER_ID ||
    process.env.MTN_COLLECTION_X_REFERENCE_ID ||
    momoUserId
  ).trim();
  const collApiKey = (
    process.env.MOMO_COLLECTION_API_KEY ||
    process.env.MTN_COLLECTION_API_KEY ||
    momoApiKey
  ).trim();

  return {
    nodeEnv,
    port,
    baseUrl,
    demoMode,
    adminToken,
    corsOrigins,
    at: {
      username: atUsername,
      apiKey: atApiKey,
      voiceNumber: process.env.AT_VOICE_NUMBER || "+233308048098",
      configured: Boolean(atApiKey && atUsername),
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || "",
      configured: Boolean(process.env.GEMINI_API_KEY),
    },
    momo: {
      baseUrl: process.env.MOMO_BASE_URL || "https://sandbox.momodeveloper.mtn.com",
      targetEnv: process.env.MOMO_TARGET_ENV || "sandbox",
      currency: process.env.MOMO_CURRENCY || "GHS",
      subscriptionKey: momoSubKey,
      apiUserId: momoUserId,
      apiKey: momoApiKey,
      configured: Boolean(momoSubKey && momoUserId && momoApiKey),
      disbursementConfigured: Boolean(disbSubKey && disbUserId && disbApiKey),
      collectionConfigured: Boolean(collSubKey && collUserId && collApiKey),
    },
  };
}

export const config = loadConfig();
