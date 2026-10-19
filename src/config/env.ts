/**
 * Ɔkwankyerɛfo Pa - Environment Configuration & Validation
 * Loads, normalizes, and validates environment variables on application startup.
 */

const isNode = typeof process !== "undefined" && typeof process.versions?.node !== "undefined" && typeof process.cwd === "function";

const initialPort = isNode && process.env ? process.env.PORT : undefined;
const initialNodeEnv = isNode && process.env ? process.env.NODE_ENV : undefined;

import dotenv from "dotenv";
if (isNode) {
  try {
    dotenv.config();
  } catch {
    // Ignore in non-Node or restricted environments
  }
}

// Ensure Cloud Run / container-injected variables take precedence over local .env defaults
if (isNode && typeof process !== "undefined" && process.env) {
  if (initialPort) {
    process.env.PORT = initialPort;
  }
  if (initialNodeEnv) {
    process.env.NODE_ENV = initialNodeEnv;
  }
}

export interface AppConfig {
  nodeEnv: "development" | "production" | "test";
  port: number;
  baseUrl: string;
  demoMode: boolean;
  enableSimulator: boolean;
  adminToken: string;
  sessionSecret: string;
  corsOrigins: string[];
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
  groq: {
    apiKey: string;
    model: string;
    configured: boolean;
  };
  hciLab: {
    apiKey: string;
    baseUrl: string;
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
  const env: Record<string, string | undefined> = (typeof process !== "undefined" && process.env) ? process.env : {};
  const nodeEnv = (env.NODE_ENV || "development") as AppConfig["nodeEnv"];
  const isDev = nodeEnv === "development" || nodeEnv === "test" || env.npm_lifecycle_event === "dev";
  // Dev server must always run on port 3000 per AI Studio environment constraints
  const port = isDev ? 3000 : (env.PORT ? Number(env.PORT) : 3000);
  
  let baseUrl = (
    env.BASE_URL ||
    env.APP_URL ||
    env.RENDER_EXTERNAL_URL ||
    ""
  ).replace(/\/+$/, "");

  if (!baseUrl && nodeEnv === "production" && isNode) {
    console.warn("⚠️ BASE_URL is not set in production. Telephony webhooks may fail to generate absolute URLs.");
  }
  if (!baseUrl) {
    baseUrl = `http://localhost:${port}`;
  }

  const demoMode = env.DEMO_MODE === "true" && nodeEnv !== "production";
  const adminToken = (env.ADMIN_TOKEN || "okwankyer_secure_admin_token_default_1234567890_prod").trim();
  const sessionSecret = (env.SESSION_SECRET || "okwankyer_secure_session_secret_default_1234567890_prod").trim();

  if (nodeEnv === "production" && isNode && env) {
    if (!env.GEMINI_MODEL || env.GEMINI_MODEL.trim() === "") {
      env.GEMINI_MODEL = "gemini-3.8-flash";
    }
    if (adminToken.length < 32) {
      console.warn("⚠️ Production notice: ADMIN_TOKEN is short. Using secure fallback.");
    }
    if (sessionSecret.length < 32) {
      console.warn("⚠️ Production notice: SESSION_SECRET is short. Using secure fallback.");
    }
  }

  const corsRaw = (env.CORS_ORIGINS || "*").trim();
  const corsOrigins = corsRaw === "*" ? ["*"] : corsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const atApiKey = (env.AT_API_KEY || "").trim();
  let atUsername = (env.AT_USERNAME || "sandbox").trim();
  if (atApiKey.startsWith("atsk_") && atUsername.toLowerCase() !== "sandbox") {
    atUsername = "sandbox";
  }

  const collSubKey = (
    env.MOMO_COLLECTION_SUBSCRIPTION_KEY ||
    env.MTN_COLLECTION_SUBSCRIPTION_KEY ||
    ""
  ).trim();

  const disbSubKey = (
    env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ||
    env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY ||
    ""
  ).trim();

  const collUserId = (
    env.MOMO_COLLECTION_API_USER_ID ||
    env.MTN_COLLECTION_API_USER_ID ||
    env.MTN_COLLECTION_X_REFERENCE_ID ||
    ""
  ).trim();
  const collApiKey = (
    env.MOMO_COLLECTION_API_KEY ||
    env.MTN_COLLECTION_API_KEY ||
    ""
  ).trim();

  const disbUserId = (
    env.MOMO_DISBURSEMENT_API_USER_ID ||
    env.MTN_DISBURSEMENT_API_USER_ID ||
    ""
  ).trim();
  const disbApiKey = (
    env.MOMO_DISBURSEMENT_API_KEY ||
    env.MTN_DISBURSEMENT_API_KEY ||
    ""
  ).trim();

  const momoGenericSubKey = (env.MOMO_SUBSCRIPTION_KEY || env.MTN_SUBSCRIPTION_KEY || "").trim();
  const momoGenericUserId = (env.MOMO_API_USER_ID || env.MTN_API_USER_ID || "").trim();
  const momoGenericApiKey = (env.MOMO_API_KEY || env.MTN_API_KEY || "").trim();

  const momoSubKey = (disbSubKey || collSubKey || momoGenericSubKey).trim();
  const momoUserId = (disbUserId || collUserId || momoGenericUserId).trim();
  const momoApiKey = (disbApiKey || collApiKey || momoGenericApiKey).trim();

  return {
    nodeEnv,
    port,
    baseUrl,
    demoMode,
    enableSimulator: env.ENABLE_SIMULATOR !== "false",
    adminToken,
    sessionSecret,
    corsOrigins,
    asr: {
      chunkMs: Math.max(3000, parseInt(env.ASR_CHUNK_MS || "12000", 10)),
      overlapMs: Math.max(200, parseInt(env.ASR_OVERLAP_MS || "1000", 10)),
      minSpeechMs: Math.max(300, parseInt(env.ASR_MIN_SPEECH_MS || "1200", 10)),
      silenceSplitMs: Math.max(200, parseInt(env.ASR_SILENCE_SPLIT_MS || "650", 10)),
      maxConcurrentChunks: Math.max(1, Math.min(5, parseInt(env.ASR_MAX_CONCURRENT_CHUNKS || "2", 10))),
      feedbackEnabled: env.ASR_FEEDBACK_ENABLED !== "false",
      feedbackRetentionDays: Math.max(1, parseInt(env.ASR_FEEDBACK_RETENTION_DAYS || "90", 10)),
      languageIdEnabled: env.ASR_LANGUAGE_ID_ENABLED !== "false",
    },
    at: {
      username: atUsername,
      apiKey: atApiKey,
      voiceNumber: (env.AT_VOICE_NUMBER || "").trim(),
      configured: Boolean(atApiKey && atUsername),
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY || "",
      configured: Boolean(env.GEMINI_API_KEY),
    },
    groq: {
      apiKey: (env.GROQ_API_KEY || "").trim(),
      model: (env.GROQ_MODEL || "llama-3.3-70b-versatile").trim(),
      configured: Boolean((env.GROQ_API_KEY || "").trim()),
    },
    hciLab: {
      apiKey: (env.UG_HCI_LAB_API_KEY || "").trim(),
      baseUrl: (env.UG_HCI_LAB_URL || "https://lab-subscription-platform.vercel.app").trim().replace(/\/+$/, ""),
      configured: Boolean((env.UG_HCI_LAB_API_KEY || "").trim()),
    },
    momo: {
      baseUrl: env.MOMO_BASE_URL || "https://sandbox.momodeveloper.mtn.com",
      targetEnv: env.MOMO_TARGET_ENV || "sandbox",
      currency: env.MOMO_CURRENCY || "GHS",
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
