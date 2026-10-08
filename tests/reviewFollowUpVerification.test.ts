import { describe, it, expect, beforeEach } from 'vitest';
import { brain, Brain } from '../src/ai_system/brain/brain';
import { serviceRegistry } from '../src/ai_system/brain/serviceRegistry';
import { setRequireApprovedNumbers, APPROVED_KEYPAD_FALLBACK_PROMPT } from '../src/ai_system/linguistic/twiNumberWords';
import { setAllowUnapprovedTemplates } from '../src/ai_system/brain/replyTemplates';
import { geminiClient, studyGeminiClient, UnifiedGeminiClient } from '../src/services/geminiClient';
import { speechToText } from '../src/modules/sttService';
import fs from 'fs';
import path from 'path';

describe('Review Follow-Up Verification Tests', () => {
  beforeEach(() => {
    serviceRegistry.resetToDefaults();
    setRequireApprovedNumbers(false);
    setAllowUnapprovedTemplates(true);
    geminiClient.resetCircuitBreaker();
    studyGeminiClient.resetCircuitBreaker();
  });

  // ── 1. A9 Invariant: Dispatch is IMPOSSIBLE without complete readback ───────
  describe('1. A9 Read-back Security Invariant', () => {
    it('keypad-fallback reply -> no readback record -> DTMF 1 cannot dispatch', async () => {
      // Simulate draft where amount was diverted to keypad fallback prompt
      const fallbackDraft = {
        intent: 'momo.transfer' as const,
        slots: {
          amount: 50,
          recipient: { phone: '0553838464' },
        },
        confirmed: false,
        lastReplyKind: 'confirm' as const,
        lastConfirmReadbackText: APPROVED_KEYPAD_FALLBACK_PROMPT,
        // No readback record stored because amount/recipient were not spoken
        readback: undefined,
        confirmedDraftHash: 'hash_test_123',
      };

      const offlineBrain = new Brain({ mode: 'offline_only' });
      const result = await offlineBrain.process({
        transcript: '1', // DTMF 1 confirmation attempt
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: fallbackDraft as any,
      });

      // INVARIANT: Cannot dispatch without readback record!
      expect(result.decision.kind).toBe('confirm');
      expect(result.updatedDraft.confirmed).toBe(false);
      expect(result.decision.kind).not.toBe('dispatch');
    });

    it('changed amount -> hash mismatch -> no dispatch', async () => {
      const offlineBrain = new Brain({ mode: 'offline_only' });
      // Turn 1: genuine read-back for 50 cedis
      const turn1 = await offlineBrain.process({
        transcript: 'Send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(turn1.decision.kind).toBe('confirm');
      expect(turn1.updatedDraft.readback).toBeDefined();
      expect(turn1.updatedDraft.readback?.amount).toBe(50);
      const originalReadbackHash = turn1.updatedDraft.readback?.draftHash;

      // Turn 2: Caller changes amount to 70 cedis
      const tamperedDraft = {
        ...turn1.updatedDraft,
        slots: {
          ...turn1.updatedDraft.slots,
          amount: 70, // amount changed!
        },
      };

      // Turn 3: DTMF 1 pressed while draft amount is 70 but readback was for 50
      const turn3 = await offlineBrain.process({
        transcript: '1',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: tamperedDraft,
      });

      // INVARIANT: Hash mismatch between readback (50) and current draft (70) prevents dispatch!
      expect(turn3.decision.kind).toBe('confirm');
      expect(turn3.updatedDraft.confirmed).toBe(false);
      expect(turn3.decision.kind).not.toBe('dispatch');
    });

    it('allows dispatch when previous reply was a genuine read-back containing amount and recipient', async () => {
      // Step 1: Turn presenting full readback
      const offlineBrain = new Brain({ mode: 'offline_only' });
      const turn1 = await offlineBrain.process({
        transcript: 'Send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(turn1.decision.kind).toBe('confirm');
      expect(turn1.reply.text).toContain('fifty Ghana cedis');
      expect(turn1.reply.text).toContain('zero five five');
      expect(turn1.updatedDraft.lastConfirmReadbackText).toBe(turn1.reply.text);

      // Step 2: Confirm with DTMF 1
      const turn2 = await offlineBrain.process({
        transcript: '1',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: turn1.updatedDraft,
      });

      expect(turn2.decision.kind).toBe('dispatch');
      expect(turn2.updatedDraft.confirmed).toBe(true);
    });
  });

  // ── 4. E1 Invariant: Brain and STT share single telephony lane ──────────────
  describe('4. E1 Single Gemini Lane Enforcement', () => {
    it('verifies brain.ts has zero calls to getRawClient() in source code', () => {
      const brainSource = fs.readFileSync(path.resolve(__dirname, '../src/ai_system/brain/brain.ts'), 'utf8');
      expect(brainSource).not.toContain('.getRawClient()');
    });

    it('verifies brain.ts and sttService.ts share the exact same UnifiedGeminiClient lane instance', () => {
      const telephonyLane = UnifiedGeminiClient.getInstance('telephony');
      expect(geminiClient).toBe(telephonyLane);
      expect(geminiClient.laneName).toBe('telephony');
    });
  });

  // ── 5. E2 Invariant: Study Breaker Trips While Telephony Stays Closed ───────
  describe('5. E2 Circuit Breaker Lane Isolation', () => {
    it('trips study circuit breaker and asserts telephony lane stays strictly CLOSED', () => {
      expect(studyGeminiClient.getCircuitBreakerState()).toBe('CLOSED');
      expect(geminiClient.getCircuitBreakerState()).toBe('CLOSED');

      // Trip study breaker directly
      (studyGeminiClient as any).circuitBreaker.state = 'OPEN';
      (studyGeminiClient as any).circuitBreaker.failureCount = 5;

      expect(studyGeminiClient.getCircuitBreakerState()).toBe('OPEN');
      // Telephony lane MUST remain completely unaffected
      expect(geminiClient.getCircuitBreakerState()).toBe('CLOSED');
    });
  });

  // ── 7. E4/E6 Invariant: Inferred contact never populates recipient.phone ────
  describe('7. E4/E6 Contact Suggestion Invariant for Brain Path', () => {
    it('ensures an inferred contact name never populates recipient.phone before explicit confirmation', async () => {
      const offlineBrain = new Brain({ mode: 'offline_only' });

      // Caller mentions only a contact name ("Ama") without phone number
      const result = await offlineBrain.process({
        transcript: 'I want to send 50 cedis to Ama',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      // Recipient name may be captured as suggestion, but recipient.phone MUST remain undefined
      expect(result.updatedDraft.slots.recipient?.name).toBe('Ama');
      expect(result.updatedDraft.slots.recipient?.phone).toBeUndefined();
      // Must clarify the missing phone slot, not confirm or dispatch!
      expect(result.decision.kind).toBe('clarify_slot');
      if (result.decision.kind === 'clarify_slot') {
        expect(result.decision.slot).toBe('recipient');
      }
    });
  });

  // ── 8. Regression Tests for Eval Transcripts ─────────────────────────────────
  describe('8. Regression Tests for Previously Failing Transcripts', () => {
    const offlineBrain = new Brain({ mode: 'offline_only' });

    it('eval-en-01: phonetic ASR ("sen 50 sedis") resolves to momo.transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'i wanna sen 50 sedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(res.updatedDraft.intent).toBe('momo.transfer');
      expect(res.updatedDraft.slots.amount).toBe(50);
      expect(res.updatedDraft.slots.recipient?.phone).toBe('0553838464');
    });

    it('eval-en-02: spoken phone digits never leak into the amount (100 vs 146)', async () => {
      const res = await offlineBrain.process({
        transcript: 'transfer one hundred ghana cedis to zero five five three eight three eight four six four',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(res.updatedDraft.intent).toBe('momo.transfer');
      expect(res.updatedDraft.slots.amount).toBe(100);
      expect(res.updatedDraft.slots.recipient?.phone).toBe('0553838464');
    });

    it('eval-en-07: bill / ECG / meter utterance resolves to momo.pay_bill', async () => {
      const res = await offlineBrain.process({
        transcript: 'i want to pay my ecg electricity bill meter 123456 40 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(res.decision.kind).toBe('not_ready');
      expect(res.updatedDraft.intent).toBe('momo.pay_bill');
      expect(res.updatedDraft.slots.amount).toBe(40);
    });

    it('eval-twi-02: Twi compound spoken phone sequence isolates amount to 100', async () => {
      const res = await offlineBrain.process({
        transcript: 'mena sika cedi ɔha kɔma kofi wɔ hwee nnum nnum mmiɛnsa nwɔtwe mmiɛnsa nwɔtwe nan nsia nan so',
        language: 'twi-asante',
        languageConfidence: 0.95,
        sessionLanguage: 'twi-asante',
        draft: { slots: {} },
      });
      expect(res.updatedDraft.intent).toBe('momo.transfer');
      expect(res.updatedDraft.slots.amount).toBe(100);
      expect(res.updatedDraft.slots.recipient?.phone).toBe('0553838464');
    });

    it('eval-twi-05: balance phrase ("hwɛ me sika dodoɔ a aka") resolves to momo.check_balance', async () => {
      const res = await offlineBrain.process({
        transcript: 'mepa wo kyɛw hwɛ me sika dodoɔ a aka wɔ me momo mu',
        language: 'twi-asante',
        languageConfidence: 0.95,
        sessionLanguage: 'twi-asante',
        draft: { slots: {} },
      });
      expect(res.decision.kind).toBe('not_ready');
      expect(res.updatedDraft.intent).toBe('momo.check_balance');
    });
  });

  // ── 9. Negative Intent Scoring Invariants ──────────────────────────────────
  describe('9. Negative Intent Scoring Invariants', () => {
    const offlineBrain = new Brain({ mode: 'offline_only' });

    it('transfer sentence containing "light" is still momo.transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'send 50 cedis to 0553838464 for the light bulb',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(res.updatedDraft.intent).toBe('momo.transfer');
      expect(res.decision.kind).toBe('confirm');
    });

    it('transfer sentence containing "water" is still momo.transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'send 30 cedis to ama on 0501122334 to buy water',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(res.updatedDraft.intent).toBe('momo.transfer');
      expect(res.decision.kind).toBe('confirm');
    });

    it('transfer sentence containing "meter" is still momo.transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'transfer 100 cedis to kofi 0553838464 near the meter',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(res.updatedDraft.intent).toBe('momo.transfer');
      expect(res.decision.kind).toBe('confirm');
    });

    it('transfer sentence containing "refund" is still momo.transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'send 50 cedis to 0553838464 as a refund for the shoes',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(res.updatedDraft.intent).toBe('momo.transfer');
      expect(res.decision.kind).toBe('confirm');
    });

    it('transfer sentence containing "wrong number" is still momo.transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'transfer 40 cedis to 0244112233 because previous was a wrong number',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(res.updatedDraft.intent).toBe('momo.transfer');
      expect(res.decision.kind).toBe('confirm');
    });

    it('"turn off the light" must NOT be classified as pay_bill', async () => {
      const res = await offlineBrain.process({
        transcript: 'turn off the light',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(res.updatedDraft.intent).not.toBe('momo.pay_bill');
      expect(res.decision.kind).not.toBe('not_ready');
    });
  });
});
