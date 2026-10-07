/**
 * Ɔkwankyerɛfo Pa - OpenAI Audio Transcriber (openaiTranscriber.ts)
 * 
 * High-accuracy ASR fallback using OpenAI Whisper when Ghana NLP or local ASR is unavailable.
 * Supports Ghanaian accents, Akan phrases, and mixed English-Twi audio.
 */

import { openaiClient } from "./openaiClient";
import { toFile } from "openai";

export interface OpenAiTranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
  durationSeconds?: number;
  source: "OPENAI_WHISPER";
}

export class OpenAITranscriber {
  private getModel(): string {
    return process.env.OPENAI_TRANSCRIPTION_MODEL || "whisper-1";
  }

  private getTimeoutMs(): number {
    const val = process.env.OPENAI_TRANSCRIPTION_TIMEOUT_MS;
    return val ? parseInt(val, 10) : 8000;
  }

  public isAvailable(): boolean {
    return openaiClient.isAvailable();
  }

  public async transcribe(
    audioBuffer: Buffer | Uint8Array,
    mimeType: string = "audio/wav",
    languageHint?: string
  ): Promise<OpenAiTranscriptionResult> {
    const buffer = Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(audioBuffer);

    const ext = mimeType.includes("mp3") ? "mp3" : mimeType.includes("ogg") ? "ogg" : "wav";
    const file = await toFile(buffer, `audio_input.${ext}`, { type: mimeType });

    const promptHint =
      "Ghana Mobile Money conversation. Terms: cedi, pesewas, MoMo, Telecel, MTN, G-Money, AT, Ama, Kofi, Kwame, Yaw, Akua, Mensah, aduonum, aduasa, sika.";

    const result = await openaiClient.executeWithTimeout(
      "TRANSCRIPTION",
      async (client, signal) => {
        const res = await client.audio.transcriptions.create(
          {
            file,
            model: this.getModel(),
            prompt: promptHint,
            language: languageHint === "tw" || languageHint === "ak" ? undefined : languageHint, // Whisper does best with English prompt guidance on West African codeswitches
            response_format: "json",
            temperature: 0.0,
          },
          { signal }
        );
        return res;
      },
      this.getTimeoutMs()
    );

    const text = (result.text || "").trim();
    return {
      text,
      confidence: 0.92,
      language: languageHint || "en",
      source: "OPENAI_WHISPER",
    };
  }
}

export const openAiTranscriber = new OpenAITranscriber();
