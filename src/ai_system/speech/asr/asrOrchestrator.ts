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
import { hciLabService } from "../../../services/hciLabService";
import { geminiClient } from "../../../services/geminiClient";
import { offlineSpeechRecognizer } from "./offlineAsrEngine";
import { ghanaAsrProvider } from "./ghanaAsrProvider";
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

    // ── STEP 4A: Dedicated Ghanaian ASR: University of Ghana HCI Lab (with Quota Guard) ──
    if (hciLabService.isConfigured() && (resolvedLanguage === "twi" || resolvedLanguage === "atw")) {
      providerAttempted = "HCI_LAB_ASR";
      try {
        const timeoutMs = options.timeoutMs || 2500;
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
        fallbackReason = err.message || "HCI Lab ASR transcription failure";
        auditLogger.log("warn", "ASR_ORCHESTRATOR", `HCI Lab primary ASR attempt notice: ${fallbackReason}. Proceeding to fallback.`);
      }
    }

    // ── STEP 4B: Primary Provider: GhanaNLP ASR v3 ──
    if (!rawText && ghanaNlpAsrService.isConfigured()) {
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

    // ── STEP 4B: Local neural ASR fallback ──
    // Use the real Faster-Whisper worker before cloud/deterministic fallbacks.
    if (!rawText && allowFallback) {
      fallbackUsed = true;
      try {
        const localLanguageHint: "auto" | "en" | "tw" =
          resolvedLanguage === "eng" ? "en" : isMixed ? "auto" : "tw";

        const localResult = await ghanaAsrProvider.transcribe(
          normalized.wavBuffer,
          "audio/wav",
          localLanguageHint
        );

        if (localResult.text && localResult.text.trim()) {
          rawText = localResult.text.trim();
          providerUsed = localResult.provider || "faster-whisper-local-neural-asr";
          // The worker's confidence value is a diagnostic heuristic, not calibrated.
          confidence = null;
          confidenceSource = "provider_unreported";
          auditLogger.log("info", "ASR_ORCHESTRATOR", `Local neural ASR produced a transcript (${providerUsed}).`);
        }
      } catch (err: any) {
        const msg = String(err?.message || "Local neural ASR unavailable");
        fallbackReason = msg;
        auditLogger.log("warn", "ASR_ORCHESTRATOR", `Local neural ASR fallback unavailable: ${msg.slice(0, 180)}`);
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
            providerUsed = `local_neural_${neuralHealth.model}`;
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
      providerUsed = providerAttempted || "no-asr-available";
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
    };
  }
}

export const asrOrchestrator = new AsrOrchestrator();
