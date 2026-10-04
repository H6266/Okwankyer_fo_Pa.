/**
 * Ɔkwankyerɛfo Pa - Honest ASR Router (asrRouter.ts)
 * 
 * Implements Batch 2 Honest Speech Routing:
 * 1. IN-BAND DTMF: Goertzel detects phone keypad tones with hardware-grade precision (conf: 0.99).
 * 2. VAD: Checks for genuine silence to avoid wasting compute.
 * 3. LOCAL NEURAL ASR: Routes to faster-whisper CTranslate2 runtime on localhost:8765.
 * 4. REMOTE ACCELERATOR: Optional remote ASR if configured and allowed.
 * 5. HONEST FALLBACK: Signal processing does NOT guess words. If neural ASR is offline,
 *    reports speechActivityDetected without fabricating transcripts, enabling safe keypad fallback.
 */

import { AsrTranscriptionResult, offlineSpeechRecognizer } from "./offlineAsrEngine";
import { neuralAsrProvider } from "./neuralAsrProvider";
import { geminiClient } from "../../../services/geminiClient";
import { speechToText } from "../../../modules/sttService";

export class AsrRouter {
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    languageHint: "auto" | "en" | "tw" = "auto"
  ): Promise<AsrTranscriptionResult> {
    const rawBuffer = typeof audioPayload === "string"
      ? Buffer.from(audioPayload.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
      : audioPayload;

    if (!rawBuffer || rawBuffer.length < 44) {
      return {
        text: "",
        confidence: 0.0,
        confidenceSource: "VAD_SILENCE",
        detectedLanguage: "en",
        speechActivityDetected: false,
        durationMs: 0,
        provider: "vad-silence",
      };
    }

    // Step 1: Detect in-band DTMF tones (Hardware-grade precision)
    const dtmfDigit = offlineSpeechRecognizer.detectDtmfTones(rawBuffer);
    if (dtmfDigit) {
      return {
        text: dtmfDigit,
        confidence: 0.99,
        confidenceSource: "DTMF_HARDWARE",
        detectedLanguage: "en",
        speechActivityDetected: true,
        durationMs: Math.round((rawBuffer.length / 32000) * 1000),
        provider: "local-goertzel-dtmf",
      };
    }

    // Step 2: Voice Activity Detection (VAD)
    const vad = offlineSpeechRecognizer.detectSpeechActivity(rawBuffer);
    if (!vad.active) {
      return {
        text: "",
        confidence: 0.0,
        confidenceSource: "VAD_SILENCE",
        detectedLanguage: "en",
        speechActivityDetected: false,
        durationMs: Math.round((rawBuffer.length / 32000) * 1000),
        provider: "local-vad-silence",
      };
    }

    // Step 3: Local Neural ASR (faster-whisper runtime)
    try {
      const neuralResult = await neuralAsrProvider.transcribe(rawBuffer, mimeType, languageHint);
      if (neuralResult.text && neuralResult.text.trim().length > 0) {
        return neuralResult;
      }
    } catch (err: any) {
      // Local worker may be unconfigured or offline
    }

    // Step 4: Optional Remote ASR Accelerator (if configured and permitted)
    if (geminiClient.isAvailable()) {
      try {
        const remoteStt = await speechToText(rawBuffer, mimeType);
        if (remoteStt.text && remoteStt.text !== "empty" && remoteStt.confidence > 0.60) {
          return {
            text: remoteStt.text,
            confidence: remoteStt.confidence,
            confidenceSource: "MODEL_HEURISTIC",
            detectedLanguage: remoteStt.languageDetected === "twi" ? "tw" : "en",
            speechActivityDetected: true,
            durationMs: 350,
            provider: "remote-gemini-accelerator",
          };
        }
      } catch (err: any) {
        console.warn("[AsrRouter] Remote Gemini ASR unavailable:", err.message);
      }
    }

    // Step 5: Honest Fallback - Voice was detected, but no neural runtime transcribed it
    return {
      text: "",
      confidence: 0.0,
      confidenceSource: "MODEL_HEURISTIC",
      detectedLanguage: "tw",
      speechActivityDetected: true,
      durationMs: Math.round((rawBuffer.length / 32000) * 1000),
      provider: "no-neural-asr-runtime",
    };
  }
}

export const asrRouter = new AsrRouter();
