/**
 * Ɔkwankyerɛfo Pa - Akuapem Twi Language Profile (akuapemTwi.ts)
 * 
 * Pluggable dialect profile for Akuapem Twi.
 * Native speakers can update constraints and glossary terms here without touching logic.
 */

import { LanguageProfile } from './types';

export const AKUAPEM_TWI_PROFILE: LanguageProfile = {
  languageId: 'twi-akuapem',
  name: 'Akuapem Twi',
  isDialectOf: 'twi',
  constraints: [
    'Short, direct sentences: subject, verb, object. Active voice only.',
    'One idea per sentence, at most one question, under 15 words.',
    'No idioms, phrasal verbs, or figurative language.',
    'No contractions and no tag questions. Use plain yes/no questions.',
    'No indirect politeness constructions. Use "Mepa wo kyɛw" once at most.',
    'Avoid gendered pronouns. Twi does not mark gender in third person.',
    'Prefer simple present or simple future.',
    'No negative questions or double negatives.',
    'Use ONLY glossary terms for core concepts (soma sika, sika dodoɔ, fon nɔma, gyae, pene so).',
    'Avoid abstract words. Say "Mintumi nyɛ seesei" instead of "that service is unavailable".',
    'No digits or symbols. Use {amount}, {recipient}, {phone} placeholders.',
    'Do not translate or alter names.',
  ],
  glossary: {
    'send money': 'soma sika',
    'send': 'soma',
    'transfer': 'soma sika',
    'amount': 'sika dodoɔ',
    'phone number': 'fon nɔma',
    'phone': 'fon',
    'recipient': 'onipa a worekɔsoma no sika',
    'cancel': 'gyae',
    'confirm': 'pene so',
    'cedis': 'cedis',
    'Ghana cedis': 'Ghana cedis',
    'MoMo': 'MoMo',
    'balance': 'balance',
    'airtime': 'airtime',
    'credit': 'kɔkɔɔ',
    'yes': 'aane',
    'no': 'dabi',
    'ok': 'yoo',
    'okay': 'yoo',
    'please': 'mepa wo kyɛw',
  },
  registerNotes: 'Polite, clear, respectful Akuapem Akan spoken style.',
};
