/**
 * Ɔkwankyerɛfo Pa - Signal-Processing Telephony Utilities (offlineAsrEngine.ts)
 * 
 * Deliberately honest design:
 * - VAD and Goertzel are signal-processing utilities.
 * - They safely decode in-band DTMF digits with hardware-grade precision.
 * - They detect speech activity (presence/absence of voice).
 * - They do NOT guess or fabricate spoken words.
 * - Spoken speech recognition is delegated to the neural ASR runtime.
 */

import { AiLanguage } from "../../core/aiTypes";

export interface AsrTranscriptionResult {
  text: string;
  confidence: number;
  confidenceSource?: "MODEL_HEURISTIC" | "CALIBRATED_PROBABILITY" | "DTMF_HARDWARE" | "VAD_SILENCE";
  detectedLanguage: AiLanguage;
  speechActivityDetected: boolean;
  durationMs: number;
  provider: string;
  decoder?: Record<string, unknown>;
}

export interface OfflineSpeechRecognizer {
  transcribe(audioBuffer: Buffer | string, mimeType?: string): Promise<AsrTranscriptionResult>;
  detectSpeechActivity(audioBuffer: Buffer): { active: boolean; energyDb: number; zcr: number };
  detectDtmfTones(audioBuffer: Buffer): string | null;
  detectLanguage(audioBuffer: Buffer, decodedText?: string): Promise<AiLanguage>;
}

// DTMF Frequency definitions (Hz)
const DTMF_ROW_FREQS = [697, 770, 852, 941];
const DTMF_COL_FREQS = [1209, 1336, 1477, 1633];
const DTMF_KEY_MAP: Record<string, string> = {
  "697:1209": "1", "697:1336": "2", "697:1477": "3", "697:1633": "A",
  "770:1209": "4", "770:1336": "5", "770:1477": "6", "770:1633": "B",
  "852:1209": "7", "852:1336": "8", "852:1477": "9", "852:1633": "C",
  "941:1209": "*", "941:1336": "0", "941:1477": "#", "941:1633": "D",
};

export class LocalGhanaianAsrEngine implements OfflineSpeechRecognizer {
  /**
   * Evaluates input audio for in-band DTMF tones or silence.
   * If raw speech is detected, honestly indicates speech presence so
   * neural ASR can transcribe it.
   */
  public async transcribe(
    audioPayload: Buffer | string,
    _mimeType: string = "audio/wav"
  ): Promise<AsrTranscriptionResult> {
    const rawBuffer = typeof audioPayload === "string"
      ? Buffer.from(audioPayload.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
      : audioPayload;

    if (!rawBuffer || rawBuffer.length < 44) {
      return {
        text: "",
        confidence: 0.0,
        confidenceSource: "VAD_SILENCE",
        detectedLanguage: "en",
        speechActivityDetected: false,
        durationMs: 0,
        provider: "local-vad-silence",
      };
    }

    // 1. In-band DTMF tone detection (Goertzel Algorithm)
    const dtmfDigit = this.detectDtmfTones(rawBuffer);
    if (dtmfDigit) {
      return {
        text: dtmfDigit,
        confidence: 0.99,
        confidenceSource: "DTMF_HARDWARE",
        detectedLanguage: "en",
        speechActivityDetected: true,
        durationMs: Math.round((rawBuffer.length / 32000) * 1000),
        provider: "local-goertzel-dtmf",
      };
    }

    // 2. Voice Activity Detection (RMS energy + Zero-Crossing Rate)
    const vad = this.detectSpeechActivity(rawBuffer);
    const durationMs = Math.max(10, Math.round((rawBuffer.length / 32000) * 1000));

    if (!vad.active) {
      return {
        text: "",
        confidence: 0.0,
        confidenceSource: "VAD_SILENCE",
        detectedLanguage: "en",
        speechActivityDetected: false,
        durationMs,
        provider: "local-vad-silence",
      };
    }

    // 3. Speech activity is detected, but Goertzel/VAD signal processor does NOT guess spoken words
    return {
      text: "",
      confidence: 0.0,
      confidenceSource: "MODEL_HEURISTIC",
      detectedLanguage: "tw",
      speechActivityDetected: true,
      durationMs,
      provider: "local-vad-signal-detector",
    };
  }

  /**
   * Energy and Zero-Crossing Rate (ZCR) based Voice Activity Detector (VAD).
   */
  public detectSpeechActivity(audioBuffer: Buffer): { active: boolean; energyDb: number; zcr: number } {
    let pcmOffset = 0;
    if (audioBuffer.length >= 44 && audioBuffer.toString("ascii", 0, 4) === "RIFF") {
      pcmOffset = 44;
    }

    const numSamples = Math.floor((audioBuffer.length - pcmOffset) / 2);
    if (numSamples < 80) {
      return { active: false, energyDb: -100, zcr: 0 };
    }

    let sumSquares = 0;
    let zeroCrossings = 0;
    let prevSign = 0;

    for (let i = 0; i < numSamples; i++) {
      const sample = audioBuffer.readInt16LE(pcmOffset + i * 2);
      sumSquares += sample * sample;

      const currentSign = sample >= 0 ? 1 : -1;
      if (i > 0 && currentSign !== prevSign) {
        zeroCrossings++;
      }
      prevSign = currentSign;
    }

    const rms = Math.sqrt(sumSquares / numSamples);
    const energyDb = rms > 0 ? 20 * Math.log10(rms / 32768) : -100;
    const zcr = zeroCrossings / numSamples;

    // Telephony active speech criteria: energy > -48 dBFS and non-trivial ZCR
    const active = energyDb > -48 && zcr > 0.01;

    return { active, energyDb, zcr };
  }

  /**
   * Dual-Tone Multi-Frequency (DTMF) Goertzel filter.
   */
  public detectDtmfTones(audioBuffer: Buffer): string | null {
    let pcmOffset = 0;
    let sampleRate = 8000;

    if (audioBuffer.length >= 44 && audioBuffer.toString("ascii", 0, 4) === "RIFF") {
      sampleRate = audioBuffer.readUInt32LE(24) || 8000;
      pcmOffset = 44;
    }

    const numSamples = Math.floor((audioBuffer.length - pcmOffset) / 2);
    if (numSamples < 160) return null;

    const samples: number[] = [];
    for (let i = 0; i < Math.min(numSamples, 1600); i++) {
      samples.push(audioBuffer.readInt16LE(pcmOffset + i * 2) / 32768.0);
    }

    const computeGoertzelEnergy = (targetFreq: number): number => {
      const N = samples.length;
      const k = Math.floor(0.5 + (N * targetFreq) / sampleRate);
      const omega = (2.0 * Math.PI * k) / N;
      const coeff = 2.0 * Math.cos(omega);

      let q0 = 0.0;
      let q1 = 0.0;
      let q2 = 0.0;

      for (let i = 0; i < N; i++) {
        q0 = coeff * q1 - q2 + samples[i];
        q2 = q1;
        q1 = q0;
      }

      return q1 * q1 + q2 * q2 - q1 * q2 * coeff;
    };

    let bestRowFreq = -1;
    let maxRowEnergy = 0;
    for (const rf of DTMF_ROW_FREQS) {
      const energy = computeGoertzelEnergy(rf);
      if (energy > maxRowEnergy) {
        maxRowEnergy = energy;
        bestRowFreq = rf;
      }
    }

    let bestColFreq = -1;
    let maxColEnergy = 0;
    for (const cf of DTMF_COL_FREQS) {
      const energy = computeGoertzelEnergy(cf);
      if (energy > maxColEnergy) {
        maxColEnergy = energy;
        bestColFreq = cf;
      }
    }

    // Energy threshold & twist check (ratio of col to row must be reasonable)
    if (maxRowEnergy > 0.05 && maxColEnergy > 0.05) {
      const twist = maxColEnergy / maxRowEnergy;
      if (twist >= 0.25 && twist <= 4.0) {
        const key = `${bestRowFreq}:${bestColFreq}`;
        return DTMF_KEY_MAP[key] || null;
      }
    }

    return null;
  }

  public async detectLanguage(_audioBuffer: Buffer, decodedText?: string): Promise<AiLanguage> {
    if (decodedText && /[ɛɔ]/i.test(decodedText)) {
      return "tw";
    }
    return "en";
  }
}

export const offlineSpeechRecognizer = new LocalGhanaianAsrEngine();
