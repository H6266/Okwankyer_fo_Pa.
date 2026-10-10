import { describe, it, expect } from "vitest";
import { planNext, MAX_TRANSACTION_AMOUNT } from "../src/domain/flowPlanner";

describe("flowPlanner.planNext", () => {
  it("case 1: only intent -> collect_slot (missing recipient and amount)", () => {
    const res = planNext({
      session: {},
      understood: {
        intent: "send_money",
      },
    });

    expect(res.process).toBe("collect_slot");
    expect(res.missingSlots).toEqual(["recipient", "amount"]);
    expect(res.targetSlot).toBe("recipient");
    expect(res.reason).toMatch(/recipient and amount required/i);
  });

  it("case 2: intent + number -> collect_slot (missing amount)", () => {
    const res = planNext({
      session: {
        intent: "send_money",
      },
      understood: {
        slots: {
          recipientPhone: "0553838464",
        },
      },
    });

    expect(res.process).toBe("collect_slot");
    expect(res.missingSlots).toEqual(["amount"]);
    expect(res.targetSlot).toBe("amount");
    expect(res.reason).toMatch(/amount required/i);
  });

  it("case 3: intent + number + amount -> verify_recipient (both known, unverified)", () => {
    const res = planNext({
      session: {},
      understood: {
        intent: "send_money",
        slots: {
          recipientPhone: "0553838464",
          amount: 500,
        },
      },
    });

    expect(res.process).toBe("verify_recipient");
    expect(res.missingSlots).toEqual([]);
    expect(res.reason).toBe("recipient and amount known");
  });

  it("case 4a: amount invalid (<= 0) -> collect_slot for amount", () => {
    const res = planNext({
      session: {
        intent: "send_money",
        recipientPhone: "0553838464",
      },
      understood: {
        slots: {
          amount: 0,
        },
      },
    });

    expect(res.process).toBe("collect_slot");
    expect(res.missingSlots).toEqual(["amount"]);
    expect(res.targetSlot).toBe("amount");
    expect(res.reason).toContain("amount invalid");
  });

  it("case 4b: amount invalid (> MAX_TRANSACTION_AMOUNT) -> collect_slot for amount", () => {
    const res = planNext({
      session: {
        intent: "send_money",
        recipientPhone: "0553838464",
      },
      understood: {
        slots: {
          amount: MAX_TRANSACTION_AMOUNT + 1000,
        },
      },
    });

    expect(res.process).toBe("collect_slot");
    expect(res.missingSlots).toEqual(["amount"]);
    expect(res.targetSlot).toBe("amount");
    expect(res.reason).toContain("exceeds maximum limit");
  });

  it("case 5: recipient lookup failed -> collect_slot with recipient target", () => {
    const res = planNext({
      session: {
        intent: "send_money",
        recipientPhone: "0553838464",
        amount: 500,
        recipientLookupFailed: true,
      },
      understood: {},
    });

    expect(res.process).toBe("collect_slot");
    expect(res.missingSlots).toEqual(["recipient"]);
    expect(res.targetSlot).toBe("recipient");
    expect(res.reason).toBe("recipient lookup failed");
  });

  it("case 6: caller says no at confirmation -> cancel", () => {
    const res = planNext({
      session: {
        intent: "send_money",
        recipientPhone: "0553838464",
        amount: 500,
        recipientVerified: true,
        pendingConfirmation: true,
      },
      understood: {
        declined: true,
      },
    });

    expect(res.process).toBe("cancel");
    expect(res.reason).toBe("caller declined confirmation");
  });

  it("case 7: caller changes amount mid-flow -> confirm_transaction with updated amount", () => {
    const res = planNext({
      session: {
        intent: "send_money",
        recipientPhone: "0553838464",
        recipientName: "Kwame Mensah",
        recipientVerified: true,
        amount: 500,
      },
      understood: {
        slots: {
          amount: 250,
        },
      },
    });

    expect(res.process).toBe("confirm_transaction");
    expect(res.reason).toContain("amount updated");
    expect(res.updatedSlots?.amount).toBe(250);
  });

  it("case 8: caller says 'go back' -> go_back", () => {
    const res = planNext({
      session: {
        intent: "send_money",
        recipientPhone: "0553838464",
      },
      understood: {
        navigation: "back",
      },
    });

    expect(res.process).toBe("go_back");
    expect(res.reason).toBe("caller requested navigation back");
  });

  it("case 9: caller explicitly confirms -> initiate_payment", () => {
    const res = planNext({
      session: {
        intent: "send_money",
        recipientPhone: "0553838464",
        recipientName: "Kwame Mensah",
        recipientVerified: true,
        amount: 500,
        pendingConfirmation: true,
      },
      understood: {
        confirmed: true,
      },
    });

    expect(res.process).toBe("initiate_payment");
    expect(res.reason).toBe("caller confirmed transaction");
    expect(res.updatedSlots?.confirmed).toBe(true);
  });
});
