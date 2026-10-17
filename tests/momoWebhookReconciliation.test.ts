import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { momoRouter } from "../src/routes/momoRoutes";
import { paymentSaga } from "../src/integrations/momo/paymentSaga";
import { momoProvider } from "../src/integrations/momo";
import { durableTransactionStore } from "../src/services/durableTransactionStore";
import { durableIdempotencyLedger } from "../src/services/durableIdempotencyLedger";
import { momoCallbackService } from "../src/integrations/momo/momoCallbackService";
import { config } from "../src/config/env";

const app = express();
app.use(express.json());
app.use(momoRouter);

function createPendingDisbursement() {
  const saga = paymentSaga.createDraft({
    sessionId: "callback-session-001",
    senderPhone: "0541234567",
    recipientPhone: "0559988776",
    amount: 50,
    network: "MTN",
    clientNonce: "callback-nonce-001",
  });
  paymentSaga.verifyRecipient(saga.sagaId, "Ama Serwaa");
  paymentSaga.verifyAmount(saga.sagaId);
  paymentSaga.requestConfirmation(saga.sagaId);
  paymentSaga.confirm(saga.sagaId);
  paymentSaga.markRequestToPaySent(saga.sagaId, "collection-ref-001");
  paymentSaga.recordCollectionResult(saga.sagaId, {
    status: "SUCCESSFUL",
    provider: "MTN",
    referenceId: "collection-ref-001",
  });
  paymentSaga.initiateDisbursement(saga.sagaId, "disbursement-ref-001");
  return saga;
}

describe("MoMo webhook provider reconciliation", () => {
  beforeEach(() => {
    durableTransactionStore.clearAllForTesting();
    durableIdempotencyLedger.clearAllForTesting();
    momoCallbackService.clearFeedHistory();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unknown provider references without processing callback payloads", async () => {
    const statusLookup = vi.spyOn(momoProvider.status, "getTransferStatus");

    const response = await request(app)
      .post("/api/momo/callback")
      .send({
        referenceId: "attacker-chosen-reference",
        status: "SUCCESSFUL",
        financialTransactionId: "attacker-invented-transaction",
      });

    expect(response.status).toBe(404);
    expect(statusLookup).not.toHaveBeenCalled();
    expect(momoCallbackService.getRecentFeedItems()).toHaveLength(0);
  });

  it("rejects unauthenticated central transaction submission and keeps the endpoint retired", async () => {
    const originalAdminToken = config.adminToken;
    config.adminToken = "central-submit-retired-test-token";
    const submit = vi.spyOn(momoProvider, "submitTransaction");

    try {
      const payload = {
        transactionId: "client-controlled-transaction",
        mode: "DISBURSEMENT_TRANSFER",
        payerPhone: "0244123456",
      };
      const unauthorized = await request(app)
        .post("/api/momo/transaction/submit")
        .send(payload);

      expect(unauthorized.status).toBe(401);
      expect(submit).not.toHaveBeenCalled();

      const retired = await request(app)
        .post("/api/momo/transaction/submit")
        .set("Authorization", `Bearer ${config.adminToken}`)
        .send(payload);

      expect(retired.status).toBe(410);
      expect(retired.body.error).toBe("CENTRAL_TRANSACTION_SUBMISSION_DISABLED");
      expect(retired.body.traceId).toBeTruthy();
      expect(submit).not.toHaveBeenCalled();

      const unauthorizedRead = await request(app)
        .get("/api/momo/transaction/client-controlled-transaction");
      expect(unauthorizedRead.status).toBe(401);
    } finally {
      config.adminToken = originalAdminToken;
    }
  });

  it("rejects provider status lookup failures without applying callback data", async () => {
    const saga = createPendingDisbursement();
    vi.spyOn(momoProvider.status, "getTransferStatus").mockRejectedValue(new Error("provider unavailable"));

    const response = await request(app)
      .post("/api/momo/callback")
      .send({
        referenceId: "disbursement-ref-001",
        status: "SUCCESSFUL",
        financialTransactionId: "attacker-invented-transaction",
      });

    expect(response.status).toBe(503);
    expect(paymentSaga.getSaga(saga.sagaId)?.state).toBe("DISBURSEMENT_INITIATED");
    expect(momoCallbackService.getRecentFeedItems()).toHaveLength(0);
  });

  it("uses provider status rather than an asserted successful callback", async () => {
    const saga = createPendingDisbursement();
    vi.spyOn(momoProvider.status, "getTransferStatus").mockResolvedValue({
      referenceId: "disbursement-ref-001",
      status: "PENDING",
      financialTransactionId: null,
      rawResponse: { status: "PENDING" },
    });

    const response = await request(app)
      .post("/api/momo/callback")
      .send({
        referenceId: "disbursement-ref-001",
        status: "SUCCESSFUL",
        financialTransactionId: "attacker-invented-transaction",
      });

    expect(response.status).toBe(200);
    expect(response.body.normalizedStatus).toBe("PENDING");
    expect(response.body.financialTransactionId).toBeNull();
    expect(paymentSaga.getSaga(saga.sagaId)?.state).toBe("DISBURSEMENT_INITIATED");
  });

  it("completes only with the provider-verified financial transaction ID", async () => {
    const saga = createPendingDisbursement();
    vi.spyOn(momoProvider.status, "getTransferStatus").mockResolvedValue({
      referenceId: "disbursement-ref-001",
      status: "SUCCESSFUL",
      financialTransactionId: "provider-confirmed-transaction",
      amount: "50",
      currency: "GHS",
      rawResponse: {
        status: "SUCCESSFUL",
        financialTransactionId: "provider-confirmed-transaction",
      },
    });

    const response = await request(app)
      .post("/api/momo/callback")
      .send({
        referenceId: "disbursement-ref-001",
        status: "FAILED",
        financialTransactionId: "untrusted-callback-transaction",
      });

    expect(response.status).toBe(200);
    expect(response.body.normalizedStatus).toBe("SUCCESSFUL");
    expect(paymentSaga.getSaga(saga.sagaId)).toMatchObject({
      state: "COMPLETED",
      providerFinancialTransactionId: "provider-confirmed-transaction",
    });
  });

  it("requires admin authentication for the synthetic sandbox callback", async () => {
    const response = await request(app)
      .post("/api/momo/sandbox/simulate-callback")
      .send({
        referenceId: "disbursement-ref-001",
        status: "SUCCESSFUL",
      });

    expect(response.status).toBe(401);
    expect(momoCallbackService.getRecentFeedItems()).toHaveLength(0);
  });
});
