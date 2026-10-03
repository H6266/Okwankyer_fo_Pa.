/**
 * Ɔkwankyerɛfo Pa - MTN MoMo Webhook & Callback Service
 * 
 * Responsibilities:
 * - Receive and validate MTN MoMo async payment webhooks
 * - Update status of internal transactions
 * - Notify real-time listeners
 */

export interface WebhookUpdateHandler {
  (referenceId: string, status: string, financialTransactionId?: string, rawPayload?: any): Promise<void> | void;
}

export class MoMoCallbackService {
  private handlers: Set<WebhookUpdateHandler> = new Set();

  /**
   * Registers a callback handler for transaction updates
   */
  public onTransactionUpdate(handler: WebhookUpdateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Handles inbound webhook payload from MTN
   */
  public async handleWebhook(payload: any, referenceHeader?: string): Promise<{ success: boolean; referenceId: string | null }> {
    const referenceId =
      referenceHeader ||
      payload?.referenceId ||
      payload?.externalId ||
      payload?.payer?.partyId;

    if (!referenceId) {
      console.warn("[MoMoCallbackService] Webhook received without reference ID:", payload);
      return { success: false, referenceId: null };
    }

    const rawStatus = (payload?.status || "UNKNOWN").toUpperCase();
    const financialTxId = payload?.financialTransactionId || null;

    console.log(`[MoMoCallbackService] Webhook received for ${referenceId} -> Status: ${rawStatus}`);

    for (const handler of this.handlers) {
      try {
        await handler(referenceId, rawStatus, financialTxId, payload);
      } catch (err: any) {
        console.error("[MoMoCallbackService] Handler error:", err.message);
      }
    }

    return { success: true, referenceId };
  }
}

export const momoCallbackService = new MoMoCallbackService();
