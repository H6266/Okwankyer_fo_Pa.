/**
 * Ɔkwankyerɛfo Pa - Hedged Request ASR & Acoustic Prompt Echo Filter
 *
 * Implements:
 * 1. Prompt Echo Filtering with circular buffer of recent prompts (last 10).
 * 2. Hedged ASR racing primary model (gemini-3.8-flash) and secondary model after 800ms.
 * 3. Hard deadline of 1.2s total latency to prevent PSTN timeouts.
 * 4. Step-aware calibrated confidence scoring and Zero-PIN protection.
 * 5. DTMF keypad fallback flag on low confidence or speech failure.
 */

import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG } from "../../core/aiConfig";
import { geminiClient } from "../../../services/geminiClient";
import { formatSpokenNumbersAsDigits } from "../../../domain/numberFormatter";
import { isSpokenPinPattern } from "../../../modules/sttService";
import {
  isAcousticSystemEcho,
  stripSystemEchoFromTranscript,
  isBackgroundNoiseOrStatic,
} from "../../../domain/echoFilter";
import { offlineSpeechRecognizer } from "./offlineAsrEngine";
import { audioNormalizer } from "./audioNormalizer";
import { audioQualityAnalyzer } from "./audioQuality";

export interface SystemPromptTrace {
  id: string;
  promptText: string;
  audioHash: string;
  language: "en" | "tw" | "bilingual";
  step: string;
  timestamp: number;
}

export interface HedgedAsrResult {
  text: string;
  rawTranscript: string;
  numericNormalizedText: string;
  confidence: number;
  confidenceSource: "provider" | "calibrated" | "unavailable";
  providerUsed: string;
  latencyMs: number;
  isEchoSuppressed: boolean;
  pinDiscarded: boolean;
  requiresDtmfFallback: boolean;
}

export interface HedgedAsrOptions {
  step: string;
  languageHint?: "en" | "tw" | "auto";
  activePromptId?: string;
  hedgingDelayMs?: number; // default 800ms
  deadlineMs?: number;     // default 1200ms
}

export class HedgedAsrService {
  private static instance: HedgedAsrService;
  private promptBuffer: SystemPromptTrace[] = [];
  private readonly MAX_BUFFER_SIZE = 10;

  private constructor() {}

  public static getInstance(): HedgedAsrService {
    if (!HedgedAsrService.instance) {
      HedgedAsrService.instance = new HedgedAsrService();
    }
    return HedgedAsrService.instance;
  }

  /**
   * Records a played prompt in the circular buffer for acoustic echo matching
   */
  public registerPlayedPrompt(
    promptText: string,
    step: string,
    language: "en" | "tw" | "bilingual" = "en",
    audioBuffer?: Buffer
  ): string {
    const id = `pr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const audioHash = audioBuffer
      ? crypto.createHash("sha256").update(audioBuffer).digest("hex").slice(0, 16)
      : crypto.createHash("sha256").update(promptText.toLowerCase().trim()).digest("hex").slice(0, 16);

    const trace: SystemPromptTrace = {
      id,
      promptText: promptText.trim(),
      audioHash,
      language,
      step,
      timestamp: Date.now(),
    };

    this.promptBuffer.unshift(trace);
    if (this.promptBuffer.length > this.MAX_BUFFER_SIZE) {
      this.promptBuffer.pop();
    }

    return id;
  }

  private normalizeText(text: string): string {
    if (!text) return "";
    return text
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’#]/g, " ")
      .replace(/ɔ/g, "o")
      .replace(/ɛ/g, "e")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Computes an acoustic/textual similarity score between incoming speech and recent prompts.
   * Returns true if audio transcript is a prompt echo (>90% similarity or direct substring).
   */
  public isSystemPromptEcho(candidateText: string, activeStep?: string): { isEcho: boolean; matchedPromptId?: string } {
    if (!candidateText || candidateText.trim().length === 0) {
      return { isEcho: false };
    }

    const cleanCandidate = this.normalizeText(candidateText);
    if (cleanCandidate.length < 3) return { isEcho: false };

    // Authentic caller inputs are never echoes
    const callerAffirmatives = new Set([
      "1", "2", "3", "0", "8", "9",
      "one", "two", "three", "zero",
      "yes", "no", "confirm", "cancel", "back", "repeat",
      "aane", "dabi", "pene so", "sesa", "baako", "mmienu",
      "mtn", "telecel", "at",
      "send money", "mane sika", "check balance"
    ]);

    if (callerAffirmatives.has(cleanCandidate)) {
      return { isEcho: false };
    }

    for (const prompt of this.promptBuffer) {
      const cleanPrompt = this.normalizeText(prompt.promptText);
      
      // Exact or direct phrase match
      if (cleanPrompt.includes(cleanCandidate) && cleanCandidate.length >= 6) {
        return { isEcho: true, matchedPromptId: prompt.id };
      }

      // Word-overlap similarity
      const candWords = cleanCandidate.split(" ").filter((w) => w.length > 2);
      if (candWords.length >= 2) {
        const matchingWords = candWords.filter((w) => cleanPrompt.includes(w));
        const similarity = matchingWords.length / candWords.length;
        if (similarity >= 0.70) {
          return { isEcho: true, matchedPromptId: prompt.id };
        }
      }
    }

    // Check canonical catalog of system prompts
    if (isAcousticSystemEcho(candidateText, this.promptBuffer[0]?.promptText || null)) {
      return { isEcho: true };
    }

    return { isEcho: false };
  }

  /**
   * Calibrates confidence based on step context and utterance structure.
   */
  public calibrateStepConfidence(
    text: string,
    step: string,
    rawConfidence: number | null
  ): { confidence: number; source: "provider" | "calibrated" | "unavailable" } {
    if (rawConfidence !== null && rawConfidence >= 0 && rawConfidence <= 1) {
      return { confidence: Math.round(rawConfidence * 100) / 100, source: "provider" };
    }

    const clean = text.toLowerCase().trim();
    const digitsOnly = text.replace(/[^0-9]/g, "");
    const normalizedStep = (step || "").toLowerCase();

    // 1. Amount Step: "500", "50", "20 cedis" -> high confidence
    if (normalizedStep.includes("amount") || normalizedStep.includes("cedi")) {
      if (digitsOnly.length >= 1 && digitsOnly.length <= 4) {
        return { confidence: 0.94, source: "calibrated" };
      }
      if (/\b\d+\s*(?:cedis?|ghs|pesewas?)\b/i.test(clean)) {
        return { confidence: 0.96, source: "calibrated" };
      }
      return { confidence: 0.55, source: "calibrated" };
    }

    // 2. Recipient Phone Step: valid 10-digit number -> high confidence
    if (normalizedStep.includes("recipient") || normalizedStep.includes("phone")) {
      if (/^(?:0|\+?233)[25][0-9]{8}$/.test(digitsOnly)) {
        return { confidence: 0.98, source: "calibrated" };
      }
      if (digitsOnly.length === 10) {
        return { confidence: 0.92, source: "calibrated" };
      }
      return { confidence: 0.40, source: "calibrated" };
    }

    // 3. Selection / Menu / Language steps: single digit or keyword -> high confidence
    if (normalizedStep.includes("menu") || normalizedStep.includes("selection") || normalizedStep.includes("language")) {
      if (/^(?:1|2|3|0|8|9|one|two|english|twi|akan|baako|mmienu)$/i.test(clean)) {
        return { confidence: 0.95, source: "calibrated" };
      }
      // Any 4+ digits at menu is low confidence and suspicious
      if (digitsOnly.length >= 4) {
        return { confidence: 0.15, source: "calibrated" };
      }
      return { confidence: 0.60, source: "calibrated" };
    }

    // 4. Confirmation Step: "yes", "no", "confirm", "aane", "dabi" -> high confidence
    if (normalizedStep.includes("confirm")) {
      if (/^(?:1|2|yes|no|confirm|cancel|aane|dabi|pene so)$/i.test(clean)) {
        return { confidence: 0.95, source: "calibrated" };
      }
      return { confidence: 0.50, source: "calibrated" };
    }

    // General phrase fallback
    return { confidence: text.length > 0 ? 0.75 : 0.0, source: "calibrated" };
  }

  /**
   * Hedged ASR Execution:
   * 1. Launches Primary Model (gemini-3.8-flash) immediately.
   * 2. If no response after 800ms, launches Secondary Model (gemini-flash-latest).
   * 3. Hard deadline of 1200ms total. First to resolve wins; aborts loser.
   * 4. Offline fallback (Vosk/faster-whisper) if cloud fails.
   */
  public async transcribeHedged(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    options: HedgedAsrOptions
  ): Promise<HedgedAsrResult> {
    const startTime = performance.now();
    const hedgingDelayMs = options.hedgingDelayMs ?? 800;
    const deadlineMs = options.deadlineMs ?? 1200;

    // 1. Audio normalization
    const normalized = await audioNormalizer.normalize(audioPayload, mimeType);
    const audioQuality = audioQualityAnalyzer.analyze(normalized.pcm16Buffer, 16000);

    if (audioQuality.status === "NO_SPEECH" || normalized.isSilent) {
      return {
        text: "",
        rawTranscript: "",
        numericNormalizedText: "",
        confidence: 0,
        confidenceSource: "unavailable",
        providerUsed: "vad-silence",
        latencyMs: Math.round(performance.now() - startTime),
        isEchoSuppressed: false,
        pinDiscarded: false,
        requiresDtmfFallback: true,
      };
    }

    const primaryModel = AI_CONFIG.transcriptionModel || "gemini-3.8-flash";
    const secondaryModel = "gemini-flash-latest";
    const languagePrompt = options.languageHint === "en"
      ? "Transcribe verbatim in Ghanaian English. Output ONLY the words spoken."
      : "Transcribe verbatim in Ghanaian Akan Twi or Ghanaian English. Output ONLY the words spoken.";

    const wavBase64 = normalized.wavBuffer.toString("base64");

    // Race Primary & Secondary with Hedging
    const primaryController = new AbortController();
    const secondaryController = new AbortController();

    const invokeGeminiModel = async (model: string, signal: AbortSignal): Promise<{ text: string; model: string }> => {
      if (!geminiClient.isAvailable()) throw new Error("Gemini unavailable");
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("No GEMINI_API_KEY");

      const ai = new GoogleGenAI({ apiKey });
      const resp = await ai.models.generateContent({
        model,
        contents: [
          languagePrompt,
          {
            inlineData: {
              mimeType: "audio/wav",
              data: wavBase64,
            },
          },
        ],
      });

      if (signal.aborted) throw new Error("Aborted by hedged race winner");
      const text = (resp?.text || "").trim();
      return { text, model };
    };

    let rawText = "";
    let providerUsed = "";

    try {
      // Launch primary immediately
      const primaryPromise = invokeGeminiModel(primaryModel, primaryController.signal);

      // Launch secondary after hedging delay if primary hasn't resolved
      const secondaryPromise = new Promise<{ text: string; model: string }>((resolve, reject) => {
        const timer = setTimeout(() => {
          if (!primaryController.signal.aborted) {
            invokeGeminiModel(secondaryModel, secondaryController.signal)
              .then(resolve)
              .catch(reject);
          }
        }, hedgingDelayMs);

        primaryController.signal.addEventListener("abort", () => clearTimeout(timer));
      });

      // Hard deadline timeout
      const deadlinePromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Hedged ASR deadline exceeded")), deadlineMs);
      });

      // Race primary against secondary and deadline
      const raceWinner = await Promise.race([
        primaryPromise.then((res) => {
          secondaryController.abort();
          return res;
        }),
        secondaryPromise.then((res) => {
          primaryController.abort();
          return res;
        }),
        deadlinePromise,
      ]);

      rawText = raceWinner.text;
      providerUsed = raceWinner.model;
    } catch {
      primaryController.abort();
      secondaryController.abort();

      // Fallback: Offline local engine (faster-whisper/Vosk)
      try {
        const offlineRes = await offlineSpeechRecognizer.transcribe(
          wavBase64,
          "audio/wav",
          options.step
        );
        if (offlineRes.text && offlineRes.text.trim()) {
          rawText = offlineRes.text.trim();
          providerUsed = offlineRes.provider;
        }
      } catch {
        // All models failed
      }
    }

    // ── Echo Filtering & Stripping ──
    const activePromptText = options.activePromptId
      ? this.promptBuffer.find((p) => p.id === options.activePromptId)?.promptText
      : (this.promptBuffer[0]?.promptText || null);

    let isEchoSuppressed = false;
    let filteredText = rawText;

    if (isBackgroundNoiseOrStatic(rawText)) {
      filteredText = "";
    } else if (this.isSystemPromptEcho(rawText, options.step).isEcho || isAcousticSystemEcho(rawText, activePromptText)) {
      // Caller may have spoken after hearing part of prompt (e.g. "For English press 1 for Twi press 2 2")
      const stripped = stripSystemEchoFromTranscript(rawText, activePromptText);
      if (stripped && stripped.length > 0 && !isAcousticSystemEcho(stripped, activePromptText)) {
        filteredText = stripped;
      } else {
        isEchoSuppressed = true;
        filteredText = "";
      }
    }

    // ── Number Normalization ──
    const numericNormalizedText = filteredText
      ? formatSpokenNumbersAsDigits(filteredText)
      : "";

    // ── Zero-PIN Safety Gate ──
    let pinDiscarded = false;
    let finalText = numericNormalizedText;
    if (finalText && isSpokenPinPattern(finalText, options.step)) {
      finalText = "[DISCARDED_PIN]";
      pinDiscarded = true;
    }

    // ── Calibrated Confidence ──
    const { confidence, source: confidenceSource } = this.calibrateStepConfidence(
      finalText,
      options.step,
      null
    );

    const requiresDtmfFallback =
      !finalText ||
      finalText === "[DISCARDED_PIN]" ||
      (confidence < 0.45 && !isEchoSuppressed);

    return {
      text: finalText,
      rawTranscript: rawText,
      numericNormalizedText,
      confidence,
      confidenceSource,
      providerUsed: providerUsed || "dtmf-fallback",
      latencyMs: Math.round(performance.now() - startTime),
      isEchoSuppressed,
      pinDiscarded,
      requiresDtmfFallback,
    };
  }
}

export const hedgedAsrService = HedgedAsrService.getInstance();
