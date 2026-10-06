/**
 * Ɔkwankyerɛfo Pa - Ghanaian English Language Profile (english.ts)
 * 
 * Injected into model prompts when the target language is English.
 * Native speakers can update constraints and notes here without touching logic.
 */

import { LanguageProfile } from './types';

export const ENGLISH_PROFILE: LanguageProfile = {
  languageId: 'en',
  name: 'Ghanaian English',
  isDialectOf: 'en',
  constraints: [
    'Plain, short, direct spoken English under 15 words.',
    'One idea per sentence, at most one question.',
    'No idioms or confusing jargon.',
    'No digits or symbols. Use {amount}, {recipient}, {phone} placeholders.',
    'Always use natural Ghanaian terms (Ghana cedis, MoMo).',
  ],
  glossary: {
    'send money': 'send money',
    'amount': 'amount in Ghana cedis',
    'phone number': 'phone number',
    'cancel': 'cancel',
    'confirm': 'confirm',
    'cedis': 'Ghana cedis',
    'MoMo': 'MoMo',
  },
  registerNotes: 'Polite, clear, friendly Ghanaian English. Everyday conversational voice register.',
};
