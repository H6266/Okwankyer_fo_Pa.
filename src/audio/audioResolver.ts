/**
 * Ɔkwankyerɛfo Pa - Audio Resolver & Synthesized Speech Cache (audioResolver.ts)
 * 
 * Implements the authoritative two-tier audio resolution pipeline:
 * 1. Library hit: Fixed reply with a studio recording in the catalog (matched by replyKey and language)
 * 2. Otherwise (no studio clip, or reply has dynamic parts like recipient name/amount):
 *    ONE TTS request for the full reply text via ttsRouter, cached by (text, language, voice).
 * 
 * Logs which path was taken and why.
 */

import { PROMPT_TABLE, resolvePrompt } from "../modules/ttsService";
import { AUDIO_CATALOG, AudioPromptMetadata } from "./catalog";
import { ttsRouter } from "../ai_system/speech/tts/ttsRouter";
import { auditLogger } from "../services/auditLogger";

export type AudioResolutionResult =
  | {
      kind: "library";
      url: string;
      clip: string;
      replyKey: string;
      language: string;
      reason: string;
    }
  | {
      kind: "tts";
      text: string;
      provider: string;
      language: string;
      audioBase64?: string;
      audioBuffer?: Buffer;
      audioMimeType?: string;
      durationEstimateSec?: number;
      cached: boolean;
      replyKey?: string;
      reason: string;
    };

export interface ResolveAudioParams {
  replyKey?: string;
  replyText: string;
  language?: "en" | "twi" | string;
  voice?: string;
  skipTtsExecution?: boolean; // useful for testing without invoking real TTS engine
}

export interface CachedTtsEntry {
  provider: string;
  audioBase64?: string;
  audioBuffer?: Buffer;
  audioMimeType?: string;
  durationEstimateSec?: number;
  cachedAt: number;
}

// In-memory TTS cache keyed by (text, language, voice)
const ttsCache = new Map<string, CachedTtsEntry>();

export function getTtsCacheKey(text: string, language: string, voice: string = "default"): string {
  return `${language.toLowerCase()}:${voice.toLowerCase()}:${text.trim()}`;
}

export function clearTtsCache(): void {
  ttsCache.clear();
}

export function getTtsCacheSize(): number {
  return ttsCache.size;
}

export function getCachedTts(text: string, language: string, voice: string = "default"): CachedTtsEntry | undefined {
  return ttsCache.get(getTtsCacheKey(text, language, voice));
}

// Fixed prompt keys known to have authentic studio recordings without dynamic parts
const FIXED_STUDIO_KEYS = new Set([
  "welcome",
  "service_select",
  "provider_select",
  "provider_select_alt",
  "action_select",
  "enter_recipient",
  "recipient_sample_digits",
  "enter_amount",
  "pin_handoff",
  "receipt",
  "exit",
  "wrong_figure",
  "max_retries_exceeded",
]);

/**
 * Checks if a reply has dynamic parts (e.g. contains numbers, names, or is a dynamic confirmation)
 */
function isDynamicReply(replyKey?: string, replyText?: string): boolean {
  if (!replyKey) return true;
  if (replyKey === "confirm_transaction" || replyKey === "verify_hold" || replyKey === "recipient_lookup_failed") {
    return true;
  }
  // If the replyKey is not in the studio catalog
  if (!FIXED_STUDIO_KEYS.has(replyKey)) {
    return true;
  }
  return false;
}

export async function resolveAudio(params: ResolveAudioParams): Promise<AudioResolutionResult> {
  const { replyKey, replyText, voice = "default", skipTtsExecution = false } = params;
  const lang =
    params.language === "twi" ||
    params.language?.startsWith("tw") ||
    params.language?.startsWith("ak")
      ? "twi"
      : "en";

  // Tier 1: Check if reply is a fixed studio recording in the catalog
  const isDynamic = isDynamicReply(replyKey, replyText);

  if (!isDynamic && replyKey) {
    const catalogUrl = resolvePrompt(replyKey, lang);
    if (catalogUrl) {
      const clipName = catalogUrl.split("/").pop() || catalogUrl;
      const reason = `library hit: studio recording for reply key '${replyKey}' in ${lang}`;
      auditLogger.log("info", "AUDIO", `[audioResolver] ${reason} -> ${catalogUrl}`);

      return {
        kind: "library",
        url: catalogUrl,
        clip: clipName,
        replyKey,
        language: lang,
        reason,
      };
    }
  }

  // Tier 2: Dynamic reply or no catalog clip -> TTS route
  const cacheKey = getTtsCacheKey(replyText, lang, voice);
  const cached = ttsCache.get(cacheKey);

  if (cached) {
    const reason = `TTS cache hit for dynamic reply (key: ${replyKey || "none"})`;
    auditLogger.log("info", "AUDIO", `[audioResolver] ${reason}`);
    return {
      kind: "tts",
      text: replyText,
      provider: cached.provider,
      language: lang,
      audioBase64: cached.audioBase64,
      audioBuffer: cached.audioBuffer,
      audioMimeType: cached.audioMimeType,
      durationEstimateSec: cached.durationEstimateSec,
      cached: true,
      replyKey,
      reason,
    };
  }

  const reason = isDynamic
    ? `no library clip for reply key '${replyKey || "unknown"}' with dynamic parts -> TTS`
    : `no studio recording in catalog for reply key '${replyKey || "unknown"}' -> TTS`;

  auditLogger.log("info", "AUDIO", `[audioResolver] ${reason}`);

  if (skipTtsExecution) {
    return {
      kind: "tts",
      text: replyText,
      provider: "mock_tts",
      language: lang,
      cached: false,
      replyKey,
      reason,
    };
  }

  // Execute ONE TTS request via authoritative ttsRouter
  try {
    const synthLang = lang === "twi" ? "tw" : "en";
    const ttsRes = await ttsRouter.synthesize({
      text: replyText,
      language: synthLang,
      voiceProfile: voice,
    });

    const entry: CachedTtsEntry = {
      provider: ttsRes.providerUsed || "ttsRouter",
      audioBase64: ttsRes.audioBase64,
      audioBuffer: ttsRes.audioBuffer,
      audioMimeType: ttsRes.audioMimeType,
      durationEstimateSec: ttsRes.durationEstimateSec,
      cachedAt: Date.now(),
    };

    ttsCache.set(cacheKey, entry);

    return {
      kind: "tts",
      text: replyText,
      provider: entry.provider,
      language: lang,
      audioBase64: entry.audioBase64,
      audioBuffer: entry.audioBuffer,
      audioMimeType: entry.audioMimeType,
      durationEstimateSec: entry.durationEstimateSec,
      cached: false,
      replyKey,
      reason,
    };
  } catch (err: any) {
    auditLogger.log("warn", "AUDIO", `[audioResolver] TTS synthesis error: ${err.message}`);
    return {
      kind: "tts",
      text: replyText,
      provider: "fallback_tts",
      language: lang,
      cached: false,
      replyKey,
      reason: `${reason} (fallback: ${err.message})`,
    };
  }
}
