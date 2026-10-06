/**
 * Ɔkwankyerɛfo Pa - Ghana NLP Text-To-Speech (TTS v2) Service
 * 
 * Provides authentic Ghanaian language speech synthesis via Ghana NLP API:
 * - POST /tts/v2/synthesize
 * - GET  /tts/v2/languages
 * - GET  /tts/v2/speakers
 * 
 * Authentication: Ocp-Apim-Subscription-Key header
 * Supports: Akan Twi (twi/atw), Ghanaian English (eng), Ga (gaa), Ewe (ewe), Fante (fat), Dagbani (dag)
 */

import { config } from "../config/env";
import { auditLogger } from "./auditLogger";

export interface GhanaNlpTtsSynthesizeOptions {
  text: string;
  language?: "tw" | "twi" | "en" | "eng" | "atw" | "gaa" | "ewe" | "fat" | "dag" | string;
  speakerId?: string;
  timeoutMs?: number;
}

export interface GhanaNlpTtsSynthesizeResult {
  audioBuffer: Buffer;
  audioBase64: string;
  audioMimeType: string;
  durationEstimateSec: number;
  provider: string;
  language: string;
}

export interface GhanaNlpHealthResult {
  ready: boolean;
  provider: string;
  statusCode?: number;
  error?: string;
  languages?: Record<string, string> | string[];
}

export class GhanaNlpTtsService {
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
   * Normalizes system language tags to Ghana NLP TTS v2 language identifiers.
   */
  public normalizeLanguageCode(lang?: string): string {
    const clean = (lang || "").toLowerCase().trim();
    if (clean === "tw" || clean === "twi" || clean === "ak" || clean === "akan") {
      return "twi";
    }
    if (clean === "atw" || clean === "akuapem" || clean === "akuapem-twi") {
      return "atw";
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
    if (clean === "fat" || clean === "fante") {
      return "fat";
    }
    if (clean === "dag" || clean === "dagbani") {
      return "dag";
    }
    return clean || "twi";
  }

  /**
   * Retrieve list of supported TTS languages from Ghana NLP catalogue.
   */
  public async getLanguages(): Promise<any> {
    const url = `${this.baseUrl}/tts/v2/languages`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      throw new Error(`Ghana NLP TTS getLanguages failed: HTTP ${res.status} ${res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Retrieve catalogue of available speakers/voices.
   */
  public async getSpeakers(): Promise<any> {
    const url = `${this.baseUrl}/tts/v2/speakers`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      throw new Error(`Ghana NLP TTS getSpeakers failed: HTTP ${res.status} ${res.statusText}`);
    }

    return await res.json();
  }

  /**
   * Synthesizes text to speech using Ghana NLP TTS v2 endpoint.
   */
  public async synthesize(options: GhanaNlpTtsSynthesizeOptions): Promise<GhanaNlpTtsSynthesizeResult> {
    if (!this.isConfigured()) {
      throw new Error("GHANANLP_API_KEY is not configured.");
    }

    const { text, speakerId, timeoutMs = 8000 } = options;
    const ghaLang = this.normalizeLanguageCode(options.language);

    const payload: Record<string, any> = {
      text,
      language: ghaLang,
    };
    if (speakerId) {
      payload.speaker_id = speakerId;
    }

    const url = `${this.baseUrl}/tts/v2/synthesize`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Accept": "*/*",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Ghana NLP TTS synthesize failed: HTTP ${res.status} ${errBody.slice(0, 160)}`);
    }

    const contentType = res.headers.get("content-type") || "";
    let audioBuffer: Buffer;
    let audioMimeType = "audio/wav";

    if (contentType.includes("application/json")) {
      const json = await res.json();
      if (json.audioContent || json.audio_base64 || json.base64) {
        const rawBase64 = json.audioContent || json.audio_base64 || json.base64;
        audioBuffer = Buffer.from(rawBase64.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64");
        audioMimeType = json.mimeType || "audio/wav";
      } else if (json.audio_url || json.url) {
        const audioFetch = await fetch(json.audio_url || json.url, { signal: AbortSignal.timeout(5000) });
        audioBuffer = Buffer.from(await audioFetch.arrayBuffer());
        audioMimeType = audioFetch.headers.get("content-type") || "audio/wav";
      } else {
        throw new Error("Ghana NLP TTS JSON response did not contain audio payload: " + JSON.stringify(json).slice(0, 100));
      }
    } else {
      // Direct binary audio bytes (WAV or MP3)
      const ab = await res.arrayBuffer();
      audioBuffer = Buffer.from(ab);
      if (contentType.includes("audio/")) {
        audioMimeType = contentType.split(";")[0].trim();
      }
    }

    if (!audioBuffer || audioBuffer.length < 32) {
      throw new Error("Received empty or truncated audio buffer from Ghana NLP TTS.");
    }

    const wordCount = Math.max(1, text.trim().split(/\s+/).length);
    const durationEstimateSec = Math.max(1, Math.round(wordCount * 0.35));

    return {
      audioBuffer,
      audioBase64: audioBuffer.toString("base64"),
      audioMimeType,
      durationEstimateSec,
      provider: "GhanaNLP_TTS_v2",
      language: ghaLang,
    };
  }

  /**
   * Health check for Ghana NLP TTS connectivity.
   */
  public async healthCheck(): Promise<GhanaNlpHealthResult> {
    if (!this.isConfigured()) {
      return {
        ready: false,
        provider: "Ghana NLP TTS v2",
        error: "Unconfigured (GHANANLP_API_KEY is missing)",
      };
    }

    try {
      const languages = await this.getLanguages();
      return {
        ready: true,
        provider: "Ghana NLP TTS v2",
        languages,
      };
    } catch (err: any) {
      return {
        ready: false,
        provider: "Ghana NLP TTS v2",
        error: err.message,
      };
    }
  }
}

export const ghanaNlpTtsService = new GhanaNlpTtsService();
