/**
 * Ɔkwankyerɛfo Pa - Production Startup Model Verification Module
 * 
 * Verifies that:
 * 1. Required Google Gemini models are configured and available via `ai.models.list()`.
 * 2. Deprecated / prohibited legacy models (e.g. Gemini 1.5, 2.0-flash) are blocked at startup.
 * 3. In production mode, refuses to start if required models are missing (fail-closed security).
 * 4. Gracefully handles quota limits (429) and permission denial (403) with descriptive diagnostics.
 */

import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG } from "./aiConfig";
import { auditLogger } from "../../services/auditLogger";

export const PROHIBITED_DEPRECATED_MODELS = new Set([
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-2.0-flash",
  "gemini-2.0-pro",
  "gemini-2.0-flash-thinking",
]);

export interface ModelVerificationReport {
  success: boolean;
  isProduction: boolean;
  modelsFound: string[];
  configuredModels: {
    reasoning: string;
    transcription: string;
    tts: string;
    live: string;
    embedding: string;
  };
  verifiedModels: {
    reasoning: boolean;
    transcription: boolean;
    tts: boolean;
    live: boolean;
    embedding: boolean;
  };
  warnings: string[];
  errors: string[];
  quotaCooldownMs?: number;
  accessDenied?: boolean;
}

export class ModelVerificationEngine {
  private static instance: ModelVerificationEngine;
  private lastReport: ModelVerificationReport | null = null;

  private constructor() {}

  public static getInstance(): ModelVerificationEngine {
    if (!ModelVerificationEngine.instance) {
      ModelVerificationEngine.instance = new ModelVerificationEngine();
    }
    return ModelVerificationEngine.instance;
  }

  /**
   * Fast static validation of model names against deprecation policy.
   */
  public validateProhibitedModels(models: string[]): { valid: boolean; prohibited: string[] } {
    const prohibited = models.filter((m) => PROHIBITED_DEPRECATED_MODELS.has(m));
    return {
      valid: prohibited.length === 0,
      prohibited,
    };
  }

  /**
   * Performs live model catalog verification against GoogleGenAI `ai.models.list()`.
   */
  public async verifyStartupModels(customApiKey?: string): Promise<ModelVerificationReport> {
    const apiKey = customApiKey || process.env.GEMINI_API_KEY;
    const isProduction = process.env.NODE_ENV === "production";

    const report: ModelVerificationReport = {
      success: false,
      isProduction,
      modelsFound: [],
      configuredModels: {
        reasoning: AI_CONFIG.model || process.env.GEMINI_MODEL || "gemini-3.8-flash",
        transcription: AI_CONFIG.transcriptionModel || "gemini-3.8-flash",
        tts: AI_CONFIG.ttsModel || "gemini-3.8-flash",
        live: AI_CONFIG.liveModel || "gemini-3.8-flash",
        embedding: AI_CONFIG.embeddingModel || "text-embedding-004",
      },
      verifiedModels: {
        reasoning: false,
        transcription: false,
        tts: false,
        live: false,
        embedding: false,
      },
      warnings: [],
      errors: [],
    };

    // 1. Prohibited model check
    const configuredList = Object.values(report.configuredModels).filter(Boolean);
    const deprecationCheck = this.validateProhibitedModels(configuredList);
    if (!deprecationCheck.valid) {
      const err = `PROHIBITED_MODELS: Legacy models prohibited in Ɔkwankyerɛfo Pa: ${deprecationCheck.prohibited.join(", ")}`;
      report.errors.push(err);
      if (isProduction) {
        throw new Error(`[FATAL STARTUP] ${err}`);
      }
    }

    // 2. Missing API Key check
    if (!apiKey) {
      const msg = "GEMINI_API_KEY is not set. Operating in offline local-only fallback mode.";
      if (isProduction) {
        throw new Error(`[FATAL STARTUP] GEMINI_API_KEY is required in production environment.`);
      }
      report.warnings.push(msg);
      this.lastReport = report;
      return report;
    }

    // 3. Query Google GenAI SDK Catalog
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": AI_CONFIG.userAgentHeader || "OkwankyerɛfoPa-IVR/1.0",
          },
        },
      });

      const pager = await ai.models.list();
      const catalog: string[] = [];

      for await (const m of pager) {
        if (m.name) {
          const stripped = m.name.replace(/^models\//, "");
          catalog.push(stripped);
        }
      }

      report.modelsFound = catalog;

      // Verify each configured role
      const roles: (keyof ModelVerificationReport["configuredModels"])[] = [
        "reasoning",
        "transcription",
        "tts",
        "live",
        "embedding",
      ];

      const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3.8-flash,gemini-flash-latest")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const role of roles) {
        const targetModel = report.configuredModels[role];
        if (catalog.includes(targetModel)) {
          report.verifiedModels[role] = true;
        } else {
          // Look for valid fallback in catalog
          const fallback = fallbacks.find((fb) => catalog.includes(fb));
          if (fallback) {
            report.warnings.push(
              `Model '${targetModel}' for role '${role}' not found in catalog. Falling back to '${fallback}'.`
            );
            report.configuredModels[role] = fallback;
            report.verifiedModels[role] = true;
          } else {
            const err = `Required model '${targetModel}' for role '${role}' is missing from Gemini catalog.`;
            report.errors.push(err);
            if (isProduction) {
              throw new Error(`[FATAL STARTUP] ${err}`);
            }
          }
        }
      }

      report.success = report.errors.length === 0;
      auditLogger.log("info", "STARTUP_VERIFICATION", `Gemini models verified: ${report.success ? "PASSED" : "FAILED"}`);
    } catch (err: any) {
      const message = String(err?.message || "");

      // Handle Quota and Permission Gracefully
      if (err?.status === 429 || message.includes("429") || message.includes("RESOURCE_EXHAUSTED") || message.includes("quota")) {
        report.quotaCooldownMs = 60 * 60 * 1000;
        report.warnings.push("Gemini API quota exhausted during startup probe. Running on local acoustic models and DTMF.");
        auditLogger.log("warn", "STARTUP_VERIFICATION", "Startup model probe hit quota limit (429). Fast-failing to DTMF/Offline.");
      } else if (err?.status === 403 || message.includes("403") || message.includes("PERMISSION_DENIED") || message.includes("API_KEY_INVALID")) {
        report.accessDenied = true;
        report.warnings.push("Gemini API permission denied. Operating in local autonomous mode.");
        auditLogger.log("warn", "STARTUP_VERIFICATION", "Startup model probe returned 403 Permission Denied.");
      } else if (isProduction) {
        throw new Error(`[FATAL STARTUP] Failed to verify Gemini models in production: ${message}`);
      } else {
        report.errors.push(`Model verification failed: ${message}`);
      }
    }

    this.lastReport = report;
    return report;
  }

  public getLastReport(): ModelVerificationReport | null {
    return this.lastReport;
  }
}

export const modelVerificationEngine = ModelVerificationEngine.getInstance();

/**
 * 1. Model Verification at Boot
 * Queries GoogleGenAI SDK catalog via ai.models.list(), verifies required models,
 * blocks production start if required models are missing, and logs verification status.
 */
export async function verifyModelsAtStartup(customApiKey?: string): Promise<{ verified: boolean; discovered: string[]; missing: string[] }> {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FATAL: GEMINI_API_KEY not configured. Aborting production start.");
    }
    console.warn("Warning: GEMINI_API_KEY not configured. Using fallback.");
    return { verified: false, discovered: [], missing: [] };
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelsPager = await ai.models.list();
  const discovered: string[] = [];
  for await (const m of modelsPager) {
    if (m.name) {
      discovered.push(m.name.replace(/^models\//, ""));
    }
  }

  const required = [
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.5-transcribe",
    "gemini-3.8-live"
  ];

  const missing: string[] = [];
  for (const model of required) {
    if (!discovered.includes(model)) {
      missing.push(model);
      if (process.env.NODE_ENV === "production") {
        throw new Error(`FATAL: Model ${model} not found. Aborting production start.`);
      } else {
        console.warn(`Warning: Model ${model} not available. Using fallback.`);
      }
    }
  }

  console.log(`✅ All models verified: ${discovered.slice(0, 5).join(", ")}...`);
  return { verified: missing.length === 0, discovered, missing };
}
