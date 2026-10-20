import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { PathTraversalError, resolveSafeAudioPath } from "../src/audio/streaming";
import { studioPromptRegistry } from "../src/ai_system/speech/tts/studioPromptRegistry";
import {
  resolvePrompt,
  resolveSimulatorAudioUrl,
  resolveSimulatorPrompt,
} from "../src/modules/ttsService";
import { twiAmountSynthesizer } from "../src/ai_system/speech/tts/twiAmountSynthesizer";
import { ttsRouter } from "../src/ai_system/speech/tts/ttsRouter";

describe("TTS Studio Prompt Registry & Fallback Chain Invariants", () => {
  it("resolves approved silence and transfer-wait recordings before synthesis", () => {
    expect(resolvePrompt("OP67", "twi")).toBe("/audio/Twi/Please_respond.mp3");
    expect(resolvePrompt("OP06", "twi")).toBe("/audio/Twi/Processing.mp3");
    expect(resolvePrompt("OP46", "twi")).toBe("/audio/Twi/Waiting_confirmation.mp3");
    expect(resolvePrompt("OP46", "en")).toBeNull();
  });

  it("does not route fixed or unknown prompts into TTS", () => {
    expect(resolvePrompt("unknown_input", "twi")).toBeNull();
    expect(resolvePrompt("unknown_input", "en")).toBeNull();
    expect(resolvePrompt("provider_select", "twi")).toBeNull();
    expect(resolveSimulatorPrompt("unknown_input", "twi")).toBeNull();
    const twiAudioUrl = "/audio/supplied/Twi/2.Main%20Service%20Navigation/Network%20selection.mp3";
    expect(resolveSimulatorAudioUrl(twiAudioUrl, "en")).toBeNull();
    const enAudioUrl = "/audio/supplied/English/Welcome.m4a";
    expect(resolveSimulatorAudioUrl(enAudioUrl, "twi")).toBeNull();
    expect(resolveSafeAudioPath("supplied/Twi/NonExistent/Candidate.m4a")).toBeNull();
    expect(() => resolveSafeAudioPath("supplied/../../package.json")).toThrow(PathTraversalError);
  });

  it("does not stream an unverified recording candidate", async () => {
    const app = express();
    app.get("/audio/*", (req, res) => {
      const requestedPath = decodeURIComponent((req.params as Record<string, string>)["0"] || "");
      const audioPath = resolveSafeAudioPath(requestedPath);
      if (!audioPath) {
        res.sendStatus(404);
        return;
      }
      res.sendStatus(200);
    });

    const response = await request(app).get(
      "/audio/supplied/Twi/NonExistent/Candidate.m4a"
    );
    expect(response.status).toBe(404);
  });

  it("keeps unverified and dynamic prompts out of the studio cache", () => {
    expect(studioPromptRegistry.getPrompt("unreviewed_custom_step", "tw")).toBeNull();
    expect(studioPromptRegistry.getPrompt("unreviewed_custom_step", "en")).toBeNull();
    expect(studioPromptRegistry.getPrompt("enter_amount", "en")).toBeNull();
  });

  it("does not synthesize Twi amount tones without reviewed speech assets", () => {
    expect(twiAmountSynthesizer.numberToTwi(1)).toBe("baako");
    expect(twiAmountSynthesizer.numberToTwi(2)).toBe("mmienu");
    expect(twiAmountSynthesizer.numberToTwi(50)).toBe("aduonum");
    expect(twiAmountSynthesizer.numberToTwi(500)).toBe("ahanum");

    expect(() => twiAmountSynthesizer.synthesizeTwiAmount(500)).toThrow(/TWI_AMOUNT_TTS_UNAVAILABLE/);
  });

  it("does not route Twi requests through an English-only speech engine", async () => {
    await expect(ttsRouter.synthesize({ text: "50 cedis", language: "tw" }))
      .rejects.toThrow(/TWI_TTS_UNAVAILABLE/);
  });
});