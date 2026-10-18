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
  playbackStatus: "idle" | "loading" | "playing" | "completed" | "error";
}

export function useAudioPlayer(onEnded?: () => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
      console.error("[useAudioPlayer] HTML5 audio playback failed.", {
        url: audio.src.replace(/[?#].*$/, ""),
      });
      setState((s) => ({
        ...s,
        isPlaying: false,
        isBuffering: false,
        error: "Audio playback is unavailable.",
        playbackStatus: "error",
      }));
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
      setState((s) => ({
        ...s,
        isPlaying: false,
        currentUrl: null,
        currentPromptId: promptId || null,
        resolvedFilename: filename || null,
        playbackStatus: "error",
        error: "No approved audio URL is available for this prompt.",
      }));
      return;
    }

    try {
      let normalizedUrl =
        url.startsWith("http") || url.startsWith("/") || url.startsWith("data:") ? url : `/${url}`;

      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = normalizedUrl;

      setState((s) => ({
        ...s,
        currentUrl: normalizedUrl,
        currentPromptId: promptId || null,
        resolvedFilename: filename || normalizedUrl.split("/").pop() || null,
        error: null,
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
              error: "Audio playback is unavailable.",
              playbackStatus: "error",
            }));
          }
        });
      }
    } catch (err: any) {
      console.error("[useAudioPlayer] Audio playback failed.", {
        promptId: promptId || "unknown",
        url: url.replace(/[?#].*$/, ""),
        error: err instanceof Error ? err.message : String(err),
      });
      setState((s) => ({
        ...s,
        isPlaying: false,
        isBuffering: false,
        error: "Audio playback is unavailable.",
        playbackStatus: "error",
      }));
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

  return {
    ...state,
    playAudio,
    stopAudio,
    pauseAudio,
  };
}
