/**
 * Ɔkwankyerɛfo Pa - Preference Memory
 * Stores user preferences with confidence metadata, TTL, and decay.
 */

import { MemoryRecord, memoryPolicy } from "./memoryPolicy";
import { AiLanguage } from "../core/aiTypes";

export interface UserPreferences {
  preferredLanguage?: AiLanguage;
  speechRate?: number;
  wantsVoiceConfirmationReadback?: boolean;
  prefersShortPrompts?: boolean;
}

export class PreferenceMemory {
  private store = new Map<string, Map<string, MemoryRecord>>();

  public setPreference<T>(
    userId: string,
    key: keyof UserPreferences,
    value: T,
    source: "USER_EXPLICIT" | "INFERRED" = "USER_EXPLICIT",
    ttlMs: number | null = null
  ): void {
    const perm = memoryPolicy.isPermissible(key as string, value);
    if (!perm.allowed) {
      console.warn(`[PreferenceMemory] Rejected write: ${perm.reason}`);
      return;
    }

    let userMap = this.store.get(userId);
    if (!userMap) {
      userMap = new Map();
      this.store.set(userId, userMap);
    }

    const incoming: MemoryRecord<T> = {
      key: key as string,
      value,
      source,
      confidence: source === "USER_EXPLICIT" ? 1.0 : 0.7,
      createdAt: Date.now(),
      lastConfirmedAt: Date.now(),
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    };

    const existing = userMap.get(key as string);
    if (existing) {
      userMap.set(key as string, memoryPolicy.resolveConflict(existing, incoming));
    } else {
      userMap.set(key as string, incoming);
    }
  }

  public getPreference<T>(userId: string, key: keyof UserPreferences): T | undefined {
    const userMap = this.store.get(userId);
    if (!userMap) return undefined;

    const record = userMap.get(key as string);
    if (!record) return undefined;

    // Check expiration
    if (record.expiresAt && Date.now() > record.expiresAt) {
      userMap.delete(key as string);
      return undefined;
    }

    return record.value as T;
  }
}

export const preferenceMemory = new PreferenceMemory();
