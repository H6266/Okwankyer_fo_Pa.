/**
 * Ɔkwankyerɛfo Pa - Preference Memory
 * Stores user preferences with confidence metadata, TTL, and decay.
 */

import { MemoryRecord, MemorySource, memoryPolicy } from "./memoryPolicy";
import { AiLanguage } from "../core/aiTypes";
import { IPreferenceRepository } from "./repositoryInterfaces";
import { unifiedMemory } from "./unifiedMemory";

export interface UserPreferences {
  preferredLanguage?: AiLanguage;
  speechRate?: number;
  wantsVoiceConfirmationReadback?: boolean;
  prefersShortPrompts?: boolean;
}

type PreferenceSource = "USER_EXPLICIT" | "USER_CONFIRMED" | "INFERRED" | "MODEL_INFERRED" | "SESSION_ONLY";

export class PreferenceMemory {
  private sessionStore = new Map<string, Map<string, MemoryRecord>>();

  constructor(private readonly repository: IPreferenceRepository = unifiedMemory.preferenceRepo) {}

  public async setPreference<T extends AiLanguage | number | boolean>(
    userId: string,
    key: keyof UserPreferences,
    value: T,
    source: PreferenceSource = "USER_EXPLICIT",
    ttlMs: number | null = null,
    sessionId?: string
  ): Promise<boolean> {
    const perm = memoryPolicy.isPermissible(key as string, value);
    if (!perm.allowed) {
      console.warn(`[PreferenceMemory] Rejected write: ${perm.reason}`);
      return false;
    }

    const incoming: MemoryRecord<T> = {
      key: key as string,
      value,
      source: source as MemorySource,
      confidence: source === "USER_EXPLICIT" || source === "USER_CONFIRMED" ? 1.0 : 0.7,
      createdAt: Date.now(),
      lastConfirmedAt: source === "USER_EXPLICIT" || source === "USER_CONFIRMED" ? Date.now() : 0,
      expiresAt: ttlMs === null ? null : Date.now() + ttlMs,
    };

    if (source === "SESSION_ONLY") {
      if (!sessionId) return false;
      const storeKey = `${userId}:${sessionId || ""}`;
      let sessionPreferences = this.sessionStore.get(storeKey);
      if (!sessionPreferences) {
        sessionPreferences = new Map();
        this.sessionStore.set(storeKey, sessionPreferences);
      }
      sessionPreferences.set(key as string, incoming);
      return true;
    }

    const profile = (await this.repository.get(userId)) || { userId };
    const metadata = profile.preferenceMetadata?.[key as string];
    const metadataIsActive = metadata?.status === "ACTIVE" &&
      (metadata.expiresAt === null || metadata.expiresAt >= Date.now());
    const existing = profile[key] === undefined || !metadataIsActive
      ? undefined
      : {
          key: key as string,
          value: profile[key],
          source: metadata.source,
          confidence: metadata.confidence,
          createdAt: metadata.createdAt,
          lastConfirmedAt: metadata.lastConfirmedAt || 0,
          expiresAt: metadata.expiresAt,
        };
    const resolved = existing ? memoryPolicy.resolveConflict(existing, incoming) : incoming;
    if (resolved !== incoming) return false;

    (profile as any)[key] = value;
    profile.preferenceMetadata = {
      ...profile.preferenceMetadata,
      [key]: {
        source,
        confidence: incoming.confidence,
        createdAt: incoming.createdAt,
        lastConfirmedAt: incoming.lastConfirmedAt || null,
        expiresAt: incoming.expiresAt,
        status: "ACTIVE",
      },
    };
    await this.repository.save(userId, profile);
    return true;
  }

  public async getPreference<T>(userId: string, key: keyof UserPreferences, sessionId?: string): Promise<T | undefined> {
    const sessionPreferences = this.sessionStore.get(`${userId}:${sessionId || ""}`);
    const sessionRecord = sessionId ? sessionPreferences?.get(key as string) : undefined;
    if (sessionRecord) {
      if (sessionRecord.expiresAt !== null && Date.now() > sessionRecord.expiresAt) {
        sessionPreferences?.delete(key as string);
      } else {
        return sessionRecord.value as T;
      }
    }

    const profile = await this.repository.get(userId);
    const metadata = profile?.preferenceMetadata?.[key as string];
    if (!profile || profile[key] === undefined || !metadata || metadata.status !== "ACTIVE") return undefined;
    if (metadata.expiresAt !== null && Date.now() > metadata.expiresAt) return undefined;
    return profile[key] as T;
  }

  public async extractExplicitPreference(userId: string, sessionId: string, text: string): Promise<boolean> {
    const clean = text.toLowerCase();
    const sessionLanguage = /\b(?:for this conversation|for this session|just for now)\b/i.test(clean);
    const durableLanguage = /\b(?:from now on|always|i prefer|my preferred language is|going forward)\b/i.test(clean);
    const language = /\b(?:twi|akan)\b/i.test(clean) ? "tw" : /\benglish\b/i.test(clean) ? "en" : undefined;

    if (language && sessionLanguage && /\b(?:speak|use|switch|prefer|language)\b/i.test(clean)) {
      return this.setPreference(
        userId,
        "preferredLanguage",
        language as AiLanguage,
        "SESSION_ONLY",
        null,
        sessionId
      );
    }
    if (language && durableLanguage) {
      return this.setPreference(userId, "preferredLanguage", language as AiLanguage, "USER_EXPLICIT");
    }
    if (/\b(?:i prefer|i would like|please use|keep it)\b.{0,30}\b(?:short|brief|concise)\b.{0,30}\b(?:explanation|answer|response|prompt)s?\b/i.test(clean)) {
      return this.setPreference(userId, "prefersShortPrompts", true, "USER_EXPLICIT");
    }
    if (/\b(?:i prefer|please speak|speak)\b.{0,30}\b(?:slower|more slowly)\b/i.test(clean)) {
      return this.setPreference(userId, "speechRate", 0.8, "USER_EXPLICIT");
    }
    if (/\b(?:repeat|read back)\b.{0,30}\bconfirmations?\b/i.test(clean)) {
      return this.setPreference(userId, "wantsVoiceConfirmationReadback", true, "USER_EXPLICIT");
    }
    return false;
  }

  public async forgetPreference(userId: string, key?: keyof UserPreferences): Promise<boolean> {
    const profile = await this.repository.get(userId);
    if (!profile) return false;
    const keys = key ? [key] : Object.keys(profile.preferenceMetadata || {}) as Array<keyof UserPreferences>;
    if (!keys.length) return false;
    const updatedAt = Date.now();
    profile.preferenceMetadata = { ...profile.preferenceMetadata };
    for (const preferenceKey of keys) {
      (profile as any)[preferenceKey] = undefined;
      const current = profile.preferenceMetadata[preferenceKey as string];
      if (current) profile.preferenceMetadata[preferenceKey as string] = { ...current, status: "REVOKED", expiresAt: updatedAt };
    }
    await this.repository.save(userId, profile);
    return true;
  }

  public clearSession(sessionId: string): void {
    for (const key of this.sessionStore.keys()) {
      if (key.endsWith(`:${sessionId}`)) this.sessionStore.delete(key);
    }
  }
}

export const preferenceMemory = new PreferenceMemory();
