/**
 * Ɔkwankyerɛfo Pa - Automated Speech Recognition (ASR) Service Adapter
 * 
 * Provides a provider-swappable ASR interface that decouples the rest of the application
 * from the underlying speech recognition implementation (UG HCI Lab ASR, Gemini, or Mock).
 * 
 * Configuration variables:
 * - ASR_PROVIDER: "hci" | "gemini" | "mock"
 * - HCI_ASR_ENABLED: "true" | "false"
 * - HCI_ASR_URL: Endpoint provided by UG HCI Lab
 * - HCI_ASR_API_KEY: Authentication token/key for UG HCI Lab ASR
 * - HCI_ASR_TIMEOUT_MS: Timeout in milliseconds (default: 10000)
 */

import { GoogleGenAI } from "@google/genai";

export interface ASRResult {
  text: string;
  language?: "en" | "twi" | string;
  confidence: number;
  provider: string;
  rawResponse?: any;
}

export interface ASROptions {
  language?: "en" | "twi" | string;
  mimeType?: string;
  timeoutMs?: number;
  callerNumber?: string;
}

export interface ASRProvider {
  name: string;
  transcribe(audioPayload: Buffer | string, options?: ASROptions): Promise<ASRResult>;
}

/**
 * UG HCI Lab ASR Provider Adapter
 * Encapsulates the HTTP contract with University of Ghana HCI Lab's speech recognition API.
 */
export class UghciAsrAdapter implements ASRProvider {
  public name = "UghciAsr";

  private get apiUrl(): string {
    return process.env.HCI_ASR_URL || "";
  }

  private get apiKey(): string {
    return process.env.HCI_ASR_API_KEY || "";
  }

  private get timeoutMs(): number {
    const parsed = parseInt(process.env.HCI_ASR_TIMEOUT_MS || "10000", 10);
    return isNaN(parsed) ? 10000 : parsed;
  }

  public async transcribe(
    audioPayload: Buffer | string,
    options?: ASROptions
  ): Promise<ASRResult> {
    if (!this.apiUrl) {
      throw new Error("HCI_ASR_URL is not configured.");
    }

    const timeout = options?.timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      console.log(`[UghciAsr] Transcribing audio with UG HCI Lab ASR (${timeout}ms timeout)...`);

      let buffer: Buffer;
      let mimeType = options?.mimeType || "audio/wav";

      if (Buffer.isBuffer(audioPayload)) {
        buffer = audioPayload;
      } else if (typeof audioPayload === "string" && audioPayload.startsWith("data:")) {
        const match = audioPayload.match(/^data:([^;]+);base64,(.+)$/);
        mimeType = match ? match[1] : mimeType;
        buffer = Buffer.from(match ? match[2] : audioPayload, "base64");
      } else if (typeof audioPayload === "string" && (audioPayload.startsWith("http://") || audioPayload.startsWith("https://"))) {
        // Download Africa's Talking recording
        const fetchRes = await fetch(audioPayload);
        const arrayBuf = await fetchRes.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } else if (typeof audioPayload === "string") {
        buffer = Buffer.from(audioPayload, "base64");
      } else {
        buffer = Buffer.alloc(0);
      }

      const headers: Record<string, string> = {
        "Content-Type": mimeType,
      };

      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
        headers["x-api-key"] = this.apiKey;
      }

      if (options?.language) {
        headers["x-language"] = options.language;
      }

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers,
        body: new Uint8Array(buffer),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`UG HCI ASR API returned HTTP status ${response.status}`);
      }

      const result = await response.json();

      // Normalize UG HCI Lab ASR response
      const transcript =
        result.text ||
        result.transcript ||
        result.transcription ||
        result.hypotheses?.[0]?.transcript ||
        "";
      const confidence =
        typeof result.confidence === "number"
          ? result.confidence
          : typeof result.score === "number"
          ? result.score
          : 0.92;
      const detectedLang = result.language || result.detected_language || options?.language || "en";

      const normalizedText = transcript.trim();
      const isEmpty = !normalizedText || normalizedText.toLowerCase() === "empty";

      return {
        text: isEmpty ? "empty" : normalizedText,
        language: detectedLang,
        confidence: isEmpty ? 0.1 : confidence,
        provider: this.name,
        rawResponse: result,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === "AbortError";
      console.warn(`[UghciAsr] UG HCI Lab ASR ${isAbort ? "timed out" : "failed"}: ${err.message}`);
      throw err;
    }
  }
}

/**
 * Gemini ASR Provider Adapter
 * Resilient multimodal transcription engine for Ghanaian English and Akan Twi.
 */
export class GeminiAsrAdapter implements ASRProvider {
  public name = "GeminiASR";
  private aiClient: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI | null {
    if (!this.aiClient && process.env.GEMINI_API_KEY) {
      this.aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return this.aiClient;
  }

  public async transcribe(
    audioPayload: Buffer | string,
    options?: ASROptions
  ): Promise<ASRResult> {
    const ai = this.getClient();
    if (!ai) {
      console.warn("[GeminiASR] GEMINI_API_KEY is not configured.");
      return { text: "empty", confidence: 0.1, provider: this.name, language: "en" };
    }

    try {
      let buffer: Buffer;
      let mime = options?.mimeType || "audio/mp3";

      if (Buffer.isBuffer(audioPayload)) {
        buffer = audioPayload;
      } else if (typeof audioPayload === "string" && (audioPayload.startsWith("http://") || audioPayload.startsWith("https://"))) {
        const atRes = await fetch(audioPayload);
        const ab = await atRes.arrayBuffer();
        buffer = Buffer.from(ab);
        const ct = atRes.headers.get("content-type") || "";
        if (ct.includes("wav")) mime = "audio/wav";
      } else if (typeof audioPayload === "string" && audioPayload.startsWith("data:")) {
        const match = audioPayload.match(/^data:([^;]+);base64,(.+)$/);
        mime = match ? match[1] : mime;
        buffer = Buffer.from(match ? match[2] : audioPayload, "base64");
      } else if (typeof audioPayload === "string") {
        // Plain text fallback or base64
        if (/^[a-zA-Z0-9\s.,?!]+$/.test(audioPayload) && audioPayload.length < 200) {
          return { text: audioPayload.trim(), confidence: 0.95, language: options?.language || "en", provider: "TextPassthrough" };
        }
        buffer = Buffer.from(audioPayload, "base64");
      } else {
        buffer = Buffer.alloc(0);
      }

      if (buffer.length < 300) {
        return { text: "empty", confidence: 0.1, language: options?.language || "en", provider: this.name };
      }

      const promptText = `You are the automated speech recognition engine for Ɔkwankyerɛfo Pa, an IVR voice banking assistant in Ghana.
The caller is speaking in English or Ghanaian Akan Twi.
Transcribe what the caller spoke. Focus on:
- Ghanaian phone numbers (e.g. 0553838464, 0244123456)
- Ghanaian names (e.g. Kwame, Ama, Kofi, Akua, Nyamebere)
- Amounts in Ghana Cedis (e.g. 500 cedis, fifty cedis, two hundred)
- Financial actions (send money, transfer, balance, mane sika)
- Confirmation words (yes, confirm, aane, dabi, no, cancel, stop)

Return ONLY the plain transcribed words/numbers. Do not include markdown or explanations. If audio is silent or unintelligible, return 'empty'.`;

      const candidateModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"];
      let response: any = null;

      for (const model of candidateModels) {
        try {
          response = await ai.models.generateContent({
            model,
            contents: [
              {
                inlineData: {
                  data: buffer.toString("base64"),
                  mimeType: mime,
                },
              },
              { text: promptText },
            ],
          });
          if (response?.text) break;
        } catch (modelErr: any) {
          console.warn(`[GeminiASR] Model ${model} failed, trying next candidate...`);
        }
      }

      const raw = (response?.text || "").trim().replace(/["'`]/g, "");
      const isEmpty = !raw || raw.toLowerCase() === "empty" || raw.toLowerCase() === "inaudible";

      // Detect language roughly if Akan words are present
      const isTwi = /\b(momo|sika|mane|aane|dabi|baako|mmienu|mmeensa|brofo|twi|sesa)\b/i.test(raw);

      return {
        text: isEmpty ? "empty" : raw,
        confidence: isEmpty ? 0.2 : 0.94,
        language: isTwi ? "twi" : (options?.language || "en"),
        provider: this.name,
      };
    } catch (err: any) {
      console.error("[GeminiASR] Transcription failed:", err.message);
      return { text: "empty", confidence: 0.1, language: "en", provider: this.name };
    }
  }
}

/**
 * Mock ASR Adapter for offline development, integration tests, and local simulation
 */
export class MockAsrAdapter implements ASRProvider {
  public name = "MockASR";

  public async transcribe(
    audioPayload: Buffer | string,
    options?: ASROptions
  ): Promise<ASRResult> {
    if (typeof audioPayload === "string") {
      return {
        text: audioPayload.trim(),
        language: options?.language || "en",
        confidence: 0.98,
        provider: this.name,
      };
    }

    return {
      text: "send 500 cedis to Kwame",
      language: options?.language || "en",
      confidence: 0.95,
      provider: this.name,
    };
  }
}

/**
 * Main ASR Service Dispatcher
 * Selects the appropriate provider based on environment variables and provides automatic failover.
 */
export class ASRService {
  private ughci = new UghciAsrAdapter();
  private gemini = new GeminiAsrAdapter();
  private mock = new MockAsrAdapter();

  public async transcribe(
    audioPayload: Buffer | string,
    options?: ASROptions
  ): Promise<ASRResult> {
    const configuredProvider = (process.env.ASR_PROVIDER || "").toLowerCase();
    const isHciExplicitlyEnabled = process.env.HCI_ASR_ENABLED === "true";
    const hasHciUrl = Boolean(process.env.HCI_ASR_URL);

    // 1. If Mock is explicitly requested
    if (configuredProvider === "mock") {
      return this.mock.transcribe(audioPayload, options);
    }

    // 2. If UG HCI Lab is configured & enabled
    if (configuredProvider === "hci" || isHciExplicitlyEnabled || hasHciUrl) {
      try {
        return await this.ughci.transcribe(audioPayload, options);
      } catch (err: any) {
        console.warn(`[ASRService] UG HCI ASR unavailable. Falling back to Gemini ASR...`);
      }
    }

    // 3. Resilient fallback to Gemini ASR
    try {
      return await this.gemini.transcribe(audioPayload, options);
    } catch (err: any) {
      console.warn(`[ASRService] Gemini ASR unavailable. Falling back to Mock ASR...`);
      return this.mock.transcribe(audioPayload, options);
    }
  }
}

export const asrService = new ASRService();
