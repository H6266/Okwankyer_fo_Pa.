import { describe, expect, it } from "vitest";
import { financialPolicy } from "../src/ai_system/core/financialPolicy";
import { aiAction } from "../src/ai_system/core/aiAction";

describe("financial truth and confirmation invariants", () => {
  it("requires provider financial evidence before declaring a transfer complete", () => {
    expect(financialPolicy.isAuthoritativeCompletion({
      status: "SUCCESSFUL",
      source: "real_provider",
      transactionId: "internal-id-only",
    })).toBe(false);

    expect(financialPolicy.isAuthoritativeCompletion({
      status: "PENDING",
      source: "real_provider",
      financialTransactionId: "provider-tx-1",
    })).toBe(false);

    expect(financialPolicy.isAuthoritativeCompletion({
      status: "SUCCESSFUL",
      source: "real_provider",
      financialTransactionId: "provider-tx-1",
    })).toBe(true);

    expect(financialPolicy.isAuthoritativeCompletion({
      status: "SUCCESSFUL",
      source: "mock_sandbox",
      financialTransactionId: "provider-tx-1",
    })).toBe(false);
  });

  it("does not treat an unbound yes as authorization", () => {
    const result = aiAction.plan("CONFIRM", {}, "confirm", false);
    expect(result.isExecutable).toBe(false);
    expect(result.tool).toBe("none");
  });

  it("asks for an explicit network rather than assuming MTN", () => {
    const result = aiAction.plan("SEND_MONEY", {
      amount: 20,
      recipientPhone: "0551234567",
    });
    expect(result.type).toBe("REQUEST_NETWORK");
    expect(result.isExecutable).toBe(false);
    expect(result.params.network).toBeUndefined();
  });
});
