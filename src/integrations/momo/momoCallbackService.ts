/**
 * Ɔkwankyerɛfo Pa - MTN MoMo Webhook & Callback Service
 * 
 * Responsibilities:
 * - Receive and validate MTN MoMo async payment webhooks (RequestToPay & Transfer)
 * - Map incoming sandbox events directly to canonical Akan Twi & English studio audio
 * - Maintain an in-memory observable feed buffer for dashboard & live monitoring
 * - Provide async wait/promise resolution for active telephony keep-alive polling loops
 * - Notify registered subscribers (transaction state machines, sagas, telephony gateways)
 */

import {
  resolveMomoAudioFeed,
  MomoFeedAudioMatch,
  NormalizedMomoFeedStatus,
  normalizeMomoStatus,
} from "../../audio/momoAudioFeedResolver";

export interface WebhookUpdateHandler {
  (referenceId: string, status: string, financialTransactionId?: string, rawPayload?: any): Promise<void> | void;
}

export interface MomoWebhookFeedItem {
  id: string;
  referenceId: string;
  rawStatus: string;
  normalizedStatus: NormalizedMomoFeedStatus;
  financialTransactionId?: string | null;
  reason?: string;
  amount?: number;
  currency?: string;
  payerPhone?: string;
  receivedAt: string;
  rawPayload: any;
  audioMatchTwi: MomoFeedAudioMatch;
  audioMatchEn: MomoFeedAudioMatch;
}

export class MoMoCallbackService {
  private handlers: Set<WebhookUpdateHandler> = new Set();
  private feedHistory: MomoWebhookFeedItem[] = [];
  private static readonly MAX_HISTORY = 60;
  private waitingPromises: Map<string, Array<(item: MomoWebhookFeedItem) => void>> = new Map();

  /**
   * Registers a callback handler for transaction updates
   */
  public onTransactionUpdate(handler: WebhookUpdateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /**
   * Retrieves recent inbound webhook feed items with matched studio audio
   */
  public getRecentFeedItems(): MomoWebhookFeedItem[] {
    return [...this.feedHistory];
  }

  /**
   * Finds latest feed item by reference ID
   */
  public getLatestFeedItem(referenceId: string): MomoWebhookFeedItem | undefined {
    return this.feedHistory.find(
      (item) => item.referenceId === referenceId || item.rawPayload?.externalId === referenceId
    );
  }

  /**
   * Clears in-memory feed history (useful for test isolation)
   */
  public clearFeedHistory(): void {
    this.feedHistory = [];
  }

  /**
   * Wait asynchronously for a specific reference ID to receive a webhook event
   */
  public async waitForStatus(referenceId: string, timeoutMs: number = 25000): Promise<MomoWebhookFeedItem | null> {
    // Check if an event already arrived
    const existing = this.getLatestFeedItem(referenceId);
    if (existing && existing.normalizedStatus !== "PENDING") {
      return existing;
    }

    return new Promise<MomoWebhookFeedItem | null>((resolve) => {
      let timer: NodeJS.Timeout | null = null;

      const callback = (item: MomoWebhookFeedItem) => {
        if (timer) clearTimeout(timer);
        resolve(item);
      };

      const listeners = this.waitingPromises.get(referenceId) || [];
      listeners.push(callback);
      this.waitingPromises.set(referenceId, listeners);

      timer = setTimeout(() => {
        const remaining = (this.waitingPromises.get(referenceId) || []).filter((cb) => cb !== callback);
        if (remaining.length > 0) {
          this.waitingPromises.set(referenceId, remaining);
        } else {
          this.waitingPromises.delete(referenceId);
        }
        resolve(this.getLatestFeedItem(referenceId) || null);
      }, timeoutMs);
    });
  }

  /**
   * Handles inbound webhook payload from MTN MoMo Gateway
   */
  public async handleWebhook(
    payload: any,
    referenceHeader?: string
  ): Promise<{ success: boolean; referenceId: string | null; feedItem?: MomoWebhookFeedItem }> {
    const referenceId =
      referenceHeader ||
      payload?.referenceId ||
      payload?.externalId;

    if (!referenceId) {
      console.warn("[MoMoCallbackService] Webhook received without reference ID:", payload);
      return { success: false, referenceId: null };
    }

    const rawStatus = (payload?.status || "UNKNOWN").toUpperCase();
    const financialTxId = payload?.financialTransactionId || null;
    const reason = payload?.reason || payload?.reasonCode || payload?.message || undefined;
    const amount = payload?.amount ? parseFloat(payload.amount) : undefined;
    const currency = payload?.currency || "EUR";
    const payerPhone = payload?.payer?.partyId || payload?.payerPhone;

    // Resolve studio recordings for both Twi and English
    const audioMatchTwi = resolveMomoAudioFeed(rawStatus, reason, "twi", "", {
      amount,
      referenceId,
    });
    const audioMatchEn = resolveMomoAudioFeed(rawStatus, reason, "en", "", {
      amount,
      referenceId,
    });

    const feedItem: MomoWebhookFeedItem = {
      id: `momo_feed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      referenceId,
      rawStatus,
      normalizedStatus: audioMatchTwi.normalizedStatus,
      financialTransactionId: financialTxId,
      reason,
      amount,
      currency,
      payerPhone,
      receivedAt: new Date().toISOString(),
      rawPayload: payload,
      audioMatchTwi,
      audioMatchEn,
    };

    // Prepend to history buffer
    this.feedHistory.unshift(feedItem);
    if (this.feedHistory.length > MoMoCallbackService.MAX_HISTORY) {
      this.feedHistory.pop();
    }

    console.log(
      `[MoMoCallbackService] Inbound feed matched: ref=${referenceId} status=${rawStatus} normalized=${feedItem.normalizedStatus} TwiAudio=[${audioMatchTwi.promptIds.join(",")}] EnAudio=[${audioMatchEn.promptIds.join(",")}]`
    );

    // Notify any waiting promises for this reference
    const waiting = this.waitingPromises.get(referenceId) || [];
    this.waitingPromises.delete(referenceId);
    for (const cb of waiting) {
      try {
        cb(feedItem);
      } catch (err: any) {
        console.error("[MoMoCallbackService] Error in waiting promise callback:", err.message);
      }
    }

    // Notify registered subscribers (transaction manager, sagas, etc.)
    for (const handler of this.handlers) {
      try {
        await handler(referenceId, rawStatus, financialTxId, payload);
      } catch (err: any) {
        console.error("[MoMoCallbackService] Handler error:", err.message);
      }
    }

    return { success: true, referenceId, feedItem };
  }
}

export const momoCallbackService = new MoMoCallbackService();
