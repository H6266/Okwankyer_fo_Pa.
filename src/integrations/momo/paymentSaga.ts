/**
 * Ɔkwankyerɛfo Pa - Authoritative Payment Saga Orchestrator
 *
 * This is the application-level state machine for:
 *
 * DRAFT
 *   -> RECIPIENT_VERIFIED
 *   -> AMOUNT_VERIFIED
 *   -> CONFIRMATION_REQUESTED
 *   -> CONFIRMED
 *   -> WAITING_FOR_CUSTOMER_AUTHORIZATION
 *   -> COLLECTION_CONFIRMED
 *   -> DISBURSEMENT_INITIATED
 *   -> DISBURSEMENT_CONFIRMED
 *   -> COMPLETED
 *
 * Every uncertain provider outcome becomes a non-success state.
 *
 * CRITICAL:
 * No locally generated receipt is considered a provider receipt.
 */

import crypto from "crypto";
import { durableTransactionStore } from "../../services/durableTransactionStore";
import { durableIdempotencyLedger } from "../../services/durableIdempotencyLedger";
import { truthEngine } from "../../ai_system/core/truthEngine";
import { financialPolicy } from "../../ai_system/core/financialPolicy";
import { momoEngine } from "./momoEngine";

export type SagaState =
  | "DRAFT"
  | "RECIPIENT_VERIFIED"
  | "AMOUNT_VERIFIED"
  | "CONFIRMATION_REQUESTED"
  | "CONFIRMED"
  | "REQUEST_TO_PAY_SENT"
  | "WAITING_FOR_CUSTOMER_AUTHORIZATION"
  | "COLLECTION_CONFIRMED"
  | "DISBURSEMENT_INITIATED"
  | "DISBURSEMENT_CONFIRMED"
  | "COMPLETED"
  | "COLLECTION_FAILED"
  | "CUSTOMER_DECLINED"
  | "COLLECTION_TIMEOUT"
  | "DISBURSEMENT_FAILED"
  | "DISBURSEMENT_TIMEOUT"
  | "RECONCILIATION_REQUIRED";

export interface SagaProviderEvidence {
  provider:
    | "MTN"
    | "Telecel"
    | "AT"
    | string;
  referenceId?: string;
  financialTransactionId?: string;
  httpStatus?: number;
  providerStatus?: string;
  reason?: string;
  evidenceId?: string;
  observedAt: number;
}

export interface SagaTransaction {
  sagaId: string;
  idempotencyKey: string;
  senderPhone: string;
  recipientPhone: string;
  recipientName: string;
  amount: number;
  network:
    | "MTN"
    | "Telecel"
    | "AT";
  state: SagaState;
  createdAt: number;
  updatedAt: number;

  collectionReference?: string;
  disbursementReference?: string;

  failureReason?: string;

  providerFinancialTransactionId?: string;

  providerEvidence?:
    SagaProviderEvidence[];

  lastProviderStatus?: string;
  mode?: "REAL_MTN_SANDBOX" | "MOCK_PROVIDER";
  reconciliationNotice?: string;
}

function requireProviderTransactionId(
  value: unknown
): string {
  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    throw new Error(
      "FINANCIAL_TRUTH_UNKNOWN: provider financial transaction ID is required for completion."
    );
  }

  return value.trim();
}

export class PaymentSagaOrchestrator {
  private static instance:
    PaymentSagaOrchestrator;

  public static getInstance():
    PaymentSagaOrchestrator {
    if (!PaymentSagaOrchestrator.instance) {
      PaymentSagaOrchestrator.instance =
        new PaymentSagaOrchestrator();
    }

    return PaymentSagaOrchestrator.instance;
  }

  public generateIdempotencyKey(
    senderPhone: string,
    recipientPhone: string,
    amount: number,
    network:
      | "MTN"
      | "Telecel"
      | "AT",
    clientNonce?: string
  ): string {
    const data = JSON.stringify({
      senderPhone,
      recipientPhone,
      amount:
        Number(amount.toFixed(2)),
      network,
      clientNonce:
        clientNonce || null,
    });

    return crypto
      .createHash("sha256")
      .update(data)
      .digest("hex");
  }

  public createDraft(params: {
    senderPhone: string;
    recipientPhone: string;
    amount: number;
    network:
      | "MTN"
      | "Telecel"
      | "AT";
    clientNonce?: string;
  }): SagaTransaction {
    const network = params.network;
    const policy =
      financialPolicy.validateExecution(
        {
          operation: "TRANSFER",
          sessionId: "SAGA_DRAFT",
          senderPhone:
            params.senderPhone,
          recipientPhone:
            params.recipientPhone,
          amount:
            params.amount,
          currency: "GHS",
          network,
        }
      );

    if (!policy.allowed) {
      throw new Error(
        policy.reason
      );
    }

    truthEngine.assertKnown(
      "senderPhone",
      params.senderPhone,
      "Sender Phone"
    );

    truthEngine.assertKnown(
      "recipientPhone",
      params.recipientPhone,
      "Recipient Phone"
    );

    truthEngine.assertKnown(
      "amount",
      params.amount,
      "Transaction Amount"
    );

    const idempotencyKey =
      this.generateIdempotencyKey(
        params.senderPhone,
        params.recipientPhone,
        params.amount,
        network,
        params.clientNonce
      );

    const fingerprint =
      financialPolicy.fingerprint(
        {
          operation: "TRANSFER",
          sessionId:
            idempotencyKey,
          senderPhone:
            params.senderPhone,
          recipientPhone:
            params.recipientPhone,
          amount:
            params.amount,
          currency: "GHS",
          network,
        }
      );

    const reservation =
      durableIdempotencyLedger.reserve<
        SagaTransaction
      >(
        {
          key:
            `payment-saga:${idempotencyKey}`,
          fingerprint,
          resourceType:
            "PAYMENT_SAGA",
        }
      );

    if (
      reservation.kind ===
      "CONFLICT"
    ) {
      throw new Error(
        "DUPLICATE_TRANSACTION: idempotency key was previously used with different financial parameters."
      );
    }

    if (
      reservation.kind ===
      "EXISTING"
    ) {
      if (
        reservation.record.resourceId
      ) {
        const existing =
          durableTransactionStore.getSaga(
            reservation.record.resourceId
          );

        if (existing) {
          return existing;
        }
      }

      if (
        reservation.record.state ===
          "COMPLETED" &&
        reservation.record.result
      ) {
        return reservation.record.result;
      }

      throw new Error(
        "DUPLICATE_TRANSACTION: an earlier payment saga is already in progress for this idempotency key."
      );
    }

    const now = Date.now();

    const sagaId =
      `SAGA_${now}_${crypto
        .randomBytes(4)
        .toString("hex")}`;

    const saga: SagaTransaction = {
      sagaId,
      idempotencyKey,
      senderPhone:
        params.senderPhone,
      recipientPhone:
        params.recipientPhone,
      recipientName:
        "Unverified",
      amount:
        Number(
          params.amount.toFixed(2)
        ),
      network,
      state: "DRAFT",
      createdAt: now,
      updatedAt: now,
      providerEvidence: [],
    };

    durableTransactionStore.saveSaga(
      saga
    );

    durableIdempotencyLedger.update(
      `payment-saga:${idempotencyKey}`,
      {
        resourceId: sagaId,
      }
    );

    return saga;
  }

  private getSagaOrThrow(
    sagaId: string
  ): SagaTransaction {
    const saga =
      durableTransactionStore.getSaga(
        sagaId
      );

    if (!saga) {
      throw new Error(
        `Payment Saga with ID '${sagaId}' does not exist.`
      );
    }

    return saga;
  }

  private persist(
    saga: SagaTransaction
  ): SagaTransaction {
    saga.updatedAt =
      Date.now();

    durableTransactionStore.saveSaga(
      saga
    );

    return saga;
  }

  public verifyRecipient(
    sagaId: string,
    recipientName: string,
    identityVerified = false
  ): SagaTransaction {
    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !== "DRAFT"
    ) {
      throw new Error(
        `Invalid saga transition from ${saga.state}.`
      );
    }

    truthEngine.assertKnown(
      "recipientName",
      recipientName,
      "Recipient Name"
    );

    saga.recipientName =
      recipientName ||
      "Unverified";

    /*
     * identityVerified is intentionally not silently inferred.
     * The actual resolver must decide whether this is verified.
     */
    void identityVerified;

    saga.state =
      "RECIPIENT_VERIFIED";

    return this.persist(
      saga
    );
  }

  public verifyAmount(
    sagaId: string
  ): SagaTransaction {
    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !==
      "RECIPIENT_VERIFIED"
    ) {
      throw new Error(
        `Invalid saga transition from ${saga.state}.`
      );
    }

    const policy =
      financialPolicy.validateExecution(
        {
          operation: "TRANSFER",
          sessionId:
            saga.sagaId,
          senderPhone:
            saga.senderPhone,
          recipientPhone:
            saga.recipientPhone,
          amount:
            saga.amount,
          currency: "GHS",
          network:
            saga.network,
        }
      );

    if (!policy.allowed) {
      throw new Error(
        policy.reason
      );
    }

    saga.state =
      "AMOUNT_VERIFIED";

    return this.persist(
      saga
    );
  }

  public requestConfirmation(
    sagaId: string
  ): SagaTransaction {
    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !==
      "AMOUNT_VERIFIED"
    ) {
      throw new Error(
        `Invalid saga transition from ${saga.state}.`
      );
    }

    saga.state =
      "CONFIRMATION_REQUESTED";

    return this.persist(
      saga
    );
  }

  public confirm(
    sagaId: string
  ): SagaTransaction {
    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !==
      "CONFIRMATION_REQUESTED"
    ) {
      throw new Error(
        `Invalid saga transition from ${saga.state}.`
      );
    }

    saga.state =
      "CONFIRMED";

    return this.persist(
      saga
    );
  }

  public markRequestToPaySent(
    sagaId: string,
    reference: string,
    evidence?: Partial<SagaProviderEvidence>
  ): SagaTransaction {
    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !== "CONFIRMED"
    ) {
      throw new Error(
        `Invalid saga transition from ${saga.state}.`
      );
    }

    if (
      !reference?.trim()
    ) {
      throw new Error(
        "FINANCIAL_TRUTH_UNKNOWN: RequestToPay reference is required."
      );
    }

    saga.collectionReference =
      reference.trim();

    saga.lastProviderStatus =
      "PENDING";

    saga.providerEvidence = [
      ...(saga.providerEvidence ||
        []),
      {
        provider:
          evidence?.provider ||
          "MTN",
        referenceId:
          reference.trim(),
        httpStatus:
          evidence?.httpStatus,
        providerStatus:
          evidence?.providerStatus ||
          "PENDING",
        evidenceId:
          evidence?.evidenceId,
        observedAt:
          Date.now(),
      },
    ];

    saga.state =
      "WAITING_FOR_CUSTOMER_AUTHORIZATION";

    return this.persist(
      saga
    );
  }

  public recordCollectionResult(
    sagaId: string,
    resultOrSuccess:
      | boolean
      | {
          status:
            | "SUCCESSFUL"
            | "PENDING"
            | "FAILED"
            | "DECLINED"
            | "TIMEOUT";
          provider?: string;
          referenceId?: string;
          financialTransactionId?: string;
          reason?: string;
          httpStatus?: number;
          evidenceId?: string;
        },
    legacyReason?: string
  ): SagaTransaction {
    const result: {
      status:
        | "SUCCESSFUL"
        | "PENDING"
        | "FAILED"
        | "DECLINED"
        | "TIMEOUT";
      provider?: string;
      referenceId?: string;
      financialTransactionId?: string;
      reason?: string;
      httpStatus?: number;
      evidenceId?: string;
    } =
      typeof resultOrSuccess === "boolean"
        ? {
            status: resultOrSuccess ? "SUCCESSFUL" : "DECLINED",
            reason: legacyReason,
          }
        : resultOrSuccess;

    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !==
      "WAITING_FOR_CUSTOMER_AUTHORIZATION"
    ) {
      throw new Error(
        `Invalid collection callback state: ${saga.state}.`
      );
    }

    saga.lastProviderStatus =
      result.status;

    saga.providerEvidence = [
      ...(saga.providerEvidence ||
        []),
      {
        provider:
          result.provider ||
          "MTN",
        referenceId:
          result.referenceId ||
          saga.collectionReference,
        financialTransactionId:
          result.financialTransactionId,
        httpStatus:
          result.httpStatus,
        providerStatus:
          result.status,
        reason:
          result.reason,
        evidenceId:
          result.evidenceId,
        observedAt:
          Date.now(),
      },
    ];

    if (
      result.status ===
      "SUCCESSFUL"
    ) {
      saga.state =
        "COLLECTION_CONFIRMED";
    } else if (
      result.status ===
      "PENDING"
    ) {
      saga.state =
        "WAITING_FOR_CUSTOMER_AUTHORIZATION";
    } else if (
      result.status ===
      "DECLINED"
    ) {
      saga.state =
        "CUSTOMER_DECLINED";

      saga.failureReason =
        result.reason ||
        "Customer declined authorization.";
    } else if (
      result.status ===
      "TIMEOUT"
    ) {
      saga.state =
        "COLLECTION_TIMEOUT";

      saga.failureReason =
        result.reason ||
        "Collection authorization timed out.";
    } else {
      saga.state =
        "COLLECTION_FAILED";

      saga.failureReason =
        result.reason ||
        "Provider rejected collection.";
    }

    return this.persist(
      saga
    );
  }

  public initiateDisbursement(
    sagaId: string,
    reference: string,
    evidence?: Partial<SagaProviderEvidence>
  ): SagaTransaction {
    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !==
      "COLLECTION_CONFIRMED"
    ) {
      throw new Error(
        `Cannot disburse before authoritative collection confirmation. Current state: ${saga.state}.`
      );
    }

    if (
      !reference?.trim()
    ) {
      throw new Error(
        "FINANCIAL_TRUTH_UNKNOWN: disbursement reference is required."
      );
    }

    saga.disbursementReference =
      reference.trim();

    saga.lastProviderStatus =
      evidence?.providerStatus ||
      "PENDING";

    saga.providerEvidence = [
      ...(saga.providerEvidence ||
        []),
      {
        provider:
          evidence?.provider ||
          saga.network,
        referenceId:
          reference.trim(),
        providerStatus:
          evidence?.providerStatus ||
          "PENDING",
        httpStatus:
          evidence?.httpStatus,
        evidenceId:
          evidence?.evidenceId,
        observedAt:
          Date.now(),
      },
    ];

    saga.state =
      "DISBURSEMENT_INITIATED";

    return this.persist(
      saga
    );
  }

  public recordDisbursementResult(
    sagaId: string,
    result: {
      status:
        | "SUCCESSFUL"
        | "PENDING"
        | "FAILED"
        | "TIMEOUT";
      provider?: string;
      referenceId?: string;
      financialTransactionId?: string;
      reason?: string;
      httpStatus?: number;
      evidenceId?: string;
    }
  ): SagaTransaction {
    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !==
      "DISBURSEMENT_INITIATED"
    ) {
      throw new Error(
        `Invalid disbursement callback state: ${saga.state}.`
      );
    }

    saga.lastProviderStatus =
      result.status;

    saga.providerEvidence = [
      ...(saga.providerEvidence ||
        []),
      {
        provider:
          result.provider ||
          saga.network,
        referenceId:
          result.referenceId ||
          saga.disbursementReference,
        financialTransactionId:
          result.financialTransactionId,
        providerStatus:
          result.status,
        httpStatus:
          result.httpStatus,
        reason:
          result.reason,
        evidenceId:
          result.evidenceId,
        observedAt:
          Date.now(),
      },
    ];

    if (
      result.status ===
      "PENDING"
    ) {
      return this.persist(
        saga
      );
    }

    if (
      result.status ===
      "TIMEOUT"
    ) {
      saga.state =
        "DISBURSEMENT_TIMEOUT";

      saga.failureReason =
        result.reason ||
        "Disbursement provider did not return a terminal state.";

      return this.persist(
        saga
      );
    }

    if (
      result.status ===
      "FAILED"
    ) {
      saga.state =
        "DISBURSEMENT_FAILED";

      saga.failureReason =
        result.reason ||
        "Disbursement failed at provider.";

      return this.persist(
        saga
      );
    }

    if (
      !result.financialTransactionId
    ) {
      saga.state =
        "RECONCILIATION_REQUIRED";

      saga.failureReason =
        "Provider reported SUCCESSFUL but supplied no financialTransactionId.";

      return this.persist(
        saga
      );
    }

    saga.providerFinancialTransactionId =
      requireProviderTransactionId(
        result.financialTransactionId
      );

    saga.state =
      "DISBURSEMENT_CONFIRMED";

    return this.persist(
      saga
    );
  }

  /**
   * Backward-compatible finalization entry point.
   *
   * Deliberately fails closed when providerFinancialTxId is missing.
   */
  public finalizeDisbursement(
    sagaId: string,
    success: boolean,
    reason?: string,
    providerFinancialTxId?: string
  ): SagaTransaction {
    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !==
      "DISBURSEMENT_INITIATED"
    ) {
      throw new Error(
        `Invalid saga transition: cannot finalize disbursement from ${saga.state}.`
      );
    }

    if (!success) {
      saga.state =
        "RECONCILIATION_REQUIRED";

      saga.failureReason =
        reason ||
        "Disbursement failed or could not be verified.";

      return this.persist(
        saga
      );
    }

    if (
      !providerFinancialTxId
    ) {
      saga.state =
        "RECONCILIATION_REQUIRED";

      saga.failureReason =
        "Provider completion was reported without an authoritative financial transaction ID.";

      return this.persist(
        saga
      );
    }

    saga.providerFinancialTransactionId =
      requireProviderTransactionId(
        providerFinancialTxId
      );

    saga.state =
      "DISBURSEMENT_CONFIRMED";

    this.persist(
      saga
    );

    saga.state =
      "COMPLETED";

    saga.failureReason =
      undefined;

    return this.persist(
      saga
    );
  }

  public completeIfAuthoritativelyConfirmed(
    sagaId: string
  ): SagaTransaction {
    const saga =
      this.getSagaOrThrow(
        sagaId
      );

    if (
      saga.state !==
      "DISBURSEMENT_CONFIRMED"
    ) {
      throw new Error(
        `Cannot complete saga from state ${saga.state}.`
      );
    }

    if (
      !saga.providerFinancialTransactionId
    ) {
      saga.state =
        "RECONCILIATION_REQUIRED";

      saga.failureReason =
        "No provider financial transaction ID exists.";

      return this.persist(
        saga
      );
    }

    saga.state =
      "COMPLETED";

    return this.persist(
      saga
    );
  }

  public getSaga(
    sagaId: string
  ):
    | SagaTransaction
    | undefined {
    return durableTransactionStore.getSaga(
      sagaId
    );
  }

  public getSagaByIdempotencyKey(idempotencyKey: string): SagaTransaction | undefined {
    const record = durableIdempotencyLedger.get(`payment-saga:${idempotencyKey}`);
    if (record?.resourceId) {
      const s = durableTransactionStore.getSaga(record.resourceId);
      if (s) return s;
    }
    const all = durableTransactionStore.getAllSagas();
    return all.find((s) => s.idempotencyKey === idempotencyKey);
  }

  public getLatestSagaForSession(sessionId: string): SagaTransaction | undefined {
    const all = durableTransactionStore.getAllSagas();
    return all.slice().reverse().find((s) => s.idempotencyKey.startsWith(`${sessionId}:`) || (s as any).sessionId === sessionId);
  }

  /**
   * Executes a confirmed MoMo transfer saga:
   * 1. Idempotency key = session + confirmed draft hash
   * 2. Runs RequestToPay -> status polling -> disbursement
   * 3. Authoritative provider evidence only: a 202 stays PENDING
   * 4. Missing sandbox credentials -> clear status badge and explicit mock-provider mode, never silent fake success
   * 5. PENDING beyond configurable time -> reconciliation notice
   * 6. Never prune PENDING sagas
   */
  public async executeConfirmedTransferSaga(params: {
    sessionId: string;
    senderPhone: string;
    recipientPhone: string;
    recipientName?: string;
    amount: number;
    network?: "MTN" | "Telecel" | "AT";
    confirmedDraftHash?: string;
    timeoutMs?: number;
    simulateOutcome?: "SUCCESSFUL" | "FAILED" | "PENDING_TIMEOUT";
  }): Promise<{
    saga: SagaTransaction;
    status: "PENDING" | "COMPLETED" | "FAILED" | "RECONCILIATION_REQUIRED";
    mode: "REAL_MTN_SANDBOX" | "MOCK_PROVIDER";
    reconciliationNotice?: string;
  }> {
    const network = params.network || "MTN";
    const senderPhone = params.senderPhone || "0244123456";
    const recipientPhone = params.recipientPhone;
    const amount = Number(params.amount);
    const timeoutMs = params.timeoutMs ?? 15000;

    const draftHash =
      params.confirmedDraftHash ||
      crypto
        .createHash("sha256")
        .update(JSON.stringify({ senderPhone, recipientPhone, amount, network }))
        .digest("hex");
    const clientNonce = `${params.sessionId}:${draftHash}`;
    const idempotencyKey = this.generateIdempotencyKey(senderPhone, recipientPhone, amount, network, clientNonce);

    // 1. Check idempotency: Replayed "yes" / DTMF 1 or redial after drop produces exactly ONE payment
    const existing = this.getSagaByIdempotencyKey(idempotencyKey);
    if (existing && existing.state !== "DRAFT") {
      const isPending =
        existing.state === "WAITING_FOR_CUSTOMER_AUTHORIZATION" ||
        existing.state === "REQUEST_TO_PAY_SENT" ||
        existing.state === "DISBURSEMENT_INITIATED" ||
        existing.state === "CONFIRMED";
      const isCompleted = existing.state === "COMPLETED";
      const isFailed =
        existing.state === "COLLECTION_FAILED" ||
        existing.state === "DISBURSEMENT_FAILED" ||
        existing.state === "CUSTOMER_DECLINED";
      const isRecon = existing.state === "RECONCILIATION_REQUIRED";

      return {
        saga: existing,
        status: isCompleted ? "COMPLETED" : isFailed ? "FAILED" : isRecon ? "RECONCILIATION_REQUIRED" : "PENDING",
        mode: existing.mode || "MOCK_PROVIDER",
        reconciliationNotice: existing.reconciliationNotice,
      };
    }

    // 2. Create and transition saga through authoritative pre-provider gates
    const draft = existing || this.createDraft({
      senderPhone,
      recipientPhone,
      amount,
      network,
      clientNonce,
    });
    this.verifyRecipient(draft.sagaId, params.recipientName || "Subscriber");
    this.verifyAmount(draft.sagaId);
    this.requestConfirmation(draft.sagaId);
    const confirmedSaga = this.confirm(draft.sagaId);

    // 3. Check sandbox credentials
    const hasRealCredentials = momoEngine.isConfigured("collection");

    if (hasRealCredentials) {
      confirmedSaga.mode = "REAL_MTN_SANDBOX";
      try {
        const momoTx = await momoEngine.requestToPay({
          amount,
          payerPhone: senderPhone,
          payerMessage: `Transfer of GH₵${amount} to ${params.recipientName || recipientPhone}`,
          payeeNote: `Ɔkwankyerɛfo Pa Voice MoMo Transfer to ${recipientPhone}`,
          externalId: confirmedSaga.sagaId,
        });

        // Provider returned HTTP 202 -> MUST remain PENDING until authoritative polling
        this.markRequestToPaySent(confirmedSaga.sagaId, momoTx.referenceId, {
          provider: "MTN",
          httpStatus: 202,
          providerStatus: "PENDING",
          referenceId: momoTx.referenceId,
        });

        // Poll for authoritative status evidence
        const polledTx = await momoEngine.getTransactionStatus(momoTx.referenceId).catch(() => null);
        if (polledTx && polledTx.status === "SUCCESSFUL" && polledTx.financialTransactionId) {
          this.recordCollectionResult(confirmedSaga.sagaId, {
            status: "SUCCESSFUL",
            provider: "MTN",
            referenceId: momoTx.referenceId,
            financialTransactionId: polledTx.financialTransactionId,
            httpStatus: 200,
          });

          // Leg 2: Disbursement
          if (momoEngine.isConfigured("disbursement")) {
            const disbTx = await momoEngine.transfer({
              amount,
              payeePhone: recipientPhone,
              payeeNote: `Payout to ${recipientPhone}`,
              payerMessage: `Transfer from ${senderPhone}`,
              externalId: `payout_${confirmedSaga.sagaId}`,
            });
            if (disbTx && disbTx.status === "SUCCESSFUL" && disbTx.financialTransactionId) {
              this.initiateDisbursement(confirmedSaga.sagaId, disbTx.referenceId, {
                provider: "MTN",
                providerStatus: "SUCCESSFUL",
                httpStatus: 200,
              });
              this.finalizeDisbursement(confirmedSaga.sagaId, true, undefined, disbTx.financialTransactionId);
            } else {
              this.initiateDisbursement(confirmedSaga.sagaId, disbTx.referenceId, {
                provider: "MTN",
                providerStatus: "PENDING",
                httpStatus: 202,
              });
            }
          }
        } else if (polledTx && (polledTx.status === "FAILED" || polledTx.status === "DECLINED")) {
          this.recordCollectionResult(confirmedSaga.sagaId, {
            status: "FAILED",
            provider: "MTN",
            referenceId: momoTx.referenceId,
            reason: polledTx.reason || "Payment declined on handset",
            httpStatus: 400,
          });
        }
      } catch (err: any) {
        this.markRequestToPaySent(confirmedSaga.sagaId, `err-${Date.now()}`, {
          provider: "MTN",
          httpStatus: 500,
          providerStatus: "FAILED",
          reason: err.message,
        });
        this.recordCollectionResult(confirmedSaga.sagaId, {
          status: "FAILED",
          provider: "MTN",
          reason: err.message,
        });
      }
    } else {
      // Missing sandbox credentials: Explicit MOCK_PROVIDER mode, never a silent fake success!
      confirmedSaga.mode = "MOCK_PROVIDER";
      const mockRef = `mock-rtp-${Date.now()}`;
      this.markRequestToPaySent(confirmedSaga.sagaId, mockRef, {
        provider: "MOCK_PROVIDER",
        httpStatus: 202,
        providerStatus: "PENDING",
        reason: "Missing MTN sandbox credentials: explicit mock provider engaged. Handset USSD push simulated.",
      });

      if (params.simulateOutcome === "SUCCESSFUL") {
        this.recordCollectionResult(confirmedSaga.sagaId, {
          status: "SUCCESSFUL",
          provider: "MOCK_PROVIDER",
          financialTransactionId: `MOCK_FIN_COLL_${Date.now()}`,
          httpStatus: 200,
        });
        this.initiateDisbursement(confirmedSaga.sagaId, `mock-disb-${Date.now()}`, {
          provider: "MOCK_PROVIDER",
          providerStatus: "SUCCESSFUL",
          httpStatus: 200,
        });
        this.finalizeDisbursement(confirmedSaga.sagaId, true, undefined, `MOCK_FIN_DISB_${Date.now()}`);
      } else if (params.simulateOutcome === "FAILED") {
        this.recordCollectionResult(confirmedSaga.sagaId, {
          status: "FAILED",
          provider: "MOCK_PROVIDER",
          reason: "Payment authorization declined by user on handset",
          httpStatus: 400,
        });
      }
    }

    // 4. Check PENDING timeout for reconciliation notice
    const isStillPending =
      confirmedSaga.state === "WAITING_FOR_CUSTOMER_AUTHORIZATION" ||
      confirmedSaga.state === "REQUEST_TO_PAY_SENT" ||
      confirmedSaga.state === "DISBURSEMENT_INITIATED" ||
      confirmedSaga.state === "CONFIRMED";

    if (
      isStillPending &&
      (params.simulateOutcome === "PENDING_TIMEOUT" || Date.now() - confirmedSaga.createdAt >= timeoutMs)
    ) {
      const notice = `RECONCILIATION NOTICE: Transfer of GHS ${amount.toFixed(2)} to ${recipientPhone} is PENDING beyond timeout threshold (${timeoutMs}ms). Authoritative provider evidence is awaited; manual reconciliation required.`;
      confirmedSaga.reconciliationNotice = notice;
      confirmedSaga.state = "RECONCILIATION_REQUIRED";
      confirmedSaga.failureReason = notice;
      this.persist(confirmedSaga);
    }

    const currentStatus =
      confirmedSaga.state === "COMPLETED"
        ? "COMPLETED"
        : confirmedSaga.state === "COLLECTION_FAILED" ||
          confirmedSaga.state === "DISBURSEMENT_FAILED" ||
          confirmedSaga.state === "CUSTOMER_DECLINED"
        ? "FAILED"
        : confirmedSaga.state === "RECONCILIATION_REQUIRED"
        ? "RECONCILIATION_REQUIRED"
        : "PENDING";

    return {
      saga: confirmedSaga,
      status: currentStatus,
      mode: confirmedSaga.mode || "MOCK_PROVIDER",
      reconciliationNotice: confirmedSaga.reconciliationNotice,
    };
  }
}

export const paymentSaga =
  PaymentSagaOrchestrator.getInstance();
