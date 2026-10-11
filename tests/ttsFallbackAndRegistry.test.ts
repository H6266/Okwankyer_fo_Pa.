import { describe, it, expect } from "vitest";
import { studioPromptRegistry } from "../src/ai_system/speech/tts/studioPromptRegistry";
import { twiAmountSynthesizer } from "../src/ai_system/speech/tts/twiAmountSynthesizer";
import { ttsRouter } from "../src/ai_system/speech/tts/ttsRouter";

describe("TTS Studio Prompt Registry & Fallback Chain Invariants", () => {
  it("1. Studio Prompt Registry maps canonical prompts to pre-recorded files with cached metadata", () => {
    // Welcome prompt
    const welcome = studioPromptRegistry.getPrompt("welcome");
    expect(welcome).toBeDefined();
    expect(welcome?.relativeUrl).toContain("Welcome_prompt_01.mp3");
    expect(welcome?.fileSizeBytes).toBeGreaterThan(1000);
    expect(welcome?.durationSec).toBeGreaterThan(0);
    expect(welcome?.sampleRateHz).toBe(44100);

    // Enter Amount in English -> Audio_prompt_09.mp3
    const enterAmountEn = studioPromptRegistry.getPrompt("enter_amount", "en");
    expect(enterAmountEn).toBeDefined();
    expect(enterAmountEn?.relativeUrl).toContain("Audio_prompt_09.mp3");

    // Enter Amount in Twi -> Audio_prompt_twi_07.mp3
    const enterAmountTw = studioPromptRegistry.getPrompt("enter_amount", "tw");
    expect(enterAmountTw).toBeDefined();
    expect(enterAmountTw?.relativeUrl).toContain("Audio_prompt_twi_07.mp3");

    // Audio buffer read
    if (welcome) {
      const buffer = studioPromptRegistry.getAudioBuffer(welcome);
      expect(buffer).toBeDefined();
      expect(buffer.length).toBe(welcome.fileSizeBytes);
    }
  });

  it("2. Twi Amount Synthesizer converts numbers to Akan words and generates valid WAV audio without generic English TTS", () => {
    // Text conversion
    expect(twiAmountSynthesizer.numberToTwi(1)).toBe("baako");
    expect(twiAmountSynthesizer.numberToTwi(2)).toBe("mmienu");
    expect(twiAmountSynthesizer.numberToTwi(50)).toBe("aduonum");
    expect(twiAmountSynthesizer.numberToTwi(500)).toBe("ahanum");
    expect(twiAmountSynthesizer.numberToTwi(1000)).toBe("apem");

    // Audio concatenation synthesis for 500 GHS
    const synthResult = twiAmountSynthesizer.synthesizeTwiAmount(500);
    expect(synthResult.twiText).toBe("Sidi ahanum");
    expect(synthResult.mimeType).toBe("audio/wav");
    expect(synthResult.audioBuffer.length).toBeGreaterThan(1000);

    // Verify valid 44-byte WAV header
    const header = synthResult.audioBuffer.subarray(0, 12).toString("ascii");
    expect(header.startsWith("RIFF")).toBe(true);
    expect(header.endsWith("WAVE")).toBe(true);
  });

  it("3. TTS Router routes canonical prompts to Tier 1 Studio Catalog", async () => {
    const res = await ttsRouter.synthesize({
      text: "welcome",
      language: "en",
    });

    expect(res.providerUsed).toContain("tier1-studio-prompt-registry:welcome");
    expect(res.audioBuffer).toBeDefined();
    expect(res.audioBuffer!.length).toBeGreaterThan(128);
  });

  it("4. TTS Router synthesizes dynamic Twi amounts using concatenation snippets without English TTS corruption", async () => {
    const res = await ttsRouter.synthesize({
      text: "Sika a worebɛmane yɛ 500 cedis",
      language: "tw",
    });

    expect(res.providerUsed).toBe("tier1-twi-digit-concatenation");
    expect(res.audioMimeType).toBe("audio/wav");
    expect(res.audioBuffer!.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("5. TTS Router falls back cleanly down the tiers for un-cataloged dynamic text without failing silently", async () => {
    const res = await ttsRouter.synthesize({
      text: "Your confirmation code is OKP-992834.",
      language: "en",
      skipCatalogCheck: true,
    });

    expect(res.audioBuffer).toBeDefined();
    expect(res.audioBuffer!.length).toBeGreaterThan(128);
    expect(res.providerUsed).toBeDefined();
  });
});
