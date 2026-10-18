/**
 * Ɔkwankyerɛfo Pa - Authoritative ASR Orchestrator (asrOrchestrator.ts)
 * 
 * The single authoritative orchestration path for speech recognition:
 * AudioInput -> AudioNormalizer -> AudioQuality/VAD -> UG HCI Lab ASR -> Fallback (Gemini/Offline) -> NumberDecoder -> Zero-PIN Safety
 * 
 * Rules:
 * - University of Ghana HCI Lab is the primary native Ghanaian-language ASR provider.
 * - Gemini and local models are explicit fallbacks (never falsely claiming HCI Lab was used).
 * - Real confidence numbers only (null with "provider_unreported" if provider does not report it).
 * - Acoustic quality scores are reported separately from model confidence.
 * - Spoken PINs are intercepted and discarded to enforce Zero-PIN security.
 */

import { audioNormalizer } from "./audioNormalizer";
import { audioQualityAnalyzer, AudioQualityReport } from "./audioQuality";
import { hciLabService } from "../../../services/hciLabService";
import { geminiClient } from "../../../services/geminiClient";
import { offlineSpeechRecognizer } from "./offlineAsrEngine";
import { formatSpokenNumbersAsDigits } from "../../../domain/numberFormatter";
import { isAcousticSystemEcho, stripSystemEchoFromTranscript, isBackgroundNoiseOrStatic } from "../../../domain/echoFilter";
import { isSpokenPinPattern } from "../../../modules/sttService";
import { auditLogger } from "../../../services/auditLogger";
import { AI_CONFIG } from "../../core/aiConfig";
import { feedbackService } from "./feedbackService";
import { repairGhanaianPronunciation, PhoneticCorrection } from "./ghanaianPhoneticMatcher";
import { neuralAsrProvider } from "./neuralAsrProvider";

export interface AsrOrchestrationResult {
  text: string;
  rawTranscript: string;
  normalizedTranscript: string;
  numericNormalizedTranscript: string;
  phoneticRepairs?: PhoneticCorrection[];
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
  quotaExhausted?: boolean;
  errorMessage?: string;
}

export interface AsrTranscribeOptions {
  timeoutMs?: number;
  languageHint?: string;
  step?: string;
  allowFallback?: boolean;
  skipEchoFiltering?: boolean;
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
      resolvedLanguage = "twi"; // HCI Lab Twi handles Akan-English code-switching
    } else {
      resolvedLanguage = "twi";
    }

    // ── STEP 3: API Key Configuration & Speech Strategy ──
    const hasHciKey = hciLabService.isConfigured();
    const hasGeminiKey = geminiClient.isAvailable();
    const hasAnySpeechApiKey = hasHciKey || hasGeminiKey;

    let hciQuotaFailed = false;
    let geminiQuotaFailed = false;

    let rawText = "";
    let providerUsed = "";
    let providerAttempted: string | undefined;
    let fallbackUsed = false;
    let fallbackReason: string | undefined = hasAnySpeechApiKey
      ? undefined
      : "NO_REMOTE_ASR_KEY: No hosted speech API key configured; attempting local recognition.";
    let confidence: number | null = null;
    let confidenceSource: AsrOrchestrationResult["confidenceSource"] = "unavailable";

    // ── STEP 4A: Dedicated Ghanaian ASR: University of Ghana HCI Lab ──
    if (hasHciKey && (resolvedLanguage === "twi" || resolvedLanguage === "atw")) {
      providerAttempted = "HCI_LAB_ASR";
      try {
        const timeoutMs = options.timeoutMs || 8000;
        const hciResult = await hciLabService.transcribe(
          normalized.wavBuffer,
          "audio/wav",
          { timeoutMs }
        );
        if (hciResult.transcript && hciResult.transcript.trim().length > 0) {
          rawText = hciResult.transcript;
          providerUsed = "HCI_LAB_ASR";
          confidence = hciResult.confidence;
          confidenceSource = "provider";
        }
      } catch (err: any) {
        if (
          err?.isQuotaError ||
          err?.statusCode === 429 ||
          String(err?.code || "").includes("QUOTA") ||
          String(err?.message || "").toLowerCase().includes("quota") ||
          String(err?.message || "").toLowerCase().includes("token") ||
          String(err?.message || "").toLowerCase().includes("rate limit")
        ) {
          hciQuotaFailed = true;
        }
        fallbackReason = err.message || "HCI Lab ASR transcription failure";
        auditLogger.log("warn", "ASR_ORCHESTRATOR", `HCI Lab primary ASR attempt notice: ${fallbackReason}. Proceeding to fallback.`);
      }
    }
    // ── STEP 5: Explicit Fallback Provider (Local Neural / Gemini / Offline) ──
    if (!rawText && allowFallback) {
      fallbackUsed = true;

      // 5a. Check genuine local neural worker (faster-whisper / Meta MMS open model)
      try {
        const neuralHealth = await neuralAsrProvider.checkHealth();
        if (neuralHealth.ready) {
          const neuralRes = await neuralAsrProvider.transcribe(
            normalized.wavBuffer,
            "audio/wav",
            resolvedLanguage === "eng" ? "en" : "tw"
          );
          if (neuralRes.text && neuralRes.text.trim().length > 0) {
            rawText = neuralRes.text;
            providerUsed = neuralRes.provider || `local_neural_${neuralHealth.model}`;
            confidence = null;
            confidenceSource = "provider_unreported";
          }
        }
      } catch {
        // neural worker not running
      }

      // 5b. Gemini Multimodal Audio ASR with specialized Ghanaian dialectal & Akan Twi prompt
      if (!rawText && geminiClient.isAvailable()) {
        try {
          const modelName = AI_CONFIG.transcriptionModel || "gemini-3.8-flash";
          const geminiPrompt = resolvedLanguage === "eng"
            ? `You are an expert Automatic Speech Recognition (ASR) engine for Ghanaian telephony and mobile money.
Transcribe this audio verbatim in Ghanaian English.
Be tolerant of Ghanaian accents, slurred pronunciation, and phonetic variations:
- Currencies: 'sedis' / 'cities' / 'sidi' / 'see this' -> 'cedis', 'pesewas' / 'pese' -> 'pesewas'
- Numbers with Ghanaian accents: 'won' -> '1', 'tree' -> '3', 'faiv' -> '5', 'sevn' -> '7', 'tusan' -> 'thousand', 'fivety' -> 'fifty'
- Ghanaian names: Kwame, Kofi, Ama, Yaw, Akua, Abena, Kojo, Mensah, Boateng, Osei, etc.
- Telco networks: MTN, Telecel, Vodafone, AirtelTigo, AT.
- Colloquialisms: 'send money', 'transfer', 'check balance', 'confirm', 'cancel'.
Output ONLY the transcription text without commentary.`
            : `You are an expert Automatic Speech Recognition (ASR) engine specialized in Ghanaian Akan (Asante Twi, Akuapem Twi, Fante) and Ghanaian English.
Transcribe this audio verbatim into authentic Akan Twi or Ghanaian English.
Be tolerant of dialectal variations, accents, and non-standard pronunciations:
- Core phrases: 'Mepɛ sɛ mesoma sika', 'Mepɛ sɛ memane sika', 'Mane sika', 'Sika', 'Cedis', 'Sidi', 'Pesewas', 'Aane', 'Daabi'
- Spoken Akan numbers: baako (1), mmienu (2), mmiɛnsa (3), anan (4), enum (5), nsia (6), nson (7), nwɔtwe (8), nkron (9), du (10), aduonu (20), aduasa (30), aduanan (40), aduonum (50), ɔha (100), apem (1000)
- Ghanaian names: Kwame, Kofi, Ama, Yaw, Akua, Abena, Kojo, Kwesi, Adwoa, Mensah, etc.
- Phone numbers and network providers (MTN, Telecel, AirtelTigo/AT).
Output ONLY the transcription text without commentary.`;

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
          if (
            String(gemErr?.message || "").includes("429") ||
            String(gemErr?.message || "").toLowerCase().includes("quota") ||
            String(gemErr?.message || "").toLowerCase().includes("resource_exhausted") ||
            String(gemErr?.message || "").toLowerCase().includes("token")
          ) {
            geminiQuotaFailed = true;
          }
          auditLogger.log("warn", "ASR_ORCHESTRATOR", `Gemini fallback notice: ${gemErr.message}`);
        }
      }

      // 5c. Offline recognizer fallback if still empty
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
      providerUsed = providerAttempted || (!hasAnySpeechApiKey ? "text-testing-mode" : "no-asr-available");
    }

    // ── STEP 6: Entity, Noise, and Number Post-Processing ──
    let normalizedTranscript = rawText.trim();

    // Echo & background noise filtering
    if (normalizedTranscript) {
      if (isBackgroundNoiseOrStatic(normalizedTranscript, audioQuality.rmsEnergy)) {
        normalizedTranscript = "";
      } else if (!options.skipEchoFiltering && isAcousticSystemEcho(normalizedTranscript, step)) {
        const stripped = stripSystemEchoFromTranscript(normalizedTranscript, step);
        normalizedTranscript = (!stripped || isAcousticSystemEcho(stripped, step)) ? "" : stripped;
      }
    }

    // Smart Ghanaian pronunciation tolerance & phonetic repair
    const phoneticMatch = repairGhanaianPronunciation(normalizedTranscript);
    if (phoneticMatch.normalizedTranscript) {
      normalizedTranscript = phoneticMatch.normalizedTranscript;
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

    const anyQuotaFailed = hciQuotaFailed || geminiQuotaFailed;
    const quotaExhausted = !rawText && anyQuotaFailed;
    const quotaErrorMessage = quotaExhausted
      ? (resolvedLanguage.includes("tw")
          ? "ASR token no aba awieeɛ. Yɛsrɛ wo sɔ hwɛ bio da foforɔ."
          : "ASR token has been maxed out. Please try again another time.")
      : undefined;
    const noProviderErrorMessage = !rawText && !hasAnySpeechApiKey
      ? "No voice API key is configured and no local ASR worker returned a transcript. Start the local ASR worker or switch to typing."
      : undefined;

    return {
      text: finalText,
      rawTranscript: rawText,
      normalizedTranscript,
      numericNormalizedTranscript,
      phoneticRepairs: phoneticMatch.repairedWords,
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
      quotaExhausted,
      errorMessage: quotaErrorMessage || noProviderErrorMessage,
    };
  }
}

export const asrOrchestrator = new AsrOrchestrator();
