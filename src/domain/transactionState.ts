export type TransactionStatus =
  | "INITIATED"
  | "RECIPIENT_VERIFIED"
  | "AMOUNT_ENTERED"
  | "CONFIRMED"
  | "PIN_PENDING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "TIMEOUT";

export class TransactionStateMachine {
  private readonly idempotencyKeys = new Set<string>();
  currentState: TransactionStatus = "INITIATED";

  constructor(private readonly key: string) {
    this.idempotencyKeys.add(key);
  }

  begin(): void {
    this.currentState = "INITIATED";
    this.idempotencyKeys.add(this.key);
  }

  setRecipientVerified(): void {
    this.currentState = "RECIPIENT_VERIFIED";
  }

  setAmountEntered(): void {
    this.currentState = "AMOUNT_ENTERED";
  }

  confirm(): void {
    this.currentState = "CONFIRMED";
  }

  pinPending(): void {
    this.currentState = "PIN_PENDING";
  }

  complete(): void {
    this.currentState = "COMPLETED";
  }

  fail(): void {
    this.currentState = "FAILED";
  }

  cancel(): void {
    this.currentState = "CANCELLED";
  }

  timeout(): void {
    this.currentState = "TIMEOUT";
  }

  isDuplicate(candidate: string): boolean {
    return this.idempotencyKeys.has(candidate);
  }
}
