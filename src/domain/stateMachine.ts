/**
 * Ɔkwankyerɛfo Pa - Transaction State Machine & Idempotency Engine
 * 
 * Formal Transaction States:
 * INITIATED → RECIPIENT_VERIFIED → AMOUNT_ENTERED → CONFIRMED → PIN_PENDING → COMPLETED / FAILED / CANCELLED / TIMEOUT
 * 
 * Guarantees:
 * 1. An explicit state machine prevents out-of-order transitions.
 * 2. Idempotency keys prevent double billing on repeated webhooks.
 * 3. Never captures, stores, or logs PINs.
 */

import { GhanaianNetwork } from "./validation";
import { generateTransactionReference } from "../audio/dynamicPromptBuilder";
import { durableTransactionStore, DurableTransactionStore } from "../services/durableTransactionStore";

export type TransactionState =
  | "INITIATED"
  | "RECIPIENT_VERIFIED"
  | "AMOUNT_ENTERED"
  | "CONFIRMED"
  | "PIN_PENDING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

export type InteractionMode = "GUIDED_IVR" | "NATURAL_CONVERSATION";

export interface TransactionChecklist {
  language: boolean;
  service: boolean;
  network: boolean;
  recipient: boolean;
  amount: boolean;
  referenceKyc: boolean;
  pinGatePassed: boolean;
  transactionInitiated: boolean;
  stateReported: boolean;
}

export interface TransactionSession {
  sessionId: string;
  idempotencyKey: string;
  source: "VOICE" | "KEYPAD";
  interactionMode?: InteractionMode;
  language: "en" | "twi" | null;
  network: GhanaianNetwork | null;
  callerPhone?: string;
  recipientPhone: string | null;
  recipientName: string | null;
  isRecipientVerified: boolean;
  amount: number | null;
  state: TransactionState;
  referenceId: string;
  confirmationReadbackFingerprint?: string;
  confirmationReadbackAt?: number;
  momoReferenceId?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  failureReason?: string;
  retryCount: number;
  serviceSelected?: boolean;
  pinGatePassed?: boolean;
  transactionInitiated?: boolean;
  stateReported?: boolean;
}

const VALID_TRANSITIONS: Record<TransactionState, TransactionState[]> = {
  INITIATED: ["RECIPIENT_VERIFIED", "AMOUNT_ENTERED", "FAILED", "CANCELLED", "TIMEOUT"],
  RECIPIENT_VERIFIED: ["AMOUNT_ENTERED", "RECIPIENT_VERIFIED", "FAILED", "CANCELLED", "TIMEOUT"],
  AMOUNT_ENTERED: ["CONFIRMED", "AMOUNT_ENTERED", "RECIPIENT_VERIFIED", "FAILED", "CANCELLED", "TIMEOUT"],
  CONFIRMED: ["PIN_PENDING", "FAILED", "CANCELLED", "TIMEOUT"],
  PIN_PENDING: ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"],
  COMPLETED: [], // Terminal
  FAILED: ["INITIATED"], // Can retry
  CANCELLED: [], // Terminal
  TIMEOUT: [], // Terminal
};

export class TransactionChecklistManager {
  public static getChecklist(session?: TransactionSession | null): TransactionChecklist {
    if (!session) {
      return {
        language: false,
        service: false,
        network: false,
        recipient: false,
        amount: false,
        referenceKyc: false,
        pinGatePassed: false,
        transactionInitiated: false,
        stateReported: false,
      };
    }

    return {
      language: session.language === "en" || session.language === "twi",
      service: Boolean(session.serviceSelected),
      network: session.network !== null && session.network !== undefined,
      recipient: Boolean(session.recipientPhone && session.recipientPhone.length === 10),
      amount: typeof session.amount === "number" && session.amount > 0,
      referenceKyc: Boolean(session.isRecipientVerified && session.recipientName),
      pinGatePassed: Boolean(session.pinGatePassed || session.state === "PIN_PENDING" || session.state === "CONFIRMED"),
      transactionInitiated: Boolean(session.transactionInitiated || session.state === "COMPLETED"),
      stateReported: Boolean(session.stateReported || session.completedAt),
    };
  }

  public static canInitiateTransaction(session?: TransactionSession | null): { allowed: boolean; missingStage?: string } {
    const list = this.getChecklist(session);
    if (!list.language) return { allowed: false, missingStage: "Language (Stage 1)" };
    if (!list.service) return { allowed: false, missingStage: "Service (Stage 2)" };
    if (!list.network) return { allowed: false, missingStage: "Networks (Stage 3)" };
    if (!list.recipient) return { allowed: false, missingStage: "Recipient (Stage 4)" };
    if (!list.amount) return { allowed: false, missingStage: "Amount (Stage 5)" };
    if (!list.referenceKyc) return { allowed: false, missingStage: "Check for Reference Telco KYC (Stage 6)" };
    if (!list.pinGatePassed) return { allowed: false, missingStage: "Pin Gate Security (Stage 7)" };
    return { allowed: true };
  }
}

export class TransactionStateMachine {
  private store: DurableTransactionStore;

  constructor(customStore?: DurableTransactionStore) {
    this.store = customStore || durableTransactionStore;
  }

  public getOrCreateSession(
    sessionId: string,
    language: "en" | "twi" | null = null,
    source: "VOICE" | "KEYPAD" = "VOICE"
  ): TransactionSession {
    const existing = this.store.getSession(sessionId);
    if (existing) {
      existing.updatedAt = Date.now();
      if (language && !existing.language) {
        existing.language = language;
      }
      this.store.saveSession(existing);
      return existing;
    }

    const referenceId = generateTransactionReference();
    const idempotencyKey = `idemp_${sessionId}_${referenceId}`;

    const newSession: TransactionSession = {
      sessionId,
      idempotencyKey,
      source,
      language: language || null,
      network: null, // Strict: No default network
      recipientPhone: null,
      recipientName: null,
      isRecipientVerified: false,
      amount: null,
      state: "INITIATED",
      referenceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      serviceSelected: false,
      pinGatePassed: false,
      transactionInitiated: false,
      stateReported: false,
    };

    this.store.saveSession(newSession);
    return newSession;
  }

  public getChecklist(sessionId: string): TransactionChecklist {
    const session = this.getSession(sessionId);
    return TransactionChecklistManager.getChecklist(session);
  }

  public canInitiateTransaction(sessionId: string): { allowed: boolean; missingStage?: string } {
    const session = this.getSession(sessionId);
    return TransactionChecklistManager.canInitiateTransaction(session);
  }

  public getSession(sessionId: string): TransactionSession | undefined {
    return this.store.getSession(sessionId);
  }

  public getSessionByIdempotencyKey(key: string): TransactionSession | undefined {
    return this.store.getSessionByIdempotencyKey(key);
  }

  public recordConfirmationReadback(sessionId: string, fingerprint: string): void {
    const session = this.store.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.confirmationReadbackFingerprint = fingerprint;
    session.confirmationReadbackAt = Date.now();
    session.updatedAt = Date.now();
    this.store.saveSession(session);
  }

  public transition(
    sessionId: string,
    targetState: TransactionState,
    payload?: Partial<TransactionSession>
  ): TransactionSession {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Terminal states cannot transition
    if (session.state === "COMPLETED" || session.state === "CANCELLED" || session.state === "TIMEOUT") {
      if (session.state === targetState) {
        return session; // Idempotent no-op
      }
      throw new Error(`Cannot transition from terminal state ${session.state} to ${targetState}`);
    }

    const allowed = VALID_TRANSITIONS[session.state];
    if (!allowed.includes(targetState) && session.state !== targetState) {
      throw new Error(
        `Invalid state transition: ${session.state} -> ${targetState}. Allowed: [${allowed.join(", ")}]`
      );
    }

    // Apply payload updates
    if (payload) {
      if (payload.recipientPhone !== undefined) session.recipientPhone = payload.recipientPhone;
      if (payload.recipientName !== undefined) session.recipientName = payload.recipientName;
      if (payload.isRecipientVerified !== undefined) session.isRecipientVerified = payload.isRecipientVerified;
      if (payload.amount !== undefined) session.amount = payload.amount;
      if (payload.network !== undefined) session.network = payload.network;
      if (payload.callerPhone !== undefined) session.callerPhone = payload.callerPhone;
      if (payload.momoReferenceId !== undefined) session.momoReferenceId = payload.momoReferenceId;
      if (payload.failureReason !== undefined) session.failureReason = payload.failureReason;
      if (payload.language !== undefined) session.language = payload.language;
      if (payload.interactionMode !== undefined) session.interactionMode = payload.interactionMode;
    }

    session.state = targetState;
    session.updatedAt = Date.now();

    if (targetState === "COMPLETED" || targetState === "FAILED" || targetState === "CANCELLED") {
      session.completedAt = Date.now();
    }

    this.store.saveSession(session);
    console.log(`[StateMachine] Session ${sessionId} [Ref: ${session.referenceId}] -> ${targetState}`);
    return session;
  }

  public getAllSessions(): TransactionSession[] {
    return this.store.getAllSessions();
  }

  public deleteSession(sessionId: string): void {
    this.store.deleteSession(sessionId);
  }
}

export const transactionStateMachine = new TransactionStateMachine();
