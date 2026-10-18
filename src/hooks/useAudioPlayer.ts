import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioPlayerState {
  isPlaying: boolean;
  isBuffering: boolean;
  currentUrl: string | null;
  currentPromptId: string | null;
  resolvedFilename: string | null;
  currentTime: number;
  duration: number;
  error: string | null;
  isToneFallback: boolean;
  playbackStatus: "idle" | "loading" | "playing" | "completed" | "error" | "tone_fallback";
}

/**
 * Generates a gentle dual-frequency IVR guidance tone using the Web Audio API.
 * Frequency: 440Hz (A4) / 880Hz (A5) with smooth sine envelope.
 * Duration: ~350ms.
 */
function playGuidanceTone(onComplete?: () => void): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      if (onComplete) setTimeout(onComplete, 350);
      return;
    }
    const ctx = new AudioContextClass();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);
    osc2.stop(ctx.currentTime + 0.35);

    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
      if (onComplete) onComplete();
    }, 380);
  } catch (err) {
    console.warn("[useAudioPlayer] Web Audio API tone synthesis notice:", err);
    if (onComplete) setTimeout(onComplete, 350);
  }
}

export function useAudioPlayer(onEnded?: () => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const mediaSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const playbackIdRef = useRef<number>(0);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isBuffering: false,
    currentUrl: null,
    currentPromptId: null,
    resolvedFilename: null,
    currentTime: 0,
    duration: 0,
    error: null,
    isToneFallback: false,
    playbackStatus: "idle",
  });

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const handlePlay = () => {
      setState((s) => ({
        ...s,
        isPlaying: true,
        isBuffering: false,
        error: null,
        playbackStatus: "playing",
      }));
    };

    const handlePause = () => {
      setState((s) => ({
        ...s,
        isPlaying: false,
        playbackStatus: s.playbackStatus === "playing" ? "idle" : s.playbackStatus,
      }));
    };

    const handleWaiting = () => {
      setState((s) => ({
        ...s,
        isBuffering: true,
        playbackStatus: "loading",
      }));
    };

    const handleTimeUpdate = () => {
      setState((s) => ({
        ...s,
        currentTime: audio.currentTime,
        duration: isNaN(audio.duration) ? 0 : audio.duration,
      }));
    };

    const handleEnded = () => {
      setState((s) => ({
        ...s,
        isPlaying: false,
        currentTime: 0,
        playbackStatus: "completed",
      }));
      if (onEndedRef.current) {
        onEndedRef.current();
      }
    };

    const handleError = () => {
      console.warn("[useAudioPlayer] HTML5 audio load/decode error for:", audio.src);
      // On error, invoke tone fallback so the session does not freeze
      setState((s) => ({
        ...s,
        isPlaying: false,
        isBuffering: false,
        error: "Audio playback unavailable; tone indicator emitted.",
        isToneFallback: true,
        playbackStatus: "tone_fallback",
      }));
      playGuidanceTone(() => {
        if (onEndedRef.current) onEndedRef.current();
      });
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.pause();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audioRef.current = null;
    };
  }, []);

  const playAudio = useCallback((url: string, promptId?: string, filename?: string) => {
    playbackIdRef.current += 1;
    const currentPlaybackId = playbackIdRef.current;

    if (!audioRef.current || !url) {
      // Missing audio URL -> Play gentle tone fallback and complete safely
      setState((s) => ({
        ...s,
        isPlaying: false,
        currentUrl: null,
        currentPromptId: promptId || null,
        resolvedFilename: filename || "Tone Indicator (Missing Recording)",
        isToneFallback: true,
        playbackStatus: "tone_fallback",
        error: null,
      }));
      playGuidanceTone(() => {
        if (playbackIdRef.current === currentPlaybackId && onEndedRef.current) {
          onEndedRef.current();
        }
      });
      return;
    }

    try {
      let normalizedUrl =
        url.startsWith("http") || url.startsWith("/") || url.startsWith("data:") ? url : `/${url}`;
      normalizedUrl = normalizedUrl.replace(/\.(m4a|aac)$/i, ".mp3");

      if (typeof window !== "undefined") {
        try {
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (!audioContextRef.current && AudioCtx) {
            audioContextRef.current = new AudioCtx();
          }
          if (audioContextRef.current && audioContextRef.current.state === "suspended") {
            audioContextRef.current.resume().catch(() => {});
          }
          if (audioContextRef.current && !gainNodeRef.current) {
            const comp = audioContextRef.current.createDynamicsCompressor();
            comp.threshold.setValueAtTime(-12, audioContextRef.current.currentTime);
            comp.knee.setValueAtTime(30, audioContextRef.current.currentTime);
            comp.ratio.setValueAtTime(12, audioContextRef.current.currentTime);

            const gain = audioContextRef.current.createGain();
            gain.gain.setValueAtTime(2.4, audioContextRef.current.currentTime); // 2.4x amplified volume

            comp.connect(gain);
            gain.connect(audioContextRef.current.destination);
            gainNodeRef.current = gain;

            if (audioRef.current && !mediaSourceRef.current) {
              try {
                mediaSourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
                mediaSourceRef.current.connect(comp);
              } catch {}
            }
          }
        } catch (e) {
          console.warn("[useAudioPlayer] Audio amplification setup notice:", e);
        }
      }

      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = normalizedUrl;

      setState((s) => ({
        ...s,
        currentUrl: normalizedUrl,
        currentPromptId: promptId || null,
        resolvedFilename: filename || normalizedUrl.split("/").pop() || null,
        error: null,
        isToneFallback: false,
        playbackStatus: "loading",
      }));

      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err?.name === "AbortError") {
            return;
          }
          console.warn("[useAudioPlayer] Play attempt notice:", err?.message || err);
          if (playbackIdRef.current === currentPlaybackId) {
            setState((s) => ({
              ...s,
              isPlaying: false,
              isToneFallback: true,
              playbackStatus: "tone_fallback",
            }));
            playGuidanceTone(() => {
              if (playbackIdRef.current === currentPlaybackId && onEndedRef.current) {
                onEndedRef.current();
              }
            });
          }
        });
      }
    } catch (err: any) {
      console.warn("[useAudioPlayer] playAudio exception:", err);
      playGuidanceTone(() => {
        if (playbackIdRef.current === currentPlaybackId && onEndedRef.current) {
          onEndedRef.current();
        }
      });
    }
  }, []);

  const stopAudio = useCallback(() => {
    playbackIdRef.current += 1;
    if (!audioRef.current) return;
    try {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0, playbackStatus: "idle" }));
    } catch {}
  }, []);

  const pauseAudio = useCallback(() => {
    if (!audioRef.current) return;
    try {
      audioRef.current.pause();
      setState((s) => ({ ...s, isPlaying: false, playbackStatus: "idle" }));
    } catch {}
  }, []);

  const triggerToneFallback = useCallback((onComplete?: () => void) => {
    playbackIdRef.current += 1;
    const currentPlaybackId = playbackIdRef.current;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {}
    }
    setState((s) => ({
      ...s,
      isPlaying: false,
      isToneFallback: true,
      playbackStatus: "tone_fallback",
    }));
    playGuidanceTone(() => {
      if (playbackIdRef.current === currentPlaybackId) {
        if (onComplete) onComplete();
        else if (onEndedRef.current) onEndedRef.current();
      }
    });
  }, []);

  return {
    ...state,
    playAudio,
    stopAudio,
    pauseAudio,
    triggerToneFallback,
  };
}
