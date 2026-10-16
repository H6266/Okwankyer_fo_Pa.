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
  it("defines the exact 18 canonical steps in sequential order", () => {
    expect(TWI_SEQUENTIAL_FLOW_STEPS).toHaveLength(18);

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

    // Step 12: Confirm speech
    const step12 = getFlowStepByIndex(12);
    expect(step12?.id).toBe("confirm_speech");
    // Audio 13 (Authorize phone) removed: step 12 transitions directly to submitted
    expect(step12?.nextStepId).toBe("submitted");

    // Step 13: Submitted
    const step13 = getFlowStepByIndex(13);
    expect(step13?.id).toBe("submitted");
    expect(step13?.nextStepId).toBe("transaction_status");

    // Step 14: Transaction Status
    const step14 = getFlowStepByIndex(14);
    expect(step14?.id).toBe("transaction_status");
    expect(step14?.nextStepId).toBe("success_audio");

    // Step 15: Success Audio
    const step15 = getFlowStepByIndex(15);
    expect(step15?.id).toBe("success_audio");
    expect(step15?.nextStepId).toBe("keep_reference");

    // Step 16: Keep Reference (plays BEFORE dynamic TTS reference)
    const step16 = getFlowStepByIndex(16);
    expect(step16?.id).toBe("keep_reference");
    expect(step16?.nextStepId).toBe("anything_else");

    // Step 17: Anything Else
    const step17 = getFlowStepByIndex(17);
    expect(step17?.id).toBe("anything_else");
    expect(step17?.nextStepId).toBe("dynamic_tts_reference");

    // Step 18: Dynamic TTS — Transaction Reference (plays AFTER Keep Reference / Anything Else)
    const step18 = getFlowStepByIndex(18);
    expect(step18?.id).toBe("dynamic_tts_reference");
    expect(step18?.isDynamicReadback).toBe(true);
  });

  it("chains sequential progression through getNextFlowStep", () => {
    expect(getNextFlowStep("default_welcome")?.id).toBe("welcome_1");
    expect(getNextFlowStep("enter_recipient_2")?.id).toBe("use_recipient_1");
    expect(getNextFlowStep("use_recipient_1")?.id).toBe("recipient_confirm_speech");
    expect(getNextFlowStep("confirm_speech")?.id).toBe("submitted");
    expect(getNextFlowStep("success_audio")?.id).toBe("keep_reference");
    expect(getNextFlowStep("keep_reference")?.id).toBe("anything_else");
    expect(getNextFlowStep("anything_else")?.id).toBe("dynamic_tts_reference");
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
