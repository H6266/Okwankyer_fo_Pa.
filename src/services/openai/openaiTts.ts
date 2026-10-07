/**
 * Ɔkwankyerɛfo Pa - OpenAI Text-to-Speech (openaiTts.ts)
 * 
 * TTS fallback for dynamic responses when local Piper TTS or Google TTS is degraded.
 * Generates natural spoken audio with clear articulation suitable for telephony and web audio.
 */

import { openaiClient } from "./openaiClient";

export interface OpenAiTtsResult {
  audioBuffer: Buffer;
  mimeType: "audio/mpeg";
  source: "OPENAI_TTS";
}

export class OpenAITtsService {
  private getModel(): string {
    return process.env.OPENAI_TTS_MODEL || "tts-1";
  }

  private getTimeoutMs(): number {
    const val = process.env.OPENAI_TTS_TIMEOUT_MS;
    return val ? parseInt(val, 10) : 5000;
  }

  public isAvailable(): boolean {
    return openaiClient.isAvailable();
  }

  public async synthesize(
    text: string,
    voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "nova"
  ): Promise<OpenAiTtsResult> {
    const cleanText = text.trim();
    if (!cleanText) {
      throw new Error("EMPTY_TTS_TEXT: Text to synthesize cannot be empty.");
    }

    const audioResponse = await openaiClient.executeWithTimeout(
      "TTS",
      async (client, signal) => {
        const response = await client.audio.speech.create(
          {
            model: this.getModel(),
            voice,
            input: cleanText,
            response_format: "mp3",
          },
          { signal }
        );

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      },
      this.getTimeoutMs()
    );

    return {
      audioBuffer: audioResponse,
      mimeType: "audio/mpeg",
      source: "OPENAI_TTS",
    };
  }
}

export const openAiTts = new OpenAITtsService();
