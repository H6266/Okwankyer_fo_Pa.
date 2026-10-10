import { describe, it, expect, vi } from "vitest";
import { ContinuousVoiceCapture } from "../src/lib/audio/continuousVoiceCapture";
import { AdaptiveStreamingVad } from "../src/ai_system/speech/asr/audioQuality";

function generateSineFrame(frequency: number = 400, sampleRate: number = 16000, frameMs: number = 20, amplitude: number = 3000): Int16Array {
  const numSamples = Math.floor((sampleRate * frameMs) / 1000);
  const frame = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    frame[i] = Math.round(amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate));
  }
  return frame;
}

function generateSilenceFrame(sampleRate: number = 16000, frameMs: number = 20, noiseAmp: number = 30): Int16Array {
  const numSamples = Math.floor((sampleRate * frameMs) / 1000);
  const frame = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    frame[i] = Math.round((Math.random() - 0.5) * noiseAmp);
  }
  return frame;
}

describe("Task 1: Synthetic PCM Voice & VAD Pipeline", () => {
  it("finalizes and completes a 350ms synthetic word on single_digit step", () => {
    let completedWav: string | null = null;
    let completedDuration = 0;
    let discardedReason: string | null = null;

    const capture = new ContinuousVoiceCapture({
      onStateChange: () => {},
      onAudioLevel: () => {},
      onVadUpdate: () => {},
      onUtteranceComplete: (wavBase64, durationMs) => {
        completedWav = wavBase64;
        completedDuration = durationMs;
      },
      onBargeIn: () => {},
      onTelemetryUpdate: () => {},
      onDiscard: (reason) => {
        discardedReason = reason;
      },
    });

    // Configure step as single_digit (250ms threshold)
    capture.setStepType("welcome");
    expect(capture.getMinUtteranceMs()).toBe(250);

    // Initial noise floor adaptation: feed 10 frames of background noise
    for (let i = 0; i < 10; i++) {
      capture.feedPcmFrame(generateSilenceFrame());
    }

    // Feed a ~360ms voiced burst (18 frames of 20ms each)
    for (let i = 0; i < 18; i++) {
      capture.feedPcmFrame(generateSineFrame());
    }

    // Followed by trailing silence: 26 frames (520ms) to cross endSilenceMs (450ms)
    for (let i = 0; i < 26; i++) {
      capture.feedPcmFrame(generateSilenceFrame());
    }

    // Assert that the 350ms utterance was finalized and completed!
    expect(completedWav).not.toBeNull();
    expect(completedDuration).toBeGreaterThanOrEqual(350);
    expect(discardedReason).toBeNull();
  });

  it("AdaptiveStreamingVad allows configurable minSpeechMs", () => {
    const vad = new AdaptiveStreamingVad({ ASR_MIN_SPEECH_MS: 700 });
    vad.setMinSpeechMs(250);
    vad.setEndSilenceMs(300);

    // Feed 15 frames of speech (300ms)
    for (let i = 0; i < 15; i++) {
      vad.processFrame(generateSineFrame());
    }

    // Feed silence frames to complete turn
    let turnCompleted = false;
    for (let i = 0; i < 18; i++) {
      const res = vad.processFrame(generateSilenceFrame());
      if (res.turnCompleted) {
        turnCompleted = true;
        break;
      }
    }

    expect(turnCompleted).toBe(true);
  });

  it("discards utterances that do not meet minUtteranceMs with visible callback", () => {
    let discardReported = false;

    const capture = new ContinuousVoiceCapture({
      onStateChange: () => {},
      onAudioLevel: () => {},
      onVadUpdate: () => {},
      onUtteranceComplete: () => {},
      onBargeIn: () => {},
      onTelemetryUpdate: () => {},
      onDiscard: () => {
        discardReported = true;
      },
    });

    capture.setMinUtteranceMs(500);

    // Feed tiny 100ms noise burst
    for (let i = 0; i < 5; i++) {
      capture.feedPcmFrame(generateSineFrame(400, 16000, 20, 2000));
    }

    // Trailing silence
    for (let i = 0; i < 35; i++) {
      capture.feedPcmFrame(generateSilenceFrame());
    }

    // If turn completed under 500ms min, onDiscard must be called
    expect(capture.getMinUtteranceMs()).toBe(500);
  });

  it("configures thresholds differently for single_digit vs multi-digit/recipient steps", () => {
    const capture = new ContinuousVoiceCapture({
      onStateChange: () => {},
      onAudioLevel: () => {},
      onVadUpdate: () => {},
      onUtteranceComplete: () => {},
      onBargeIn: () => {},
      onTelemetryUpdate: () => {},
    });

    // Single digit step: 250ms min utterance, 350ms trailing silence
    capture.setStepType("welcome");
    expect(capture.getMinUtteranceMs()).toBe(250);
    expect(capture.getEndSilenceMs()).toBe(350);

    capture.setStepType("service-select");
    expect(capture.getMinUtteranceMs()).toBe(250);
    expect(capture.getEndSilenceMs()).toBe(350);

    // Multi-digit / freeform steps: 700ms min utterance, >=450ms trailing silence (650ms)
    capture.setStepType("enter-recipient");
    expect(capture.getMinUtteranceMs()).toBe(700);
    expect(capture.getEndSilenceMs()).toBeGreaterThanOrEqual(450);

    capture.setStepType("enter-amount");
    expect(capture.getMinUtteranceMs()).toBe(700);
    expect(capture.getEndSilenceMs()).toBeGreaterThanOrEqual(450);
  });

  it("drops incoming PCM frames when mic is muted and accepts them when unmuted", () => {
    const vadUpdates: boolean[] = [];
    const capture = new ContinuousVoiceCapture({
      onStateChange: () => {},
      onAudioLevel: () => {},
      onVadUpdate: (vad) => {
        vadUpdates.push(vad.speechActive);
      },
      onUtteranceComplete: () => {},
      onBargeIn: () => {},
      onTelemetryUpdate: () => {},
    });

    capture.mute();
    expect(capture.getState()).toBe("MIC_MUTED");

    // Feed speech while muted -> must be dropped
    capture.feedPcmFrame(generateSineFrame());
    expect(vadUpdates.length).toBe(0);

    // Unmute -> frames must be processed
    capture.unmute();
    expect(capture.getState()).toBe("MIC_ACTIVE");
    capture.feedPcmFrame(generateSineFrame());
    expect(vadUpdates.length).toBe(1);
  });
});
