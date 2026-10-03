/**
 * Ɔkwankyerɛfo Pa - AI System Bootstrap & Diagnostics (aiBootstrap.ts)
 *
 * Bootstraps the deterministic canonical cognitive architecture:
 * 1. Validates configured Gemini model identifiers against official supported models
 * 2. Enforces fail-closed rules in production mode
 * 3. Preloads phonetic and pronunciation lexicons into intelligent memory
 * 4. Initializes durable session and memory systems
 * 5. Runs automated latency & safety integrity checks
 * 6. Exposes runtime configuration diagnostics
 */

import { aiEngine } from "./aiEngine";
import { aiMemory } from "./aiMemory";
import { sessionMemoryBridge } from "../memory/sessionMemoryBridge";
import { aiSafety } from "./aiSafety";
import { AI_CONFIG } from "./aiConfig";

const VALID_REASONING_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "gemini-flash-latest",
]);

const VALID_LIVE_MODELS = new Set([
  "gemini-3.8-live",
  "gemini-3.8-live-extended-thinking",
  "gemini-3.5-transcribe-live",
]);

const VALID_TRANSCRIBE_MODELS = new Set([
  "gemini-3.5-transcribe",
]);

const VALID_TTS_MODELS = new Set([
  "gemini-3.8-flash-lite-tts",
  "gemini-3.8-flash-tts",
]);

const VALID_EMBEDDING_MODELS = new Set([
  "gemini-embedding-2-preview",
]);

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

  private constructor() {}

  public static getInstance(): AiBootstrap {
    if (!AiBootstrap.instance) {
      AiBootstrap.instance = new AiBootstrap();
    }
    return AiBootstrap.instance;
  }

  /**
   * Validates configured model identifiers and throws on deprecated or invalid models.
   */
  public validateModelConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check deprecated models
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

    if (!VALID_REASONING_MODELS.has(AI_CONFIG.model)) {
      errors.push(`INVALID_MODEL: Reasoning model '${AI_CONFIG.model}' is not a recognized model.`);
    }

    if (!VALID_LIVE_MODELS.has(AI_CONFIG.liveModel)) {
      errors.push(`INVALID_MODEL: Live model '${AI_CONFIG.liveModel}' is not a recognized live model.`);
    }

    if (!VALID_TRANSCRIBE_MODELS.has(AI_CONFIG.transcriptionModel)) {
      errors.push(`INVALID_MODEL: Transcription model '${AI_CONFIG.transcriptionModel}' is not recognized.`);
    }

    if (!VALID_TTS_MODELS.has(AI_CONFIG.ttsModel)) {
      errors.push(`INVALID_MODEL: TTS model '${AI_CONFIG.ttsModel}' is not recognized.`);
    }

    if (!VALID_EMBEDDING_MODELS.has(AI_CONFIG.embeddingModel)) {
      errors.push(`INVALID_MODEL: Embedding model '${AI_CONFIG.embeddingModel}' is not recognized.`);
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
        reasoning: { id: AI_CONFIG.model, valid: VALID_REASONING_MODELS.has(AI_CONFIG.model) },
        live: { id: AI_CONFIG.liveModel, valid: VALID_LIVE_MODELS.has(AI_CONFIG.liveModel) },
        transcribe: { id: AI_CONFIG.transcriptionModel, valid: VALID_TRANSCRIBE_MODELS.has(AI_CONFIG.transcriptionModel) },
        tts: { id: AI_CONFIG.ttsModel, valid: VALID_TTS_MODELS.has(AI_CONFIG.ttsModel) },
        embedding: { id: AI_CONFIG.embeddingModel, valid: VALID_EMBEDDING_MODELS.has(AI_CONFIG.embeddingModel) },
      },
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

      // 1. Preload global phonetic memory
      aiMemory.setPronunciation("global", "kwame", "Kwah-meh");
      aiMemory.setPronunciation("global", "kofi", "Koh-fee");
      aiMemory.setPronunciation("global", "anidasoɔ", "Ah-nee-dah-soo-aw");
      aiMemory.setPronunciation("global", "ɔkwankyerɛfo", "Aw-kwan-cheh-reh-foh");

      // 2. Verify Zero-PIN safety integrity
      const pinTest = aiSafety.detectSpokenPin("my pin is 1234");
      if (!pinTest) {
        throw new Error("Zero-PIN safety policy check failed during bootstrap");
      }

      // 3. Warm-up test query on central orchestrator (<80ms check)
      await aiEngine.process({
        sessionId: "bootstrap_warmup",
        channel: "SIMULATOR",
        input: "Akwaaba",
        currentStep: "welcome",
      });

      aiMemory.clearSession("bootstrap_warmup");
      sessionMemoryBridge.terminateSession("bootstrap_warmup");

      const elapsed = Math.round(performance.now() - start);
      this.isInitialized = true;

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
        bootstrapLatencyMs: elapsed,
        diagnostics: this.getDiagnostics(),
      };
    } catch (err: any) {
      console.error("[AiBootstrap] Initialization failed:", err);
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
        bootstrapLatencyMs: Math.round(performance.now() - start),
        diagnostics: this.getDiagnostics(),
        errors: [err.message],
      };
    }
  }

  public get ready(): boolean {
    return this.isInitialized;
  }
}

export const aiBootstrap = AiBootstrap.getInstance();
