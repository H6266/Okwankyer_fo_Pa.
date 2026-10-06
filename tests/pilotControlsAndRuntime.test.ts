/**
 * Ɔkwankyerɛfo Pa - Phase 6a Tests: Pilot Runtime Controls
 * (tests/pilotControlsAndRuntime.test.ts)
 * 
 * Verifies:
 * 1. Kill switch immediately forces offline_only mode without deploy or restart.
 * 2. Per-number allowlist: allows specified pilot numbers, non-allowlisted callers forced to offline_only.
 * 3. Normalization of Ghanaian phone numbers.
 * 4. Brain runtime respects effective mode from pilot controls.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { pilotControls } from "../src/services/pilotControls";
import { Brain } from "../src/ai_system/brain/brain";
import { geminiClient } from "../src/services/geminiClient";

describe("Phase 6a: Pilot Runtime Controls (Kill Switch & Allowlist)", () => {
  beforeEach(() => {
    pilotControls.setKillSwitch(false);
    pilotControls.setAllowlistEnabled(true);
    // Clear and set standard test allowlist
    const existing = pilotControls.getAllowedNumbers(false);
    for (const num of existing) {
      pilotControls.removeAllowedNumber(num);
    }
    pilotControls.addAllowedNumber("0553838464");
    pilotControls.addAllowedNumber("+233241234567");
  });

  it("1. Kill Switch forces offline_only mode immediately without redeployment", () => {
    expect(pilotControls.isKillSwitchActive()).toBe(false);

    // Initial effective mode for allowed caller is live or requested mode
    const modeBefore = pilotControls.getEffectiveBrainMode("0553838464", "live");
    expect(modeBefore).toBe("live");

    // Engage kill switch
    pilotControls.setKillSwitch(true, "Emergency operational safeguard triggered");
    expect(pilotControls.isKillSwitchActive()).toBe(true);

    // Effective mode is immediately forced to offline_only
    const modeAfter = pilotControls.getEffectiveBrainMode("0553838464", "live");
    expect(modeAfter).toBe("offline_only");

    // Disengage kill switch
    pilotControls.setKillSwitch(false);
    expect(pilotControls.getEffectiveBrainMode("0553838464", "live")).toBe("live");
  });

  it("2. Per-number allowlist restricts pilot model execution to approved numbers only", () => {
    // 0553838464 is on allowlist -> gets live mode
    expect(pilotControls.isNumberAllowed("0553838464")).toBe(true);
    expect(pilotControls.getEffectiveBrainMode("0553838464", "live")).toBe("live");

    // 0241234567 normalized from +233241234567 -> gets live mode
    expect(pilotControls.isNumberAllowed("0241234567")).toBe(true);
    expect(pilotControls.getEffectiveBrainMode("0241234567", "live")).toBe("live");

    // 0209999999 is NOT on allowlist -> forced to offline_only
    expect(pilotControls.isNumberAllowed("0209999999")).toBe(false);
    expect(pilotControls.getEffectiveBrainMode("0209999999", "live")).toBe("offline_only");
    expect(pilotControls.getEffectiveBrainMode("0209999999", "shadow")).toBe("offline_only");
  });

  it("3. Dynamic modification of allowlist at runtime", () => {
    const testNumber = "0275554433";
    expect(pilotControls.isNumberAllowed(testNumber)).toBe(false);

    // Add number
    pilotControls.addAllowedNumber(testNumber);
    expect(pilotControls.isNumberAllowed(testNumber)).toBe(true);
    expect(pilotControls.getEffectiveBrainMode(testNumber, "live")).toBe("live");

    // Remove number
    pilotControls.removeAllowedNumber(testNumber);
    expect(pilotControls.isNumberAllowed(testNumber)).toBe(false);
    expect(pilotControls.getEffectiveBrainMode(testNumber, "live")).toBe("offline_only");
  });

  it("4. Brain instance honors kill switch and bypasses model calls", async () => {
    const generateSpy = vi.fn();
    vi.spyOn(geminiClient, "isAvailable").mockReturnValue(true);
    vi.spyOn(geminiClient, "getRawClient").mockReturnValue({
      models: { generateContent: generateSpy },
    } as any);

    const brain = new Brain({ mode: "live" });

    // Engage kill switch
    pilotControls.setKillSwitch(true, "Test kill switch engagement");

    const result = await brain.process({
      transcript: "I want to send 50 cedis to 0553838464",
      language: "en",
      languageConfidence: 0.9,
      sessionLanguage: "en",
      draft: { slots: {} },
      callerNumber: "0553838464",
    });

    // Model was NOT called because kill switch forced offline_only!
    expect(generateSpy).not.toHaveBeenCalled();
    // Deterministic engine handled it correctly
    expect(result.decision.kind).toBe("confirm");
  });
});
