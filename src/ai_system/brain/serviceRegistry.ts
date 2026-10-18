/**
 * Ɔkwankyerɛfo Pa - Service Registry (serviceRegistry.ts)
 *
 * Separates what the caller might want (Taxonomy) from what is actually built and executable (Registry).
 * Enables modular service expansion without modifying the central brain reasoning loop.
 */

import { IntentId, ServiceDefinition, SlotSpec } from './types';
import { ALL_INTENTS } from './intentTaxonomy';
import { paymentSaga } from '../../integrations/momo/paymentSaga';

export class ServiceRegistry {
  private services = new Map<IntentId, ServiceDefinition>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    // 1. momo.transfer - status: 'ready'
    this.register({
      intent: 'momo.transfer',
      status: 'ready',
      requiredSlots: ALL_INTENTS['momo.transfer'].requiredSlots,
      handler: async (context: any) => {
        const slots = context?.slots || {};
        const amount = typeof slots.amount === 'number' ? slots.amount : 0;
        const recipientPhone = slots.recipient?.phone || slots.recipientPhone || '';
        const recipientName = slots.recipient?.name || slots.recipientName || 'Subscriber';
        const callerPhone = context?.callerNumber || '0244123456';
        const sagaResult = await paymentSaga.executeConfirmedTransferSaga({
          sessionId: context?.sessionId || 'session',
          senderPhone: callerPhone,
          recipientPhone,
          recipientName,
          amount,
          confirmedDraftHash: context?.confirmedDraftHash,
        });
        return {
          success: sagaResult.status === 'COMPLETED' || sagaResult.status === 'PENDING',
          result: sagaResult,
        };
      },
    });

    // 1b. momo.cash_out - status: 'ready' (Initiates Allow Cash-Out on subscriber wallet)
    this.register({
      intent: 'momo.cash_out',
      status: 'ready',
      requiredSlots: [],
      handler: async (context: any) => {
        const callerPhone = String(context?.callerNumber || "").trim();
        if (!callerPhone) {
          throw new Error("Missing caller phone number to enable Cash-Out.");
        }
        const { cashOutService } = await import('../../services/cashOutService');
        const state = cashOutService.enableCashOut(callerPhone);
        return {
          success: true,
          result: state,
        };
      },
    });

    // 2. Personal subscriber balance check (requires secure handset/PIN verification)
    this.register({
      intent: 'momo.check_balance',
      status: 'ready',
      requiredSlots: [],
      handler: async (context: any) => {
        if (!context?.confirmedOnHandset && !context?.pin) {
          return {
            success: false,
            error: 'PIN_REQUIRED_FOR_BALANCE_CHECK',
            result: { requiresSecureVerification: true },
          };
        }
        const { mtnMomoService } = await import('../../modules/mtnMomoService');
        const bal = await mtnMomoService.getAccountBalance();
        return {
          success: true,
          result: { balance: bal.availableBalance, currency: bal.currency },
        };
      },
    });

    // 3. momo.buy_airtime (Not ready in v1)
    this.register({
      intent: 'momo.buy_airtime',
      status: 'not_ready',
      requiredSlots: ALL_INTENTS['momo.buy_airtime'].requiredSlots,
      notReadyMessageKey: 'airtime_not_ready',
    });

    // 4. momo.pay_bill (Not ready in v1)
    this.register({
      intent: 'momo.pay_bill',
      status: 'not_ready',
      requiredSlots: ALL_INTENTS['momo.pay_bill'].requiredSlots,
      notReadyMessageKey: 'bill_pay_not_ready',
    });

    // 5. momo.buy_data (Not ready in voice IVR - directs to *170#)
    this.register({
      intent: 'momo.buy_data',
      status: 'not_ready',
      requiredSlots: ALL_INTENTS['momo.buy_data'].requiredSlots,
      notReadyMessageKey: 'dial_170_buy_data',
    });

    // 6. momo.reverse_transaction (Not ready in voice IVR - directs to telco support)
    this.register({
      intent: 'momo.reverse_transaction',
      status: 'not_ready',
      requiredSlots: [],
      notReadyMessageKey: 'dial_100_reversal',
    });

    // 7. momo.customer_care (Not ready in automated IVR - routes to human agent 100)
    this.register({
      intent: 'momo.customer_care',
      status: 'not_ready',
      requiredSlots: [],
      notReadyMessageKey: 'dial_100_customer_care',
    });

    // 8. momo.loan (Not ready in voice IVR - directs to *170#)
    this.register({
      intent: 'momo.loan',
      status: 'not_ready',
      requiredSlots: [],
      notReadyMessageKey: 'dial_170_loan',
    });

    // 9. smalltalk (Built-in conversational handling)
    this.register({
      intent: 'smalltalk',
      status: 'ready',
      requiredSlots: [],
      handler: async () => ({
        success: true,
        result: { acknowledged: true },
      }),
    });
  }

  /**
   * Registers or updates a service definition.
   */
  public register(service: ServiceDefinition): void {
    this.services.set(service.intent, service);
  }

  /**
   * Retrieves the service definition for an intent, if registered.
   */
  public get(intent: IntentId): ServiceDefinition | undefined {
    return this.services.get(intent);
  }

  /**
   * Checks whether a registered intent is status: 'ready'.
   */
  public isReady(intent: IntentId): boolean {
    const service = this.services.get(intent);
    return service?.status === 'ready';
  }

  /**
   * Returns required slots for an intent from registry or taxonomy fallback.
   */
  public getRequiredSlots(intent: IntentId): SlotSpec[] {
    const service = this.services.get(intent);
    if (service) return service.requiredSlots;
    return ALL_INTENTS[intent]?.requiredSlots || [];
  }

  /**
   * Lists all currently registered services.
   */
  public getAll(): ServiceDefinition[] {
    return Array.from(this.services.values());
  }

  /**
   * Resets registry to clean defaults (useful in test isolation).
   */
  public resetToDefaults(): void {
    this.services.clear();
    this.registerDefaults();
  }
}

export const serviceRegistry = new ServiceRegistry();
