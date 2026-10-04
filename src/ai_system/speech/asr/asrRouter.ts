/**
 * Ɔkwankyerɛfo Pa - ASR Router (asrRouter.ts)
 * 
 * Implements prioritized speech recognition routing:
 * 1. LOCAL_GHANAIAN_ASR (DTMF tone decoder, VAD, catalog acoustic fingerprinting, phoneme matching)
 * 2. LOCAL_ACOUSTIC_FALLBACK (Syllabic burst analysis, zero-crossing rate)
 * 3. OPTIONAL_REMOTE_ASR (Gemini Multimodal Speech-to-Text if configured)
 * 4. Graceful degradation to DTMF keypad grammar without crashing call
 */

import { AsrTranscriptionResult, offlineSpeechRecognizer } from "./offlineAsrEngine";
import { geminiClient } from "../../../services/geminiClient";
import { speechToText } from "../../../modules/sttService";

export class AsrRouter {
  public async transcribe(audioPayload: Buffer | string, mimeType: string = "audio/wav"): Promise<AsrTranscriptionResult> {
    // Tier 1: Local Offline Recognizer (VAD, DTMF, and Acoustic Pattern Matcher)
    try {
      const localResult = await offlineSpeechRecognizer.transcribe(audioPayload, mimeType);
      
      // If high confidence local match (e.g. DTMF tone or catalog prompt match), return immediately
      if (localResult.confidence >= 0.75 || !localResult.speechActivityDetected) {
        return localResult;
      }

      // If local engine detected active speech with moderate/uncertain confidence, try remote accelerator if available
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

      // Return local result
      return localResult;
    } catch (err: any) {
      console.warn("[AsrRouter] Local ASR error; returning empty speech result:", err.message);
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
