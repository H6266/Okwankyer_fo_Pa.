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

import { emitSimulatorLog } from "../lib/simulatorLog";

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
  private audioElement: HTMLAudioElement | null = null;
  private currentToken: number = 0;
  private state: PlaybackState = {
    isPlaying: false,
    activeClip: null,
    activeText: null,
    token: 0,
  };
  private listeners: Set<StateListener> = new Set();
  private activeResolver: ((success: boolean) => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initAudioElement();
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
   * Stop active audio immediately, cancel browser speech synthesis, resolve pending promise, increment token.
   */
  public stop(): void {
    const token = ++this.currentToken;

    // 1. Cancel browser speech synthesis across all windows/contexts
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Silently ignore browser speech cancellation error
      }
    }

    // 2. Pause and reset the authoritative <audio> element
    if (this.audioElement) {
      try {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.audioElement.src = "";
        this.audioElement.onended = null;
        this.audioElement.onerror = null;
      } catch {
        // Silently ignore pause/reset errors
      }
    }

    if (this.activeResolver) {
      const resolve = this.activeResolver;
      this.activeResolver = null;
      resolve(false);
    }

    this.setState({
      isPlaying: false,
      activeClip: null,
      activeText: null,
      token,
    });
  }

  /**
   * Plays a single audio url or PlaybackRequest (supporting studio URLs and synthesized Base64 payloads).
   * Returns a Promise that resolves when audio ends (or resolves false if stopped/superseded).
   */
  public play(
    target: string | PlaybackRequest,
    optionsOrText?: PlayOptions | string
  ): Promise<boolean> {
    // 1. Stop any current playback (including any active speech synthesis) and increment token
    this.stop();
    const token = ++this.currentToken;

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
      // Fix 4: Support generated Base64 TTS audio seamlessly
      if (!url && target.audioBase64) {
        const mime = target.audioMimeType || "audio/mp3";
        url = `data:${mime};base64,${target.audioBase64}`;
      }
      promptText = target.text || null;
      if (typeof optionsOrText === "object") {
        options = optionsOrText;
      }
    }

    if (!url) {
      this.setState({
        isPlaying: false,
        activeClip: null,
        activeText: promptText,
        token,
      });
      return Promise.resolve(false);
    }

    const audio = this.initAudioElement();
    if (!audio) {
      this.setState({
        isPlaying: false,
        activeClip: url,
        activeText: promptText,
        token,
      });
      return Promise.resolve(false);
    }

    const clipSource = typeof target === "object" && target.sourceType ? target.sourceType : (typeof target === "object" && target.audioBase64 ? "SYNTHESIZED_TTS" : "STUDIO_PROMPT");
    const clipLabel = typeof target === "object" && target.id ? target.id : (url.split("/").pop() || "audio");

    return new Promise<boolean>((resolve) => {
      this.activeResolver = () => {
        resolve(false);
      };

      this.setState({
        isPlaying: true,
        activeClip: url,
        activeText: promptText,
        token,
      });

      emitSimulatorLog({
        category: "AUDIO",
        message: `Prompt playback started: clip="${clipLabel}", source=${clipSource}${promptText ? `, text="${promptText.slice(0, 45)}..."` : ""}`,
      });

      options?.onStart?.();

      audio.onended = () => {
        if (this.currentToken !== token) return; // Ignore stale token
        this.activeResolver = null;
        this.setState({
          isPlaying: false,
          activeClip: null,
          activeText: null,
          token,
        });
        emitSimulatorLog({
          category: "AUDIO",
          message: `Prompt playback finished: clip="${clipLabel}"`,
        });
        options?.onEnd?.();
        resolve(true);
      };

      audio.onerror = () => {
        if (this.currentToken !== token) return; // Ignore stale token
        this.activeResolver = null;
        this.setState({
          isPlaying: false,
          activeClip: null,
          activeText: null,
          token,
        });
        emitSimulatorLog({
          category: "AUDIO",
          message: `Prompt playback error: clip="${clipLabel}"`,
        });
        options?.onError?.(new Error("Audio load/decode error"));
        resolve(false);
      };

      try {
        audio.src = url;
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err: any) => {
            // Handle AbortError silently (caused by quick successive play() or user barge-in)
            if (err?.name === "AbortError" || err?.message?.includes("interrupted")) {
              return;
            }
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
