/**
 * Ɔkwankyerɛfo Pa - Always-On Continuous Audio & Speech Engine (continuousAudioEngine.ts)
 * 
 * Features:
 * - Always-On continuous microphone stream with automatic keep-alive
 * - Web Audio API DSP pipeline (80Hz High-Pass, Formant Bandpass, Compressor)
 * - Real-Time Voice Activity Detection (VAD) & Adaptive Noise Gate
 * - Hardware + Software Acoustic Echo Cancellation (AEC) protecting against system prompt feedback
 * - Multi-dialect acoustic repair distilled from Mozilla Common Voice & FLEURS
 * - Continuous long-conversation sentence aggregator
 * - Real-time frequency spectrum data for the innovative visualizer
 */

import { acousticNoiseFilterModel, AcousticAnalysisFrame } from "../ai_system/speech/acousticModels/noiseFilterModel";
import { repairNoisyAcousticTranscript, normalizeSpokenDigits } from "../ai_system/speech/acousticModels/ghanaAcousticDataset";
import { isAcousticSystemEcho, stripSystemEchoFromTranscript } from "../domain/echoFilter";
import { parseLongDiscussion, ParsedDiscussionState } from "../ai_system/brain/longDiscussionParser";
import { audioPlaybackController } from "./audioPlaybackController";

export interface ContinuousAudioState {
  isMicActive: boolean;
  isPermissionGranted: boolean;
  isListening: boolean;
  isVoiceActive: boolean;
  isSystemEchoBlocked: boolean;
  rmsDb: number;
  snrDb: number;
  noiseFloorDb: number;
  noiseCategory: AcousticAnalysisFrame["noiseCategory"];
  currentInterimTranscript: string;
  finalizedTranscript: string;
  lastParsedDiscussion: ParsedDiscussionState | null;
  datasetModel: string;
}

export type AudioStateListener = (state: ContinuousAudioState) => void;
export type FrequencyDataListener = (frequencies: Uint8Array, timeData: Float32Array) => void;
export type UtteranceListener = (utterance: string, parsedDiscussion: ParsedDiscussionState) => void;

export class ContinuousAudioEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private filterHighPass: BiquadFilterNode | null = null;
  private filterLowPass: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private animationFrameId: number | null = null;

  private recognition: any = null;
  private isExplicitlyStopped: boolean = false;
  private currentLanguage: "en" | "twi" = "en";
  private activeStepName: string = "idle";
  private activePromptText: string = "";

  private timeBuffer: Float32Array = new Float32Array(1024);
  private freqBuffer: Uint8Array = new Uint8Array(64);

  private state: ContinuousAudioState = {
    isMicActive: false,
    isPermissionGranted: false,
    isListening: false,
    isVoiceActive: false,
    isSystemEchoBlocked: false,
    rmsDb: -60,
    snrDb: 0,
    noiseFloorDb: -48,
    noiseCategory: "quiet",
    currentInterimTranscript: "",
    finalizedTranscript: "",
    lastParsedDiscussion: null,
    datasetModel: "Mozilla Common Voice + FLEURS + GhanaNLP",
  };

  private stateListeners: Set<AudioStateListener> = new Set();
  private freqListeners: Set<FrequencyDataListener> = new Set();
  private utteranceListeners: Set<UtteranceListener> = new Set();

  private discussionAccumulator: string[] = [];
  private lastDispatchTime: number = 0;
  private isZeroPinMuted: boolean = false;

  constructor() {
    // Listen to system audio playback to dynamically coordinate echo cancellation
    if (typeof window !== "undefined") {
      audioPlaybackController.subscribe((pState) => {
        if (pState.isPlaying && pState.activeText) {
          this.activePromptText = pState.activeText;
        } else if (!pState.isPlaying) {
          this.activePromptText = "";
        }
      });
    }
  }

  public subscribeState(listener: AudioStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public subscribeFrequencies(listener: FrequencyDataListener): () => void {
    this.freqListeners.add(listener);
    return () => this.freqListeners.delete(listener);
  }

  public subscribeUtterance(listener: UtteranceListener): () => void {
    this.utteranceListeners.add(listener);
    return () => this.utteranceListeners.delete(listener);
  }

  private updateState(partial: Partial<ContinuousAudioState>): void {
    this.state = { ...this.state, ...partial };
    this.stateListeners.forEach((fn) => {
      try {
        fn(this.state);
      } catch {}
    });
  }

  /**
   * Initializes Always-On microphone and Web Audio DSP pipeline.
   */
  public async startAlwaysOnMic(language: "en" | "twi" = "en", stepName: string = "idle"): Promise<boolean> {
    this.isExplicitlyStopped = false;
    this.currentLanguage = language;
    this.activeStepName = stepName;

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }

    try {
      // 1. Hardware Echo Cancellation & Noise Suppression Request with resilient fallback
      if (!this.mediaStream) {
        try {
          this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch {
          try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (micErr) {
            console.warn("[ContinuousAudio] Direct mic stream unavailable, proceeding with speech recognition:", micErr);
          }
        }
      }

      this.updateState({
        isMicActive: true,
        isPermissionGranted: Boolean(this.mediaStream),
        isListening: true,
      });

      // 2. Setup Web Audio DSP Graph if stream is active
      if (this.mediaStream) {
        try {
          if (!this.audioContext || this.audioContext.state === "closed") {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            this.audioContext = new AudioCtx();
          }

          if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
          }

          if (!this.sourceNode && this.mediaStream) {
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

            // High-pass filter at 80Hz (eliminates DC offset, AC rumbles, mic handling thumps)
            this.filterHighPass = this.audioContext.createBiquadFilter();
            this.filterHighPass.type = "highpass";
            this.filterHighPass.frequency.setValueAtTime(80, this.audioContext.currentTime);

            // Low-pass filter at 4000Hz (standard telephony human vocal bandwidth)
            this.filterLowPass = this.audioContext.createBiquadFilter();
            this.filterLowPass.type = "lowpass";
            this.filterLowPass.frequency.setValueAtTime(4000, this.audioContext.currentTime);

            // Dynamics Compressor
            this.compressorNode = this.audioContext.createDynamicsCompressor();
            this.compressorNode.threshold.setValueAtTime(-24, this.audioContext.currentTime);
            this.compressorNode.knee.setValueAtTime(12, this.audioContext.currentTime);
            this.compressorNode.ratio.setValueAtTime(4, this.audioContext.currentTime);
            this.compressorNode.attack.setValueAtTime(0.003, this.audioContext.currentTime);
            this.compressorNode.release.setValueAtTime(0.25, this.audioContext.currentTime);

            // Analyser Node for FFT and Oscilloscope Time Data
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 256;
            this.analyserNode.smoothingTimeConstant = 0.75;

            // Connect graph: Source -> HighPass -> LowPass -> Compressor -> Analyser
            this.sourceNode.connect(this.filterHighPass);
            this.filterHighPass.connect(this.filterLowPass);
            this.filterLowPass.connect(this.compressorNode);
            this.compressorNode.connect(this.analyserNode);
          }

          // Start Real-Time Analysis Loop
          this.startAnalysisLoop();
        } catch (audioErr) {
          console.warn("[ContinuousAudio] DSP pipeline init error:", audioErr);
        }
      }

      // 3. Always Start Continuous Web Speech Recognition
      this.startContinuousSpeechRecognition();

      return true;
    } catch (err) {
      console.warn("[ContinuousAudio] Mic init warning:", err);
      this.updateState({
        isMicActive: false,
        isListening: false,
      });
      return false;
    }
  }

  /**
   * Real-time analysis frame for VAD, noise level, and visualizer.
   */
  private startAnalysisLoop(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const analyze = () => {
      if (this.isExplicitlyStopped) return;

      if (this.analyserNode) {
        this.analyserNode.getFloatTimeDomainData(this.timeBuffer);
        this.analyserNode.getByteFrequencyData(this.freqBuffer);

        const isSystemPlaying = audioPlaybackController.isSpeaking();
        const frame = acousticNoiseFilterModel.analyzeFrame(
          this.timeBuffer,
          this.audioContext?.sampleRate || 16000,
          isSystemPlaying
        );

        // Notify frequency listeners for the real-time visualizer
        this.freqListeners.forEach((fn) => {
          try {
            fn(this.freqBuffer, this.timeBuffer);
          } catch {}
        });

        // Update state
        this.updateState({
          rmsDb: frame.rmsDb,
          snrDb: frame.snrDb,
          noiseFloorDb: acousticNoiseFilterModel.getNoiseFloorDb(),
          isVoiceActive: frame.isVoiceActive && !this.isZeroPinMuted,
          isSystemEchoBlocked: frame.isSystemEchoSuspected,
          noiseCategory: frame.noiseCategory,
        });

        // Intentional Barge-In detection: If user speaks over system prompt, stop prompt immediately!
        if (isSystemPlaying && frame.isVoiceActive && !this.isZeroPinMuted) {
          audioPlaybackController.stop();
        }
      }

      this.animationFrameId = requestAnimationFrame(analyze);
    };

    this.animationFrameId = requestAnimationFrame(analyze);
  }

  /**
   * Continuous Web Speech Recognition with resilient keep-alive loop.
   */
  private startContinuousSpeechRecognition(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    try {
      if (this.recognition) {
        try {
          this.recognition.abort();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      // Use universal en-US language for reliable recognition across all Chrome and Chromium builds
      recognition.lang = "en-US";

      recognition.onstart = () => {
        this.updateState({ isListening: true });
      };

      recognition.onresult = (event: any) => {
        if (this.isZeroPinMuted) return; // Strict Zero-PIN privacy boundary

        let interimStr = "";
        let finalStr = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcriptChunk = res[0]?.transcript || "";
          if (res.isFinal) {
            finalStr += " " + transcriptChunk;
          } else {
            interimStr += " " + transcriptChunk;
          }
        }

        interimStr = interimStr.trim();
        finalStr = finalStr.trim();

        // 1. Acoustic Echo Cancellation check: Ignore system prompts echoing into mic
        // 1. Acoustic Echo Cancellation check: Ignore system prompts echoing into mic
        const isSpeaking = audioPlaybackController.isSpeaking();
        if (interimStr) {
          if (isAcousticSystemEcho(interimStr, this.activePromptText, isSpeaking)) {
            this.updateState({ isSystemEchoBlocked: true });
            return;
          }

          // User spoke: Immediate barge-in stop of system prompt
          if (isSpeaking) {
            audioPlaybackController.stop();
          }

          // Phonetically normalize spoken digits ("one" -> "1", "won" -> "1", "baako" -> "1")
          const normalizedInterim = normalizeSpokenDigits(interimStr);
          this.updateState({ currentInterimTranscript: normalizedInterim, isSystemEchoBlocked: false });

          // Fast-path: Instant dispatch on clear numeric digits or menu keywords (0ms latency)
          const lowerInterim = normalizedInterim.toLowerCase().trim();
          const isInstantCmd = /^(?:[0-9]|one|won|wan|two|too|three|tree|four|five|six|seven|eight|nine|zero|english|twi|akan|baako|mmienu|mmiɛnsa|send money|mane sika|confirm|pene so|yes|aane|no|dabi|cancel|back|repeat)$/i.test(lowerInterim);
          const now = Date.now();
          if (isInstantCmd && now - this.lastDispatchTime > 250) {
            this.lastDispatchTime = now;
            const repaired = repairNoisyAcousticTranscript(normalizedInterim, this.activeStepName);
            const parsed = parseLongDiscussion(repaired.repairedText, this.activeStepName);
            this.updateState({
              currentInterimTranscript: "",
              finalizedTranscript: repaired.repairedText,
              lastParsedDiscussion: parsed,
            });
            this.utteranceListeners.forEach((fn) => {
              try {
                fn(repaired.repairedText, parsed);
              } catch {}
            });
            return;
          }
        }

        // 2. Finalized Utterance Processing
        if (finalStr) {
          // Check system echo
          if (isAcousticSystemEcho(finalStr, this.activePromptText, isSpeaking)) {
            this.updateState({
              currentInterimTranscript: "",
              isSystemEchoBlocked: true,
            });
            return;
          }

          // Strip any residual system prompt prefix
          const cleaned = stripSystemEchoFromTranscript(finalStr, this.activePromptText);
          if (!cleaned) {
            this.updateState({ currentInterimTranscript: "" });
            return;
          }

          // Phonetic and Ghanaian acoustic dataset repair with numeral normalization
          const normalizedFinal = normalizeSpokenDigits(cleaned);
          const repaired = repairNoisyAcousticTranscript(normalizedFinal, this.activeStepName);
          const effectiveText = repaired.repairedText;

          // Accumulate into discussion buffer for long conversation comprehension
          this.discussionAccumulator.push(effectiveText);
          const fullDiscussion = this.discussionAccumulator.join(" ");

          const parsedDiscussion = parseLongDiscussion(
            fullDiscussion,
            this.activeStepName
          );

          this.updateState({
            currentInterimTranscript: "",
            finalizedTranscript: effectiveText,
            lastParsedDiscussion: parsedDiscussion,
          });

          // Debounce rapid repeats (fast 250ms threshold)
          const now = Date.now();
          if (now - this.lastDispatchTime > 250) {
            this.lastDispatchTime = now;
            this.utteranceListeners.forEach((fn) => {
              try {
                fn(effectiveText, parsedDiscussion);
              } catch {}
            });
          }
        }
      };

      recognition.onerror = (e: any) => {
        // Silently handle transient errors (no-speech, network) and maintain always-on state
        if (e.error === "no-speech") {
          // Normal pause in conversation; do NOT terminate mic!
          return;
        }
        if (e.error === "not-allowed" || e.error === "permission-denied") {
          this.updateState({ isPermissionGranted: false, isMicActive: false });
        }
      };

      recognition.onend = () => {
        // Always-On Keep-Alive Loop: If not explicitly stopped, restart immediately!
        if (!this.isExplicitlyStopped && !this.isZeroPinMuted) {
          setTimeout(() => {
            if (!this.isExplicitlyStopped && !this.isZeroPinMuted) {
              try {
                recognition.start();
              } catch {}
            }
          }, 40);
        }
      };

      recognition.start();
      this.recognition = recognition;
    } catch (err) {
      console.warn("[ContinuousAudio] SpeechRecognition start error:", err);
    }
  }

  /**
   * Sets current step context for phonetics and language.
   */
  public setContext(stepName: string, language: "en" | "twi"): void {
    this.activeStepName = stepName;
    if (this.currentLanguage !== language) {
      this.currentLanguage = language;
      if (this.recognition) {
        try {
          this.recognition.lang = language === "twi" ? "ak-GH" : "en-GH";
        } catch {}
      }
    }
  }

  /**
   * Enforces Zero-PIN muting boundary: strictly mutes during PIN handoff.
   */
  public setZeroPinMuted(muted: boolean): void {
    this.isZeroPinMuted = muted;
    if (muted && this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    } else if (!muted && !this.isExplicitlyStopped) {
      this.startContinuousSpeechRecognition();
    }
  }

  /**
   * Directly processes a spoken utterance into the pipeline.
   * Enables immediate acoustic normalization, entity parsing, and dispatch.
   */
  public simulateSpokenUtterance(rawText: string): void {
    const cleaned = rawText.trim();
    if (!cleaned) return;

    // 1. Immediate barge-in stop of playing prompt
    audioPlaybackController.stop();

    // 2. Phonetically normalize spoken digits ("one" -> "1", "baako" -> "1")
    const normalized = normalizeSpokenDigits(cleaned);

    // 3. Ghanaian acoustic & phonetic repair
    const repaired = repairNoisyAcousticTranscript(normalized, this.activeStepName);
    const effectiveText = repaired.repairedText;

    // 4. Long discussion accumulator
    this.discussionAccumulator.push(effectiveText);
    const fullDiscussion = this.discussionAccumulator.join(" ");
    const parsedDiscussion = parseLongDiscussion(fullDiscussion, this.activeStepName);

    this.updateState({
      currentInterimTranscript: "",
      finalizedTranscript: effectiveText,
      lastParsedDiscussion: parsedDiscussion,
    });

    // 5. Dispatch to all active utterance listeners
    this.utteranceListeners.forEach((fn) => {
      try {
        fn(effectiveText, parsedDiscussion);
      } catch {}
    });
  }

  /**
   * Resets the long discussion conversation accumulator for a new call or transaction.
   */
  public resetDiscussionBuffer(): void {
    this.discussionAccumulator = [];
    this.updateState({
      currentInterimTranscript: "",
      finalizedTranscript: "",
      lastParsedDiscussion: null,
    });
  }

  /**
   * Clean shutdown of audio resources when navigating away.
   */
  public stop(): void {
    this.isExplicitlyStopped = true;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.updateState({
      isMicActive: false,
      isListening: false,
      isVoiceActive: false,
    });
  }
}

export const continuousAudioEngine = new ContinuousAudioEngine();
