import { describe, expect, it } from "vitest";
import { AdaptiveStreamingVad, DEFAULT_VAD_CONFIG } from "../src/ai_system/speech/asr/audioQuality";
import { resampleAudioToPcm16 } from "../src/lib/audio/continuousVoiceCapture";

describe("Continuous voice audio resampling", () => {
  it("converts native 48 kHz samples to 16 kHz PCM without aliasing grouped samples", () => {
    const input = new Float32Array([1, -1, 0, -1, 1, 0]);

    const result = resampleAudioToPcm16(input, 48000);

    expect(result).toHaveLength(2);
    expect(Array.from(result)).toEqual([0, 0]);
  });

  it("preserves the requested sample count for a 20 ms 48 kHz frame", () => {
    const input = new Float32Array(960);

    expect(resampleAudioToPcm16(input, 48000)).toHaveLength(320);
  });

  it("resamples fractional-rate input to the expected 16 kHz duration", () => {
    const input = new Float32Array(882).fill(0.5);

    const result = resampleAudioToPcm16(input, 44100);

    expect(result).toHaveLength(320);
    expect(Array.from(result).every((sample) => sample === 16384)).toBe(true);
  });

  it("rejects invalid sample rates", () => {
    expect(() => resampleAudioToPcm16(new Float32Array(1), 0)).toThrow(RangeError);
  });

  it("finalizes short utterances after the configured speech and silence thresholds", () => {
    expect(DEFAULT_VAD_CONFIG.ASR_MIN_SPEECH_MS).toBe(300);
    expect(DEFAULT_VAD_CONFIG.ASR_END_SILENCE_MS).toBe(1200);
    expect(DEFAULT_VAD_CONFIG.ASR_MAX_UTTERANCE_MS).toBe(30000);

    const vad = new AdaptiveStreamingVad();
    const speechFrame = Int16Array.from(
      { length: 320 },
      (_, index) => Math.round(Math.sin((20 * Math.PI * index) / 320) * 1000)
    );
    let speechDurationMs = 0;
    for (let frame = 0; frame < 15; frame++) {
      speechDurationMs = vad.processFrame(speechFrame).speechDurationMs;
    }
    expect(speechDurationMs).toBe(300);

    const silenceFrame = new Int16Array(320);
    let turnCompleted = false;
    for (let frame = 0; frame < 100 && !turnCompleted; frame++) {
      turnCompleted = vad.processFrame(silenceFrame).turnCompleted === true;
    }
    expect(turnCompleted).toBe(true);
  });
});
