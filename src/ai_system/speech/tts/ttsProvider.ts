/**
 * Ɔkwankyerɛfo Pa - Provider-Independent TTS Interface
 */

import { AiLanguage } from "../../core/aiTypes";

export interface TtsSynthesisRequest {
  text: string;
  language: AiLanguage;
  voiceProfile?: string;
  pronunciationHints?: Record<string, string>;
  speed?: number;
  pitch?: number;
  provider?: "gemini" | "fallback" | "custom";
  skipCatalogCheck?: boolean;
  purpose?: string;
}

export interface TtsSynthesisResponse {
  audioBuffer?: Buffer;
  audioBase64?: string;
  audioMimeType: string;
  durationEstimateSec?: number;
  providerUsed: string;
}

export interface TTSProvider {
  synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse>;
}
