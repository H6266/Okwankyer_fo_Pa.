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
  ghanaNlp: {
    apiKey: string;
    baseUrl: string;
    configured: boolean;
    timeoutMs: number;
    retries: number;
  };
  asr: {
    chunkMs: number;
    overlapMs: number;
    minSpeechMs: number;
    silenceSplitMs: number;
    maxConcurrentChunks: number;
    feedbackEnabled: boolean;
    feedbackRetentionDays: number;
    languageIdEnabled: boolean;
  };
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
  // Dev server must always run on port 3000 per AI Studio environment constraints
  const port = 3000;
  
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
    if (!process.env.GEMINI_MODEL || process.env.GEMINI_MODEL.trim() === "") {
      throw new Error("CONFIGURATION_ERROR: GEMINI_MODEL environment variable must be explicitly defined in production. Literal model fallbacks are forbidden.");
    }
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
    ghanaNlp: {
      apiKey: (process.env.GHANANLP_API_KEY || "").trim(),
      baseUrl: (process.env.GHANANLP_BASE_URL || "https://translation-api.ghananlp.org").trim().replace(/\/+$/, ""),
      configured: Boolean((process.env.GHANANLP_API_KEY || "").trim()),
      timeoutMs: Math.max(2000, parseInt(process.env.GHANANLP_ASR_TIMEOUT_MS || "15000", 10)),
      retries: Math.max(0, Math.min(5, parseInt(process.env.GHANANLP_ASR_RETRIES || "2", 10))),
    },
    asr: {
      chunkMs: Math.max(3000, parseInt(process.env.ASR_CHUNK_MS || "12000", 10)),
      overlapMs: Math.max(200, parseInt(process.env.ASR_OVERLAP_MS || "1000", 10)),
      minSpeechMs: Math.max(300, parseInt(process.env.ASR_MIN_SPEECH_MS || "1200", 10)),
      silenceSplitMs: Math.max(200, parseInt(process.env.ASR_SILENCE_SPLIT_MS || "650", 10)),
      maxConcurrentChunks: Math.max(1, Math.min(5, parseInt(process.env.ASR_MAX_CONCURRENT_CHUNKS || "2", 10))),
      feedbackEnabled: process.env.ASR_FEEDBACK_ENABLED !== "false",
      feedbackRetentionDays: Math.max(1, parseInt(process.env.ASR_FEEDBACK_RETENTION_DAYS || "90", 10)),
      languageIdEnabled: process.env.ASR_LANGUAGE_ID_ENABLED !== "false",
    },
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
