/**
 * Ɔkwankyerɛfo Pa - Language Profile Definitions
 * 
 * Defines constraints, glossary, and register notes injected into model calls
 * to ensure English replies translate cleanly and naturally into Ghanaian languages.
 */

import { LanguageId } from '../types';

export interface LanguageProfile {
  languageId: LanguageId;
  name: string;
  isDialectOf?: 'twi' | 'en';
  constraints: string[];
  glossary: Record<string, string>; // English term -> Target term
  registerNotes: string;
}
