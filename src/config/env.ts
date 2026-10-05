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
  sessionSecret: string;
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
  // Development uses the intentional admin-auth bypass when no token is configured.
  // Production must provide ADMIN_TOKEN explicitly; never use a hard-coded fallback.
  const adminToken = (process.env.ADMIN_TOKEN || "").trim();
  const sessionSecret = (process.env.SESSION_SECRET || "").trim();

  if (nodeEnv === "production") {
    if (adminToken.length < 32) {
      throw new Error("CONFIGURATION_ERROR: Production requires ADMIN_TOKEN with at least 32 characters.");
    }
    if (sessionSecret.length < 32) {
      throw new Error("CONFIGURATION_ERROR: Production requires SESSION_SECRET with at least 32 characters.");
    }
    if ((process.env.ENCRYPTION_KEY || "").trim().length < 32) {
      throw new Error("CONFIGURATION_ERROR: Production requires ENCRYPTION_KEY with at least 32 characters.");
    }
    if (process.env.DEMO_MODE === "true") {
      throw new Error("CONFIGURATION_ERROR: DEMO_MODE cannot be enabled in production.");
    }
  }

  const corsRaw = (process.env.CORS_ORIGINS || "*").trim();
  const corsOrigins = corsRaw === "*" ? ["*"] : corsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  if (nodeEnv === "production" && corsRaw === "*") {
    throw new Error("CONFIGURATION_ERROR: Production requires explicit CORS_ORIGINS; wildcard access is disabled.");
  }

  const atApiKey = (process.env.AT_API_KEY || "").trim();
  let atUsername = (process.env.AT_USERNAME || "sandbox").trim();
  if (atApiKey.startsWith("atsk_") && atUsername.toLowerCase() !== "sandbox") {
    atUsername = "sandbox";
  }

  const collSubKey = (
    process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ||
    process.env.MTN_COLLECTION_SUBSCRIPTION_KEY ||
    ""
  ).trim();

  const disbSubKey = (
    process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ||
    process.env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY ||
    ""
  ).trim();

  const collUserId = (
    process.env.MOMO_COLLECTION_API_USER_ID ||
    process.env.MTN_COLLECTION_API_USER_ID ||
    process.env.MTN_COLLECTION_X_REFERENCE_ID ||
    ""
  ).trim();
  const collApiKey = (
    process.env.MOMO_COLLECTION_API_KEY ||
    process.env.MTN_COLLECTION_API_KEY ||
    ""
  ).trim();

  const disbUserId = (
    process.env.MOMO_DISBURSEMENT_API_USER_ID ||
    process.env.MTN_DISBURSEMENT_API_USER_ID ||
    ""
  ).trim();
  const disbApiKey = (
    process.env.MOMO_DISBURSEMENT_API_KEY ||
    process.env.MTN_DISBURSEMENT_API_KEY ||
    ""
  ).trim();

  const momoSubKey = (disbSubKey || collSubKey).trim();
  const momoUserId = (disbUserId || collUserId).trim();
  const momoApiKey = (disbApiKey || collApiKey).trim();

  return {
    nodeEnv,
    port,
    baseUrl,
    demoMode,
    adminToken,
    sessionSecret,
    corsOrigins,
    at: {
      username: atUsername,
      apiKey: atApiKey,
      voiceNumber: (process.env.AT_VOICE_NUMBER || "").trim(),
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
