import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolveAudio, clearTtsCache, getTtsCacheSize } from "../src/audio/audioResolver";
import { ttsRouter } from "../src/ai_system/speech/tts/ttsRouter";

describe("audioResolver", () => {
  beforeEach(() => {
    clearTtsCache();
    vi.restoreAllMocks();
  });

  it("library hit: resolves fixed studio clip in catalog by replyKey and language", async () => {
    const res = await resolveAudio({
      replyKey: "welcome",
      replyText: "Welcome to Ɔkwankyerɛfo Pa. For English, press 1. For Twi, press 2.",
      language: "en",
    });

    expect(res.kind).toBe("library");
    if (res.kind === "library") {
      expect(res.url).toBe("/audio/Welcome_prompt_01.mp3");
      expect(res.clip).toBe("Welcome_prompt_01.mp3");
      expect(res.replyKey).toBe("welcome");
      expect(res.reason).toContain("library hit");
    }
  });

  it("library hit: resolves enter_recipient prompt for Twi", async () => {
    const res = await resolveAudio({
      replyKey: "enter_recipient",
      replyText: "Yɛsrɛ wo, bɔ fon nɔmba a ɛyɛ du na fa hash ka ho.",
      language: "twi",
    });

    expect(res.kind).toBe("library");
    if (res.kind === "library") {
      expect(res.url).toBe("/audio/Twi/Audio_prompt_twi_05.mp3");
      expect(res.clip).toBe("Audio_prompt_twi_05.mp3");
    }
  });

  it("TTS route: dynamic reply with name and amount routes to TTS", async () => {
    const synthSpy = vi.spyOn(ttsRouter, "synthesize").mockResolvedValue({
      audioBase64: "base64audio...",
      audioMimeType: "audio/wav",
      durationEstimateSec: 3,
      providerUsed: "mock_neural_piper",
    });

    const res = await resolveAudio({
      replyKey: "confirm_transaction",
      replyText: "You are about to send 500 cedis to Kwame Mensah. Are you sure you want to send this money?",
      language: "en",
    });

    expect(res.kind).toBe("tts");
    if (res.kind === "tts") {
      expect(res.text).toContain("Kwame Mensah");
      expect(res.provider).toBe("mock_neural_piper");
      expect(res.cached).toBe(false);
      expect(res.reason).toContain("dynamic parts -> TTS");
    }
    expect(synthSpy).toHaveBeenCalledTimes(1);
  });

  it("TTS route: caches dynamic reply so second call returns from cache without synthesizing again", async () => {
    const synthSpy = vi.spyOn(ttsRouter, "synthesize").mockResolvedValue({
      audioBase64: "cached_audio_data",
      audioMimeType: "audio/wav",
      durationEstimateSec: 2,
      providerUsed: "mock_provider",
    });

    const replyText = "You are about to send 100 cedis to Ama Serwaa.";

    // First call: cache miss
    const first = await resolveAudio({
      replyKey: "confirm_transaction",
      replyText,
      language: "en",
    });
    expect(first.kind).toBe("tts");
    if (first.kind === "tts") {
      expect(first.cached).toBe(false);
    }
    expect(synthSpy).toHaveBeenCalledTimes(1);
    expect(getTtsCacheSize()).toBe(1);

    // Second call: cache hit!
    const second = await resolveAudio({
      replyKey: "confirm_transaction",
      replyText,
      language: "en",
    });
    expect(second.kind).toBe("tts");
    if (second.kind === "tts") {
      expect(second.cached).toBe(true);
      expect(second.provider).toBe("mock_provider");
      expect(second.reason).toContain("TTS cache hit");
    }
    // synthSpy should NOT be called again
    expect(synthSpy).toHaveBeenCalledTimes(1);
  });
});
