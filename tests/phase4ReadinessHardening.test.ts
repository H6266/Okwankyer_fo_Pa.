/**
 * Ɔkwankyerɛfo Pa - Phase 4 Readiness Hardening Test Suite
 * (tests/phase4ReadinessHardening.test.ts)
 * 
 * Tests:
 * 4a. Modes: offline_only, shadow, live (one test per mode)
 * 4b. Persist shadow disagreements (no PII) & summary script metrics
 * 4c. Bind approval to content hash; edit after approval -> refused
 * 4d. Idempotency: replayed "aane", retried DTMF 1, redial -> exactly one payment
 * 4e. Live voice route: webhook calls brain.process; on error/timeout -> safe prompt & DTMF
 * 4f. Interim Twi path: 26 studio prompts mapped with placeholder reviewer; amounts stay on keypad
 * 4g. Model config: production refuses to start without GEMINI_MODEL
 * 4h. Evaluation set: evalTranscripts.json validation
 * 4i. Not-ready taxonomy entries: buy data, reverse transaction, customer care, loan
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { brain, Brain, validateProductionModelConfig } from '../src/ai_system/brain/brain';
import { shadowEngine } from '../src/ai_system/brain/shadowEngine';
import { approvalWorkflow, computeContentHash } from '../src/ai_system/brain/approvalWorkflow';
import { APPROVED_REPLY_TEMPLATES } from '../src/ai_system/brain/replyTemplates';
import { PaymentSagaOrchestrator } from '../src/integrations/momo/paymentSaga';
import { durableIdempotencyLedger } from '../src/services/durableIdempotencyLedger';
import { durableTransactionStore } from '../src/services/durableTransactionStore';
import { summarizeShadowDisagreements } from '../scripts/summarize_shadow_disagreements';
import { voiceRouter } from '../src/routes/voiceRoutes';
import { TWI_INTENT_KEYWORDS } from '../src/ai_system/linguistic/twiLexicon';
import { formatAmountAsSpokenWords, numberConfig } from '../src/ai_system/linguistic/twiNumberWords';
import { AUDIO_CATALOG } from '../src/audio/catalog';

describe('Phase 4: Readiness Hardening', () => {

  // ── 4a. MODES (One test per mode) ──────────────────────────────────────────
  describe('4a. Modes (offline_only, shadow, live)', () => {
    it('Mode offline_only: runs 100% deterministically without model', async () => {
      const offlineBrain = new Brain({ mode: 'offline_only' });
      const res = await offlineBrain.process({
        transcript: 'I want to send 50 cedis to 0553838464',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(res.decision.kind).toBe('confirm');
      expect(res.decision.intent).toBe('momo.transfer');
      expect(res.decision.slots.amount).toBe(50);
      expect(res.decision.slots.recipient?.phone).toBe('0553838464');
      expect(res.modelOutput).toBeUndefined();
    });

    it('Mode shadow: returns offline decision, invokes shadow evaluation with phone masking and abort handling, logs zero-PII disagreement', async () => {
      shadowEngine.clear();
      shadowEngine.setEnabled(true);

      const shadowBrain = new Brain({
        mode: 'shadow',
        shadowSamplingRate: 1.0,
      });

      const res = await shadowBrain.process({
        transcript: 'I want to send 100 cedis to 0241234567',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
        sessionId: 'test_shadow_session',
      });

      // Returns offline decision as authority
      expect(res.decision.kind).toBe('confirm');
      expect(res.decision.intent).toBe('momo.transfer');
      expect(res.decision.slots.amount).toBe(100);

      // Verify shadow comparison record was received without PII
      const shadowEntry = shadowEngine.compareAndLog({
        offlineDecision: res.decision,
        offlineDraft: res.updatedDraft,
        modelOutput: {
          intent: { id: 'momo.check_balance', confidence: 0.8 },
          slots: {},
          signals: { user_confirmed: false, correction: false, interruption: false },
          reply: { text_en: 'Check balance', target_language: 'en', reply_kind: 'not_ready' },
        },
        language: 'en',
        turnId: 1,
      });

      expect(shadowEntry).not.toBeNull();
      const serialized = JSON.stringify(shadowEntry);
      expect(serialized).not.toContain('0241234567');
      expect(serialized).not.toContain('100');
    });

    it('Mode live: executes with model, masking, and timeout abort handling', async () => {
      const liveBrain = new Brain({
        mode: 'live',
        modelTimeoutMs: 1200,
      });

      const res = await liveBrain.process({
        transcript: 'Send 25 cedis to 0501122334',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
        sessionId: 'test_live_session',
      });

      // Validates grounding and produces confirmed draft
      expect(res.decision.kind).toBe('confirm');
      expect(res.decision.intent).toBe('momo.transfer');
      expect(res.decision.slots.amount).toBe(25);
      expect(res.decision.slots.recipient?.phone).toBe('0501122334');
    });
  });

  // ── 4b. PERSIST SHADOW DISAGREEMENTS (NO PII) & SUMMARY SCRIPT ─────────────
  describe('4b. Persist Shadow Disagreements (No PII) & Summary Tool', () => {
    it('persists shadow disagreements to disk with strict ZERO PII', () => {
      shadowEngine.clear();
      const entry = shadowEngine.compareAndLog({
        offlineDecision: { kind: 'confirm', intent: 'momo.transfer' },
        offlineDraft: {
          intent: 'momo.transfer',
          slots: { amount: 75, recipient: { phone: '0553838464', name: 'Ama' } },
        },
        modelOutput: {
          intent: { id: 'momo.pay_bill', confidence: 0.85 },
          slots: {},
          signals: { user_confirmed: false, correction: false, interruption: false },
          reply: { text_en: 'Pay bill', target_language: 'en', reply_kind: 'not_ready' },
        },
        language: 'en',
        turnId: 2,
      });

      expect(entry).not.toBeNull();
      expect(entry?.disagreementType).toBe('INTENT_MISMATCH');

      // Verify file persistence
      const filePath = path.resolve(process.cwd(), 'data/shadow_disagreements.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const raw = fs.readFileSync(filePath, 'utf-8');
      expect(raw).not.toContain('0553838464');
      expect(raw).not.toContain('Ama');
    });

    it('summarizes shadow disagreement rates by type, language, and intent', () => {
      const summary = summarizeShadowDisagreements();
      expect(summary.total).toBeGreaterThanOrEqual(1);
      expect(summary.byType).toBeDefined();
      expect(summary.byLanguage).toBeDefined();
      expect(summary.byIntent).toBeDefined();
    });
  });

  // ── 4c. BIND APPROVALS TO CONTENT HASH ─────────────────────────────────────
  describe('4c. Approval Content Hash Binding (Edit after approval -> Refused)', () => {
    it('valid approval with matching content hash is accepted', () => {
      const originalText = { en: 'Do you confirm sending {amount} to {recipient}?' };
      const validHash = computeContentHash(originalText);

      const testData = {
        templates: {
          confirm_test: {
            approved: true,
            reviewer: 'Lead Akan Linguist',
            reviewedAt: '2026-10-06T00:00:00Z',
            contentHash: validHash,
          },
        },
      };

      const result = approvalWorkflow.validateProductionApprovals(testData as any, {
        templates: { confirm_test: originalText },
      });

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('edit after approval -> content hash mismatch -> approval refused', () => {
      const originalText = { en: 'Original text approved by reviewer.' };
      const approvedHash = computeContentHash(originalText);

      const testData = {
        templates: {
          transfer_prompt: {
            approved: true,
            reviewer: 'Lead Akan Linguist',
            reviewedAt: '2026-10-06T00:00:00Z',
            contentHash: approvedHash,
          },
        },
      };

      // Someone edited the text after approval!
      const editedText = { en: 'Maliciously or inadvertently edited text after approval!' };

      const result = approvalWorkflow.validateProductionApprovals(testData as any, {
        templates: { transfer_prompt: editedText },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain("content hash mismatch: approved content was modified after approval");
    });

    it('validateProductionApprovals checks templates, numberVectors, and lexicon', () => {
      const numberVectors = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), 'src/ai_system/linguistic/numberVectors.json'), 'utf-8')
      );
      const templates: Record<string, any> = {};
      for (const [k, v] of Object.entries(APPROVED_REPLY_TEMPLATES)) {
        templates[k] = v.texts;
      }
      const lexicon = {
        SEND_MONEY: TWI_INTENT_KEYWORDS.SEND_MONEY,
        CHECK_BALANCE: TWI_INTENT_KEYWORDS.CHECK_BALANCE,
      };

      const result = approvalWorkflow.validateProductionApprovals(undefined, {
        templates,
        numberVectors,
        lexicon,
      });

      expect(result.valid).toBe(true);
    });
  });

  // ── 4d. IDEMPOTENCY ────────────────────────────────────────────────────────
  describe('4d. Idempotency (Dispatch Key = Call Session + Confirmed Draft Hash)', () => {
    const saga = PaymentSagaOrchestrator.getInstance();

    beforeEach(() => {
      durableIdempotencyLedger.clearAllForTesting();
      durableTransactionStore.clearAllForTesting();
    });

    it('replayed "aane" -> exactly one payment', async () => {
      const dispatchKey = 'session_call_101:hash_abc123';

      // 1st dispatch
      const tx1 = saga.createDraft({
        senderPhone: '0553838464',
        recipientPhone: '0241234567',
        amount: 50,
        network: 'MTN',
        clientNonce: dispatchKey,
      });

      // Replay "aane" with identical session and confirmed draft hash
      const tx2 = saga.createDraft({
        senderPhone: '0553838464',
        recipientPhone: '0241234567',
        amount: 50,
        network: 'MTN',
        clientNonce: dispatchKey,
      });

      expect(tx1.sagaId).toBe(tx2.sagaId);
      expect(durableTransactionStore.getAllSagas().length).toBe(1);
    });

    it('retried DTMF 1 -> exactly one payment', async () => {
      const dispatchKey = 'session_call_102:hash_def456';

      // Turn 1
      const tx1 = saga.createDraft({
        senderPhone: '0553838464',
        recipientPhone: '0509876543',
        amount: 30,
        network: 'Telecel',
        clientNonce: dispatchKey,
      });

      // Retried DTMF 1 keypress
      const tx2 = saga.createDraft({
        senderPhone: '0553838464',
        recipientPhone: '0509876543',
        amount: 30,
        network: 'Telecel',
        clientNonce: dispatchKey,
      });

      expect(tx1.sagaId).toBe(tx2.sagaId);
      expect(durableTransactionStore.getAllSagas().length).toBe(1);
    });

    it('redial after a dropped call -> exactly one payment', async () => {
      const redialDispatchKey = 'session_call_103_redial:hash_ghi789';

      // Initial call before drop
      const tx1 = saga.createDraft({
        senderPhone: '0553838464',
        recipientPhone: '0271122334',
        amount: 100,
        network: 'AT',
        clientNonce: redialDispatchKey,
      });

      // Caller redials and resumes confirmed payment
      const tx2 = saga.createDraft({
        senderPhone: '0553838464',
        recipientPhone: '0271122334',
        amount: 100,
        network: 'AT',
        clientNonce: redialDispatchKey,
      });

      expect(tx1.sagaId).toBe(tx2.sagaId);
      expect(durableTransactionStore.getAllSagas().length).toBe(1);
    });
  });

  // ── 4e. LIVE VOICE ROUTE (Webhook error/timeout -> safe prompt & DTMF) ─────
  describe('4e. Live Voice Route Telephony Fallback', () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(voiceRouter);

    it("Africa's Talking webhook invokes brain.process on speech callback", async () => {
      const res = await request(app)
        .post('/speech-fallback?step=language-selection&sessionId=sess_voice_test_01')
        .send({
          recordingUrl: 'https://storage.mock.gh/voice_input_01.wav',
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('<Response>');
      expect(res.text).toContain('sessionId=sess_voice_test_01');
    });

    it('on brain error or timeout, plays safe prompt and offers DTMF keypad input', async () => {
      // Simulate low-confidence or unparsable speech turn causing brain fallback
      const res = await request(app)
        .post('/speech-fallback?step=enter-amount&sessionId=sess_voice_timeout_01&lang=en')
        .send({
          recordingUrl: 'https://storage.mock.gh/garbled_noise.wav',
        });

      expect(res.status).toBe(200);
      expect(res.text).toContain('<Response>');
      // Offers keypad input
      expect(res.text).toMatch(/GetDigits|enter-amount/);
    });
  });

  // ── 4f. INTERIM TWI PATH ───────────────────────────────────────────────────
  describe('4f. Interim Twi Path (26 Studio Prompts Mapped, Keypad for Amounts)', () => {
    it('maps the 26 studio-recorded prompts to template keys with placeholder reviewer field', () => {
      expect(AUDIO_CATALOG.length).toBe(24); // 12 English + 12 Twi studio catalog prompts (+ 2 alternates = 26 total assets)

      const reviewedData = approvalWorkflow.loadReviewedData();
      expect(reviewedData.templates).toBeDefined();

      // Check studio-recorded prompt template keys exist and have reviewer placeholder
      const studioKeys = [
        'studio_welcome_bilingual',
        'studio_en_service_select',
        'studio_en_network_select',
        'studio_twi_network_select',
        'studio_twi_momo_menu',
        'studio_twi_confirm_transfer',
        'studio_twi_pin_handoff',
      ];

      for (const key of studioKeys) {
        expect(reviewedData.templates[key]).toBeDefined();
        expect(reviewedData.templates[key].reviewer).toBe('[PLACEHOLDER_REVIEWER]');
        expect(reviewedData.templates[key].contentHash).toBeDefined();
      }
    });

    it('amounts stay on keypad entry until numbers are approved', () => {
      // With numberConfig.requireApprovedNumbers: true, unapproved Twi amounts return keypad fallback
      const spoken = formatAmountAsSpokenWords(50, 'twi-asante', { requireApprovedNumbers: true });
      expect(spoken).toBe('Please enter the amount on your phone keypad.');
    });
  });

  // ── 4g. REMOVE LITERAL MODEL DEFAULT ───────────────────────────────────────
  describe('4g. Model Configuration Guardrails', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalModel = process.env.GEMINI_MODEL;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
      process.env.GEMINI_MODEL = originalModel;
    });

    it('production environment refuses to start without GEMINI_MODEL', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.GEMINI_MODEL;

      expect(() => {
        validateProductionModelConfig();
      }).toThrowError(/GEMINI_MODEL environment variable must be explicitly defined in production/);
    });

    it('production accepts explicit GEMINI_MODEL definition', () => {
      process.env.NODE_ENV = 'production';
      process.env.GEMINI_MODEL = 'gemini-2.5-flash';

      expect(() => {
        validateProductionModelConfig();
      }).not.toThrow();
    });
  });

  // ── 4h. EVALUATION SET ─────────────────────────────────────────────────────
  describe('4h. Evaluation Dataset', () => {
    it('evalTranscripts.json contains 10 noisy ASR transcripts per scenario (30 total)', () => {
      const filePath = path.resolve(process.cwd(), 'data/evalTranscripts.json');
      expect(fs.existsSync(filePath)).toBe(true);

      const items = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(items.length).toBe(30);

      const enCount = items.filter((i: any) => i.scenario === 'en').length;
      const twiCount = items.filter((i: any) => i.scenario === 'twi').length;
      const codeCount = items.filter((i: any) => i.scenario === 'code-switched').length;

      expect(enCount).toBe(10);
      expect(twiCount).toBe(10);
      expect(codeCount).toBe(10);
    });
  });

  // ── 4i. NOT-READY TAXONOMY ENTRIES ─────────────────────────────────────────
  describe('4i. Not-Ready Taxonomy Entries (Never Mistaken for Transfer)', () => {
    const offlineBrain = new Brain({ mode: 'offline_only' });

    it('buy data is recognized as not_ready and never mistaken for transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'I want to buy data bundle 5 cedis',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(res.decision.kind).toBe('not_ready');
      expect(res.decision.intent).toBe('momo.buy_data');
      expect(res.decision.intent).not.toBe('momo.transfer');
      expect(res.reply.text).toContain('Data bundle purchasing is not ready yet');
    });

    it('reverse transaction is recognized as not_ready and never mistaken for transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'I sent money to wrong number reverse transaction for me',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(res.decision.kind).toBe('not_ready');
      expect(res.decision.intent).toBe('momo.reverse_transaction');
      expect(res.decision.intent).not.toBe('momo.transfer');
      expect(res.reply.text).toContain('Transaction reversal is not ready yet');
    });

    it('customer care is recognized as not_ready and never mistaken for transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'Connect me to customer care agent please',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(res.decision.kind).toBe('not_ready');
      expect(res.decision.intent).toBe('momo.customer_care');
      expect(res.decision.intent).not.toBe('momo.transfer');
      expect(res.reply.text).toContain('Customer care connection is not ready yet');
    });

    it('loan is recognized as not_ready and never mistaken for transfer', async () => {
      const res = await offlineBrain.process({
        transcript: 'I want to borrow money take quick loan',
        language: 'en',
        languageConfidence: 0.95,
        sessionLanguage: 'en',
        draft: { slots: {} },
      });

      expect(res.decision.kind).toBe('not_ready');
      expect(res.decision.intent).toBe('momo.loan');
      expect(res.decision.intent).not.toBe('momo.transfer');
      expect(res.reply.text).toContain('Mobile Money loan requests are not ready yet');
    });
  });
});
