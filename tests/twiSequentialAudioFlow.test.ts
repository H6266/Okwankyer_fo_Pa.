import { describe, expect, it } from "vitest";
import {
  TWI_SEQUENTIAL_FLOW_STEPS,
  getFlowStepById,
  getFlowStepByIndex,
  getNextFlowStep,
} from "../src/audio/twiSequentialAudioFlow";
import { matchReplyToAudio } from "../src/audio/replyAudioMatcher";
import { resolveSafeAudioPath } from "../src/audio/streaming";

describe("Twi Sequential Audio Flow & Confidence Matcher", () => {
  it("defines the exact 14 canonical steps in sequential order", () => {
    expect(TWI_SEQUENTIAL_FLOW_STEPS).toHaveLength(14);

    const step1 = getFlowStepByIndex(1);
    expect(step1?.name).toBe("audio/welcome");

    const step2 = getFlowStepByIndex(2);
    expect(step2?.name).toBe("twi/description/");

    const step3 = getFlowStepByIndex(3);
    expect(step3?.name).toBe("twi/main service navigation/network selection");

    const step4 = getFlowStepByIndex(4);
    expect(step4?.name).toBe("twi/main service navigation/services selection");

    const step5 = getFlowStepByIndex(5);
    expect(step5?.name).toBe("twi/main service navigation/send money selected");

    const step6 = getFlowStepByIndex(6);
    expect(step6?.name).toBe("twi/Recipient_Entry_Verification/enter recipient");

    const step7 = getFlowStepByIndex(7);
    expect(step7?.name).toBe("twi/amount_enter_verification/enter amount prompt");

    const step8 = getFlowStepByIndex(8);
    expect(step8?.name).toBe("twi/transaction/confirmation_intro");

    const step9 = getFlowStepByIndex(9);
    expect(step9?.name).toBe("twi/transaction_confirmation/review transaction");

    const step10 = getFlowStepByIndex(10);
    expect(step10?.name).toBe("(transaction is read / displayed)");
    expect(step10?.isDynamicReadback).toBe(true);

    const step11 = getFlowStepByIndex(11);
    expect(step11?.name).toBe("twi/transaction_confirmation/ready_submit & confirm speech audio");

    const step12 = getFlowStepByIndex(12);
    expect(step12?.name).toBe("twi/transaction_confirmation/reject speech - error");

    const step13 = getFlowStepByIndex(13);
    expect(step13?.name).toBe("twi/success_completion/success sent - success");

    const step14 = getFlowStepByIndex(14);
    expect(step14?.name).toBe("twi/success_completion/success close speech");
  });

  it("advances sequentially from welcome through description to network selection", () => {
    const nextAfterWelcome = getNextFlowStep("welcome");
    expect(nextAfterWelcome?.id).toBe("description");

    const nextAfterDesc = getNextFlowStep("description");
    expect(nextAfterDesc?.id).toBe("network_selection");

    const nextAfterNetwork = getNextFlowStep("network_selection");
    expect(nextAfterNetwork?.id).toBe("services_selection");
  });

  it("resolves all static audio files securely via streaming without null or 404", () => {
    for (const step of TWI_SEQUENTIAL_FLOW_STEPS) {
      if (step.audioUrl) {
        const resolved = resolveSafeAudioPath(step.audioUrl);
        expect(resolved, `Path for ${step.name} should resolve`).toBeTruthy();
      }
    }
  });

  describe("Confidence-Based Phrase Matcher (50%–100% Gate)", () => {
    it("matches recipient entry with high confidence (>= 50%) and returns studio audio", () => {
      const match = matchReplyToAudio("Please enter the recipient phone number", "en", { minConfidence: 0.50 });
      expect(match.match).toBe(true);
      expect(match.isFallbackToTts).toBe(false);
      expect(match.confidence).toBeGreaterThanOrEqual(0.50);
      expect(match.audioUrl).toContain("Enter%20recipient.mp3");
    });

    it("matches Akan Twi recipient prompt with high confidence (>= 50%)", () => {
      const match = matchReplyToAudio("Yɛsrɛ wo bɔ obi a woremane no no fon nɔmba a ɛyɛ du", "tw", { minConfidence: 0.50 });
      expect(match.match).toBe(true);
      expect(match.isFallbackToTts).toBe(false);
      expect(match.confidence).toBeGreaterThanOrEqual(0.50);
      expect(match.audioUrl).toContain("Enter%20recipient.mp3");
    });

    it("matches amount entry prompt with high confidence (>= 50%)", () => {
      const match = matchReplyToAudio("How many Ghana cedis do you want to send?", "en", { minConfidence: 0.50 });
      expect(match.match).toBe(true);
      expect(match.isFallbackToTts).toBe(false);
      expect(match.confidence).toBeGreaterThanOrEqual(0.50);
    });

    it("matches rejection / cancellation with high confidence (>= 50%)", () => {
      const match = matchReplyToAudio("Transaction cancelled or rejected", "en", { minConfidence: 0.50 });
      expect(match.match).toBe(true);
      expect(match.isFallbackToTts).toBe(false);
      expect(match.confidence).toBeGreaterThanOrEqual(0.50);
      expect(match.audioUrl).toContain("Reject%20speech.mp3");
    });

    it("falls back to TTS when confidence is below 50% for unique unrecorded questions", () => {
      const match = matchReplyToAudio("What is the current temperature and forecast in Tamale?", "en", { minConfidence: 0.50 });
      expect(match.match).toBe(false);
      expect(match.isFallbackToTts).toBe(true);
      expect(match.confidence).toBeLessThan(0.50);
    });
  });
});
