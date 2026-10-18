import { describe, expect, it } from "vitest";
import {
  TWI_SEQUENTIAL_FLOW_STEPS,
  getFlowStepById,
  getFlowStepByIndex,
  getNextFlowStep,
} from "../src/audio/twiSequentialAudioFlow";
import { resolveSafeAudioPath } from "../src/audio/streaming";

describe("Ɔkwankyerɛfo Pa — Transaction Audio Flow", () => {
  it("defines the ordered 23-step journey with dynamic readbacks and handset authorization", () => {
    const expectedIds = [
      "step_01_welcome",
      "step_02_service_selection",
      "step_03_network_selection",
      "step_04_mtn_menu",
      "step_05_send_money_ack",
      "step_06_enter_recipient",
      "step_07_recipient_found",
      "step_08_recipient_verify_intro",
      "step_09_tts_recipient_name",
      "step_10_tts_full_phone",
      "step_11_recipient_confirm",
      "step_12_use_recipient_ack",
      "step_13_amount_prompt",
      "step_14_enter_amount",
      "step_15_amount_readback",
      "step_16_review_transaction",
      "step_17_full_transaction_review",
      "step_18_pin_handoff",
      "step_19_waiting_confirmation",
      "step_20_success_sent",
      "step_21_keep_reference",
      "step_22_slow_reference_readback",
      "step_23_anything_else",
    ];

    expect(TWI_SEQUENTIAL_FLOW_STEPS.map((step) => step.id)).toEqual(expectedIds);
    expect(getFlowStepByIndex(1)?.id).toBe("step_01_welcome");
    expect(getFlowStepByIndex(18)?.audioUrl).toBe("/audio/Twi_library/Authorize_phone.mp3");
    expect(getFlowStepByIndex(19)?.id).toBe("step_19_waiting_confirmation");
    expect(getFlowStepByIndex(20)?.id).toBe("step_20_success_sent");
    expect(getFlowStepById("step_09_tts_recipient_name")?.isDynamicReadback).toBe(true);
    expect(getFlowStepById("step_15_amount_readback")?.isDynamicReadback).toBe(true);
    expect(getFlowStepById("step_22_slow_reference_readback")?.isDynamicReadback).toBe(true);
  });

  it("requires the matching validation or provider outcome before advancing gated steps", () => {
    expect(getNextFlowStep("step_01_welcome")).toBeUndefined();
    expect(getNextFlowStep("step_01_welcome", "language-selected")?.id).toBe("step_02_service_selection");

    expect(getNextFlowStep("step_06_enter_recipient")).toBeUndefined();
    expect(getNextFlowStep("step_06_enter_recipient", "recipient-verified")?.id).toBe("step_07_recipient_found");
    expect(getNextFlowStep("step_11_recipient_confirm", "amount-confirmed")).toBeUndefined();
    expect(getNextFlowStep("step_11_recipient_confirm", "recipient-confirmed")?.id).toBe("step_12_use_recipient_ack");

    expect(getNextFlowStep("step_14_enter_amount", "recipient-verified")).toBeUndefined();
    expect(getNextFlowStep("step_14_enter_amount", "amount-validated")?.id).toBe("step_15_amount_readback");
    expect(getNextFlowStep("step_17_full_transaction_review", "provider-submitted")).toBeUndefined();
    expect(getNextFlowStep("step_17_full_transaction_review", "transaction-confirmed")?.id).toBe("step_18_pin_handoff");
    expect(getNextFlowStep("step_18_pin_handoff", "transaction-confirmed")).toBeUndefined();
    expect(getNextFlowStep("step_18_pin_handoff", "provider-submitted")?.id).toBe("step_19_waiting_confirmation");

    expect(getNextFlowStep("step_19_waiting_confirmation")).toBeUndefined();
    expect(getNextFlowStep("step_19_waiting_confirmation", "provider-confirmed-success")?.id)
      .toBe("step_20_success_sent");
  });

  it("resolves every fixed flow recording to a real file and keeps dynamic prompts on TTS", () => {
    for (const step of TWI_SEQUENTIAL_FLOW_STEPS) {
      if (step.audioUrl.startsWith("/api/audio/prompt-tts/")) {
        expect(step.isDynamicReadback, step.id).toBe(true);
        continue;
      }

      const audioPath = decodeURIComponent(new URL(step.audioUrl, "http://localhost").pathname)
        .replace(/^\/audio\//, "");
      expect(resolveSafeAudioPath(audioPath), `File must exist: ${audioPath}`).not.toBeNull();
    }
  });
});
