import { describe, it, expect } from "vitest";
import {
  isAcousticSystemEcho,
  stripSystemEchoFromTranscript,
  isBackgroundNoiseOrStatic,
} from "../src/domain/echoFilter";

describe("Acoustic Echo & Noise Filter", () => {
  it("identifies verbatim system prompts as acoustic echo", () => {
    const prompt = "Welcome to Okwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.";
    expect(isAcousticSystemEcho("Welcome to Okwankyerɛfo Pa for English press 1 for Twi press 2", prompt)).toBe(true);
    expect(isAcousticSystemEcho("For Telecom mobile money services press 1 for banking services press 2", null)).toBe(true);
    expect(isAcousticSystemEcho("Afei paw wo network sɛ MTN a mia 1", null)).toBe(true);
  });

  it("never classifies legitimate caller digits or single commands as echo", () => {
    const prompt = "For English, press 1. For Twi, press 2.";
    expect(isAcousticSystemEcho("1", prompt)).toBe(false);
    expect(isAcousticSystemEcho("2", prompt)).toBe(false);
    expect(isAcousticSystemEcho("yes", prompt)).toBe(false);
    expect(isAcousticSystemEcho("aane", prompt)).toBe(false);
    expect(isAcousticSystemEcho("dabi", prompt)).toBe(false);
    expect(isAcousticSystemEcho("confirm", prompt)).toBe(false);
  });

  it("identifies user speech distinct from system prompt", () => {
    const prompt = "Who would you like to send money to?";
    expect(isAcousticSystemEcho("Send 20 cedis to Kwame", prompt)).toBe(false);
    expect(isAcousticSystemEcho("0553838464", prompt)).toBe(false);
    expect(isAcousticSystemEcho("Fa sidi aduonu kɔma Ama", prompt)).toBe(false);
  });

  it("identifies background noise, coughing, breathing, or static", () => {
    expect(isBackgroundNoiseOrStatic("[noise]")).toBe(true);
    expect(isBackgroundNoiseOrStatic("...")).toBe(true);
    expect(isBackgroundNoiseOrStatic("")).toBe(true);
    expect(isBackgroundNoiseOrStatic("uh")).toBe(true);
    expect(isBackgroundNoiseOrStatic("Send 20 cedis", 45)).toBe(false);
    expect(isBackgroundNoiseOrStatic("2", 30)).toBe(false);
  });

  it("strips echo when user speaks after an echo", () => {
    const prompt = "Welcome to Okwankyerɛfo Pa for English press 1 for Twi press 2";
    const userSpokeAfter = "Welcome to Okwankyerɛfo Pa for English press 1 for Twi press 2 2";
    expect(stripSystemEchoFromTranscript(userSpokeAfter, prompt)).toBe("2");
  });
});
