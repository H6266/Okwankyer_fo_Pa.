/**
 * Ɔkwankyerɛfo Pa - Production Test Suite
 * 
 * Tests:
 * 1. Dynamic Safe Confirmation mismatch verification (Task 1)
 * 2. Real Recipient Resolution & Phone Normalization (Task 2)
 * 3. Strict Amount Validation rejecting "5*0*1" (Task 2)
 * 4. Zero-PIN State Machine & Idempotency Key Replay (Task 3)
 * 5. PIN Pattern Detection & Zero-Leakage (Task 3)
 * 6. Path Traversal Security Protection (Task 5)
 * 7. AI Evaluation Benchmark Harness (Task 4)
 */

import { describe, it, expect } from "vitest";
import {
  validateGhanaPhoneNumber,
  normalizeGhanaPhoneNumber,
  parseAndValidateAmount,
  containsPinPattern,
  redactPii,
} from "../src/domain/validation";
import { SandboxRecipientResolver } from "../src/providers/recipient/RecipientResolver";
import {
  buildSafeConfirmationPrompt,
  buildReceiptPrompt,
  generateTransactionReference,
} from "../src/audio/dynamicPromptBuilder";
import { TransactionStateMachine } from "../src/domain/stateMachine";
import { resolveSafeAudioPath, PathTraversalError } from "../src/audio/streaming";
import { runEvaluationHarness } from "../src/ai_eval/evalHarness";

describe("Task 1: Safe Confirmation Must Read Back What Caller Entered", () => {
  it("proves entering 25 GHS to an unverified number NEVER plays 500 GHS or Kwame Nyamebere", () => {
    const prompt = buildSafeConfirmationPrompt({
      language: "en",
      amount: 25,
      recipientPhone: "0249991234",
      recipientName: null,
      isVerified: false,
      callbackUrl: "/safe-outcome",
    });

    // Must contain exact caller entered amount
    expect(prompt.spokenText).toContain("25 Cedis");
    // Must contain exact last 4 digits
    expect(prompt.spokenText).toContain("1 2 3 4");
    // Must contain explicit unverified warning
    expect(prompt.spokenText).toContain("could not be verified");
    expect(prompt.spokenText).toContain("unverified recipient");

    // ABSOLUTE MISMATCH ASSERTIONS: Must NEVER contain static demo data
    expect(prompt.spokenText).not.toContain("500");
    expect(prompt.spokenText).not.toContain("Kwame Nyamebere");
    expect(prompt.voiceXml).not.toContain("Audio_prompt_10.mp3");
    expect(prompt.voiceXml).not.toContain("Audio_prompt_twi_08.mp3");
  });

  it("builds verified recipient safe confirmation in English", () => {
    const prompt = buildSafeConfirmationPrompt({
      language: "en",
      amount: 150,
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      isVerified: true,
      callbackUrl: "/safe-outcome",
    });

    expect(prompt.spokenText).toContain("150 Cedis");
    expect(prompt.spokenText).toContain("Kwame Boateng");
    expect(prompt.spokenText).toContain("8 4 6 4");
    expect(prompt.spokenText).not.toContain("warning");
  });

  it("builds verified recipient safe confirmation in Akan Twi", () => {
    const prompt = buildSafeConfirmationPrompt({
      language: "twi",
      amount: 75,
      recipientPhone: "0241234567",
      recipientName: "Ama Serwaa",
      isVerified: true,
      callbackUrl: "/safe-outcome",
    });

    expect(prompt.spokenText).toContain("75 Cedis");
    expect(prompt.spokenText).toContain("Ama Serwaa");
    expect(prompt.spokenText).toContain("4 5 6 7");
    expect(prompt.spokenText).toContain("Worepɛ sɛ womane");
    expect(prompt.spokenText).toContain("mia baako (1)");
  });

  it("generates unique transaction references and real timestamps in dynamic receipts", () => {
    const ref1 = generateTransactionReference();
    const ref2 = generateTransactionReference();
    expect(ref1).not.toBe(ref2);
    expect(ref1).toMatch(/^OKP-\d{6}$/);

    const now = new Date();
    const receipt = buildReceiptPrompt({
      language: "en",
      amount: 42,
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      referenceId: ref1,
      timestamp: now,
    });

    expect(receipt.spokenText).toContain("42 Cedis");
    expect(receipt.spokenText).toContain("Kwame Boateng");
    expect(receipt.spokenText).toContain(ref1.split("").join(" "));
    expect(receipt.spokenText).not.toContain("17 September 2026"); // Never hardcoded past date
  });
});

describe("Task 2: Real Recipient Resolution & Input Validation", () => {
  const resolver = new SandboxRecipientResolver();

  it("normalizes international +233 and 233 formats", () => {
    expect(normalizeGhanaPhoneNumber("+233553838464")).toBe("0553838464");
    expect(normalizeGhanaPhoneNumber("233553838464")).toBe("0553838464");
    expect(normalizeGhanaPhoneNumber("055 383 8464")).toBe("0553838464");
    expect(normalizeGhanaPhoneNumber("553838464")).toBe("0553838464");
  });

  it("validates recognized Ghanaian telco prefixes", () => {
    expect(validateGhanaPhoneNumber("0553838464").network).toBe("MTN");
    expect(validateGhanaPhoneNumber("0201234567").network).toBe("Telecel");
    expect(validateGhanaPhoneNumber("0271234567").network).toBe("AT");
  });

  it("rejects invalid phone numbers", () => {
    // Invalid length
    expect(validateGhanaPhoneNumber("055123").valid).toBe(false);
    // Invalid prefix (e.g. 023 is not a Ghanaian mobile prefix)
    expect(validateGhanaPhoneNumber("0231234567").valid).toBe(false);
  });

  it("resolves registered sandbox subscribers without hardcoding endsWith('8464')", async () => {
    const res = await resolver.resolve("0553838464");
    expect(res.valid).toBe(true);
    expect(res.verified).toBe(true);
    expect(res.name).toBe("Kwame Boateng");
    expect(res.source).toBe("SANDBOX_FIXTURE");
  });

  it("flags unknown numbers as unverified without making up a subscriber name", async () => {
    // A number that ends with 8464 but is NOT in fixtures should NOT be Kwame Nyamebere!
    const res = await resolver.resolve("0209998464");
    expect(res.valid).toBe(true);
    expect(res.verified).toBe(false);
    expect(res.name).toBeNull();
    expect(res.source).toBe("UNRESOLVED");
    expect(res.warning).toContain("could not be verified");
  });

  it("strictly validates amounts and rejects malformed formats like '5*0*1'", () => {
    // Valid standard
    expect(parseAndValidateAmount("50").valid).toBe(true);
    expect(parseAndValidateAmount("50").amount).toBe(50);

    // Valid pesewas with star key
    const pesewas = parseAndValidateAmount("50*50");
    expect(pesewas.valid).toBe(true);
    expect(pesewas.amount).toBe(50.5);
    expect(pesewas.formatted).toBe("50 Cedis 50 Pesewas");

    // REJECT MALFORMED: Multiple asterisks e.g. "5*0*1"
    const malformedMultiStar = parseAndValidateAmount("5*0*1");
    expect(malformedMultiStar.valid).toBe(false);
    expect(malformedMultiStar.error).toContain("multiple decimal asterisks");

    // REJECT leading or trailing star
    expect(parseAndValidateAmount("*50").valid).toBe(false);
    expect(parseAndValidateAmount("50*").valid).toBe(false);

    // REJECT zero and negative
    expect(parseAndValidateAmount("0").valid).toBe(false);
    expect(parseAndValidateAmount("-20").valid).toBe(false);

    // REJECT over limit (> 5000)
    expect(parseAndValidateAmount("5001").valid).toBe(false);
  });
});

describe("Task 3: Zero-PIN Handset Handoff & State Machine", () => {
  it("transitions sequentially through formal state machine", () => {
    const sm = new TransactionStateMachine();
    const session = sm.getOrCreateSession("test-sess-1", "en");

    expect(session.state).toBe("INITIATED");

    sm.transition("test-sess-1", "RECIPIENT_VERIFIED", {
      recipientPhone: "0553838464",
      recipientName: "Kwame Boateng",
      isRecipientVerified: true,
    });
    expect(session.state).toBe("RECIPIENT_VERIFIED");

    sm.transition("test-sess-1", "AMOUNT_ENTERED", { amount: 100 });
    expect(session.state).toBe("AMOUNT_ENTERED");

    sm.transition("test-sess-1", "CONFIRMED");
    expect(session.state).toBe("CONFIRMED");

    sm.transition("test-sess-1", "PIN_PENDING", { momoReferenceId: "momo-uuid-123" });
    expect(session.state).toBe("PIN_PENDING");

    sm.transition("test-sess-1", "COMPLETED");
    expect(session.state).toBe("COMPLETED");
    expect(session.completedAt).toBeDefined();
  });

  it("prevents illegal out-of-order transitions", () => {
    const sm = new TransactionStateMachine();
    sm.getOrCreateSession("test-sess-2", "en");

    // Cannot jump from INITIATED directly to COMPLETED or CONFIRMED
    expect(() => sm.transition("test-sess-2", "COMPLETED")).toThrow(/Invalid state transition/);
  });

  it("enforces idempotency on repeated state transition", () => {
    const sm = new TransactionStateMachine();
    sm.getOrCreateSession("test-sess-3", "en");
    sm.transition("test-sess-3", "RECIPIENT_VERIFIED");
    sm.transition("test-sess-3", "AMOUNT_ENTERED");
    sm.transition("test-sess-3", "CONFIRMED");
    sm.transition("test-sess-3", "PIN_PENDING");
    sm.transition("test-sess-3", "COMPLETED");

    // Repeated webhook callback to COMPLETED should be a safe idempotent no-op
    const repeated = sm.transition("test-sess-3", "COMPLETED");
    expect(repeated.state).toBe("COMPLETED");
  });

  it("detects secret PIN patterns and guarantees no PIN leakage in logs", () => {
    expect(containsPinPattern("pin=1234")).toBe(true);
    expect(containsPinPattern('{"pin": "4567"}')).toBe(true);
    expect(containsPinPattern("enter your pin now")).toBe(true);

    // Legitimate prompt text should NOT match PIN pattern
    expect(containsPinPattern("check your phone screen for the prompt")).toBe(false);

    // Redaction scrubber removes PINs and masks phones
    const dirtyLog = "User with phone 0553838464 provided pin=9876 for amount 50";
    const cleanLog = redactPii(dirtyLog);
    expect(cleanLog).not.toContain("9876");
    expect(cleanLog).toContain("[REDACTED_PIN]");
    expect(cleanLog).toContain("055****464");
  });
});

describe("Task 5: Security Hardening & Path Traversal Protection", () => {
  it("prevents directory traversal using path.resolve validation", () => {
    expect(() => resolveSafeAudioPath("../../../etc/passwd")).toThrow(PathTraversalError);
    expect(() => resolveSafeAudioPath("..\\..\\windows\\system32")).toThrow(PathTraversalError);
    expect(() => resolveSafeAudioPath("audio/../../package.json")).toThrow(PathTraversalError);
  });

  it("correctly resolves legitimate audio files within audio root", () => {
    const resolved = resolveSafeAudioPath("Welcome_prompt_01.mp3");
    expect(resolved).not.toBeNull();
    expect(resolved).toContain("Welcome_prompt_01.mp3");
  });
});

describe("Task 4: AI Evaluation Harness", () => {
  it("runs labeled benchmark on English and Twi utterances with accuracy >= 80%", async () => {
    const report = await runEvaluationHarness();
    expect(report.totalUtterances).toBeGreaterThanOrEqual(30);
    expect(report.accuracyPercent).toBeGreaterThanOrEqual(80);
    expect(report.totalOutOfScope).toBeGreaterThanOrEqual(4);
    expect(report.fallbackTriggeredCount).toBeGreaterThanOrEqual(3);
  });
});
