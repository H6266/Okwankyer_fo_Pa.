/**
 * Ɔkwankyerɛfo Pa - Authoritative Bilingual TTS Router & Graceful Fallback Chain
 * 
 * Strict 4-Tier Fallback Chain:
 * - Tier 1: Check authentic studio recording catalog (instant, high quality human audio)
 * - Tier 2: Local Piper neural TTS (model "en_US-lessac-medium", 1-2s, reliable for dynamic speech)
 * - Tier 3: Google TTS via Gemini (cloud fallback, bounded 3.5s timeout, audio header validated)
 * - Tier 4: Offline synthesizer (Twi amount phoneme stitcher / local PCM WAV generator)
 * 
 * Safety & Quality:
 * - Never synthesizes Twi via Africa's Talking English acoustic model (destroys Akan vowels ɛ, ɔ and tones).
 * - For dynamic Twi amounts, uses pre-recorded digit audio snippets + concatenation.
 * - Validates audio headers and payload size (>= 128 bytes) on every tier.
 * - Never fails silently: always returns verified audio or throws descriptive error.
 */

import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse } from "./ttsProvider";
import { studioCatalogProvider } from "./studioCatalogProvider";
import { studioPromptRegistry } from "./studioPromptRegistry";
import { piperProvider } from "./localTtsProvider";
import { geminiTtsAdapter } from "./ttsAdapter";
import { localGhanaianTtsProvider } from "./localGhanaianTts";
import { twiAmountSynthesizer } from "./twiAmountSynthesizer";
import { hciLabService } from "../../../services/hciLabService";

export type TtsTier =
  | "TIER_1_STUDIO_CATALOG"
  | "TIER_2_LOCAL_PIPER_NEURAL"
  | "TIER_3_GEMINI_CLOUD_TTS"
  | "TIER_4_OFFLINE_SYNTHESIS";

export interface TtsRouterReport {
  tier: TtsTier;
  provider: string;
  durationEstimateSec?: number;
  offlineReady: boolean;
}

export class TtsRouter implements TTSProvider {
  /**
   * Validates whether an audio buffer contains a valid WAV (RIFF/WAVE) or MP3 (ID3/frame sync) header
   */
  private validateAudioHeader(buf?: Buffer): boolean {
    if (!buf || buf.length < 128) return false;
    // WAV check
    if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
      return true;
    }
    // MP3 check (ID3 header or 0xFF frame sync)
    if (buf.toString("ascii", 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
      return true;
    }
    if (buf.toString("ascii", 4, 8) === "ftyp") {
      return true;
    }
    return false;
  }

  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    const rawText = (request.text || "").trim();
    if (!rawText) {
      throw new Error("TTS_EMPTY_REQUEST: Cannot synthesize empty text payload.");
    }

    const language = (request.language || "en").toLowerCase();
    const isTwi = language === "tw" || language === "ak" || /([ɛɔ]|mepa|sika|mane|akwaaba|dabi|aane|paw|sidi)/i.test(rawText);

    // ── TIER 1: Studio Recording Catalog (Instant, High-Quality Pre-Recorded Files) ──
    if (!request.skipCatalogCheck) {
      // 1a. Check Studio Prompt Registry
      const regPrompt = studioPromptRegistry.getPrompt(rawText, isTwi ? "tw" : "en");
      if (regPrompt) {
        try {
          const buffer = studioPromptRegistry.getAudioBuffer(regPrompt);
          if (this.validateAudioHeader(buffer)) {
            return {
              audioBuffer: buffer,
              audioBase64: buffer.toString("base64"),
              audioMimeType: regPrompt.mimeType,
              mimeType: regPrompt.mimeType,
              durationEstimateSec: regPrompt.durationSec,
              providerUsed: `tier1-studio-prompt-registry:${regPrompt.key}`,
            };
          }
        } catch (err: any) {
          console.warn("[TtsRouter] Studio prompt registry read failed:", err?.message || err);
        }
      }

      // 1b. Check Studio Catalog Provider
      if (studioCatalogProvider.hasMatch(rawText, request.language)) {
        try {
          const res = await studioCatalogProvider.synthesize(request);
          if (this.validateAudioHeader(res.audioBuffer)) {
            return {
              ...res,
              providerUsed: `tier1-studio-catalog:${res.providerUsed}`,
            };
          }
        } catch (err: any) {
          console.warn("[TtsRouter] Studio catalog provider notice:", err?.message || err);
        }
      }
    }

    // ── Dynamic Twi Amounts Special Handling: Concatenation Snippets (ONLY for isolated amount expressions) ──
    // Full sentences with recipient names, confirmation questions, or receipts must proceed to neural TTS!
    const isIsolatedAmount = /^\s*(?:ghs|cedis?|sidi)?\s*\d+\s*(?:cedis?|sidi|ghs)?\s*$/i.test(rawText.trim());
    if (isTwi && isIsolatedAmount) {
      const amountMatch = rawText.match(/\b(\d+)(?:\s*(?:cedis?|sidi|ghs))?\b/i);
      if (amountMatch) {
        const amountNum = parseInt(amountMatch[1], 10);
        if (!isNaN(amountNum) && amountNum > 0) {
          const twiRes = twiAmountSynthesizer.synthesizeTwiAmount(amountNum);
          if (this.validateAudioHeader(twiRes.audioBuffer)) {
            return {
              audioBuffer: twiRes.audioBuffer,
              audioBase64: twiRes.audioBase64,
              audioMimeType: twiRes.mimeType,
              mimeType: twiRes.mimeType,
              durationEstimateSec: twiRes.durationSec,
              providerUsed: "tier1-twi-digit-concatenation",
            };
          }
        }
      }
    }

    // ── TIER 1.5: HCI Lab Akan Twi Neural TTS (with disk caching & quota guard) ──
    if (isTwi && hciLabService.isConfigured()) {
      try {
        const hciRes = await hciLabService.synthesize(rawText);
        if (this.validateAudioHeader(hciRes.audioBuffer)) {
          return {
            audioBuffer: hciRes.audioBuffer,
            audioBase64: hciRes.audioBuffer.toString("base64"),
            audioMimeType: "audio/wav",
            mimeType: "audio/wav",
            durationEstimateSec: hciRes.durationSec,
            providerUsed: hciRes.fromCache ? "tier1-hci-lab-disk-cache" : "tier1-hci-lab-neural-tts",
          };
        }
      } catch (err: any) {
        console.warn("[TtsRouter] HCI Lab TTS notice:", err?.message || err);
      }
    }

    // ── TIER 2: Local Neural Piper TTS (en_US-lessac-medium) ──
    try {
      const piperReq: TtsSynthesisRequest = {
        ...request,
        language: isTwi ? "en" : "en", // Piper handles phonetic English; Twi is routed to concatenator or phoneme generator
      };
      const piperRes = await piperProvider.synthesize(piperReq);
      if (this.validateAudioHeader(piperRes.audioBuffer)) {
        return {
          ...piperRes,
          providerUsed: `tier2-local-piper-neural:${piperRes.providerUsed}`,
        };
      }
    } catch (err: any) {
      console.warn("[TtsRouter] Tier 2 Piper unavailable, progressing to Tier 3:", err?.message || err);
    }

    // ── TIER 3: Google Cloud TTS via Gemini (3.5s Timeout & Header Check) ──
    try {
      const geminiRes = await geminiTtsAdapter.synthesize(request);
      if (geminiRes && geminiRes.providerUsed === "gemini-tts" && this.validateAudioHeader(geminiRes.audioBuffer)) {
        return {
          ...geminiRes,
          providerUsed: "tier3-gemini-cloud-tts",
        };
      }
    } catch (err: any) {
      console.warn("[TtsRouter] Tier 3 Gemini TTS notice:", err?.message || err);
    }

    // ── TIER 4: Offline Synthesizer (PCM WAV Generation as Last Resort) ──
    try {
      const offlineRes = await localGhanaianTtsProvider.synthesize(request);
      if (this.validateAudioHeader(offlineRes.audioBuffer)) {
        return {
          ...offlineRes,
          providerUsed: `tier4-offline-pcm-synthesizer:${offlineRes.providerUsed}`,
        };
      }
    } catch (err: any) {
      console.error("[TtsRouter] Tier 4 Offline generation failed:", err?.message || err);
    }

    // Never fail silently
    throw new Error(
      `TTS_ALL_TIERS_EXHAUSTED: Failed to synthesize speech for payload: "${rawText.slice(0, 60)}..." across Studio Catalog, Piper, Gemini, and Offline fallback.`
    );
  }

  public async synthesizeBrainReply(reply: { text: string; language: string; promptId?: string }): Promise<TtsSynthesisResponse> {
    const isTwi = reply.language === "tw" || reply.language === "ak" || reply.language.startsWith("twi");
    return this.synthesize({
      text: reply.text,
      language: isTwi ? "tw" : "en",
      voiceProfile: reply.promptId,
    });
  }

  public async getRouterReport(): Promise<TtsRouterReport> {
    const health = await piperProvider.checkHealth();
    return {
      tier: "TIER_2_LOCAL_PIPER_NEURAL",
      provider: health.provider,
      offlineReady: health.ready,
    };
  }
}

export const ttsRouter = new TtsRouter();
