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
  playbackRate?: number;
  isSlowTts?: boolean;
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
  // Always use universally compatible .mp3 for both .m4a and .aac files
  // so every browser, iframe, and telephony server plays audio with 0 errors
  const mp3Url = url.replace(/\.(m4a|aac)$/i, ".mp3");
  return encodeURI(decodeURI(mp3Url));
}

export class AudioPlaybackController {
  private playbackVolume: number = 1.0;
  private volumeMultiplier: number = 1.0; // Crystal-clear, unclipped master volume (100% natural studio fidelity)
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
  private masterGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private audioUnlocked: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.initAudioElement();
    }
  }

  /**
   * Sets custom audio amplification multiplier (1.0 = clear studio default)
   */
  public setVolumeMultiplier(multiplier: number): void {
    this.volumeMultiplier = Math.max(0.5, Math.min(2.0, multiplier));
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
   * Configures Web Audio signal chain for synthesized tones and DTMF beeps
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
      if (this.audioElement && !this.audioUnlocked && !this.state.isPlaying) {
        this.audioUnlocked = true;
        // Prime HTML5 media element once on initial user gesture
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

    const lower = cleanText.toLowerCase();
    let fallbackStudioUrl = "";

    const isNumberReadback =
      /\b0[235]\d{8}\b/.test(cleanText) ||
      lower.includes("phone nɔmba") ||
      lower.includes("phone number") ||
      lower.includes("nɔmba a ɛdi mũ") ||
      lower.includes("hwee,") ||
      lower.includes("zero,") ||
      lower.includes("din ne") ||
      lower.includes("recipient");

    const effectiveOptions: PlayOptions = {
      ...options,
      isSlowTts: options?.isSlowTts ?? isNumberReadback,
      playbackRate: options?.playbackRate ?? (isNumberReadback ? 0.82 : 1.0),
    };

    // 1. High-priority match to native studio audio recording (Akan Twi ready files)
    try {
      const match = matchReplyToAudio(cleanText, "twi", { minConfidence: 0.30 });
      if (match.match && match.audioUrl) {
        return this.play(match.audioUrl, {
          ...effectiveOptions,
          onStart: () => {
            this.setState({ activeText: cleanText });
            effectiveOptions?.onStart?.();
          },
          onEnd: effectiveOptions?.onEnd,
          onError: effectiveOptions?.onError,
        });
      }
    } catch (matchErr) {
      console.warn("[AudioController] Studio audio matching notice:", matchErr);
    }

    // 2. Intelligent keyword match to authentic Akan Twi studio recordings
    // Do not hijack dynamic recipient KYC readback or amount readback into static input prompts
    const isDynamicReadbackText =
      lower.includes("din ne") ||
      lower.includes("yɛahu") ||
      lower.includes("recipient's name") ||
      lower.includes("we found") ||
      lower.includes("mate sɛ ɛyɛ") ||
      lower.includes("sika dodow a wobɔe") ||
      lower.includes("reference nɔmba");

    if (!isDynamicReadbackText) {
      if (lower.includes("sika") && (lower.includes("dodow") || lower.includes("amount") || lower.includes("cedis") || lower.includes("bɔ"))) {
        fallbackStudioUrl = "/audio/supplied/Twi/4.Amount Entry & Verification/Enter amount 4.m4a";
      } else if (lower.includes("nɔmba") || lower.includes("fon") || lower.includes("recipient") || lower.includes("phone")) {
        fallbackStudioUrl = "/audio/supplied/Twi/3.Recipient Entry & Verification/Enter recipient 2.m4a";
      } else if (lower.includes("pene") || lower.includes("confirm") || lower.includes("approval") || lower.includes("review") || lower.includes("aane")) {
        fallbackStudioUrl = "/audio/supplied/Twi/5.Transaction Confirmation/Review transaction.m4a";
      } else if (lower.includes("pin") || lower.includes("handoff") || lower.includes("ahobammɔ")) {
        fallbackStudioUrl = "/audio/additional/Pin Handoff.m4a";
      } else if (lower.includes("balance") || lower.includes("star") || lower.includes("170")) {
        fallbackStudioUrl = "/audio/supplied/Twi/13.Balance  Unsupported Services/Balance unavailable.aac";
      } else if (lower.includes("mane") || lower.includes("send")) {
        fallbackStudioUrl = "/audio/supplied/Twi/2.Main Service Navigation/Send money selected.m4a";
      } else if (lower.includes("paw") || lower.includes("menyu") || lower.includes("menu")) {
        fallbackStudioUrl = "/audio/supplied/Twi/2.Main Service Navigation/MTN menu 1.m4a";
      } else if (lower.includes("twa") || lower.includes("cancel") || lower.includes("dabi")) {
        fallbackStudioUrl = "/audio/supplied/Twi/11.Navigation & Recovery/Cancel.aac";
      } else if (lower.includes("wie") || lower.includes("success") || lower.includes("medaase") || lower.includes("nante yie")) {
        fallbackStudioUrl = "/audio/supplied/Twi/14.Post-Transaction Conversation/Finish.aac";
      }
    }

    if (fallbackStudioUrl) {
      return this.play(fallbackStudioUrl, {
        ...effectiveOptions,
        onStart: () => {
          this.setState({ activeText: cleanText });
          effectiveOptions?.onStart?.();
        },
        onEnd: effectiveOptions?.onEnd,
        onError: effectiveOptions?.onError,
      });
    }

    // 3. Dynamic Neural Speech Synthesis via backend pipeline for authentic voice
    try {
      const isTwi = /[ɛɔ]|sika|mane|akwaaba|dabi|aane|paw|sidi|nɔmba|yɛsrɛ|nte|frɛ/i.test(cleanText);
      const res = await fetch("/api/ai/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText, language: isTwi ? "twi" : "en" }),
      });
      if (res.ok) {
        const data = await res.json();
        const base64 = data?.result?.audioBase64 || (data?.result?.audioBuffer?.data
          ? btoa(String.fromCharCode(...new Uint8Array(data.result.audioBuffer.data)))
          : null);
        const mimeType = data?.result?.audioMimeType || "audio/wav";
        if (base64) {
          const dataUrl = `data:${mimeType};base64,${base64}`;
          return this.play(dataUrl, {
            ...effectiveOptions,
            onStart: () => {
              this.setState({ activeText: cleanText });
              effectiveOptions?.onStart?.();
            },
            onEnd: effectiveOptions?.onEnd,
            onError: effectiveOptions?.onError,
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
      const rate = options?.playbackRate || (options?.isSlowTts ? 0.82 : 1.0);
      try {
        source.playbackRate.setValueAtTime(rate, this.audioContext.currentTime);
      } catch {
        source.playbackRate.value = rate;
      }
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

    // 2. High-performance Web Audio Buffer playback (immune to HTML5 media element autoplay issues)
    if (this.audioContext && (this.audioBufferCache.has(url) || this.audioContext.state === "running")) {
      const ok = await this.playViaWebAudio(url, token, options);
      if (ok) return true;
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
    const rate = options?.playbackRate || (options?.isSlowTts ? 0.82 : 1.0);
    try {
      audio.playbackRate = rate;
    } catch {}

    return new Promise<boolean>((resolve) => {
      this.activeResolver = () => {
        resolve(false);
      };

      const handleEnded = () => {
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

      const fallbackToText = () => {
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
          playPromise.catch((_err: any) => {
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
    this.stop();
    const sequenceToken = ++this.currentToken;
    const safeUrls = urls
      .filter(Boolean)
      .map((u) => resolveSafePlayableUrl(u.replace(/^https?:\/\/[^/]+(\/audio\/.*)$/i, "$1")));

    for (let url of safeUrls) {
      if (this.currentToken !== sequenceToken) {
        return false;
      }

      const ended = await (async () => {
        // Prefer Web Audio API if AudioContext is active/running
        if (this.audioContext && (this.audioBufferCache.has(url) || this.audioContext.state === "running")) {
          const webAudioOk = await this.playViaWebAudio(url, sequenceToken);
          if (webAudioOk) return true;
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
            p.catch((_err: any) => {
              if (this.currentToken !== sequenceToken) return;
              this.playViaWebAudio(url, sequenceToken).then(resolve);
            });
          }
        });
      })();

      if (!ended && this.currentToken !== sequenceToken) {
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


