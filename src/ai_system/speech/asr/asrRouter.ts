/**
 * Ɔkwankyerɛfo Pa - Honest ASR Router (asrRouter.ts)
 * 
 * Implements authoritative speech routing:
 * 1. IN-BAND DTMF: Goertzel detects phone keypad tones with hardware-grade precision (conf: 0.99).
 * 2. VAD & Normalization: Routes through asrOrchestrator (GhanaNLP ASR v3 primary, explicit fallbacks).
 * 3. HONEST FALLBACK: Signal processing does NOT guess words. If neural ASR is offline or no speech,
 *    reports honest status without fabricating transcripts.
 */

import { AsrTranscriptionResult, offlineSpeechRecognizer } from "./offlineAsrEngine";
import { asrOrchestrator } from "./asrOrchestrator";

export class AsrRouter {
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    languageHint: "auto" | "en" | "tw" = "auto"
  ): Promise<AsrTranscriptionResult> {
    const rawBuffer = typeof audioPayload === "string"
      ? Buffer.from(audioPayload.replace(/^data:audio\/[a-z0-9-]+;base64,/, ""), "base64")
      : audioPayload;

    if (!rawBuffer || rawBuffer.length < 32) {
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

    // Step 2: Route through authoritative AsrOrchestrator
    const orchResult = await asrOrchestrator.transcribe(rawBuffer, mimeType, {
      languageHint: languageHint === "auto" ? "twi" : languageHint,
    });

    const isSpeech = orchResult.audioQuality?.speechDetected ?? (orchResult.text.length > 0);

    return {
      text: orchResult.text,
      confidence: orchResult.confidence ?? 0.0,
      confidenceSource: (orchResult.confidenceSource as any) || "MODEL_HEURISTIC",
      detectedLanguage: orchResult.languageDetected.includes("tw") ? "tw" : "en",
      speechActivityDetected: isSpeech,
      durationMs: orchResult.audioQuality?.durationMs || Math.round((rawBuffer.length / 32000) * 1000),
      provider: orchResult.providerUsed,
    };
  }
}

export const asrRouter = new AsrRouter();
