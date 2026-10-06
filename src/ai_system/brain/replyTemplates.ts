/**
 * Ɔkwankyerɛfo Pa - Approved Reply Templates Repository
 * (src/ai_system/brain/replyTemplates.ts)
 * 
 * Curated bilingual templates across English, Asante Twi,
 * Akuapem Twi, and Ghanaian Code-Switched (Mixed Twi-English).
 * 
 * INVARIANT: Every template has an approved flag (default false) until
 * signed off by native language specialists.
 * 
 * INVARIANT: Anything with amount, recipient, or payment status MUST use
 * an approved template from this file. Free-form translation is forbidden
 * for transactions and confirmations.
 */

import { LanguageId, ReplyKind } from './types';
import { languagePolicyConfig } from './languagePolicy';

export interface TemplateConfig {
  allowUnapprovedTemplates: boolean;
}

export const templateConfig: TemplateConfig = {
  // In production, unapproved templates must never be spoken (defaults to false in prod)
  allowUnapprovedTemplates: process.env.NODE_ENV !== 'production',
};

export function setAllowUnapprovedTemplates(allowed: boolean): void {
  templateConfig.allowUnapprovedTemplates = allowed;
}

export interface ApprovedTemplateDefinition {
  key: string;
  kind: ReplyKind;
  approved: boolean; // default false pending native speaker verification
  requiresPlaceholders?: string[];
  studioPromptIds?: Partial<Record<LanguageId, string>>;
  texts: Record<LanguageId, string>;
}

export const APPROVED_REPLY_TEMPLATES: Record<string, ApprovedTemplateDefinition> = {
  confirm: {
    key: 'confirm',
    kind: 'confirm',
    approved: false,
    requiresPlaceholders: ['{amount}', '{recipient}'],
    texts: {
      'en': 'Do you confirm sending {amount} to {recipient}?',
      'twi-asante': 'Wopene so sɛ yɛmmane {amount} nkɔma {recipient}?',
      'mixed-twi-en': 'Wopene so sɛ yɛsend {amount} kɔma {recipient}?',
      'twi-akuapem': 'Wopene so sɛ yɛnsoma {amount} nkɔma {recipient}?',
    },
  },
  clarify_slot_amount: {
    key: 'clarify_slot_amount',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'How many Ghana cedis do you want to send?',
      'twi-asante': 'Sika dodoɔ sɛn na wopɛ sɛ womane?',
      'mixed-twi-en': 'Cedis sɛn na wopɛ sɛ wosend?',
      'twi-akuapem': 'Sika dodoɔ ahe na wopɛ sɛ wosoma?',
    },
  },
  clarify_slot_recipient: {
    key: 'clarify_slot_recipient',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'What is the phone number of the person you are sending to?',
      'twi-asante': 'Fon nɔma bɛn na wopɛ sɛ womane sika no kɔ so?',
      'mixed-twi-en': 'Number bɛn na wopɛ sɛ wosend sika no kɔ so?',
      'twi-akuapem': 'Fon nɔma bɛn na wopɛ sɛ wosoma sika no kɔ so?',
    },
  },
  dispatch: {
    key: 'dispatch',
    kind: 'confirm',
    approved: false,
    texts: {
      'en': 'We have sent an authorization prompt to your handset. Please approve on your phone.',
      'twi-asante': 'Yɛamana nsɛm no kɔ wo fon so. Mepa wo kyɛw bɔ wo PIN wɔ wo fon no so.',
      'mixed-twi-en': 'Yɛasend prompt no kɔ wo phone so. Please bɔ wo PIN wɔ wo fon no so.',
      'twi-akuapem': 'Yɛasoma nsɛm no kɔ wo fon so. Mepa wo kyɛw bɔ wo PIN wɔ wo fon no so.',
    },
  },
  zero_pin: {
    key: 'zero_pin',
    kind: 'clarify_slot',
    approved: false,
    texts: {
      'en': 'Never speak your Mobile Money PIN. You will enter it privately on your phone.',
      'twi-asante': 'Mfa wo PIN nka ano da. Bɔ wo PIN wɔ wo fon no so sɛ nkratoɔ no ba a.',
      'mixed-twi-en': 'Never speak your PIN. Bɔ wo PIN wɔ wo phone so sɛ prompt no ba a.',
      'twi-akuapem': 'Mfa wo PIN nka ano da. Bɔ wo PIN wɔ wo fon no so sɛ nkratoɔ no ba a.',
    },
  },
  not_ready_dial_170_check_balance: {
    key: 'not_ready_dial_170_check_balance',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'To protect your PIN, please dial star, one, seven, zero, hash to check your balance.',
      'twi-asante': 'Fa wo fon no bɔ star, baako, nson, hwee, hash na hwɛ wo balance.',
      'mixed-twi-en': 'Bɔ star, one, seven, zero, hash wɔ wo fon so na hwɛ wo balance.',
      'twi-akuapem': 'Fa wo fon no bɔ star, baako, nson, hwee, hash na hwɛ wo balance.',
    },
  },
  not_ready_default: {
    key: 'not_ready_default',
    kind: 'not_ready',
    approved: false,
    texts: {
      'en': 'That feature is not ready yet. You can still send money right now.',
      'twi-asante': 'Saa dwumadie no nnya nnsiesieeɛ, nanso wotumi mane sika seesei ara.',
      'mixed-twi-en': 'Saa feature no nready ɛnnɛ, nanso wotumi send money seesei ara.',
      'twi-akuapem': 'Saa dwumadie no nnya nnsiesieeɛ, nanso wotumi soma sika seesei ara.',
    },
  },
  clarify_intent: {
    key: 'clarify_intent',
    kind: 'clarify_intent',
    approved: false,
    texts: {
      'en': 'Do you want to send money or check something else?',
      'twi-asante': 'Wopɛ sɛ womane sika anaa biribi foforɔ na wopɛ?',
      'mixed-twi-en': 'Wopɛ sɛ wosend money anaa biribi foforɔ?',
      'twi-akuapem': 'Wopene so sɛ wosoma sika anaa biribi foforɔ na wopɛ?',
    },
  },
  smalltalk: {
    key: 'smalltalk',
    kind: 'smalltalk',
    approved: false,
    texts: {
      'en': 'Welcome to Okwankyerefo Pa. Tell me who you want to send money to.',
      'twi-asante': 'Akwaaba Ɔkwankyerɛfo Pa. Ka obi a wopɛ sɛ womane no sika kyerɛ me.',
      'mixed-twi-en': 'Akwaaba. Ka obi a wopɛ sɛ wosend sika kɔma no kyerɛ me.',
      'twi-akuapem': 'Akwaaba Ɔkwankyerɛfo Pa. Ka obi a wopɛ sɛ wosoma no sika kyerɛ me.',
    },
  },
  error_offline: {
    key: 'error_offline',
    kind: 'error',
    approved: false,
    texts: {
      'en': 'I did not catch that. Please tell me who you want to send money to.',
      'twi-asante': 'Mente aseɛ yie. Mepa wo kyɛw ka obi a wopɛ sɛ womane no sika.',
      'mixed-twi-en': 'Mente aseɛ yie. Please ka obi a wopɛ sɛ wosend sika kɔma no.',
      'twi-akuapem': 'Mente ase yiye. Mepa wo kyɛw ka obi a wopɛ sɛ wosoma no sika.',
    },
  },
};

/**
 * Gets an approved template text for a key and language.
 */
export function getApprovedTemplateText(key: string, language: LanguageId): string {
  const tpl = APPROVED_REPLY_TEMPLATES[key];
  let resolvedLang = language;
  // Item B: Akuapem templates unreachable in production until approved
  if (resolvedLang === 'twi-akuapem' && !languagePolicyConfig.allowUnapprovedDialects) {
    resolvedLang = 'twi-asante';
  }

  if (!tpl) {
    return APPROVED_REPLY_TEMPLATES.smalltalk.texts[resolvedLang] || APPROVED_REPLY_TEMPLATES.smalltalk.texts.en;
  }
  return tpl.texts[resolvedLang] || tpl.texts.en;
}

/**
 * Checks if a template key is an approved registered template.
 */
export function isApprovedTemplateKey(key: string): boolean {
  return Boolean(APPROVED_REPLY_TEMPLATES[key]);
}

/**
 * Enforces rule: Anything involving money movement, confirmations, or slots
 * MUST use an approved template. Free-form translation is disallowed.
 */
export function requiresApprovedTemplate(replyKind: ReplyKind): boolean {
  return replyKind === 'confirm' || replyKind === 'clarify_slot';
}

/**
 * Finds template key from exact or normalized English text.
 */
export function findTemplateKeyByText(textEn: string): string | undefined {
  const norm = textEn.trim().toLowerCase().replace(/[^a-z0-9{} ]/g, '');
  for (const [key, tpl] of Object.entries(APPROVED_REPLY_TEMPLATES)) {
    const tplNorm = tpl.texts.en.trim().toLowerCase().replace(/[^a-z0-9{} ]/g, '');
    if (norm === tplNorm) {
      return key;
    }
  }
  return undefined;
}

// ── STUDIO RECORDING CANDIDATES (Exported for Voice Recording Team) ──────────

export interface StudioRecordingCandidate {
  id: string;
  category: 'KEYPAD_ENTRY' | 'USSD_BALANCE_GUIDANCE' | 'CONFIRMATION' | 'ZERO_PIN';
  dialect: 'twi-asante' | 'twi-akuapem' | 'en';
  text: string;
  targetRole: string;
  status: 'PENDING_STUDIO_RECORDING';
}

export const studioRecordingCandidates: StudioRecordingCandidate[] = [
  {
    id: 'twi-keypad-entry-amount',
    category: 'KEYPAD_ENTRY',
    dialect: 'twi-asante',
    text: 'Mepa wo kyɛw, bɔ sika no dodoɔ wɔ wo fon keypad no so.',
    targetRole: 'Fallback prompt for unapproved spoken amounts or amounts above single transaction cap',
    status: 'PENDING_STUDIO_RECORDING',
  },
  {
    id: 'twi-ussd-170-balance-loanwords',
    category: 'USSD_BALANCE_GUIDANCE',
    dialect: 'twi-asante',
    text: 'Fa wo fon no bɔ star, baako, nson, hwee, hash na hwɛ wo balance.',
    targetRole: 'Default USSD guidance with English loanwords star and hash for MoMo check balance',
    status: 'PENDING_STUDIO_RECORDING',
  },
  {
    id: 'twi-ussd-170-balance-akan',
    category: 'USSD_BALANCE_GUIDANCE',
    dialect: 'twi-asante',
    text: 'Fa wo fon no bɔ nsoroma, baako, nson, hwee, nsensaneeɛ na hwɛ wo balance.',
    targetRole: 'Alternative native Akan translation for telecom star/hash (unverified)',
    status: 'PENDING_STUDIO_RECORDING',
  },
];
