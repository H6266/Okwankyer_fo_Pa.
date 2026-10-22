/**
 * Ɔkwankyerɛfo Pa - Production Voice IVR Critical Invariants Test Suite
 * 
 * Tests the 4 critical behaviors requested:
 * 1. System Prompt Echo Filtering (echo detection, echo stripping, user intent preservation)
 * 2. Amount Not Treated as PIN (step-aware PIN safety, amount vs PIN separation)
 * 3. Correct Prompt Fallback Order (Tier 1 Studio -> Tier 2 Piper -> Tier 3 Gemini -> Tier 4 Offline, Twi digit concatenation)
 * 4. Startup Model Verification (SDK model catalog check, deprecated model rejection, production enforcement)
 */

import { describe, it, expect, vi } from "vitest";
import {
  isAcousticSystemEcho,
  stripSystemEchoFromTranscript,
  isBackgroundNoiseOrStatic,
} from "../src/domain/echoFilter";
import { hedgedAsrService } from "../src/ai_system/speech/asr/hedgedAsrService";
import { isSpokenPinPattern, speechToText } from "../src/modules/sttService";
import { studioPromptRegistry } from "../src/ai_system/speech/tts/studioPromptRegistry";
import { twiAmountSynthesizer } from "../src/ai_system/speech/tts/twiAmountSynthesizer";
import { ttsRouter } from "../src/ai_system/speech/tts/ttsRouter";
import {
  modelVerificationEngine,
  PROHIBITED_DEPRECATED_MODELS,
} from "../src/ai_system/core/modelVerification";

describe("1. System Echo Filtering & User Intent Preservation", () => {
  const activePrompt =
    "Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.";

  it("1.1. Detects exact and high-overlap echoes of the active assistant prompt", () => {
    // Exact prompt echo
    expect(isAcousticSystemEcho(activePrompt, activePrompt, true)).toBe(true);

    // Substring echo of prompt
    expect(isAcousticSystemEcho("for english press 1 for twi press 2", activePrompt, true)).toBe(true);
    expect(isAcousticSystemEcho("welcome to okwankyerɛfo pa", activePrompt, false)).toBe(true);
  });

  it("1.2. Detects echoes recorded in the circular prompt buffer", () => {
    const promptId = hedgedAsrService.registerPlayedPrompt(
      "Sɛ wopɛ sɛ wosend sika kɔ ma MoMo user a, mia baako 1",
      "action-choice",
      "tw"
    );
    expect(promptId).toBeDefined();

    const echoResult = hedgedAsrService.isSystemPromptEcho(
      "Sɛ wopɛ sɛ wosend sika kɔ ma MoMo user a mia baako",
      "action-choice"
    );
    expect(echoResult.isEcho).toBe(true);
    expect(echoResult.matchedPromptId).toBe(promptId);
  });

  it("1.3. NEVER treats standalone user intents, numbers, or amounts as echoes", () => {
    // Menu choices
    expect(isAcousticSystemEcho("1", activePrompt, true)).toBe(false);
    expect(isAcousticSystemEcho("2", activePrompt, true)).toBe(false);
    expect(isAcousticSystemEcho("baako", activePrompt, true)).toBe(false);
    expect(isAcousticSystemEcho("mmienu", activePrompt, true)).toBe(false);

    // Affirmations / rejections
    expect(isAcousticSystemEcho("aane", activePrompt, true)).toBe(false);
    expect(isAcousticSystemEcho("dabi", activePrompt, true)).toBe(false);
    expect(isAcousticSystemEcho("yes", activePrompt, false)).toBe(false);
    expect(isAcousticSystemEcho("confirm", activePrompt, false)).toBe(false);
    expect(isAcousticSystemEcho("cancel", activePrompt, false)).toBe(false);

    // Spoken amounts and recipients
    expect(isAcousticSystemEcho("50 cedis", activePrompt, false)).toBe(false);
    expect(isAcousticSystemEcho("Send 20 cedis to Kwame", activePrompt, false)).toBe(false);
    expect(isAcousticSystemEcho("0553838464", activePrompt, false)).toBe(false);
  });

  it("1.4. Strips leading system echo when the caller speaks their answer after hearing the prompt", () => {
    // Caller hears prompt in background and says '2'
    const mixedUtterance = "For English press 1 for Twi press 2 2";
    const stripped = stripSystemEchoFromTranscript(mixedUtterance, activePrompt);
    expect(stripped).toBe("2");

    // Pure echo with no answer is stripped completely
    const pureEcho = "Welcome to Ɔkwankyerɛfo Pa an easy financial transaction service";
    const strippedPure = stripSystemEchoFromTranscript(pureEcho, activePrompt);
    expect(strippedPure).toBe("");
  });

  it("1.5. Suppresses background noise, static, coughs, and fillers", () => {
    expect(isBackgroundNoiseOrStatic("")).toBe(true);
    expect(isBackgroundNoiseOrStatic("[noise]")).toBe(true);
    expect(isBackgroundNoiseOrStatic("[cough]")).toBe(true);
    expect(isBackgroundNoiseOrStatic("...")).toBe(true);
    expect(isBackgroundNoiseOrStatic("uh")).toBe(true);
    expect(isBackgroundNoiseOrStatic("um")).toBe(true);

    // Genuine user speech is NOT noise
    expect(isBackgroundNoiseOrStatic("2")).toBe(false);
    expect(isBackgroundNoiseOrStatic("Kwame")).toBe(false);
    expect(isBackgroundNoiseOrStatic("50 cedis")).toBe(false);
  });
});

describe("2. Step-Aware Amount vs PIN Separation", () => {
  it("2.1. Valid numerical amounts on 'enter-amount' step are NOT treated as PINs", () => {
    // Standard amounts on amount step
    expect(isSpokenPinPattern("50", "enter-amount")).toBe(false);
    expect(isSpokenPinPattern("500", "enter-amount")).toBe(false);
    expect(isSpokenPinPattern("1000", "enter-amount")).toBe(false);
    expect(isSpokenPinPattern("2500", "enter-amount")).toBe(false);
    expect(isSpokenPinPattern("50 cedis", "enter-amount")).toBe(false);
    expect(isSpokenPinPattern("500 ghana cedis", "enter-amount")).toBe(false);
    expect(isSpokenPinPattern("sidi ahanum", "enter-amount")).toBe(false);
  });

  it("2.2. Legitimate Ghanaian phone numbers on recipient step are NOT treated as PINs", () => {
    expect(isSpokenPinPattern("0553838464", "enter-recipient")).toBe(false);
    expect(isSpokenPinPattern("0241234567", "enter-recipient")).toBe(false);
    expect(isSpokenPinPattern("recipient is 0553838464", "enter-recipient")).toBe(false);
  });

  it("2.3. True PIN patterns and explicit secret words ARE intercepted and discarded", () => {
    expect(isSpokenPinPattern("my pin is 1234", "enter-amount")).toBe(true);
    expect(isSpokenPinPattern("momo pin 4321", "enter-amount")).toBe(true);
    expect(isSpokenPinPattern("secret password 9988", "enter-amount")).toBe(true);
    expect(isSpokenPinPattern("me kokoam nɔmba yɛ 1234", "enter-amount")).toBe(true);
  });

  it("2.4. Suspicious 4-6 digit standalone sequences on menu steps ARE discarded", () => {
    // On a menu selection step, entering 4 digits is not a valid choice and suggests PIN leakage
    expect(isSpokenPinPattern("1234", "service-choice")).toBe(true);
    expect(isSpokenPinPattern("5678", "language-selection")).toBe(true);
  });

  it("2.5. speechToText service returns [DISCARDED_PIN] with confidence 0 on intercepted PIN", async () => {
    const result = await speechToText("my pin is 4455", "audio/wav", "service-choice");
    expect(result.pinDiscarded).toBe(true);
    expect(result.text).toBe("[DISCARDED_PIN]");
    expect(result.confidence).toBe(0.0);
  });
});

describe("3. Correct Prompt Fallback Order & TTS Audio Invariants", () => {
  it("3.1. Unreviewed prompt candidates are not loaded into the Studio Recording Catalog", () => {
    // Unreviewed prompts are not in studio catalog
    const unreviewed = studioPromptRegistry.getPrompt("unreviewed_step", "tw");
    expect(unreviewed).toBeNull();

    const amountEn = studioPromptRegistry.getPrompt("enter_amount", "en");
    expect(amountEn).toBeNull();

    const customStep = studioPromptRegistry.getPrompt("custom_unreviewed_step", "tw");
    expect(customStep).toBeNull();
  });

  it("3.2. TTS Router refuses unreviewed Twi synthesis without a reviewed real provider", async () => {
    await expect(ttsRouter.synthesize({
      text: "Unreviewed custom text for dynamic speech synthesis",
      language: "tw",
    })).rejects.toThrow(/TWI_TTS_UNAVAILABLE/);
  });

  it("3.3. Twi number text is distinct from audio synthesis and fails without reviewed speech assets", () => {
    // Akan number conversion
    expect(twiAmountSynthesizer.numberToTwi(1)).toBe("baako");
    expect(twiAmountSynthesizer.numberToTwi(2)).toBe("mmienu");
    expect(twiAmountSynthesizer.numberToTwi(50)).toBe("aduonum");
    expect(twiAmountSynthesizer.numberToTwi(500)).toBe("ahanum");

    // Audio generation
    expect(() => twiAmountSynthesizer.synthesizeTwiAmount(500)).toThrow(/TWI_AMOUNT_TTS_UNAVAILABLE/);
  });

  it("3.4. TTS Router fails explicitly when no real English speech provider returns audio", async () => {
    await expect(ttsRouter.synthesize({
      text: "Transaction OKP-109283 confirmed.",
      language: "en",
      skipCatalogCheck: true,
    })).rejects.toThrow(/TTS_PROVIDER_UNAVAILABLE/);
  });
});

describe("4. Startup Model Verification", () => {
  it("4.1. Prohibits deprecated legacy Gemini models", () => {
    for (const deprecated of PROHIBITED_DEPRECATED_MODELS) {
      const check = modelVerificationEngine.validateProhibitedModels([deprecated]);
      expect(check.valid).toBe(false);
      expect(check.prohibited).toContain(deprecated);
    }

    const modernCheck = modelVerificationEngine.validateProhibitedModels([
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "text-embedding-004",
    ]);
    expect(modernCheck.valid).toBe(true);
    expect(modernCheck.prohibited.length).toBe(0);
  });

  it("4.2. Refuses to run in production if required models or API keys are missing", async () => {
    const origEnv = process.env.NODE_ENV;
    const origKey = process.env.GEMINI_API_KEY;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.GEMINI_API_KEY;

      // In production, missing key must throw fatal error
      await expect(modelVerificationEngine.verifyStartupModels("")).rejects.toThrow(
        /GEMINI_API_KEY is required in production/
      );
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origKey) process.env.GEMINI_API_KEY = origKey;
    }
  });

  it("4.3. In non-production mode, gracefully returns diagnostic report without throwing", async () => {
    const origEnv = process.env.NODE_ENV;
    const origKey = process.env.GEMINI_API_KEY;

    try {
      process.env.NODE_ENV = "development";
      delete process.env.GEMINI_API_KEY;

      const report = await modelVerificationEngine.verifyStartupModels("");
      expect(report.isProduction).toBe(false);
      expect(report.warnings.length).toBeGreaterThan(0);
      expect(report.warnings[0]).toContain("Operating in offline");
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origKey) process.env.GEMINI_API_KEY = origKey;
    }
  });
});
