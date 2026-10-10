import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { PhoneSimulatorPage } from "../src/pages/dashboard/PhoneSimulatorPage";
import { simulatorLog, emitSimulatorLog } from "../src/lib/simulatorLog";
import { ContinuousVoiceCapture } from "../src/lib/audio/continuousVoiceCapture";

describe("PhoneSimulatorPage UI Redesign", () => {
  beforeEach(() => {
    simulatorLog.clear();
  });

  it("renders the phone handset with exactly 12 keypad buttons", () => {
    const html = renderToString(<PhoneSimulatorPage />);

    // Check for all 12 phone keypad keys
    const expectedKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
    expectedKeys.forEach((k) => {
      expect(html).toContain(`aria-label="Key ${k}`);
    });

    // Check Call and Hang up buttons
    expect(html).toContain("aria-label=\"Start Call\"");
    expect(html).toContain("aria-label=\"Hang Up\"");

    // Check status strip indicators
    expect(html).toContain("SPK:");
    expect(html).toContain("MIC:");
    expect(html).toContain("NET:");
  });

  it("displays emitted log events as terminal lines in the right panel", () => {
    emitSimulatorLog({
      category: "KEY",
      message: "Keypad pressed: 1",
      turnId: "T1",
    });

    emitSimulatorLog({
      category: "ASR",
      message: "ASR transcribed: 'one' (GhanaNLP, 142ms)",
      turnId: "T1",
    });

    const html = renderToString(<PhoneSimulatorPage />);
    expect(html).toContain("Keypad pressed: 1");
    expect(html).toContain("ASR transcribed: &#x27;one&#x27; (GhanaNLP, 142ms)");
    expect(html).toContain("T1");
    expect(html).toContain("KEY");
    expect(html).toContain("ASR");
  });

  it("displays empty state placeholder when no logs exist", () => {
    simulatorLog.clear();
    const html = renderToString(<PhoneSimulatorPage />);
    expect(html).toContain("Press Call to start. Events will appear here.");
  });

  it("invokes getUserMedia exactly once and surfaces NotAllowedError to the log and state", async () => {
    const originalNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    const originalWindowDesc = Object.getOwnPropertyDescriptor(globalThis, "window");

    const mockGetUserMedia = vi.fn().mockImplementation(async () => {
      const err = new Error("Permission denied");
      err.name = "NotAllowedError";
      throw err;
    });

    Object.defineProperty(globalThis, "window", {
      value: {
        isSecureContext: true,
        AudioContext: class {
          state = "suspended";
          sampleRate = 16000;
          resume = vi.fn().mockResolvedValue(undefined);
          close = vi.fn().mockResolvedValue(undefined);
        },
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "navigator", {
      value: {
        mediaDevices: {
          getUserMedia: mockGetUserMedia,
        },
      },
      configurable: true,
      writable: true,
    });

    try {
      let reportedState = "";
      let reportedReason: string | undefined = "";

      const capture = new ContinuousVoiceCapture({
        onStateChange: (state, reason) => {
          reportedState = state;
          reportedReason = reason;
        },
        onAudioLevel: () => {},
        onVadUpdate: () => {},
        onUtteranceComplete: () => {},
        onBargeIn: () => {},
        onTelemetryUpdate: () => {},
      });

      const started = await capture.start();

      expect(started).toBe(false);
      expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
      expect(reportedState).toBe("MIC_UNAVAILABLE");
      expect(reportedReason).toContain("Microphone permission denied");

      // Verify ERROR line was emitted in simulatorLog
      const errorLogs = simulatorLog.getEntries().filter((e) => e.category === "ERROR");
      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0].message).toContain("Microphone permission denied");
    } finally {
      if (originalNavigatorDesc) {
        Object.defineProperty(globalThis, "navigator", originalNavigatorDesc);
      }
      if (originalWindowDesc) {
        Object.defineProperty(globalThis, "window", originalWindowDesc);
      }
    }
  });

  it("surfaces insecure context error if window.isSecureContext is false without calling getUserMedia", async () => {
    const originalWindowDesc = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      value: {
        isSecureContext: false,
      },
      configurable: true,
      writable: true,
    });

    try {
      const capture = new ContinuousVoiceCapture({
        onStateChange: () => {},
        onAudioLevel: () => {},
        onVadUpdate: () => {},
        onUtteranceComplete: () => {},
        onBargeIn: () => {},
        onTelemetryUpdate: () => {},
      });

      const started = await capture.start();
      expect(started).toBe(false);

      const errorLogs = simulatorLog.getEntries().filter((e) => e.category === "ERROR");
      expect(errorLogs.length).toBeGreaterThan(0);
      expect(errorLogs[0].message).toContain("Insecure context");
    } finally {
      if (originalWindowDesc) {
        Object.defineProperty(globalThis, "window", originalWindowDesc);
      }
    }
  });
});
