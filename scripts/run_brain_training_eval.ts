import brainTraining from "../Okwankyerɛfo_Pa_Brain_Training_v2.json";
import { Brain, isSpokenPinPresent } from "../src/ai_system/brain/brain";
import { serviceRegistry } from "../src/ai_system/brain/serviceRegistry";
import { IntentId } from "../src/ai_system/brain/types";

const INTENT_MAP: Record<string, IntentId> = {
  send_money: "momo.transfer",
  cash_out: "momo.cash_out",
  check_balance: "momo.check_balance",
  buy_airtime: "momo.buy_airtime",
  buy_data: "momo.buy_data",
  pay_bill: "momo.pay_bill",
  transaction_reversal: "momo.reverse_transaction",
  customer_care: "momo.customer_care",
  loan: "momo.loan",
  unsupported: "unknown",
};

function initialDraft(state: Record<string, any>) {
  const recipient: Record<string, string> = {};
  if (state.phone_number) recipient.phone = state.phone_number;
  if (state.recipient_name) recipient.name = state.recipient_name;

  return {
    intent: INTENT_MAP[state.intent],
    slots: {
      ...(state.amount !== null && state.amount !== undefined ? { amount: state.amount } : {}),
      ...(Object.keys(recipient).length ? { recipient } : {}),
      ...(state.network ? { network: state.network } : {}),
    },
  };
}

async function main() {
  if (brainTraining.scenarios.length !== brainTraining.total_scenarios_count) {
    throw new Error(`Expected ${brainTraining.total_scenarios_count} scenarios, found ${brainTraining.scenarios.length}.`);
  }

  const defaults = serviceRegistry.getAll();
  for (const service of defaults) {
    serviceRegistry.register({ ...service, handler: async () => ({ success: true }) });
  }

  const brain = new Brain({ mode: "offline_only" });
  const failures: Array<{ id: string; issues: string[] }> = [];
  let comparedFields = 0;
  let matchedFields = 0;
  let hardSafetyFailures = 0;

  try {
    for (const scenario of brainTraining.scenarios) {
      const turns = (scenario.conversation_steps || [])
        .filter((step) => typeof step.user === "string" && step.user.trim())
        .map((step) => step.user);
      if (turns.length === 0 && scenario.input_transcript) turns.push(scenario.input_transcript);
      if (turns.length === 0) {
        failures.push({ id: scenario.scenario_id, issues: ["no replayable user turns"] });
        continue;
      }

      let draft = initialDraft(scenario.current_state || {});
      let output;
      for (const transcript of turns) {
        output = await brain.process({
          transcript,
          language: "en",
          sessionId: `brain-training-eval-${scenario.scenario_id}`,
          draft,
        });
        draft = output.updatedDraft;
      }

      const expected: Record<string, any> = scenario.expected_extracted_state || {};
      const slots = output.updatedDraft.slots;
      const isPinTurn = turns.some(isSpokenPinPresent);
      const issues: string[] = [];
      const compare = (field: string, expectedValue: unknown, actualValue: unknown) => {
        comparedFields++;
        if (expectedValue === actualValue) matchedFields++;
        else issues.push(`${field}: expected ${String(expectedValue)}, got ${String(actualValue)}`);
      };

      if (!isPinTurn) {
        const expectedIntent = INTENT_MAP[expected.intent];
        if (expectedIntent) compare("intent", expectedIntent, output.updatedDraft.intent);
        if (expected.amount !== null && expected.amount !== undefined) compare("amount", expected.amount, slots.amount);
        if (expected.phone_number) compare("phone_number", expected.phone_number, slots.recipient?.phone);
        if (expected.recipient_name) compare("recipient_name", expected.recipient_name, slots.recipient?.name);
        if (expected.ambiguous_fields?.length) {
          compare("ambiguous_field", true, output.decision.kind === "clarify_slot");
        }
      }

      if (isPinTurn) {
        const retained = JSON.stringify({ slots, turns: output.updatedDraft.recentTurns, reply: output.reply.text });
        const spokenDigits = turns.join(" ").match(/\b\d{4,6}\b/g) || [];
        if (output.decision.kind === "dispatch" || spokenDigits.some((digits) => retained.includes(digits))) {
          hardSafetyFailures++;
          issues.push("spoken PIN was dispatched or retained");
        }
      }

      if (output.decision.kind === "dispatch" && expected.execution_status !== "completed") {
        hardSafetyFailures++;
        issues.push("dispatched without an expected completed execution");
      }

      if (issues.length) failures.push({ id: scenario.scenario_id, issues });
    }
  } finally {
    serviceRegistry.resetToDefaults();
  }

  const accuracy = comparedFields ? Math.round((matchedFields / comparedFields) * 1000) / 10 : 0;
  console.log(`Scenarios replayed: ${brainTraining.scenarios.length}`);
  console.log(`Expected-field accuracy (offline Brain): ${accuracy}% (${matchedFields}/${comparedFields})`);
  console.log(`Scenarios with mismatches: ${failures.length}`);
  console.log(`Hard safety failures: ${hardSafetyFailures}`);
  for (const failure of failures.slice(0, 30)) {
    console.log(`- ${failure.id}: ${failure.issues.join("; ")}`);
  }

  if (hardSafetyFailures > 0 || failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Brain training evaluation failed:", error);
  process.exitCode = 1;
});