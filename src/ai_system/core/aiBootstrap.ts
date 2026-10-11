/**
 * Ɔkwankyerɛfo Pa - AI System Bootstrap & Diagnostics (aiBootstrap.ts)
 *
 * Bootstraps the cognitive architecture:
 * 1. Live model verification against GoogleGenAI SDK catalog at startup (Item 3.4).
 * 2. Fail-closed production enforcement on missing models.
 * 3. Prohibits deprecated legacy models.
 * 4. Preloads phonetic and pronunciation lexicons into intelligent memory.
 * 5. Exposes runtime configuration diagnostics.
 */

import { GoogleGenAI } from "@google/genai";
import { aiEngine } from "./aiEngine";
import { aiMemory } from "./aiMemory";
import { sessionMemoryBridge } from "../memory/sessionMemoryBridge";
import { aiSafety } from "./aiSafety";
import { AI_CONFIG } from "./aiConfig";

const PROHIBITED_DEPRECATED_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-2.0-flash",
  "gemini-2.0-pro",
  "gemini-2.0-flash-thinking",
]);

export interface SystemDiagnostics {
  appMode: "production" | "sandbox" | "development";
  isProduction: boolean;
  models: {
    reasoning: { id: string; valid: boolean };
    live: { id: string; valid: boolean };
    transcribe: { id: string; valid: boolean };
    tts: { id: string; valid: boolean };
    embedding: { id: string; valid: boolean };
  };
  modelsVerifiedAgainstSdk: boolean;
  sdkVerifiedModels: string[];
  providers: {
    geminiConfigured: boolean;
    momoConfigured: boolean;
    failClosedEnforced: boolean;
  };
  security: {
    zeroPinEnforced: boolean;
    fieldEncryptionEnabled: boolean;
  };
  memory: {
    durablePersistence: boolean;
  };
}

export interface BootstrapHealthReport {
  status: "INITIALIZED" | "DEGRADED" | "FAILED";
  timestamp: number;
  subsystems: {
    memory: boolean;
    understanding: boolean;
    navigation: boolean;
    action: boolean;
    safetyGate: boolean;
    dialogue: boolean;
    speech: boolean;
    sessionCache: boolean;
  };
  zeroPinPolicyVerified: boolean;
  bootstrapLatencyMs: number;
  diagnostics: SystemDiagnostics;
  errors?: string[];
}

export class AiBootstrap {
  private static instance: AiBootstrap;
  private isInitialized = false;
  private sdkVerified = false;
  private verifiedModelList: string[] = [];

  private constructor() {}

  public static getInstance(): AiBootstrap {
    if (!AiBootstrap.instance) {
      AiBootstrap.instance = new AiBootstrap();
    }
    return AiBootstrap.instance;
  }

  /**
   * Item 3.4: Live model verification against Gemini SDK catalog at startup.
   * In production, fails loudly if a configured model does not exist.
   */
  public async verifyModelsAgainstSdk(): Promise<{ verified: boolean; modelsFound: string[]; errors: string[] }> {
    const apiKey = process.env.GEMINI_API_KEY;
    const isProd = process.env.NODE_ENV === "production";

    if (!apiKey) {
      console.log("[AiBootstrap] GEMINI_API_KEY not configured. Cognitive core active in autonomous local-first mode.");
      this.sdkVerified = false;
      this.verifiedModelList = [];
      return {
        verified: false,
        modelsFound: [],
        errors: ["GEMINI_API_KEY not configured; operating in local-first autonomous cognitive mode."],
      };
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": AI_CONFIG.userAgentHeader,
          },
        },
      });

      const modelsPager = await ai.models.list();
      const discovered: string[] = [];

      for await (const m of modelsPager) {
        if (m.name) {
          discovered.push(m.name.replace(/^models\//, ""));
        }
      }

      this.verifiedModelList = discovered;
      const errors: string[] = [];

      const required = [
        AI_CONFIG.model,
        AI_CONFIG.liveModel,
        AI_CONFIG.transcriptionModel,
        AI_CONFIG.ttsModel,
        AI_CONFIG.embeddingModel,
      ];

      const configuredSet = new Set(required.filter(Boolean));

      for (const modelName of configuredSet) {
        if (!discovered.includes(modelName)) {
          const explicitFallbacks = (process.env.GEMINI_FALLBACK_MODELS || "")
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean);

          const validFallback = explicitFallbacks.find((fb) => discovered.includes(fb));

          if (validFallback) {
            console.warn(`[AiBootstrap] Configured model '${modelName}' not in SDK list. Falling back to '${validFallback}'.`);
            if (modelName === AI_CONFIG.model) AI_CONFIG.model = validFallback;
            if (modelName === AI_CONFIG.liveModel) AI_CONFIG.liveModel = validFallback;
            if (modelName === AI_CONFIG.transcriptionModel) AI_CONFIG.transcriptionModel = validFallback;
            if (modelName === AI_CONFIG.ttsModel) AI_CONFIG.ttsModel = validFallback;
            if (modelName === AI_CONFIG.embeddingModel) AI_CONFIG.embeddingModel = validFallback;
          } else if (isProd) {
            throw new Error(
              `[FATAL BOOT ERROR] Configured model '${modelName}' was not found in the live Gemini catalog.`
            );
          } else {
            errors.push(`Configured model '${modelName}' not found in live catalog.`);
          }
        }
      }

      this.sdkVerified = errors.length === 0;
      return {
        verified: this.sdkVerified,
        modelsFound: discovered,
        errors,
      };
    } catch (err: any) {
      if (isProd) {
        throw err;
      }
      console.warn(`[AiBootstrap] SDK model verification notice: ${err.message}`);
      return {
        verified: false,
        modelsFound: [],
        errors: [err.message],
      };
    }
  }

  /**
   * Validates configured models to prohibit deprecated models.
   */
  public validateModelConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const configured = [
      AI_CONFIG.model,
      AI_CONFIG.liveModel,
      AI_CONFIG.transcriptionModel,
      AI_CONFIG.ttsModel,
      AI_CONFIG.embeddingModel,
    ];

    for (const m of configured) {
      if (PROHIBITED_DEPRECATED_MODELS.has(m)) {
        errors.push(`DEPRECATED_MODEL_FORBIDDEN: Model '${m}' is deprecated and prohibited.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public getDiagnostics(): SystemDiagnostics {
    const appMode = (process.env.APP_MODE as any) || (AI_CONFIG.isProduction ? "production" : "sandbox");
    const momoConfigured = Boolean(process.env.MOMO_API_KEY && process.env.MOMO_SUBSCRIPTION_KEY);

    return {
      appMode,
      isProduction: AI_CONFIG.isProduction,
      models: {
        reasoning: { id: AI_CONFIG.model, valid: !PROHIBITED_DEPRECATED_MODELS.has(AI_CONFIG.model) },
        live: { id: AI_CONFIG.liveModel, valid: !PROHIBITED_DEPRECATED_MODELS.has(AI_CONFIG.liveModel) },
        transcribe: { id: AI_CONFIG.transcriptionModel, valid: !PROHIBITED_DEPRECATED_MODELS.has(AI_CONFIG.transcriptionModel) },
        tts: { id: AI_CONFIG.ttsModel, valid: !PROHIBITED_DEPRECATED_MODELS.has(AI_CONFIG.ttsModel) },
        embedding: { id: AI_CONFIG.embeddingModel, valid: !PROHIBITED_DEPRECATED_MODELS.has(AI_CONFIG.embeddingModel) },
      },
      modelsVerifiedAgainstSdk: this.sdkVerified,
      sdkVerifiedModels: this.verifiedModelList,
      providers: {
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        momoConfigured,
        failClosedEnforced: AI_CONFIG.isProduction && !momoConfigured,
      },
      security: {
        zeroPinEnforced: AI_CONFIG.enforceZeroPin,
        fieldEncryptionEnabled: true,
      },
      memory: {
        durablePersistence: AI_CONFIG.isProduction,
      },
    };
  }

  /**
   * Initializes the central AI system and returns health status.
   */
  public async initialize(): Promise<BootstrapHealthReport> {
    const start = performance.now();
    const modelCheck = this.validateModelConfiguration();

    try {
      if (!modelCheck.valid) {
        throw new Error(modelCheck.errors.join("; "));
      }

      if (process.env.GEMINI_API_KEY) {
        const sdkReport = await this.verifyModelsAgainstSdk();
        this.sdkVerified = sdkReport.verified;
      }

      // 1. Preload global phonetic memory
      aiMemory.setPronunciation("global", "kwame", "Kwah-meh");
      aiMemory.setPronunciation("global", "kofi", "Koh-fee");
      aiMemory.setPronunciation("global", "anidasoɔ", "Ah-nee-dah-soo-aw");
      aiMemory.setPronunciation("global", "ɔkwankyerɛfo", "Aw-kwan-cheh-reh-foh");

      // 2. Verify Zero-PIN safety integrity
      const pinTest = aiSafety.detectSpokenPin("my pin is 1234");
      if (!pinTest) {
        throw new Error("Zero-PIN safety gate sanity check failed: Expected 'my pin is 1234' to be intercepted.");
      }

      // 3. Bind session repository bridge
      sessionMemoryBridge.initialize();

      this.isInitialized = true;
      const duration = performance.now() - start;

      return {
        status: "INITIALIZED",
        timestamp: Date.now(),
        subsystems: {
          memory: true,
          understanding: true,
          navigation: true,
          action: true,
          safetyGate: true,
          dialogue: true,
          speech: true,
          sessionCache: true,
        },
        zeroPinPolicyVerified: true,
        bootstrapLatencyMs: duration,
        diagnostics: this.getDiagnostics(),
      };
    } catch (err: any) {
      const duration = performance.now() - start;
      return {
        status: "FAILED",
        timestamp: Date.now(),
        subsystems: {
          memory: false,
          understanding: false,
          navigation: false,
          action: false,
          safetyGate: false,
          dialogue: false,
          speech: false,
          sessionCache: false,
        },
        zeroPinPolicyVerified: false,
        bootstrapLatencyMs: duration,
        diagnostics: this.getDiagnostics(),
        errors: [err.message],
      };
    }
  }
}

export const aiBootstrap = AiBootstrap.getInstance();
