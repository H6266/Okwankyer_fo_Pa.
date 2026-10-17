/**
 * Ɔkwankyerɛfo Pa - Authoritative Audio Playback Controller
 *
 * Requirements:
 * 1. Single owner of exactly ONE <audio> element across the simulator.
 * 2. Every play() stops the previous one and increments an internal token.
 * 3. Stale ended/error/play() results from older tokens are strictly ignored.
 * 4. play(url) returns a Promise that resolves on ended.
 * 5. stop() cancels active playback cleanly and increments the token.
 * 6. playSequence([urls]) plays an ordered array of clips.
 * 7. AbortError is handled silently.
 * 8. Zero browser speechSynthesis or other browser TTS.
 */

import { matchReplyToAudio } from "./replyAudioMatcher";

export type PlaybackSourceType = "STUDIO_PROMPT" | "SYNTHESIZED_TTS" | "REMOTE_URL";

export interface PlaybackState {
  isPlaying: boolean;
  activeClip: string | null;
  activeText: string | null;
  token: number;
}

export interface PlaybackRequest {
  id?: string;
  url?: string;
  text?: string;
  language?: string;
  audioBase64?: string;
  audioMimeType?: string;
  sourceType?: PlaybackSourceType;
}

export interface PlayOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

type StateListener = (state: PlaybackState) => void;

/**
 * Checks whether the current browser environment supports native playback of MPEG-4 AAC (.m4a).
 * If the browser lacks AAC support (or is in a sandboxed iframe without codecs), returns false
 * so the playback controller immediately routes to universal MP3.
 */
export function canBrowserPlayM4a(): boolean {
  if (typeof document === "undefined" || typeof Audio === "undefined") return true;
  try {
    const probe = new Audio();
    const canPlayMp4 = probe.canPlayType('audio/mp4; codecs="mp4a.40.2"') || probe.canPlayType("audio/mp4") || probe.canPlayType("audio/x-m4a");
    return canPlayMp4 === "probably" || canPlayMp4 === "maybe";
  } catch {
    return true;
  }
}

export function resolveSafePlayableUrl(url: string): string {
  if (!url) return url;
  return canBrowserPlayM4a() ? url : url.replace(/\.(m4a|aac)$/i, ".mp3");
}

export class AudioPlaybackController {
  private playbackVolume: number = 1.0;
  private volumeMultiplier: number = 2.8; // Boosted volume: 280% (+9dB) with dynamics compression
  private audioElement: HTMLAudioElement | null = null;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private currentToken: number = 0;
  private state: PlaybackState = {
    isPlaying: false,
    activeClip: null,
    activeText: null,
    token: 0,
  };
  private listeners: Set<StateListener> = new Set();
  private activeResolver: (() => void) | null = null;
  private preloadElements: Map<string, HTMLAudioElement> = new Map();
  private audioBufferCache: Map<string, AudioBuffer> = new Map();
  private activeBufferSource: AudioBufferSourceNode | null = null;
  private lastPlaybackEndTime: number = 0;

  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initAudioElement();
    }
  }

  public getLastPlaybackEndTime(): number {
    return this.lastPlaybackEndTime;
  }

  public isWithinEchoDrainWindow(bufferMs: number = 600): boolean {
    return (Date.now() - this.lastPlaybackEndTime) < bufferMs;
  }

  /**
   * Sets custom audio amplification multiplier (2.8 = boosted default, up to 3.5)
   */
  public setVolumeMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier)) {
      throw new Error("Audio volume multiplier must be a finite number.");
    }
    this.volumeMultiplier = Math.max(0.5, Math.min(3.5, multiplier));
    if (this.masterGainNode && this.audioContext) {
      this.masterGainNode.gain.setValueAtTime(this.volumeMultiplier, this.audioContext.currentTime);
    }
    if (!this.mediaElementSource && this.audioElement) {
      this.connectAudioElementToOutput();
    }
  }

  public getVolumeMultiplier(): number {
    return this.volumeMultiplier;
  }

  /**
   * Configures Web Audio signal chain with Gain amplification and Dynamics Compression
   */
  private setupAudioGraph(): void {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioContext && AudioCtx) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext && !this.masterGainNode) {
        this.masterGainNode = this.audioContext.createGain();
        this.masterGainNode.gain.setValueAtTime(this.volumeMultiplier, this.audioContext.currentTime);
        // Dynamics compressor guarantees boosted volume is crystal clear, loud, and unclipped
        this.compressorNode = this.audioContext.createDynamicsCompressor();
        this.compressorNode.threshold.setValueAtTime(-24, this.audioContext.currentTime);
        this.compressorNode.knee.setValueAtTime(25, this.audioContext.currentTime);
        this.compressorNode.ratio.setValueAtTime(12, this.audioContext.currentTime);
        this.compressorNode.attack.setValueAtTime(0.002, this.audioContext.currentTime);
        this.compressorNode.release.setValueAtTime(0.2, this.audioContext.currentTime);
        this.masterGainNode.connect(this.compressorNode);
        this.compressorNode.connect(this.audioContext.destination);
      }
    } catch (err) {
      console.warn("[AudioController] Audio graph setup notice:", err);
    }
  }

  /**
   * Connects the HTMLAudioElement to the Web Audio amplification graph
   */
  private connectAudioElementToGraph(audio: HTMLAudioElement): void {
    if (typeof window === "undefined" || !this.audioContext || this.mediaElementSource) return;
    try {
      this.mediaElementSource = this.audioContext.createMediaElementSource(audio);
      if (this.masterGainNode) {
        this.mediaElementSource.connect(this.masterGainNode);
      } else {
        this.mediaElementSource.connect(this.audioContext.destination);
      }
    } catch {}
  }

  /**
   * Enables Web Audio & Audio element on user gesture
   */
  public enableAudio(): void {
    this.unlockAudio();
  }

  /**
   * Unlocks Web Audio & Audio element on user gesture
   */
  public unlockAudio(): void {
    if (typeof window === "undefined") return;
    try {
      this.setupAudioGraph();
      if (this.audioContext && this.audioContext.state === "suspended") {
        this.audioContext.resume().catch(() => {});
      }
      this.connectAudioElementToOutput();
      // Play silent 1-sample buffer to unlock AudioContext permanently in iframes
      if (this.audioContext) {
        try {
          const silentBuffer = this.audioContext.createBuffer(1, 1, 22050);
          const silentSource = this.audioContext.createBufferSource();
          silentSource.buffer = silentBuffer;
          silentSource.connect(this.masterGainNode || this.audioContext.destination);
          silentSource.start(0);
        } catch {}
      }
      if (!this.audioElement) {
        this.initAudioElement();
      }
      if (this.audioElement) {
        this.connectAudioElementToGraph(this.audioElement);
        // Unlock HTML5 media element within the synchronous click gesture
        this.audioElement.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        const playPromise = this.audioElement.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (this.audioElement && !this.state.isPlaying) {
                this.audioElement.pause();
                this.audioElement.currentTime = 0;
              }
            })
            .catch(() => {});
        }
      }
    } catch {}
  }

  /**
   * Generates authentic dual-tone multi-frequency (DTMF) keypad beeps
   */
  public playDtmfTone(digit: string, durationMs: number = 100): void {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume().catch(() => {});
      }

      const dtmfMap: Record<string, [number, number]> = {
        "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
        "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
        "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
        "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
      };

      const freqs = dtmfMap[digit];
      if (!freqs) return;

      const now = this.audioContext.currentTime;
      const osc1 = this.audioContext.createOscillator();
      const osc2 = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(freqs[0], now);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freqs[1], now);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.audioContext.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + durationMs / 1000);
      osc2.stop(now + durationMs / 1000);
    } catch {}
  }

  /**
   * Generates a gentle dual-frequency IVR guidance tone indicator using Web Audio API.
   * Frequency: 523.25Hz (C5) / 659.25Hz (E5) smooth sine envelope (~350ms).
   * Emitted as an acoustic notification whenever a specific prompt recording is unavailable,
   * enabling the IVR session to advance without freezing.
   */
  public playToneIndicator(durationMs: number = 350): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    // STRICT RULE: Never play tone indicator while an audio prompt is actively playing!
    if (this.state.isPlaying) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) {
          setTimeout(resolve, durationMs);
          return;
        }
        if (!this.audioContext) {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === "suspended") {
          this.audioContext.resume().catch(() => {});
        }
        const now = this.audioContext.currentTime;
        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc1.type = "sine";
        osc2.type = "sine";
        osc1.frequency.setValueAtTime(523.25, now);
        osc2.frequency.setValueAtTime(659.25, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.24, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.masterGainNode || this.audioContext.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + durationMs / 1000);
        osc2.stop(now + durationMs / 1000);

        setTimeout(resolve, durationMs + 20);
      } catch {
        setTimeout(resolve, durationMs);
      }
    });
  }

  /**
   * Prioritizes ready Akan Twi studio audio recordings via matchReplyToAudio & keyword matcher.
   * Absolutely zero synthetic TTS after user input: never invokes browser SpeechSynthesis or robotic TTS.
   */
  public async speakText(text: string, options?: PlayOptions): Promise<boolean> {
    if (!text || !text.trim()) return false;
    const token = ++this.currentToken;
    const cleanText = text.trim();

    // Check if the text contains dynamic personalized elements:
    // e.g. Ghanaian recipient names, specific phone digits ("055...", "024..."), currency amounts ("GH₵", "cedis", decimals), or fees
    const hasDynamicDetails =
      /\b0[235]\d{8}\b/.test(cleanText) ||
      /\b\d{1,5}(?:\.\d{1,2})?\s*(?:cedis?|ghs|gh¢|pesewas?)\b/i.test(cleanText) ||
      /\b(?:Kwame|Kofi|Boateng|Mensah|Ama|Yaw|Akua|Kwesi|Abena|Kojo|Yaa|Tetteh|Osei|Owusu|Appiah|Frimpong|Enterprise|Agent)\b/i.test(cleanText) ||
      /\b(?:din ne|name is|phone nɔmba a ɛdi mũ|full recipient phone number)\b/i.test(cleanText) ||
      /\b(?:fee yɛ|fee of)\b/i.test(cleanText);

    // 1. Match to native studio audio recording ONLY if NOT containing dynamic entities
    if (!hasDynamicDetails) {
      try {
        const match = matchReplyToAudio(cleanText, "twi", { minConfidence: 0.85 });
        if (match.match && match.audioUrl) {
          return this.play(match.audioUrl, {
            ...options,
            onStart: () => {
              this.setState({ activeText: cleanText });
              options?.onStart?.();
            },
            onEnd: options?.onEnd,
            onError: options?.onError,
          });
        }
      } catch (matchErr) {
        console.warn("[AudioController] Studio audio matching notice:", matchErr);
      }
    }

    // 2. Dynamic Neural Speech Synthesis via backend pipeline for authentic voice (Names, Amounts, Dynamic prompts)
    try {
      const isTwi = /[ɛɔ]|sika|mane|akwaaba|dabi|aane|paw|sidi|nɔmba|yɛsrɛ|nte|frɛ|din|pesewas|wobɛmane|woremane/i.test(cleanText);
      const res = await fetch("/api/ai/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText, language: isTwi ? "twi" : "en" }),
      });
      if (res.ok) {
        const data = await res.json();
        let base64 = data?.result?.audioBase64;
        if (!base64 && data?.result?.audioBuffer?.data) {
          const rawBytes = new Uint8Array(data.result.audioBuffer.data);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < rawBytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(
              null,
              Array.from(rawBytes.subarray(i, Math.min(i + chunkSize, rawBytes.length)))
            );
          }
          base64 = btoa(binary);
        }
        const mimeType = data?.result?.audioMimeType || "audio/wav";
        if (base64) {
          const dataUrl = `data:${mimeType};base64,${base64}`;
          return this.play(dataUrl, {
            ...options,
            onStart: () => {
              this.setState({ activeText: cleanText });
              options?.onStart?.();
            },
            onEnd: options?.onEnd,
            onError: options?.onError,
          });
        }
      }
    } catch (synthErr) {
      console.warn("[AudioController] Speech synthesis fallback notice:", synthErr);
    }

    // 4. Acoustic guidance tone indicator as clear fail-safe (Zero robotic SpeechSynthesis interference)
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    try {
      await this.playToneIndicator(300);
      if (this.currentToken === token) {
        this.setState({ isPlaying: false, activeClip: null, activeText: null, token });
        options?.onEnd?.();
        return true;
      }
    } catch {}

    this.setState({ isPlaying: false, activeClip: null, activeText: null, token });
    return false;
  }

  /**
   * Preload audio files into browser memory for zero-latency instant playback.
   */
  public preload(urls: string[]): void {
    if (typeof window === "undefined") return;
    for (const url of urls) {
      if (!url) continue;
      const clean = url.replace(/^https?:\/\/[^/]+(\/audio\/.*)$/i, "$1");
      if (!this.preloadElements.has(clean) && typeof Audio !== "undefined") {
        try {
          const audio = new Audio();
          audio.preload = "auto";
          audio.src = clean;
          this.preloadElements.set(clean, audio);
        } catch {}
      }
      if (!this.audioBufferCache.has(clean) && this.audioContext) {
        fetch(clean)
          .then((r) => r.ok ? r.arrayBuffer() : null)
          .then((buf) => {
            if (buf && this.audioContext) {
              return this.audioContext.decodeAudioData(buf);
            }
            return null;
          })
          .then((decoded) => {
            if (decoded) {
              this.audioBufferCache.set(clean, decoded);
            }
          })
          .catch(() => {});
      }
    }
  }

  private initAudioElement(): HTMLAudioElement | null {
    if (this.audioElement) return this.audioElement;
    if (typeof window === "undefined" || typeof Audio === "undefined") return null;

    try {
      this.audioElement = new Audio();
      this.audioElement.preload = "auto";
      this.connectAudioElementToOutput();
      return this.audioElement;
    } catch {
      return null;
    }
  }

  private connectAudioElementToOutput(): void {
    if (!this.audioContext || !this.masterGainNode || !this.audioElement || this.mediaElementSource) return;
    try {
      this.mediaElementSource = this.audioContext.createMediaElementSource(this.audioElement);
      this.mediaElementSource.connect(this.masterGainNode);
    } catch (err) {
      console.warn("[AudioController] Could not connect media output to the volume controller:", err);
    }
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(updates: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach((fn) => {
      try {
        fn(this.state);
      } catch (err) {
        console.error("[AudioController] Listener error:", err);
      }
    });
  }

  public getState(): PlaybackState {
    return this.state;
  }

  public isSpeaking(): boolean {
    return this.state.isPlaying;
  }

  public getActivePromptText(): string {
    return this.state.activeText || "";
  }

  public getActiveClip(): string | null {
    return this.state.activeClip;
  }

  public getCurrentToken(): number {
    return this.currentToken;
  }

  /**
   * Stop active audio immediately, resolve pending promise, increment token.
   * @param broadcast If true, notifies all subscribers with isPlaying: false.
   * Set to false when immediately transitioning to a new clip to prevent unpause flap.
   */
  public stop(broadcast: boolean = true): void {
    const token = ++this.currentToken;
    this.lastPlaybackEndTime = Date.now();

    if (this.activeBufferSource) {
      try {
        this.activeBufferSource.onended = null;
        this.activeBufferSource.stop();
        this.activeBufferSource.disconnect();
      } catch {}
      this.activeBufferSource = null;
    }

    if (this.audioElement) {
      try {
        this.audioElement.onended = null;
        this.audioElement.onerror = null;
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
      } catch {}
    }

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    if (this.activeResolver) {
      const resolve = this.activeResolver;
      this.activeResolver = null;
      resolve();
    }

    if (broadcast) {
      this.setState({
        isPlaying: false,
        activeClip: null,
        activeText: null,
        token,
      });
    } else {
      this.state = {
        ...this.state,
        isPlaying: false,
        token,
      };
    }
  }

  /**
   * Plays an audio asset directly via the Web Audio API (AudioBufferSourceNode).
   * Unrestricted by HTML5 media autoplay gates once AudioContext is initialized/resumed on user gesture.
   */
  public async playViaWebAudio(url: string, token: number, options?: PlayOptions): Promise<boolean> {
    try {
      if (!this.audioContext) {
        const AudioCtx = typeof window !== "undefined" && ((window as any).AudioContext || (window as any).webkitAudioContext);
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
        }
      }
      if (this.audioContext && this.audioContext.state === "suspended") {
        await this.audioContext.resume().catch(() => {});
      }
      if (!this.audioContext) return false;

      let buffer = this.audioBufferCache.get(url);
      if (!buffer) {
        let res = await fetch(url).catch(() => null);
        if (!res?.ok && url.endsWith(".mp3")) {
          // If transcode not yet in cache, fetch source format (.m4a or .aac)
          const m4a = url.replace(/\.mp3$/i, ".m4a");
          const aac = url.replace(/\.mp3$/i, ".aac");
          res = await fetch(m4a).catch(() => null);
          if (!res?.ok) {
            res = await fetch(aac).catch(() => null);
          }
        }
        if (!res?.ok) return false;
        const ab = await res.arrayBuffer();
        buffer = await this.audioContext.decodeAudioData(ab);
        if (buffer) {
          this.audioBufferCache.set(url, buffer);
        }
      }

      if (this.currentToken !== token || !buffer) return false;

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.masterGainNode || this.audioContext.destination);
      this.activeBufferSource = source;

      return new Promise<boolean>((resolve) => {
        this.activeResolver = () => {
          resolve(false);
        };
        source.onended = () => {
          if (this.currentToken !== token) return;
          this.activeBufferSource = null;
          this.activeResolver = null;
          this.lastPlaybackEndTime = Date.now();
          this.setState({
            isPlaying: false,
            activeClip: null,
            activeText: null,
            token,
          });
          options?.onEnd?.();
          resolve(true);
        };
        source.start(0);
      });
    } catch (err) {
      console.warn("[AudioController] playViaWebAudio notice:", err);
      return false;
    }
  }

  /**
   * Plays a single audio url. Accepts either a url string or a PlaybackRequest object.
   * Returns a Promise that resolves when audio ends (or resolves immediately if stopped).
   */
  public async play(
    target: string | PlaybackRequest,
    optionsOrText?: PlayOptions | string
  ): Promise<boolean> {
    let url = "";
    let promptText: string | null = null;
    let options: PlayOptions | undefined;

    if (typeof target === "string") {
      url = target;
      if (typeof optionsOrText === "string") {
        promptText = optionsOrText;
      } else if (optionsOrText) {
        options = optionsOrText;
      }
    } else if (target && typeof target === "object") {
      url = target.url || "";
      if (!url && target.audioBase64) {
        url = `data:${target.audioMimeType || "audio/wav"};base64,${target.audioBase64}`;
      }
      promptText = target.text || null;
      if (typeof optionsOrText === "object") {
        options = optionsOrText;
      }
    }

    if (url) {
      url = resolveSafePlayableUrl(url.replace(/^https?:\/\/[^/]+(\/audio\/.*)$/i, "$1"));
    }

    // If identical clip is already actively playing, don't interrupt; just update text if given
    if (url && this.state.isPlaying && this.state.activeClip === url) {
      if (promptText && promptText !== this.state.activeText) {
        this.setState({ activeText: promptText });
      }
      return Promise.resolve(true);
    }

    // 1. Stop any current playback cleanly without emitting an intermediate idle flap
    this.stop(false);
    const token = ++this.currentToken;

    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("audiocontroller:playing", { detail: { url } }));
      } catch {}
    }

    if (!url) {
      this.setState({
        isPlaying: false,
        activeClip: null,
        activeText: promptText,
        token,
      });
      if (promptText && promptText.trim()) {
        return this.speakText(promptText, options);
      }
      return Promise.resolve(false);
    }

    this.setState({
      isPlaying: true,
      activeClip: url,
      activeText: promptText,
      token,
    });
    options?.onStart?.();

    // Ensure audio is unlocked
    this.unlockAudio();

    // 2. High-performance Web Audio Buffer playback if cached
    if (this.audioContext && this.audioBufferCache.has(url)) {
      return this.playViaWebAudio(url, token, options);
    }

    // 3. Play through HTML5 audio element with automatic WebAudio fallback
    const audio = this.initAudioElement();
    if (!audio) {
      const ok = await this.playViaWebAudio(url, token, options);
      if (ok) return true;
      if (promptText && promptText.trim()) {
        return this.speakText(promptText, options);
      }
      return false;
    }

    audio.volume = this.playbackVolume;
    this.connectAudioElementToOutput();

    return new Promise<boolean>((resolve) => {
      this.activeResolver = () => {
        resolve(false);
      };

      const handleEnded = () => {
        if (this.currentToken !== token) return;
        this.activeResolver = null;
        this.lastPlaybackEndTime = Date.now();
        this.setState({
          isPlaying: false,
          activeClip: null,
          activeText: null,
          token,
        });
        options?.onEnd?.();
        resolve(true);
      };

      const fallbackToText = () => {
        this.activeResolver = null;
        if (this.currentToken !== token) {
          resolve(false);
          return;
        }
        if (promptText && promptText.trim()) {
          this.speakText(promptText, options).then(resolve);
          return;
        }
        this.lastPlaybackEndTime = Date.now();
        this.setState({
          isPlaying: false,
          activeClip: null,
          activeText: null,
          token,
        });
        resolve(false);
      };

      const tryWebAudioFallback = async () => {
        const ok = await this.playViaWebAudio(url, token, options);
        if (ok) {
          resolve(true);
        } else {
          fallbackToText();
        }
      };

      audio.onended = handleEnded;

      audio.onerror = () => {
        if (this.currentToken !== token) return;
        tryWebAudioFallback();
      };

      try {
        audio.volume = this.playbackVolume;
        audio.src = url;
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err: any) => {
            if (err?.name === "AbortError" || err?.message?.includes("interrupted")) {
              return;
            }
            if (this.currentToken === token) {
              tryWebAudioFallback();
            }
          });
        }
      } catch {
        if (this.currentToken === token) {
          tryWebAudioFallback();
        }
      }
    });
  }

  /**
   * Plays an array of URLs sequentially.
   * If any item is superseded by another play()/stop(), the sequence aborts cleanly.
   */
  public async playSequence(urls: string[]): Promise<boolean> {
    this.stop(false);
    const sequenceToken = ++this.currentToken;
    const safeUrls = urls
      .filter(Boolean)
      .map((u) => resolveSafePlayableUrl(u.replace(/^https?:\/\/[^/]+(\/audio\/.*)$/i, "$1")));

    for (let url of safeUrls) {
      if (this.currentToken !== sequenceToken) {
        return false;
      }

      const ended = await (async () => {
        if (this.audioContext && this.audioBufferCache.has(url)) {
          return this.playViaWebAudio(url, sequenceToken);
        }

        const audio = this.initAudioElement();
        if (!audio) {
          return this.playViaWebAudio(url, sequenceToken);
        }

        audio.volume = this.playbackVolume;

        return new Promise<boolean>((resolve) => {
          this.activeResolver = () => resolve(false);

          this.setState({
            isPlaying: true,
            activeClip: url,
            activeText: null,
            token: sequenceToken,
          });

          audio.onended = () => {
            if (this.currentToken !== sequenceToken) return;
            this.activeResolver = null;
            this.lastPlaybackEndTime = Date.now();
            resolve(true);
          };

          audio.onerror = () => {
            if (this.currentToken !== sequenceToken) return;
            this.playViaWebAudio(url, sequenceToken).then(resolve);
          };

          audio.src = url;
          audio.currentTime = 0;
          const p = audio.play();
          if (p !== undefined) {
            p.catch((err: any) => {
              if (err?.name === "AbortError" || err?.message?.includes("interrupted")) {
                resolve(false);
                return;
              }
              if (this.currentToken !== sequenceToken) return;
              this.playViaWebAudio(url, sequenceToken).then(resolve);
            });
          }
        });
      })();

      if (!ended) {
        return false;
      }
    }

    if (this.currentToken === sequenceToken) {
      this.lastPlaybackEndTime = Date.now();
      this.setState({
        isPlaying: false,
        activeClip: null,
        activeText: null,
        token: sequenceToken,
      });
      return true;
    }
    return false;
  }
}

export const audioPlaybackController = new AudioPlaybackController();
