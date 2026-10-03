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

export interface TransactionSession {
  sessionId: string;
  idempotencyKey: string;
  source: "VOICE" | "KEYPAD";
  language: "en" | "twi";
  network: GhanaianNetwork;
  callerPhone?: string;
  recipientPhone: string | null;
  recipientName: string | null;
  isRecipientVerified: boolean;
  amount: number | null;
  state: TransactionState;
  referenceId: string;
  momoReferenceId?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  failureReason?: string;
  retryCount: number;
}

const VALID_TRANSITIONS: Record<TransactionState, TransactionState[]> = {
  INITIATED: ["RECIPIENT_VERIFIED", "CANCELLED", "TIMEOUT"],
  RECIPIENT_VERIFIED: ["AMOUNT_ENTERED", "RECIPIENT_VERIFIED", "CANCELLED", "TIMEOUT"],
  AMOUNT_ENTERED: ["CONFIRMED", "AMOUNT_ENTERED", "RECIPIENT_VERIFIED", "CANCELLED", "TIMEOUT"],
  CONFIRMED: ["PIN_PENDING", "FAILED", "CANCELLED", "TIMEOUT"],
  PIN_PENDING: ["COMPLETED", "FAILED", "CANCELLED", "TIMEOUT"],
  COMPLETED: [], // Terminal
  FAILED: ["INITIATED"], // Can retry
  CANCELLED: [], // Terminal
  TIMEOUT: [], // Terminal
};

export class TransactionStateMachine {
  private sessions = new Map<string, TransactionSession>();
  private idempotencyIndex = new Map<string, string>(); // idempotencyKey -> sessionId

  public getOrCreateSession(
    sessionId: string,
    language: "en" | "twi" = "en",
    source: "VOICE" | "KEYPAD" = "VOICE"
  ): TransactionSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.updatedAt = Date.now();
      return existing;
    }

    const referenceId = generateTransactionReference();
    const idempotencyKey = `idemp_${sessionId}_${referenceId}`;

    const newSession: TransactionSession = {
      sessionId,
      idempotencyKey,
      source,
      language,
      network: "MTN",
      recipientPhone: null,
      recipientName: null,
      isRecipientVerified: false,
      amount: null,
      state: "INITIATED",
      referenceId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
    };

    this.sessions.set(sessionId, newSession);
    this.idempotencyIndex.set(idempotencyKey, sessionId);
    return newSession;
  }

  public getSession(sessionId: string): TransactionSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getSessionByIdempotencyKey(key: string): TransactionSession | undefined {
    const sessionId = this.idempotencyIndex.get(key);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  public transition(
    sessionId: string,
    targetState: TransactionState,
    payload?: Partial<TransactionSession>
  ): TransactionSession {
    const session = this.sessions.get(sessionId);
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
    }

    session.state = targetState;
    session.updatedAt = Date.now();

    if (targetState === "COMPLETED" || targetState === "FAILED" || targetState === "CANCELLED") {
      session.completedAt = Date.now();
    }

    console.log(`[StateMachine] Session ${sessionId} [Ref: ${session.referenceId}] -> ${targetState}`);
    return session;
  }

  public getAllSessions(): TransactionSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
}

export const transactionStateMachine = new TransactionStateMachine();
