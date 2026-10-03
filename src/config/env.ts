/**
 * Ɔkwankyerɛfo Pa - Environment Configuration & Validation
 * Loads, normalizes, and validates environment variables on application startup.
 */

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
  const adminToken = process.env.ADMIN_TOKEN || process.env.DASHBOARD_PASSWORD || "";

  const corsRaw = process.env.CORS_ORIGINS || "*";
  const corsOrigins = corsRaw === "*" ? ["*"] : corsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const atApiKey = (process.env.AT_API_KEY || "").trim();
  let atUsername = (process.env.AT_USERNAME || "sandbox").trim();
  if (atApiKey.startsWith("atsk_") && atUsername.toLowerCase() !== "sandbox") {
    atUsername = "sandbox";
  }

  const momoSubKey = (process.env.MOMO_SUBSCRIPTION_KEY || process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY || "").trim();
  const momoUserId = (process.env.MOMO_API_USER_ID || "").trim();
  const momoApiKey = (process.env.MOMO_API_KEY || "").trim();

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
    },
  };
}

export const config = loadConfig();
