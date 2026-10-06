/**
 * Ɔkwankyerɛfo Pa - Few-Shot Reply Examples (replyExamples.ts)
 * 
 * Separate editable phrase repository organized by decision kind and language.
 * Native Ghanaian language speakers can edit and enrich these examples
 * without touching any application reasoning or state machine logic.
 * 
 * Voice telephony rules:
 * - One idea per sentence, under 20 words, at most one question.
 * - No digits, symbols, or abbreviations. Numbers are spoken as words.
 * - Placeholders ({amount}, {recipient}) are deterministically injected at runtime.
 */

import { LanguageId } from './types';

export interface FewShotExample {
  decisionKind: string;
  subType?: string;
  language: LanguageId;
  phrasing: string;
  tone?: string;
  notes?: string;
}

export const REPLY_FEW_SHOT_EXAMPLES: FewShotExample[] = [
  // ── 1. CLARIFY INTENT ──────────────────────────────────────────────
  {
    decisionKind: 'clarify_intent',
    language: 'en',
    phrasing: 'Do you want to send money or check something else?',
    tone: 'polite_inquiry',
    notes: 'Used when intent confidence is ambiguous between multiple options.',
  },
  {
    decisionKind: 'clarify_intent',
    language: 'twi-asante',
    phrasing: 'Wopɛ sɛ womane sika anaa biribi foforɔ na wopɛ?',
    tone: 'polite_inquiry',
    notes: 'Asante Twi clarification between send money and another intent.',
  },
  {
    decisionKind: 'clarify_intent',
    language: 'mixed-twi-en',
    phrasing: 'Wopɛ sɛ wosend money anaa biribi foforɔ?',
    tone: 'code_switch',
    notes: 'Natural Ghanaian code-switch.',
  },
  {
    decisionKind: 'clarify_intent',
    language: 'twi-akuapem',
    phrasing: 'Wopɛ sɛ wosoma sika anaa biribi foforɔ na wopɛ?',
    tone: 'polite_inquiry',
    notes: 'Akuapem Twi dialect.',
  },

  // ── 2. CLARIFY SLOT: AMOUNT ─────────────────────────────────────────
  {
    decisionKind: 'clarify_slot',
    subType: 'amount',
    language: 'en',
    phrasing: 'How many Ghana cedis do you want to send?',
    tone: 'direct',
  },
  {
    decisionKind: 'clarify_slot',
    subType: 'amount',
    language: 'twi-asante',
    phrasing: 'Sika dodoɔ sɛn na wopɛ sɛ womane?',
    tone: 'direct',
  },
  {
    decisionKind: 'clarify_slot',
    subType: 'amount',
    language: 'mixed-twi-en',
    phrasing: 'Cedis sɛn na wopɛ sɛ wosend?',
    tone: 'code_switch',
  },
  {
    decisionKind: 'clarify_slot',
    subType: 'amount',
    language: 'twi-akuapem',
    phrasing: 'Sika dodoɔ ahe na wopɛ sɛ wosoma?',
    tone: 'direct',
  },

  // ── 3. CLARIFY SLOT: RECIPIENT PHONE ────────────────────────────────
  {
    decisionKind: 'clarify_slot',
    subType: 'recipientPhone',
    language: 'en',
    phrasing: 'What is the phone number of the person you are sending to?',
    tone: 'direct',
  },
  {
    decisionKind: 'clarify_slot',
    subType: 'recipientPhone',
    language: 'twi-asante',
    phrasing: 'Fon nɔma bɛn na wopɛ sɛ womane sika no kɔ so?',
    tone: 'direct',
  },
  {
    decisionKind: 'clarify_slot',
    subType: 'recipientPhone',
    language: 'mixed-twi-en',
    phrasing: 'Number bɛn na wopɛ sɛ wosend sika no kɔ so?',
    tone: 'code_switch',
  },
  {
    decisionKind: 'clarify_slot',
    subType: 'recipientPhone',
    language: 'twi-akuapem',
    phrasing: 'Fon nɔma bɛn na wopɛ sɛ wosoma sika no kɔ so?',
    tone: 'direct',
  },

  // ── 4. CONFIRM (Deterministic Slot Injection) ──────────────────────
  {
    decisionKind: 'confirm',
    language: 'en',
    phrasing: 'Do you confirm sending {amount} to {recipient}?',
    tone: 'confirmation',
    notes: '{amount} and {recipient} are deterministically injected without digits.',
  },
  {
    decisionKind: 'confirm',
    language: 'twi-asante',
    phrasing: 'Wopene so sɛ yɛmmane {amount} nkɔma {recipient}?',
    tone: 'confirmation',
  },
  {
    decisionKind: 'confirm',
    language: 'mixed-twi-en',
    phrasing: 'Wopene so sɛ yɛsend {amount} kɔma {recipient}?',
    tone: 'code_switch',
  },
  {
    decisionKind: 'confirm',
    language: 'twi-akuapem',
    phrasing: 'Wopene so sɛ yɛnsoma {amount} nkɔma {recipient}?',
    tone: 'confirmation',
  },

  // ── 5. NOT READY (Feature Unbuilt / Roadmap) ─────────────────────────
  {
    decisionKind: 'not_ready',
    subType: 'dial_170_check_balance',
    language: 'en',
    phrasing: 'To protect your PIN, please dial star one seven zero hash to check your balance.',
    tone: 'informative_security',
    notes: 'Zero-PIN truth engine rule: never fabricate or fetch balance over voice.',
  },
  {
    decisionKind: 'not_ready',
    subType: 'dial_170_check_balance',
    language: 'twi-asante',
    phrasing: 'Fa wo fon no bɔ nsoroma ɔha ne aduonson nsensaneeɛ na hwɛ wo balance.',
    tone: 'informative_security',
  },
  {
    decisionKind: 'not_ready',
    subType: 'dial_170_check_balance',
    language: 'mixed-twi-en',
    phrasing: 'Bɔ star one seven zero hash wɔ wo fon so na hwɛ wo balance.',
    tone: 'code_switch',
  },
  {
    decisionKind: 'not_ready',
    subType: 'default',
    language: 'en',
    phrasing: 'That feature is not ready yet. You can still send money right now.',
    tone: 'informative',
  },
  {
    decisionKind: 'not_ready',
    subType: 'default',
    language: 'twi-asante',
    phrasing: 'Saa dwumadie no nnya nnsiesieeɛ, nanso wotumi mane sika seesei ara.',
    tone: 'informative',
  },
  {
    decisionKind: 'not_ready',
    subType: 'default',
    language: 'mixed-twi-en',
    phrasing: 'Saa feature no nready ɛnnɛ, nanso wotumi send money seesei ara.',
    tone: 'code_switch',
  },

  // ── 6. DISPATCH (Immediate Handset Authorization Prompt) ─────────────
  {
    decisionKind: 'dispatch',
    language: 'en',
    phrasing: 'We have sent an authorization prompt to your handset. Please approve on your phone.',
    tone: 'action_dispatched',
  },
  {
    decisionKind: 'dispatch',
    language: 'twi-asante',
    phrasing: 'Yɛamana nsɛm no kɔ wo fon so. Mepa wo kyɛw bɔ wo PIN wɔ wo fon no so.',
    tone: 'action_dispatched',
  },
  {
    decisionKind: 'dispatch',
    language: 'mixed-twi-en',
    phrasing: 'Yɛasend prompt no kɔ wo phone so. Please bɔ wo PIN wɔ wo fon no so.',
    tone: 'code_switch',
  },
  {
    decisionKind: 'dispatch',
    language: 'twi-akuapem',
    phrasing: 'Yɛasoma nsɛm no kɔ wo fon so. Mepa wo kyɛw bɔ wo PIN wɔ wo fon no so.',
    tone: 'action_dispatched',
  },

  // ── 7. ZERO-PIN ALERT ───────────────────────────────────────────────
  {
    decisionKind: 'zero_pin',
    language: 'en',
    phrasing: 'Never speak your Mobile Money PIN. You will enter it privately on your phone.',
    tone: 'security_alert',
  },
  {
    decisionKind: 'zero_pin',
    language: 'twi-asante',
    phrasing: 'Mfa wo PIN nka ano da. Bɔ wo PIN wɔ wo fon no so sɛ nkratoɔ no ba a.',
    tone: 'security_alert',
  },
  {
    decisionKind: 'zero_pin',
    language: 'mixed-twi-en',
    phrasing: 'Never speak your PIN. Bɔ wo PIN wɔ wo phone so sɛ prompt no ba a.',
    tone: 'code_switch',
  },

  // ── 8. SMALLTALK / GREETING ─────────────────────────────────────────
  {
    decisionKind: 'smalltalk',
    language: 'en',
    phrasing: 'Welcome to Okwankyerefo Pa. Tell me who you want to send money to.',
    tone: 'warm_greeting',
  },
  {
    decisionKind: 'smalltalk',
    language: 'twi-asante',
    phrasing: 'Akwaaba Ɔkwankyerɛfo Pa. Ka obi a wopɛ sɛ womane no sika kyerɛ me.',
    tone: 'warm_greeting',
  },
  {
    decisionKind: 'smalltalk',
    language: 'mixed-twi-en',
    phrasing: 'Akwaaba. Ka obi a wopɛ sɛ wosend sika kɔma no kyerɛ me.',
    tone: 'code_switch',
  },
];
