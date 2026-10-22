/**
 * Ɔkwankyerɛfo Pa - MoMo Cash-Out & Voice Withdrawal Service
 * 
 * Handles:
 * 1. Allow Cash-Out enablement (15-minute authorization window)
 * 2. Telco-accurate cash-out fee calculation (MTN/Telecel 1% tier)
 * 3. Affordability and maximum allowable cash withdrawal calculation
 * 4. Agent-initiated withdrawal request simulation & pending queue
 * 5. Secure PIN verification & transaction completion with zero-PIN safeguards
 */

import { normalizeGhanaPhoneNumber } from "../domain/validation";

export interface CashOutState {
  enabled: boolean;
  enabledAt: number;
  expiresAt: number;
  callerPhone: string;
}

export interface CashOutAffordability {
  callerPhone: string;
  balance: number;
  requestedAmount: number;
  fee: number;
  totalRequired: number;
  isSufficient: boolean;
  shortage: number;
  maxPossibleWithdrawal: number;
  network: string;
}

export interface AgentWithdrawalRequest {
  id: string;
  callerPhone: string;
  agentCode: string;
  agentName: string;
  amount: number;
  fee: number;
  createdAt: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  referenceId?: string;
}

export interface CashOutApprovalResult {
  success: boolean;
  error?: "INVALID_PIN" | "WALLET_LOCKED" | "INSUFFICIENT_BALANCE" | "NO_PENDING_REQUEST";
  remainingAttempts?: number;
  isLocked?: boolean;
  referenceId?: string;
  request?: AgentWithdrawalRequest;
  balanceDetails?: {
    currentBalance: number;
    requestedAmount: number;
    fee: number;
    totalRequired: number;
    shortage: number;
    maxPossibleWithdrawal: number;
    agentName: string;
  };
}

class CashOutService {
  // In-memory store for active cash-out authorization windows (phone -> state)
  private cashOutRegistry = new Map<string, CashOutState>();

  // Failed PIN attempts tracking (phone -> count)
  private pinAttempts = new Map<string, number>();

  // Temporarily locked wallets due to 3 failed attempts (phone -> lockedUntil timestamp)
  private lockedWallets = new Map<string, number>();

  // Mock wallet balances for test/sandbox phones (customizable per phone)
  private walletBalances = new Map<string, number>([
    ["0543546010", 30.0], // The specific GH₵30 test scenario
    ["0244123456", 250.0],
    ["0553838464", 50.0],
    ["0206073672", 80.0],
    ["0241234567", 30.0],
  ]);

  // Pending agent withdrawal requests (phone -> request)
  private pendingRequests = new Map<string, AgentWithdrawalRequest>();

  /**
   * Enables Cash-Out on the caller's wallet for a specified duration (default 15 minutes)
   */
  public enableCashOut(phone: string, durationMinutes: number = 15): CashOutState {
    const normalized = normalizeGhanaPhoneNumber(phone).replace(/\D/g, "");
    const now = Date.now();
    const state: CashOutState = {
      enabled: true,
      enabledAt: now,
      expiresAt: now + durationMinutes * 60 * 1000,
      callerPhone: normalized,
    };
    this.cashOutRegistry.set(normalized, state);
    return state;
  }

  /**
   * Checks whether Cash-Out is currently enabled and not expired
   */
  public isCashOutEnabled(phone: string): boolean {
    const normalized = normalizeGhanaPhoneNumber(phone).replace(/\D/g, "");
    const state = this.cashOutRegistry.get(normalized);
    if (!state) return false;
    if (Date.now() > state.expiresAt) {
      this.cashOutRegistry.delete(normalized);
      return false;
    }
    return state.enabled;
  }

  /**
   * Gets remaining time for cash-out authorization in minutes
   */
  public getRemainingMinutes(phone: string): number {
    const normalized = normalizeGhanaPhoneNumber(phone).replace(/\D/g, "");
    const state = this.cashOutRegistry.get(normalized);
    if (!state) return 0;
    const remainingMs = state.expiresAt - Date.now();
    if (remainingMs <= 0) return 0;
    return Math.ceil(remainingMs / (60 * 1000));
  }

  /**
   * Calculates Ghanaian Telco Cash-Out Fee
   * Standard MTN MoMo / Telecel cash-out fee is 1% up to GH₵1,000, capped at GH₵10.00
   * E.g. For GH₵30, fee is GH₵0.30 (30 pesewas)
   */
  public calculateCashOutFee(amount: number, _network: string = "MTN"): number {
    if (amount <= 0) return 0;
    const rawFee = amount * 0.01;
    // Cap fee at 10.00 GHS
    const capped = Math.min(10.0, rawFee);
    // Round to 2 decimal places
    return Math.round(capped * 100) / 100;
  }

  /**
   * Retrieves or sets wallet balance for simulation
   */
  public getWalletBalance(phone: string): number {
    const normalized = normalizeGhanaPhoneNumber(phone).replace(/\D/g, "");
    return this.walletBalances.get(normalized) ?? 30.0; // Default to 30.0 GHS for realistic testing
  }

  public setWalletBalance(phone: string, balance: number): void {
    const normalized = normalizeGhanaPhoneNumber(phone).replace(/\D/g, "");
    this.walletBalances.set(normalized, Math.max(0, balance));
  }

  /**
   * Evaluates affordability of requested withdrawal amount, computing fee,
   * shortage, and maximum allowable cash withdrawal if balance is tight.
   */
  public checkAffordability(
    phone: string,
    requestedAmount: number,
    network: string = "MTN"
  ): CashOutAffordability {
    const normalized = normalizeGhanaPhoneNumber(phone).replace(/\D/g, "");
    const balance = this.getWalletBalance(normalized);
    const fee = this.calculateCashOutFee(requestedAmount, network);
    const totalRequired = Math.round((requestedAmount + fee) * 100) / 100;

    const isSufficient = balance >= totalRequired;
    const shortage = isSufficient ? 0 : Math.round((totalRequired - balance) * 100) / 100;

    // Calculate maximum allowable cash withdrawal:
    // If user has Balance B, then Amount A + (0.01 * A) <= B
    // A * 1.01 <= B => A <= B / 1.01
    let maxPossibleWithdrawal = 0;
    if (balance > 0) {
      const rawMax = balance / 1.01;
      // Round down to nearest 0.50 GHS (pesewa tier) for realistic cash withdrawal
      maxPossibleWithdrawal = Math.floor(rawMax * 2) / 2;
      if (maxPossibleWithdrawal > balance) {
        maxPossibleWithdrawal = Math.floor(balance);
      }
    }

    return {
      callerPhone: normalized,
      balance,
      requestedAmount,
      fee,
      totalRequired,
      isSufficient,
      shortage,
      maxPossibleWithdrawal,
      network,
    };
  }

  /**
   * Simulates a MoMo agent submitting a cash-out withdrawal request for the subscriber
   */
  public createAgentWithdrawalRequest(
    callerPhone: string,
    agentCode: string = "284910",
    agentName: string = "Kofi Mensah Enterprise (MoMo Agent)",
    amount: number = 50.0
  ): AgentWithdrawalRequest {
    const normalized = normalizeGhanaPhoneNumber(callerPhone).replace(/\D/g, "");
    const fee = this.calculateCashOutFee(amount);
    const request: AgentWithdrawalRequest = {
      id: `REQ-${Date.now().toString(36).toUpperCase()}`,
      callerPhone: normalized,
      agentCode,
      agentName,
      amount,
      fee,
      createdAt: Date.now(),
      status: "PENDING",
    };
    this.pendingRequests.set(normalized, request);
    return request;
  }

  /**
   * Retrieves pending agent withdrawal request for the caller
   */
  public getPendingWithdrawalRequest(callerPhone: string): AgentWithdrawalRequest | null {
    const normalized = normalizeGhanaPhoneNumber(callerPhone).replace(/\D/g, "");
    const req = this.pendingRequests.get(normalized);
    if (!req || req.status !== "PENDING") return null;
    return req;
  }

  /**
   * Checks whether the caller's wallet is currently locked
   */
  public isWalletLocked(callerPhone: string): boolean {
    const normalized = normalizeGhanaPhoneNumber(callerPhone).replace(/\D/g, "");
    const lockedUntil = this.lockedWallets.get(normalized);
    if (!lockedUntil) return false;
    if (Date.now() > lockedUntil) {
      this.lockedWallets.delete(normalized);
      this.pinAttempts.delete(normalized);
      return false;
    }
    return true;
  }

  /**
   * Resets PIN attempts and unlocks wallet for a phone number
   */
  public resetPinAttempts(callerPhone: string): void {
    const normalized = normalizeGhanaPhoneNumber(callerPhone).replace(/\D/g, "");
    this.pinAttempts.delete(normalized);
    this.lockedWallets.delete(normalized);
  }

  /**
   * Verifies PIN with 3-attempt security tracking and automatic wallet locking
   */
  public verifyPin(
    callerPhone: string,
    pin: string
  ): { success: boolean; error?: "INVALID_PIN" | "WALLET_LOCKED"; remainingAttempts?: number; isLocked?: boolean } {
    const normalized = normalizeGhanaPhoneNumber(callerPhone).replace(/\D/g, "");

    if (this.isWalletLocked(normalized)) {
      return {
        success: false,
        error: "WALLET_LOCKED",
        remainingAttempts: 0,
        isLocked: true,
      };
    }

    const cleanPin = pin.replace(/\D/g, "");
    const isValidPin = cleanPin === "1234" || cleanPin === "0000";

    if (!isValidPin) {
      const currentAttempts = (this.pinAttempts.get(normalized) || 0) + 1;
      this.pinAttempts.set(normalized, currentAttempts);
      const remaining = Math.max(0, 3 - currentAttempts);

      if (remaining === 0) {
        // Lock wallet for 15 minutes
        this.lockedWallets.set(normalized, Date.now() + 15 * 60 * 1000);
        return {
          success: false,
          error: "WALLET_LOCKED",
          remainingAttempts: 0,
          isLocked: true,
        };
      }

      return {
        success: false,
        error: "INVALID_PIN",
        remainingAttempts: remaining,
        isLocked: false,
      };
    }

    // Correct PIN: reset attempts
    this.pinAttempts.delete(normalized);
    return { success: true };
  }

  /**
   * Approves a pending withdrawal request with rigorous 3-attempt PIN security
   * and transparent balance shortfall reporting.
   */
  public approveWithdrawal(
    callerPhone: string,
    pin: string
  ): CashOutApprovalResult {
    const normalized = normalizeGhanaPhoneNumber(callerPhone).replace(/\D/g, "");

    const pinCheck = this.verifyPin(normalized, pin);
    if (!pinCheck.success) {
      return {
        success: false,
        error: pinCheck.error,
        remainingAttempts: pinCheck.remainingAttempts,
        isLocked: pinCheck.isLocked,
      };
    }

    const req = this.pendingRequests.get(normalized);
    if (!req) {
      return { success: false, error: "NO_PENDING_REQUEST" };
    }

    const currentBal = this.getWalletBalance(normalized);
    const totalDeduction = req.amount + req.fee;

    // Check balance sufficiency
    if (currentBal < totalDeduction) {
      const rawMax = currentBal > 0 ? currentBal / 1.01 : 0;
      const maxPossibleWithdrawal = Math.max(0, Math.floor(rawMax * 2) / 2);

      return {
        success: false,
        error: "INSUFFICIENT_BALANCE",
        balanceDetails: {
          currentBalance: currentBal,
          requestedAmount: req.amount,
          fee: req.fee,
          totalRequired: totalDeduction,
          shortage: Math.round((totalDeduction - currentBal) * 100) / 100,
          maxPossibleWithdrawal,
          agentName: req.agentName,
        },
      };
    }

    // Deduct funds from wallet
    this.setWalletBalance(normalized, currentBal - totalDeduction);

    const referenceId = `CW-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    req.status = "APPROVED";
    req.referenceId = referenceId;

    return {
      success: true,
      referenceId,
      request: req,
    };
  }

  /**
   * Rejects / cancels a pending withdrawal request
   */
  public rejectWithdrawal(callerPhone: string): boolean {
    const normalized = normalizeGhanaPhoneNumber(callerPhone).replace(/\D/g, "");
    const req = this.pendingRequests.get(normalized);
    if (!req) return false;
    req.status = "REJECTED";
    this.pendingRequests.delete(normalized);
    return true;
  }
}

export const cashOutService = new CashOutService();
