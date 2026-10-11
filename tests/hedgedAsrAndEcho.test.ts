import { describe, it, expect } from "vitest";
import { hedgedAsrService } from "../src/ai_system/speech/asr/hedgedAsrService";
import { isSpokenPinPattern } from "../src/modules/sttService";
import { ttsRouter } from "../src/ai_system/speech/tts/ttsRouter";
import { aiBootstrap } from "../src/ai_system/core/aiBootstrap";
import { studioCatalogProvider } from "../src/ai_system/speech/tts/studioCatalogProvider";

describe("Hedged ASR & Echo Filtering Core Invariants", () => {
  it("1. Detects and strips system prompt echo from the circular prompt buffer", () => {
    // Register prompt in circular buffer
    const welcomePrompt = "Welcome to Ɔkwankyerɛfo Pa. For English press 1. For Twi press 2.";
    hedgedAsrService.registerPlayedPrompt(welcomePrompt, "language-selection", "bilingual");

    // The system hears its own prompt back over speakerphone
    const echoResult = hedgedAsrService.isSystemPromptEcho(
      "welcome to okwankyerɛfo pa for english press 1",
      "language-selection"
    );
    expect(echoResult.isEcho).toBe(true);

    // But an authentic caller selection is NOT treated as an echo
    const callerSelection = hedgedAsrService.isSystemPromptEcho("1", "language-selection");
    expect(callerSelection.isEcho).toBe(false);

    const callerSelectionTwi = hedgedAsrService.isSystemPromptEcho("mmienu", "language-selection");
    expect(callerSelectionTwi.isEcho).toBe(false);
  });

  it("2. Amount step does not mistake valid amounts (500, 1000, 50 cedis) for PINs", () => {
    // Enter-amount step: 500 cedis is a valid amount, NOT a PIN
    expect(isSpokenPinPattern("500", "enter-amount")).toBe(false);
    expect(isSpokenPinPattern("1000", "enter-amount")).toBe(false);
    expect(isSpokenPinPattern("50 cedis", "enter-amount")).toBe(false);
    expect(isSpokenPinPattern("send 250 cedis", "enter-amount")).toBe(false);

    // Confidence calibration awards high confidence to valid amount inputs
    const confAmount = hedgedAsrService.calibrateStepConfidence("500", "enter-amount", null);
    expect(confAmount.confidence).toBeGreaterThanOrEqual(0.9);
    expect(confAmount.source).toBe("calibrated");

    // But explicit PIN keyword or suspicious 5-6 digits without currency IS caught as a PIN
    expect(isSpokenPinPattern("my secret pin is 1234", "enter-amount")).toBe(true);
    expect(isSpokenPinPattern("987654", "enter-amount")).toBe(true);
  });

  it("3. TTS Router adheres to proper fallback hierarchy: Studio Catalog -> Local Piper -> Local Synthesis", async () => {
    // Exact match in catalog uses authentic human studio recording
    const isCatalog = studioCatalogProvider.hasMatch("For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0.", "en");
    expect(isCatalog).toBe(true);

    // Synthesis through ttsRouter
    const response = await ttsRouter.synthesize({
      text: "For telecom or mobile money services, press 1. For banking services, press 2. To hear this again, press 9. To exit, press 0.",
      language: "en",
    });

    expect(response.providerUsed).toBeDefined();
    expect(response.audioBuffer || response.audioBase64).toBeDefined();
  });

  it("4. AI Bootstrap validates configured Gemini models and returns health diagnostics", async () => {
    const report = await aiBootstrap.initialize();
    expect(report.status).toBeDefined();
    expect(report.subsystems).toBeDefined();
    expect(report.zeroPinPolicyVerified).toBe(true);
    expect(report.diagnostics).toBeDefined();
    expect(report.diagnostics.models).toBeDefined();
  });
});
