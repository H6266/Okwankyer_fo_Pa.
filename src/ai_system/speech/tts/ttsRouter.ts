import fs from "fs";
import path from "path";
import { TTSProvider, TtsSynthesisRequest, TtsSynthesisResponse, assertTtsResponse, isAudioContainerValid, normalizeTtsLanguage } from "./ttsProvider";
import { getRecordingFilePath, getVerifiedRecordingBySpokenText } from "../../../audio/recordingRegistry";
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

    const recording = getVerifiedRecordingBySpokenText(text, language);
    if (recording) {
      const relativePath = getRecordingFilePath(recording.relativePath);
      if (!relativePath) throw new Error(`STUDIO_RECORDING_PATH_INVALID: ${recording.id}`);
      const absolutePath = path.resolve(process.cwd(), relativePath);
      if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
        throw new Error(`STUDIO_RECORDING_MISSING: ${recording.promptId || recording.id}`);
      }
      const audioBuffer = fs.readFileSync(absolutePath);
      const audioMimeType = mimeTypeForPath(absolutePath);
      if (!audioMimeType || !isAudioContainerValid(audioBuffer, audioMimeType)) {
        throw new Error(`STUDIO_RECORDING_INVALID: ${recording.promptId || recording.id}`);
      }
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

    if (language === "twi") {
      if (process.env.TWI_TTS_SAMPLE_AUDIO_REVIEWED !== "true") {
        throw new Error("TWI_TTS_UNAVAILABLE: no Twi speech model has an audio sample reviewed and enabled.");
      }
      if (!hciLabService.isConfigured()) {
        throw new Error("TWI_TTS_UNAVAILABLE: the reviewed Twi neural speech provider is not configured.");
      }
      const result = await hciLabService.synthesize(text);
      const audioMimeType = "audio/wav";
      if (!isAudioContainerValid(result.audioBuffer, audioMimeType)) {
        throw new Error("TWI_TTS_INVALID_RESPONSE: reviewed provider did not return a valid WAV container.");
      }
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
