/**
 * Ɔkwankyerɛfo Pa - MoMo Transfer Service Module (src/services/momo/transfer/index.ts)
 * 
 * Implements validation, slot specification, and handoff to PaymentSaga.
 */

import { SlotSpec, ServiceHandler, ServiceHandlerResult } from '../../../ai_system/brain/types';
import { PaymentSagaOrchestrator } from '../../../integrations/momo/paymentSaga';
import { validateGhanaPhoneNumber } from '../../../domain/validation';
import { financialPolicy } from '../../../ai_system/core/financialPolicy';

export const TRANSFER_REQUIRED_SLOTS: SlotSpec[] = [
  { name: 'amount', type: 'amount', required: true, description: 'Amount in Ghana Cedis (GHS)' },
  { name: 'recipient', type: 'recipient', required: true, description: 'Recipient information with phone number' },
];

export const TRANSFER_OPTIONAL_SLOTS: SlotSpec[] = [
  { name: 'network', type: 'network', required: false, description: 'MTN, Telecel, or AT' },
];

export const momoTransferHandler: ServiceHandler = async (params): Promise<ServiceHandlerResult> => {
  const { slots, callerNumber, dispatchKey } = params;
  const amount = Number(slots.amount);
  const recipientPhone = String(slots.recipient?.phone || '').trim();
  const recipientName = String(slots.recipient?.name || 'Recipient').trim();
  const network = (slots.network || 'MTN') as 'MTN' | 'Telecel' | 'AT';
  const senderPhone = callerNumber || '0553838464';

  // 1. Validate phone number
  const phoneVal = validateGhanaPhoneNumber(recipientPhone);
  if (!phoneVal.valid) {
    return {
      success: false,
      error: `INVALID_RECIPIENT_PHONE: ${phoneVal.error || 'Invalid phone format'}`,
    };
  }

  // 2. Validate financial policy (GHS 1 - 5000)
  const policy = financialPolicy.validateExecution({
    operation: 'TRANSFER',
    sessionId: params.sessionId || 'SAGA_TRANSFER',
    senderPhone,
    recipientPhone: phoneVal.normalized,
    amount,
    currency: 'GHS',
    network,
    recipientName,
  });

  if (!policy.allowed) {
    return {
      success: false,
      error: policy.reason || 'FINANCIAL_POLICY_REJECTED',
    };
  }

  // 3. Authoritative Payment Saga Handoff with Dispatch Key Idempotency
  try {
    const saga = PaymentSagaOrchestrator.getInstance();
    const dispatchKey = params.dispatchKey || `${params.sessionId || 'session'}:${params.confirmedDraftHash || 'confirmed'}`;
    const draft = saga.createDraft({
      senderPhone,
      recipientPhone: phoneVal.normalized,
      amount,
      network,
      clientNonce: dispatchKey,
    });

    return {
      success: true,
      result: {
        sagaId: draft.sagaId,
        idempotencyKey: draft.idempotencyKey,
        dispatchKey,
        state: draft.state,
        amount,
        recipientPhone: phoneVal.normalized,
        recipientName,
        network,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'PAYMENT_SAGA_CREATION_FAILED',
    };
  }
};
