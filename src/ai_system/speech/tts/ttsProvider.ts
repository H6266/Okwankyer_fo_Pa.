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
  mimeType?: string;
  durationEstimateSec?: number;
  providerUsed: string;
  language?: string;
  model?: string;
}

export type ValidatedTtsSynthesisResponse = TtsSynthesisResponse & {
  audioBuffer: Buffer;
  language: string;
  model: string;
};

export interface TTSProvider {
  synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse>;
}

export function normalizeTtsLanguage(language: string): "en" | "twi" | null {
  const normalized = language.trim().toLowerCase().split(/[-_]/)[0];
  if (["en", "eng"].includes(normalized)) return "en";
  if (["tw", "twi", "ak", "akan"].includes(normalized)) return "twi";
  return null;
}

export function getTtsErrorCode(error: unknown): string {
  if (!(error instanceof Error)) return "TTS_UNKNOWN_ERROR";
  return error.message.match(/^\s*([A-Z][A-Z0-9_]*)(?::|$)/)?.[1] || error.name || "TTS_ERROR";
}

export function isAudioContainerValid(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 4) return false;
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  if (["audio/wav", "audio/x-wav"].includes(mime)) {
    return buffer.length >= 44
      && buffer.toString("ascii", 0, 4) === "RIFF"
      && buffer.toString("ascii", 8, 12) === "WAVE"
      && buffer.readUInt32LE(4) + 8 <= buffer.length;
  }
  if (["audio/mpeg", "audio/mp3"].includes(mime)) {
    if (buffer.toString("ascii", 0, 3) === "ID3") return true;
    return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  }
  if (["audio/mp4", "audio/m4a"].includes(mime)) {
    return buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp";
  }
  if (mime === "audio/aac") {
    return buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0;
  }
  if (mime === "audio/ogg") return buffer.toString("ascii", 0, 4) === "OggS";
  return false;
}

export function assertTtsResponse(
  request: TtsSynthesisRequest,
  response: TtsSynthesisResponse,
  requiredLanguage?: "en" | "twi"
): ValidatedTtsSynthesisResponse {
  const language = normalizeTtsLanguage(String(request.language || ""));
  if (!language || (requiredLanguage && language !== requiredLanguage)) {
    throw new Error("TTS_LANGUAGE_MISMATCH: provider request language is unsupported.");
  }
  if (!response.language || normalizeTtsLanguage(response.language) !== language) {
    throw new Error("TTS_LANGUAGE_MISMATCH: provider response language does not match the request.");
  }
  if (!response.model?.trim()) {
    throw new Error("TTS_MODEL_INVALID: provider did not return a valid model identifier.");
  }
  if (!response.audioMimeType || !response.audioBuffer || !isAudioContainerValid(response.audioBuffer, response.audioMimeType)) {
    throw new Error("TTS_AUDIO_INVALID: provider MIME type does not match a supported audio container.");
  }
  return { ...response, audioBuffer: response.audioBuffer, language, model: response.model };
}
