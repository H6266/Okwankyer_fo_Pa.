import { describe, it, expect, beforeEach } from "vitest";
import { paymentSaga } from "../src/integrations/momo/paymentSaga";
import { durableTransactionStore } from "../src/services/durableTransactionStore";
import { durableIdempotencyLedger } from "../src/services/durableIdempotencyLedger";

describe("Payment Saga & Idempotency Orchestration (Section 25 & 26)", () => {
  beforeEach(() => {
    durableTransactionStore.clearAllForTesting();
    durableIdempotencyLedger.clearAllForTesting();
  });

  it("fails closed to RECONCILIATION_REQUIRED without provider financial ID and never generates fake MOMO_RCP_", () => {
    // 1. Create Draft
    const draft = paymentSaga.createDraft({
      senderPhone: "0541234567",
      recipientPhone: "0559988776",
      amount: 150.0,
      network: "MTN",
    });
    expect(draft.state).toBe("DRAFT");
    expect(draft.amount).toBe(150.0);

    // 2. Recipient Verified
    paymentSaga.verifyRecipient(draft.sagaId, "Kwame Nyamebere");

    // 3. Amount Verified
    paymentSaga.verifyAmount(draft.sagaId);

    // 4. Request Confirmation
    paymentSaga.requestConfirmation(draft.sagaId);

    // 5. Customer Confirms
    paymentSaga.confirm(draft.sagaId);

    // 6. RequestToPay dispatched
    paymentSaga.markRequestToPaySent(draft.sagaId, "MTN_COLL_REF_001");

    // 7. Collection Confirmed
    paymentSaga.recordCollectionResult(draft.sagaId, { status: "SUCCESSFUL" });

    // 8. Disbursement Initiated
    paymentSaga.initiateDisbursement(draft.sagaId, "MTN_DISB_REF_001");

    // 9. Disbursement Finalized without authoritative provider financial transaction ID
    const finalized = paymentSaga.finalizeDisbursement(draft.sagaId, true);

    expect(finalized.state).toBe("RECONCILIATION_REQUIRED");
    expect(finalized.providerFinancialTransactionId).toBeUndefined();
    expect(JSON.stringify(finalized)).not.toContain("MOMO_RCP_");
  });

  it("completes only when authoritative provider financial transaction ID is supplied", () => {
    const draft = paymentSaga.createDraft({
      senderPhone: "0541234567",
      recipientPhone: "0559988776",
      amount: 50.0,
      network: "MTN",
    });

    paymentSaga.verifyRecipient(draft.sagaId, "Ama Serwaa");
    paymentSaga.verifyAmount(draft.sagaId);
    paymentSaga.requestConfirmation(draft.sagaId);
    paymentSaga.confirm(draft.sagaId);
    paymentSaga.markRequestToPaySent(draft.sagaId, "MTN_COLL_REF_002");
    paymentSaga.recordCollectionResult(draft.sagaId, { status: "SUCCESSFUL" });
    paymentSaga.initiateDisbursement(draft.sagaId, "MTN_DISB_REF_002");

    const completed = paymentSaga.finalizeDisbursement(
      draft.sagaId,
      true,
      undefined,
      "MTN_FIN_TX_987654"
    );

    expect(completed.state).toBe("COMPLETED");
    expect(completed.providerFinancialTransactionId).toBe("MTN_FIN_TX_987654");
    expect(JSON.stringify(completed)).not.toContain("MOMO_RCP_");
  });

  it("handles customer declined failure branch", () => {
    const saga = paymentSaga.createDraft({
      senderPhone: "0540001122",
      recipientPhone: "0553334455",
      amount: 45.0,
      network: "MTN",
    });
    paymentSaga.verifyRecipient(saga.sagaId, "Kofi Mensah");
    paymentSaga.verifyAmount(saga.sagaId);
    paymentSaga.requestConfirmation(saga.sagaId);
    paymentSaga.confirm(saga.sagaId);
    paymentSaga.markRequestToPaySent(saga.sagaId, "COLL_DECLINE_01");

    paymentSaga.recordCollectionResult(saga.sagaId, {
      status: "DECLINED",
      reason: "CUSTOMER_DECLINED_IN_USSD",
    });
    expect(saga.state).toBe("CUSTOMER_DECLINED");
    expect(saga.providerFinancialTransactionId).toBeUndefined();
    expect(JSON.stringify(saga)).not.toContain("MOMO_RCP_");
  });

  it("enforces idempotency on duplicate transaction draft attempts", () => {
    const draft1 = paymentSaga.createDraft({
      senderPhone: "0201112233",
      recipientPhone: "0278889900",
      amount: 200.0,
      network: "Telecel",
      clientNonce: "nonce_abc",
    });

    const draft2 = paymentSaga.createDraft({
      senderPhone: "0201112233",
      recipientPhone: "0278889900",
      amount: 200.0,
      network: "Telecel",
      clientNonce: "nonce_abc",
    });

    expect(draft1.sagaId).toBe(draft2.sagaId);
    expect(draft1.idempotencyKey).toBe(draft2.idempotencyKey);
  });
});
