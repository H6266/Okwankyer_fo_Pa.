import { describe, it, expect, beforeEach } from "vitest";
import { cashOutService } from "../src/services/cashOutService";

describe("MoMo Cash-Out & Voice Withdrawal Service", () => {
  const testPhone = "0543546010";

  beforeEach(() => {
    cashOutService.setWalletBalance(testPhone, 30.0);
  });

  it("enables cash out with a 15-minute authorization window", () => {
    const state = cashOutService.enableCashOut(testPhone, 15);
    expect(state.enabled).toBe(true);
    expect(state.callerPhone).toBe(testPhone);
    expect(cashOutService.isCashOutEnabled(testPhone)).toBe(true);
    expect(cashOutService.getRemainingMinutes(testPhone)).toBe(15);
  });

  it("calculates accurate telco cash-out fees (1% schedule)", () => {
    // 30 GHS -> 0.30 GHS (30 pesewas)
    expect(cashOutService.calculateCashOutFee(30)).toBe(0.3);
    // 50 GHS -> 0.50 GHS (50 pesewas)
    expect(cashOutService.calculateCashOutFee(50)).toBe(0.5);
    // 100 GHS -> 1.00 GHS
    expect(cashOutService.calculateCashOutFee(100)).toBe(1.0);
    // 1500 GHS -> capped at 10.00 GHS
    expect(cashOutService.calculateCashOutFee(1500)).toBe(10.0);
  });

  it("handles the GH₵30 wallet vs GH₵30 withdrawal scenario correctly", () => {
    cashOutService.setWalletBalance(testPhone, 30.0);
    const result = cashOutService.checkAffordability(testPhone, 30.0);

    expect(result.balance).toBe(30.0);
    expect(result.requestedAmount).toBe(30.0);
    expect(result.fee).toBe(0.3);
    expect(result.totalRequired).toBe(30.3);
    expect(result.isSufficient).toBe(false);
    expect(result.shortage).toBe(0.3);
    // Maximum allowable cash: user can take out 29.50 GHS
    expect(result.maxPossibleWithdrawal).toBe(29.5);
  });

  it("handles sufficient wallet balance scenarios", () => {
    cashOutService.setWalletBalance(testPhone, 250.0);
    const result = cashOutService.checkAffordability(testPhone, 50.0);

    expect(result.balance).toBe(250.0);
    expect(result.requestedAmount).toBe(50.0);
    expect(result.fee).toBe(0.5);
    expect(result.totalRequired).toBe(50.5);
    expect(result.isSufficient).toBe(true);
    expect(result.shortage).toBe(0);
  });

  it("manages agent-initiated withdrawal request and approval", () => {
    cashOutService.setWalletBalance(testPhone, 80.0);

    const req = cashOutService.createAgentWithdrawalRequest(
      testPhone,
      "284910",
      "Kofi Mensah Enterprise (MoMo Agent)",
      50.0
    );

    expect(req.status).toBe("PENDING");
    expect(req.amount).toBe(50.0);
    expect(req.fee).toBe(0.5);

    const pending = cashOutService.getPendingWithdrawalRequest(testPhone);
    expect(pending?.id).toBe(req.id);

    // Invalid PIN rejection
    const badRes = cashOutService.approveWithdrawal(testPhone, "9999");
    expect(badRes.success).toBe(false);
    expect(badRes.error).toBe("INVALID_PIN");

    // Valid sandbox PIN approval
    const okRes = cashOutService.approveWithdrawal(testPhone, "1234");
    expect(okRes.success).toBe(true);
    expect(okRes.referenceId).toMatch(/^CW-/);
    expect(okRes.request?.status).toBe("APPROVED");

    // Balance deducted: 80 - (50 + 0.50) = 29.50
    expect(cashOutService.getWalletBalance(testPhone)).toBe(29.5);
  });
});
