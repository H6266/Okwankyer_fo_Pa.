/**
 * Ɔkwankyerɛfo Pa - Local Ghanaian ASR Provider (localAsrProvider.ts)
 * 
 * Modular local ASR provider combining:
 * 1. Audio normalizer & DC offset removal
 * 2. Telephony preprocessor (300-3400Hz filter, soft limiting)
 * 3. Goertzel in-band DTMF decoding
 * 4. Acoustic fingerprinting & phoneme matching
 * 5. Language identification & calibrated confidence estimation
 */

import { AsrTranscriptionResult, OfflineSpeechRecognizer } from "./offlineAsrEngine";
import { audioNormalizer } from "./audioNormalizer";
import { telephonyPreprocessor } from "./telephonyPreprocessor";
import { confidenceEstimator } from "./confidenceEstimator";
import { languageIdentifier } from "./languageIdentifier";
import { numberDecoder } from "./numberDecoder";
import { offlineSpeechRecognizer } from "./offlineAsrEngine";

export class LocalAsrProvider implements OfflineSpeechRecognizer {
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav"
  ): Promise<AsrTranscriptionResult> {
    const rawBuffer = typeof audioPayload === "string"
      ? Buffer.from(audioPayload.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
      : audioPayload;

    // 1. Audio Normalization
    const normalized = audioNormalizer.normalize(rawBuffer);
    if (normalized.isSilent) {
      return {
        text: "",
        confidence: 0.0,
        detectedLanguage: "en",
        speechActivityDetected: false,
        durationMs: normalized.durationMs,
        provider: "local-vad-silence-detector",
      };
    }

    // 2. Telephony Audio Preprocessing
    const cleanPcm = telephonyPreprocessor.process(normalized.pcm16Buffer, normalized.sampleRate);

    // 3. Delegate to offline recognizer with preprocessed audio
    const result = await offlineSpeechRecognizer.transcribe(cleanPcm, mimeType);

    // 4. Refine with Ghanaian Number Decoder if numbers/currency are present
    if (result.text && result.text !== "UNKNOWN_AUDIO") {
      const decodedNum = numberDecoder.decode(result.text);
      if (decodedNum.numericValue !== null || decodedNum.phoneNumberDigits) {
        const langResult = languageIdentifier.identify(result.text);
        const calibratedConf = confidenceEstimator.estimate({
          snrDb: normalized.rmsDb + 48,
          lexicalMatchRatio: 0.90,
          languageAgreement: true,
          durationMs: normalized.durationMs,
          hasDtmfSupport: result.provider.includes("dtmf"),
        });

        return {
          ...result,
          confidence: Math.max(result.confidence, calibratedConf),
          detectedLanguage: langResult.language,
          durationMs: normalized.durationMs,
        };
      }
    }

    return result;
  }

  public detectSpeechActivity(audioBuffer: Buffer) {
    return offlineSpeechRecognizer.detectSpeechActivity(audioBuffer);
  }

  public detectDtmfTones(audioBuffer: Buffer) {
    return offlineSpeechRecognizer.detectDtmfTones(audioBuffer);
  }

  public detectLanguage(audioBuffer: Buffer, decodedText?: string) {
    return offlineSpeechRecognizer.detectLanguage(audioBuffer, decodedText);
  }
}

export const localAsrProvider = new LocalAsrProvider();
