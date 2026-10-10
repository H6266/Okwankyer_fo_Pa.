/**
 * Ɔkwankyerɛfo Pa - Variable Speech Layer (variableSpeechService.ts)
 * 
 * The single authoritative decision point for voice output:
 * 1. FIXED instructions, menus, and standard greetings -> Pre-recorded Studio Audio (English & Akan Twi).
 * 2. DYNAMIC changing values (amount, recipient readback, canonical reference, status) -> Neural TTS.
 * 
 * Invariants:
 * - Never uses fuzzy text matching to infer fixed audio for dynamic transaction data.
 * - Enforces single speech source per turn (never overlays recorded prompt with AI voice).
 * - Distinguishes between User-entered, Sandbox Fixtures, Provider-confirmed, and System-generated data.
 * - Masks phone numbers in logs and never exposes raw PINs.
 * - Rejects incomplete dynamic instructions.
 */

import { resolvePrompt, SupportedLanguage } from "../modules/ttsService";
import { ttsRouter } from "../ai_system/speech/tts/ttsRouter";
import { auditLogger } from "../services/auditLogger";

export type SpeechMode = "RECORDED" | "SYNTHESIZE";

export type SpeechPurpose =
  | "FIXED_INSTRUCTION"
  | "RECIPIENT_READBACK"
  | "AMOUNT_READBACK"
  | "TRANSACTION_STATUS"
  | "TRANSACTION_RECEIPT"
  | "ERROR_WARNING";

export interface SpeechInstruction {
  mode: SpeechMode;
  language: "en" | "twi";
  promptKey?: string;
  text?: string;
  purpose: SpeechPurpose;
  // Contextual metadata for validation and logging
  metadata?: {
    recipientPhone?: string;
    recipientName?: string | null;
    isVerified?: boolean;
    amount?: number;
    currency?: string;
    referenceId?: string;
    status?: "SUCCESSFUL" | "PENDING" | "FAILED";
    isDemoFixture?: boolean;
    step?: string;
  };
}

export interface VariableSpeechDecision {
  mode: SpeechMode;
  purpose: SpeechPurpose;
  language: "en" | "twi";
  // For RECORDED mode
  audioUrl?: string;
  promptKey?: string;
  // For SYNTHESIZE mode
  textToSpeak: string;
  // Diagnostics
  isDemoFixture?: boolean;
  maskedRecipient?: string;
  metadata?: Record<string, any>;
}

export interface VariableSpeechPlaybackResult {
  decision: VariableSpeechDecision;
  audioBuffer?: Buffer;
  audioBase64?: string;
  audioMimeType?: string;
  audioUrl?: string;
  providerUsed: string;
  durationEstimateSec?: number;
}

export class VariableSpeechService {
  /**
   * Evaluates and classifies a speech request into an authoritative VariableSpeechDecision.
   * Guarantees that changing values are never mapped to static recorded clips.
   */
  public evaluate(instruction: SpeechInstruction): VariableSpeechDecision {
    const lang = instruction.language === "twi" ? "twi" : "en";
    const maskedPhone = instruction.metadata?.recipientPhone
      ? this.maskPhoneNumber(instruction.metadata.recipientPhone)
      : undefined;

    // Strict Rule: Dynamic purposes CANNOT be routed to static recordings
    const isDynamicPurpose =
      instruction.purpose === "RECIPIENT_READBACK" ||
      instruction.purpose === "AMOUNT_READBACK" ||
      instruction.purpose === "TRANSACTION_STATUS" ||
      instruction.purpose === "TRANSACTION_RECEIPT";

    if (isDynamicPurpose) {
      if (!instruction.text || instruction.text.trim().length === 0) {
        throw new Error(`[VariableSpeechService] Incomplete dynamic speech instruction for ${instruction.purpose}: text is required.`);
      }

      return {
        mode: "SYNTHESIZE",
        purpose: instruction.purpose,
        language: lang,
        textToSpeak: instruction.text.trim(),
        isDemoFixture: instruction.metadata?.isDemoFixture,
        maskedRecipient: maskedPhone,
        metadata: instruction.metadata,
      };
    }

    // Fixed instruction path
    if (instruction.mode === "RECORDED") {
      if (!instruction.promptKey) {
        throw new Error("[VariableSpeechService] promptKey is required for RECORDED speech mode.");
      }

      const audioUrl = resolvePrompt(instruction.promptKey, lang);
      if (!audioUrl) {
        auditLogger.log("warn", "VARIABLE_SPEECH", `Missing recorded prompt asset for key: ${instruction.promptKey} [${lang}]. Falling back to explicit TTS.`);
        return {
          mode: "SYNTHESIZE",
          purpose: instruction.purpose,
          language: lang,
          textToSpeak: instruction.text || instruction.promptKey,
          metadata: instruction.metadata,
        };
      }

      return {
        mode: "RECORDED",
        purpose: instruction.purpose,
        language: lang,
        promptKey: instruction.promptKey,
        audioUrl,
        textToSpeak: instruction.text || instruction.promptKey,
        metadata: instruction.metadata,
      };
    }

    // Default SYNTHESIZE for explicit text
    return {
      mode: "SYNTHESIZE",
      purpose: instruction.purpose,
      language: lang,
      textToSpeak: instruction.text || "",
      maskedRecipient: maskedPhone,
      metadata: instruction.metadata,
    };
  }

  /**
   * Generates or retrieves the audio payload for the authoritative decision.
   * RECORDED: returns public audioUrl.
   * SYNTHESIZE: synthesizes neural audio via the multi-tier ttsRouter.
   */
  public async generateSpeech(instruction: SpeechInstruction): Promise<VariableSpeechPlaybackResult> {
    const decision = this.evaluate(instruction);

    if (decision.mode === "RECORDED" && decision.audioUrl) {
      return {
        decision,
        audioUrl: decision.audioUrl,
        providerUsed: "STUDIO_PROMPT_CATALOG",
        durationEstimateSec: 3.0,
      };
    }

    // Dynamic Synthesis through authoritative ttsRouter
    const ttsLang = decision.language === "twi" ? "tw" : "en";
    const res = await ttsRouter.synthesize({
      text: decision.textToSpeak,
      language: ttsLang,
      voiceProfile: decision.purpose === "TRANSACTION_RECEIPT" ? "warm-receipt" : "standard-readback",
      skipCatalogCheck: true,
      purpose: decision.purpose,
    });

    return {
      decision,
      audioBuffer: res.audioBuffer,
      audioBase64: res.audioBase64,
      audioMimeType: res.audioMimeType || "audio/mp3",
      providerUsed: res.providerUsed,
      durationEstimateSec: res.durationEstimateSec || 2.5,
    };
  }

  /**
   * Masks sensitive phone numbers for safe logging (e.g., 0553838464 -> 055****464)
   */
  public maskPhoneNumber(phone: string): string {
    const clean = phone.replace(/[^\d+]/g, "");
    if (clean.length < 7) return clean;
    const start = clean.slice(0, 3);
    const end = clean.slice(-3);
    return `${start}****${end}`;
  }
}

export const variableSpeechService = new VariableSpeechService();
