import { describe, expect, it } from "vitest";

import { buildConfirmationPrompt } from "../src/domain/confirmationPrompt";
import { normalizeGhanaPhone, resolveRecipient, validateAmount } from "../src/domain/recipientResolver";
import { TransactionStateMachine } from "../src/domain/transactionState";

describe("safe confirmation and recipient validation", () => {
  it("reads back the actual entered details and never reuses the fixed 500 GHS demo message", () => {
    const prompt = buildConfirmationPrompt({
      language: "en",
      recipient: { phone: "0241234567", name: "Amina Mensah", verified: true },
      amount: 25,
      reference: "OKP-123456",
      timestamp: new Date("2026-01-15T10:30:00Z"),
    });

    expect(prompt).toContain("25");
    expect(prompt).toContain("Amina");
    expect(prompt).toContain("OKP-123456");
    expect(prompt).not.toContain("500");
    expect(prompt).not.toContain("Kwame");
    expect(prompt).not.toContain("Nyamebere");
  });

  it("requires an explicit unverified recipient warning instead of inventing a verified name", () => {
    const prompt = buildConfirmationPrompt({
      language: "en",
      recipient: { phone: "0550000000", name: "Unknown subscriber", verified: false },
      amount: 10,
      reference: "OKP-000001",
      timestamp: new Date("2026-01-15T10:31:00Z"),
    });

    expect(prompt).toContain("unverified");
    expect(prompt).toContain("confirm again");
  });

  it("rejects malformed Ghanaian numbers and malformed amount strings", () => {
    expect(normalizeGhanaPhone("+233241234567")).toBe("0241234567");
    expect(validateAmount("5*0*1")).toMatchObject({ valid: false });
    const badNumber = resolveRecipient("12345");
    expect(badNumber.valid).toBe(false);
  });

  it("runs through the explicit money-transfer state machine without duplicate execution", () => {
    const machine = new TransactionStateMachine("session-1");
    machine.begin();
    machine.setRecipientVerified();
    machine.setAmountEntered();
    machine.confirm();
    machine.pinPending();
    machine.complete();

    expect(machine.currentState).toBe("COMPLETED");
    expect(machine.isDuplicate("session-1")).toBe(true);
  });
});
