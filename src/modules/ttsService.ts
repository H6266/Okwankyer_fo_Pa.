/**
 * Ɔkwankyerɛfo Pa - Text-to-Speech (TTS) Service Adapter
 * 
 * Provides a provider-swappable TTS interface decoupling the conversation logic
 * from the underlying synthesis API (UG HCI Lab TTS, Google TTS, or Mock).
 * 
 * Configuration variables:
 * - TTS_PROVIDER: "hci" | "google-tts" | "mock"
 * - HCI_TTS_ENABLED: "true" | "false"
 * - HCI_TTS_URL: Endpoint provided by UG HCI Lab TTS
 * - HCI_TTS_API_KEY: Authentication token for UG HCI Lab TTS
 * - HCI_TTS_TIMEOUT_MS: Timeout in milliseconds (default: 10000)
 */

import crypto from "crypto";

export interface TTSResult {
  audioBuffer: Buffer;
  contentType: string; // e.g. "audio/wav" or "audio/mp3"
  language: "en" | "twi" | string;
  cacheId: string;
  audioUrl?: string;
  provider: string;
}

export interface TTSOptions {
  language?: "en" | "twi" | string;
  voice?: string;
  rate?: number;
  timeoutMs?: number;
}

export interface TTSProvider {
  name: string;
  synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}

// In-memory audio buffer store so Africa's Talking can fetch synthesized audio via URL
const audioCache = new Map<string, { buffer: Buffer; contentType: string; createdAt: number }>();

// Purge cache entries older than 30 minutes
const purgeTimer = setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, value] of audioCache.entries()) {
    if (value.createdAt < cutoff) audioCache.delete(key);
  }
}, 5 * 60 * 1000);
if (purgeTimer && typeof purgeTimer.unref === "function") {
  purgeTimer.unref();
}

export function getCachedAudio(cacheId: string): { buffer: Buffer; contentType: string } | null {
  return audioCache.get(cacheId) || null;
}

export function storeAudioInCache(buffer: Buffer, contentType: string): string {
  const hash = crypto.createHash("md5").update(buffer).digest("hex");
  audioCache.set(hash, { buffer, contentType, createdAt: Date.now() });
  return hash;
}

/**
 * Creates a minimal valid silent PCM WAV buffer as an emergency fallback
 */
function createSilentWavBuffer(durationSec: number = 1): Buffer {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = sampleRate * numChannels * bytesPerSample * durationSec;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20); // AudioFormat PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

/**
 * UG HCI Lab TTS Provider Adapter
 * Synthesizes natural Ghanaian speech (including Akan Twi) via the UG HCI Lab speech engine.
 */
export class UghciTtsAdapter implements TTSProvider {
  public name = "UghciTTS";

  private get apiUrl(): string {
    return process.env.HCI_TTS_URL || "";
  }

  private get apiKey(): string {
    return process.env.HCI_TTS_API_KEY || "";
  }

  private get timeoutMs(): number {
    const parsed = parseInt(process.env.HCI_TTS_TIMEOUT_MS || "10000", 10);
    return isNaN(parsed) ? 10000 : parsed;
  }

  public async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    if (!this.apiUrl) {
      throw new Error("HCI_TTS_URL is not configured.");
    }

    const timeout = options?.timeoutMs || this.timeoutMs;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const lang = options?.language === "twi" ? "tw" : "en";

    try {
      console.log(`[UghciTTS] Synthesizing speech with UG HCI Lab TTS (${lang})...`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "audio/wav, audio/mpeg, audio/*",
      };

      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
        headers["x-api-key"] = this.apiKey;
      }

      const body = JSON.stringify({
        text,
        language: lang,
        voice: options?.voice,
        format: "wav",
      });

      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`UG HCI TTS API returned HTTP status ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "audio/wav";
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);
      const cacheId = storeAudioInCache(audioBuffer, contentType);

      return {
        audioBuffer,
        contentType,
        language: options?.language || "en",
        cacheId,
        provider: this.name,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn(`[UghciTTS] UG HCI Lab TTS failed: ${err.message}`);
      throw err;
    }
  }
}

/**
 * Google TTS Adapter (Fallback provider for English synthesis)
 */
export class GoogleTtsAdapter implements TTSProvider {
  public name = "GoogleTTS";

  public async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const lang = options?.language === "twi" ? "en" : (options?.language || "en");
    try {
      // Dynamic import of google-tts-api
      const googleTTS = await import("google-tts-api");
      const base64Audio = await googleTTS.getAudioBase64(text, {
        lang: lang === "twi" ? "en" : lang,
        slow: false,
        host: "https://translate.google.com",
        timeout: 8000,
      });

      const audioBuffer = Buffer.from(base64Audio, "base64");
      const contentType = "audio/mp3";
      const cacheId = storeAudioInCache(audioBuffer, contentType);

      return {
        audioBuffer,
        contentType,
        language: options?.language || "en",
        cacheId,
        provider: this.name,
      };
    } catch (err: any) {
      console.warn(`[GoogleTTS] Synthesis failed: ${err.message}. Generating silent WAV.`);
      const buffer = createSilentWavBuffer(2);
      const cacheId = storeAudioInCache(buffer, "audio/wav");
      return {
        audioBuffer: buffer,
        contentType: "audio/wav",
        language: options?.language || "en",
        cacheId,
        provider: "SilentWavFallback",
      };
    }
  }
}

/**
 * Mock TTS Provider for offline testing and fast simulation
 */
export class MockTtsAdapter implements TTSProvider {
  public name = "MockTTS";

  public async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const buffer = createSilentWavBuffer(1);
    const contentType = "audio/wav";
    const cacheId = storeAudioInCache(buffer, contentType);

    return {
      audioBuffer: buffer,
      contentType,
      language: options?.language || "en",
      cacheId,
      provider: this.name,
    };
  }
}

/**
 * Main TTS Service Dispatcher
 */
export class TTSService {
  private ughci = new UghciTtsAdapter();
  private google = new GoogleTtsAdapter();
  private mock = new MockTtsAdapter();

  public async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
    const configuredProvider = (process.env.TTS_PROVIDER || "").toLowerCase();
    const isHciExplicitlyEnabled = process.env.HCI_TTS_ENABLED === "true";
    const hasHciUrl = Boolean(process.env.HCI_TTS_URL);

    // 1. Mock requested
    if (configuredProvider === "mock") {
      return this.mock.synthesize(text, options);
    }

    // 2. UG HCI Lab TTS
    if (configuredProvider === "hci" || isHciExplicitlyEnabled || hasHciUrl) {
      try {
        return await this.ughci.synthesize(text, options);
      } catch (err: any) {
        console.warn(`[TTSService] UG HCI TTS unavailable. Falling back to Google TTS...`);
      }
    }

    // 3. Google TTS fallback
    try {
      return await this.google.synthesize(text, options);
    } catch (err: any) {
      return this.mock.synthesize(text, options);
    }
  }
}

export const ttsService = new TTSService();
