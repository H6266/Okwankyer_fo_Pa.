import { describe, it, expect, beforeEach, vi } from "vitest";
import { audioPlaybackController } from "../src/audio/audioPlaybackController";
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
});
