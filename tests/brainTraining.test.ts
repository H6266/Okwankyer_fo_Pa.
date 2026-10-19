import { describe, expect, it } from "vitest";
import brainTraining from "../Okwankyerɛfo_Pa_Brain_Training_v2.json";
import { Brain } from "../src/ai_system/brain/brain";
import { BRAIN_TRAINING_SYSTEM_INSTRUCTIONS } from "../src/ai_system/brain/trainingInstructions";

const offlineBrain = new Brain({ mode: "offline_only" });

function getScenario(id: string) {
  const scenario = brainTraining.scenarios.find((candidate) => candidate.scenario_id === id);
  if (!scenario) throw new Error(`Missing Brain training scenario: ${id}`);
  return scenario;
}

describe("Brain training instructions and scenario regressions", () => {
  it("loads the operational instructions from the checked-in 305-scenario JSON", () => {
    expect(brainTraining.scenarios).toHaveLength(305);
    expect(BRAIN_TRAINING_SYSTEM_INSTRUCTIONS).toBe(brainTraining.system_instructions);
  });

  it("extracts a person's name instead of their relationship label", async () => {
    const scenario = getScenario("SCEN-COMPLETE-001");
    const result = await offlineBrain.process({
      transcript: scenario.input_transcript,
      language: "en",
      sessionId: "brain-training-name",
      draft: { slots: {} },
    });

    expect(result.updatedDraft.slots.recipient?.name).toBe("Ama");
  });

  it("keeps the caller's kinship reference without treating it as a verified contact", async () => {
    const scenario = getScenario("SCEN-AMBIGUOUS-001");
    const result = await offlineBrain.process({
      transcript: scenario.input_transcript,
      language: "en",
      sessionId: "brain-training-relationship-reference",
      draft: { slots: {} },
    });

    expect(result.updatedDraft.slots.recipient?.name).toBe("brother");
    expect(result.updatedDraft.slots.recipient?.phone).toBeUndefined();
    expect(result.decision).toMatchObject({ kind: "clarify_slot", slot: "amount" });
  });

  it("asks which amount the caller means instead of choosing one", async () => {
    const scenario = getScenario("SCEN-V2-031");
    const result = await offlineBrain.process({
      transcript: scenario.input_transcript,
      language: "en",
      sessionId: "brain-training-ambiguous-amount",
      draft: { slots: {} },
    });

    expect(result.updatedDraft.intent).toBe("momo.transfer");
    expect(result.decision).toMatchObject({ kind: "clarify_slot", slot: "amount" });
    expect(result.updatedDraft.slots.amount).toBeUndefined();
  });

  it("asks which destination the caller means instead of choosing a phone number", async () => {
    const scenario = getScenario("SCEN-V2-026");
    const result = await offlineBrain.process({
      transcript: scenario.input_transcript,
      language: "en",
      sessionId: "brain-training-ambiguous-recipient",
      draft: { slots: {} },
    });

    expect(result.decision).toMatchObject({ kind: "clarify_slot", slot: "recipient" });
    expect(result.updatedDraft.slots.recipient?.phone).toBeUndefined();
  });

  it("blocks and redacts a spoken PIN from the retained conversation history", async () => {
    const scenario = getScenario("SCEN-V2-053");
    const result = await offlineBrain.process({
      transcript: scenario.input_transcript,
      language: "en",
      sessionId: "brain-training-pin-redaction",
      draft: { slots: {} },
    });
    const retainedHistory = JSON.stringify(result.updatedDraft.recentTurns);

    expect(result.decision).not.toHaveProperty("kind", "dispatch");
    expect(retainedHistory).not.toContain("1234");
    expect(retainedHistory).toContain("[REDACTED_SENSITIVE_INPUT]");
  });
});