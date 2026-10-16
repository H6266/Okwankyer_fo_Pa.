/**
 * Ɔkwankyerɛfo Pa - AI System Configuration
 * Fully environment-driven model and runtime parameters.
 */

import { AiLanguage } from "./aiTypes";

export interface AiSystemConfiguration {
  model: string;
  fallbackModel: string;
  liveModel: string;
  transcriptionModel: string;
  ttsModel: string;
  embeddingModel: string;
  confidenceThresholds: {
    high: number;      // >= 0.85: Execute with normal confirmation
    medium: number;    // 0.55 - 0.84: Seek affirmative clarification
    low: number;       // < 0.55: Ask caller to repeat or pick
  };
  defaultLanguage: AiLanguage;
  enforceZeroPin: boolean;
  userAgentHeader: string;
  maxSessionIdleMs: number;
  maxRetries: number;
  modelTimeoutMs: number;
  confirmationTtlMs: number;
  isProduction: boolean;
}

export const AI_CONFIG: AiSystemConfiguration = {
  // Primary reasoning model: gemini-3.8-flash (official GA model for text & reasoning)
  model: process.env.GEMINI_REASONING_MODEL || process.env.GEMINI_MODEL || "gemini-3.8-flash",
  // Fallback reasoning model: gemini-flash-latest
  fallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-latest",
  liveModel: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
  transcriptionModel: process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe",
  ttsModel: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
  embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2-preview",
  confidenceThresholds: {
    high: 0.85,
    medium: 0.55,
    low: 0.35,
  },
  defaultLanguage: "tw",
  enforceZeroPin: true,
  userAgentHeader: "aistudio-build",
  maxSessionIdleMs: 30 * 60 * 1000, // 30 minutes session TTL
  maxRetries: 2,
  modelTimeoutMs: 3500, // Strict 3.5s per-turn budget for telephony latency SLA
  confirmationTtlMs: 2 * 60 * 1000, // 2-minute confirmation expiry
  isProduction: process.env.NODE_ENV === "production",
};
