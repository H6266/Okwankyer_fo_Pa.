import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioPlayerState {
  isPlaying: boolean;
  isBuffering: boolean;
  currentUrl: string | null;
  currentTime: number;
  duration: number;
  error: string | null;
}

export function useAudioPlayer(onEnded?: () => void) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    isBuffering: false,
    currentUrl: null,
    currentTime: 0,
    duration: 0,
    error: null,
  });

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const handlePlay = () => setState((s) => ({ ...s, isPlaying: true, isBuffering: false, error: null }));
    const handlePause = () => setState((s) => ({ ...s, isPlaying: false }));
    const handleWaiting = () => setState((s) => ({ ...s, isBuffering: true }));
    const handleTimeUpdate = () => {
      setState((s) => ({
        ...s,
        currentTime: audio.currentTime,
        duration: isNaN(audio.duration) ? 0 : audio.duration,
      }));
    };
    const handleEnded = () => {
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
      if (onEndedRef.current) {
        onEndedRef.current();
      }
    };
    const handleError = () => {
      setState((s) => ({
        ...s,
        isPlaying: false,
        isBuffering: false,
        error: "Audio playback encountered an error",
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

  const playAudio = useCallback((url: string) => {
    if (!audioRef.current || !url) return;
    try {
      const normalizedUrl = url.startsWith("http") || url.startsWith("/") || url.startsWith("data:") ? url : `/${url}`;
      if (audioRef.current.src !== normalizedUrl && !audioRef.current.src.endsWith(normalizedUrl)) {
        audioRef.current.src = normalizedUrl;
      }
      audioRef.current.currentTime = 0;
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Audio autoplay blocked or cancelled:", err);
          setState((s) => ({ ...s, isPlaying: false }));
        });
      }
      setState((s) => ({ ...s, currentUrl: normalizedUrl, error: null }));
    } catch (err: any) {
      console.warn("playAudio failed:", err);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (!audioRef.current) return;
    try {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setState((s) => ({ ...s, isPlaying: false, currentTime: 0 }));
    } catch {}
  }, []);

  const pauseAudio = useCallback(() => {
    if (!audioRef.current) return;
    try {
      audioRef.current.pause();
      setState((s) => ({ ...s, isPlaying: false }));
    } catch {}
  }, []);

  return {
    ...state,
    playAudio,
    stopAudio,
    pauseAudio,
  };
}
