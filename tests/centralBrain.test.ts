/**
 * Ɔkwankyerɛfo Pa - Central Reasoning Brain Unit Tests (tests/centralBrain.test.ts)
 * 
 * Tests the entire Brain reasoning pipeline:
 * 1. Registry Gating: ready vs not_ready vs unknown
 * 2. Ambiguity & Clarify Intent on close confidence margin
 * 3. Slot Clarification for missing mandatory slots
 * 4. Confirmation Revocation on changed amount or recipient
 * 5. Zero-PIN Interception before any model or storage
 * 6. Session Language Lock and Evidence-based Switching
 * 7. Code-Switch Mirroring
 * 8. Reply Validation & Zero-Digits Invariant
 * 9. 100% Deterministic Offline Operation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { brain, Brain } from '../src/ai_system/brain/brain';
import { serviceRegistry } from '../src/ai_system/brain/serviceRegistry';
import { languagePolicy } from '../src/ai_system/brain/languagePolicy';
import { validateSpokenReply, replyComposer, convertAmountToSpokenWords } from '../src/ai_system/brain/replyComposer';
import { DraftState, BrainInput } from '../src/ai_system/brain/types';
import { setRequireApprovedNumbers } from '../src/ai_system/linguistic/twiNumberWords';
import { setAllowUnapprovedTemplates } from '../src/ai_system/brain/replyTemplates';

describe('Central Reasoning Brain - Architectural Invariants', () => {
  beforeEach(() => {
    serviceRegistry.resetToDefaults();
    setRequireApprovedNumbers(false);
    setAllowUnapprovedTemplates(true);
  });

  afterEach(() => {
    setRequireApprovedNumbers(true);
    setAllowUnapprovedTemplates(false);
  });

  // ── 1. REGISTRY GATING ─────────────────────────────────────────────────────
  describe('1. Service Registry Gating (Ready vs Not Ready vs Unknown)', () => {
    it('gates ready service (momo.transfer) through to confirmation and execution', async () => {
      const input: BrainInput = {
        transcript: 'I want to send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      };

      const result = await brain.process(input);
      expect(result.decision.kind).toBe('confirm');
      if (result.decision.kind === 'confirm') {
        expect(result.decision.intent).toBe('momo.transfer');
        expect(result.decision.slots.amount).toBe(50);
        expect(result.decision.slots.recipient?.phone).toBe('0553838464');
      }
    });

    it('gates unbuilt intent (momo.check_balance) to not_ready with *170# prompt', async () => {
      const input: BrainInput = {
        transcript: 'Please check my balance',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      };

      const result = await brain.process(input);
      expect(result.decision.kind).toBe('not_ready');
      if (result.decision.kind === 'not_ready') {
        expect(result.decision.intent).toBe('momo.check_balance');
      }
      expect(result.reply.text.replace(/,/g, '')).toContain('dial star one seven zero hash');
    });

    it('gates roadmap feature (momo.buy_airtime) to not_ready without guessing', async () => {
      const input: BrainInput = {
        transcript: 'I want to buy airtime top up',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      };

      const result = await brain.process(input);
      expect(result.decision.kind).toBe('not_ready');
      if (result.decision.kind === 'not_ready') {
        expect(result.decision.intent).toBe('momo.buy_airtime');
      }
      expect(result.reply.text).toContain('That feature is not ready yet');
    });
  });

  // ── 2. CLARIFY INTENT ON CLOSE CONFIDENCE ──────────────────────────────────
  describe('2. Ambiguity & Clarify Intent on Close Confidence', () => {
    it('returns clarify_intent when top intents are ambiguous and within margin', async () => {
      // Create a brain instance with a wide margin to test the settling margin invariant
      const customBrain = new Brain({
        confidenceThreshold: 0.80,
        ambiguityMargin: 0.50,
      });

      const input: BrainInput = {
        transcript: 'I want to pay money for bill or transfer',
        language: 'en',
        languageConfidence: 0.9,
        sessionLanguage: 'en',
        draft: { slots: {} },
      };

      const result = await customBrain.process(input);
      expect(result.decision.kind).toBe('clarify_intent');
      if (result.decision.kind === 'clarify_intent') {
        expect(result.decision.candidates.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  // ── 3. SLOT CLARIFICATION ──────────────────────────────────────────────────
  describe('3. Slot Clarification for Missing Slots', () => {
    it('asks to clarify phone number when amount is provided but recipient phone is missing', async () => {
      const input: BrainInput = {
        transcript: 'I want to send 100 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      };

      const result = await brain.process(input);
      expect(result.decision.kind).toBe('clarify_slot');
      if (result.decision.kind === 'clarify_slot') {
        expect(['recipient', 'recipientPhone']).toContain(result.decision.slot);
      }
      expect(result.reply.text).toContain('What is the phone number');
    });

    it('asks to clarify amount in Asante Twi when phone number is provided without amount', async () => {
      const input: BrainInput = {
        transcript: 'Me pɛ sɛ me mane kɔma 0553838464',
        language: 'twi-asante',
        languageConfidence: 0.95,
        sessionLanguage: 'twi-asante',
        draft: { slots: {} },
      };

      const result = await brain.process(input);
      expect(result.decision.kind).toBe('clarify_slot');
      if (result.decision.kind === 'clarify_slot') {
        expect(result.decision.slot).toBe('amount');
      }
      expect(result.reply.text).toContain('Sika dodoɔ sɛn');
    });
  });

  // ── 4. CONFIRMATION REVOCATION ON CHANGED AMOUNT ───────────────────────────
  describe('4. Confirmation Revocation on Changed Amount or Recipient', () => {
    it('revokes prior confirmation when caller changes amount from 50 to 100', async () => {
      const initialDraft: DraftState = {
        intent: 'momo.transfer',
        slots: {
          amount: 50,
          recipientPhone: '0553838464',
        },
        confirmed: true,
      };

      const input: BrainInput = {
        transcript: 'Actually make that 100 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: initialDraft,
      };

      const result = await brain.process(input);
      // Confirmation MUST be revoked and re-requested for 100
      expect(result.updatedDraft.confirmed).toBe(false);
      expect(result.updatedDraft.slots.amount).toBe(100);
      expect(result.decision.kind).toBe('confirm');
      expect(result.reply.text).toContain('one hundred Ghana cedis');
    });
  });

  // ── 5. ZERO-PIN INTERCEPTION ───────────────────────────────────────────────
  describe('5. Zero-PIN Interception Guard', () => {
    it('intercepts 4-digit spoken PIN immediately and blocks model/storage', async () => {
      const input: BrainInput = {
        transcript: 'My PIN is 1234, send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      };

      const result = await brain.process(input);
      expect(result.decision.kind).toBe('clarify_slot');
      if (result.decision.kind === 'clarify_slot') {
        expect(result.decision.slot).toBe('pin_blocked');
      }
      expect(result.reply.text).toContain('Never speak your Mobile Money PIN');
      // Verify PIN was not stored in draft slots
      expect(result.updatedDraft.slots['pin']).toBeUndefined();
    });

    it('intercepts Akan spoken PIN warning in Asante Twi', async () => {
      const input: BrainInput = {
        transcript: 'Me secret pin yɛ 4567',
        language: 'twi-asante',
        languageConfidence: 0.95,
        sessionLanguage: 'twi-asante',
        draft: { slots: {} },
      };

      const result = await brain.process(input);
      expect(result.reply.text).toContain('Mfa wo PIN nka ano da');
    });
  });

  // ── 6. SESSION LANGUAGE LOCK AND SWITCHING ─────────────────────────────────
  describe('6. Language Policy: Session Lock and Evidence-based Switching', () => {
    it('locks session language and ignores single noisy ASR turn', () => {
      const lockedSession = languagePolicy.resolveLanguage({
        transcript: 'Me pɛ sɛ me mane sika',
        detectedLanguage: 'twi-asante',
        detectedConfidence: 0.92,
        currentSessionLanguage: 'twi-asante',
      });
      expect(lockedSession.sessionLanguage).toBe('twi-asante');

      // Noisy single turn with low confidence
      const noisyTurn = languagePolicy.resolveLanguage({
        transcript: 'hello',
        detectedLanguage: 'en',
        detectedConfidence: 0.60,
        currentSessionLanguage: 'twi-asante',
      });
      expect(noisyTurn.sessionLanguage).toBe('twi-asante');
      expect(noisyTurn.switched).toBe(false);
    });

    it('switches immediately on explicit user request ("speak English")', () => {
      const res = languagePolicy.resolveLanguage({
        transcript: 'Please speak English',
        detectedLanguage: 'en',
        detectedConfidence: 0.90,
        currentSessionLanguage: 'twi-asante',
      });
      expect(res.sessionLanguage).toBe('en');
      expect(res.switched).toBe(true);
      expect(res.switchReason).toBe('EXPLICIT_USER_REQUEST');
    });

    it('switches upon sustained evidence (2 consecutive turns)', () => {
      // Turn 1
      const turn1 = languagePolicy.resolveLanguage({
        transcript: 'I want to transfer funds to my brother',
        detectedLanguage: 'en',
        detectedConfidence: 0.95,
        currentSessionLanguage: 'twi-asante',
      });
      expect(turn1.sessionLanguage).toBe('twi-asante'); // not switched yet
      expect(turn1.consecutiveCandidateCount).toBe(1);

      // Turn 2
      const turn2 = languagePolicy.resolveLanguage({
        transcript: 'Yes, please proceed with the transfer',
        detectedLanguage: 'en',
        detectedConfidence: 0.95,
        currentSessionLanguage: 'twi-asante',
        consecutiveCandidateCount: turn1.consecutiveCandidateCount,
        candidateLanguage: turn1.candidateLanguage,
      });
      expect(turn2.sessionLanguage).toBe('en'); // now switched!
      expect(turn2.switched).toBe(true);
      expect(turn2.switchReason).toBe('SUSTAINED_EVIDENCE');
    });
  });

  // ── 7. CODE-SWITCH MIRRORING ───────────────────────────────────────────────
  describe('7. Code-Switch Mirroring', () => {
    it('mirrors Ghanaian code-switching in reply while keeping stable session', () => {
      const res = languagePolicy.resolveLanguage({
        transcript: 'Please me pɛ sɛ me send 50 kɔma Kofi',
        detectedLanguage: 'mixed-twi-en',
        detectedConfidence: 0.88,
        currentSessionLanguage: 'twi-asante',
      });
      expect(res.replyLanguage).toBe('mixed-twi-en');
      expect(res.sessionLanguage).toBe('twi-asante');
    });
  });

  // ── 8. REPLY VALIDATION & ZERO-DIGITS INVARIANT ────────────────────────────
  describe('8. Reply Validation & Zero-Digits Invariant', () => {
    it('rejects sentences containing numerical digits [0-9]', () => {
      const invalidSentence = 'Do you confirm sending 50 cedis to 0553838464?';
      expect(validateSpokenReply(invalidSentence, 'en')).toBe(false);
    });

    it('accepts sentences where numbers are spoken as words', () => {
      const validSentence = 'Do you confirm sending fifty Ghana cedis to zero five five, three eight three, eight four six four?';
      expect(validateSpokenReply(validSentence, 'en')).toBe(true);
    });

    it('deterministically formats amounts into spoken words without digits', () => {
      expect(convertAmountToSpokenWords(50, 'en')).toBe('fifty Ghana cedis');
      expect(convertAmountToSpokenWords(100, 'en')).toBe('one hundred Ghana cedis');
      expect(convertAmountToSpokenWords(50, 'twi-asante')).toBe('cedi aduonum');
      expect(convertAmountToSpokenWords(100, 'twi-asante')).toBe('cedi ɔha');
    });

    it('falls back to safe offline template if validation fails on stray digits or invalid characters', async () => {
      // Simulate raw invalid generation containing digits
      const invalidWithDigits = 'Confirm sending 50 cedis';
      expect(validateSpokenReply(invalidWithDigits, 'en')).toBe(false);

      // Verify composer ensures zero digits in spoken confirmation
      const res = await replyComposer.composeReply({
        decision: { kind: 'confirm', intent: 'momo.transfer', slots: { amount: 50, recipientPhone: '0553838464' } },
        language: 'en',
        slots: { amount: 50, recipientPhone: '0553838464' },
      });
      expect(res.validationPassed).toBe(true);
      expect(res.text).not.toMatch(/\d/);
      expect(res.text).toContain('fifty Ghana cedis');
    });
  });

  // ── 9. EXTENSIBILITY: DYNAMIC SERVICE REGISTRATION ────────────────────────
  describe('9. Extensibility: Dynamic Service Registration without modifying brain.ts', () => {
    it('allows registering a new service dynamically and executes dispatch', async () => {
      let handlerCalled = false;
      serviceRegistry.register({
        intent: 'momo.pay_bill',
        status: 'ready',
        requiredSlots: [
          { name: 'biller', type: 'string', required: true },
          { name: 'amount', type: 'amount', required: true },
        ],
        handler: async (params) => {
          handlerCalled = true;
          return { success: true, result: { biller: params.slots.biller } };
        },
      });

      const input: BrainInput = {
        transcript: 'I want to pay my ECG bill 50 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: {
          intent: 'momo.pay_bill',
          slots: { biller: 'ECG', amount: 50 },
          confirmed: true,
        },
      };

      const result = await brain.process(input);
      expect(result.decision.kind).toBe('dispatch');
      if (result.decision.kind === 'dispatch') {
        expect(result.decision.intent).toBe('momo.pay_bill');
      }
      expect(handlerCalled).toBe(true);
    });
  });

  // ── 10. DETERMINISTIC OFFLINE OPERATION ────────────────────────────────────
  describe('10. Complete Offline Operation', () => {
    it('handles full end-to-end momo.transfer lifecycle without network', async () => {
      // Step 1: Initiate
      const turn1 = await brain.process({
        transcript: 'I want to send 100 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      expect(turn1.decision.kind).toBe('clarify_slot');

      // Step 2: Provide recipient phone
      const turn2 = await brain.process({
        transcript: '0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: turn1.updatedDraft,
      });
      expect(turn2.decision.kind).toBe('confirm');
      expect(turn2.reply.text).toContain('one hundred Ghana cedis');

      // Step 3: Explicit confirmation
      const turn3 = await brain.process({
        transcript: 'Yes, proceed',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: turn2.updatedDraft,
      });
      expect(turn3.decision.kind).toBe('dispatch');
      expect(turn3.reply.text).toContain('authorization prompt');
    });
  });
});
