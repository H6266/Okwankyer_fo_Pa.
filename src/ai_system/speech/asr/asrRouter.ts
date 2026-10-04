/**
 * Ɔkwankyerɛfo Pa - ASR Router (asrRouter.ts)
 * 
 * Implements Section 5 Prioritized Speech Recognition Routing:
 * 1. LOCAL_GHANAIAN_ASR (ghanaAsrProvider: local neural / phoneme models)
 * 2. LOCAL_MULTILINGUAL_ASR (localAsrProvider: VAD, DTMF in-band tones, catalog acoustic fingerprinting, number decoding)
 * 3. REMOTE_GHANAIAN_ASR (optional specialized remote endpoint)
 * 4. REMOTE_GENERAL_ASR (optional Gemini Multimodal Speech-to-Text accelerator)
 * 5. Graceful fallback to keypad grammar without call termination
 */

import { AsrTranscriptionResult } from "./offlineAsrEngine";
import { ghanaAsrProvider } from "./ghanaAsrProvider";
import { localAsrProvider } from "./localAsrProvider";
import { geminiClient } from "../../../services/geminiClient";
import { speechToText } from "../../../modules/sttService";

export class AsrRouter {
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav"
  ): Promise<AsrTranscriptionResult> {
    try {
      // Tier 1: Local Ghanaian ASR
      const ghanaResult = await ghanaAsrProvider.transcribe(audioPayload, mimeType);
      if (ghanaResult.confidence >= 0.75 || !ghanaResult.speechActivityDetected) {
        return ghanaResult;
      }

      // Tier 2: Local Multilingual ASR (VAD, in-band DTMF, and acoustic pattern matching)
      const localResult = await localAsrProvider.transcribe(audioPayload, mimeType);
      if (localResult.confidence >= 0.75 || !localResult.speechActivityDetected) {
        return localResult;
      }

      // Tier 3 & 4: Optional Remote General ASR (Gemini Multimodal Accelerator)
      if (geminiClient.isAvailable()) {
        try {
          const buffer = typeof audioPayload === "string"
            ? Buffer.from(audioPayload.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
            : audioPayload;
          const remoteStt = await speechToText(buffer, mimeType);
          if (remoteStt.text && remoteStt.text !== "empty" && remoteStt.confidence > 0.60) {
            return {
              text: remoteStt.text,
              confidence: remoteStt.confidence,
              detectedLanguage: remoteStt.languageDetected === "twi" ? "tw" : "en",
              speechActivityDetected: true,
              durationMs: 350,
              provider: "remote-gemini-accelerator",
            };
          }
        } catch (err: any) {
          console.warn("[AsrRouter] Remote Gemini ASR unavailable; retaining local result:", err.message);
        }
      }

      // Return highest quality local candidate
      return localResult.confidence >= ghanaResult.confidence ? localResult : ghanaResult;
    } catch (err: any) {
      console.warn("[AsrRouter] ASR error; returning empty speech result:", err.message);
      return {
        text: "",
        confidence: 0.0,
        detectedLanguage: "en",
        speechActivityDetected: false,
        durationMs: 0,
        provider: "asr-error-fallback",
      };
    }
  }
}

export const asrRouter = new AsrRouter();

