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
import { repairGhanaianPronunciation } from "../ai_system/speech/asr/ghanaianPhoneticMatcher";

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

export interface SpokenWordToken {
  word: string;
  repaired?: string;
  isPhoneticMatch?: boolean;
  isFinal?: boolean;
  timestamp: number;
}

export type AudioStateListener = (state: ContinuousAudioState) => void;
export type FrequencyDataListener = (frequencies: Uint8Array, timeData: Float32Array) => void;
export type UtteranceListener = (utterance: string, parsedDiscussion: ParsedDiscussionState) => void;
export type WordTokenListener = (token: SpokenWordToken) => void;

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
  private wordTokenListeners: Set<WordTokenListener> = new Set();
  private lastStreamedWordCount: number = 0;

  private discussionAccumulator: string[] = [];
  private lastDispatchTime: number = 0;
  private isZeroPinMuted: boolean = false;

  private isPlaybackGated: boolean = false;
  private sentenceBuffer: string[] = [];
  private sentenceCompleteTimer: any = null;
  private readonly SENTENCE_END_SILENCE_MS: number = 2200;

  constructor() {
    // Listen to system audio playback to strictly keep the microphone OFF while prompt plays,
    // and automatically turn on the mic to record the user's need ONLY after the audio finishes playing.
    if (typeof window !== "undefined") {
      audioPlaybackController.subscribe((pState) => {
        if (pState.isPlaying) {
          if (pState.activeText) {
            this.activePromptText = pState.activeText;
          }
          this.pauseForPlayback();
        } else {
          const wasGated = this.isPlaybackGated;
          this.isPlaybackGated = false;
          setTimeout(() => {
            if (!audioPlaybackController.isSpeaking()) {
              this.activePromptText = "";
            }
          }, 500);
          if (wasGated && !this.isExplicitlyStopped && !this.isZeroPinMuted) {
            // Brief 150ms acoustic tail buffer so room reverb from the speaker isn't recorded
            setTimeout(() => {
              if (!audioPlaybackController.isSpeaking() && !this.isExplicitlyStopped && !this.isZeroPinMuted) {
                this.resumeAfterPlayback();
              }
            }, 150);
          }
        }
      });
    }
  }

  private clearSentenceTimer(): void {
    if (this.sentenceCompleteTimer) {
      clearTimeout(this.sentenceCompleteTimer);
      this.sentenceCompleteTimer = null;
    }
  }

  /**
   * Turns OFF microphone recording while system audio prompt is playing or after user finishes their sentence
   */
  public pauseForPlayback(): void {
    this.isPlaybackGated = true;
    this.clearSentenceTimer();
    this.sentenceBuffer = [];
    this.lastStreamedWordCount = 0;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    }
    this.updateState({
      isMicActive: false,
      isListening: false,
      isVoiceActive: false,
      currentInterimTranscript: "",
    });
  }

  /**
   * Automatically turns ON microphone recording right after prompt audio finishes playing
   */
  public resumeAfterPlayback(): void {
    this.isPlaybackGated = false;
    this.clearSentenceTimer();
    this.sentenceBuffer = [];
    this.lastStreamedWordCount = 0;
    if (this.isExplicitlyStopped || this.isZeroPinMuted || audioPlaybackController.isSpeaking()) return;
    this.updateState({
      isMicActive: true,
      isListening: true,
      currentInterimTranscript: "",
    });
    this.startContinuousSpeechRecognition();
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

  public subscribeWordToken(listener: WordTokenListener): () => void {
    this.wordTokenListeners.add(listener);
    return () => this.wordTokenListeners.delete(listener);
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
   * Initializes microphone and Web Audio DSP pipeline.
   * If system audio is currently playing, keeps mic OFF until playback ends.
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

      // 3. Only turn on Speech Recognition if system prompt is NOT playing
      if (!audioPlaybackController.isSpeaking()) {
        this.updateState({
          isMicActive: true,
          isPermissionGranted: Boolean(this.mediaStream),
          isListening: true,
        });
        this.startContinuousSpeechRecognition();
      } else {
        this.updateState({
          isPermissionGranted: Boolean(this.mediaStream),
        });
        this.pauseForPlayback();
      }

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

        // Update state (while system prompt is playing or mic is gated, voice active is false)
        const canListen = !isSystemPlaying && !this.isPlaybackGated && !this.isZeroPinMuted;
        this.updateState({
          rmsDb: frame.rmsDb,
          snrDb: frame.snrDb,
          noiseFloorDb: acousticNoiseFilterModel.getNoiseFloorDb(),
          isVoiceActive: frame.isVoiceActive && canListen,
          isSystemEchoBlocked: isSystemPlaying || frame.isSystemEchoSuspected,
          noiseCategory: frame.noiseCategory,
        });
      }

      this.animationFrameId = requestAnimationFrame(analyze);
    };

    this.animationFrameId = requestAnimationFrame(analyze);
  }

  /**
   * Finalizes the user's complete sentence after they finish speaking,
   * automatically turns the microphone OFF so no stray background noise is recorded,
   * and dispatches the complete sentence.
   */
  private finalizeAndCommitUserSentence(pendingInterim: string = ""): void {
    this.clearSentenceTimer();
    const combinedRaw = [...this.sentenceBuffer, pendingInterim]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ")
      .trim();

    this.sentenceBuffer = [];
    this.lastStreamedWordCount = 0;

    if (!combinedRaw) return;

    // Strip any residual system prompt prefix
    const cleaned = stripSystemEchoFromTranscript(combinedRaw, this.activePromptText);
    if (!cleaned) {
      this.updateState({ currentInterimTranscript: "" });
      return;
    }

    // Phonetic and Ghanaian acoustic dataset repair with numeral normalization
    const normalizedFinal = normalizeSpokenDigits(cleaned);
    const repaired = repairNoisyAcousticTranscript(normalizedFinal, this.activeStepName);
    const phonetic = repairGhanaianPronunciation(repaired.repairedText);
    const effectiveText = (phonetic.normalizedTranscript || repaired.repairedText).trim();
    if (!effectiveText) return;

    // Automatically turn the microphone OFF now that the user has finished their sentence!
    // It will automatically turn back ON after the next system prompt finishes playing.
    this.isPlaybackGated = true;
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
    }

    // Notify word token listeners of final sentence completion
    const finalWords = effectiveText.split(/\s+/).filter(Boolean);
    finalWords.forEach((fw) => {
      const token: SpokenWordToken = {
        word: fw,
        isFinal: true,
        timestamp: Date.now(),
      };
      this.wordTokenListeners.forEach((fn) => {
        try { fn(token); } catch {}
      });
    });

    // Accumulate into discussion buffer for long conversation comprehension
    this.discussionAccumulator.push(effectiveText);
    const fullDiscussion = this.discussionAccumulator.join(" ");

    const parsedDiscussion = parseLongDiscussion(
      fullDiscussion,
      this.activeStepName
    );

    this.updateState({
      isMicActive: false,
      isListening: false,
      isVoiceActive: false,
      currentInterimTranscript: "",
      finalizedTranscript: effectiveText,
      lastParsedDiscussion: parsedDiscussion,
    });

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

  /**
   * Continuous Web Speech Recognition with full-sentence accumulation.
   * Waits until the user has finished their entire sentence (2.2s pause window)
   * before turning the mic off and submitting.
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
        if (!this.isPlaybackGated && !this.isZeroPinMuted && !audioPlaybackController.isSpeaking()) {
          this.updateState({ isMicActive: true, isListening: true });
        }
      };

      recognition.onresult = (event: any) => {
        // Strictly ignore any recognition while system audio is playing or mic is gated
        if (this.isZeroPinMuted || this.isPlaybackGated || audioPlaybackController.isSpeaking()) return;

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
        const isSpeaking = audioPlaybackController.isSpeaking();
        if (interimStr) {
          if (isAcousticSystemEcho(interimStr, this.activePromptText, isSpeaking)) {
            this.updateState({ isSystemEchoBlocked: true });
            return;
          }

          const normalizedInterim = normalizeSpokenDigits(interimStr);
          const fullPreview = [...this.sentenceBuffer, normalizedInterim].filter(Boolean).join(" ").trim();
          this.updateState({ currentInterimTranscript: fullPreview, isSystemEchoBlocked: false });

          // Stream individual word tokens to subscribers for real-time word-by-word transcription
          const interimWords = fullPreview.split(/\s+/).filter(Boolean);
          if (interimWords.length > this.lastStreamedWordCount) {
            for (let wIdx = this.lastStreamedWordCount; wIdx < interimWords.length; wIdx++) {
              const rawWord = interimWords[wIdx];
              const phonetic = repairGhanaianPronunciation(rawWord);
              const isMatch = phonetic.repairedWords.length > 0;
              const token: SpokenWordToken = {
                word: rawWord,
                repaired: isMatch ? phonetic.normalizedTranscript : undefined,
                isPhoneticMatch: isMatch,
                isFinal: false,
                timestamp: Date.now(),
              };
              this.wordTokenListeners.forEach((fn) => {
                try { fn(token); } catch {}
              });
            }
            this.lastStreamedWordCount = interimWords.length;
          }

          // Instant ASR Proceed Triggers:
          // 1. Recipient phone number: proceed immediately at the 10th digit!
          if (this.activeStepName === "enter-recipient" || this.activeStepName === "enter_recipient_2") {
            const digits = fullPreview.replace(/\D/g, "");
            if (digits.length >= 10) {
              this.clearSentenceTimer();
              this.finalizeAndCommitUserSentence(fullPreview);
              return;
            }
          }

          // 2. PIN handoff (between 11 and 12): proceed immediately right after the 4th digit!
          if (this.activeStepName === "pin-handoff" || this.activeStepName === "pin_handoff") {
            const pinDigits = fullPreview.replace(/\D/g, "");
            if (pinDigits.length >= 4) {
              this.clearSentenceTimer();
              this.finalizeAndCommitUserSentence(fullPreview);
              return;
            }
          }

          // Reset the sentence completion timer every time the user speaks another word,
          // so we NEVER cut the user off in the middle of a sentence!
          this.clearSentenceTimer();
          this.sentenceCompleteTimer = setTimeout(() => {
            this.finalizeAndCommitUserSentence(normalizedInterim);
          }, this.SENTENCE_END_SILENCE_MS);
        }

        // 2. Finalized chunk from browser SpeechRecognition:
        // Append to sentenceBuffer and wait for the sentence silence window before turning off the mic,
        // so if the user pauses briefly mid-sentence, they can keep speaking without being cut off.
        if (finalStr) {
          if (isAcousticSystemEcho(finalStr, this.activePromptText, isSpeaking)) {
            this.updateState({
              currentInterimTranscript: "",
              isSystemEchoBlocked: true,
            });
            return;
          }

          const cleaned = stripSystemEchoFromTranscript(finalStr, this.activePromptText);
          if (cleaned) {
            const normalizedChunk = normalizeSpokenDigits(cleaned);
            this.sentenceBuffer.push(normalizedChunk);
            const accumulatedPreview = this.sentenceBuffer.join(" ").trim();
            this.updateState({
              currentInterimTranscript: accumulatedPreview,
              isSystemEchoBlocked: false,
            });

            // Instant ASR Proceed Triggers in final chunk:
            // 1. Recipient phone number: proceed immediately at the 10th digit!
            if (this.activeStepName === "enter-recipient" || this.activeStepName === "enter_recipient_2") {
              const digits = accumulatedPreview.replace(/\D/g, "");
              if (digits.length >= 10) {
                this.clearSentenceTimer();
                this.finalizeAndCommitUserSentence("");
                return;
              }
            }

            // 2. PIN handoff (between 11 and 12): proceed immediately right after the 4th digit!
            if (this.activeStepName === "pin-handoff" || this.activeStepName === "pin_handoff") {
              const pinDigits = accumulatedPreview.replace(/\D/g, "");
              if (pinDigits.length >= 4) {
                this.clearSentenceTimer();
                this.finalizeAndCommitUserSentence("");
                return;
              }
            }

            this.clearSentenceTimer();
            this.sentenceCompleteTimer = setTimeout(() => {
              this.finalizeAndCommitUserSentence("");
            }, this.SENTENCE_END_SILENCE_MS);
          }
        }
      };

      recognition.onerror = (e: any) => {
        // Silently handle transient errors (no-speech, network) and maintain listening until user speaks
        if (e.error === "no-speech") {
          return;
        }
        if (e.error === "not-allowed" || e.error === "permission-denied") {
          this.updateState({ isPermissionGranted: false, isMicActive: false });
        }
      };

      recognition.onend = () => {
        // Keep-Alive Loop: While waiting for the user to finish their sentence, keep recognition alive
        if (!this.isExplicitlyStopped && !this.isZeroPinMuted && !this.isPlaybackGated && !audioPlaybackController.isSpeaking()) {
          setTimeout(() => {
            if (!this.isExplicitlyStopped && !this.isZeroPinMuted && !this.isPlaybackGated && !audioPlaybackController.isSpeaking()) {
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
