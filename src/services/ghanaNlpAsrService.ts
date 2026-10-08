/**
 * Ɔkwankyerɛfo Pa - Ghana NLP Automatic Speech Recognition (ASR v3) Service
 * 
 * Authoritative integration for Ghanaian-language speech recognition via Ghana NLP API.
 * Supports: Asante Twi (twi), Akuapem Twi (atw), English (eng), Fante (fat),
 * Ga (gaa), Ewe (ewe), Dagbani (dag), Hausa (hau), and other regional languages.
 * 
 * Rules:
 * - NO fake confidence numbers (returns null with confidenceSource="provider_unreported").
 * - NO hardcoded 2-3s timeouts (uses configurable per-chunk timeout, default 15s).
 * - Explicit error classification and exponential backoff retry for transient errors.
 * - API keys are strictly backend-only (never exposed to frontend).
 */

import { config } from "../config/env";
import { auditLogger } from "./auditLogger";

export type GhanaNlpErrorCode =
  | "GHANANLP_AUTH_ERROR"
  | "GHANANLP_RATE_LIMIT"
  | "GHANANLP_TIMEOUT"
  | "GHANANLP_BAD_AUDIO"
  | "GHANANLP_UNSUPPORTED_LANGUAGE"
  | "GHANANLP_PROVIDER_ERROR"
  | "GHANANLP_EMPTY_RESULT"
  | "GHANANLP_UNCONFIGURED";

export class GhanaNlpAsrError extends Error {
  public readonly code: GhanaNlpErrorCode;
  public readonly statusCode?: number;
  public readonly isRetriable: boolean;

  constructor(message: string, code: GhanaNlpErrorCode, statusCode?: number, isRetriable: boolean = false) {
    super(message);
    this.name = "GhanaNlpAsrError";
    this.code = code;
    this.statusCode = statusCode;
    this.isRetriable = isRetriable;
  }
}

export interface GhanaNlpAsrResult {
  text: string;
  confidence: number | null;
  confidenceSource: "provider" | "calibrated" | "provider_unreported" | "unavailable";
  languageDetected?: string;
  provider: string;
  latencyMs: number;
}

export interface GhanaNlpAsrLanguagesResult {
  languages: Record<string, string>;
}

export class GhanaNlpAsrService {
  public get baseUrl(): string {
    return (config.ghanaNlp?.baseUrl || process.env.GHANANLP_BASE_URL || "https://translation-api.ghananlp.org").trim().replace(/\/+$/, "");
  }

  public get apiKey(): string {
    return (config.ghanaNlp?.apiKey || process.env.GHANANLP_API_KEY || "").trim();
  }

  public get defaultTimeoutMs(): number {
    return config.ghanaNlp?.timeoutMs || 15000;
  }

  public get defaultRetries(): number {
    return config.ghanaNlp?.retries ?? 2;
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Normalizes language hints to Ghana NLP ASR v3 language codes.
   * twi-asante / twi / tw / ak -> "twi"
   * twi-akuapem / atw -> "atw"
   * en / eng / english -> "eng"
   * fat / fante -> "fat"
   * gaa / ga -> "gaa"
   * ewe -> "ewe"
   * dag -> "dag"
   * hau / hausa -> "hau"
   */
  public normalizeLanguageCode(lang?: string): string {
    const clean = (lang || "").toLowerCase().trim();
    if (clean === "twi-asante" || clean === "asante" || clean === "twi" || clean === "tw" || clean === "ak" || clean === "akan") {
      return "twi";
    }
    if (clean === "twi-akuapem" || clean === "akuapem" || clean === "akuapem-twi" || clean === "atw") {
      return "atw";
    }
    if (clean === "fat" || clean === "fante") {
      return "fat";
    }
    if (clean === "en" || clean === "eng" || clean === "english" || clean === "en-gh") {
      return "eng";
    }
    if (clean === "ga" || clean === "gaa") {
      return "gaa";
    }
    if (clean === "ewe") {
      return "ewe";
    }
    if (clean === "dag" || clean === "dagbani") {
      return "dag";
    }
    if (clean === "hau" || clean === "hausa") {
      return "hau";
    }
    return clean || "eng";
  }

  /**
   * Retrieve list of supported ASR languages from Ghana NLP catalogue.
   */
  public async getLanguages(): Promise<GhanaNlpAsrLanguagesResult> {
    if (!this.isConfigured()) {
      throw new GhanaNlpAsrError("GHANANLP_API_KEY is not configured", "GHANANLP_UNCONFIGURED", undefined, false);
    }

    const url = `${this.baseUrl}/asr/v3/languages`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Ocp-Apim-Subscription-Key": this.apiKey,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new GhanaNlpAsrError(`Ghana NLP authentication failed: HTTP ${res.status}`, "GHANANLP_AUTH_ERROR", res.status, false);
        }
        throw new GhanaNlpAsrError(`Ghana NLP languages retrieval failed: HTTP ${res.status}`, "GHANANLP_PROVIDER_ERROR", res.status, res.status >= 500);
      }

      return await res.json();
    } catch (err: any) {
      if (err instanceof GhanaNlpAsrError) throw err;
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        throw new GhanaNlpAsrError("Ghana NLP languages request timed out", "GHANANLP_TIMEOUT", undefined, true);
      }
      throw new GhanaNlpAsrError(`Ghana NLP languages error: ${err.message}`, "GHANANLP_PROVIDER_ERROR", undefined, true);
    }
  }

  /**
   * Transcribes raw audio buffer using Ghana NLP ASR v3 with retry policy.
   * 
   * @param audioBuffer 16kHz mono PCM WAV buffer
   * @param languageHint "twi" | "atw" | "eng" | "fat" | "gaa" | etc.
   * @param mimeType standard audio MIME
   * @param timeoutMs per-chunk timeout in milliseconds
   */
  public async transcribe(
    audioBuffer: Buffer,
    languageHint: string = "twi",
    mimeType: string = "audio/wav",
    timeoutMs: number = this.defaultTimeoutMs
  ): Promise<GhanaNlpAsrResult> {
    if (!this.isConfigured()) {
      throw new GhanaNlpAsrError("GHANANLP_API_KEY is not configured", "GHANANLP_UNCONFIGURED", undefined, false);
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new GhanaNlpAsrError("Audio buffer is empty", "GHANANLP_BAD_AUDIO", 400, false);
    }

    const ghaLang = this.normalizeLanguageCode(languageHint);
    const url = `${this.baseUrl}/asr/v3?language=${encodeURIComponent(ghaLang)}`;
    const effectiveMime = mimeType.includes("wav")
      ? "audio/wav"
      : mimeType.includes("mp3") || mimeType.includes("mpeg")
      ? "audio/mp3"
      : "audio/wav";

    let lastError: Error | null = null;
    const maxRetries = this.defaultRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const startTime = performance.now();
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": effectiveMime,
            "Ocp-Apim-Subscription-Key": this.apiKey,
            "Accept": "application/json, text/plain, */*",
          },
          body: audioBuffer,
          signal: AbortSignal.timeout(timeoutMs),
        });

        const latencyMs = Math.round(performance.now() - startTime);

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          if (res.status === 401 || res.status === 403) {
            throw new GhanaNlpAsrError(
              `Ghana NLP authentication failed: HTTP ${res.status} (${errText.slice(0, 100)})`,
              "GHANANLP_AUTH_ERROR",
              res.status,
              false
            );
          }
          if (res.status === 429) {
            throw new GhanaNlpAsrError(
              `Ghana NLP rate limit exceeded: HTTP 429`,
              "GHANANLP_RATE_LIMIT",
              429,
              true
            );
          }
          if (res.status === 400) {
            throw new GhanaNlpAsrError(
              `Ghana NLP bad audio/request: HTTP 400 (${errText.slice(0, 100)})`,
              "GHANANLP_BAD_AUDIO",
              400,
              false
            );
          }
          const isServerErr = res.status >= 500;
          throw new GhanaNlpAsrError(
            `Ghana NLP ASR failed: HTTP ${res.status} (${errText.slice(0, 100)})`,
            "GHANANLP_PROVIDER_ERROR",
            res.status,
            isServerErr
          );
        }

        const contentType = res.headers.get("content-type") || "";
        let transcript = "";

        if (contentType.includes("application/json")) {
          const json = await res.json();
          transcript = (
            json.transcript ||
            json.text ||
            json.transcription ||
            json.result ||
            ""
          ).trim();
        } else {
          transcript = (await res.text()).trim();
        }

        auditLogger.log(
          "info",
          "GHANANLP_ASR",
          `Ghana NLP transcribed [lang=${ghaLang}] len=${transcript.length} in ${latencyMs}ms (attempt ${attempt + 1})`
        );

        return {
          text: transcript.length > 0 ? transcript : "",
          confidence: null, // GhanaNLP does not report model probability; do not fabricate numbers!
          confidenceSource: "provider_unreported",
          languageDetected: ghaLang,
          provider: "GhanaNLP_ASR_v3",
          latencyMs,
        };
      } catch (err: any) {
        lastError = err;
        const isRetriable = err instanceof GhanaNlpAsrError ? err.isRetriable : err.name === "TimeoutError" || err.name === "AbortError";

        if (err.name === "TimeoutError" || err.name === "AbortError") {
          lastError = new GhanaNlpAsrError(
            `Ghana NLP ASR request timed out after ${timeoutMs}ms`,
            "GHANANLP_TIMEOUT",
            undefined,
            true
          );
        }

        if (!isRetriable || attempt >= maxRetries) {
          break;
        }

        // Exponential backoff: 300ms, 600ms, 1200ms
        const backoffMs = Math.min(2000, 300 * Math.pow(2, attempt));
        auditLogger.log(
          "warn",
          "GHANANLP_ASR",
          `Ghana NLP ASR transient notice: ${lastError.message}. Retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})...`
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError || new GhanaNlpAsrError("Ghana NLP transcription failed", "GHANANLP_PROVIDER_ERROR");
  }

  /**
   * Health check for Ghana NLP ASR connectivity.
   */
  public async healthCheck(): Promise<{ ready: boolean; provider: string; error?: string; languages?: any }> {
    if (!this.isConfigured()) {
      return {
        ready: false,
        provider: "Ghana NLP ASR v3",
        error: "Unconfigured (GHANANLP_API_KEY is missing)",
      };
    }

    try {
      const data = await this.getLanguages();
      return {
        ready: true,
        provider: "Ghana NLP ASR v3",
        languages: data.languages,
      };
    } catch (err: any) {
      return {
        ready: false,
        provider: "Ghana NLP ASR v3",
        error: err.message,
      };
    }
  }
}

export const ghanaNlpAsrService = new GhanaNlpAsrService();
