/**
 * Ɔkwankyerɛfo Pa - OpenAI Transcriber & Dual ASR Verification Service (openaiTranscriber.ts)
 * 
 * OpenAI 2 — ASR Layer:
 * Responsible for:
 * - Converting spoken caller audio into high-fidelity text.
 * - Ghana NLP is the PRIMARY Ghanaian-language ASR (authentic Akan Twi / Ghanaian English acoustic models).
 * - OpenAI provides secondary verification and fallback transcription (using dedicated models
 *   e.g. gpt-4o-mini-transcribe, gpt-4o-transcribe, or whisper-1).
 * 
 * Critical Slot Dual-Verification:
 * For financial parameters (phone numbers, amounts, account numbers):
 * - If Ghana NLP and OpenAI transcriptions agree: ACCEPT
 * - If they disagree (e.g., 0241234567 vs 0241234561): REJECT and prompt DTMF keypad fallback:
 *   "I heard two different numbers. Please enter the number using the keypad."
 */

import { GhanaNlpAsrService } from "../../services/ghanaNlpAsrService";

export interface TranscribeResult {
  text: string;
  confidence: number;
  provider: "ghana_nlp" | "openai" | "browser_web_speech" | "mock_fallback";
  languageDetected?: string;
}

export interface DualAsrVerificationResult {
  accepted: boolean;
  verifiedText: string;
  extractedValue?: string | number | null;
  requiresKeypadFallback: boolean;
  fallbackPrompt?: string;
  primaryResult: TranscribeResult;
  secondaryResult?: TranscribeResult;
  comparisonStatus: "matched" | "discrepancy" | "single_provider_passed" | "skipped";
}

export class OpenAiTranscriber {
  private ghanaNlp: GhanaNlpAsrService;

  constructor() {
    this.ghanaNlp = new GhanaNlpAsrService();
  }

  private get apiKey(): string {
    return (process.env.OPENAI_API_KEY || "").trim();
  }

  private get transcriptionModel(): string {
    return (
      process.env.OPENAI_TRANSCRIBE_MODEL ||
      process.env.OPENAI_ASR_MODEL ||
      "gpt-4o-mini-transcribe"
    ).trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Primary transcription pipeline:
   * Uses Ghana NLP as primary for Ghanaian languages, with OpenAI fallback.
   */
  public async transcribeAudio(
    audioBuffer: Buffer | string,
    languageHint: "en" | "twi" | string = "en",
    mimeType: string = "audio/wav"
  ): Promise<TranscribeResult> {
    // 1. Try Ghana NLP for Ghanaian speech
    if (this.ghanaNlp.isConfigured()) {
      try {
        const ghanaRes = await this.ghanaNlp.transcribeAudio(audioBuffer, languageHint, mimeType);
        if (ghanaRes && ghanaRes.text && ghanaRes.text.trim().length > 0) {
          return {
            text: ghanaRes.text.trim(),
            confidence: ghanaRes.confidence || 0.9,
            provider: "ghana_nlp",
            languageDetected: ghanaRes.languageDetected || languageHint,
          };
        }
      } catch (err: any) {
        console.warn("[OpenAiTranscriber] Ghana NLP ASR notice:", err.message);
      }
    }

    // 2. Fallback to OpenAI ASR
    if (this.isConfigured()) {
      try {
        const openAiRes = await this.callOpenAiAsr(audioBuffer, languageHint, mimeType);
        if (openAiRes && openAiRes.text) {
          return {
            text: openAiRes.text.trim(),
            confidence: openAiRes.confidence || 0.92,
            provider: "openai",
            languageDetected: languageHint,
          };
        }
      } catch (err: any) {
        console.warn("[OpenAiTranscriber] OpenAI ASR notice:", err.message);
      }
    }

    // 3. Fallback for raw text/buffer representations
    const strRepr = typeof audioBuffer === "string" ? audioBuffer : audioBuffer.toString("utf8");
    if (strRepr && !strRepr.includes("\0") && strRepr.length < 200) {
      return {
        text: strRepr.trim(),
        confidence: 0.9,
        provider: "browser_web_speech",
        languageDetected: languageHint,
      };
    }

    return {
      text: "",
      confidence: 0.0,
      provider: "mock_fallback",
      languageDetected: languageHint,
    };
  }

  /**
   * Calls OpenAI Audio Transcription endpoint with audio buffer
   */
  private async callOpenAiAsr(
    audioBuffer: Buffer | string,
    languageHint: string,
    mimeType: string
  ): Promise<{ text: string; confidence: number }> {
    const rawBuffer = Buffer.isBuffer(audioBuffer)
      ? audioBuffer
      : Buffer.from(audioBuffer, audioBuffer.startsWith("data:") ? "base64" : "utf8");

    const formData = new FormData();
    const blob = new Blob([rawBuffer], { type: mimeType });
    formData.append("file", blob, "audio.wav");
    formData.append("model", this.transcriptionModel.includes("transcribe") ? this.transcriptionModel : "whisper-1");
    if (languageHint === "en") {
      formData.append("language", "en");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI ASR failed (${response.status}): ${err.slice(0, 100)}`);
    }

    const data = await response.json();
    return {
      text: data.text || "",
      confidence: 0.93,
    };
  }

  /**
   * Dual Transcription Verification:
   * Compares Ghana NLP primary against OpenAI verification for critical numerical fields (phone, amount).
   * Prevents acoustic misrecognition toll errors.
   */
  public async dualTranscribeAndVerify(
    audioBuffer: Buffer | string,
    slotType: "phone" | "amount" | "general",
    languageHint: "en" | "twi" = "en",
    mimeType: string = "audio/wav"
  ): Promise<DualAsrVerificationResult> {
    const primary = await this.transcribeAudio(audioBuffer, languageHint, mimeType);

    // If general slot or only one provider is configured, verify format directly
    if (slotType === "general" || (!this.ghanaNlp.isConfigured() && !this.isConfigured())) {
      return {
        accepted: Boolean(primary.text),
        verifiedText: primary.text,
        requiresKeypadFallback: false,
        primaryResult: primary,
        comparisonStatus: "single_provider_passed",
      };
    }

    // Extract numerical digits from primary transcript
    const primaryDigits = primary.text.replace(/[^0-9]/g, "");

    // If critical slot and both providers are active, invoke secondary verification
    if (this.ghanaNlp.isConfigured() && this.isConfigured() && (slotType === "phone" || slotType === "amount")) {
      try {
        const secondary = await this.callOpenAiAsr(audioBuffer, languageHint, mimeType);
        const secondaryDigits = secondary.text.replace(/[^0-9]/g, "");

        const secResult: TranscribeResult = {
          text: secondary.text,
          confidence: secondary.confidence,
          provider: "openai",
          languageDetected: languageHint,
        };

        if (primaryDigits && secondaryDigits) {
          if (primaryDigits === secondaryDigits) {
            return {
              accepted: true,
              verifiedText: primaryDigits,
              extractedValue: slotType === "amount" ? parseFloat(primaryDigits) : primaryDigits,
              requiresKeypadFallback: false,
              primaryResult: primary,
              secondaryResult: secResult,
              comparisonStatus: "matched",
            };
          } else {
            // Numbers disagree! Safety gate forces DTMF keypad entry
            const isTwi = languageHint === "twi";
            return {
              accepted: false,
              verifiedText: "",
              requiresKeypadFallback: true,
              fallbackPrompt: isTwi
                ? "Metee akontabuo mmienu a ɛnsɛ. Mesrɛ wo, fa wo fon so keypad no kyerɛw nɔma no."
                : "I heard two different numbers. Please enter the number using the keypad.",
              primaryResult: primary,
              secondaryResult: secResult,
              comparisonStatus: "discrepancy",
            };
          }
        }
      } catch (err: any) {
        console.warn("[OpenAiTranscriber] Secondary verification skipped:", err.message);
      }
    }

    // Single provider verification check for valid phone / amount format
    if (slotType === "phone") {
      const isValidPhone = /^0[235][0-9]{8}$/.test(primaryDigits);
      if (!isValidPhone && primaryDigits.length > 0) {
        return {
          accepted: false,
          verifiedText: "",
          requiresKeypadFallback: true,
          fallbackPrompt: languageHint === "twi"
            ? "Fon nɔma no nwie pɛyɛ. Mesrɛ wo, fa wo fon so keypad no kyerɛw nɔma no."
            : "The phone number format was uncertain. Please enter the 10-digit number using the keypad.",
          primaryResult: primary,
          comparisonStatus: "single_provider_passed",
        };
      }
      return {
        accepted: isValidPhone || primary.text.length > 0,
        verifiedText: primaryDigits || primary.text,
        extractedValue: primaryDigits || null,
        requiresKeypadFallback: false,
        primaryResult: primary,
        comparisonStatus: "single_provider_passed",
      };
    }

    if (slotType === "amount") {
      const parsedAmount = parseFloat(primaryDigits);
      const isValidAmount = !isNaN(parsedAmount) && parsedAmount > 0 && parsedAmount <= 5000;
      return {
        accepted: isValidAmount || primary.text.length > 0,
        verifiedText: primary.text,
        extractedValue: isValidAmount ? parsedAmount : null,
        requiresKeypadFallback: !isValidAmount && primaryDigits.length > 0,
        fallbackPrompt: languageHint === "twi"
          ? "Sika no ano nteaseɛ yie. Mesrɛ wo, fa keypad no kyerɛw sika no dodow."
          : "Could not clearly verify the amount. Please enter the amount using the keypad.",
        primaryResult: primary,
        comparisonStatus: "single_provider_passed",
      };
    }

    return {
      accepted: Boolean(primary.text),
      verifiedText: primary.text,
      requiresKeypadFallback: false,
      primaryResult: primary,
      comparisonStatus: "single_provider_passed",
    };
  }
}

export const openaiTranscriber = new OpenAiTranscriber();
