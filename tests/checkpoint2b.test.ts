/**
 * Ɔkwankyerɛfo Pa - Phase 2 Checkpoint 2b Tests (tests/checkpoint2b.test.ts)
 * 
 * Verifies:
 * 1. Template short-circuiting: Known templates use pre-approved target side directly without MT.
 * 2. Mandated templates: Confirmations, amounts, and recipients MUST use approved templates.
 * 3. Free-form MT restriction: Allowed ONLY for clarify_intent, not_ready, smalltalk.
 * 4. Glossary enforcement: Akan language profile glossary terms applied.
 * 5. Placeholder preservation: Placeholders preserved exactly once.
 * 6. Deterministic slot injection: Injects spoken amounts and phone/name as words (zero digits).
 * 7. Studio prompt matching: Exact normalized match or template_key lookup (NO substring includes).
 * 8. Offline fallback: Call never goes silent.
 * 
 * Invariants audited:
 * B. Akuapem templates/profile unreachable in production.
 * C. *170# spoken digit by digit (star, one, seven, zero, hash), star/hash words listed as unverified.
 * D. findStudioPromptMatch uses spokenText or templateKey only, no title fallback.
 * E. A template with a missing slot value falls back safely and never speaks a blank or a literal {placeholder}.
 * F. In production mode (allowUnapprovedTemplates=false) an unapproved template is never spoken; show the test.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { replyTranslator } from '../src/ai_system/brain/replyTranslator';
import {
  APPROVED_REPLY_TEMPLATES,
  getApprovedTemplateText,
  findTemplateKeyByText,
  requiresApprovedTemplate,
  setAllowUnapprovedTemplates,
  templateConfig,
} from '../src/ai_system/brain/replyTemplates';
import { findStudioPromptMatch } from '../src/ai_system/brain/replyComposer';
import {
  setRequireApprovedNumbers,
  APPROVED_KEYPAD_FALLBACK_PROMPT,
} from '../src/ai_system/linguistic/twiNumberWords';
import {
  setAllowUnapprovedDialects,
  languagePolicyConfig,
} from '../src/ai_system/brain/languagePolicy';
import { getLanguageProfile, ASANTE_TWI_PROFILE } from '../src/ai_system/brain/languageProfiles';
import {
  TELECOM_SPECIAL_SYMBOLS,
  formatUssdCodeSpoken,
} from '../src/ai_system/linguistic/numberLexicon';

describe('Checkpoint 2b: Reply Templates, Reply Translator & Studio Matching', () => {

  beforeEach(() => {
    // For unit translation testing, allow templates and numbers unless specifically testing production mode
    setRequireApprovedNumbers(false);
    setAllowUnapprovedTemplates(true);
    setAllowUnapprovedDialects(true);
  });

  afterEach(() => {
    // Reset to fail-closed defaults
    setRequireApprovedNumbers(true);
    setAllowUnapprovedTemplates(false);
    setAllowUnapprovedDialects(false);
  });

  describe('1. Approved Reply Templates Repository', () => {
    it('retrieves approved bilingual templates across all supported dialects', () => {
      const confirmEn = getApprovedTemplateText('confirm', 'en');
      const confirmAsante = getApprovedTemplateText('confirm', 'twi-asante');
      const confirmMixed = getApprovedTemplateText('confirm', 'mixed-twi-en');
      const confirmAkuapem = getApprovedTemplateText('confirm', 'twi-akuapem');

      expect(confirmEn).toBe('Do you confirm sending {amount} to {recipient}?');
      expect(confirmAsante).toBe('Wopene so sɛ yɛmmane {amount} nkɔma {recipient}?');
      expect(confirmMixed).toBe('Wopene so sɛ yɛsend {amount} kɔma {recipient}?');
      expect(confirmAkuapem).toBe('Wopene so sɛ yɛnsoma {amount} nkɔma {recipient}?');
    });

    it('identifies template key from normalized English text', () => {
      const key = findTemplateKeyByText('Do you confirm sending {amount} to {recipient}?');
      expect(key).toBe('confirm');

      const amountKey = findTemplateKeyByText('How many Ghana cedis do you want to send?');
      expect(amountKey).toBe('clarify_slot_amount');
    });

    it('mandates approved templates for confirmation and slot questions', () => {
      expect(requiresApprovedTemplate('confirm')).toBe(true);
      expect(requiresApprovedTemplate('clarify_slot')).toBe(true);
      expect(requiresApprovedTemplate('clarify_intent')).toBe(false);
      expect(requiresApprovedTemplate('smalltalk')).toBe(false);
      expect(requiresApprovedTemplate('not_ready')).toBe(false);
    });

    it('ensures every template has approved flag set to false by default pending native speaker review', () => {
      for (const [key, tpl] of Object.entries(APPROVED_REPLY_TEMPLATES)) {
        expect(tpl.approved).toBe(false);
      }
    });
  });

  describe('2. Template Short-Circuiting & Slot Injection (No MT)', () => {
    it('short-circuits template translation directly to Asante Twi and injects slots as spoken words', async () => {
      const res = await replyTranslator.translate({
        text_en: 'Do you confirm sending {amount} to {recipient}?',
        target_language: 'twi-asante',
        reply_kind: 'confirm',
        template_key: 'confirm',
        slots: {
          amount: 50,
          recipient: { phone: '0553838464', name: 'Kwame' },
        },
      });

      expect(res.source).toBe('TEMPLATE_SHORT_CIRCUIT');
      expect(res.validationPassed).toBe(true);
      expect(res.text).not.toMatch(/\d/); // ZERO DIGITS!
      expect(res.text).toBe('Wopene so sɛ yɛmmane cedi aduonum nkɔma Kwame?');
    });

    it('short-circuits template translation to English with zero digits in spoken phone', async () => {
      const res = await replyTranslator.translate({
        text_en: 'Do you confirm sending {amount} to {recipient}?',
        target_language: 'en',
        reply_kind: 'confirm',
        template_key: 'confirm',
        slots: {
          amount: 250,
          recipient: { phone: '0553838464' },
        },
      });

      expect(res.source).toBe('TEMPLATE_SHORT_CIRCUIT');
      expect(res.validationPassed).toBe(true);
      expect(res.text).not.toMatch(/\d/);
      expect(res.text).toContain('two hundred and fifty Ghana cedis');
      expect(res.text).toContain('zero five five, three eight three, eight four six four');
    });
  });

  describe('3. Security Invariant: Mandated Templates for Money / Confirmations', () => {
    it('blocks free-form MT when reply_kind is confirm and enforces approved template', async () => {
      const res = await replyTranslator.translate({
        text_en: 'Hey user, are you really sure you want to transfer {amount} to {recipient} now?',
        target_language: 'twi-asante',
        reply_kind: 'confirm', // Money movement!
        slots: {
          amount: 100,
          recipient: { name: 'Kofi' },
        },
      });

      // Free-form MT is prohibited; must use approved template fallback
      expect(res.source).toBe('OFFLINE_FALLBACK');
      expect(res.template_key).toBe('confirm');
      expect(res.warnings).toContain('FREE_FORM_MT_PROHIBITED_FOR_CONFIRMATION_SLOTS');
      expect(res.text).toBe('Wopene so sɛ yɛmmane cedi ɔha nkɔma Kofi?');
    });
  });

  describe('4. Free-Form MT Restrictions & Glossary Enforcement', () => {
    it('allows free-form translation for clarify_intent, applying profile glossary', async () => {
      const res = await replyTranslator.translate({
        text_en: 'Do you want to send money or something else?',
        target_language: 'twi-asante',
        reply_kind: 'clarify_intent',
        slots: {},
      });

      expect(['MACHINE_TRANSLATED', 'TEMPLATE_SHORT_CIRCUIT', 'OFFLINE_FALLBACK']).toContain(res.source);
      expect(res.validationPassed).toBe(true);
      expect(res.text).toContain('mane sika'); // Glossary term for 'send money'
    });
  });

  describe('5. Studio Prompt Matching: Exact Normalized Match (No Substring Includes)', () => {
    it('does NOT match on substring includes when text only partially contains catalog text', () => {
      // "Welcome" is a substring of the prompt, but not the whole prompt
      const match = findStudioPromptMatch('Welcome to Ghana');
      expect(match).toBeUndefined(); // Must NOT match "en-01" by substring!
    });

    it('matches exact catalog prompt when normalized text is identical', () => {
      const exactText = 'Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.';
      const match = findStudioPromptMatch(exactText);
      expect(match).toBe('en-01');
    });

    it('matches catalog prompt by templateKey lookup', () => {
      const match = findStudioPromptMatch('Any text', 'en-01');
      expect(match).toBe('en-01');
    });
  });

  describe('6. Offline Fallback Guarantee', () => {
    it('falls back to safe offline template on arbitrary unrecognized text', async () => {
      const res = await replyTranslator.translate({
        text_en: 'Something weird that failed translation completely @@##',
        target_language: 'twi-asante',
        reply_kind: 'smalltalk',
        slots: {},
      });

      expect(res.validationPassed).toBe(true);
      expect(res.text.length).toBeGreaterThan(0);
      expect(res.source).toBe('OFFLINE_FALLBACK');
    });
  });

  describe('7. Audited Missing Items (B, C, D, E, F Confirmation)', () => {
    it('B. Akuapem templates/profile unreachable in production', () => {
      setAllowUnapprovedDialects(false);
      expect(languagePolicyConfig.allowUnapprovedDialects).toBe(false);

      // In production mode, template resolution routes Akuapem to Asante Twi
      const text = getApprovedTemplateText('confirm', 'twi-akuapem');
      expect(text).toBe(APPROVED_REPLY_TEMPLATES.confirm.texts['twi-asante']);
      expect(text).not.toBe(APPROVED_REPLY_TEMPLATES.confirm.texts['twi-akuapem']);

      // Profile resolution also falls back to Asante Twi
      const profile = getLanguageProfile('twi-akuapem');
      expect(profile).toBe(ASANTE_TWI_PROFILE);
    });

    it('C. *170# spoken digit by digit (star, one, seven, zero, hash), star/hash words listed as unverified', () => {
      // 1. Telecom symbols defined and explicitly marked as unverified
      expect(TELECOM_SPECIAL_SYMBOLS['*']).toEqual({ en: 'star', twi: 'nsoroma', approved: false });
      expect(TELECOM_SPECIAL_SYMBOLS['#']).toEqual({ en: 'hash', twi: 'nsensaneeɛ', approved: false });

      // 2. Formatted digit-by-digit: loanwords star/hash by default
      const enSpoken = formatUssdCodeSpoken('*170#', 'en');
      expect(enSpoken).toBe('star, one, seven, zero, hash');

      const twiDefault = formatUssdCodeSpoken('*170#', 'twi-asante');
      expect(twiDefault).toBe('star, baako, nson, hwee, hash');

      const twiSpecial = formatUssdCodeSpoken('*170#', 'twi-asante', { useTwiSpecialSymbols: true });
      expect(twiSpecial).toBe('nsoroma, baako, nson, hwee, nsensaneeɛ');

      // 3. Approved template for check balance directs caller to *170# digit by digit
      const templateEn = APPROVED_REPLY_TEMPLATES.not_ready_dial_170_check_balance.texts.en;
      expect(templateEn).toContain('star, one, seven, zero, hash');

      const templateTwi = APPROVED_REPLY_TEMPLATES.not_ready_dial_170_check_balance.texts['twi-asante'];
      expect(templateTwi).toContain('star, baako, nson, hwee, hash');
    });

    it('D. findStudioPromptMatch uses spokenText or templateKey only, no title fallback', () => {
      // "1. Language Selector" is item.title in AUDIO_CATALOG, but NOT spokenText
      const titleOnly = '1. Language Selector';
      const match = findStudioPromptMatch(titleOnly);
      expect(match).toBeUndefined(); // Must NOT match by title!

      // Matching ONLY works by spokenText or templateKey
      const spoken = 'Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.';
      expect(findStudioPromptMatch(spoken)).toBe('en-01');
      expect(findStudioPromptMatch('whatever', 'en-01')).toBe('en-01');
    });

    it('E. A template with a missing slot value falls back safely and never speaks a blank or a literal {placeholder}', async () => {
      const res = await replyTranslator.translate({
        text_en: 'Do you confirm sending {amount} to {recipient}?',
        target_language: 'twi-asante',
        reply_kind: 'confirm',
        template_key: 'confirm',
        slots: {}, // Completely empty slots!
      });

      expect(res.validationPassed).toBe(true);
      expect(res.text).not.toContain('{amount}');
      expect(res.text).not.toContain('{recipient}');
      expect(res.text).not.toContain('{');
      expect(res.text).not.toContain('}');
      expect(res.text).not.toMatch(/\s{2,}/); // No blanks / double spaces
      expect(res.text).toContain('sika a wobɔeɛ'); // Safe slot fallback
      expect(res.text).toContain('onipa no'); // Safe slot fallback
    });

    it('F. In production mode (allowUnapprovedTemplates=false) an unapproved template is never spoken; show the test', async () => {
      setAllowUnapprovedTemplates(false);
      expect(templateConfig.allowUnapprovedTemplates).toBe(false);

      const res = await replyTranslator.translate({
        text_en: 'Do you confirm sending {amount} to {recipient}?',
        target_language: 'twi-asante',
        reply_kind: 'confirm',
        template_key: 'confirm',
        slots: { amount: 50, recipient: { name: 'Kwame' } },
      });

      // Fail-closed security invariant: Never speaks an unapproved template
      expect(res.text).toBe(APPROVED_KEYPAD_FALLBACK_PROMPT);
      expect(res.warnings).toContain('UNAPPROVED_TEMPLATE_BLOCKED_IN_PRODUCTION');
      expect(res.language).toBe('en');
    });

    it('production mode (requireApprovedNumbers=true) unapproved amount never spoken and falls back to keypad', async () => {
      setAllowUnapprovedTemplates(true);
      setRequireApprovedNumbers(true); // Enforce approved numbers

      const res = await replyTranslator.translate({
        text_en: 'Do you confirm sending {amount} to {recipient}?',
        target_language: 'twi-asante',
        reply_kind: 'confirm',
        template_key: 'confirm',
        slots: { amount: 50, recipient: { name: 'Kwame' } }, // 50 has approved: false
      });

      // Fail-closed security invariant: Never speaks an unapproved number
      expect(res.text).toBe(APPROVED_KEYPAD_FALLBACK_PROMPT);
      expect(res.warnings).toContain('UNAPPROVED_NUMBER_BLOCKED_FALLBACK_TO_KEYPAD');
      expect(res.language).toBe('en');
    });
  });
});
