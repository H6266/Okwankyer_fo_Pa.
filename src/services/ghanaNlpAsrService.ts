/**
 * Ɔkwankyerɛfo Pa - Ghana NLP Automatic Speech Recognition (ASR v3) Service
 * 
 * Provides authentic Ghanaian language speech recognition via Ghana NLP API:
 * - GET  /asr/v3/languages
 * - POST /asr/v3 (or /asr/v3?language=<lang>)
 * 
 * Authentication: Ocp-Apim-Subscription-Key header
 * Supports: Asante Twi (twi), Akuapem Twi (atw), English (eng), Fante (fat),
 * Ga (gaa), Ewe (ewe), Dagbani (dag), Hausa (hau), and 20+ other regional languages.
 */

import { config } from "../config/env";
import { auditLogger } from "./auditLogger";

export interface GhanaNlpAsrResult {
  text: string;
  confidence: number;
  languageDetected?: "en" | "twi" | string;
  provider: string;
}

export interface GhanaNlpAsrLanguagesResult {
  languages: Record<string, string>;
}

export class GhanaNlpAsrService {
  private get baseUrl(): string {
    return (config.ghanaNlp?.baseUrl || process.env.GHANANLP_BASE_URL || "https://translation-api.ghananlp.org").trim().replace(/\/+$/, "");
  }

  private get apiKey(): string {
    return (config.ghanaNlp?.apiKey || process.env.GHANANLP_API_KEY || "").trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Normalizes language hints to Ghana NLP ASR language code.
   */
  public normalizeLanguageCode(lang?: string): string {
    const clean = (lang || "").toLowerCase().trim();
    if (clean === "tw" || clean === "twi" || clean === "ak" || clean === "akan") {
      return "twi";
    }
    if (clean === "atw" || clean === "akuapem" || clean === "akuapem-twi") {
      return "atw";
    }
    if (clean === "fat" || clean === "fante") {
      return "fat";
    }
    if (clean === "en" || clean === "eng" || clean === "english") {
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
    return clean || "twi";
  }

  /**
   * Retrieve list of supported ASR languages from Ghana NLP catalogue.
   */
  public async getLanguages(): Promise<GhanaNlpAsrLanguagesResult> {
    const url = `${this.baseUrl}/asr/v3/languages`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      throw new Error(`Ghana NLP ASR getLanguages failed: HTTP ${res.status} ${res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Transcribes raw audio buffer using Ghana NLP ASR v3.
   */
  public async transcribe(
    audioBuffer: Buffer,
    languageHint: string = "twi",
    mimeType: string = "audio/wav",
    timeoutMs: number = 5000
  ): Promise<GhanaNlpAsrResult> {
    if (!this.isConfigured()) {
      throw new Error("GHANANLP_API_KEY is not configured.");
    }

    const ghaLang = this.normalizeLanguageCode(languageHint);

    // Ghana NLP ASR v3 expects raw audio bytes posted to /asr/v3 with language param
    const url = `${this.baseUrl}/asr/v3?language=${encodeURIComponent(ghaLang)}`;
    const effectiveMime = mimeType.includes("wav")
      ? "audio/wav"
      : mimeType.includes("mp3") || mimeType.includes("mpeg")
      ? "audio/mp3"
      : "application/octet-stream";

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

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Ghana NLP ASR failed: HTTP ${res.status} ${errText.slice(0, 160)}`);
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

    const isTwi = ghaLang === "twi" || ghaLang === "atw" || ghaLang === "fat";
    const confidence = transcript.length > 0 ? 0.94 : 0.0;

    return {
      text: transcript.length > 0 ? transcript : "empty",
      confidence,
      languageDetected: isTwi ? "twi" : "en",
      provider: "GhanaNLP_ASR_v3",
    };
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
