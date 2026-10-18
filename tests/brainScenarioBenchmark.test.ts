import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { Brain } from "../src/ai_system/brain/brain";
import { serviceRegistry } from "../src/ai_system/brain/serviceRegistry";
import { brainTelemetry } from "../src/ai_system/brain/brainTelemetry";
import { shadowEngine } from "../src/ai_system/brain/shadowEngine";
import { setRequireApprovedNumbers } from "../src/ai_system/linguistic/twiNumberWords";
import { setAllowUnapprovedTemplates } from "../src/ai_system/brain/replyTemplates";
import { auditLogger } from "../src/services/auditLogger";
import type { DraftState, LanguageId } from "../src/ai_system/brain/types";

interface ScenarioTurn {
  utterance: string;
  language: LanguageId;
  expected: {
    decision: string;
    slot?: string;
    intent?: string;
    amount?: number | null;
    recipientPhone?: string;
    confirmed?: boolean;
    replyIncludes?: string;
    nextAction?: "ask_recipient_phone" | "ask_amount" | "confirm_transaction" | "block_sensitive_input";
  };
}

interface ConversationScenario {
  id: string;
  turns: ScenarioTurn[];
  safety?: string[];
}

interface PhraseFamily {
  idPrefix: string;
  language: LanguageId;
  utterances: string[];
  expected: ScenarioTurn["expected"];
  safety?: string[];
}

interface CorrectionFamily {
  idPrefix: string;
  language: LanguageId;
  initial: ScenarioTurn;
  corrections: Array<{
    id: string;
    utterance: string;
    expected: ScenarioTurn["expected"];
  }>;
  safety?: string[];
}

const benchmark = JSON.parse(
  readFileSync("eval/brain/conversation_scenarios.json", "utf8")
) as {
  scenarios: ConversationScenario[];
  phraseFamilies?: PhraseFamily[];
  correctionFamilies?: CorrectionFamily[];
};

const expandedFamilies: ConversationScenario[] = [
  ...(benchmark.phraseFamilies || []).flatMap((family) =>
    family.utterances.map((utterance, index) => ({
      id: `${family.idPrefix}-${String(index + 1).padStart(2, "0")}`,
      turns: [{ utterance, language: family.language, expected: family.expected }],
      safety: family.safety,
    }))
  ),
  ...(benchmark.correctionFamilies || []).flatMap((family) =>
    family.corrections.map((correction) => ({
      id: `${family.idPrefix}-${correction.id}`,
      turns: [family.initial, {
        utterance: correction.utterance,
        language: family.language,
        expected: correction.expected,
      }],
      safety: family.safety,
    }))
  ),
];

const allScenarios = [...benchmark.scenarios, ...expandedFamilies];

describe("Authored brain conversation benchmark", () => {
  beforeEach(() => {
    serviceRegistry.resetToDefaults();
    setRequireApprovedNumbers(false);
    setAllowUnapprovedTemplates(true);
  });

  afterEach(() => {
    setRequireApprovedNumbers(true);
    setAllowUnapprovedTemplates(false);
  });

  it("contains at least 100 authored cases once all phrase families are expanded", () => {
    expect(allScenarios.length).toBeGreaterThanOrEqual(100);
  });

  it.each(allScenarios)("$id", async (scenario) => {
    const scenarioBrain = new Brain({ mode: "offline_only" });
    let draft: DraftState = { slots: {} };

    for (const turn of scenario.turns) {
      const result = await scenarioBrain.process({
        transcript: turn.utterance,
        language: turn.language,
        languageConfidence: 0.95,
        sessionLanguage: turn.language,
        sessionId: `scenario_${scenario.id}`,
        draft,
      });
      const expected = turn.expected;

      expect(result.decision.kind).toBe(expected.decision);
      expect(result.decision.kind).not.toBe("dispatch");
      if (expected.slot) {
        expect(result.decision.kind).toBe("clarify_slot");
        if (result.decision.kind === "clarify_slot") {
          expect(result.decision.slot).toBe(expected.slot);
        }
      }
      if (expected.intent) expect(result.updatedDraft.intent).toBe(expected.intent);
      if (Object.prototype.hasOwnProperty.call(expected, "amount")) {
        if (expected.amount === null) expect(result.updatedDraft.slots.amount).toBeUndefined();
        else expect(result.updatedDraft.slots.amount).toBe(expected.amount);
      }
      if (expected.recipientPhone) {
        expect(result.updatedDraft.slots.recipient?.phone).toBe(expected.recipientPhone);
      }
      if (expected.confirmed !== undefined) expect(result.updatedDraft.confirmed).toBe(expected.confirmed);
      if (expected.replyIncludes) expect(result.reply.text.toLowerCase()).toContain(expected.replyIncludes.toLowerCase());
      if (expected.nextAction === "ask_recipient_phone") {
        expect(result.decision.kind).toBe("clarify_slot");
        if (result.decision.kind === "clarify_slot") expect(result.decision.slot).toBe("recipient");
      }
      if (expected.nextAction === "ask_amount") {
        expect(result.decision.kind).toBe("clarify_slot");
        if (result.decision.kind === "clarify_slot") expect(result.decision.slot).toBe("amount");
      }
      if (expected.nextAction === "confirm_transaction") expect(result.decision.kind).toBe("confirm");
      if (expected.nextAction === "block_sensitive_input") {
        expect(result.decision.kind).toBe("clarify_slot");
        if (result.decision.kind === "clarify_slot") expect(result.decision.slot).toBe("pin_blocked");
        expect(JSON.stringify(result.updatedDraft)).not.toMatch(/\b(?:1234|4321|9988)\b/);
      }

      draft = result.updatedDraft;
    }
  });

  it("keeps a spoken PIN out of drafts, telemetry, audit logs, and shadow comparison", async () => {
    const pinUtterance = "My PIN is 4826; send 50 cedis";
    const telemetrySpy = vi.spyOn(brainTelemetry, "recordTurn");
    const shadowSpy = vi.spyOn(shadowEngine, "recordShadowComparison");
    const auditSpy = vi.spyOn(auditLogger, "log");
    const scenarioBrain = new Brain({ mode: "shadow", shadowSamplingRate: 1 });

    try {
      const result = await scenarioBrain.process({
        transcript: pinUtterance,
        language: "en",
        languageConfidence: 0.95,
        sessionLanguage: "en",
        sessionId: "benchmark_pin_redaction",
        draft: { slots: {} },
      });

      expect(result.decision.kind).toBe("clarify_slot");
      if (result.decision.kind === "clarify_slot") expect(result.decision.slot).toBe("pin_blocked");
      expect(JSON.stringify(result.updatedDraft)).not.toContain("4826");
      expect(telemetrySpy).toHaveBeenCalledWith(expect.objectContaining({ utterance: "[REDACTED_SENSITIVE_INPUT]" }));
      expect(shadowSpy).not.toHaveBeenCalled();
      expect(auditSpy.mock.calls.flat().join(" ")).not.toContain("4826");
    } finally {
      telemetrySpy.mockRestore();
      shadowSpy.mockRestore();
      auditSpy.mockRestore();
    }
  });
});
