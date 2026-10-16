import { describe, it, expect } from "vitest";
import { isSpokenPinPattern, isVoiceCaptureBlockedForStep, shouldDiscardSensitiveSpeech } from "../src/modules/sttService";
import { unifiedSafetyEngine } from "../src/ai_system/safety/unifiedSafetyEngine";

describe("Context-Aware PIN Security (Section 14 & 46)", () => {
  it("does NOT reject legitimate financial amounts (e.g. 1000 cedis) as a PIN", () => {
    // "send 1000 cedis" at amount step
    const isPinAtAmountStep = isSpokenPinPattern("send 1000 cedis", "enter-amount");
    expect(isPinAtAmountStep).toBe(false);

    const is1000AtAmountStep = isSpokenPinPattern("1000", "enter-amount");
    expect(is1000AtAmountStep).toBe(false);

    const is2500AtAmountStep = isSpokenPinPattern("2500 cedis", "enter-amount");
    expect(is2500AtAmountStep).toBe(false);
  });

  it("intercepts and redacts explicit PIN keywords in all dialogue steps", () => {
    expect(isSpokenPinPattern("my momo pin is 4321", "enter-amount")).toBe(true);
    expect(isSpokenPinPattern("ahintasɛm 1234", "welcome")).toBe(true);
    expect(isSpokenPinPattern("my secret is 9988", "safe-confirmation")).toBe(true);
    expect(isSpokenPinPattern("kokoam 5566", "main-menu")).toBe(true);
  });

  it("redacts spoken credentials from caller utterances completely", () => {
    const rawUtterance = "I want to send money and my PIN is 4321 to confirm";
    const masked = unifiedSafetyEngine.maskCredentials(rawUtterance);
    expect(masked).not.toContain("4321");
    expect(masked).toContain("[REDACTED_PIN]");
  });

  it("blocks speech capture during the secure handset handoff", () => {
    expect(isVoiceCaptureBlockedForStep("pin-authorization")).toBe(true);
    expect(isVoiceCaptureBlockedForStep("pin-handoff")).toBe(true);
    expect(isVoiceCaptureBlockedForStep("safe-confirmation")).toBe(false);
    expect(isSpokenPinPattern("4321", "pin-handoff")).toBe(true);
    expect(shouldDiscardSensitiveSpeech("4321", "pin-handoff")).toBe(true);
  });

  it("discards spoken PIN-like digit words before simulator transcript handling", () => {
    expect(shouldDiscardSensitiveSpeech("one two three four", "cashout-confirm-approval")).toBe(true);
    expect(shouldDiscardSensitiveSpeech("my PIN is 1234", "safe-confirmation")).toBe(true);
  });
});
