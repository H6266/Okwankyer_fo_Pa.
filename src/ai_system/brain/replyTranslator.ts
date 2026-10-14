/**
 * Ɔkwankyerɛfo Pa - Reply Translator & Slot Injector (replyTranslator.ts)
 * 
 * Orchestrates translation and slot injection:
 * 1. Template Short-Circuit: If template_key matches (or text_en matches an approved
 *    template), uses the pre-approved target language template side directly. NO MT CALL.
 * 2. Mandated Templates: Anything with amount, recipient, or payment status MUST use
 *    an approved template. Free-form MT is restricted to clarify_intent, not_ready, smalltalk.
 * 3. Glossary & Placeholder Enforcement: Preserves placeholders ({amount}, {recipient})
 *    verbatim and validates glossary consistency against Language Profiles.
 * 4. Deterministic Slot Injection AFTER translation: Injects spoken amount and phone/name
 *    as words (strictly zero digits).
 * 5. Offline Fallback: Reverts to approved template if translation fails or is offline.
 */

import { LanguageId, ReplyKind, Slots, TargetLanguageId } from './types';
import {
  APPROVED_REPLY_TEMPLATES,
  findTemplateKeyByText,
  getApprovedTemplateText,
  requiresApprovedTemplate,
  templateConfig,
} from './replyTemplates';
import { approvalWorkflow } from './approvalWorkflow';
import { ASANTE_TWI_PROFILE } from './languageProfiles/asanteTwi';
import { AKUAPEM_TWI_PROFILE } from './languageProfiles/akuapemTwi';
import {
  formatAmountAsSpokenWords,
  APPROVED_KEYPAD_FALLBACK_PROMPT,
} from '../linguistic/twiNumberWords';
import { convertPhoneToSpokenWords } from './replyComposer';

export interface TranslateReplyInput {
  text_en: string;
  target_language: TargetLanguageId | LanguageId;
  reply_kind: ReplyKind;
  template_key?: string;
  slots: Slots;
}

export interface TranslateReplyOutput {
  text: string;
  language: LanguageId;
  template_key?: string;
  source: 'TEMPLATE_SHORT_CIRCUIT' | 'MACHINE_TRANSLATED' | 'OFFLINE_FALLBACK';
  validationPassed: boolean;
  warnings?: string[];
}

// ── POST-TRANSLATION VALIDATOR ──────────────────────────────────────────────

export function validateTranslatedText(text: string, language: LanguageId): boolean {
  if (!text || text.trim().length === 0) return false;

  // Rule 1: STRICT ZERO DIGITS INVARIANT (No numbers 0-9 in spoken output)
  if (/\d/.test(text)) {
    return false;
  }

  // Rule 2: No unpopulated placeholders
  if (/\{[a-zA-Z0-9_-]+\}/.test(text)) {
    return false;
  }

  // Rule 3: Length constraint (< 250 chars)
  if (text.length > 250) {
    return false;
  }

  // Rule 4: Acoustic character set (Akan diacritics: ɛ, ɔ, Ɛ, Ɔ)
  const allowedCharRegex = /^[a-zA-ZɛɔƐƆ\s.,?!'’–-]+$/;
  if (!allowedCharRegex.test(text)) {
    return false;
  }

  return true;
}

// ── DETERMINISTIC SLOT INJECTION ────────────────────────────────────────────

export function injectSlotsIntoTemplate(
  templateText: string,
  slots: Slots,
  language: LanguageId
): string {
  let result = templateText;

  // 1. Amount Injection
  if (result.includes('{amount}')) {
    if (typeof slots.amount === 'number') {
      const spokenAmount = formatAmountAsSpokenWords(slots.amount, language);
      if (spokenAmount === APPROVED_KEYPAD_FALLBACK_PROMPT) {
        // Fail-closed: Cannot speak an unapproved amount; entire prompt becomes the approved keypad fallback!
        return APPROVED_KEYPAD_FALLBACK_PROMPT;
      }
      result = result.replace(/\{amount\}/g, spokenAmount);
    } else {
      // Safe fallback for missing amount slot value (never blank, never literal {amount})
      const fallbackAmount = language.startsWith('twi') ? 'sika a wobɔeɛ' : 'the requested amount';
      result = result.replace(/\{amount\}/g, fallbackAmount);
    }
  }

  // 2. Recipient Injection
  if (result.includes('{recipient}')) {
    const recName = slots.recipient?.name || slots.recipientName;
    const recPhone = slots.recipient?.phone || slots.recipientPhone;

    let spokenRecipient: string;
    if (recName) {
      spokenRecipient = String(recName);
    } else if (recPhone) {
      spokenRecipient = convertPhoneToSpokenWords(String(recPhone), language);
    } else {
      // Safe fallback for missing recipient slot value (never blank, never literal {recipient})
      spokenRecipient = language.startsWith('twi') ? 'onipa no' : 'the recipient';
    }

    result = result.replace(/\{recipient\}/g, spokenRecipient);
  }

  // 3. Fallback for ANY other unpopulated placeholders (e.g. {network}, etc.)
  // Rule: NEVER speak a blank or literal {placeholder}
  result = result.replace(/\{[a-zA-Z0-9_-]+\}/g, () => {
    return language.startsWith('twi') ? 'dwumadie no' : 'the details';
  });

  return result;
}

// ── GLOSSARY & PLACEHOLDER VALIDATOR ────────────────────────────────────────

export function validateGlossaryAndPlaceholders(
  textEn: string,
  translatedText: string,
  targetLanguage: LanguageId
): { valid: boolean; reason?: string } {
  // 1. Verify placeholders are preserved exactly once
  const enPlaceholders = (textEn.match(/\{[a-zA-Z0-9_-]+\}/g) || []).sort();
  const trPlaceholders = (translatedText.match(/\{[a-zA-Z0-9_-]+\}/g) || []).sort();

  if (enPlaceholders.length !== trPlaceholders.length) {
    return { valid: false, reason: 'PLACEHOLDER_COUNT_MISMATCH' };
  }

  for (let i = 0; i < enPlaceholders.length; i++) {
    if (enPlaceholders[i] !== trPlaceholders[i]) {
      return { valid: false, reason: `PLACEHOLDER_MISMATCH_${enPlaceholders[i]}` };
    }
  }

  // 2. Glossary checks for Twi targets
  if (targetLanguage.startsWith('twi')) {
    const profile = targetLanguage === 'twi-akuapem' ? AKUAPEM_TWI_PROFILE : ASANTE_TWI_PROFILE;
    const lowerTr = translatedText.toLowerCase();

    // Check that core English terms weren't left untranslated if Twi is expected
    if (lowerTr.includes('send money') || lowerTr.includes('phone number') || lowerTr.includes('confirm')) {
      return { valid: false, reason: 'UNTRANSLATED_ENGLISH_CORE_TERMS' };
    }
  }

  return { valid: true };
}

// ── MAIN TRANSLATOR CLASS ───────────────────────────────────────────────────

export class ReplyTranslator {
  /**
   * Main translation & slot injection execution pipeline.
   */
  public async translate(input: TranslateReplyInput): Promise<TranslateReplyOutput> {
    const { text_en, target_language, reply_kind, slots } = input;
    const lang = (target_language || 'en') as LanguageId;

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: TEMPLATE SHORT-CIRCUIT
    // ─────────────────────────────────────────────────────────────────────────
    let matchedKey: string | undefined = input.template_key;

    if (!matchedKey && text_en) {
      matchedKey = findTemplateKeyByText(text_en);
    }

    if (matchedKey && APPROVED_REPLY_TEMPLATES[matchedKey]) {
      const templateDef = APPROVED_REPLY_TEMPLATES[matchedKey];
      const isApproved = templateDef.approved || approvalWorkflow.isTemplateApproved(matchedKey, templateDef.texts);
      if (!templateConfig.allowUnapprovedTemplates && !isApproved) {
        return {
          text: APPROVED_KEYPAD_FALLBACK_PROMPT,
          language: 'en',
          template_key: 'keypad_fallback',
          source: 'OFFLINE_FALLBACK',
          validationPassed: true,
          warnings: ['UNAPPROVED_TEMPLATE_BLOCKED_IN_PRODUCTION'],
        };
      }

      const template = getApprovedTemplateText(matchedKey, lang);
      const injected = injectSlotsIntoTemplate(template, slots, lang);
      if (injected === APPROVED_KEYPAD_FALLBACK_PROMPT) {
        return {
          text: APPROVED_KEYPAD_FALLBACK_PROMPT,
          language: 'en',
          template_key: 'keypad_fallback',
          source: 'OFFLINE_FALLBACK',
          validationPassed: true,
          warnings: ['UNAPPROVED_NUMBER_BLOCKED_FALLBACK_TO_KEYPAD'],
        };
      }
      const valid = validateTranslatedText(injected, lang);

      return {
        text: injected,
        language: lang,
        template_key: matchedKey,
        source: 'TEMPLATE_SHORT_CIRCUIT',
        validationPassed: valid,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: MANDATED APPROVED TEMPLATE ENFORCEMENT
    // Anything with amount, recipient, or payment confirmation CANNOT use free-form MT.
    // ─────────────────────────────────────────────────────────────────────────
    if (requiresApprovedTemplate(reply_kind)) {
      // Must use fallback approved template for this kind!
      const fallbackKey = reply_kind === 'confirm' ? 'confirm' : 'clarify_slot_amount';
      const fallbackDef = APPROVED_REPLY_TEMPLATES[fallbackKey];
      const isFallbackApproved = fallbackDef?.approved || (fallbackDef && approvalWorkflow.isTemplateApproved(fallbackKey, fallbackDef.texts));
      if (!templateConfig.allowUnapprovedTemplates && !isFallbackApproved) {
        return {
          text: APPROVED_KEYPAD_FALLBACK_PROMPT,
          language: 'en',
          template_key: 'keypad_fallback',
          source: 'OFFLINE_FALLBACK',
          validationPassed: true,
          warnings: ['UNAPPROVED_TEMPLATE_BLOCKED_IN_PRODUCTION'],
        };
      }

      const template = getApprovedTemplateText(fallbackKey, lang);
      const injected = injectSlotsIntoTemplate(template, slots, lang);
      if (injected === APPROVED_KEYPAD_FALLBACK_PROMPT) {
        return {
          text: APPROVED_KEYPAD_FALLBACK_PROMPT,
          language: 'en',
          template_key: 'keypad_fallback',
          source: 'OFFLINE_FALLBACK',
          validationPassed: true,
          warnings: ['UNAPPROVED_NUMBER_BLOCKED_FALLBACK_TO_KEYPAD'],
        };
      }
      const valid = validateTranslatedText(injected, lang);

      return {
        text: injected,
        language: lang,
        template_key: fallbackKey,
        source: 'OFFLINE_FALLBACK',
        validationPassed: valid,
        warnings: ['FREE_FORM_MT_PROHIBITED_FOR_CONFIRMATION_SLOTS'],
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: FREE-FORM MT PATH (for clarify_intent, not_ready, smalltalk)
    // ─────────────────────────────────────────────────────────────────────────
    if (lang === 'en') {
      const injected = injectSlotsIntoTemplate(text_en, slots, 'en');
      const valid = validateTranslatedText(injected, 'en');
      return {
        text: injected,
        language: 'en',
        source: 'MACHINE_TRANSLATED',
        validationPassed: valid,
      };
    }

    // Translation to Akan/Twi with glossary rules
    let translated: string | null = null;
    try {
      // Rule-based dictionary translation for non-templated phrases
      translated = this.performGlossaryTranslation(text_en, lang);
    } catch {
      translated = null;
    }

    // If MT succeeds and passes glossary/placeholder validation:
    if (translated) {
      const glossaryCheck = validateGlossaryAndPlaceholders(text_en, translated, lang);
      if (glossaryCheck.valid) {
        const injected = injectSlotsIntoTemplate(translated, slots, lang);
        const valid = validateTranslatedText(injected, lang);
        if (valid) {
          return {
            text: injected,
            language: lang,
            source: 'MACHINE_TRANSLATED',
            validationPassed: true,
          };
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: OFFLINE FALLBACK
    // The call must NEVER go silent.
    // ─────────────────────────────────────────────────────────────────────────
    const fallbackKey = reply_kind in APPROVED_REPLY_TEMPLATES ? reply_kind : 'smalltalk';
    const fallbackDef = APPROVED_REPLY_TEMPLATES[fallbackKey];
    const isFallbackApproved = fallbackDef?.approved || (fallbackDef && approvalWorkflow.isTemplateApproved(fallbackKey, fallbackDef.texts));
    if (!templateConfig.allowUnapprovedTemplates && !isFallbackApproved) {
      return {
        text: APPROVED_KEYPAD_FALLBACK_PROMPT,
        language: 'en',
        template_key: 'keypad_fallback',
        source: 'OFFLINE_FALLBACK',
        validationPassed: true,
        warnings: ['UNAPPROVED_TEMPLATE_BLOCKED_IN_PRODUCTION'],
      };
    }

    const fallbackTemplate = getApprovedTemplateText(fallbackKey, lang);
    const injectedFallback = injectSlotsIntoTemplate(fallbackTemplate, slots, lang);
    if (injectedFallback === APPROVED_KEYPAD_FALLBACK_PROMPT) {
      return {
        text: APPROVED_KEYPAD_FALLBACK_PROMPT,
        language: 'en',
        template_key: 'keypad_fallback',
        source: 'OFFLINE_FALLBACK',
        validationPassed: true,
        warnings: ['UNAPPROVED_NUMBER_BLOCKED_FALLBACK_TO_KEYPAD'],
      };
    }

    return {
      text: injectedFallback,
      language: lang,
      template_key: fallbackKey,
      source: 'OFFLINE_FALLBACK',
      validationPassed: validateTranslatedText(injectedFallback, lang),
    };
  }

  /**
   * Applies language profile glossary rules for free-form translations.
   */
  private performGlossaryTranslation(textEn: string, targetLanguage: LanguageId): string {
    const profile = targetLanguage === 'twi-akuapem' ? AKUAPEM_TWI_PROFILE : ASANTE_TWI_PROFILE;
    let res = textEn;

    // Apply glossary replacement
    for (const [enTerm, twiTerm] of Object.entries(profile.glossary)) {
      const reg = new RegExp(`\\b${enTerm}\\b`, 'gi');
      res = res.replace(reg, twiTerm);
    }

    return res;
  }
}

export const replyTranslator = new ReplyTranslator();
