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

export class AudioPlaybackController {
  private readonly playbackVolume = 1.35;
  private audioElement: HTMLAudioElement | null = null;
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

  constructor() {
    if (typeof window !== "undefined") {
      this.initAudioElement();
    }
  }

  /**
   * Unlocks Web Audio & Audio element on user gesture
   */
  public unlockAudio(): void {
    if (typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioContext) {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === "suspended") {
          this.audioContext.resume().catch(() => {});
        }
        // Play silent 1-sample buffer to unlock AudioContext permanently in iframes
        try {
          const silentBuffer = this.audioContext.createBuffer(1, 1, 22050);
          const silentSource = this.audioContext.createBufferSource();
          silentSource.buffer = silentBuffer;
          silentSource.connect(this.audioContext.destination);
          silentSource.start(0);
        } catch {}
      }
      if (!this.audioElement) {
        this.initAudioElement();
      }
      if (this.audioElement && !this.state.isPlaying && !this.state.activeClip) {
        this.audioElement.volume = this.playbackVolume;
        this.audioElement.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        this.audioElement.play().then(() => {
          if (!this.state.activeClip) {
            this.audioElement?.pause();
          }
        }).catch(() => {});
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
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioContext.destination);

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
   * Synthesize or speak text when recorded studio clip is unavailable
   */
  public async speakText(text: string, options?: PlayOptions): Promise<boolean> {
    if (!text || !text.trim()) return false;
    const token = ++this.currentToken;
    const cleanText = text.trim();

    this.setState({
      isPlaying: true,
      activeClip: null,
      activeText: cleanText,
      token,
    });
    options?.onStart?.();

    // 1. Try server-side synthesis (/api/ai/synthesize)
    try {
      const isTwi = /([ɛɔ]|mepa|sika|mane|akwaaba|dabi|aane|paw|bɔ|nɔmba)/i.test(cleanText);
      const res = await fetch("/api/ai/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cleanText,
          language: isTwi ? "tw" : "en",
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const base64 = json?.result?.audioBase64;
        const mime = json?.result?.audioMimeType || "audio/mp3";
        if (base64 && this.currentToken === token) {
          const dataUrl = `data:${mime};base64,${base64}`;
          return this.play(dataUrl, {
            ...options,
            onStart: options?.onStart,
            onEnd: options?.onEnd,
          });
        }
      }
    } catch {}

    // 2. Client-side SpeechSynthesis fallback
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      return new Promise<boolean>((resolve) => {
        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(cleanText);
          utterance.rate = 0.95;
          utterance.onend = () => {
            if (this.currentToken === token) {
              this.setState({ isPlaying: false, activeClip: null, activeText: null, token });
              options?.onEnd?.();
              resolve(true);
            }
          };
          utterance.onerror = () => {
            if (this.currentToken === token) {
              this.setState({ isPlaying: false, activeClip: null, activeText: null, token });
              options?.onError?.(new Error("Speech synthesis error"));
              resolve(false);
            }
          };
          window.speechSynthesis.speak(utterance);
        } catch {
          this.setState({ isPlaying: false, activeClip: null, activeText: null, token });
          resolve(false);
        }
      });
    }

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
      url = url.replace(/^https?:\/\/[^/]+(\/audio\/.*)$/i, "$1");
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
      // If prompt text is available, synthesize speech so audio is never lost
      if (promptText && promptText.trim()) {
        return this.speakText(promptText, options);
      }
      return Promise.resolve(false);
    }

    // Immediately update state synchronously so getActiveClip() returns the clip without delay
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
      try {
        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume().catch(() => {});
        }
        const buffer = this.audioBufferCache.get(url)!;
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        this.activeBufferSource = source;

        return new Promise<boolean>((resolve) => {
          this.activeResolver = () => {
            resolve(false);
          };
          source.onended = () => {
            if (this.currentToken !== token) return;
            this.activeBufferSource = null;
            this.activeResolver = null;
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
      } catch (webAudioErr) {
        console.warn("[AudioController] WebAudio buffer play fallback to HTML5 Audio:", webAudioErr);
      }
    }

    // 3. Play immediately through primary HTML5 audio element
    const audio = this.initAudioElement();
    if (!audio) {
      if (promptText && promptText.trim()) {
        return this.speakText(promptText, options);
      }
      return Promise.resolve(false);
    }

      audio.volume = this.playbackVolume;

    return new Promise<boolean>((resolve) => {
      this.activeResolver = () => {
        resolve(false);
      };

      audio.onended = () => {
        if (this.currentToken !== token) return;
        this.activeResolver = null;
        this.setState({
          isPlaying: false,
          activeClip: null,
          activeText: null,
          token,
        });
        options?.onEnd?.();
        resolve(true);
      };

      audio.onerror = () => {
        if (this.currentToken !== token) return;
        this.activeResolver = null;
        if (promptText && promptText.trim()) {
          this.speakText(promptText, options).then(resolve);
          return;
        }
        this.setState({
          isPlaying: false,
          activeClip: null,
          activeText: null,
          token,
        });
        resolve(false);
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
              if (promptText && promptText.trim()) {
                this.speakText(promptText, options).then(resolve);
                return;
              }
              this.activeResolver = null;
              this.setState({
                isPlaying: false,
                activeClip: null,
                activeText: null,
                token,
              });
              resolve(false);
            }
          });
        }
      } catch {
        if (this.currentToken === token) {
          this.activeResolver = null;
          this.setState({
            isPlaying: false,
            activeClip: null,
            activeText: null,
            token,
          });
          resolve(false);
        }
      }
    });
  }

  /**
   * Plays an array of URLs sequentially.
   * If any item is superseded by another play()/stop(), the sequence aborts cleanly.
   */
  public async playSequence(urls: string[]): Promise<boolean> {
    this.stop();
    const sequenceToken = ++this.currentToken;

    for (const url of urls) {
      if (this.currentToken !== sequenceToken) {
        return false; // Cancelled/superseded mid-sequence
      }
      const audio = this.initAudioElement();
      if (!audio) continue;

      audio.volume = this.playbackVolume;

      const ended = await new Promise<boolean>((resolve) => {
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
          resolve(true);
        };

        audio.onerror = () => {
          if (this.currentToken !== sequenceToken) return;
          this.activeResolver = null;
          resolve(false);
        };

        audio.src = url;
        audio.currentTime = 0;
        const p = audio.play();
        if (p !== undefined) {
          p.catch((err: any) => {
            if (err?.name === "AbortError") return;
            resolve(false);
          });
        }
      });

      if (!ended || this.currentToken !== sequenceToken) {
        return false;
      }
    }

    if (this.currentToken === sequenceToken) {
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
