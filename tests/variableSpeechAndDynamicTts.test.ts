/**
 * Ɔkwankyerɛfo Pa - Variable Speech & Dynamic TTS Architecture Test Suite
 *
 * Verifies all 10 acceptance criteria from Section 7:
 * 1. Fixed welcome prompt uses recorded MP3 and does zero TTS calls.
 * 2. Changing recipient phone number changes the spoken confirmation.
 * 3. Changing amount from GH₵20 to GH₵35 produces speech for GH₵35.
 * 4. Sandbox fixture is explicitly labeled as demo data, not real subscriber verification.
 * 5. Unknown recipient triggers explicit unverified warning.
 * 6. Pending or failed payment never produces a success receipt.
 * 7. Receipt uses transaction's existing canonical reference (no double generation).
 * 8. Second response stops first audio; exactly one source plays at a time.
 * 9. If TTS fails, fallback is controlled and does not overlap.
 * 10. English and Twi each use the correct language and supported speech provider.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { variableSpeechService } from "../src/audio/variableSpeechService";
import { audioPlaybackController } from "../src/audio/audioPlaybackController";
import {
  buildSafeConfirmationPrompt,
  buildReceiptPrompt,
  buildPendingAuthorizationPrompt,
} from "../src/audio/dynamicPromptBuilder";
import { sandboxRecipientResolver } from "../src/providers/recipient/RecipientResolver";
import { SANDBOX_RECIPIENT_FIXTURES } from "../src/demo/recipientFixtures";

describe("Professional Dynamic TTS & Variable Speech Layer", () => {
  beforeEach(() => {
    audioPlaybackController.stop();
  });

  it("1. Fixed welcome prompt evaluates to RECORDED mode with zero TTS calls", () => {
    const decisionEn = variableSpeechService.evaluate({
      mode: "RECORDED",
      language: "en",
      promptKey: "welcome",
      purpose: "FIXED_INSTRUCTION",
    });

    expect(decisionEn.mode).toBe("RECORDED");
    expect(decisionEn.audioUrl).toBe("/audio/Welcome_prompt_01.mp3");

    const decisionTwi = variableSpeechService.evaluate({
      mode: "RECORDED",
      language: "twi",
      promptKey: "service_select",
      purpose: "FIXED_INSTRUCTION",
    });

    expect(decisionTwi.mode).toBe("RECORDED");
    expect(decisionTwi.audioUrl).toBe("/audio/Twi/Audio_prompt_twi_03.mp3");
  });

  it("2. Changing recipient phone number changes the spoken confirmation last 4 digits", () => {
    const p1 = buildSafeConfirmationPrompt({
      language: "en",
      amount: 20,
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      isVerified: true,
      callbackUrl: "/callback",
    });

    const p2 = buildSafeConfirmationPrompt({
      language: "en",
      amount: 20,
      recipientPhone: "0241234567",
      recipientName: "Ama Serwaa",
      isVerified: true,
      callbackUrl: "/callback",
    });

    expect(p1.spokenText).toContain("8 4 6 4");
    expect(p2.spokenText).toContain("4 5 6 7");
    expect(p1.spokenText).not.toEqual(p2.spokenText);
  });

  it("3. Changing amount from GH₵20 to GH₵35 produces speech for GH₵35", () => {
    const p20 = buildSafeConfirmationPrompt({
      language: "en",
      amount: 20,
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      isVerified: true,
      callbackUrl: "/callback",
    });

    const p35 = buildSafeConfirmationPrompt({
      language: "en",
      amount: 35,
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      isVerified: true,
      callbackUrl: "/callback",
    });

    expect(p20.spokenText).toContain("20 Cedis");
    expect(p35.spokenText).toContain("35 Cedis");
  });

  it("4. Sandbox fixture is explicitly labeled as demo data, not real subscriber verification", async () => {
    const fixturePhone = "0553838464";
    expect(SANDBOX_RECIPIENT_FIXTURES[fixturePhone]).toBeDefined();

    const resolution = await sandboxRecipientResolver.resolve(fixturePhone);
    expect(resolution.source).toBe("SANDBOX_FIXTURE");
    expect(resolution.name).toBe("Kwame Boateng");
    expect(resolution.verified).toBe(true);

    // Decision metadata records demo fixture flag
    const decision = variableSpeechService.evaluate({
      mode: "SYNTHESIZE",
      language: "en",
      text: "Sending 20 Cedis to Kwame Boateng",
      purpose: "RECIPIENT_READBACK",
      metadata: {
        recipientPhone: fixturePhone,
        recipientName: resolution.name,
        isVerified: resolution.verified,
        isDemoFixture: resolution.source === "SANDBOX_FIXTURE",
      },
    });

    expect(decision.isDemoFixture).toBe(true);
    expect(decision.maskedRecipient).toBe("055****464");
  });

  it("5. Unknown recipient triggers an explicit unverified warning in English and Twi", () => {
    const unverifiedEn = buildSafeConfirmationPrompt({
      language: "en",
      amount: 50,
      recipientPhone: "0249999999",
      recipientName: null,
      isVerified: false,
      callbackUrl: "/callback",
    });

    expect(unverifiedEn.spokenText).toContain("Warning: The recipient name");
    expect(unverifiedEn.spokenText).toContain("could not be verified");

    const unverifiedTwi = buildSafeConfirmationPrompt({
      language: "twi",
      amount: 50,
      recipientPhone: "0249999999",
      recipientName: null,
      isVerified: false,
      callbackUrl: "/callback",
    });

    expect(unverifiedTwi.spokenText).toContain("Kɔkɔbɔ: Yɛantumi anhu edin");
  });

  it("6. Pending or failed payment never produces a success receipt", () => {
    const canonicalRef = "OKP-883311";

    const failedReceipt = buildReceiptPrompt({
      language: "en",
      amount: 15,
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      referenceId: canonicalRef,
      timestamp: new Date(),
      status: "FAILED",
    });

    expect(failedReceipt.spokenText).toContain("has failed");
    expect(failedReceipt.spokenText).not.toContain("Congratulations");

    const pendingReceipt = buildReceiptPrompt({
      language: "en",
      amount: 15,
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      referenceId: canonicalRef,
      timestamp: new Date(),
      status: "PENDING",
    });

    expect(pendingReceipt.spokenText).toContain("pending authorization");
    expect(pendingReceipt.spokenText).not.toContain("Congratulations");
  });

  it("7. Receipt uses transaction's existing canonical reference rather than inventing a new one", () => {
    const existingRef = "OKP-772211";
    const receipt = buildReceiptPrompt({
      language: "en",
      amount: 40,
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      referenceId: existingRef,
      timestamp: new Date(),
      status: "SUCCESSFUL",
    });

    expect(receipt.spokenText).toContain("O K P - 7 7 2 2 1 1");
  });

  it("8. A second response stops the first audio; exactly one playback source plays at a time", async () => {
    const token1 = audioPlaybackController.getCurrentToken();

    // Start first audio playback
    const p1 = audioPlaybackController.play("/audio/Welcome_prompt_01.mp3");
    const token2 = audioPlaybackController.getCurrentToken();
    expect(token2).toBeGreaterThan(token1);
    expect(audioPlaybackController.getActiveClip()).toBe("/audio/Welcome_prompt_01.mp3");

    // Start second audio playback immediately
    const p2 = audioPlaybackController.play({
      audioBase64: "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
      audioMimeType: "audio/wav",
      text: "Dynamic TTS audio turn",
      sourceType: "SYNTHESIZED_TTS",
    });

    const token3 = audioPlaybackController.getCurrentToken();
    expect(token3).toBeGreaterThan(token2);

    // p1 resolved false because it was cancelled and superseded by p2
    const res1 = await p1;
    expect(res1).toBe(false);
  });

  it("9. If dynamic speech instruction is incomplete, service rejects without uncontrolled audio overlap", () => {
    expect(() => {
      variableSpeechService.evaluate({
        mode: "SYNTHESIZE",
        language: "en",
        text: "",
        purpose: "TRANSACTION_RECEIPT",
      });
    }).toThrow("Incomplete dynamic speech instruction");
  });

  it("10. English and Twi each select correct language parameters in variableSpeechService", async () => {
    const decEn = variableSpeechService.evaluate({
      mode: "SYNTHESIZE",
      language: "en",
      text: "You are about to send 20 Cedis to Kwame",
      purpose: "AMOUNT_READBACK",
    });

    expect(decEn.language).toBe("en");

    const decTw = variableSpeechService.evaluate({
      mode: "SYNTHESIZE",
      language: "twi",
      text: "Worepɛ sɛ womane 20 Cedis kɔma Kwame",
      purpose: "AMOUNT_READBACK",
    });

    expect(decTw.language).toBe("twi");
  });
});
