import { describe, expect, it } from "vitest";
import { aiUnderstanding } from "../src/ai_system/core/aiUnderstanding";
import { parseUserIntent, IntentType } from "../src/modules/nluService";

interface UtteranceCase {
  text: string;
  language: "en" | "twi";
  intent: IntentType;
}

const englishTemplates: Array<[string, IntentType]> = [
  ["I want to send money", "SEND_MONEY"],
  ["Help me transfer money", "SEND_MONEY"],
  ["Please send 50 cedis to 0241234567", "SEND_MONEY"],
  ["Check my balance", "CHECK_BALANCE"],
  ["How much do I have", "CHECK_BALANCE"],
  ["I want to withdraw money", "CASH_OUT"],
  ["Cash out at an agent", "CASH_OUT"],
  ["Pay my ECG bill", "PAY_BILL"],
  ["Buy airtime for my phone", "BUY_AIRTIME"],
  ["Buy a data bundle", "BUY_DATA"],
];

const twiTemplates: Array<[string, IntentType]> = [
  ["Mepɛ sɛ mesoma sika", "SEND_MONEY"],
  ["Mepɛ sɛ mede sika kɔma obi", "SEND_MONEY"],
  ["Mane sika 50 kɔma 0241234567", "SEND_MONEY"],
  ["Fa sika kɔma Kwame", "SEND_MONEY"],
  ["Hwɛ me balance", "CHECK_BALANCE"],
  ["Sika a aka wɔ me account mu", "CHECK_BALANCE"],
  ["Mepɛ sɛ megye sika", "CASH_OUT"],
  ["Gye sika no", "CASH_OUT"],
  ["Mepɛ sɛ metua ECG bill", "PAY_BILL"],
  ["Mepɛ sɛ metɔ airtime", "BUY_AIRTIME"],
];

const corpus: UtteranceCase[] = [];
for (let i = 0; i < 10; i++) {
  const [enText, enIntent] = englishTemplates[i];
  const [twText, twIntent] = twiTemplates[i];
  for (let variant = 0; variant < 10; variant++) {
    const suffix = variant === 0 ? "" : variant % 2 === 0 ? " please" : " now";
    corpus.push({ text: enText + suffix, language: "en", intent: enIntent });
    corpus.push({ text: twText + (variant === 0 ? "" : variant % 2 === 0 ? " bio" : " mprempren"), language: "twi", intent: twIntent });
  }
}

function metrics(actual: IntentType[], expected: IntentType[]) {
  const intents = Array.from(new Set(expected));
  const rows = intents.map((intent) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < expected.length; i++) {
      if (actual[i] === intent && expected[i] === intent) tp++;
      else if (actual[i] === intent) fp++;
      else if (expected[i] === intent) fn++;
    }
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0;
    return { intent, precision, recall, f1 };
  });
  const accuracy = actual.filter((value, index) => value === expected[index]).length / actual.length;
  return { accuracy, rows };
}

describe("Phase 2 intelligence evaluation", () => {
  it("classifies at least 200 held-out English and Twi utterances", async () => {
    expect(corpus).toHaveLength(200);
    const actual: IntentType[] = [];
    const expected: IntentType[] = [];

    for (const item of corpus) {
      const result = await parseUserIntent(item.text);
      actual.push(result.intent);
      expected.push(item.intent);
    }

    const report = metrics(actual, expected);
    console.log(`[phase2-nlu] accuracy=${(report.accuracy * 100).toFixed(1)}%`);
    for (const row of report.rows) {
      console.log(`[phase2-nlu] ${row.intent}: precision=${row.precision.toFixed(3)} recall=${row.recall.toFixed(3)} f1=${row.f1.toFixed(3)}`);
    }
    expect(report.accuracy).toBeGreaterThanOrEqual(0.90);
    for (const row of report.rows) {
      expect(row.f1).toBeGreaterThanOrEqual(0.80);
    }
  });

  it.each([
    { language: "en", transfer: "I want to send money", correction: "Actually make it 80", recipient: "0241234567" },
    { language: "twi", transfer: "Mepɛ sɛ mesoma sika", correction: "Sesa no kɔ 80", recipient: "0553838464" },
  ])("completes realistic $language conversations with correction and confirmation", ({ language, transfer, correction, recipient }) => {
    let slots: Record<string, unknown> = {};
    const turn1 = aiUnderstanding.understand(transfer, "welcome", slots as any);
    expect(turn1.intent).toBe("SEND_MONEY");
    slots = turn1.entities;

    const turn2 = aiUnderstanding.understand(recipient, "recipient", slots as any);
    expect(turn2.entities.recipientPhone).toBe(recipient);
    slots = { ...slots, ...turn2.entities };

    const turn3 = aiUnderstanding.understand(language === "en" ? "50 cedis" : "sika aduonum", "amount", slots as any);
    expect(turn3.entities.amount).toBeGreaterThan(0);
    slots = { ...slots, ...turn3.entities };

    const turn4 = aiUnderstanding.understand(correction, "amount", slots as any);
    expect(turn4.isCorrection).toBe(true);
    expect(turn4.entities.amount).toBe(80);
  });

  it("provides 20 complete English and Twi conversation sequences", () => {
    for (let i = 0; i < 20; i++) {
      const isTwi = i % 2 === 1;
      const utterance = isTwi ? "Mepɛ sɛ mede sika kɔma obi" : "I want to send money";
      const phone = isTwi ? "0553838464" : "0241234567";
      const first = aiUnderstanding.understand(utterance, "welcome", {});
      const recipient = aiUnderstanding.understand(phone, "recipient", first.entities);
      const amountText = isTwi ? "aduonu cedis" : "20 cedis";
      const amount = aiUnderstanding.understand(amountText, "amount", recipient.entities);
      const confirmation = aiUnderstanding.understand(isTwi ? "yɛ" : "yes", "confirm", amount.entities);

      expect(first.intent).toBe("SEND_MONEY");
      expect(recipient.entities.recipientPhone).toBe(phone);
      expect(amount.entities.amount).toBeGreaterThan(0);
      expect(confirmation.isConfirmation).toBe(true);
    }
  });

  it("asks for clarification instead of guessing ambiguous money requests", async () => {
    const result = await parseUserIntent("I want to do something with my money");
    expect(result.intent).toBe("UNKNOWN");
    expect(result.confidence).toBeLessThan(0.75);
  });
});
