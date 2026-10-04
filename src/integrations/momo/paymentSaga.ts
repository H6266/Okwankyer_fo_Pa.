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
    network?:
      | "MTN"
      | "Telecel"
      | "AT";
    clientNonce?: string;
  }): SagaTransaction {
    const network = params.network || "MTN";
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
}

export const paymentSaga =
  PaymentSagaOrchestrator.getInstance();
