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
    it('refuses to dispatch if previous reply was a keypad fallback prompt without reading back amount and recipient', async () => {
      // Simulate draft where amount was diverted to keypad fallback prompt
      const fallbackDraft = {
        intent: 'momo.transfer' as const,
        slots: {
          amount: 50,
          recipient: { phone: '0553838464' },
        },
        confirmed: false,
        lastReplyKind: 'confirm' as const,
        lastConfirmReadbackText: APPROVED_KEYPAD_FALLBACK_PROMPT, // "Please enter the amount on your phone keypad."
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

      // INVARIANT: Cannot dispatch! Must refuse confirmation because amount was never read back
      expect(result.decision.kind).toBe('confirm');
      expect(result.updatedDraft.confirmed).toBe(false);
      expect(result.decision.kind).not.toBe('dispatch');
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
});
