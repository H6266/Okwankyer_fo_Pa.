/**
 * Ɔkwankyerɛfo Pa - Asante Twi Language Profile (asanteTwi.ts)
 * 
 * Injected into model prompts when the target language is Asante Twi (or code-switched).
 * Native speakers can update constraints and glossary terms here without touching logic.
 */

import { LanguageProfile } from './types';

export const ASANTE_TWI_PROFILE: LanguageProfile = {
  languageId: 'twi-asante',
  name: 'Asante Twi',
  isDialectOf: 'twi',
  constraints: [
    'Short, direct sentences: subject, verb, object. Active voice only.',
    'One idea per sentence, at most one question, under 15 words.',
    'No idioms, phrasal verbs, or figurative language (no "go through", "hold on", "sorted").',
    'No contractions (do not use "don\'t", "can\'t", "won\'t") and no tag questions ("isn\'t it?"). Use plain yes/no questions: "Is that correct?"',
    'No indirect politeness constructions ("Would you mind...", "I was wondering if..."). Use "Please" once at most, or a direct question.',
    'Avoid gendered pronouns (he/she/him/her). Twi does not mark gender in third person. Repeat the name or say "the person" or use {recipient}.',
    'Prefer simple present or simple future. Avoid perfect and continuous tenses.',
    'No negative questions or double negatives.',
    'Use ONLY glossary terms for core concepts (send money, amount, phone number, cancel, confirm, cedis). Do not swap in synonyms.',
    'Avoid abstract words. Say "I cannot do that yet" instead of "that service is unavailable".',
    'No digits or symbols. Use {amount}, {recipient}, {phone} placeholders. Never write values yourself.',
    'Do not translate or alter names.',
  ],
  glossary: {
    'send money': 'mane sika',
    'send': 'mane',
    'transfer': 'mane sika',
    'amount': 'sika dodoɔ',
    'phone number': 'fon nɔma',
    'phone': 'fon',
    'recipient': 'onipa a woremane no sika',
    'cancel': 'gyae',
    'confirm': 'pene so',
    'cedis': 'cedis',
    'Ghana cedis': 'Ghana cedis',
    'MoMo': 'MoMo',
    'balance': 'balance',
    'airtime': 'airtime',
    'credit': 'kɔkɔɔ',
    'yes': 'aane',
    'no': 'daabi',
    'ok': 'yoo',
    'okay': 'yoo',
    'please': 'mepa wo kyɛw',
  },
  registerNotes: 'Polite but plain, everyday spoken style. Respectful, clear, and direct without administrative jargon.',
};
