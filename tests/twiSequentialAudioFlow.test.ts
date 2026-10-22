import { describe, expect, it } from "vitest";
import {
  CANONICAL_IVR_CATEGORIES,
  TWI_SEQUENTIAL_FLOW_STEPS,
  getAllCanonicalPrompts,
  getFlowStepById,
  getFlowStepByIndex,
  getNextFlowStep,
} from "../src/audio/twiSequentialAudioFlow";
import { audioFileExists } from "../src/audio/catalog";
import { getRecordingByPromptId } from "../src/audio/recordingRegistry";
import { isDynamicPrompt } from "../src/audio/canonicalRegistry";

describe("Guided IVR Audio Preview", () => {
  it("follows the canonical happy path and stops at provider-pending status", () => {
    expect(TWI_SEQUENTIAL_FLOW_STEPS).toHaveLength(20);
    expect(TWI_SEQUENTIAL_FLOW_STEPS.map((step) => step.name.match(/\(OP\d{2}\)/)?.[0])).toEqual([
      "(OP01)", "(OP07)", "(OP08)", "(OP09)", "(OP10)", "(OP16)", "(OP18)", "(OP19)",
      "(OP20)", "(OP21)", "(OP23)", "(OP24)", "(OP28)", "(OP26)", "(OP29)", "(OP35)",
      "(OP36)", "(OP40)", "(OP45)", "(OP46)",
    ]);

    for (const promptId of ["OP20", "OP21", "OP29", "OP35"]) {
      const step = TWI_SEQUENTIAL_FLOW_STEPS.find((item) => item.name.includes(`(${promptId})`));
      expect(step?.isDynamicReadback).toBe(true);
      expect(step?.audioUrl).toBe("");
    }

    expect(getFlowStepById("step_20_waiting_confirmation")?.nextStepId).toBeUndefined();
    expect(TWI_SEQUENTIAL_FLOW_STEPS.some((step) => /OP(52|53|54|56)/.test(step.name))).toBe(false);
  });

  it("chains sequential progression through getNextFlowStep", () => {
    expect(getNextFlowStep("step_01_welcome")?.id).toBe("step_02_service_selection");
    expect(getNextFlowStep("step_06_enter_recipient")?.id).toBe("step_07_recipient_found");
    expect(getNextFlowStep("step_08_recipient_verify_intro")?.id).toBe("step_09_tts_recipient_name");
    expect(getNextFlowStep("step_09_tts_recipient_name")?.id).toBe("step_10_tts_full_phone");
    expect(getNextFlowStep("step_10_tts_full_phone")?.id).toBe("step_11_recipient_confirm");
    expect(getNextFlowStep("step_16_full_transaction_review")?.id).toBe("step_17_final_confirmation");
    expect(getNextFlowStep("step_17_final_confirmation")?.id).toBe("step_18_pin_handoff");
    expect(getNextFlowStep("step_18_pin_handoff")?.id).toBe("step_19_submitted");
    expect(getNextFlowStep("step_19_submitted")?.id).toBe("step_20_waiting_confirmation");
    expect(getNextFlowStep("step_20_waiting_confirmation")).toBeUndefined();
  });

  it("verifies mapped Twi recordings resolve to audio files for the simulator and IVR", () => {
    for (const step of TWI_SEQUENTIAL_FLOW_STEPS) {
      if (step.audioUrl.startsWith("/audio/Twi/")) {
        const decoded = decodeURIComponent(step.audioUrl.replace("/audio/", ""));
        expect(audioFileExists(decoded, "supplied"), `Audio file must resolve: ${decoded}`).toBe(true);
      }
    }
  });

  it("uses registered audio URLs for every canonical prompt and reserves dynamic prompts for TTS", () => {
    for (const prompt of getAllCanonicalPrompts()) {
      if (isDynamicPrompt(prompt.promptId)) {
        expect(prompt.audioUrl).toBe(`/api/audio/prompt-tts/twi/${prompt.promptId}`);
        expect(prompt.fallbackAudioUrl).toBeUndefined();
        continue;
      }

      const recording = getRecordingByPromptId(prompt.promptId, "twi");
      expect(prompt.audioUrl).toBe(recording?.url || "");
      expect(prompt.fallbackAudioUrl).toBeUndefined();
      if (recording) expect(recording.audioVerified).toBe(true);
    }

    expect(CANONICAL_IVR_CATEGORIES.flatMap((category) => category.prompts)).toHaveLength(
      getAllCanonicalPrompts().length
    );
  });

  it("retains the existing transaction safety sequence and has no PIN collection step", () => {
    expect(TWI_SEQUENTIAL_FLOW_STEPS.some((step) => /PIN/i.test(step.name))).toBe(false);
    expect(TWI_SEQUENTIAL_FLOW_STEPS.some((step) => step.name.includes("Dynamic Amount Read-back (OP29)"))).toBe(true);
    expect(TWI_SEQUENTIAL_FLOW_STEPS.some((step) => step.name.includes("Confirm Recipient (OP23)"))).toBe(true);
  });
});
