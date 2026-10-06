import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getSpeechProviderMode,
  getActiveAsrProvider,
  getActiveTtsProvider,
  freeAsrProvider,
  ugHciLabAsrProvider,
  freeTtsProvider,
  ugHciLabTtsProvider,
} from "../src/ai_system/speech/speechProvider";

describe("Pluggable Speech Engine Architecture", () => {
  const originalEnv = process.env.SPEECH_PROVIDER;

  afterEach(() => {
    process.env.SPEECH_PROVIDER = originalEnv;
    vi.restoreAllMocks();
  });

  it("defaults to 'free' mode for offline prototype (Vosk + Piper)", () => {
    delete process.env.SPEECH_PROVIDER;
    expect(getSpeechProviderMode()).toBe("free");

    const asr = getActiveAsrProvider("en");
    expect(asr.name).toBe("vosk-offline-asr");

    const tts = getActiveTtsProvider("en");
    expect(tts.name).toBe("piper-offline-tts");
  });

  it("switches to 'hci_lab' mode via config without altering app logic", () => {
    process.env.SPEECH_PROVIDER = "hci_lab";
    expect(getSpeechProviderMode()).toBe("hci_lab");

    const asr = getActiveAsrProvider("tw");
    expect(asr.name).toBe("ug-hci-lab-asr");

    const tts = getActiveTtsProvider("tw");
    expect(tts.name).toBe("ug-hci-lab-tts");
  });

  it("supports 'hybrid' mode (local Vosk/Piper for English, UG HCI Lab for Akan Twi)", () => {
    process.env.SPEECH_PROVIDER = "hybrid";
    expect(getSpeechProviderMode()).toBe("hybrid");

    const asrEn = getActiveAsrProvider("en");
    expect(asrEn.name).toBe("vosk-offline-asr");

    const asrTw = getActiveAsrProvider("tw");
    expect(asrTw.name).toBe("ug-hci-lab-asr");

    const ttsEn = getActiveTtsProvider("en");
    expect(ttsEn.name).toBe("piper-offline-tts");

    const ttsTw = getActiveTtsProvider("tw");
    expect(ttsTw.name).toBe("ug-hci-lab-tts");
  });

  it("freeAsrProvider handles offline server gracefully in health check", async () => {
    const health = await freeAsrProvider.checkHealth();
    expect(health.provider).toBe("vosk-offline-asr");
    expect(typeof health.ready).toBe("boolean");
  });

  it("ugHciLabAsrProvider handles offline/unconfigured endpoint gracefully", async () => {
    const health = await ugHciLabAsrProvider.checkHealth();
    expect(health.languages).toContain("tw");
    expect(health.languages).toContain("en");
  });

  it("freeTtsProvider handles offline server gracefully in health check", async () => {
    const health = await freeTtsProvider.checkHealth();
    expect(health.provider).toBe("piper-offline-tts");
  });
});
