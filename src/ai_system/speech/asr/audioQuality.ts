/**
 * Ɔkwankyerɛfo Pa - Speech Activity & Audio Quality Analyzer (audioQuality.ts)
 * 
 * Provides rigorous acoustic measurement without fabricating ASR confidence:
 * - RMS energy
 * - Adaptive noise floor estimation
 * - Signal-to-Noise Ratio (SNR)
 * - Zero-crossing rate (ZCR)
 * - Clipping rate
 * - Silence ratio & Speech ratio
 * - Turn endpoint detection & barge-in classification
 * 
 * Note: qualityScore is an acoustic metric, NOT model transcription confidence!
 */

export type AudioQualityStatus = "OK" | "NO_SPEECH" | "LOW_AUDIO_QUALITY" | "CORRUPT_AUDIO";

export interface AudioQualityReport {
  speechDetected: boolean;
  silenceRatio: number;
  speechRatio: number;
  noiseLevelDb: number;
  snrDb: number;
  clippingRate: number;
  sampleRate: number;
  durationMs: number;
  rmsEnergy: number;
  qualityScore: number; // 0.0 - 1.0 (Acoustic clarity only; NEVER use as ASR model confidence)
  status: AudioQualityStatus;
  reason?: string;
}

export interface VadConfig {
  ASR_FRAME_MS: number;
  ASR_ANALYSIS_WINDOW_MS: number;
  ASR_MIN_SPEECH_MS: number;
  ASR_END_SILENCE_MS: number;
  ASR_MAX_UTTERANCE_MS: number;
  ASR_OVERLAP_MS: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  ASR_FRAME_MS: 20,
  ASR_ANALYSIS_WINDOW_MS: 250,
  ASR_MIN_SPEECH_MS: 700,
  ASR_END_SILENCE_MS: 650,
  ASR_MAX_UTTERANCE_MS: 15000,
  ASR_OVERLAP_MS: 700,
};

export interface VadAnalysisResult {
  speechActive: boolean;
  probableSpeech: boolean;
  noiseLevel: number;
  signalLevel: number;
  snrEstimate: number;
  silenceDurationMs: number;
  speechDurationMs: number;
  qualityScore: number;
  turnCompleted?: boolean;
}

/**
 * Adaptive Streaming Voice Activity Detector
 * Computes energy, adaptive noise floor, zero-crossing rate, SNR, and utterance endpoints.
 */
export class AdaptiveStreamingVad {
  private config: VadConfig;
  private noiseFloor: number = 180; // Adaptive background noise floor RMS
  private smoothedEnergy: number = 0;
  private speechDurationMs: number = 0;
  private silenceDurationMs: number = 0;
  private totalFrames: number = 0;
  private clippingCount: number = 0;
  private totalSamples: number = 0;

  constructor(config: Partial<VadConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
  }

  public setMinSpeechMs(ms: number): void {
    this.config.ASR_MIN_SPEECH_MS = ms;
  }

  public setEndSilenceMs(ms: number): void {
    this.config.ASR_END_SILENCE_MS = ms;
  }

  public getEndSilenceMs(): number {
    return this.config.ASR_END_SILENCE_MS;
  }

  /**
   * Resets VAD tracking state for a new turn.
   */
  public resetTurn(): void {
    this.speechDurationMs = 0;
    this.silenceDurationMs = 0;
    this.clippingCount = 0;
    this.totalSamples = 0;
  }

  /**
   * Complete reset including learned noise floor.
   */
  public fullReset(): void {
    this.resetTurn();
    this.noiseFloor = 180;
    this.smoothedEnergy = 0;
    this.totalFrames = 0;
  }

  /**
   * Process a single PCM Int16 frame (typically 20ms = 320 samples at 16kHz).
   */
  public processFrame(samples: Int16Array | number[]): VadAnalysisResult {
    const n = samples.length;
    if (n === 0) {
      return {
        speechActive: false,
        probableSpeech: false,
        noiseLevel: this.noiseFloor,
        signalLevel: 0,
        snrEstimate: 0,
        silenceDurationMs: this.silenceDurationMs,
        speechDurationMs: this.speechDurationMs,
        qualityScore: 0,
      };
    }

    let sumSq = 0;
    let zeroCrossings = 0;
    let prevVal = samples[0];

    for (let i = 0; i < n; i++) {
      const val = samples[i];
      sumSq += val * val;
      if (Math.abs(val) >= 32700) {
        this.clippingCount++;
      }
      if ((val >= 0 && prevVal < 0) || (val < 0 && prevVal >= 0)) {
        zeroCrossings++;
      }
      prevVal = val;
    }

    this.totalSamples += n;
    this.totalFrames++;

    const frameRms = Math.sqrt(sumSq / n);
    const zcr = zeroCrossings / n; // Zero-crossing rate: 0.0 to 1.0

    // Exponential smoothing on frame energy
    this.smoothedEnergy = this.smoothedEnergy === 0 ? frameRms : 0.7 * this.smoothedEnergy + 0.3 * frameRms;

    // Adaptive noise floor tracker (update when quiet)
    if (this.smoothedEnergy < this.noiseFloor * 1.8) {
      // Background noise adaptation (slow EMA: alpha = 0.05)
      this.noiseFloor = 0.95 * this.noiseFloor + 0.05 * this.smoothedEnergy;
    }
    this.noiseFloor = Math.max(30, Math.min(2500, this.noiseFloor));

    // SNR in dB
    const snrLinear = Math.max(1, this.smoothedEnergy / Math.max(1, this.noiseFloor));
    const snrDb = Math.round(20 * Math.log10(snrLinear));

    // Dynamic speech threshold: 2.2x noise floor or at least 400 RMS
    const speechThreshold = Math.max(380, this.noiseFloor * 2.2);

    // Speech discrimination: both frame energy and smoothed energy match speech, and zero-crossing rate matches speech
    const isSpeechFrame = frameRms >= speechThreshold * 0.7 && this.smoothedEnergy >= speechThreshold && zcr >= 0.015 && zcr <= 0.65;
    const isProbableSpeech = this.smoothedEnergy >= speechThreshold * 0.8;

    const frameDurationMs = this.config.ASR_FRAME_MS;

    if (isSpeechFrame) {
      this.speechDurationMs += frameDurationMs;
      this.silenceDurationMs = 0;
    } else {
      this.silenceDurationMs += frameDurationMs;
    }

    // Determine if utterance has naturally ended
    const speechActive = this.speechDurationMs >= 100 && this.silenceDurationMs < this.config.ASR_END_SILENCE_MS;
    const turnCompleted =
      this.speechDurationMs >= this.config.ASR_MIN_SPEECH_MS &&
      this.silenceDurationMs >= this.config.ASR_END_SILENCE_MS;

    // Acoustic quality score (clarity & SNR, NEVER model confidence)
    let quality = 0.5;
    if (snrDb >= 18) quality += 0.3;
    else if (snrDb >= 10) quality += 0.15;
    else if (snrDb < 4) quality -= 0.25;

    const clipRate = this.totalSamples > 0 ? this.clippingCount / this.totalSamples : 0;
    if (clipRate > 0.05) quality -= 0.25;

    quality = Math.max(0.1, Math.min(0.95, Number(quality.toFixed(2))));

    return {
      speechActive,
      probableSpeech: isProbableSpeech,
      noiseLevel: Math.round(this.noiseFloor),
      signalLevel: Math.round(this.smoothedEnergy),
      snrEstimate: snrDb,
      silenceDurationMs: this.silenceDurationMs,
      speechDurationMs: this.speechDurationMs,
      qualityScore: quality,
      turnCompleted,
    };
  }
}

export class AudioQualityAnalyzer {
  /**
   * Analyzes 16-bit signed LE mono PCM buffer (typically 16 kHz).
   */
  public analyze(pcm16Buffer: Buffer, sampleRate: number = 16000): AudioQualityReport {
    if (!pcm16Buffer || pcm16Buffer.length < 32) {
      return {
        speechDetected: false,
        silenceRatio: 1.0,
        speechRatio: 0.0,
        noiseLevelDb: -100,
        snrDb: 0,
        clippingRate: 0,
        sampleRate,
        durationMs: 0,
        rmsEnergy: 0,
        qualityScore: 0,
        status: "CORRUPT_AUDIO",
        reason: "Audio buffer too short or empty (< 32 bytes)",
      };
    }

    const sampleCount = Math.floor(pcm16Buffer.length / 2);
    const durationMs = Math.round((sampleCount / sampleRate) * 1000);

    // Frame-based energy analysis: 20ms frames (320 samples at 16 kHz)
    const frameSize = Math.max(160, Math.floor(sampleRate * 0.02)); // 20ms
    const numFrames = Math.floor(sampleCount / frameSize);

    if (numFrames === 0) {
      return {
        speechDetected: false,
        silenceRatio: 1.0,
        speechRatio: 0.0,
        noiseLevelDb: -100,
        snrDb: 0,
        clippingRate: 0,
        sampleRate,
        durationMs,
        rmsEnergy: 0,
        qualityScore: 0.2,
        status: "NO_SPEECH",
        reason: "Audio duration shorter than single 20ms frame",
      };
    }

    const frameEnergies: number[] = new Array(numFrames);
    let clippedSamples = 0;
    let totalSumSquares = 0;

    for (let f = 0; f < numFrames; f++) {
      let frameSquares = 0;
      const offset = f * frameSize;
      for (let i = 0; i < frameSize; i++) {
        const val = pcm16Buffer.readInt16LE((offset + i) * 2);
        if (Math.abs(val) >= 32700) {
          clippedSamples++;
        }
        frameSquares += val * val;
      }
      totalSumSquares += frameSquares;
      const frameRms = Math.sqrt(frameSquares / frameSize);
      frameEnergies[f] = frameRms;
    }

    const overallRms = Math.sqrt(totalSumSquares / (numFrames * frameSize));
    const clippingRate = clippedSamples / sampleCount;

    // Sort frame energies to estimate noise floor (lowest 15% quantile)
    const sortedEnergies = [...frameEnergies].sort((a, b) => a - b);
    const noiseIndex = Math.max(0, Math.floor(sortedEnergies.length * 0.15));
    const noiseRms = Math.max(20, sortedEnergies[noiseIndex]);
    const noiseLevelDb = Math.round(20 * Math.log10(noiseRms / 32768));

    // Peak signal estimate (95th percentile)
    const peakIndex = Math.min(sortedEnergies.length - 1, Math.floor(sortedEnergies.length * 0.95));
    const peakRms = Math.max(noiseRms + 1, sortedEnergies[peakIndex]);
    const snrDb = Math.max(0, Math.round(20 * Math.log10(peakRms / noiseRms)));

    // Adaptive speech threshold: 2.5x noise floor or at least 450 RMS
    const speechThreshold = Math.max(450, noiseRms * 2.5);
    let speechFramesCount = 0;

    for (let f = 0; f < numFrames; f++) {
      if (frameEnergies[f] >= speechThreshold) {
        speechFramesCount++;
      }
    }

    const speechRatio = speechFramesCount / numFrames;
    const silenceRatio = 1.0 - speechRatio;
    const speechDetected = speechFramesCount >= 3 && speechRatio >= 0.06;

    // Quality Score calculation:
    // Factors: SNR (>15dB = great), clipping rate (<0.01 = great), valid duration (>300ms)
    let score = 0.5;
    if (snrDb >= 20) score += 0.25;
    else if (snrDb >= 10) score += 0.15;
    else if (snrDb < 5) score -= 0.2;

    if (clippingRate > 0.05) score -= 0.3;
    else if (clippingRate > 0.01) score -= 0.1;

    if (overallRms < 150) score -= 0.3; // extremely faint

    score = Math.max(0.05, Math.min(0.98, score));

    // Status classification
    let status: AudioQualityStatus = "OK";
    let reason: string | undefined;

    if (!speechDetected || silenceRatio > 0.94) {
      status = "NO_SPEECH";
      reason = "No energetic speech activity detected above background noise floor";
    } else if (clippingRate > 0.15 || snrDb < 4) {
      status = "LOW_AUDIO_QUALITY";
      reason = clippingRate > 0.15
        ? `Severe audio clipping detected (${(clippingRate * 100).toFixed(1)}% clipped)`
        : `Signal-to-noise ratio too low (${snrDb} dB SNR)`;
    }

    return {
      speechDetected,
      silenceRatio: Number(silenceRatio.toFixed(3)),
      speechRatio: Number(speechRatio.toFixed(3)),
      noiseLevelDb,
      snrDb,
      clippingRate: Number(clippingRate.toFixed(4)),
      sampleRate,
      durationMs,
      rmsEnergy: Math.round(overallRms),
      qualityScore: Number(score.toFixed(2)),
      status,
      reason,
    };
  }
}

export const audioQualityAnalyzer = new AudioQualityAnalyzer();
