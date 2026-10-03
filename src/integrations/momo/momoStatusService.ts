/**
 * Ɔkwankyerɛfo Pa - MTN MoMo Status & Polling Service
 * 
 * Responsibilities:
 * - Query MTN transaction status (RequestToPay or Transfer)
 * - Poll pending transactions automatically
 * - Fire callbacks on state transitions
 */

import { momoAuthService, MoMoAuthService } from "./momoAuthService";

export interface ProviderStatusResult {
  referenceId: string;
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "TIMEOUT" | "UNKNOWN";
  financialTransactionId: string | null;
  amount?: string;
  currency?: string;
  rawResponse?: any;
}

export class MoMoStatusService {
  constructor(private readonly auth: MoMoAuthService = momoAuthService) {}

  /**
   * Queries status of RequestToPay from MTN Collections API
   */
  public async getRequestToPayStatus(referenceId: string): Promise<ProviderStatusResult> {
    const { baseUrl, targetEnv } = this.auth.getEnvironment();
    const token = await this.auth.getAccessToken("collection");
    const subKey = this.auth.getSubscriptionKey("collection");

    const url = `${baseUrl}/collection/v1_0/requesttopay/${referenceId}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Target-Environment": targetEnv,
        "Ocp-Apim-Subscription-Key": subKey,
        "User-Agent": "curl/7.88.1",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to query RequestToPay status (${res.status}): ${err}`);
    }

    const data = await res.json();
    return {
      referenceId,
      status: (data.status || "PENDING").toUpperCase() as any,
      financialTransactionId: data.financialTransactionId || null,
      amount: data.amount,
      currency: data.currency,
      rawResponse: data,
    };
  }

  /**
   * Queries status of Transfer from MTN Disbursements API
   */
  public async getTransferStatus(referenceId: string): Promise<ProviderStatusResult> {
    const { baseUrl, targetEnv } = this.auth.getEnvironment();
    const token = await this.auth.getAccessToken("disbursement");
    const subKey = this.auth.getSubscriptionKey("disbursement");

    const url = `${baseUrl}/disbursement/v1_0/transfer/${referenceId}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Target-Environment": targetEnv,
        "Ocp-Apim-Subscription-Key": subKey,
        "User-Agent": "curl/7.88.1",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to query Transfer status (${res.status}): ${err}`);
    }

    const data = await res.json();
    return {
      referenceId,
      status: (data.status || "PENDING").toUpperCase() as any,
      financialTransactionId: data.financialTransactionId || null,
      amount: data.amount,
      currency: data.currency,
      rawResponse: data,
    };
  }

  /**
   * Automatically polls status until transaction completes or reaches max attempts
   */
  public startPolling(
    referenceId: string,
    product: "collection" | "disbursement",
    onUpdate: (result: ProviderStatusResult) => void,
    maxAttempts: number = 20,
    intervalMs: number = 3000
  ): () => void {
    let attempts = 0;
    let stopped = false;

    const timer = setInterval(async () => {
      if (stopped) {
        clearInterval(timer);
        return;
      }
      attempts++;

      try {
        const result = product === "collection"
          ? await this.getRequestToPayStatus(referenceId)
          : await this.getTransferStatus(referenceId);

        onUpdate(result);

        if (result.status !== "PENDING" || attempts >= maxAttempts) {
          clearInterval(timer);
          if (attempts >= maxAttempts && result.status === "PENDING") {
            onUpdate({ ...result, status: "TIMEOUT" });
          }
        }
      } catch (err: any) {
        console.warn(`[MoMoStatusService] Polling warning for ${referenceId}:`, err.message);
        if (attempts >= maxAttempts) {
          clearInterval(timer);
        }
      }
    }, intervalMs);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }
}

export const momoStatusService = new MoMoStatusService();
