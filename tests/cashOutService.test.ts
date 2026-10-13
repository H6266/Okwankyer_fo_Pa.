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

  it("transparently reports INSUFFICIENT_BALANCE with fee and shortfall details", () => {
    cashOutService.setWalletBalance(testPhone, 30.0);
    cashOutService.resetPinAttempts(testPhone);

    cashOutService.createAgentWithdrawalRequest(
      testPhone,
      "284910",
      "Kofi Mensah Enterprise (MoMo Agent)",
      30.0
    );

    // Valid PIN, but 30.00 balance < 30.00 + 0.30 fee (30.30)
    const result = cashOutService.approveWithdrawal(testPhone, "1234");
    expect(result.success).toBe(false);
    expect(result.error).toBe("INSUFFICIENT_BALANCE");
    expect(result.balanceDetails).toBeDefined();
    expect(result.balanceDetails?.currentBalance).toBe(30.0);
    expect(result.balanceDetails?.requestedAmount).toBe(30.0);
    expect(result.balanceDetails?.fee).toBe(0.3);
    expect(result.balanceDetails?.totalRequired).toBe(30.3);
    expect(result.balanceDetails?.shortage).toBe(0.3);
    expect(result.balanceDetails?.maxPossibleWithdrawal).toBe(29.5);
  });

  it("strictly enforces 3-attempt PIN limit and locks wallet on 3rd failure", () => {
    cashOutService.setWalletBalance(testPhone, 100.0);
    cashOutService.resetPinAttempts(testPhone);

    cashOutService.createAgentWithdrawalRequest(
      testPhone,
      "284910",
      "Kofi Mensah Enterprise (MoMo Agent)",
      50.0
    );

    // Attempt 1: bad PIN
    const res1 = cashOutService.approveWithdrawal(testPhone, "9999");
    expect(res1.success).toBe(false);
    expect(res1.error).toBe("INVALID_PIN");
    expect(res1.remainingAttempts).toBe(2);
    expect(res1.isLocked).toBe(false);

    // Attempt 2: bad PIN
    const res2 = cashOutService.approveWithdrawal(testPhone, "8888");
    expect(res2.success).toBe(false);
    expect(res2.error).toBe("INVALID_PIN");
    expect(res2.remainingAttempts).toBe(1);
    expect(res2.isLocked).toBe(false);

    // Attempt 3: bad PIN -> WALLET_LOCKED
    const res3 = cashOutService.approveWithdrawal(testPhone, "7777");
    expect(res3.success).toBe(false);
    expect(res3.error).toBe("WALLET_LOCKED");
    expect(res3.remainingAttempts).toBe(0);
    expect(res3.isLocked).toBe(true);

    // Even with correct PIN, locked wallet remains locked
    const res4 = cashOutService.approveWithdrawal(testPhone, "1234");
    expect(res4.success).toBe(false);
    expect(res4.error).toBe("WALLET_LOCKED");
    expect(res4.isLocked).toBe(true);
  });
});
