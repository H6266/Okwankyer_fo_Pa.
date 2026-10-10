/**
 * Tests for resolveExpected and resolveTurn (tests/resolveExpected.test.ts)
 * 
 * Verifies:
 * - Table-driven tests for resolveExpected (clean words, ASR confusions, number words, phone numbers, noise, empty)
 * - resolveTurn retry cap and fallback offering
 */

import { describe, it, expect } from "vitest";
import { resolveExpected } from "../src/domain/resolveExpected";
import { resolveTurn } from "../src/domain/resolveTurn";
import { getStepDefinition } from "../src/domain/stepRegistry";

describe("Expected-Answer Grammar (resolveExpected)", () => {
  const serviceStep = getStepDefinition("service-select")!;
  const actionStep = getStepDefinition("action-select")!;
  const providerStep = getStepDefinition("provider-select")!;
  const recipientStep = getStepDefinition("enter-recipient")!;
  const amountStep = getStepDefinition("enter-amount")!;

  const testCases = [
    // 1. Clean words
    { name: "clean option 1", step: serviceStep, input: "one", expected: { matched: true, value: "1" } },
    { name: "clean option 2", step: serviceStep, input: "two", expected: { matched: true, value: "2" } },
    { name: "clean phrase send money", step: actionStep, input: "send money", expected: { matched: true, value: "1" } },
    { name: "clean phrase check balance", step: actionStep, input: "check balance", expected: { matched: true, value: "2" } },

    // 2. ASR confusions
    { name: "ASR confusion 'won' for 1", step: serviceStep, input: "won", expected: { matched: true, value: "1" } },
    { name: "ASR confusion 'to' for 2", step: serviceStep, input: "to", expected: { matched: true, value: "2" } },
    { name: "ASR confusion 'too' for 2", step: serviceStep, input: "too", expected: { matched: true, value: "2" } },
    { name: "ASR confusion 'tree' for 3", step: providerStep, input: "tree", expected: { matched: true, value: "3" } },
    { name: "ASR confusion 'ate' for 8", step: actionStep, input: "ate", expected: { matched: true, value: "8" } },

    // 3. Spoken number words / Twi number words
    { name: "Twi 'baako' for 1", step: serviceStep, input: "baako", expected: { matched: true, value: "1" } },
    { name: "Twi 'mmienu' for 2", step: serviceStep, input: "mmienu", expected: { matched: true, value: "2" } },
    { name: "Twi 'mmiensa' for 3", step: providerStep, input: "mmiensa", expected: { matched: true, value: "3" } },

    // 4. Phone numbers (digit-by-digit spoken words)
    {
      name: "Spoken Ghana phone number digit-by-digit",
      step: recipientStep,
      input: "zero five five three eight three eight four six four",
      expected: { matched: true, value: "0553838464" },
    },
    {
      name: "Raw digits Ghana phone number",
      step: recipientStep,
      input: "0553838464",
      expected: { matched: true, value: "0553838464" },
    },

    // 5. Amount (spoken numbers)
    {
      name: "Spoken amount 'fifty cedis'",
      step: amountStep,
      input: "fifty cedis",
      expected: { matched: true, value: "50" },
    },
    {
      name: "Spoken amount 'twenty cedis'",
      step: amountStep,
      input: "twenty cedis",
      expected: { matched: true, value: "20" },
    },

    // 6. Navigation keywords
    { name: "Navigation 'go back'", step: actionStep, input: "back", expected: { matched: true, value: "8" } },
    { name: "Navigation 'repeat'", step: actionStep, input: "repeat", expected: { matched: true, value: "9" } },
    { name: "Navigation 'cancel'", step: actionStep, input: "cancel", expected: { matched: true, value: "0" } },

    // 7. Noise / off-script
    { name: "Random off-script question", step: serviceStep, input: "what is the weather today", expected: { matched: false } },
    { name: "Noise gibberish", step: serviceStep, input: "kjasbdfkjh", expected: { matched: false } },
    { name: "Empty string", step: serviceStep, input: "", expected: { matched: false } },
    { name: "Whitespace only", step: serviceStep, input: "   ", expected: { matched: false } },
  ];

  for (const tc of testCases) {
    it(`resolves: ${tc.name}`, () => {
      const res = resolveExpected(tc.step, tc.input, "en");
      expect(res.matched).toBe(tc.expected.matched);
      if (tc.expected.matched && res.matched) {
        expect(res.value).toBe(tc.expected.value);
        expect(res.confidence).toBeGreaterThan(0.7);
      }
    });
  }
});

describe("Turn Resolution and Retry Cap (resolveTurn)", () => {
  const serviceStep = getStepDefinition("service-select")!;

  it("advances directly on valid DTMF", () => {
    const session: any = { sessionId: "s1" };
    const res = resolveTurn({
      step: serviceStep,
      input: "1",
      source: "DTMF",
      language: "en",
      session,
    });
    expect(res.matched).toBe(true);
    expect(res.action).toBe("advance");
    expect(res.targetStep).toBe("provider-select");
    expect(session.service).toBe("telecom");
  });

  it("maps matched VOICE input to the equivalent DTMF action", () => {
    const session: any = { sessionId: "s2" };
    const res = resolveTurn({
      step: serviceStep,
      input: "mobile money",
      source: "VOICE",
      language: "en",
      session,
    });
    expect(res.matched).toBe(true);
    expect(res.action).toBe("advance");
    expect(res.targetStep).toBe("provider-select");
    expect(session.service).toBe("telecom");
  });

  it("increments retries and after maxRetries offers keypad fallback, then terminates", () => {
    const session: any = { sessionId: "s3" };

    // Turn 1 invalid: retryCount becomes 1
    const res1 = resolveTurn({
      step: serviceStep,
      input: "99",
      source: "DTMF",
      language: "en",
      session,
    });
    expect(res1.matched).toBe(false);
    expect(res1.retryCount).toBe(1);

    // Turn 2 invalid: retryCount becomes 2 (reaches maxRetries = 2)
    const res2 = resolveTurn({
      step: serviceStep,
      input: "what time is it",
      source: "VOICE",
      language: "en",
      session,
    });
    expect(res2.matched).toBe(false);
    expect(res2.retryCount).toBe(2);

    // Turn 3: retryCount becomes 3 (exceeds maxRetries = 2) -> offers keypad fallback once
    const res3 = resolveTurn({
      step: serviceStep,
      input: "still confused",
      source: "VOICE",
      language: "en",
      session,
    });
    expect(res3.matched).toBe(false);
    expect(res3.retryCount).toBe(3);
    expect(res3.offeredKeypadFallback).toBe(true);
    expect(res3.replyText).toContain("keypad");

    // Turn 4: retryCount becomes 4 -> terminates with hangup
    const res4 = resolveTurn({
      step: serviceStep,
      input: "still failing",
      source: "VOICE",
      language: "en",
      session,
    });
    expect(res4.matched).toBe(false);
    expect(res4.action).toBe("hangup");
    expect(res4.replyText).toContain("Maximum attempts");
  });
});
