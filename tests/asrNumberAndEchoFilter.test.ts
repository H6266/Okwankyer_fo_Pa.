import { describe, it, expect } from "vitest";
import { formatSpokenNumbersAsDigits } from "../src/domain/numberFormatter";
import {
  isAcousticSystemEcho,
  stripSystemEchoFromTranscript,
  isBackgroundNoiseOrStatic,
} from "../src/domain/echoFilter";

describe("ASR Number Normalizer (formatSpokenNumbersAsDigits)", () => {
  it("converts single spoken digits to numeric characters", () => {
    expect(formatSpokenNumbersAsDigits("two")).toBe("2");
    expect(formatSpokenNumbersAsDigits("one")).toBe("1");
    expect(formatSpokenNumbersAsDigits("zero")).toBe("0");
    expect(formatSpokenNumbersAsDigits("nine")).toBe("9");
  });

  it("converts Akan Twi number words to numeric digits", () => {
    expect(formatSpokenNumbersAsDigits("baako")).toBe("1");
    expect(formatSpokenNumbersAsDigits("mmienu")).toBe("2");
    expect(formatSpokenNumbersAsDigits("mmiɛnsa")).toBe("3");
    expect(formatSpokenNumbersAsDigits("mmeensa")).toBe("3");
    expect(formatSpokenNumbersAsDigits("enan")).toBe("4");
    expect(formatSpokenNumbersAsDigits("enum")).toBe("5");
    expect(formatSpokenNumbersAsDigits("aduonu")).toBe("20");
    expect(formatSpokenNumbersAsDigits("aduonum")).toBe("50");
  });

  it("converts numbers embedded in phrases to digits so the system recognizes commands", () => {
    expect(formatSpokenNumbersAsDigits("for twi press two")).toBe("for twi press 2");
    expect(formatSpokenNumbersAsDigits("for english press one")).toBe("for english press 1");
    expect(formatSpokenNumbersAsDigits("sɛ wopene so a mia baako")).toBe("sɛ wopene so a mia 1");
    expect(formatSpokenNumbersAsDigits("Send twenty cedis to Kwame")).toBe("Send 20 cedis to Kwame");
    expect(formatSpokenNumbersAsDigits("Fa sidi aduonu kɔma Kwame")).toBe("Fa sidi 20 kɔma Kwame");
    expect(formatSpokenNumbersAsDigits("I want to send fifty cedis")).toBe("I want to send 50 cedis");
  });

  it("collapses spaced phone numbers and digit sequences", () => {
    expect(formatSpokenNumbersAsDigits("0 5 5 3 8 3 8 4 6 4")).toBe("0553838464");
    expect(formatSpokenNumbersAsDigits("zero five five three eight three eight four six four")).toBe("0553838464");
  });
});

describe("Acoustic Echo & System Audio Suppression (isAcousticSystemEcho)", () => {
  const welcomePrompt = "Welcome to Okwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.";

  it("identifies echoes of the active assistant prompt", () => {
    expect(isAcousticSystemEcho(welcomePrompt, welcomePrompt, true)).toBe(true);
    expect(isAcousticSystemEcho("for english press 1 for twi press 2", welcomePrompt, true)).toBe(true);
    expect(isAcousticSystemEcho("welcome to okwankyerɛfo pa", welcomePrompt, false)).toBe(true);
  });

  it("identifies echoes of canonical IVR studio catalog prompts", () => {
    expect(isAcousticSystemEcho("Afei selecte wo network sɛ MTN a mia 1", null, true)).toBe(true);
    expect(isAcousticSystemEcho("Select your network for MTN press 1 for Telecel press 2", null, false)).toBe(true);
    expect(isAcousticSystemEcho("Enter the 10 digit number you want to send money to", null, false)).toBe(true);
  });

  it("NEVER treats standalone user intents or commands as echo", () => {
    expect(isAcousticSystemEcho("2", welcomePrompt, true)).toBe(false);
    expect(isAcousticSystemEcho("1", welcomePrompt, true)).toBe(false);
    expect(isAcousticSystemEcho("aane", welcomePrompt, true)).toBe(false);
    expect(isAcousticSystemEcho("dabi", welcomePrompt, true)).toBe(false);
    expect(isAcousticSystemEcho("confirm", welcomePrompt, false)).toBe(false);
    expect(isAcousticSystemEcho("cancel", welcomePrompt, false)).toBe(false);
    expect(isAcousticSystemEcho("Send 20 cedis to Kwame", welcomePrompt, false)).toBe(false);
    expect(isAcousticSystemEcho("0553838464", welcomePrompt, false)).toBe(false);
  });

  it("strips echoed prompt prefixes when caller spoke after echo", () => {
    const mixed = "For English press 1 for Twi press 2 2";
    expect(stripSystemEchoFromTranscript(mixed, welcomePrompt)).toBe("2");
  });
});

describe("Background Noise Suppression (isBackgroundNoiseOrStatic)", () => {
  it("rejects non-speech tokens and empty noise", () => {
    expect(isBackgroundNoiseOrStatic("")).toBe(true);
    expect(isBackgroundNoiseOrStatic("   ")).toBe(true);
    expect(isBackgroundNoiseOrStatic("[noise]")).toBe(true);
    expect(isBackgroundNoiseOrStatic("[cough]")).toBe(true);
    expect(isBackgroundNoiseOrStatic("...")).toBe(true);
    expect(isBackgroundNoiseOrStatic("uh")).toBe(true);
    expect(isBackgroundNoiseOrStatic("um")).toBe(true);
  });

  it("accepts authentic user voice words and numbers", () => {
    expect(isBackgroundNoiseOrStatic("2")).toBe(false);
    expect(isBackgroundNoiseOrStatic("1")).toBe(false);
    expect(isBackgroundNoiseOrStatic("Kwame")).toBe(false);
    expect(isBackgroundNoiseOrStatic("Aane")).toBe(false);
    expect(isBackgroundNoiseOrStatic("Send momo")).toBe(false);
  });
});
