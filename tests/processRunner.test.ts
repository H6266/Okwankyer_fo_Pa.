import { describe, it, expect, vi } from "vitest";
import { runProcess } from "../src/domain/processRunner";
import { RecipientResolver } from "../src/providers/recipient/RecipientResolver";

describe("processRunner.runProcess", () => {
  it("collects missing recipient slot", async () => {
    const res = await runProcess({
      process: "collect_slot",
      session: {},
      targetSlot: "recipient",
      language: "en",
    });

    expect(res.replyKey).toBe("enter_recipient");
    expect(res.replyText).toContain("10-digit number");
    expect(res.data.targetSlot).toBe("recipient");
  });

  it("collects missing amount slot in Twi", async () => {
    const res = await runProcess({
      process: "collect_slot",
      session: { recipientPhone: "0553838464" },
      targetSlot: "amount",
      language: "twi",
    });

    expect(res.replyKey).toBe("enter_amount");
    expect(res.replyText).toContain("sika dodoɔ");
  });

  it("verify_recipient: uses registered name from mocked lookup and formats confirm reply", async () => {
    const mockResolver: RecipientResolver = {
      id: "MOCK",
      resolve: vi.fn().mockResolvedValue({
        valid: true,
        phoneNumber: "0553838464",
        normalizedPhone: "0553838464",
        name: "Abena Mansa",
        network: "MTN",
        verified: true,
        source: "SANDBOX_FIXTURE",
      }),
    };

    const res = await runProcess({
      process: "verify_recipient",
      session: {
        recipientPhone: "0553838464",
        amount: 250,
      },
      language: "en",
      recipientResolver: mockResolver,
    });

    expect(mockResolver.resolve).toHaveBeenCalledWith("0553838464");
    expect(res.replyKey).toBe("confirm_transaction");
    expect(res.replyText).toBe("You are about to send 250 cedis to Abena Mansa. Are you sure you want to send this money?");
    expect(res.sessionUpdates?.recipientName).toBe("Abena Mansa");
    expect(res.sessionUpdates?.recipientVerified).toBe(true);
  });

  it("verify_recipient: lookup failure never invents a name and asks again", async () => {
    const mockResolver: RecipientResolver = {
      id: "MOCK",
      resolve: vi.fn().mockResolvedValue({
        valid: false,
        phoneNumber: "0000000000",
        normalizedPhone: "",
        name: null,
        network: "MTN",
        verified: false,
        source: "UNRESOLVED",
        error: "Unregistered subscriber",
      }),
    };

    const res = await runProcess({
      process: "verify_recipient",
      session: {
        recipientPhone: "0000000000",
        amount: 100,
      },
      language: "en",
      recipientResolver: mockResolver,
    });

    expect(res.replyKey).toBe("recipient_lookup_failed");
    expect(res.replyText).toContain("could not verify that recipient number");
    expect(res.sessionUpdates?.recipientName).toBeNull();
    expect(res.sessionUpdates?.recipientVerified).toBe(false);
    expect(res.sessionUpdates?.recipientLookupFailed).toBe(true);
  });

  it("verify_recipient: triggers onHold callback if lookup takes longer than threshold", async () => {
    const onHold = vi.fn();
    const mockResolver: RecipientResolver = {
      id: "MOCK_SLOW",
      resolve: vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 100)); // slow lookup
        return {
          valid: true,
          phoneNumber: "0244123456",
          normalizedPhone: "0244123456",
          name: "Kofi Annan",
          network: "MTN",
          verified: true,
          source: "SANDBOX_FIXTURE",
        };
      }),
    };

    const res = await runProcess({
      process: "verify_recipient",
      session: {
        recipientPhone: "0244123456",
        amount: 50,
      },
      language: "en",
      recipientResolver: mockResolver,
      onHold,
      holdThresholdMs: 30, // trigger fast for unit test
    });

    expect(onHold).toHaveBeenCalledWith({
      replyKey: "verify_hold",
      replyText: "Please hold on while we verify the recipient number.",
    });
    expect(res.replyKey).toBe("confirm_transaction");
    expect(res.sessionUpdates?.recipientName).toBe("Kofi Annan");
  });

  it("initiate_payment: provides zero-PIN prompt handoff", async () => {
    const res = await runProcess({
      process: "initiate_payment",
      session: {
        recipientPhone: "0553838464",
        recipientName: "Kofi Mensah",
        amount: 100,
      },
      language: "en",
    });

    expect(res.replyKey).toBe("pin_handoff");
    expect(res.replyText).toContain("Do not share your PIN with anyone");
    expect(res.data.status).toBe("initiated");
  });

  it("cancel: returns clean cancellation message", async () => {
    const res = await runProcess({
      process: "cancel",
      session: {},
      language: "en",
    });

    expect(res.replyKey).toBe("call_cancelled");
    expect(res.replyText).toContain("Transaction cancelled");
    expect(res.data.cancelled).toBe(true);
  });
});
