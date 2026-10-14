import { describe, it, expect, beforeEach } from "vitest";
import { telecelEngine } from "../src/integrations/telecel";
import { paymentProviders } from "../src/modules/paymentProvider";
import { recipientResolver } from "../src/providers/recipient/RecipientResolver";
import { SUPPORTED_TRANSFER_NETWORKS } from "../src/domain/serviceCapabilities";

describe("Telecel Cash Ghana Integration & Sandbox", () => {
  beforeEach(() => {
    // Reset configuration
    telecelEngine.reloadConfig();
  });

  it("should have Telecel in supported transfer networks", () => {
    expect(SUPPORTED_TRANSFER_NETWORKS).toContain("Telecel");
  });

  it("provides complete diagnostics and setup checklist", () => {
    const diag = telecelEngine.getDiagnostics();
    expect(diag).toBeDefined();
    expect(diag.gateway).toBe("Telecel Cash (Ghana)");
    expect(diag.activeMode).toBeDefined();
    expect(Array.isArray(diag.setupChecklist)).toBe(true);
    expect(diag.setupChecklist.length).toBeGreaterThanOrEqual(4);
  });

  it("resolves Telecel subscriber KYC via simulated sandbox", async () => {
    const kyc = await telecelEngine.lookupKyc("0201234567");
    expect(kyc.verified).toBe(true);
    expect(kyc.network).toBe("Telecel");
    expect(kyc.name).toBeDefined();
    expect(kyc.msisdn).toBe("233201234567");
  });

  it("rejects non-Telecel numbers in Telecel lookupKyc", async () => {
    const kyc = await telecelEngine.lookupKyc("0241234567"); // MTN prefix
    expect(kyc.verified).toBe(false);
  });

  it("resolves Telecel recipient through RecipientResolver", async () => {
    const res = await recipientResolver.resolve("0201234567");
    expect(res.valid).toBe(true);
    expect(res.network).toBe("Telecel");
    expect(res.verified).toBe(true);
    expect(res.name).toBeDefined();
  });

  it("retrieves float balance in sandbox mode", async () => {
    const bal = await telecelEngine.getBalance();
    expect(bal.success).toBe(true);
    expect(bal.currency).toBe("GHS");
    expect(bal.availableBalance).toBeGreaterThan(0);
    expect(bal.formatted).toContain("GH₵");
  });

  it("executes RequestToPay (Collection) with Telecel sandbox", async () => {
    const tx = await telecelEngine.requestToPay({
      amount: 25.50,
      payerPhone: "0201234567",
      payerName: "Kofi Annan",
      payerMessage: "Payment for goods",
    });

    expect(tx).toBeDefined();
    expect(typeof tx.referenceId).toBe("string");
    expect(tx.referenceId.length).toBeGreaterThan(10);
    expect(tx.amount).toBe(25.50);
    expect(tx.currency).toBe("GHS");
    expect(["SUCCESSFUL", "PENDING"]).toContain(tx.status);
    expect(tx.gatewayEvidence).toBeDefined();
  });

  it("executes Transfer (Disbursement) with Telecel sandbox", async () => {
    const tx = await telecelEngine.transfer({
      amount: 50.00,
      payeePhone: "0509876543",
      payeeName: "Ama Serwaa",
      payerMessage: "Allowance payout",
    });

    expect(tx).toBeDefined();
    expect(typeof tx.referenceId).toBe("string");
    expect(tx.referenceId.length).toBeGreaterThan(10);
    expect(tx.amount).toBe(50.00);
    expect(tx.currency).toBe("GHS");
    expect(["SUCCESSFUL", "PENDING"]).toContain(tx.status);
    expect(tx.gatewayEvidence).toBeDefined();
  });

  it("queries transaction status from transaction history", async () => {
    const initiated = await telecelEngine.requestToPay({
      amount: 15.00,
      payerPhone: "0201234567",
    });

    const queried = await telecelEngine.getTransactionStatus(initiated.referenceId);
    expect(queried).toBeDefined();
    expect(queried?.referenceId).toBe(initiated.referenceId);
    expect(queried?.amount).toBe(15.00);
  });

  it("handles webhook callbacks accurately", () => {
    const ref = `TEL-COL-${Date.now()}`;
    const result = telecelEngine.handleWebhookCallback({
      referenceId: ref,
      status: "SUCCESSFUL",
      financialTransactionId: "FTX-WEBHOOK-999",
      amount: 100,
      currency: "GHS",
    });

    expect(result.success).toBe(true);
    expect(result.transaction?.status).toBe("SUCCESSFUL");
    expect(result.transaction?.financialTransactionId).toBe("FTX-WEBHOOK-999");
  });

  it("supports dynamic runtime API keys update", () => {
    process.env.TELECEL_API_KEY = "test_runtime_api_key_12345";
    process.env.TELECEL_CLIENT_ID = "test_client_id";
    process.env.TELECEL_MERCHANT_ID = "MCH-TEL-9988";
    telecelEngine.reloadConfig();

    const diag = telecelEngine.getDiagnostics();
    expect(diag.credentials.configured).toBe(true);
    expect(diag.credentials.maskedKey).toContain("••••");
    expect(diag.credentials.maskedMerchantId).toContain("••••");

    // Clean up
    delete process.env.TELECEL_API_KEY;
    delete process.env.TELECEL_CLIENT_ID;
    delete process.env.TELECEL_MERCHANT_ID;
    telecelEngine.reloadConfig();
  });

  it("routes Telecel payment requests through PaymentProvider", async () => {
    const provider = paymentProviders["Telecel"];
    expect(provider).toBeDefined();
    expect(provider.id).toBe("Telecel");
    expect(provider.isImplemented).toBe(true);

    const result = await provider.transfer({
      amount: 30,
      currency: "GHS",
      recipientPhone: "0201234567",
      payerMessage: "Kofi Test",
      payeeNote: "Test Payout",
    });

    expect(result.referenceId).toBeDefined();
    expect(["SUCCESSFUL", "PENDING"]).toContain(result.status);
  });
});
