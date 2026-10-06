/**
 * Ɔkwankyerɛfo Pa - Phase 3b End-to-End Golden Transcript Scenario Suite
 * (tests/phase3E2EScenarios.test.ts)
 * 
 * Verifies all 10 Golden IVR Scenarios across:
 * - English
 * - Asante Twi
 * - Ghanaian Code-Switched (Mixed Twi-English)
 * 
 * Scenarios:
 * 1. Happy Path
 * 2. Missing Recipient
 * 3. Missing Amount
 * 4. Conversational Correction
 * 5. Interruption & Resumption
 * 6. Airtime & Balance Not-Ready Gating
 * 7. Ambiguous Intent Disambiguation
 * 8. Zero-PIN Utterance Interception
 * 9. Hard Model Timeout with Offline Fallback
 * 10. Autonomous Model Offline Execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { brain, Brain, DEFAULT_BRAIN_CONFIG } from '../src/ai_system/brain/brain';
import { serviceRegistry } from '../src/ai_system/brain/serviceRegistry';
import { geminiClient } from '../src/services/geminiClient';
import { setAllowUnapprovedTemplates } from '../src/ai_system/brain/replyTemplates';
import { setRequireApprovedNumbers } from '../src/ai_system/linguistic/twiNumberWords';
import { simulatorTelephonyAdapter } from '../src/providers/telephony/telephonyAdapter';
import { ttsRouter } from '../src/ai_system/speech/tts/ttsRouter';

describe('Phase 3b: End-to-End Scenarios with Golden Transcripts', () => {

  beforeEach(() => {
    serviceRegistry.resetToDefaults();
    setAllowUnapprovedTemplates(true);
    setRequireApprovedNumbers(false);
  });

  afterEach(() => {
    setAllowUnapprovedTemplates(false);
    setRequireApprovedNumbers(true);
    vi.restoreAllMocks();
  });

  // ── 1. HAPPY PATH (EN, ASANTE TWI, CODE-SWITCHED) ─────────────────────────
  describe('1. Happy Path (Multi-turn Full Lifecycle)', () => {
    it('English: intent + amount + recipient -> confirm -> DTMF 1 -> dispatch', async () => {
      // Turn 1: Caller states full intent
      const turn1 = await brain.process({
        transcript: 'Send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(turn1.decision.kind).toBe('confirm');
      expect(turn1.updatedDraft.slots.amount).toBe(50);
      expect(turn1.updatedDraft.slots.recipient?.phone).toBe('0553838464');
      expect(turn1.reply.text).toContain('fifty');

      // Wire into telephony adapter
      const vxml = simulatorTelephonyAdapter.speakBrainReply(turn1.reply);
      expect(vxml).toContain('<Say');

      // Turn 2: Caller confirms with DTMF 1
      const turn2 = await brain.process({
        transcript: '1',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: turn1.updatedDraft,
      });

      expect(turn2.decision.kind).toBe('dispatch');
      expect(turn2.updatedDraft.confirmed).toBe(true);
    });

    it('Asante Twi: intent + amount + recipient -> confirm -> aane -> dispatch', async () => {
      // Turn 1: Spoken in Asante Twi
      const turn1 = await brain.process({
        transcript: 'Mane sika aduonum kɔma 0553838464',
        language: 'twi-asante',
        languageConfidence: 0.95,
        sessionLanguage: 'twi-asante',
        draft: { slots: {} },
      });

      expect(turn1.decision.kind).toBe('confirm');
      expect(turn1.updatedDraft.slots.amount).toBe(50);
      expect(turn1.updatedDraft.slots.recipient?.phone).toBe('0553838464');

      // Turn 2: Caller says "aane" (yes)
      const turn2 = await brain.process({
        transcript: 'aane',
        language: 'twi-asante',
        languageConfidence: 0.95,
        sessionLanguage: 'twi-asante',
        draft: turn1.updatedDraft,
      });

      expect(turn2.decision.kind).toBe('dispatch');
      expect(turn2.updatedDraft.confirmed).toBe(true);
    });

    it('Code-Switched: send 50 cedis kɔma 0553838464 -> confirm -> yoo -> dispatch', async () => {
      const turn1 = await brain.process({
        transcript: 'Send 50 cedis kɔma 0553838464',
        language: 'mixed-twi-en',
        languageConfidence: 0.90,
        sessionLanguage: 'mixed-twi-en',
        draft: { slots: {} },
      });

      expect(turn1.decision.kind).toBe('confirm');
      expect(turn1.updatedDraft.slots.amount).toBe(50);
      expect(turn1.updatedDraft.slots.recipient?.phone).toBe('0553838464');

      const turn2 = await brain.process({
        transcript: 'yoo',
        language: 'mixed-twi-en',
        languageConfidence: 0.90,
        sessionLanguage: 'mixed-twi-en',
        draft: turn1.updatedDraft,
      });

      expect(turn2.decision.kind).toBe('dispatch');
      expect(turn2.updatedDraft.confirmed).toBe(true);
    });
  });

  // ── 2. MISSING RECIPIENT ──────────────────────────────────────────────────
  describe('2. Missing Recipient Clarification', () => {
    it('asks for recipient when amount is provided, then confirms when phone is supplied', async () => {
      // Turn 1: Amount only
      const turn1 = await brain.process({
        transcript: 'I want to transfer 20 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(turn1.decision.kind).toBe('clarify_slot');
      if (turn1.decision.kind === 'clarify_slot') {
        expect(turn1.decision.slot).toBe('recipient');
      }
      expect(turn1.updatedDraft.slots.amount).toBe(20);

      // Turn 2: Recipient phone provided
      const turn2 = await brain.process({
        transcript: '0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: turn1.updatedDraft,
      });

      expect(turn2.decision.kind).toBe('confirm');
      expect(turn2.updatedDraft.slots.amount).toBe(20);
      expect(turn2.updatedDraft.slots.recipient?.phone).toBe('0553838464');
    });
  });

  // ── 3. MISSING AMOUNT ─────────────────────────────────────────────────────
  describe('3. Missing Amount Clarification', () => {
    it('asks for amount when recipient is provided, then confirms when amount is given', async () => {
      // Turn 1: Recipient only
      const turn1 = await brain.process({
        transcript: 'Send money to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(turn1.decision.kind).toBe('clarify_slot');
      if (turn1.decision.kind === 'clarify_slot') {
        expect(turn1.decision.slot).toBe('amount');
      }

      // Turn 2: Amount provided
      const turn2 = await brain.process({
        transcript: '50 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: turn1.updatedDraft,
      });

      expect(turn2.decision.kind).toBe('confirm');
      expect(turn2.updatedDraft.slots.amount).toBe(50);
      expect(turn2.updatedDraft.slots.recipient?.phone).toBe('0553838464');
    });
  });

  // ── 4. CONVERSATIONAL CORRECTION ──────────────────────────────────────────
  describe('4. Slot Correction & Confirmation Revocation', () => {
    it('revokes confirmation and updates amount when caller makes a correction', async () => {
      // Turn 1: Ready to confirm
      const turn1 = await brain.process({
        transcript: 'Send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(turn1.decision.kind).toBe('confirm');
      expect(turn1.updatedDraft.slots.amount).toBe(50);

      // Turn 2: Caller corrects amount
      const turn2 = await brain.process({
        transcript: 'No make it 100 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: turn1.updatedDraft,
      });

      // Must re-read back new amount of 100 cedis!
      expect(turn2.decision.kind).toBe('confirm');
      expect(turn2.updatedDraft.slots.amount).toBe(100);
      expect(turn2.updatedDraft.confirmed).toBe(false);
      expect(turn2.updatedDraft.slots.recipient?.phone).toBe('0553838464');
    });
  });

  // ── 5. INTERRUPTION & RESUMPTION ──────────────────────────────────────────
  describe('5. Interruption & Resumption', () => {
    it('handles interruption and preserves primary task draft', async () => {
      // Turn 1: Transfer task in progress
      const turn1 = await brain.process({
        transcript: 'Send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(turn1.updatedDraft.slots.amount).toBe(50);

      // Turn 2: Interruption
      const turn2 = await brain.process({
        transcript: 'Wait first, how does this service work?',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: turn1.updatedDraft,
      });

      // Slot data preserved across conversational turns
      expect(turn2.updatedDraft.slots.amount).toBe(50);
      expect(turn2.updatedDraft.slots.recipient?.phone).toBe('0553838464');
    });
  });

  // ── 6. AIRTIME & BALANCE NOT-READY GATING ─────────────────────────────────
  describe('6. Airtime & Balance Not-Ready Gating', () => {
    it('refuses execution for unregistered/not_ready service without guessing', async () => {
      // Check Balance is marked not_ready in Service Registry
      const result = await brain.process({
        transcript: 'I want to check my account balance',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(result.decision.kind).toBe('not_ready');
      if (result.decision.kind === 'not_ready') {
        expect(result.decision.intent).toBe('momo.check_balance');
      }
      expect(result.reply.text).toContain('star, one, seven, zero, hash');
    });
  });

  // ── 7. AMBIGUOUS INTENT DISAMBIGUATION ────────────────────────────────────
  describe('7. Ambiguous Intent Disambiguation', () => {
    it('asks caller to clarify when utterance is ambiguous between transfer and balance', async () => {
      const result = await brain.process({
        transcript: 'I need help with my money account',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(result.decision.kind).toBe('clarify_intent');
    });
  });

  // ── 8. ZERO-PIN UTTERANCE INTERCEPTION ───────────────────────────────────
  describe('8. Zero-PIN Utterance Interception', () => {
    it('blocks spoken PIN immediately and drops digits before model or draft storage', async () => {
      const result = await brain.process({
        transcript: 'My pin is 4321 send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      // Zero-PIN guard must intercept and block
      expect(result.decision.kind).toBe('clarify_slot');
      if (result.decision.kind === 'clarify_slot') {
        expect(result.decision.slot).toBe('pin_blocked');
      }
      expect(result.reply.text).toContain('Never speak your Mobile Money PIN');
      expect((result.updatedDraft.slots as any).pin).toBeUndefined();
    });
  });

  // ── 9. HARD MODEL TIMEOUT WITH OFFLINE FALLBACK ───────────────────────────
  describe('9. Hard Model Timeout with Offline Fallback', () => {
    it('seamlessly falls back to offline engine when model times out', async () => {
      vi.spyOn(geminiClient, 'isAvailable').mockReturnValue(true);
      vi.spyOn(geminiClient, 'getRawClient').mockReturnValue({
        models: {
          generateContent: vi.fn(() => new Promise((resolve) => setTimeout(resolve, 20000))),
        },
      } as any);

      const fastBrain = new Brain({
        ...DEFAULT_BRAIN_CONFIG,
        modelTimeoutMs: 15,
        skipModelTierConfidence: 1.5,
      });

      const startTime = Date.now();
      const result = await fastBrain.process({
        transcript: 'I want to transfer 50 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });
      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(1000);
      expect(result.decision.kind).toBe('clarify_slot');
      expect(result.updatedDraft.slots.amount).toBe(50);
    });
  });

  // ── 10. MODEL OFFLINE EXECUTION ───────────────────────────────────────────
  describe('10. Autonomous Model Offline Execution', () => {
    it('operates 100% autonomously when Gemini client is offline or unconfigured', async () => {
      vi.spyOn(geminiClient, 'isAvailable').mockReturnValue(false);

      const offlineBrain = new Brain({
        ...DEFAULT_BRAIN_CONFIG,
      });

      const result = await offlineBrain.process({
        transcript: 'Send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(result.decision.kind).toBe('confirm');
      expect(result.updatedDraft.slots.amount).toBe(50);
      expect(result.updatedDraft.slots.recipient?.phone).toBe('0553838464');
    });
  });

  // ── 11. TTS ROUTER & TELEPHONY INTEGRATION ────────────────────────────────
  describe('11. Telephony & TTS Router Integration', () => {
    it('synthesizes brain reply into audio and voiceXml', async () => {
      vi.spyOn(ttsRouter, 'synthesize').mockResolvedValue({
        audioBuffer: Buffer.from('mock-audio-buffer'),
        audioBase64: 'bW9jay1hdWRpby1idWZmZXI=',
        audioMimeType: 'audio/wav',
        durationEstimateSec: 2,
        providerUsed: 'STUDIO_CATALOG',
      });

      const turn = await brain.process({
        transcript: 'Send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      const ttsResult = await ttsRouter.synthesizeBrainReply(turn.reply);
      expect(ttsResult).toBeDefined();
      expect(ttsResult.audioBuffer.length).toBeGreaterThan(0);

      const xml = simulatorTelephonyAdapter.speakBrainReply(turn.reply);
      expect(xml).toContain('<Say');
      expect(xml).toContain('fifty');
    });
  });
});
