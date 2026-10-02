/**
 * Ɔkwankyerɛfo Pa - AI System Configuration
 */

import { AiLanguage } from "./aiTypes";

export interface AiSystemConfiguration {
  model: string;
  transcriptionModel: string;
  ttsModel: string;
  confidenceThresholds: {
    high: number;      // >= 0.90: Execute immediately if safe
    medium: number;    // 0.60 - 0.89: Confirm interpretation when necessary
    low: number;       // < 0.60: Ask for clarification
  };
  defaultLanguage: AiLanguage;
  enforceZeroPin: boolean;
  userAgentHeader: string;
  maxSessionIdleMs: number;
  maxRetries: number;
}

export const AI_CONFIG: AiSystemConfiguration = {
  model: "gemini-3.8-flash",
  transcriptionModel: "gemini-3.5-transcribe",
  ttsModel: "gemini-3.8-flash-lite-tts",
  confidenceThresholds: {
    high: 0.90,
    medium: 0.60,
    low: 0.40,
  },
  defaultLanguage: "tw",
  enforceZeroPin: true,
  userAgentHeader: "aistudio-build",
  maxSessionIdleMs: 120000, // 2 minutes
  maxRetries: 3,
};
