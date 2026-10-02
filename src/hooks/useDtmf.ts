import { useCallback, useRef } from "react";

// Standard ITU-T Q.23 Dual-Tone Multi-Frequency (DTMF) Frequencies
const DTMF_FREQUENCIES: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

export function useDtmf() {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playTone = useCallback(
    (key: string, durationMs: number = 180) => {
      const freqs = DTMF_FREQUENCIES[key];
      if (!freqs) return;

      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        const now = ctx.currentTime;
        const durSec = durationMs / 1000;

        // Master gain node with exponential ramping to avoid clicks
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.001, now);
        masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.015);
        masterGain.gain.setValueAtTime(0.18, now + durSec - 0.02);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + durSec);
        masterGain.connect(ctx.destination);

        // Low group sine oscillator
        const osc1 = ctx.createOscillator();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(freqs[0], now);
        osc1.connect(masterGain);

        // High group sine oscillator
        const osc2 = ctx.createOscillator();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(freqs[1], now);
        osc2.connect(masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + durSec);
        osc2.stop(now + durSec);
      } catch (err) {
        console.warn("DTMF tone synthesis error:", err);
      }
    },
    [getAudioContext]
  );

  return { playTone };
}
