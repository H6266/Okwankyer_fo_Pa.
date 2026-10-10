/**
 * Ɔkwankyerɛfo Pa - AI System Configuration
 * Fully environment-driven model and runtime parameters.
 */

import { AiLanguage } from "./aiTypes";

export interface AiSystemConfiguration {
  model: string;
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
  confirmationTtlMs: number;
  isProduction: boolean;
}

export const AI_CONFIG: AiSystemConfiguration = {
  model: process.env.GEMINI_REASONING_MODEL || "gemini-3.8-flash",
  liveModel: process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
  transcriptionModel: process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.8-flash",
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
  maxRetries: 3,
  confirmationTtlMs: 2 * 60 * 1000, // 2-minute confirmation expiry
  isProduction: process.env.NODE_ENV === "production",
};
