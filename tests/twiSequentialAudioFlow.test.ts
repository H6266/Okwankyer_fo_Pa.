import { describe, expect, it } from "vitest";
import {
  TWI_SEQUENTIAL_FLOW_STEPS,
  getFlowStepById,
  getFlowStepByIndex,
  getNextFlowStep,
} from "../src/audio/twiSequentialAudioFlow";
import { resolveSafeAudioPath } from "../src/audio/streaming";
import { audioFileExists } from "../src/audio/catalog";

describe("Ɔkwankyerɛfo Pa — Unified 18-Step Audio Flow & State Orchestration", () => {
  it("defines the exact canonical steps in sequential order with PIN handoff", () => {
    expect(TWI_SEQUENTIAL_FLOW_STEPS).toHaveLength(19);

    const step1 = getFlowStepByIndex(1);
    expect(step1?.id).toBe("default_welcome");

    const step2 = getFlowStepByIndex(2);
    expect(step2?.id).toBe("welcome_1");

    const step3 = getFlowStepByIndex(3);
    expect(step3?.id).toBe("language_selection");

    const step4 = getFlowStepByIndex(4);
    expect(step4?.id).toBe("service_selection_2");

    const step5 = getFlowStepByIndex(5);
    expect(step5?.id).toBe("mtn_menu_1");

    const step6 = getFlowStepByIndex(6);
    expect(step6?.id).toBe("enter_recipient_2");
    // Next step after entering recipient is use_recipient_1 (audio 8 before 7)
    expect(step6?.nextStepId).toBe("use_recipient_1");

    // Audio 8 before 7: Step 7 is use_recipient_1 (with dynamic TTS)
    const step7 = getFlowStepByIndex(7);
    expect(step7?.id).toBe("use_recipient_1");
    expect(step7?.isDynamicReadback).toBe(true);
    expect(step7?.nextStepId).toBe("recipient_confirm_speech");

    // Step 8 is recipient_confirm_speech
    const step8 = getFlowStepByIndex(8);
    expect(step8?.id).toBe("recipient_confirm_speech");
    expect(step8?.nextStepId).toBe("amount_prompt_3");

    // Step 9: Amount prompt
    const step9 = getFlowStepByIndex(9);
    expect(step9?.id).toBe("amount_prompt_3");

    // Step 10: Enter amount 4
    const step10 = getFlowStepByIndex(10);
    expect(step10?.id).toBe("enter_amount_4");

    // Step 11: Dynamic TTS + Amount readback 2
    const step11 = getFlowStepByIndex(11);
    expect(step11?.id).toBe("amount_readback_2");
    expect(step11?.isDynamicReadback).toBe(true);
    expect(step11?.nextStepId).toBe("confirm_speech");

    // Step 12: Confirm speech
    const step12 = getFlowStepByIndex(12);
    expect(step12?.id).toBe("confirm_speech");
    expect(step12?.nextStepId).toBe("pin_handoff");

    // Step 13: PIN Handoff (OP40)
    const step13 = getFlowStepByIndex(13);
    expect(step13?.id).toBe("pin_handoff");
    expect(step13?.audioUrl).toContain("Pin%20Handoff.m4a");
    expect(step13?.nextStepId).toBe("submitted");

    // Step 14: Submitted
    const step14 = getFlowStepByIndex(14);
    expect(step14?.id).toBe("submitted");
    expect(step14?.nextStepId).toBe("transaction_status");

    // Step 15: Transaction Status
    const step15 = getFlowStepByIndex(15);
    expect(step15?.id).toBe("transaction_status");
    expect(step15?.nextStepId).toBe("success_audio");

    // Step 16: Success Audio
    const step16 = getFlowStepByIndex(16);
    expect(step16?.id).toBe("success_audio");
    expect(step16?.nextStepId).toBe("keep_reference");

    // Step 17: Keep Reference
    const step17 = getFlowStepByIndex(17);
    expect(step17?.id).toBe("keep_reference");
    expect(step17?.nextStepId).toBe("dynamic_tts_reference");

    // Step 18: Dynamic TTS — Transaction Reference
    const step18 = getFlowStepByIndex(18);
    expect(step18?.id).toBe("dynamic_tts_reference");
    expect(step18?.isDynamicReadback).toBe(true);
    expect(step18?.nextStepId).toBe("anything_else");

    // Step 19: Anything Else
    const step19 = getFlowStepByIndex(19);
    expect(step19?.id).toBe("anything_else");
  });

  it("chains sequential progression through getNextFlowStep", () => {
    expect(getNextFlowStep("default_welcome")?.id).toBe("welcome_1");
    expect(getNextFlowStep("enter_recipient_2")?.id).toBe("use_recipient_1");
    expect(getNextFlowStep("use_recipient_1")?.id).toBe("recipient_confirm_speech");
    expect(getNextFlowStep("amount_readback_2")?.id).toBe("confirm_speech");
    expect(getNextFlowStep("confirm_speech")?.id).toBe("pin_handoff");
    expect(getNextFlowStep("pin_handoff")?.id).toBe("submitted");
    expect(getNextFlowStep("success_audio")?.id).toBe("keep_reference");
    expect(getNextFlowStep("keep_reference")?.id).toBe("dynamic_tts_reference");
    expect(getNextFlowStep("dynamic_tts_reference")?.id).toBe("anything_else");
  });

  it("verifies physical audio assets exist on disk for all steps with audioUrl", () => {
    for (const step of TWI_SEQUENTIAL_FLOW_STEPS) {
      if (step.audioUrl.startsWith("/audio/supplied/")) {
        const decoded = decodeURIComponent(step.audioUrl.replace("/audio/supplied/", ""));
        expect(audioFileExists(decoded, "supplied"), `File must exist: ${decoded}`).toBe(true);
      }
    }
  });
});
