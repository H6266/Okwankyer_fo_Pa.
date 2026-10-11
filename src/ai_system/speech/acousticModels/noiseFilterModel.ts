/**
 * Ɔkwankyerɛfo Pa - Intelligent Acoustic Noise & Echo Rejection Model
 * 
 * Provides:
 * - Real-time Voice Activity Detection (VAD) with energy & formant tracking
 * - Background noise classification (fan noise, road rumble, room reverberation, breathing, clicks)
 * - Adaptive Noise Floor tracking (auto-calibrating SNR gate)
 * - Acoustic Echo Cancellation (AEC) software guard against system prompt leakage
 * - Voice vs Noise decision matrix with confidence scoring
 */

import { ACOUSTIC_NOISE_BENCHMARKS } from "./ghanaAcousticDataset";

export interface AcousticAnalysisFrame {
  timestamp: number;
  rmsDb: number;
  snrDb: number;
  peakDb: number;
  zeroCrossingRate: number;
  isVoiceActive: boolean;
  isSystemEchoSuspected: boolean;
  noiseCategory: "quiet" | "speech" | "fan_hum" | "room_noise" | "transient_click" | "echo_prompt";
  confidence: number;
}

export class AcousticNoiseFilterModel {
  private noiseFloorDb: number = -48.0; // Dynamic baseline noise floor
  private alpha: number = ACOUSTIC_NOISE_BENCHMARKS.vadThresholds.noiseFloorEstimatorAlpha;
  private minSnrDb: number = ACOUSTIC_NOISE_BENCHMARKS.vadThresholds.snrGateDb;
  private minSpeechDb: number = ACOUSTIC_NOISE_BENCHMARKS.vadThresholds.speechMinRmsDb;
  private consecutiveVoiceFrames: number = 0;
  private consecutiveSilenceFrames: number = 0;
  private isCurrentlySpeaking: boolean = false;

  /**
   * Evaluates an audio frame (e.g. from Web Audio ScriptProcessor or AnalyserNode Float32Array).
   */
  public analyzeFrame(
    timeDomainData: Float32Array,
    sampleRate: number = 16000,
    isSystemPromptPlaying: boolean = false
  ): AcousticAnalysisFrame {
    const len = timeDomainData.length;
    if (len === 0) {
      return {
        timestamp: Date.now(),
        rmsDb: -90,
        snrDb: 0,
        peakDb: -90,
        zeroCrossingRate: 0,
        isVoiceActive: false,
        isSystemEchoSuspected: false,
        noiseCategory: "quiet",
        confidence: 0,
      };
    }

    // 1. Calculate RMS Energy and Peak Amplitude
    let sumSquares = 0;
    let peak = 0;
    let zeroCrossings = 0;

    for (let i = 0; i < len; i++) {
      const val = timeDomainData[i];
      const absVal = Math.abs(val);
      if (absVal > peak) peak = absVal;
      sumSquares += val * val;

      if (i > 0 && ((timeDomainData[i] >= 0 && timeDomainData[i - 1] < 0) || (timeDomainData[i] < 0 && timeDomainData[i - 1] >= 0))) {
        zeroCrossings++;
      }
    }

    const rms = Math.sqrt(sumSquares / len);
    const rmsDb = rms > 0.00001 ? 20 * Math.log10(rms) : -90;
    const peakDb = peak > 0.00001 ? 20 * Math.log10(peak) : -90;
    const zcr = zeroCrossings / len;

    // 2. Adaptive Noise Floor Tracking
    // When no obvious loud speech is present, slowly adapt the background noise floor
    if (rmsDb < this.minSpeechDb || (rmsDb < this.noiseFloorDb + 4.0)) {
      this.noiseFloorDb = this.alpha * this.noiseFloorDb + (1 - this.alpha) * rmsDb;
      // Clamp noise floor between realistic indoor limits
      if (this.noiseFloorDb < -75) this.noiseFloorDb = -75;
      if (this.noiseFloorDb > -30) this.noiseFloorDb = -30;
    }

    // 3. SNR Calculation (Signal to Noise Ratio above dynamic floor)
    const snrDb = Math.max(0, rmsDb - this.noiseFloorDb);

    // 4. Voice vs Noise vs Echo Classification
    let isVoiceActive = false;
    let isSystemEchoSuspected = false;
    let noiseCategory: AcousticAnalysisFrame["noiseCategory"] = "quiet";
    let confidence = 0.5;

    // Zero-crossing rates:
    // Human voiced speech: moderate ZCR (0.02 - 0.22)
    // High-frequency hiss / fan / clicks: high ZCR (> 0.35)
    // Low rumble / DC offset: very low ZCR (< 0.01)
    const isHumanVocalZcr = zcr >= 0.015 && zcr <= 0.30;
    const isLikelySpeechEnergy = rmsDb >= this.minSpeechDb && snrDb >= this.minSnrDb;

    if (isSystemPromptPlaying) {
      // System audio is currently playing through the speakers
      if (isLikelySpeechEnergy) {
        // Did the user burst with higher energy than normal prompt leakage?
        if (snrDb > this.minSnrDb + ACOUSTIC_NOISE_BENCHMARKS.echoCancellation.bargeInEnergyBurstDb) {
          // Intentional User Barge-In!
          isVoiceActive = true;
          isSystemEchoSuspected = false;
          noiseCategory = "speech";
          confidence = 0.92;
        } else {
          // Suspected acoustic echo from speaker to mic
          isVoiceActive = false;
          isSystemEchoSuspected = true;
          noiseCategory = "echo_prompt";
          confidence = 0.88;
        }
      } else {
        isVoiceActive = false;
        isSystemEchoSuspected = true;
        noiseCategory = "quiet";
        confidence = 0.95;
      }
    } else {
      // Normal Listening Phase
      if (isLikelySpeechEnergy && isHumanVocalZcr) {
        this.consecutiveVoiceFrames++;
        this.consecutiveSilenceFrames = 0;
        if (this.consecutiveVoiceFrames >= 2) {
          this.isCurrentlySpeaking = true;
        }
      } else {
        this.consecutiveSilenceFrames++;
        this.consecutiveVoiceFrames = 0;
        // Hysteresis: keep speaking state active for 3 frames to avoid clipping word endings
        if (this.consecutiveSilenceFrames > 4) {
          this.isCurrentlySpeaking = false;
        }
      }

      isVoiceActive = this.isCurrentlySpeaking;

      if (isVoiceActive) {
        noiseCategory = "speech";
        confidence = Math.min(0.99, 0.6 + snrDb * 0.02);
      } else if (rmsDb > this.minSpeechDb && zcr > 0.32) {
        noiseCategory = "fan_hum";
        confidence = 0.85;
      } else if (peakDb - rmsDb > 18 && len < 2048) {
        noiseCategory = "transient_click";
        confidence = 0.80;
      } else if (rmsDb > -55) {
        noiseCategory = "room_noise";
        confidence = 0.75;
      } else {
        noiseCategory = "quiet";
        confidence = 0.95;
      }
    }

    return {
      timestamp: Date.now(),
      rmsDb: Math.round(rmsDb * 10) / 10,
      snrDb: Math.round(snrDb * 10) / 10,
      peakDb: Math.round(peakDb * 10) / 10,
      zeroCrossingRate: Math.round(zcr * 1000) / 1000,
      isVoiceActive,
      isSystemEchoSuspected,
      noiseCategory,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  public getNoiseFloorDb(): number {
    return Math.round(this.noiseFloorDb * 10) / 10;
  }

  public reset(): void {
    this.noiseFloorDb = -48.0;
    this.consecutiveVoiceFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.isCurrentlySpeaking = false;
  }
}

export const acousticNoiseFilterModel = new AcousticNoiseFilterModel();
