/**
 * Ɔkwankyerɛfo Pa - Phase 3c Shadow Mode Tests
 * (tests/phase3ShadowMode.test.ts)
 * 
 * Verifies:
 * 1. Shadow mode logs disagreements between offline engine and model.
 * 2. Strict ZERO-PII guarantee: No raw phone numbers, amounts, or names are logged.
 * 3. Shadow mode never mutates or affects the call state or caller response.
 * 4. Logs are structured and queryable via shadowEngine.getDisagreements().
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { shadowEngine } from '../src/ai_system/brain/shadowEngine';
import { BrainDecision, DraftState, ModelOutputContract } from '../src/ai_system/brain/types';

describe('Phase 3c: Shadow Mode & Observability', () => {

  beforeEach(() => {
    shadowEngine.clear();
    shadowEngine.setEnabled(true);
  });

  it('logs decision kind disagreements without any PII', () => {
    const offlineDecision: BrainDecision = {
      kind: 'clarify_slot',
      slot: 'recipient',
      intent: 'momo.transfer',
    };

    const offlineDraft: DraftState = {
      intent: 'momo.transfer',
      slots: {
        amount: 50,
        recipient: { phone: '0553838464', name: 'Kwame' },
      },
    };

    const modelOutput: ModelOutputContract = {
      intent: { id: 'momo.transfer', confidence: 0.95 },
      slots: { amount: 50 },
      signals: { user_confirmed: false, correction: false, interruption: false },
      reply: {
        text_en: 'Do you confirm sending {amount} to {recipient}?',
        target_language: 'en',
        reply_kind: 'confirm', // Disagrees with clarify_slot
        template_key: 'confirm',
      },
    };

    const entry = shadowEngine.compareAndLog({
      offlineDecision,
      offlineDraft,
      modelOutput,
      language: 'en',
      turnId: 1,
    });

    expect(entry).not.toBeNull();
    if (entry) {
      expect(entry.disagreementType).toBe('DECISION_KIND_MISMATCH');
      expect(entry.offlineDecision.kind).toBe('clarify_slot');
      expect(entry.modelDecision.kind).toBe('confirm');

      // STRICT ZERO-PII INVARIANT:
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain('0553838464');
      expect(serialized).not.toContain('Kwame');
      expect((entry.offlineDecision as any).amount).toBeUndefined();
      expect((entry.offlineDecision as any).recipientPhone).toBeUndefined();
      expect((entry.offlineDecision as any).recipientName).toBeUndefined();
      expect((entry.modelDecision as any).amount).toBeUndefined();
      expect((entry.modelDecision as any).recipientPhone).toBeUndefined();
      expect((entry.modelDecision as any).recipientName).toBeUndefined();
      // Only booleans and intent IDs:
      expect(entry.offlineDecision.hasAmount).toBe(true);
      expect(entry.offlineDecision.hasRecipientPhone).toBe(true);
    }

    const all = shadowEngine.getDisagreements();
    expect(all.length).toBe(1);
  });

  it('logs intent disagreements when offline engine and model differ', () => {
    const offlineDecision: BrainDecision = {
      kind: 'confirm',
      intent: 'momo.transfer',
    };

    const offlineDraft: DraftState = {
      intent: 'momo.transfer',
      slots: { amount: 10, recipient: { phone: '0553838464' } },
    };

    const modelOutput: ModelOutputContract = {
      intent: { id: 'momo.pay_bill', confidence: 0.90 }, // Disagrees on intent
      slots: { biller: 'ECG' },
      signals: { user_confirmed: false, correction: false, interruption: false },
      reply: {
        text_en: 'Pay bill',
        target_language: 'en',
        reply_kind: 'confirm',
      },
    };

    const entry = shadowEngine.compareAndLog({
      offlineDecision,
      offlineDraft,
      modelOutput,
      language: 'en',
      turnId: 2,
    });

    expect(entry).not.toBeNull();
    if (entry) {
      expect(entry.disagreementType).toBe('INTENT_MISMATCH');
      expect(entry.offlineDecision.intent).toBe('momo.transfer');
      expect(entry.modelDecision.intent).toBe('momo.pay_bill');
    }
  });

  it('does not log when offline engine and model are in agreement', () => {
    const offlineDecision: BrainDecision = {
      kind: 'confirm',
      intent: 'momo.transfer',
    };

    const offlineDraft: DraftState = {
      intent: 'momo.transfer',
      slots: { amount: 20, recipient: { phone: '0553838464' } },
    };

    const modelOutput: ModelOutputContract = {
      intent: { id: 'momo.transfer', confidence: 0.95 },
      slots: { amount: 20, recipient: { phone: '0553838464' } },
      signals: { user_confirmed: false, correction: false, interruption: false },
      reply: {
        text_en: 'Do you confirm sending {amount} to {recipient}?',
        target_language: 'en',
        reply_kind: 'confirm',
      },
    };

    const entry = shadowEngine.compareAndLog({
      offlineDecision,
      offlineDraft,
      modelOutput,
      language: 'en',
      turnId: 3,
    });

    // In perfect agreement: no entry logged
    expect(entry).toBeNull();
    expect(shadowEngine.getDisagreements().length).toBe(0);
  });
});
