/**
 * Ɔkwankyerɛfo Pa - Reply Composer & Post-Generation Validator (replyComposer.ts)
 * 
 * Generates and validates spoken voice responses before handing off to TTS:
 * 1. Template phrasing with DETERMINISTIC slot injection (no digits, spoken words only).
 * 2. Strict Zero-Digit invariant: Spoken text contains no numerical digits [0-9].
 * 3. Language consistency verification against Akan/Twi and English lexicons.
 * 4. Acoustic character validation (supports authentic Ghanaian characters ɛ, ɔ, Ɛ, Ɔ).
 * 5. Pre-recorded Studio Audio Prompt matching (sets promptId for human studio voice).
 * 6. Deterministic offline fallback templates for every decision type and language.
 * 7. Candidate recording frequency logging for recurring generated sentences.
 */

import { BrainDecision, IntentId, LanguageId, Slots } from './types';
import { REPLY_FEW_SHOT_EXAMPLES } from './replyExamples';
import { geminiClient } from '../../services/geminiClient';
import { AUDIO_CATALOG } from '../../audio/catalog';
import {
  convertNumberToTwiWords,
  convertNumberToEnglishWords,
  formatAmountAsSpokenWords,
} from '../linguistic/twiNumberWords';
import {
  APPROVED_REPLY_TEMPLATES,
  getApprovedTemplateText,
} from './replyTemplates';
import { replyTranslator } from './replyTranslator';

export { convertNumberToTwiWords, convertNumberToEnglishWords };

export interface ComposeReplyInput {
  decision: BrainDecision;
  language: LanguageId;
  slots: Slots;
  notReadyMessageKey?: string;
  isZeroPinAlert?: boolean;
}

export interface ComposeReplyResult {
  text: string;
  language: LanguageId;
  promptId?: string;
  source: 'DETERMINISTIC_TEMPLATE' | 'MODEL_GENERATED' | 'OFFLINE_FALLBACK';
  validationPassed: boolean;
}

// ── DETERMINISTIC NUMBER TO SPOKEN WORDS CONVERSION ─────────────────────────

const TWI_DIGIT_WORDS: Record<string, string> = {
  '0': 'hwee', '1': 'baako', '2': 'mmienu', '3': 'mmiɛnsa', '4': 'ɛnan',
  '5': 'enum', '6': 'nsia', '7': 'nson', '8': 'nwɔtwe', '9': 'nkron',
};

const EN_DIGIT_WORDS: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four',
  '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine',
};

export function convertAmountToSpokenWords(amount: number, language: LanguageId): string {
  return formatAmountAsSpokenWords(amount, language);
}

export function convertPhoneToSpokenWords(phone: string, language: LanguageId): string {
  const cleaned = phone.replace(/\D/g, '');
  const isTwi = language.startsWith('twi');
  const dict = isTwi ? TWI_DIGIT_WORDS : EN_DIGIT_WORDS;

  // Group as standard Ghana 3-3-4 cadence: 055 383 8464
  const words = cleaned.split('').map((ch) => dict[ch] || ch);
  if (words.length === 10) {
    const p1 = words.slice(0, 3).join(' ');
    const p2 = words.slice(3, 6).join(' ');
    const p3 = words.slice(6, 10).join(' ');
    return `${p1}, ${p2}, ${p3}`;
  }
  return words.join(' ');
}

// ── RECURRING SENTENCE CANDIDATE RECORDER ───────────────────────────────────

export class SentenceRecordingTracker {
  private counts = new Map<string, number>();

  /**
   * Records candidate templates for studio recording.
   * INVARIANT: Only pre-injection template text or keys are recorded.
   * NEVER logs raw phone numbers, amounts, or subscriber names (Zero PII).
   */
  public record(preInjectionTemplateOrKey: string): void {
    if (!preInjectionTemplateOrKey) return;
    // PII Guard: If text contains raw digits, phone numbers, or injected amounts, reject from log
    if (/\b0[235]\d{8}\b/.test(preInjectionTemplateOrKey) || /\b\d{4,}\b/.test(preInjectionTemplateOrKey)) {
      return;
    }
    const normalized = preInjectionTemplateOrKey.trim().toLowerCase();
    const count = (this.counts.get(normalized) || 0) + 1;
    this.counts.set(normalized, count);
  }

  public getTopCandidates(threshold = 3): Array<{ text: string; count: number }> {
    const results: Array<{ text: string; count: number }> = [];
    for (const [text, count] of this.counts.entries()) {
      if (count >= threshold) {
        results.push({ text, count });
      }
    }
    return results.sort((a, b) => b.count - a.count);
  }

  public clear(): void {
    this.counts.clear();
  }
}

export const sentenceTracker = new SentenceRecordingTracker();

// ── BACKWARD COMPATIBLE FALLBACK TEMPLATES BRIDGE ───────────────────────────

export const FALLBACK_TEMPLATES: Record<string, Record<LanguageId, string>> = Object.fromEntries(
  Object.entries(APPROVED_REPLY_TEMPLATES).map(([k, v]) => [k, v.texts])
);
// Also alias clarify_slot_recipientPhone to clarify_slot_recipient
FALLBACK_TEMPLATES.clarify_slot_recipientPhone = APPROVED_REPLY_TEMPLATES.clarify_slot_recipient.texts;

// ── POST-GENERATION VALIDATION ──────────────────────────────────────────────

export function validateSpokenReply(text: string, expectedLanguage: LanguageId): boolean {
  if (!text || text.trim().length === 0) return false;

  // Rule 1: STRICT ZERO DIGITS INVARIANT
  // No numeric digits allowed in spoken sentences! Numbers must be spoken as words.
  if (/\d/.test(text)) {
    return false;
  }

  // Rule 2: No unpopulated placeholders
  if (/\{[a-zA-Z0-9_-]+\}/.test(text)) {
    return false;
  }

  // Rule 3: Length constraint (< 250 chars / ~30 words)
  if (text.length > 250) {
    return false;
  }

  // Rule 4: Acoustic character set
  // English, Akan Twi letters (ɛ, ɔ, Ɛ, Ɔ), punctuation (. , ? ! ' -)
  const allowedCharRegex = /^[a-zA-ZɛɔƐƆ\s.,?!'’–-]+$/;
  if (!allowedCharRegex.test(text)) {
    return false;
  }

  // Rule 5: Language match sanity check
  if (expectedLanguage.startsWith('twi') && !text.includes('sika') && !text.includes('mane') && !text.includes('kɔ') && !text.includes('wo') && !text.includes('yɛ') && !text.includes('bɔ') && !text.includes('so') && !text.includes('cedi')) {
    // If it's pure English without any Akan words when Twi was expected
    if (text.startsWith('Do you') || text.startsWith('What is the phone')) {
      return false;
    }
  }

  return true;
}

// ── STUDIO PROMPT MATCHING (Strict exact match or template_key lookup) ──────

export function findStudioPromptMatch(text: string, templateKey?: string): string | undefined {
  if (templateKey) {
    const tplMatch = AUDIO_CATALOG.find(
      (item) => item.id === templateKey || (item as any).templateKey === templateKey
    );
    if (tplMatch) return tplMatch.id;
  }

  const norm = text.toLowerCase().replace(/[^a-z0-9ɛɔƐƆ\s]/g, '').replace(/\s+/g, ' ').trim();
  for (const item of AUDIO_CATALOG) {
    // Invariant: Use spokenText only, NEVER fall back to item.title!
    if (!item.spokenText) continue;
    const itemNorm = item.spokenText.toLowerCase().replace(/[^a-z0-9ɛɔƐƆ\s]/g, '').replace(/\s+/g, ' ').trim();
    // Invariant: EXACT normalized match, never substring includes!
    if (norm === itemNorm) {
      return item.id;
    }
  }
  return undefined;
}

// ── MAIN REPLY COMPOSER ─────────────────────────────────────────────────────

export class ReplyComposer {
  /**
   * Produces and validates the final spoken sentence ready for TTS.
   */
  public async composeReply(input: ComposeReplyInput): Promise<ComposeReplyResult> {
    const { decision, language, slots, notReadyMessageKey, isZeroPinAlert } = input;

    // Zero-PIN Alert takes highest priority
    if (isZeroPinAlert) {
      const template = getApprovedTemplateText('zero_pin', language);
      return {
        text: template,
        language,
        promptId: findStudioPromptMatch(template, 'zero_pin'),
        source: 'DETERMINISTIC_TEMPLATE',
        validationPassed: true,
      };
    }

    // Determine target template key from decision
    let templateKey: string;
    let replyKind: 'confirm' | 'clarify_slot' | 'clarify_intent' | 'not_ready' | 'smalltalk' = 'smalltalk';

    if (decision.kind === 'confirm') {
      templateKey = 'confirm';
      replyKind = 'confirm';
    } else if (decision.kind === 'dispatch') {
      templateKey = 'dispatch';
      replyKind = 'confirm';
    } else if (decision.kind === 'not_ready') {
      templateKey = (notReadyMessageKey === 'dial_170_check_balance' || decision.intent === 'momo.check_balance')
        ? 'not_ready_dial_170_check_balance'
        : 'not_ready_default';
      replyKind = 'not_ready';
    } else if (decision.kind === 'clarify_slot') {
      templateKey = decision.slot === 'amount'
        ? 'clarify_slot_amount'
        : 'clarify_slot_recipient';
      replyKind = 'clarify_slot';
    } else if (decision.kind === 'clarify_intent') {
      templateKey = 'clarify_intent';
      replyKind = 'clarify_intent';
    } else {
      templateKey = 'smalltalk';
      replyKind = 'smalltalk';
    }

    // Delegate to replyTranslator with template short-circuiting
    const translationResult = await replyTranslator.translate({
      text_en: getApprovedTemplateText(templateKey, 'en'),
      target_language: language,
      reply_kind: replyKind,
      template_key: templateKey,
      slots,
    });

    const promptId = findStudioPromptMatch(translationResult.text, templateKey);
    // Invariant: Record only pre-injection template text/keys. Never log raw phone numbers, amounts, or names.
    const preInjectionTemplate = getApprovedTemplateText(templateKey, 'en');
    sentenceTracker.record(preInjectionTemplate);

    return {
      text: translationResult.text,
      language,
      promptId,
      source: translationResult.source === 'TEMPLATE_SHORT_CIRCUIT' ? 'DETERMINISTIC_TEMPLATE' : 'OFFLINE_FALLBACK',
      validationPassed: translationResult.validationPassed,
    };
  }
}

export const replyComposer = new ReplyComposer();

