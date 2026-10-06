/**
 * Ɔkwankyerɛfo Pa - MoMo Services Registration (src/services/momo/index.ts)
 * 
 * Registers MoMo intents with the central Service Registry.
 */

import { serviceRegistry } from '../../ai_system/brain/serviceRegistry';
import { momoTransferHandler, TRANSFER_REQUIRED_SLOTS } from './transfer';

export function registerMomoServices(): void {
  // 1. momo.transfer - status: 'ready'
  serviceRegistry.register({
    intent: 'momo.transfer',
    status: 'ready',
    requiredSlots: TRANSFER_REQUIRED_SLOTS,
    handler: momoTransferHandler,
  });

  // 2. momo.check_balance - status: 'not_ready' (Truth Engine / Zero-PIN enforces *170# dial)
  serviceRegistry.register({
    intent: 'momo.check_balance',
    status: 'not_ready',
    requiredSlots: [],
    notReadyMessageKey: 'dial_170_check_balance',
  });

  // 3. momo.buy_airtime - status: 'not_ready'
  serviceRegistry.register({
    intent: 'momo.buy_airtime',
    status: 'not_ready',
    requiredSlots: [
      { name: 'amount', type: 'amount', required: true, description: 'Airtime amount' },
      { name: 'recipientPhone', type: 'phone', required: true, description: 'Recipient phone' },
    ],
    notReadyMessageKey: 'airtime_not_ready',
  });

  // 4. momo.pay_bill - status: 'not_ready'
  serviceRegistry.register({
    intent: 'momo.pay_bill',
    status: 'not_ready',
    requiredSlots: [
      { name: 'biller', type: 'string', required: true, description: 'Utility provider' },
      { name: 'accountNumber', type: 'string', required: true, description: 'Account/meter number' },
      { name: 'amount', type: 'amount', required: true, description: 'Amount to pay' },
    ],
    notReadyMessageKey: 'bill_pay_not_ready',
  });

  // 5. momo.buy_data - status: 'not_ready'
  serviceRegistry.register({
    intent: 'momo.buy_data',
    status: 'not_ready',
    requiredSlots: [
      { name: 'amount', type: 'amount', required: true, description: 'Bundle cost in GHS' },
    ],
    notReadyMessageKey: 'not_ready_buy_data',
  });

  // 6. momo.reverse_transaction - status: 'not_ready'
  serviceRegistry.register({
    intent: 'momo.reverse_transaction',
    status: 'not_ready',
    requiredSlots: [],
    notReadyMessageKey: 'not_ready_reverse_transaction',
  });

  // 7. momo.customer_care - status: 'not_ready'
  serviceRegistry.register({
    intent: 'momo.customer_care',
    status: 'not_ready',
    requiredSlots: [],
    notReadyMessageKey: 'not_ready_customer_care',
  });

  // 8. momo.loan - status: 'not_ready'
  serviceRegistry.register({
    intent: 'momo.loan',
    status: 'not_ready',
    requiredSlots: [],
    notReadyMessageKey: 'not_ready_loan',
  });
}

// Auto-register upon import
registerMomoServices();
