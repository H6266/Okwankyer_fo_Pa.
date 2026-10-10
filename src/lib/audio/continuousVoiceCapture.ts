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
  onStateChange: (state: MicrophoneState, reason?: string) => void;
  onAudioLevel: (level: number) => void;
  onVadUpdate: (vad: VadAnalysisResult) => void;
  onUtteranceComplete: (wavBase64: string, durationMs: number) => void;
  onBargeIn: () => void;
  onTelemetryUpdate: (telemetry: VoiceTelemetry) => void;
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
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
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

  public getTelemetry(): VoiceTelemetry {
    return { ...this.telemetry };
  }

  public setAiSpeaking(speaking: boolean): void {
    this.isAiSpeaking = speaking;
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

    this.setState("MIC_STARTING");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      this.mediaStream = stream;
      this.telemetry.streamActive = true;
      this.telemetry.micPermission = "granted";

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error("No audio track present in MediaStream");
      }

      const settings = audioTrack.getSettings ? audioTrack.getSettings() : {};
      this.telemetry.channels = settings.channelCount || 1;

      // Handle unexpected track end (auto-recovery)
      audioTrack.onended = () => {
        this.handleTrackEnded();
      };

      // Initialize Web Audio Context
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error("Web Audio API AudioContext not supported");
      }

      const ctx = new AudioCtx({ latencyHint: "interactive" });
      this.audioContext = ctx;
      this.telemetry.sampleRate = ctx.sampleRate;
      this.telemetry.audioContextState = ctx.state;

      if (ctx.state === "suspended") {
        await ctx.resume();
        this.telemetry.audioContextState = ctx.state;
      }

      this.sourceNode = ctx.createMediaStreamSource(stream);

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
      } catch (workletErr) {
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
      }

      this.retryAttempts = 0;
      return true;
    } catch (err: any) {
      const errName = err?.name || "Error";
      const errMsg = err?.message || String(err);

      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        this.setState("MIC_UNAVAILABLE", "Permission denied: Caller blocked mic access in browser/iframe.");
      } else if (errName === "SecurityError") {
        this.setState("MIC_UNAVAILABLE", "Security policy violation: iframe missing allow='microphone' attribute.");
      } else {
        this.setState("MIC_UNAVAILABLE", `Microphone init error (${errName}): ${errMsg}`);
      }

      this.cleanup();
      return false;
    }
  }

  /**
   * Processes a single 16-bit PCM chunk from AudioWorklet/ScriptProcessor
   */
  private handlePcmFrame(pcm16: Int16Array): void {
    if (this.isMuted) return;

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
    if (this.isAiSpeaking && vadResult.speechActive && vadResult.speechDurationMs >= 140) {
      // Caller interrupted!
      this.telemetry.bargeIns++;
      this.isAiSpeaking = false;
      this.setState("MIC_INTERRUPTED");
      this.callbacks.onBargeIn();
      setTimeout(() => {
        if (this.state === "MIC_INTERRUPTED") {
          this.setState("MIC_ACTIVE");
        }
      }, 80);
    }

    // Utterance accumulation
    if (vadResult.speechActive || this.utteranceSampleCount > 0) {
      this.utteranceChunks.push(pcm16);
      this.utteranceSampleCount += pcm16.length;

      // Check max utterance threshold (safety split at 15s)
      const currentDurationMs = (this.utteranceSampleCount / 16000) * 1000;
      if (currentDurationMs >= DEFAULT_VAD_CONFIG.ASR_MAX_UTTERANCE_MS) {
        this.finalizeUtterance();
        return;
      }
    }

    // ── NATURAL END-OF-TURN DETECTION ──
    if (vadResult.turnCompleted && this.utteranceSampleCount >= 16000 * 0.7) {
      // Natural silence following user speech turn
      this.finalizeUtterance();
    }
  }

  /**
   * Finalizes the current utterance and triggers speech recognition
   */
  private finalizeUtterance(): void {
    if (this.utteranceSampleCount === 0 || this.utteranceChunks.length === 0) {
      this.vad.resetTurn();
      return;
    }

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

  private setState(newState: MicrophoneState, reason?: string): void {
    this.state = newState;
    this.telemetry.micActive = newState === "MIC_ACTIVE";
    this.callbacks.onStateChange(newState, reason);
    this.callbacks.onTelemetryUpdate({ ...this.telemetry });
  }

  private cleanup(): void {
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
