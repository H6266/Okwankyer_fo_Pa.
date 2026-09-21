/**
 * Ɔkwankyerɛfo Pa - Service Orchestrator & Mock Transaction Pipeline
 * 
 * ARCHITECTURAL SEAM:
 * Both Voice Input and Keypad Input converge on this single pipeline.
 * Neither path may bypass this orchestrator.
 * 
 * NOTE: All telecom core integrations and bank APIs in this module are MOCK
 * implementations for the hackathon prototype.
 */

export interface TransactionRequest {
  source: "VOICE" | "KEYPAD";
  network: "MTN" | "Telecel" | "AT";
  recipient_phone: string;
  recipient_name: string;
  amount: number;
  currency?: "GHS";
  sessionId?: string;
  idempotencyKey?: string;
}

export interface TransactionResult {
  status: "SUCCESS" | "FAILED" | "PENDING";
  reference: string;
  amount: number;
  currency: string;
  recipient_name: string;
  recipient_phone: string;
  network: string;
  timestamp: string;
  message: string;
  spokenReceipt: string;
}

export interface AccountBalance {
  currency: string;
  balance: number;
  formatted: string;
  network: string;
}

class ServiceOrchestrator {
  // In-memory idempotency cache to prevent accidental double-billing
  private processedTransactions = new Map<string, TransactionResult>();
  private mockUserBalance: number = 2450.0;

  /**
   * Generates a unique, dynamic telecom transaction reference (e.g. OKP-847291)
   */
  private generateReference(): string {
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `OKP-${randomDigits}`;
  }

  /**
   * Executes SEND_MONEY transaction
   * Converged execution point for both voice and keypad
   */
  public async executeSendMoney(request: TransactionRequest): Promise<TransactionResult> {
    const { network, recipient_phone, recipient_name, amount, source } = request;

    // Idempotency check: hash of session + phone + amount
    const idempotencyKey =
      request.idempotencyKey ||
      `${request.sessionId || "global"}_${recipient_phone}_${amount}`;

    if (this.processedTransactions.has(idempotencyKey)) {
      const cached = this.processedTransactions.get(idempotencyKey)!;
      console.log(`[ServiceOrchestrator] Idempotent replay detected for ${idempotencyKey}`);
      return cached;
    }

    // Validation
    if (!recipient_phone || !recipient_name || !amount || amount <= 0) {
      throw new Error("Invalid transaction request: amount and recipient are required.");
    }

    // Create real-time dynamic timestamp
    const timestamp = new Date().toISOString();
    const reference = this.generateReference();
    const timeFormatted = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    // Deduct mock balance
    if (this.mockUserBalance >= amount) {
      this.mockUserBalance -= amount;
    }

    const last4 = recipient_phone.slice(-4).split("").join(" ");
    const spokenReceipt =
      `Thank you very much. You have successfully sent ${amount} Ghana Cedis to ${recipient_name}, phone number ending in ${last4}. ` +
      `Completed at ${timeFormatted}. Your transaction reference is ${reference.split("").join(" ")}. Would you like to do anything else today?`;

    const result: TransactionResult = {
      status: "SUCCESS",
      reference,
      amount,
      currency: "GHS",
      recipient_name,
      recipient_phone,
      network: network || "MTN",
      timestamp,
      message: `Transaction ${reference} completed via ${source}.`,
      spokenReceipt,
    };

    // Store in idempotency cache
    this.processedTransactions.set(idempotencyKey, result);

    console.log(
      `[ServiceOrchestrator] Transaction executed: ${reference} - GH₵${amount} to ${recipient_name} via ${source}`
    );

    return result;
  }

  /**
   * Retrieves mock account balance
   */
  public getAccountBalance(network: string = "MTN"): AccountBalance {
    return {
      currency: "GHS",
      balance: this.mockUserBalance,
      formatted: `${this.mockUserBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })} Ghana cedis`,
      network,
    };
  }

  /**
   * Resets mock balance for testing
   */
  public resetBalance(initial: number = 2450.0): void {
    this.mockUserBalance = initial;
    this.processedTransactions.clear();
  }
}

export const transactionOrchestrator = new ServiceOrchestrator();
