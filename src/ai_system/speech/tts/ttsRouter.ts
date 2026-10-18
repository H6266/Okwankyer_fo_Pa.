import fs from "fs";
import path from "path";
import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse, assertTtsResponse, isAudioContainerValid, normalizeTtsLanguage } from "./ttsProvider";
import { getRecordingFilePath, getVerifiedRecordingBySpokenText, getRecordingByPromptKey, getRecordingByPromptId, getRecordingByPath } from "../../../audio/recordingRegistry";
import { MONEY_TRANSFER_FLOW_STEPS, audioFlowStore } from "../../../audio/audioFlowStore";
import { isMp3Buffer, getOrTranscodeMp3 } from "../../../audio/streaming";
import { piperProvider } from "./localTtsProvider";
import { geminiTtsAdapter } from "./ttsAdapter";
import { hciLabService } from "../../../services/hciLabService";

export type TtsTier =
  | "TIER_1_STUDIO_CATALOG"
  | "TIER_2_LOCAL_PIPER_NEURAL"
  | "TIER_3_GEMINI_CLOUD_TTS";

export interface TtsRouterReport {
  tier: TtsTier;
  provider: string;
  durationEstimateSec?: number;
  offlineReady: boolean;
}

function mimeTypeForPath(filePath: string): string | null {
  switch (path.extname(filePath).toLowerCase()) {
    case ".wav": return "audio/wav";
    case ".mp3": return "audio/mpeg";
    case ".m4a": return "audio/mp4";
    case ".aac": return "audio/aac";
    case ".ogg": return "audio/ogg";
    default: return null;
  }
}

export class TtsRouter implements TTSProvider {
  public async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResponse> {
    const text = request.text.trim();
    if (!text) throw new Error("TTS_EMPTY_REQUEST: text is required.");
    const language = normalizeTtsLanguage(String(request.language || ""));
    if (!language) throw new Error("TTS_LANGUAGE_UNSUPPORTED: select English or Twi.");

    let recording = null;
    if (!request.skipCatalogCheck) {
      const candidatePromptId = (request.promptId || request.voiceProfile || "").trim();
      if (candidatePromptId) {
        recording = getRecordingByPromptId(candidatePromptId, language)
          || getRecordingByPromptKey(candidatePromptId, language);
        if (!recording) {
          const stepMatch = MONEY_TRANSFER_FLOW_STEPS.find(
            (s) => s.promptId.toUpperCase() === candidatePromptId.toUpperCase()
          );
          if (stepMatch) {
            const stepAudio = audioFlowStore.resolveStepAudio(stepMatch, language);
            if (stepAudio && !stepAudio.includes("/prompt-tts/")) {
              const relPath = stepAudio.replace(/^\/audio\//i, "");
              recording = getRecordingByPath(relPath) || {
                id: `flow-step:${candidatePromptId}`,
                relativePath: relPath.startsWith("Twi_library/") ? `Twi/${relPath.slice("Twi_library/".length)}` : relPath,
              } as any;
            }
          }
        }
      }

      if (!recording) {
        recording = getVerifiedRecordingBySpokenText(text, language)
          || getRecordingByPromptKey(text, language);
      }
    }

    if (recording) {
      const relativePath = getRecordingFilePath(recording.relativePath);
      if (relativePath) {
        const absolutePath = path.resolve(process.cwd(), relativePath);
        if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) {
          let servePath = absolutePath;
          if (path.extname(absolutePath).toLowerCase() === ".mp3") {
            try {
              const raw = fs.readFileSync(absolutePath);
              if (!isMp3Buffer(raw)) {
                servePath = await getOrTranscodeMp3(absolutePath);
              }
            } catch {}
          }
          const audioBuffer = fs.readFileSync(servePath);
          const audioMimeType = mimeTypeForPath(servePath) || "audio/mpeg";
          return assertTtsResponse(request, {
            audioBuffer,
            audioBase64: audioBuffer.toString("base64"),
            audioMimeType,
            mimeType: audioMimeType,
            providerUsed: `verified-studio-recording:${recording.id}`,
            language,
            model: "studio-recording",
          }, language);
        }
      }
    }

    if (language === "twi") {
      if (hciLabService.isConfigured()) {
        try {
          const result = await hciLabService.synthesize(text);
          const audioMimeType = "audio/wav";
          if (isAudioContainerValid(result.audioBuffer, audioMimeType)) {
            return assertTtsResponse(request, {
              audioBuffer: result.audioBuffer,
              audioBase64: result.audioBuffer.toString("base64"),
              audioMimeType,
              mimeType: audioMimeType,
              providerUsed: "hci-lab-reviewed-twi-tts",
              language: "twi",
              model: "HCI Lab Twi neural TTS",
            }, "twi");
          }
        } catch (err: any) {
          console.warn("[TtsRouter] HCI Lab synthesis failed, using dynamic speech fallback:", err?.message || err);
        }
      }
      throw new Error("TWI_TTS_UNAVAILABLE: No approved Twi speech provider is configured.");
    }

    const providerErrors: string[] = [];
    try {
      const localResponse = await piperProvider.synthesize({ ...request, text, language: "en" });
      return assertTtsResponse(request, localResponse, "en");
    } catch (error) {
      providerErrors.push(error instanceof Error ? error.message : "Piper synthesis failed.");
    }

    try {
      const cloudResponse = await geminiTtsAdapter.synthesize({ ...request, text, language: "en" });
      return assertTtsResponse(request, cloudResponse, "en");
    } catch (error) {
      providerErrors.push(error instanceof Error ? error.message : "Gemini synthesis failed.");
    }

    try {
      const googleTTS = await import("google-tts-api");
      const chunks = await googleTTS.getAllAudioBase64(text, { lang: "en", timeout: 8000 });
      const audioBuffer = Buffer.concat(chunks.map((c) => Buffer.from(c.base64, "base64")));
      return assertTtsResponse(request, {
        audioBuffer,
        audioBase64: audioBuffer.toString("base64"),
        audioMimeType: "audio/mpeg",
        mimeType: "audio/mpeg",
        providerUsed: "google-tts-dynamic",
        language: "en",
        model: "google-tts-fallback",
      }, "en");
    } catch (error) {
      providerErrors.push(error instanceof Error ? error.message : "Google TTS failed.");
    }

    throw new Error(`TTS_PROVIDER_UNAVAILABLE: English synthesis failed (${providerErrors.join("; ")}).`);
  }

  public async synthesizeBrainReply(reply: { text: string; language: string; promptId?: string }): Promise<TtsSynthesisResponse> {
    const language = normalizeTtsLanguage(reply.language);
    if (!language) throw new Error("TTS_LANGUAGE_UNSUPPORTED: select English or Twi.");
    return this.synthesize({
      text: reply.text,
      language: language === "twi" ? "tw" : "en",
      voiceProfile: reply.promptId,
    });
  }

  public async getRouterReport(): Promise<TtsRouterReport> {
    const health = await piperProvider.checkHealth("en");
    return {
      tier: health.ready ? "TIER_2_LOCAL_PIPER_NEURAL" : "TIER_3_GEMINI_CLOUD_TTS",
      provider: health.ready ? health.provider : "gemini-tts (cloud availability checked per request)",
      offlineReady: health.ready,
    };
  }
}

export const ttsRouter = new TtsRouter();
