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
 * 2. DYNAMIC PROMPT -> Ghana NLP TTS (Akan Twi, Ghanaian English neural voice)
 * 3. FALLBACK -> OpenAI TTS (tts-1 / gpt-4o-mini-tts with natural speech cadence)
 * 4. SYSTEM FALLBACK -> Local Ghanaian TTS / google-tts-api
 */

import fs from "fs";
import path from "path";
import { GhanaNlpTtsService } from "../../services/ghanaNlpTtsService";
import { localGhanaianTtsProvider } from "../speech/tts/localGhanaianTts";

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
  providerUsed: "studio_catalog" | "ghana_nlp" | "openai" | "local_fallback";
  durationEstimateSec: number;
}

export class OpenAiTtsService {
  private ghanaNlp: GhanaNlpTtsService;

  constructor() {
    this.ghanaNlp = new GhanaNlpTtsService();
  }

  private get apiKey(): string {
    return (process.env.OPENAI_API_KEY || "").trim();
  }

  private get ttsModel(): string {
    return (process.env.OPENAI_TTS_MODEL || "tts-1").trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Main synthesis pipeline:
   * Studio -> Ghana NLP -> OpenAI -> Local Fallback
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
          audioMimeType: "audio/mp3",
          providerUsed: "studio_catalog",
          durationEstimateSec: studioMatch.durationEstimateSec || 3,
        };
      } catch (err: any) {
        console.warn("[OpenAiTts] Failed reading studio file:", err.message);
      }
    }

    // 2. Try Ghana NLP TTS for authentic local voice
    if (this.ghanaNlp.isConfigured() && isTwi) {
      try {
        const ghanaRes = await this.ghanaNlp.synthesize({
          text: cleanText,
          language: "twi",
        });
        if (ghanaRes && ghanaRes.audioBuffer) {
          return {
            audioBuffer: ghanaRes.audioBuffer,
            audioBase64: ghanaRes.audioBase64,
            audioMimeType: ghanaRes.audioMimeType || "audio/wav",
            providerUsed: "ghana_nlp",
            durationEstimateSec: ghanaRes.durationEstimateSec || 3,
          };
        }
      } catch (err: any) {
        console.warn("[OpenAiTts] Ghana NLP TTS error, falling back:", err.message);
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
      language: isTwi ? "twi" : "en",
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
  ): { filePath: string; publicUrl: string; durationEstimateSec: number } | null {
    if (!keyOrPrompt) return null;
    const clean = keyOrPrompt.toLowerCase().replace(/[^a-z0-9_]/g, "");

    const dir = isTwi ? path.resolve(process.cwd(), "audio/Twi") : path.resolve(process.cwd(), "audio/English");
    if (!fs.existsSync(dir)) return null;

    // Check common aliases
    const candidates = [
      `Audio_prompt_${clean}.mp3`,
      `Audio_prompt_twi_${clean}.mp3`,
      `${clean}.mp3`,
      `welcome_prompt_01.mp3`,
    ];

    if (clean === "welcome" || clean === "prompt_welcome" || clean === "greet") {
      const welcomeFile = path.resolve(dir, isTwi ? "welcome_prompt_01.mp3" : "Welcome_prompt_01.mp3");
      if (fs.existsSync(welcomeFile)) {
        return {
          filePath: welcomeFile,
          publicUrl: `/audio/${isTwi ? "Twi" : "English"}/welcome_prompt_01.mp3`,
          durationEstimateSec: 4,
        };
      }
    }

    for (const cand of candidates) {
      const p = path.resolve(dir, cand);
      if (fs.existsSync(p)) {
        return {
          filePath: p,
          publicUrl: `/audio/${isTwi ? "Twi" : "English"}/${cand}`,
          durationEstimateSec: 3,
        };
      }
    }

    return null;
  }
}

export const openaiTts = new OpenAiTtsService();
