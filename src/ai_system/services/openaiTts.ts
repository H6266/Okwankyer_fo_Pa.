/**
 * Ɔkwankyerɛfo Pa - OpenAI TTS & Cascading Speech Synthesis Engine (openaiTts.ts)
 * 
 * OpenAI 3 — TTS Layer:
 * Responsible for:
 * - Dynamic speech generation for conversational responses (e.g., "You want to send fifty Ghana cedis to Ama. Is that correct?").
 * - Preserving authentic Ghanaian studio recordings for canonical fixed prompts:
 * 
 * Hierarchy:
 * 1. FIXED PROMPT -> Studio recording catalog (audio/English, audio/Twi)
 * 2. DYNAMIC PROMPT -> University of Ghana HCI Lab TTS (Akan Twi neural voice)
 * 3. FALLBACK -> OpenAI TTS (tts-1 / gpt-4o-mini-tts with natural speech cadence)
 * 4. SYSTEM FALLBACK -> Local Ghanaian TTS / google-tts-api
 */

import fs from "fs";
import path from "path";
import { hciLabService } from "../../services/hciLabService";
import { localGhanaianTtsProvider } from "../speech/tts/localGhanaianTts";
import {
  getRecordingByPromptId,
  getRecordingByPromptKey,
  getRecordingFilePath,
} from "../../audio/recordingRegistry";

export interface SpeechSynthesisRequest {
  text: string;
  language?: "en" | "twi" | string;
  promptId?: string;
  templateKey?: string;
  voiceProfile?: "woman" | "alice" | "alloy" | "echo" | "shimmer";
}

export interface SpeechSynthesisResult {
  audioBuffer?: Buffer;
  audioBase64?: string;
  audioUrl?: string;
  audioMimeType: string;
  providerUsed: "studio_catalog" | "hci_lab" | "openai" | "local_fallback";
  durationEstimateSec: number;
}

export class OpenAiTtsService {
  constructor() {}

  private get apiKey(): string {
    const raw = (process.env.OPENAI_API_KEY || "").trim();
    const lower = raw.toLowerCase();
    if (!raw || lower.includes("paste the") || lower.includes("mock-") || lower.includes("placeholder") || lower.includes("example") || lower.includes("your api key") || lower.includes("changeme") || /^(sk-)?(test|mock|demo)/i.test(raw)) {
      return "";
    }
    return raw;
  }

  private get ttsModel(): string {
    return (process.env.OPENAI_TTS_MODEL || "tts-1").trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Main synthesis pipeline:
   * Studio -> HCI Lab -> OpenAI -> Local Fallback
   */
  public async synthesize(request: SpeechSynthesisRequest): Promise<SpeechSynthesisResult> {
    const cleanText = (request.text || "").trim();
    const isTwi = request.language === "tw" || request.language === "twi" || request.language === "ak";

    // 1. Check for Fixed Studio Catalog Prompts
    const studioMatch = this.resolveStudioRecording(request.promptId || request.templateKey, isTwi);
    if (studioMatch) {
      try {
        const fileData = fs.readFileSync(studioMatch.filePath);
        return {
          audioBuffer: fileData,
          audioBase64: fileData.toString("base64"),
          audioUrl: studioMatch.publicUrl,
          audioMimeType: studioMatch.mimeType,
          providerUsed: "studio_catalog",
          durationEstimateSec: studioMatch.durationEstimateSec || 3,
        };
      } catch (err: any) {
        console.warn("[OpenAiTts] Failed reading studio file:", err.message);
      }
    }

    // 2. Try University of Ghana HCI Lab TTS for authentic local Akan voice
    if (hciLabService.isConfigured() && isTwi) {
      try {
        const hciRes = await hciLabService.synthesize(cleanText);
        if (hciRes && hciRes.audioBuffer) {
          return {
            audioBuffer: hciRes.audioBuffer,
            audioBase64: hciRes.audioBuffer.toString("base64"),
            audioMimeType: "audio/wav",
            providerUsed: "hci_lab",
            durationEstimateSec: hciRes.durationSec || 3,
          };
        }
      } catch (err: any) {
        console.warn("[OpenAiTts] HCI Lab TTS error, falling back:", err.message);
      }
    }

    // 3. Try OpenAI TTS for natural dynamic English or multilingual speech
    if (this.isConfigured() && cleanText) {
      try {
        const openAiRes = await this.callOpenAiTts(cleanText, request.voiceProfile || "alloy");
        if (openAiRes) {
          return {
            audioBuffer: openAiRes,
            audioBase64: openAiRes.toString("base64"),
            audioMimeType: "audio/mp3",
            providerUsed: "openai",
            durationEstimateSec: Math.max(2, Math.round(cleanText.split(" ").length * 0.4)),
          };
        }
      } catch (err: any) {
        console.warn("[OpenAiTts] OpenAI TTS error, falling back:", err.message);
      }
    }

    // 4. Reliable Local Ghanaian Fallback (google-tts-api / PCM wav)
    const fallback = await localGhanaianTtsProvider.synthesize({
      text: cleanText || "Ɔkwankyerɛfo Pa",
      language: isTwi ? "tw" : "en",
    });

    return {
      audioBuffer: fallback.audioBuffer,
      audioBase64: fallback.audioBase64,
      audioMimeType: fallback.audioMimeType || "audio/wav",
      providerUsed: "local_fallback",
      durationEstimateSec: fallback.durationEstimateSec || 2,
    };
  }

  /**
   * Calls OpenAI Audio Speech endpoint
   */
  private async callOpenAiTts(text: string, voice: string = "alloy"): Promise<Buffer | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.ttsModel,
        input: text,
        voice: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].includes(voice) ? voice : "alloy",
        response_format: "mp3",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI TTS HTTP ${response.status}: ${err.slice(0, 100)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Checks local studio catalog directory for approved recordings
   */
  private resolveStudioRecording(
    keyOrPrompt?: string,
    isTwi: boolean = false
  ): { filePath: string; publicUrl: string; mimeType: string; durationEstimateSec: number } | null {
    if (!keyOrPrompt || !isTwi) return null;
    const normalizedKey = keyOrPrompt.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const recording =
      getRecordingByPromptId(keyOrPrompt.toUpperCase()) ||
      getRecordingByPromptKey(normalizedKey);
    const relativePath = recording && getRecordingFilePath(recording.relativePath);
    if (!recording || !relativePath) return null;

    const filePath = path.resolve(process.cwd(), relativePath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return null;
    return {
      filePath,
      publicUrl: recording.url,
      mimeType: recording.mimeType,
      durationEstimateSec: 3.5,
    };
  }
}

export const openaiTts = new OpenAiTtsService();
