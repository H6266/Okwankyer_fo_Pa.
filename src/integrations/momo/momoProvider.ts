/**
 * Ɔkwankyerɛfo Pa - Centralized MomoProvider Facade
 * 
 * Unified interface encapsulating all MTN Mobile Money sub-services:
 * - momoAuthService
 * - momoAccountService
 * - momoTransactionService
 * - momoStatusService
 * - momoCallbackService
 * 
 * Used identically across:
 * 1. Web Dashboard (MoMo Laboratory)
 * 2. IVR / DTMF Telephony
 * 3. AI Voice Agent
 */

import { momoAuthService, MoMoAuthService } from "./momoAuthService";
import { momoAccountService, MoMoAccountService } from "./momoAccountService";
import { momoTransactionService, MoMoTransactionService } from "./momoTransactionService";
import { momoStatusService, MoMoStatusService, ProviderStatusResult } from "./momoStatusService";
import { momoCallbackService, MoMoCallbackService } from "./momoCallbackService";
import {
  InternalTransaction,
  RecipientLookupResult,
  CreateTransactionOptions,
  MoMoBalance,
} from "./momoTypes";

export class MomoProvider {
  public readonly auth: MoMoAuthService;
  public readonly account: MoMoAccountService;
  public readonly transaction: MoMoTransactionService;
  public readonly status: MoMoStatusService;
  public readonly callback: MoMoCallbackService;

  constructor(
    auth: MoMoAuthService = momoAuthService,
    account: MoMoAccountService = momoAccountService,
    transaction: MoMoTransactionService = momoTransactionService,
    status: MoMoStatusService = momoStatusService,
    callback: MoMoCallbackService = momoCallbackService
  ) {
    this.auth = auth;
    this.account = account;
    this.transaction = transaction;
    this.status = status;
    this.callback = callback;
  }

  /**
   * Recipient lookup: validates active status and retrieves KYC name from MTN API
   */
  public async lookupRecipient(phone: string): Promise<RecipientLookupResult> {
    return this.account.lookupRecipient(phone);
  }

  /**
   * Initializes internal transaction object
   */
  public createTransaction(options: CreateTransactionOptions): InternalTransaction {
    return this.transaction.createTransaction(options);
  }

  /**
   * Validates recipient and moves transaction to READY_FOR_CONFIRMATION
   */
  public async validateRecipient(transactionId: string, phone?: string): Promise<InternalTransaction> {
    return this.transaction.validateRecipient(transactionId, phone);
  }

  /**
   * Confirms or cancels the transaction preview
   */
  public confirmTransaction(transactionId: string, confirmed: boolean): InternalTransaction {
    return this.transaction.confirmTransaction(transactionId, confirmed);
  }

  /**
   * Submits transaction to MTN API (Disbursement or RequestToPay)
   */
  public async submitTransaction(
    transactionId: string,
    options?: {
      mode?: "COLLECTION_REQUEST_TO_PAY" | "DISBURSEMENT_TRANSFER";
      payerPhone?: string;
    }
  ): Promise<InternalTransaction> {
    return this.transaction.submitTransaction(transactionId, options);
  }

  /**
   * Retrieves transaction by internal ID or MTN reference ID
   */
  public getTransaction(id: string): InternalTransaction | null {
    return this.transaction.getTransaction(id);
  }

  /**
   * Retrieves transaction status by MTN reference ID
   */
  public async getTransactionStatus(id: string): Promise<ProviderStatusResult> {
    try {
      return await this.status.getRequestToPayStatus(id);
    } catch {
      return await this.status.getTransferStatus(id);
    }
  }

  /**
   * Retrieves balance from MTN
   */
  public async getAccountBalance(product: "collection" | "disbursement" = "disbursement"): Promise<MoMoBalance> {
    return this.account.getAccountBalance(product);
  }

  /**
   * Switches target environment (sandbox vs production)
   */
  public setTargetEnv(env: "sandbox" | "production"): void {
    this.auth.setTargetEnv(env);
  }

  /**
   * Returns system diagnostics
   */
  public getDiagnostics() {
    const env = this.auth.getEnvironment();
    const hasDisb = this.auth.isConfigured("disbursement");
    const hasColl = this.auth.isConfigured("collection");

    return {
      environment: env.targetEnv,
      baseUrl: env.baseUrl,
      currency: env.currency,
      disbursementConfigured: hasDisb,
      collectionConfigured: hasColl,
      totalTransactions: this.transaction.getAllTransactions().length,
      recentTransactions: this.transaction.getAllTransactions().slice(0, 10),
    };
  }
}

export const momoProvider = new MomoProvider();
export default momoProvider;
