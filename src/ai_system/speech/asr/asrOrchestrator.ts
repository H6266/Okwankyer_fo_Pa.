/**
 * Ɔkwankyerɛfo Pa - Authoritative ASR Orchestrator (asrOrchestrator.ts)
 * 
 * The single authoritative orchestration path for speech recognition:
 * AudioInput -> AudioNormalizer -> AudioQuality/VAD -> GhanaNLP ASR -> Fallback (Gemini/Offline) -> NumberDecoder -> Zero-PIN Safety
 * 
 * Rules:
 * - GhanaNLP ASR is the primary Ghanaian-language ASR provider.
 * - Gemini and local models are explicit fallbacks (never falsely claiming GhanaNLP was used).
 * - Real confidence numbers only (null with "provider_unreported" if provider does not report it).
 * - Acoustic quality scores are reported separately from model confidence.
 * - Spoken PINs are intercepted and discarded to enforce Zero-PIN security.
 */

import { audioNormalizer } from "./audioNormalizer";
import { audioQualityAnalyzer, AudioQualityReport } from "./audioQuality";
import { ghanaNlpAsrService } from "../../../services/ghanaNlpAsrService";
import { geminiClient } from "../../../services/geminiClient";
import { offlineSpeechRecognizer } from "./offlineAsrEngine";
import { formatSpokenNumbersAsDigits } from "../../../domain/numberFormatter";
import { isAcousticSystemEcho, stripSystemEchoFromTranscript, isBackgroundNoiseOrStatic } from "../../../domain/echoFilter";
import { isSpokenPinPattern } from "../../../modules/sttService";
import { auditLogger } from "../../../services/auditLogger";
import { AI_CONFIG } from "../../core/aiConfig";
import { feedbackService } from "./feedbackService";

export interface AsrOrchestrationResult {
  text: string;
  rawTranscript: string;
  normalizedTranscript: string;
  numericNormalizedTranscript: string;
  confidence: number | null;
  confidenceSource: "provider" | "calibrated" | "provider_unreported" | "unavailable";
  languageDetected: string;
  providerAttempted?: string;
  providerUsed: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  latencyMs: number;
  audioQuality: AudioQualityReport;
  pinDiscarded?: boolean;
}

export interface AsrTranscribeOptions {
  timeoutMs?: number;
  languageHint?: string;
  step?: string;
  allowFallback?: boolean;
}

export class AsrOrchestrator {
  /**
   * Primary authoritative transcription method.
   */
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    options: AsrTranscribeOptions = {}
  ): Promise<AsrOrchestrationResult> {
    const startTime = performance.now();
    const step = options.step || "";
    const allowFallback = options.allowFallback !== false;

    // ── STEP 1: Normalize incoming audio to 16 kHz mono PCM WAV ──
    const normalized = await audioNormalizer.normalize(audioPayload, mimeType);

    // ── STEP 2: Acoustic Quality & Voice Activity Detection ──
    const audioQuality = audioQualityAnalyzer.analyze(normalized.pcm16Buffer, 16000);

    // If genuine silence or no speech detected, return early without querying external providers
    if (audioQuality.status === "NO_SPEECH" || normalized.isSilent) {
      return {
        text: "",
        rawTranscript: "",
        normalizedTranscript: "",
        numericNormalizedTranscript: "",
        confidence: null,
        confidenceSource: "unavailable",
        languageDetected: options.languageHint || "eng",
        providerUsed: "vad-silence",
        fallbackUsed: false,
        latencyMs: Math.round(performance.now() - startTime),
        audioQuality,
      };
    }

    // ── STEP 3: Language Strategy Resolution ──
    const languageHint = (options.languageHint || "twi").toLowerCase().trim();
    let resolvedLanguage = "twi";
    let isMixed = false;

    if (languageHint === "en" || languageHint === "eng" || languageHint === "english") {
      resolvedLanguage = "eng";
    } else if (languageHint === "atw" || languageHint === "akuapem" || languageHint === "twi-akuapem") {
      resolvedLanguage = "atw";
    } else if (languageHint === "fat" || languageHint === "fante") {
      resolvedLanguage = "fat";
    } else if (languageHint === "mixed" || languageHint === "mixed-twi-en" || languageHint === "bilingual") {
      isMixed = true;
      resolvedLanguage = "twi"; // GhanaNLP Twi handles Akan-English code-switching
    } else {
      resolvedLanguage = "twi";
    }

    let rawText = "";
    let providerUsed = "";
    let providerAttempted: string | undefined;
    let fallbackUsed = false;
    let fallbackReason: string | undefined;
    let confidence: number | null = null;
    let confidenceSource: AsrOrchestrationResult["confidenceSource"] = "unavailable";

    // ── STEP 4: Primary Provider: GhanaNLP ASR v3 ──
    if (ghanaNlpAsrService.isConfigured()) {
      providerAttempted = "GhanaNLP_ASR_v3";
      try {
        const timeoutMs = options.timeoutMs || ghanaNlpAsrService.defaultTimeoutMs;
        const ghaResult = await ghanaNlpAsrService.transcribe(
          normalized.wavBuffer,
          resolvedLanguage,
          "audio/wav",
          timeoutMs
        );

        if (ghaResult.text && ghaResult.text.trim().length > 0) {
          rawText = ghaResult.text;
          providerUsed = "GhanaNLP_ASR_v3";
          confidence = ghaResult.confidence; // null
          confidenceSource = ghaResult.confidenceSource; // "provider_unreported"
        }
      } catch (err: any) {
        fallbackReason = err.message || "GhanaNLP transcription failure";
        auditLogger.log("warn", "ASR_ORCHESTRATOR", `GhanaNLP primary attempt notice: ${fallbackReason}. Proceeding to fallback.`);
      }
    } else {
      providerAttempted = "GhanaNLP_ASR_v3";
      fallbackReason = "GHANANLP_UNCONFIGURED: Missing GHANANLP_API_KEY";
    }

    // ── STEP 5: Explicit Fallback Provider (Gemini / Offline) ──
    if (!rawText && allowFallback) {
      fallbackUsed = true;
      if (geminiClient.isAvailable()) {
        try {
          const modelName = AI_CONFIG.transcriptionModel || "gemini-3.8-flash";
          const geminiPrompt = resolvedLanguage === "eng"
            ? "Transcribe this audio verbatim in Ghanaian English. Preserve numbers and names."
            : "Transcribe this audio verbatim in Akan Twi or Ghanaian English. Preserve Akan words, names, and numbers.";

          const geminiResp = await geminiClient.executeWithTimeout(
            "asr-transcription-fallback",
            async (ai) => {
              return await ai.models.generateContent({
                model: modelName,
                contents: [
                  geminiPrompt,
                  {
                    inlineData: {
                      mimeType: "audio/wav",
                      data: normalized.wavBuffer.toString("base64"),
                    },
                  },
                ],
              });
            },
            7000
          );

          const geminiText = (geminiResp?.text || "").trim();
          if (geminiText) {
            rawText = geminiText;
            providerUsed = modelName;
            confidence = null; // Do not invent probabilities
            confidenceSource = "provider_unreported";
          }
        } catch (gemErr: any) {
          auditLogger.log("warn", "ASR_ORCHESTRATOR", `Gemini fallback notice: ${gemErr.message}`);
        }
      }

      // Offline recognizer fallback if still empty
      if (!rawText) {
        try {
          const offlineRes = await offlineSpeechRecognizer.transcribe(
            normalized.wavBuffer.toString("base64"),
            "audio/wav",
            step
          );
          if (offlineRes.text && offlineRes.text.trim().length > 0) {
            rawText = offlineRes.text;
            providerUsed = offlineRes.provider;
            confidence = null;
            confidenceSource = "provider_unreported";
          }
        } catch {
          // offline failed
        }
      }
    }

    if (!providerUsed) {
      providerUsed = providerAttempted || "no-asr-available";
    }

    // ── STEP 6: Entity, Noise, and Number Post-Processing ──
    let normalizedTranscript = rawText.trim();

    // Echo & background noise filtering
    if (normalizedTranscript) {
      if (isBackgroundNoiseOrStatic(normalizedTranscript, audioQuality.rmsEnergy)) {
        normalizedTranscript = "";
      } else if (isAcousticSystemEcho(normalizedTranscript, step)) {
        const stripped = stripSystemEchoFromTranscript(normalizedTranscript, step);
        normalizedTranscript = (!stripped || isAcousticSystemEcho(stripped, step)) ? "" : stripped;
      }
    }

    // Spoken number normalization (preserving names and currency)
    const numericNormalizedTranscript = normalizedTranscript
      ? formatSpokenNumbersAsDigits(normalizedTranscript)
      : "";

    // ── STEP 7: Zero-PIN Safety Gate ──
    let pinDiscarded = false;
    let finalText = numericNormalizedTranscript;

    if (finalText && isSpokenPinPattern(finalText, step)) {
      auditLogger.log("warn", "PIN_SAFETY", `Spoken PIN pattern intercepted and discarded at step '${step}' (${providerUsed})`);
      finalText = "[DISCARDED_PIN]";
      pinDiscarded = true;
    }

    const latencyMs = Math.round(performance.now() - startTime);

    feedbackService.recordTurn({
      provider: providerUsed,
      fallbackUsed,
      timeoutOccurred: Boolean(fallbackReason?.includes("TIMEOUT")),
      emptyResult: !finalText,
      latencyMs,
      language: isMixed ? "mixed-twi-en" : resolvedLanguage,
      speechDetected: audioQuality.speechDetected,
      qualityStatus: audioQuality.status,
    });

    return {
      text: finalText,
      rawTranscript: rawText,
      normalizedTranscript,
      numericNormalizedTranscript,
      confidence,
      confidenceSource,
      languageDetected: isMixed ? "mixed-twi-en" : resolvedLanguage,
      providerAttempted,
      providerUsed,
      fallbackUsed,
      fallbackReason,
      latencyMs,
      audioQuality,
      pinDiscarded,
    };
  }
}

export const asrOrchestrator = new AsrOrchestrator();
