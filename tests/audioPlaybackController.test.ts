import { describe, it, expect, beforeEach, vi } from "vitest";
import { AudioPlaybackController, audioPlaybackController, resolveSafePlayableUrl } from "../src/audio/audioPlaybackController";
import { isAcousticSystemEcho, stripSystemEchoFromTranscript } from "../src/domain/echoFilter";

describe("AudioPlaybackController & Phone Simulator Audio Gating", () => {
  beforeEach(() => {
    audioPlaybackController.stop();
  });

  it("ensures audioPlaybackController allows only one active playback state at a time", () => {
    expect(audioPlaybackController.isSpeaking()).toBe(false);
    expect(audioPlaybackController.getActiveClip()).toBeNull();
  });

  it("stops active playback and resets state cleanly on stop()", () => {
    audioPlaybackController.stop();
    expect(audioPlaybackController.isSpeaking()).toBe(false);
    expect(audioPlaybackController.getActivePromptText()).toBe("");
  });

  it("echo filter correctly identifies and suppresses system audio echoing back into mic", () => {
    const prompt = "Welcome to Okwankyerɛfo Pa Voice Mobile Money! Who would you like to send money to today?";
    const echoTranscript = "Welcome to Okwankyerɛfo Pa Voice Mobile Money";

    // When AI is speaking (isAiSpeaking = true) or within echo window:
    expect(isAcousticSystemEcho(echoTranscript, prompt, true)).toBe(true);

    const stripped = stripSystemEchoFromTranscript(echoTranscript, prompt);
    expect(stripped.trim()).toBe("");

    // Authentic caller speech is not suppressed
    const callerSpeech = "Send 20 cedis to Kwame";
    expect(isAcousticSystemEcho(callerSpeech, prompt, false)).toBe(false);
  });

  it("increments token on every play() and stop() to invalidate stale callbacks", () => {
    const token0 = audioPlaybackController.getCurrentToken();
    audioPlaybackController.stop();
    const token1 = audioPlaybackController.getCurrentToken();
    expect(token1).toBeGreaterThan(token0);

    audioPlaybackController.play("/audio/Welcome_prompt_01.mp3", "Welcome");
    const token2 = audioPlaybackController.getCurrentToken();
    expect(token2).toBeGreaterThan(token1);

    audioPlaybackController.stop();
    const token3 = audioPlaybackController.getCurrentToken();
    expect(token3).toBeGreaterThan(token2);
  });

  it("handles empty or invalid audio URLs gracefully without crashing", async () => {
    const res = await audioPlaybackController.play("");
    expect(res).toBe(false);
    expect(audioPlaybackController.isSpeaking()).toBe(false);
  });

  it("does not replace the active recording when unlocking audio", () => {
    const audioInstances: Array<{ src: string; play: ReturnType<typeof vi.fn> }> = [];
    class MockAudio {
      src = "";
      preload = "";
      volume = 1;
      currentTime = 0;
      play = vi.fn(() => Promise.resolve());
      pause = vi.fn();

      constructor() {
        audioInstances.push(this);
      }
    }

    vi.stubGlobal("window", { AudioContext: undefined });
    vi.stubGlobal("document", {});
    vi.stubGlobal("Audio", MockAudio);

    try {
      const controller = new AudioPlaybackController();
      const mediaElement = audioInstances[0];
      mediaElement.src = "/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3";

      controller.unlockAudio();

      expect(mediaElement.src).toBe("/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3");
      expect(mediaElement.play).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves source audio URLs instead of relabeling AAC/M4A as MP3", () => {
    expect(resolveSafePlayableUrl("/audio/sample.m4a")).toBe("/audio/sample.m4a");
  });

  it("reports a failed sequence instead of marking it as played", async () => {
    await expect(audioPlaybackController.playSequence(["/audio/unavailable.m4a"])).resolves.toBe(false);
  });

  it("clamps the master volume to its supported range", () => {
    audioPlaybackController.setVolumeMultiplier(5);
    expect(audioPlaybackController.getVolumeMultiplier()).toBe(1);
    audioPlaybackController.setVolumeMultiplier(0.1);
    expect(audioPlaybackController.getVolumeMultiplier()).toBe(0.5);
    audioPlaybackController.setVolumeMultiplier(1.5);
    expect(audioPlaybackController.getVolumeMultiplier()).toBe(1);
  });
});
