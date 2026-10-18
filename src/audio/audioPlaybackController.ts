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

import { getVerifiedRecordingBySpokenText } from "./recordingRegistry";

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
  skipStudioMatch?: boolean;
  language?: string;
  promptId?: string;
  sourceType?: PlaybackSourceType;
  provider?: string;
}

type StateListener = (state: PlaybackState) => void;

/**
 * Checks whether the current browser environment supports native playback of MPEG-4 AAC (.m4a).
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
  return url;
}

export class AudioPlaybackController {
  private playbackVolume: number = 1.0;
  private volumeMultiplier: number = 1.0;
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

  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initAudioElement();
    }
  }

  /**
   * Sets the master gain without boosting the source signal above unity.
   */
  public setVolumeMultiplier(multiplier: number): void {
    this.volumeMultiplier = Math.max(0.5, Math.min(1.0, multiplier));
    if (this.masterGainNode && this.audioContext) {
      try {
        this.masterGainNode.gain.setValueAtTime(this.volumeMultiplier, this.audioContext.currentTime);
      } catch {}
    }
  }

  public getVolumeMultiplier(): number {
    return this.volumeMultiplier;
  }

  /**
   * Configures the Web Audio signal chain at unity gain.
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
        this.masterGainNode.connect(this.audioContext.destination);
      }

      // Route HTML5 AudioElement through the unity-gain master volume.
      if (this.audioContext && this.audioElement && !this.mediaElementSource) {
        try {
          this.mediaElementSource = this.audioContext.createMediaElementSource(this.audioElement);
          this.mediaElementSource.connect(this.masterGainNode || this.audioContext.destination);
        } catch {
          // Fallback if media element already hooked or restricted
        }
      }
    } catch (err) {
      console.warn("[AudioController] Audio graph setup notice:", err);
    }
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
   * Uses an exact approved recording when available, otherwise requests real server-side synthesis.
   */
  public async speakText(text: string, options?: PlayOptions): Promise<boolean> {
    if (!text || !text.trim()) return false;
    const cleanText = text.trim();
    const inferredTwi = /[ɛɔƐƆ]/.test(cleanText)
      || /\b(akwaaba|yɛsrɛ|wopɛ|sika|mia|nɔmba|fon|ne din|womane|ɔha|aduonu|baako|mmienu)\b/i.test(cleanText);
    const language = options?.language === "twi" || options?.language === "tw" || options?.language === "ak"
      ? "twi"
      : options?.language === "en"
        ? "en"
        : inferredTwi ? "twi" : "en";
    const promptId = options?.promptId || "unknown";
    const exactRecording = options?.skipStudioMatch
      ? null
      : getVerifiedRecordingBySpokenText(cleanText, language);
    if (exactRecording?.url) {
      return this.play(exactRecording.url, {
        ...options,
        language,
        promptId,
        sourceType: "STUDIO_PROMPT",
        provider: "verified studio recording",
        onStart: () => {
          this.setState({ activeText: cleanText });
          options?.onStart?.();
        },
      });
    }

    const endpoint = "/api/audio/synthesize";
    this.stop();
    const token = ++this.currentToken;
    this.setState({ isPlaying: true, activeClip: endpoint, activeText: cleanText, token });
    try {
      options?.onStart?.();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/wav, audio/mpeg, audio/mp4" },
        body: JSON.stringify({ text: cleanText, language, promptId }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText || "speech synthesis failed"}`);
      }
      const mimeType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!mimeType || !["audio/wav", "audio/mpeg"].includes(mimeType)) {
        throw new Error(`Unexpected synthesized audio MIME type: ${mimeType || "missing"}`);
      }
      const audioBlob = await response.blob();
      if (audioBlob.size < 44) throw new Error("Synthesized audio response is empty or incomplete.");
      if (this.currentToken !== token) return false;

      const objectUrl = URL.createObjectURL(audioBlob);
      try {
        return await this.play(objectUrl, {
          ...options,
          language,
          sourceType: "SYNTHESIZED_TTS",
          provider: response.headers.get("x-audio-provider") || "server TTS router",
          onStart: undefined,
        });
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (error) {
      const actualError = error instanceof Error ? error : new Error(String(error));
      if (this.currentToken === token) {
        this.setState({ isPlaying: false, activeClip: null, activeText: null, token });
      }
      console.error("[AudioController] Speech request failed.", {
        promptId,
        language,
        sourceType: "SYNTHESIZED_TTS",
        url: endpoint,
        provider: "server TTS router",
        error: actualError,
      });
      options?.onError?.(actualError);
      return false;
    }
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
      return this.audioElement;
    } catch {
      return null;
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
   */
  public stop(): void {
    const token = ++this.currentToken;

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

    this.setState({
      isPlaying: false,
      activeClip: null,
      activeText: null,
      token,
    });
  }

  /**
   * Plays an audio asset directly via the Web Audio API (AudioBufferSourceNode).
   * Unrestricted by HTML5 media autoplay gates once AudioContext is initialized/resumed on user gesture.
   */
  public async playViaWebAudio(
    url: string,
    token: number,
    options?: PlayOptions & { keepPlayingOnEnd?: boolean }
  ): Promise<boolean> {
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
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) return false;
        const ab = await response.arrayBuffer();
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
        const timeout = setTimeout(() => {
          if (this.currentToken !== token) return;
          try { source.stop(); } catch {}
          this.activeBufferSource = null;
          this.activeResolver = null;
          options?.onError?.(new Error("Audio playback timed out."));
          this.setState({ isPlaying: false, activeClip: null, activeText: null, token });
          resolve(false);
        }, 60_000);
        this.activeResolver = () => {
          clearTimeout(timeout);
          resolve(false);
        };
        source.onended = () => {
          if (this.currentToken !== token) return;
          clearTimeout(timeout);
          this.activeBufferSource = null;
          this.activeResolver = null;
          if (!options?.keepPlayingOnEnd) {
            this.setState({
              isPlaying: false,
              activeClip: null,
              activeText: null,
              token,
            });
          }
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

    // 1. Stop any current playback and increment token
    this.stop();
    const token = ++this.currentToken;

    if (!url) {
      this.setState({
        isPlaying: false,
        activeClip: null,
        activeText: promptText,
        token,
      });
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
      return ok;
    }

    audio.volume = this.playbackVolume;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const settle = (played: boolean, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        audio.onended = null;
        audio.onerror = null;
        if (this.activeResolver === cancelPlayback) this.activeResolver = null;
        if (this.currentToken === token) {
          this.setState({
            isPlaying: false,
            activeClip: null,
            activeText: null,
            token,
          });
        }
        if (error) options?.onError?.(error);
        if (error) {
          console.error("[AudioController] Audio playback failed.", {
            promptId: options?.promptId || "unknown",
            language: options?.language || "unknown",
            sourceType: options?.sourceType || "REMOTE_URL",
            url: url.replace(/[?#].*$/, ""),
            provider: options?.provider || "recording server",
            error,
          });
        }
        if (played) options?.onEnd?.();
        resolve(played);
      };
      const cancelPlayback = () => settle(false);
      timeout = setTimeout(() => settle(false, new Error("Audio playback timed out.")), 60_000);
      this.activeResolver = cancelPlayback;

      const handleEnded = () => {
        if (this.currentToken !== token) return;
        settle(true);
      };

      const tryWebAudioFallback = async () => {
        const ok = await this.playViaWebAudio(url, token, options);
        settle(ok, ok ? undefined : new Error("Audio could not be decoded or played."));
      };

      audio.onended = handleEnded;

      audio.onerror = () => {
        if (this.currentToken !== token) return;
        void tryWebAudioFallback();
      };

      try {
        audio.volume = this.playbackVolume;
        audio.src = url;
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err: any) => {
            if (this.currentToken === token) {
              if (err?.name === "AbortError" || err?.message?.includes("interrupted")) {
                settle(false, new Error("Audio playback was interrupted."));
              } else {
                void tryWebAudioFallback();
              }
            }
          });
        }
      } catch (error) {
        if (this.currentToken === token) {
          void tryWebAudioFallback().catch(() => settle(false, error instanceof Error ? error : new Error(String(error))));
        }
      }
    });
  }

  /**
   * Plays an array of URLs sequentially.
   * If any item is superseded by another play()/stop(), the sequence aborts cleanly.
   */
  public async playSequence(urls: string[], promptText?: string): Promise<boolean> {
    this.stop();
    const safeUrls = urls.filter(Boolean).map((url) => resolveSafePlayableUrl(url));
    if (safeUrls.length === 0) return false;

    for (const url of safeUrls) {
      const played = await this.play(url, promptText || undefined);
      if (!played) return false;
    }
    return true;
  }
}

export const audioPlaybackController = new AudioPlaybackController();
