/**
 * Ɔkwankyerɛfo Pa - Continuous Conversational Voice Capture (continuousVoiceCapture.ts)
 * 
 * Manages the real browser microphone pipeline:
 * - Real 16 kHz mono PCM capture via AudioWorklet (with ScriptProcessor fallback)
 * - Intelligent Voice Activity Detection (AdaptiveStreamingVad)
 * - True Conversational Barge-In (detecting caller voice while assistant speaks)
 * - Automatic turn endpointing without manual button clicks
 * - Automatic track recovery on unexpected device disconnect
 * - Full telemetry exposing genuine frame and audio byte counters
 */

import { AdaptiveStreamingVad, DEFAULT_VAD_CONFIG, VadAnalysisResult } from "../../ai_system/speech/asr/audioQuality";
import { emitSimulatorLog } from "../simulatorLog";

export type MicrophoneState =
  | "MIC_UNAVAILABLE"
  | "MIC_PERMISSION_REQUIRED"
  | "MIC_STARTING"
  | "MIC_ACTIVE"
  | "MIC_MUTED"
  | "MIC_INTERRUPTED"
  | "MIC_RECOVERING"
  | "MIC_STOPPED";

export interface VoiceTelemetry {
  micPermission: "granted" | "denied" | "prompt" | "unknown";
  micActive: boolean;
  streamActive: boolean;
  audioContextState: string;
  sampleRate: number;
  channels: number;
  framesReceived: number;
  bytesReceived: number;
  speechFrames: number;
  noiseFrames: number;
  speechDurationMs: number;
  noiseDurationMs: number;
  currentVADState: "SPEECH" | "SILENCE" | "NOISE_ADAPTING";
  currentASRProvider: string;
  chunksCreated: number;
  chunksCompleted: number;
  chunksFailed: number;
  lastTranscript: string;
  lastFinalTranscript: string;
  lastASRLatencyMs: number;
  averageASRLatencyMs: number;
  p95ASRLatencyMs: number;
  bargeIns: number;
  fallbackCount: number;
}

export interface ContinuousVoiceCaptureCallbacks {
  onStateChange: (state: MicrophoneState, reason?: string, errorName?: string) => void;
  onAudioLevel: (level: number) => void;
  onVadUpdate: (vad: VadAnalysisResult) => void;
  onUtteranceComplete: (wavBase64: string, durationMs: number) => void;
  onBargeIn: () => void;
  onTelemetryUpdate: (telemetry: VoiceTelemetry) => void;
  onDiscard?: (reason: string) => void;
  onNoAudioFlowing?: (message: string) => void;
}

export const VOICE_DEBUG = true;

export function logVoiceDebug(...args: any[]): void {
  if (VOICE_DEBUG) {
    console.debug(...args);
  }
}

/**
 * Encodes 16-bit PCM buffer into standard WAV with 44-byte header.
 */
export function encodePcmToWav(pcm16: Int16Array, sampleRate: number = 16000): ArrayBuffer {
  const byteRate = sampleRate * 2; // 16-bit mono
  const dataSize = pcm16.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF identifier 'RIFF'
  view.setUint32(0, 0x52494646, false);
  // file length
  view.setUint32(4, 36 + dataSize, true);
  // 'WAVE'
  view.setUint32(8, 0x57415645, false);
  // 'fmt ' chunk
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  // 'data' chunk
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < pcm16.length; i++) {
    view.setInt16(offset, pcm16[i], true);
    offset += 2;
  }

  return buffer;
}

/**
 * Converts ArrayBuffer to Base64 string safely
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  return window.btoa(binary);
}

export class ContinuousVoiceCapture {
  private callbacks: ContinuousVoiceCaptureCallbacks;
  private state: MicrophoneState = "MIC_STOPPED";
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private vad: AdaptiveStreamingVad;

  // Utterance accumulation
  private utteranceChunks: Int16Array[] = [];
  private utteranceSampleCount: number = 0;
  private isAiSpeaking: boolean = false;
  private isMuted: boolean = false;
  private retryAttempts: number = 0;
  private maxRetries: number = 3;
  private hasReceivedFirstFrame: boolean = false;
  private noAudioTimer: any = null;
  private lastErrorName: string | null = null;

  // 500ms PCM ring buffer (8000 samples at 16kHz) to preserve speech onset before barge-in trigger
  private ringBuffer: Int16Array[] = [];
  private ringBufferSampleCount: number = 0;
  private readonly RING_BUFFER_MAX_SAMPLES: number = 8000;

  // Configurable thresholds per step type
  private minUtteranceMs: number = 700;
  private minSpeechMs: number = 700;
  private bargeInThresholdMs: number = 140;
  private lastVadSummaryLogTime: number = 0;

  // Telemetry state
  private telemetry: VoiceTelemetry = {
    micPermission: "unknown",
    micActive: false,
    streamActive: false,
    audioContextState: "closed",
    sampleRate: 16000,
    channels: 1,
    framesReceived: 0,
    bytesReceived: 0,
    speechFrames: 0,
    noiseFrames: 0,
    speechDurationMs: 0,
    noiseDurationMs: 0,
    currentVADState: "SILENCE",
    currentASRProvider: "GhanaNLP_ASR_v3",
    chunksCreated: 0,
    chunksCompleted: 0,
    chunksFailed: 0,
    lastTranscript: "",
    lastFinalTranscript: "",
    lastASRLatencyMs: 0,
    averageASRLatencyMs: 0,
    p95ASRLatencyMs: 0,
    bargeIns: 0,
    fallbackCount: 0,
  };

  constructor(callbacks: ContinuousVoiceCaptureCallbacks) {
    this.callbacks = callbacks;
    this.vad = new AdaptiveStreamingVad();
  }

  public getState(): MicrophoneState {
    return this.state;
  }

  public getLastErrorName(): string | null {
    return this.lastErrorName;
  }

  public getTelemetry(): VoiceTelemetry {
    return { ...this.telemetry };
  }

  public setAiSpeaking(speaking: boolean): void {
    this.isAiSpeaking = speaking;
  }

  public setStepType(stepType: string): void {
    const isSingleDigit =
      stepType === "single_digit" ||
      stepType === "welcome" ||
      stepType === "voice-menu" ||
      stepType === "language-selection" ||
      stepType === "service-select" ||
      stepType === "provider-select" ||
      stepType === "action-select" ||
      stepType === "recipient-verify-choice" ||
      stepType === "safe-confirmation";

    this.minUtteranceMs = isSingleDigit ? 250 : 700;
    this.minSpeechMs = isSingleDigit ? 250 : 700;
    this.bargeInThresholdMs = isSingleDigit ? 80 : 140;
    this.vad.setMinSpeechMs(this.minSpeechMs);
    this.vad.setEndSilenceMs(isSingleDigit ? 350 : 650);
    logVoiceDebug(`[VOICE] setStepType: step="${stepType}", isSingleDigit=${isSingleDigit}, minUtteranceMs=${this.minUtteranceMs}, bargeInThresholdMs=${this.bargeInThresholdMs}`);
  }

  public getEndSilenceMs(): number {
    return this.vad.getEndSilenceMs();
  }

  /**
   * Directly feeds a PCM Int16 frame into the capture/VAD pipeline (used in testing and audio processors)
   */
  public feedPcmFrame(pcm16: Int16Array): void {
    this.handlePcmFrame(pcm16);
  }

  public setMinUtteranceMs(ms: number): void {
    this.minUtteranceMs = ms;
    this.minSpeechMs = ms;
    this.vad.setMinSpeechMs(ms);
    logVoiceDebug(`[VOICE] setMinUtteranceMs: ms=${ms}`);
  }

  public getMinUtteranceMs(): number {
    return this.minUtteranceMs;
  }

  private pushToRingBuffer(pcm16: Int16Array): void {
    this.ringBuffer.push(pcm16);
    this.ringBufferSampleCount += pcm16.length;
    while (this.ringBufferSampleCount > this.RING_BUFFER_MAX_SAMPLES && this.ringBuffer.length > 0) {
      const removed = this.ringBuffer.shift();
      if (removed) {
        this.ringBufferSampleCount -= removed.length;
      }
    }
  }

  public updateTelemetry(partial: Partial<VoiceTelemetry>): void {
    this.telemetry = { ...this.telemetry, ...partial };
    this.callbacks.onTelemetryUpdate(this.telemetry);
  }

  /**
   * Probes microphone capability and permission status
   */
  public async probePermission(): Promise<"granted" | "denied" | "prompt" | "unsupported"> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.setState("MIC_UNAVAILABLE", "navigator.mediaDevices.getUserMedia is not supported");
      return "unsupported";
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
        this.telemetry.micPermission = p.state;
        if (p.state === "granted") {
          return "granted";
        }
        if (p.state === "denied") {
          this.setState("MIC_UNAVAILABLE", "Microphone permission has been blocked by browser/iframe.");
          return "denied";
        }
        this.setState("MIC_PERMISSION_REQUIRED", "First-use microphone permission required.");
        return "prompt";
      } catch {
        // Permissions query not supported for microphone on some browsers
      }
    }

    this.setState("MIC_PERMISSION_REQUIRED");
    return "prompt";
  }

  /**
   * Starts the continuous voice pipeline with real microphone audio
   */
  public async start(): Promise<boolean> {
    if (this.state === "MIC_ACTIVE" || this.state === "MIC_STARTING") {
      return true;
    }

    // 1. Secure context check
    const isSecure = typeof window !== "undefined" ? window.isSecureContext : false;
    emitSimulatorLog({
      category: "MIC",
      message: `Secure context check: isSecureContext=${isSecure}`,
    });
    console.log(`[MIC] Secure context check: isSecureContext=${isSecure}`);

    if (typeof window !== "undefined" && window.isSecureContext === false) {
      const msg = "Insecure context: Microphone requires HTTPS or localhost. Please access the app over HTTPS.";
      this.lastErrorName = "InsecureContextError";
      this.setState("MIC_UNAVAILABLE", msg, "InsecureContextError");
      emitSimulatorLog({
        category: "ERROR",
        message: msg,
      });
      return false;
    }

    // 2. Check navigator.mediaDevices presence
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = "Microphone API not supported: navigator.mediaDevices.getUserMedia is unavailable in this browser. Please use Chrome, Safari, Edge, or Firefox.";
      this.lastErrorName = "NotSupportedError";
      this.setState("MIC_UNAVAILABLE", msg, "NotSupportedError");
      emitSimulatorLog({
        category: "ERROR",
        message: msg,
      });
      return false;
    }

    // 3. AudioContext created state (synchronously)
    const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (!AudioCtx) {
      const msg = "Web Audio API AudioContext is not supported in this browser environment.";
      this.lastErrorName = "NotSupportedError";
      this.setState("MIC_UNAVAILABLE", msg, "NotSupportedError");
      emitSimulatorLog({
        category: "ERROR",
        message: msg,
      });
      return false;
    }

    if (!this.audioContext || this.audioContext.state === "closed") {
      this.audioContext = new AudioCtx({ latencyHint: "interactive" });
    }
    const ctx = this.audioContext;
    this.telemetry.sampleRate = ctx.sampleRate;
    this.telemetry.audioContextState = ctx.state;
    this.setState("MIC_STARTING");

    emitSimulatorLog({
      category: "MIC",
      message: `AudioContext created/resumed state: state=${ctx.state}, sampleRate=${ctx.sampleRate}Hz`,
    });
    console.log(`[MIC] AudioContext created/resumed state: state=${ctx.state}, sampleRate=${ctx.sampleRate}Hz`);

    // 4. Request getUserMedia immediately inside user gesture call stack (NO await before call!)
    emitSimulatorLog({
      category: "MIC",
      message: "getUserMedia requested (no await before call)...",
    });
    console.log("[MIC] getUserMedia requested (no await before call)...");

    const streamPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    let stream: MediaStream;
    try {
      stream = await streamPromise;
    } catch (err: any) {
      const errName = err?.name || "Error";
      const errMsg = err?.message || String(err);
      this.lastErrorName = errName;
      let userActionMsg = "";

      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        userActionMsg = `Microphone permission denied: Browser blocked microphone access (${errName}). Click the lock or camera icon in the address bar to allow microphone access.`;
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        userActionMsg = `Microphone not found (${errName}): No audio input device detected. Please connect a microphone or headset and try again.`;
      } else if (errName === "NotReadableError" || errName === "TrackStartError") {
        userActionMsg = `Microphone busy (${errName}): Another application is using your microphone. Please close other audio applications and try again.`;
      } else if (errName === "SecurityError") {
        userActionMsg = `Microphone security error (${errName}): iframe permissions policy blocked microphone. Open this page in its own tab.`;
      } else {
        userActionMsg = `Microphone error (${errName}): ${errMsg}. Please check microphone settings and try again.`;
      }

      this.setState("MIC_UNAVAILABLE", userActionMsg, errName);
      emitSimulatorLog({
        category: "ERROR",
        message: userActionMsg,
      });
      console.error(`[MIC] getUserMedia failed with ${errName}:`, err);

      this.cleanup();
      return false;
    }

    this.mediaStream = stream;
    this.telemetry.streamActive = true;
    this.telemetry.micPermission = "granted";

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) {
      const msg = "No audio track present in MediaStream";
      this.lastErrorName = "TrackNotFound";
      this.setState("MIC_UNAVAILABLE", msg, "TrackNotFound");
      emitSimulatorLog({
        category: "ERROR",
        message: msg,
      });
      this.cleanup();
      return false;
    }

    const settings = audioTrack.getSettings ? audioTrack.getSettings() : {};
    this.telemetry.channels = settings.channelCount || 1;
    const trackLabel = audioTrack.label || "default-audio-input";

    emitSimulatorLog({
      category: "MIC",
      message: `getUserMedia resolved: track="${trackLabel}", settings=${JSON.stringify(settings)}`,
    });
    console.log(`[MIC] getUserMedia resolved: track="${trackLabel}", settings=`, settings);

    audioTrack.onended = () => {
      this.handleTrackEnded();
    };

    this.sourceNode = ctx.createMediaStreamSource(stream);

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
        this.telemetry.audioContextState = ctx.state;
        emitSimulatorLog({
          category: "MIC",
          message: `AudioContext resumed state: state=${ctx.state}`,
        });
        console.log(`[MIC] AudioContext resumed state: state=${ctx.state}`);
      } catch (resumeErr: any) {
        console.warn("[VoiceCapture] AudioContext resume notice:", resumeErr);
      }
    }

    // Try AudioWorklet first; fall back to ScriptProcessorNode
    let workletReady = false;
    try {
      const workletCode = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 320; // 20ms at 16kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.index = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.index++] = channel[i];
      if (this.index >= this.bufferSize) {
        const pcm16 = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        this.port.postMessage({ pcm: pcm16.buffer }, [pcm16.buffer]);
        this.buffer = new Float32Array(this.bufferSize);
        this.index = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
`;
      const blob = new Blob([workletCode], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const worklet = new AudioWorkletNode(ctx, "pcm-capture-processor");
      worklet.port.onmessage = (event) => {
        if (event.data?.pcm) {
          const pcm16 = new Int16Array(event.data.pcm);
          this.handlePcmFrame(pcm16);
        }
      };

      this.sourceNode.connect(worklet);
      this.workletNode = worklet;
      workletReady = true;

      emitSimulatorLog({
        category: "MIC",
        message: "Worklet module loaded: pcm-capture-processor registered",
      });
      console.log("[MIC] Worklet module loaded: pcm-capture-processor registered");
    } catch (workletErr: any) {
      const wName = workletErr?.name || "AudioWorkletError";
      const wMsg = workletErr?.message || String(workletErr);
      emitSimulatorLog({
        category: "MIC",
        message: `Worklet module failed (${wName}: ${wMsg}). ScriptProcessor fallback used.`,
      });
      console.warn("[VoiceCapture] AudioWorklet init failed; using ScriptProcessor fallback:", workletErr);
    }

    // ScriptProcessor fallback
    if (!workletReady) {
      const bufferSize = 2048;
      const scriptNode = ctx.createScriptProcessor(bufferSize, 1, 1);
      const nativeSampleRate = ctx.sampleRate;
      const targetSampleRate = 16000;
      const downsampleRatio = nativeSampleRate / targetSampleRate;

      scriptNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const outSamples = Math.floor(inputData.length / downsampleRatio);
        const pcm16 = new Int16Array(outSamples);

        for (let i = 0; i < outSamples; i++) {
          const srcIdx = Math.floor(i * downsampleRatio);
          const s = Math.max(-1, Math.min(1, inputData[srcIdx]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        this.handlePcmFrame(pcm16);
      };

      this.sourceNode.connect(scriptNode);
      scriptNode.connect(ctx.destination);
      this.scriptProcessor = scriptNode;

      emitSimulatorLog({
        category: "MIC",
        message: "ScriptProcessor fallback used (bufferSize=2048, 16kHz downsampling)",
      });
      console.log("[MIC] ScriptProcessor fallback used");
    }

    // 2-second audio flow watchdog
    this.hasReceivedFirstFrame = false;
    if (this.noAudioTimer) {
      clearTimeout(this.noAudioTimer);
      this.noAudioTimer = null;
    }
    this.noAudioTimer = setTimeout(() => {
      if (!this.hasReceivedFirstFrame && (this.state === "MIC_ACTIVE" || this.state === "MIC_STARTING")) {
        const errorMsg = "Microphone capture started but no audio is flowing (0 PCM frames received in 2 seconds).";
        this.lastErrorName = "NoAudioFlowingError";
        emitSimulatorLog({
          category: "ERROR",
          message: errorMsg,
        });
        console.error(`[MIC] ${errorMsg}`);
        this.setState("MIC_UNAVAILABLE", errorMsg, "NoAudioFlowingError");
        this.callbacks.onNoAudioFlowing?.(errorMsg);
      }
    }, 2000);

    this.retryAttempts = 0;
    this.setState("MIC_ACTIVE");
    emitSimulatorLog({
      category: "MIC",
      message: "Microphone started successfully: 16kHz continuous capture active",
    });
    return true;
  }

  /**
   * Processes a single 16-bit PCM chunk from AudioWorklet/ScriptProcessor
   */
  private handlePcmFrame(pcm16: Int16Array): void {
    if (this.isMuted || this.state === "MIC_MUTED") {
      logVoiceDebug(`[VOICE] frame dropped: mic is MIC_MUTED (samples: ${pcm16.length})`);
      return;
    }

    // First PCM frame logging with RMS and 2s watchdog cancel
    if (!this.hasReceivedFirstFrame) {
      this.hasReceivedFirstFrame = true;
      if (this.noAudioTimer) {
        clearTimeout(this.noAudioTimer);
        this.noAudioTimer = null;
      }
      let sumSq = 0;
      for (let i = 0; i < pcm16.length; i++) {
        sumSq += pcm16[i] * pcm16[i];
      }
      const rms = Math.round(Math.sqrt(sumSq / pcm16.length));
      emitSimulatorLog({
        category: "MIC",
        message: `First PCM frame received: samples=${pcm16.length}, RMS=${rms}`,
      });
      console.log(`[MIC] First PCM frame received: samples=${pcm16.length}, RMS=${rms}`);
    }

    // Always push incoming PCM into continuous 500ms ring buffer
    this.pushToRingBuffer(pcm16);

    // Transition to MIC_ACTIVE once real audio frames actually arrive
    if (this.state === "MIC_STARTING" || this.state === "MIC_RECOVERING") {
      this.setState("MIC_ACTIVE");
    }

    // Telemetry updates
    this.telemetry.framesReceived++;
    this.telemetry.bytesReceived += pcm16.byteLength;
    this.telemetry.micActive = true;

    // Run VAD on the incoming frame
    const vadResult = this.vad.processFrame(pcm16);
    this.callbacks.onVadUpdate(vadResult);

    // Per-frame VAD result summary every ~250ms
    const now = performance.now();
    if (now - this.lastVadSummaryLogTime >= 250) {
      this.lastVadSummaryLogTime = now;
      logVoiceDebug(
        `[VOICE] VAD summary (~250ms): speechActive=${vadResult.speechActive}, speechDurationMs=${vadResult.speechDurationMs}, rms/energy=${vadResult.signalLevel}, isAiSpeaking=${this.isAiSpeaking}, turnCompleted=${Boolean(vadResult.turnCompleted)}`
      );
    }

    // Audio level for UI visualizer (normalized 0-100 real RMS)
    const normalizedLevel = Math.min(100, Math.round((vadResult.signalLevel / 2800) * 100));
    this.callbacks.onAudioLevel(normalizedLevel);

    if (vadResult.speechActive) {
      this.telemetry.speechFrames++;
      this.telemetry.speechDurationMs += DEFAULT_VAD_CONFIG.ASR_FRAME_MS;
      this.telemetry.currentVADState = "SPEECH";
    } else {
      this.telemetry.noiseFrames++;
      this.telemetry.noiseDurationMs += DEFAULT_VAD_CONFIG.ASR_FRAME_MS;
      this.telemetry.currentVADState = "SILENCE";
    }

    // ── TRUE BARGE-IN DETECTION ──
    // If assistant is currently speaking and caller voice crosses the threshold:
    if (this.isAiSpeaking && vadResult.speechActive && vadResult.speechDurationMs >= this.bargeInThresholdMs) {
      // Caller interrupted!
      this.telemetry.bargeIns++;
      this.isAiSpeaking = false;
      this.setState("MIC_INTERRUPTED");
      emitSimulatorLog({
        category: "MIC",
        message: `Barge-in detected: speech active for ${vadResult.speechDurationMs}ms (threshold: ${this.bargeInThresholdMs}ms) while assistant speaking`,
      });
      this.callbacks.onBargeIn();
      // Prepend ring buffer to utterance if not already started to avoid dropping opening consonant
      if (this.utteranceSampleCount === 0 && this.ringBuffer.length > 0) {
        for (const chunk of this.ringBuffer) {
          this.utteranceChunks.push(chunk);
          this.utteranceSampleCount += chunk.length;
        }
      }
      setTimeout(() => {
        if (this.state === "MIC_INTERRUPTED") {
          this.setState("MIC_ACTIVE");
        }
      }, 80);
    }

    // Utterance accumulation: start collecting on speech or keep collecting trailing silence
    if (vadResult.speechActive || this.utteranceSampleCount > 0) {
      // If beginning a fresh utterance, prepend ring buffer onset
      if (this.utteranceSampleCount === 0 && this.ringBuffer.length > 0) {
        for (const chunk of this.ringBuffer) {
          this.utteranceChunks.push(chunk);
          this.utteranceSampleCount += chunk.length;
        }
      }

      this.utteranceChunks.push(pcm16);
      this.utteranceSampleCount += pcm16.length;

      // Check max utterance threshold (safety split at 15s)
      const currentDurationMs = (this.utteranceSampleCount / 16000) * 1000;
      if (currentDurationMs >= DEFAULT_VAD_CONFIG.ASR_MAX_UTTERANCE_MS) {
        logVoiceDebug(`[VOICE] finalizeUtterance(): called (max utterance duration reached: ${Math.round(currentDurationMs)}ms)`);
        this.finalizeUtterance();
        return;
      }
    }

    // ── NATURAL END-OF-TURN DETECTION ──
    // Trailing silence counts toward turn completion; min threshold is configurable per step type
    const minSamples = Math.round(16000 * (this.minUtteranceMs / 1000));
    if (vadResult.turnCompleted) {
      if (this.utteranceSampleCount >= minSamples) {
        logVoiceDebug(
          `[VOICE] finalizeUtterance(): called (utteranceSampleCount=${this.utteranceSampleCount}, threshold=${minSamples} [${this.minUtteranceMs}ms], speechDurationMs=${vadResult.speechDurationMs})`
        );
        this.finalizeUtterance();
      } else {
        const discardedDurationMs = Math.round((this.utteranceSampleCount / 16000) * 1000);
        logVoiceDebug(
          `[VOICE] finalizeUtterance(): skipped (utteranceSampleCount=${this.utteranceSampleCount} < threshold=${minSamples} [${this.minUtteranceMs}ms], reason=utterance_too_short)`
        );
        emitSimulatorLog({
          category: "MIC",
          message: `MIC utterance discarded: ${discardedDurationMs}ms < ${this.minUtteranceMs}ms minimum threshold`,
        });
        this.callbacks.onDiscard?.(`Too short (${discardedDurationMs}ms < ${this.minUtteranceMs}ms), try again`);
        this.utteranceChunks = [];
        this.utteranceSampleCount = 0;
        this.vad.resetTurn();
      }
    }
  }

  /**
   * Finalizes the current utterance and triggers speech recognition
   */
  private finalizeUtterance(): void {
    if (this.utteranceSampleCount === 0 || this.utteranceChunks.length === 0) {
      logVoiceDebug(`[VOICE] finalizeUtterance(): skipped (utteranceSampleCount=0, reason=empty_buffer)`);
      this.vad.resetTurn();
      return;
    }

    logVoiceDebug(
      `[VOICE] finalizeUtterance(): processing ${this.utteranceSampleCount} samples (${Math.round((this.utteranceSampleCount / 16000) * 1000)}ms), threshold=${this.minUtteranceMs}ms`
    );

    // Merge accumulated PCM chunks
    const merged = new Int16Array(this.utteranceSampleCount);
    let offset = 0;
    for (const chunk of this.utteranceChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const durationMs = Math.round((this.utteranceSampleCount / 16000) * 1000);

    // Encode to 16 kHz WAV buffer with 44-byte header
    const wavBuffer = encodePcmToWav(merged, 16000);
    const wavBase64 = arrayBufferToBase64(wavBuffer);

    this.telemetry.chunksCreated++;

    emitSimulatorLog({
      category: "MIC",
      message: `Speech utterance captured: ${durationMs}ms (${wavBuffer.byteLength} bytes WAV, threshold: ${this.minUtteranceMs}ms)`,
    });

    // Reset utterance buffer & VAD for the next turn
    this.utteranceChunks = [];
    this.utteranceSampleCount = 0;
    this.vad.resetTurn();

    // Trigger turn completion callback
    this.callbacks.onUtteranceComplete(wavBase64, durationMs);
  }

  /**
   * Automatically handles unexpected audio track disconnect
   */
  private async handleTrackEnded(): Promise<void> {
    console.warn("[VoiceCapture] Audio track ended unexpectedly. Initiating recovery...");
    this.setState("MIC_RECOVERING");
    this.cleanup();

    if (this.retryAttempts < this.maxRetries) {
      this.retryAttempts++;
      setTimeout(async () => {
        const success = await this.start();
        if (!success && this.retryAttempts >= this.maxRetries) {
          this.setState("MIC_UNAVAILABLE", "Microphone disconnected and recovery failed.");
        }
      }, 1200);
    } else {
      this.setState("MIC_UNAVAILABLE", "Microphone disconnected and recovery attempts exhausted.");
    }
  }

  /**
   * Stops the continuous microphone session
   */
  public stop(): void {
    this.finalizeUtterance();
    this.cleanup();
    this.setState("MIC_STOPPED");
  }

  public mute(): void {
    this.isMuted = true;
    this.setState("MIC_MUTED");
  }

  public unmute(): void {
    this.isMuted = false;
    this.setState("MIC_ACTIVE");
  }

  private setState(newState: MicrophoneState, reason?: string, errorName?: string): void {
    const fromState = this.state;
    this.state = newState;
    if (errorName) {
      this.lastErrorName = errorName;
    }
    logVoiceDebug(`[VOICE] mic state change: ${fromState} -> ${newState}${reason ? ` (${reason})` : ""}`);
    emitSimulatorLog({
      category: "MIC",
      message: `Microphone state: ${fromState} -> ${newState}${reason ? ` (${reason})` : ""}`,
    });
    this.telemetry.micActive = newState === "MIC_ACTIVE";
    this.callbacks.onStateChange(newState, reason, errorName || this.lastErrorName || undefined);
    this.callbacks.onTelemetryUpdate({ ...this.telemetry });
  }

  private cleanup(): void {
    if (this.noAudioTimer) {
      clearTimeout(this.noAudioTimer);
      this.noAudioTimer = null;
    }
    this.hasReceivedFirstFrame = false;
    if (this.workletNode) {
      try { this.workletNode.disconnect(); } catch {}
      this.workletNode = null;
    }
    if (this.scriptProcessor) {
      try { this.scriptProcessor.disconnect(); } catch {}
      this.scriptProcessor = null;
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch {}
      this.audioContext = null;
    }
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((t) => t.stop());
      } catch {}
      this.mediaStream = null;
    }
    this.telemetry.streamActive = false;
    this.telemetry.audioContextState = "closed";
    this.callbacks.onAudioLevel(0);
  }
}
