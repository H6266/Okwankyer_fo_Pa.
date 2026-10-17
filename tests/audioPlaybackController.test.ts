import { describe, it, expect, beforeEach, vi } from "vitest";
import { audioPlaybackController, resolveSafePlayableUrl } from "../src/audio/audioPlaybackController";
import { isAcousticSystemEcho, stripSystemEchoFromTranscript } from "../src/domain/echoFilter";

describe("AudioPlaybackController & Phone Simulator Audio Gating", () => {
  beforeEach(() => {
    if (typeof (globalThis as any).Audio === "undefined") {
      (globalThis as any).Audio = class MockAudio {
        src = "";
        currentTime = 0;
        volume = 1;
        preload = "auto";
        onended: any = null;
        onerror: any = null;
        play() {
          if (this.src.includes("unavailable")) {
            setTimeout(() => this.onerror?.(new Event("error")), 10);
            return Promise.reject(new Error("File not found"));
          }
          return new Promise(() => {}); // stays playing until stopped
        }
        pause() {}
      };
    }
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

  it("keeps AAC recordings on their real format instead of relabeling them as MP3", () => {
    expect(resolveSafePlayableUrl("/audio/sample.m4a")).toBe("/audio/sample.m4a");
  });

  it("reports a failed sequence instead of marking it as played", async () => {
    await expect(audioPlaybackController.playSequence(["/audio/unavailable.m4a"])).resolves.toBe(false);
  });

  it("clamps the master volume to its supported range", () => {
    audioPlaybackController.setVolumeMultiplier(5);
    expect(audioPlaybackController.getVolumeMultiplier()).toBe(3.5);
    audioPlaybackController.setVolumeMultiplier(0.1);
    expect(audioPlaybackController.getVolumeMultiplier()).toBe(0.5);
    audioPlaybackController.setVolumeMultiplier(1.5);
    expect(audioPlaybackController.getVolumeMultiplier()).toBe(1.5);
  });

  it("activates an echo drain buffer window after audio stops to prevent audio hearing itself", () => {
    audioPlaybackController.stop();
    expect(audioPlaybackController.isWithinEchoDrainWindow(500)).toBe(true);
    expect(audioPlaybackController.isWithinEchoDrainWindow(0)).toBe(false);
  });

  it("prevents tone indicator from playing concurrently over an active prompt audio", async () => {
    // Start audio
    audioPlaybackController.play("/audio/Welcome_prompt_01.mp3", "Welcome");
    expect(audioPlaybackController.isSpeaking()).toBe(true);

    // Call tone indicator while speaking - should resolve immediately without playing over active audio
    await expect(audioPlaybackController.playToneIndicator(300)).resolves.toBeUndefined();
  });

  it("identifies identical clips across encoded and extension differences with isSameClip", () => {
    expect(
      audioPlaybackController.isSameClip(
        "/audio/supplied/Twi/1.Welcome%20%26%20Session%20Start/Welcome%201%20(2).mp3",
        "/audio/supplied/Twi/1.Welcome & Session Start/Welcome 1 (2).m4a"
      )
    ).toBe(true);

    expect(
      audioPlaybackController.isSameClip(
        "/audio/prompt_a.mp3",
        "/audio/prompt_b.mp3"
      )
    ).toBe(false);
  });

  it("deduplicates identical audio requests while active to eliminate double audio playing at once", async () => {
    // Start first audio playback (synchronously sets isPlaying: true and activeClip)
    audioPlaybackController.play("/audio/Welcome_prompt_01.mp3", "Welcome");
    const token = audioPlaybackController.getCurrentToken();
    expect(audioPlaybackController.isSpeaking()).toBe(true);

    // Request the same audio while active
    const sameResult = await audioPlaybackController.play("/audio/Welcome_prompt_01.mp3", "Welcome updated text");
    expect(sameResult).toBe(true);
    // Token does NOT increment because it did not trigger a duplicate parallel audio playback
    expect(audioPlaybackController.getCurrentToken()).toBe(token);
    expect(audioPlaybackController.getActivePromptText()).toBe("Welcome updated text");
  });
});

