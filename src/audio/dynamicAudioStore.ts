/**
 * Ɔkwankyerɛfo Pa - Ephemeral Dynamic Audio Store (dynamicAudioStore.ts)
 * 
 * Exposes securely generated neural TTS audio buffers via temporary,
 * short-lived URLs that telephony providers (Africa's Talking VoiceXML <Play>)
 * and web clients can fetch with single-use or TTL security.
 */

import crypto from "crypto";

export interface CachedDynamicAudio {
  id: string;
  buffer: Buffer;
  mimeType: string;
  createdAt: number;
  expiresAt: number;
  text: string;
  language: string;
}

export class DynamicAudioStore {
  private cache = new Map<string, CachedDynamicAudio>();
  private readonly DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

  constructor() {
    // Background purge every 60 seconds
    setInterval(() => this.purgeExpired(), 60 * 1000).unref?.();
  }

  /**
   * Stores an audio buffer and returns a unique content-addressed or nonce ID.
   */
  public store(
    buffer: Buffer,
    mimeType: string = "audio/wav",
    text: string = "",
    language: string = "en",
    ttlMs: number = this.DEFAULT_TTL_MS
  ): string {
    const id = crypto.randomBytes(16).toString("hex");
    const now = Date.now();
    this.cache.set(id, {
      id,
      buffer,
      mimeType,
      createdAt: now,
      expiresAt: now + ttlMs,
      text,
      language,
    });
    return id;
  }

  /**
   * Retrieves an active audio buffer by ID.
   */
  public get(id: string): CachedDynamicAudio | null {
    const item = this.cache.get(id);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(id);
      return null;
    }
    return item;
  }

  /**
   * Purges expired entries to prevent memory leaks.
   */
  private purgeExpired(): void {
    const now = Date.now();
    for (const [id, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(id);
      }
    }
  }
}

export const dynamicAudioStore = new DynamicAudioStore();
