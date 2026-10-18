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
  it("uses a matching-language TTS route while audio candidates are unreviewed", () => {
    expect(resolvePrompt("unknown_input", "twi")).toBe("/api/audio/prompt-tts/twi/unknown_input");
    expect(resolvePrompt("unknown_input", "en")).toBe("/api/audio/prompt-tts/en/unknown_input");
    expect(resolvePrompt("provider_select", "twi")).toBe("/api/audio/prompt-tts/twi/provider_select");
    expect(resolveSimulatorPrompt("unknown_input", "twi")).toBe("/api/audio/prompt-tts/twi/unknown_input");
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

  it("synthesizes Twi amount speech with a valid WAV payload", () => {
    expect(twiAmountSynthesizer.numberToTwi(1)).toBe("baako");
    expect(twiAmountSynthesizer.numberToTwi(2)).toBe("mmienu");
    expect(twiAmountSynthesizer.numberToTwi(50)).toBe("aduonum");
    expect(twiAmountSynthesizer.numberToTwi(500)).toBe("ahanum");

    const result = twiAmountSynthesizer.synthesizeTwiAmount(500);
    expect(result.twiText).toBe("Sidi ahanum");
    expect(result.mimeType).toBe("audio/wav");
    expect(result.audioBuffer.subarray(0, 12).toString("ascii").endsWith("WAVE")).toBe(true);
  });

  it("routes Twi amount requests through the configured synthesis provider", async () => {
    const result = await ttsRouter.synthesize({ text: "50 cedis", language: "tw" });
    expect(result.audioMimeType).toBe("audio/wav");
    expect(result.audioBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });
});