import { describe, it, expect } from "vitest";
import { offlineAIEngine } from "../src/ai_system/core/offlineAIEngine";
import { localGhanaianTtsProvider } from "../src/ai_system/speech/tts/localGhanaianTts";

describe("OfflineAIEngine (100% Autonomous Offline Execution)", () => {
  it("processes English send money intent without any cloud dependencies", async () => {
    const res = await offlineAIEngine.process({
      sessionId: "offline_test_1",
      channel: "VOICE",
      input: "I want to send 50 cedis to 0541234567",
      language: "en",
    });

    expect(res.success).toBe(true);
    expect(res.cognitiveState.intent).toBe("SEND_MONEY");
    expect(res.cognitiveState.workingSlots.amount).toBe(50);
    expect(res.cognitiveState.workingSlots.recipientPhone).toBe("0541234567");
    expect(res.dialogue.response).toBeDefined();
    expect(res.speech).toBeDefined();
  });

  it("processes Akan Twi send money intent and extracts Twi number words", async () => {
    const res = await offlineAIEngine.process({
      sessionId: "offline_test_2",
      channel: "VOICE",
      input: "Mepa wo kyɛw, mepɛ sɛ memane sika aduonu kɔma 0551122334",
      language: "tw",
    });

    expect(res.success).toBe(true);
    expect(res.cognitiveState.intent).toBe("SEND_MONEY");
    expect(res.cognitiveState.workingSlots.amount).toBe(20);
    expect(res.cognitiveState.workingSlots.recipientPhone).toBe("0551122334");
    expect(res.cognitiveState.language).toBe("tw");
  });

  it("intercepts and redacts spoken PIN at perception and fires security alert", async () => {
    const res = await offlineAIEngine.process({
      sessionId: "offline_test_pin",
      channel: "VOICE",
      input: "My secret PIN is 1234",
      language: "en",
    });

    expect(res.safety.pinDetectedInVoice).toBe(true);
    expect(res.action.isExecutable).toBe(false);
    expect(res.dialogue.type).toBe("ZERO_PIN_SECURITY_ALERT");
    expect(res.dialogue.response.toLowerCase()).toContain("never speak your momo pin");
    // Ensure raw PIN '1234' is completely scrubbed from masked input
    expect(res.safety.piiMaskedInput).not.toContain("1234");
    expect(res.safety.piiMaskedInput).toContain("[REDACTED_PIN]");
  });

  it("handles navigation intents (home, back, cancel) locally", async () => {
    const resBack = await offlineAIEngine.process({
      sessionId: "offline_test_nav_1",
      channel: "VOICE",
      input: "Go back to the previous menu",
      language: "en",
    });
    expect(resBack.cognitiveState.intent).toBe("GO_BACK");

    const resHome = await offlineAIEngine.process({
      sessionId: "offline_test_nav_2",
      channel: "VOICE",
      input: "San kɔ ahyɛaseɛ pɔtee no",
      language: "tw",
    });
    expect(resHome.cognitiveState.intent).toBe("GO_HOME");
  });

  it("generates valid local WAV PCM speech audio without network calls", async () => {
    const speechResult = await localGhanaianTtsProvider.synthesize({
      text: "Akwaaba kɔ Okwankyerɛfo Pa. Fa sidi aduonu kɔma Kwame.",
      language: "tw",
      voiceProfile: "ghanaian-warm",
    });

    expect(speechResult.audioBuffer).toBeDefined();
    expect(speechResult.audioBuffer!.length).toBeGreaterThan(44);
    // Verify 44-byte RIFF/WAVE header
    const header = speechResult.audioBuffer!.toString("ascii", 0, 4);
    expect(header).toBe("RIFF");
    const waveFormat = speechResult.audioBuffer!.toString("ascii", 8, 12);
    expect(waveFormat).toBe("WAVE");
    expect(speechResult.audioMimeType).toBe("audio/wav");
  });
});
