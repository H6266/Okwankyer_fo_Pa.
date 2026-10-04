import { describe, it, expect, beforeEach } from "vitest";
import { paymentSaga } from "../src/integrations/momo/paymentSaga";
import { durableTransactionStore } from "../src/services/durableTransactionStore";

describe("Payment Saga & Idempotency Orchestration (Section 25 & 26)", () => {
  beforeEach(() => {
    durableTransactionStore.clearAllForTesting();
  });
  it("executes the canonical payment saga from Draft to Completed", () => {
    // 1. Create Draft
    const saga = paymentSaga.createDraft({
      senderPhone: "0541234567",
      recipientPhone: "0559988776",
      amount: 150.0,
      network: "MTN",
    });
    expect(saga.state).toBe("DRAFT");
    expect(saga.amount).toBe(150.0);
    expect(saga.authReceipt).toBeUndefined();

    // 2. Recipient Verified
    paymentSaga.verifyRecipient(saga.sagaId, "Kwame Nyamebere");
    expect(saga.state).toBe("RECIPIENT_VERIFIED");
    expect(saga.recipientName).toBe("Kwame Nyamebere");

    // 3. Amount Verified
    paymentSaga.verifyAmount(saga.sagaId);
    expect(saga.state).toBe("AMOUNT_VERIFIED");

    // 4. Request Confirmation
    paymentSaga.requestConfirmation(saga.sagaId);
    expect(saga.state).toBe("CONFIRMATION_REQUESTED");

    // 5. Customer Confirms
    paymentSaga.confirm(saga.sagaId);
    expect(saga.state).toBe("CONFIRMED");

    // 6. RequestToPay dispatched
    paymentSaga.markRequestToPaySent(saga.sagaId, "MTN_COLL_REF_001");
    expect(saga.state).toBe("WAITING_FOR_CUSTOMER_AUTHORIZATION");
    expect(saga.collectionReference).toBe("MTN_COLL_REF_001");
    expect(saga.authReceipt).toBeUndefined(); // NEVER generated prematurely

    // 7. Collection Confirmed
    paymentSaga.recordCollectionResult(saga.sagaId, true);
    expect(saga.state).toBe("COLLECTION_CONFIRMED");

    // 8. Disbursement Initiated
    paymentSaga.initiateDisbursement(saga.sagaId, "MTN_DISB_REF_001");
    expect(saga.state).toBe("DISBURSEMENT_INITIATED");

    // 9. Disbursement Finalized (COMPLETED)
    paymentSaga.finalizeDisbursement(saga.sagaId, true);
    expect(saga.state).toBe("COMPLETED");
    expect(saga.authReceipt).toBeDefined();
    expect(saga.authReceipt).toContain("MOMO_RCP_");
  });

  it("handles customer declined failure branch", () => {
    const saga = paymentSaga.createDraft({
      senderPhone: "0540001122",
      recipientPhone: "0553334455",
      amount: 45.0,
    });
    paymentSaga.verifyRecipient(saga.sagaId, "Kofi Mensah");
    paymentSaga.verifyAmount(saga.sagaId);
    paymentSaga.requestConfirmation(saga.sagaId);
    paymentSaga.confirm(saga.sagaId);
    paymentSaga.markRequestToPaySent(saga.sagaId, "COLL_DECLINE_01");

    paymentSaga.recordCollectionResult(saga.sagaId, false, "CUSTOMER_DECLINED_IN_USSD");
    expect(saga.state).toBe("CUSTOMER_DECLINED");
    expect(saga.authReceipt).toBeUndefined();
  });

  it("enforces idempotency on duplicate transaction draft attempts", () => {
    const draft1 = paymentSaga.createDraft({
      senderPhone: "0201112233",
      recipientPhone: "0278889900",
      amount: 200.0,
      clientNonce: "nonce_abc",
    });

    const draft2 = paymentSaga.createDraft({
      senderPhone: "0201112233",
      recipientPhone: "0278889900",
      amount: 200.0,
      clientNonce: "nonce_abc",
    });

    expect(draft1.sagaId).toBe(draft2.sagaId);
    expect(draft1.idempotencyKey).toBe(draft2.idempotencyKey);
  });
});
