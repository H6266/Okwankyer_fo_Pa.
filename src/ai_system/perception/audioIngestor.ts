/**
 * Ɔkwankyerɛfo Pa - Real-Time Audio Ingestion & Validation (audioIngestor.ts)
 * 
 * Unified with src/modules/sttService.ts per Item 3.5.
 * Provides audio validation, format detection, and delegates transcription
 * to the single unified speechToTextService.
 */

import { AudioFrame, TranscriptFinal } from "../core/aiTypes";
import { speechToTextService } from "../../modules/sttService";
import { formatSpokenNumbersAsDigits } from "../../domain/numberFormatter";

export interface AudioValidationResult {
  valid: boolean;
  sampleRate: number;
  channels: number;
  format: "pcm" | "wav" | "webm" | "mp3" | "unknown";
  error?: string;
  dataBuffer: Buffer;
}

export class AudioIngestor {
  /**
   * Validates raw audio buffer or base64 frame.
   */
  public validateAudio(input: Buffer | Uint8Array | string, mimeType: string = "audio/pcm"): AudioValidationResult {
    let buf: Buffer;
    if (typeof input === "string") {
      const clean = input.replace(/^data:audio\/[a-z0-9]+;base64,/, "");
      buf = Buffer.from(clean, "base64");
    } else {
      buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    }

    if (!buf || buf.length === 0) {
      return {
        valid: false,
        sampleRate: 0,
        channels: 0,
        format: "unknown",
        error: "EMPTY_AUDIO_PAYLOAD: Audio buffer contains 0 bytes.",
        dataBuffer: Buffer.alloc(0),
      };
    }

    let format: "pcm" | "wav" | "webm" | "mp3" | "unknown" = "pcm";
    let sampleRate = 16000;
    let channels = 1;

    // Check RIFF header for WAV
    if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
      format = "wav";
      if (buf.length >= 28) {
        channels = buf.readUInt16LE(22);
        sampleRate = buf.readUInt32LE(24);
      }
    } else if (buf.length >= 3 && (buf.toString("ascii", 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0))) {
      format = "mp3";
    } else if (mimeType.includes("webm") || (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3)) {
      format = "webm";
    }

    return {
      valid: true,
      sampleRate,
      channels,
      format,
      dataBuffer: buf,
    };
  }

  /**
   * Delegates transcription directly to the unified Speech-To-Text pipeline.
   */
  public async transcribe(input: Buffer | string, mimeType: string = "audio/wav", step?: string): Promise<TranscriptFinal> {
    const validated = this.validateAudio(input, mimeType);
    if (!validated.valid) {
      throw new Error(validated.error || "Audio validation failed");
    }

    const sttResult = await speechToTextService.transcribe(validated.dataBuffer, mimeType, step);
    const text = sttResult.text === "empty" ? "" : formatSpokenNumbersAsDigits(sttResult.text);

    return {
      text,
      confidence: sttResult.confidence,
      confidenceSource: sttResult.confidenceSource,
      provider: sttResult.provider,
      fallbackUsed: sttResult.fallbackUsed,
      isFinal: true,
      language: sttResult.languageDetected?.includes("tw") ? "tw" : "en",
      timestamp: Date.now(),
    };
  }
}

export const audioIngestor = new AudioIngestor();
