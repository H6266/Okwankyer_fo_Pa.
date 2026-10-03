/**
 * Ɔkwankyerɛfo Pa - Input Processor
 * Coordinates perception across Voice, DTMF, and Text modalities.
 */

import { AiProcessInput, AiLanguage } from "../core/aiTypes";
import { languageDetector } from "./languageDetector";
import { inputNormalizer } from "./inputNormalizer";
import { speechToText } from "../../modules/sttService";

export interface ProcessedInput {
  rawText: string;
  normalizedText: string;
  detectedLanguage: AiLanguage;
  isDtmf: boolean;
  transcriptionConfidence: number;
}

export class InputProcessor {
  /**
   * Processes raw input: transcribes audio if present, detects language, and normalizes text.
   */
  public async process(input: AiProcessInput): Promise<ProcessedInput> {
    let rawText = (input.input || "").trim();
    let transcriptionConfidence = 1.0;

    // If an audio buffer is provided, transcribe it using the STT service
    if (input.audioBuffer) {
      try {
        const buffer = typeof input.audioBuffer === "string"
          ? Buffer.from(input.audioBuffer.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
          : input.audioBuffer;

        const sttResult = await speechToText(buffer, input.mimeType || "audio/webm");
        if (sttResult && sttResult.text) {
          rawText = sttResult.text;
          transcriptionConfidence = sttResult.confidence || 0.85;
        }
      } catch (err: any) {
        console.warn("[InputProcessor] Audio transcription notice:", err.message);
      }
    }

    // Check if input is pure DTMF
    const isDtmf = input.channel === "DTMF" || /^[0-9*#]+$/.test(rawText);

    // Detect language
    const detectedLanguage = input.language && input.language !== "unknown"
      ? input.language
      : languageDetector.detect(rawText);

    // Normalize text
    const normalizedText = inputNormalizer.normalize(rawText);

    return {
      rawText,
      normalizedText,
      detectedLanguage,
      isDtmf,
      transcriptionConfidence,
    };
  }
}

export const inputProcessor = new InputProcessor();
