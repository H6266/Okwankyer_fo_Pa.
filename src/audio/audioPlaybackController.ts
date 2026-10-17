/**
 * Ɔkwankyerɛfo Pa - Authoritative Audio Playback Controller
 *
 * Requirements:
 * 1. Single authoritative owner of audio playback across the simulator.
 * 2. Strictly ONE audio plays at a time — zero double playback, zero overlapping, zero echo.
 * 3. Every play() stops the previous one and increments an internal token.
 * 4. Stale ended/error/play() results from older tokens are strictly ignored.
 * 5. play(url) returns a Promise that resolves when audio completes (or cancels).
 * 6. playSequence([urls]) plays an ordered array of clips ONE AT A TIME with a smooth acoustic breath gap.
 * 7. State isPlaying remains true throughout the entire sequence, keeping the microphone gated until fully done.
 * 8. stop() cancels active playback cleanly and immediately.
 * 9. Direct HTML5 audio element output to speakers guarantees 100% reliable sound with no AudioContext suspension or CORS silencing.
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
 * If the browser lacks AAC support, returns false so the playback controller routes to universal MP3.
 */
export function canBrowserPlayM4a(): boolean {
  if (typeof document === "undefined" || typeof Audio === "undefined") return true;
  try {
    const probe = new Audio();
    const canPlayMp4 =
      probe.canPlayType('audio/mp4; codecs="mp4a.40.2"') ||
      probe.canPlayType("audio/mp4") ||
      probe.canPlayType("audio/x-m4a");
    return canPlayMp4 === "probably" || canPlayMp4 === "maybe";
  } catch {
    return true;
  }
}

/**
 * Ensures audio URLs are properly formatted and encoded for safe web fetching and playback.
 */
export function resolveSafePlayableUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  let url = rawUrl.trim();

  // Strip absolute origin if same-origin / audio path
  url = url.replace(/^https?:\/\/[^/]+(\/audio\/.*)$/i, "$1");

  // If browser cannot play M4A, rewrite to .mp3 mirror
  if (!canBrowserPlayM4a() && /\.(m4a|aac)$/i.test(url)) {
    url = url.replace(/\.(m4a|aac)$/i, ".mp3");
  }

  // Ensure safe URI encoding for special characters like spaces, brackets, etc.
  try {
    if (url.startsWith("/audio/")) {
      const parts = url.split("/");
      const encodedParts = parts.map((part, idx) => {
        if (idx < 2) return part; // "" and "audio"
        // Decode first if already partially encoded to prevent double-encoding
        const decoded = decodeURIComponent(part);
        return encodeURIComponent(decoded);
      });
      return encodedParts.join("/");
    }
  } catch {}

  return url;
}

export class AudioPlaybackController {
  private playbackVolume: number = 1.0;
  private volumeMultiplier: number = 2.8;
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
  private lastPlaybackEndTime: number = 0;
  private isUnlocked: boolean = false;

  // Web Audio Context for DTMF tones and acoustic indicators only
  private audioContext: AudioContext | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initAudioElement();
    }
  }

  public getLastPlaybackEndTime(): number {
    return this.lastPlaybackEndTime;
  }

  public isWithinEchoDrainWindow(bufferMs: number = 400): boolean {
    return Date.now() - this.lastPlaybackEndTime < bufferMs;
  }

  public setVolumeMultiplier(multiplier: number): void {
    if (!Number.isFinite(multiplier)) return;
    this.volumeMultiplier = Math.max(0.5, Math.min(3.5, multiplier));
  }

  public getVolumeMultiplier(): number {
    return this.volumeMultiplier;
  }

  /**
   * Initializes the persistent HTML5 Audio element.
   * Direct output to speakers guarantees 100% sound delivery with no CORS silencing or AudioContext suspension bugs.
   */
  private initAudioElement(): HTMLAudioElement | null {
    if (this.audioElement) return this.audioElement;
    if (typeof Audio === "undefined") return null;

    try {
      const audio = new Audio();
      audio.preload = "auto";
      audio.volume = this.playbackVolume;
      try {
        audio.crossOrigin = "anonymous";
      } catch {}
      this.audioElement = audio;
      return this.audioElement;
    } catch {
      return null;
    }
  }

  /**
   * Enables Web Audio & Audio element on user gesture
   */
  public enableAudio(): void {
    this.unlockAudio();
  }

  /**
   * Unlocks Web Audio & Audio element on user gesture.
   * Safe to call multiple times; does NOT interrupt actively playing audio.
   */
  public unlockAudio(): void {
    if (typeof window === "undefined") return;

    try {
      // Resume Web Audio Context if suspended
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioContext) {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === "suspended") {
          this.audioContext.resume().catch(() => {});
        }
      }

      // Initialize audio element
      const audio = this.initAudioElement();
      if (audio && !this.isUnlocked && !this.state.isPlaying) {
        this.isUnlocked = true;
        // Prime the audio element on user gesture so subsequent plays start with zero latency
        audio.load();
      }
    } catch (err) {
      console.warn("[AudioController] Unlock audio notice:", err);
    }
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
   */
  public playToneIndicator(durationMs: number = 350): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
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
   * Prioritizes ready Akan Twi studio audio recordings via matchReplyToAudio & keyword matcher.
   * Absolutely zero synthetic TTS after user input: uses backend synthesizer or ready recordings.
   */
  public async speakText(text: string, options?: PlayOptions): Promise<boolean> {
    if (!text || !text.trim()) return false;
    const cleanText = text.trim();

    // 1. High-priority match to native studio audio recording (Akan Twi ready files)
    try {
      const match = matchReplyToAudio(cleanText, "twi", { minConfidence: 0.30 });
      if (match.match && match.audioUrl) {
        return this.play(match.audioUrl, {
          ...options,
          onStart: () => {
            this.setState({ activeText: cleanText });
            options?.onStart?.();
          },
        });
      }
    } catch (matchErr) {
      console.warn("[AudioController] Studio audio matching notice:", matchErr);
    }

    // 2. Intelligent keyword match to authentic Akan Twi studio recordings
    const lower = cleanText.toLowerCase();
    let fallbackStudioUrl: string | null = null;
    if (lower.includes("nɔmba") || lower.includes("fon") || lower.includes("recipient") || lower.includes("phone") || lower.includes("obi a woremane")) {
      fallbackStudioUrl = "/audio/supplied/Twi/3.Recipient Entry & Verification/Enter recipient 2.mp3";
    } else if (
      (!lower.includes("nɔmba") && !lower.includes("fon") && !lower.includes("recipient")) &&
      (lower.includes("dodow") || lower.includes("amount") || lower.includes("cedis") || lower.includes("pesewas") || (lower.includes("sika") && (lower.includes("dodow") || lower.includes("cedi") || lower.includes("bɔ sika"))))
    ) {
      fallbackStudioUrl = "/audio/supplied/Twi/4.Amount Entry & Verification/Enter amount 4.mp3";
    } else if (lower.includes("pene") || lower.includes("confirm") || lower.includes("approval") || lower.includes("review") || lower.includes("aane")) {
      fallbackStudioUrl = "/audio/supplied/Twi/5.Transaction Confirmation/Review transaction.mp3";
    } else if (lower.includes("pin") || lower.includes("handoff") || lower.includes("ahobammɔ")) {
      fallbackStudioUrl = "/audio/supplied/Twi/7.Handset PIN Delivery & Handoff/Pin handoff.mp3";
    } else if (lower.includes("balance") || lower.includes("star") || lower.includes("170")) {
      fallbackStudioUrl = "/audio/supplied/Twi/13.Balance  Unsupported Services/Balance unavailable.mp3";
    } else if (lower.includes("mane") || lower.includes("send")) {
      fallbackStudioUrl = "/audio/supplied/Twi/2.Main Service Navigation/Send money selected.mp3";
    } else if (lower.includes("paw") || lower.includes("menyu") || lower.includes("menu")) {
      fallbackStudioUrl = "/audio/supplied/Twi/2.Main Service Navigation/MTN menu 1.mp3";
    } else if (lower.includes("twa") || lower.includes("cancel") || lower.includes("dabi")) {
      fallbackStudioUrl = "/audio/supplied/Twi/11.Navigation & Recovery/Cancel.mp3";
    } else if (lower.includes("wie") || lower.includes("success") || lower.includes("medaase") || lower.includes("nante yie")) {
      fallbackStudioUrl = "/audio/supplied/Twi/14.Post-Transaction Conversation/Finish.mp3";
    }

    if (fallbackStudioUrl) {
      return this.play(fallbackStudioUrl, {
        ...options,
        onStart: () => {
          this.setState({ activeText: cleanText });
          options?.onStart?.();
        },
      });
    }

    // 3. Dynamic Neural Speech Synthesis via backend pipeline
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
          return this.play(dataUrl, options);
        }
      }
    } catch (synthErr) {
      console.warn("[AudioController] Speech synthesis notice:", synthErr);
    }

    // Gentle guidance tone if no audio available
    await this.playToneIndicator();
    return true;
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

  private isSameClip(clipA: string | null, clipB: string | null): boolean {
    if (!clipA || !clipB) return false;
    const normalize = (c: string) => {
      try {
        const pathname = new URL(c, "http://localhost").pathname;
        return decodeURIComponent(pathname).toLowerCase().replace(/\.(m4a|aac|mp3)$/i, "");
      } catch {
        return c.toLowerCase().replace(/\.(m4a|aac|mp3)$/i, "");
      }
    };
    return normalize(clipA) === normalize(clipB);
  }

  /**
   * Stop active audio immediately, resolve pending promise, increment token.
   * Cleans up audio element so nothing can linger.
   * @param broadcast If true, notifies all subscribers with isPlaying: false.
   * Set to false when immediately transitioning to a new clip to prevent unpause flap.
   */
  public stop(broadcast: boolean = true): void {
    const token = ++this.currentToken;
    this.lastPlaybackEndTime = Date.now();

    if (this.audioElement) {
      try {
        this.audioElement.onended = null;
        this.audioElement.onerror = null;
        this.audioElement.onplay = null;
        this.audioElement.onpause = null;
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
   * Plays a single audio url. Accepts either a url string or a PlaybackRequest object.
   * Returns a Promise that resolves when audio ends (or resolves immediately if stopped).
   * Enforces STRICT single-audio concurrency: only ONE sound plays at a time.
   */
  public async play(
    target: string | PlaybackRequest,
    optionsOrText?: PlayOptions | string
  ): Promise<boolean> {
    let rawUrl = "";
    let promptText: string | null = null;
    let options: PlayOptions | undefined;

    if (typeof target === "string") {
      rawUrl = target;
      if (typeof optionsOrText === "string") {
        promptText = optionsOrText;
      } else if (optionsOrText) {
        options = optionsOrText;
      }
    } else if (target && typeof target === "object") {
      rawUrl = target.url || "";
      if (!rawUrl && target.audioBase64) {
        rawUrl = `data:${target.audioMimeType || "audio/wav"};base64,${target.audioBase64}`;
      }
      promptText = target.text || null;
      if (typeof optionsOrText === "object") {
        options = optionsOrText;
      }
    }

    const url = rawUrl ? resolveSafePlayableUrl(rawUrl) : "";

    // STRICT CHECK: If identical clip is already actively playing, DO NOT trigger a second playback!
    if (url && this.state.isPlaying && this.isSameClip(this.state.activeClip, url)) {
      if (promptText && promptText !== this.state.activeText) {
        this.setState({ activeText: promptText });
      }
      return true;
    }

    // Stop any current playback cleanly without emitting an intermediate idle flap
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
      return false;
    }

    const audio = this.initAudioElement();
    if (!audio) {
      if (promptText && promptText.trim()) {
        return this.speakText(promptText, options);
      }
      return false;
    }

    this.setState({
      isPlaying: true,
      activeClip: url,
      activeText: promptText,
      token,
    });
    options?.onStart?.();

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const finish = (result: boolean) => {
        if (resolved) return;
        resolved = true;
        this.activeResolver = null;
        if (this.currentToken === token) {
          this.lastPlaybackEndTime = Date.now();
          this.setState({
            isPlaying: false,
            activeClip: null,
            activeText: null,
            token,
          });
          if (result) {
            options?.onEnd?.();
          }
        }
        resolve(result);
      };

      this.activeResolver = () => {
        finish(false);
      };

      audio.onended = () => {
        if (this.currentToken !== token) {
          finish(false);
          return;
        }
        finish(true);
      };

      audio.onerror = (e) => {
        if (this.currentToken !== token) {
          finish(false);
          return;
        }
        console.warn("[AudioController] Audio element load error for:", url, e);
        if (promptText && promptText.trim()) {
          this.speakText(promptText, options).then(resolve);
        } else {
          finish(false);
        }
      };

      try {
        audio.src = url;
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err: any) => {
            if (err?.name === "AbortError" || err?.message?.includes("interrupted")) {
              // Interrupted by a newer play() call or stop()
              return;
            }
            if (this.currentToken === token) {
              console.warn("[AudioController] play() rejected:", err);
              if (promptText && promptText.trim()) {
                this.speakText(promptText, options).then(resolve);
              } else {
                finish(false);
              }
            }
          });
        }
      } catch (playErr) {
        if (this.currentToken === token) {
          console.warn("[AudioController] play invocation exception:", playErr);
          if (promptText && promptText.trim()) {
            this.speakText(promptText, options).then(resolve);
          } else {
            finish(false);
          }
        }
      }
    });
  }

  /**
   * Plays an array of URLs sequentially.
   * Guarantees that each clip plays ONE AT A TIME with NO overlaps and NO double audio.
   * Maintains isPlaying: true throughout the entire sequence so mic stays OFF.
   */
  public async playSequence(urls: string[]): Promise<boolean> {
    this.stop(false);
    const sequenceToken = ++this.currentToken;
    const safeUrls = urls
      .filter(Boolean)
      .map((u) => resolveSafePlayableUrl(u));

    if (safeUrls.length === 0) return false;

    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new CustomEvent("audiocontroller:playing", { detail: { url: safeUrls[0] } }));
      } catch {}
    }

    const audio = this.initAudioElement();
    if (!audio) return false;

    // Maintain isPlaying: true across the entire sequence so mic stays OFF
    this.setState({
      isPlaying: true,
      activeClip: safeUrls[0],
      activeText: null,
      token: sequenceToken,
    });

    for (let i = 0; i < safeUrls.length; i++) {
      const url = safeUrls[i];
      if (this.currentToken !== sequenceToken) {
        return false;
      }

      // Small 80ms acoustic breath gap between sequence items so clips don't collide or echo
      if (i > 0) {
        await new Promise((r) => setTimeout(r, 80));
        if (this.currentToken !== sequenceToken) {
          return false;
        }
      }

      this.setState({ activeClip: url });

      const clipEnded = await new Promise<boolean>((resolve) => {
        let clipResolved = false;

        const onClipFinish = (result: boolean) => {
          if (clipResolved) return;
          clipResolved = true;
          this.activeResolver = null;
          resolve(result);
        };

        this.activeResolver = () => onClipFinish(false);

        audio.onended = () => {
          if (this.currentToken !== sequenceToken) {
            onClipFinish(false);
            return;
          }
          this.lastPlaybackEndTime = Date.now();
          onClipFinish(true);
        };

        audio.onerror = (e) => {
          if (this.currentToken !== sequenceToken) {
            onClipFinish(false);
            return;
          }
          console.warn("[AudioController] Sequence audio error on:", url, e);
          onClipFinish(false);
        };

        try {
          audio.src = url;
          audio.currentTime = 0;
          const p = audio.play();
          if (p !== undefined) {
            p.catch((err: any) => {
              if (err?.name === "AbortError" || err?.message?.includes("interrupted")) {
                onClipFinish(false);
                return;
              }
              if (this.currentToken !== sequenceToken) {
                onClipFinish(false);
                return;
              }
              console.warn("[AudioController] Sequence play() notice on:", url, err);
              onClipFinish(false);
            });
          }
        } catch {
          onClipFinish(false);
        }
      });

      if (!clipEnded) {
        // If clip was aborted by user action or error, exit sequence cleanly
        if (this.currentToken === sequenceToken) {
          this.lastPlaybackEndTime = Date.now();
          this.setState({
            isPlaying: false,
            activeClip: null,
            activeText: null,
            token: sequenceToken,
          });
        }
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
