import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { resolveSafeAudioPath, streamAudioFile } from "../src/audio/streaming";
import { studioPromptRegistry } from "../src/ai_system/speech/tts/studioPromptRegistry";
import { resolvePrompt } from "../src/modules/ttsService";
import { twiAmountSynthesizer } from "../src/ai_system/speech/tts/twiAmountSynthesizer";
import { ttsRouter } from "../src/ai_system/speech/tts/ttsRouter";

describe("TTS Studio Prompt Registry & Fallback Chain Invariants", () => {
  it("resolves available supplied Twi prompts through the guarded audio stream", () => {
    expect(resolvePrompt("provider_select", "twi")).toBe(
      "/audio/supplied/Twi/02_Main_Service_Navigation/Network%20selection.m4a"
    );
    expect(resolvePrompt("action_select", "twi")).toBe(
      "/audio/supplied/Twi/02_Main_Service_Navigation/MTN%20menu.m4a"
    );
    expect(resolvePrompt("enter_recipient", "twi")).toBe(
      "/audio/supplied/Twi/03_Recipient_Entry_Verification/Enter%20recipient.m4a"
    );
    expect(resolvePrompt("enter_amount", "twi")).toBe(
      "/audio/supplied/Twi/04_Amount_Entry_Verification/Enter%20amount.m4a"
    );
    expect(resolvePrompt("enter_recipient", "en")).toBe("/audio/English/Audio_prompt_06.mp3");
    expect(resolveSafeAudioPath("supplied/Twi/02_Main_Service_Navigation/Network selection.m4a")).toContain(
      "Audio_files/audio/Twi/02_Main_Service_Navigation/Network selection.m4a"
    );
    expect(() => resolveSafeAudioPath("supplied/../../package.json")).toThrow();
  });

  it("streams the supplied Twi M4A as audio/mp4 with byte-range support", async () => {
    const app = express();
    app.get("/audio/*", (req, res) => {
      const requestedPath = decodeURIComponent((req.params as Record<string, string>)["0"] || "");
      const audioPath = resolveSafeAudioPath(requestedPath);
      if (!audioPath) {
        res.sendStatus(404);
        return;
      }
      streamAudioFile(req, res, audioPath);
    });

    const networkPrompt = resolvePrompt("provider_select", "twi")!;
    const fullResponse = await request(app).get(networkPrompt);
    expect(fullResponse.status).toBe(200);
    expect(fullResponse.headers["content-type"]).toContain("audio/mp4");
    expect(fullResponse.body.length).toBeGreaterThan(100);

    const rangeResponse = await request(app).get(networkPrompt).set("Range", "bytes=0-15");
    expect(rangeResponse.status).toBe(206);
    expect(rangeResponse.headers["content-range"]).toMatch(/^bytes 0-15\//);
    expect(rangeResponse.body.length).toBe(16);
  });

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
