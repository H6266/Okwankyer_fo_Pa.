/**
 * Ɔkwankyerɛfo Pa - Language Profile Registry & Helpers
 */

import { LanguageId } from '../types';
import { languagePolicyConfig } from '../languagePolicy';
import { LanguageProfile } from './types';
import { ASANTE_TWI_PROFILE } from './asanteTwi';
import { ENGLISH_PROFILE } from './english';
import { AKUAPEM_TWI_PROFILE } from './akuapemTwi';

export * from './types';
export * from './asanteTwi';
export * from './english';
export * from './akuapemTwi';

export const LANGUAGE_PROFILES: Record<LanguageId, LanguageProfile> = {
  'twi-asante': ASANTE_TWI_PROFILE,
  'en': ENGLISH_PROFILE,
  'twi-akuapem': AKUAPEM_TWI_PROFILE,
  // If mixed, base target is Asante Twi with English loanwords naturally used
  'mixed-twi-en': ASANTE_TWI_PROFILE,
};

export function getLanguageProfile(languageId: LanguageId): LanguageProfile {
  if (languageId === 'twi-akuapem' && !languagePolicyConfig.allowUnapprovedDialects) {
    return ASANTE_TWI_PROFILE;
  }
  return LANGUAGE_PROFILES[languageId] || ASANTE_TWI_PROFILE;
}

/**
 * Formats a language profile into a concise system prompt instruction section.
 */
export function formatProfilePromptSection(profile: LanguageProfile): string {
  const constraintLines = profile.constraints.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const glossaryEntries = Object.entries(profile.glossary)
    .slice(0, 10)
    .map(([en, tr]) => `"${en}" -> "${tr}"`)
    .join(', ');

  return `### TARGET LANGUAGE PROFILE: ${profile.name}
The caller's target language is ${profile.name}.
CRITICAL: You must write the "reply.text_en" field in English, but you must format it strictly according to these ${profile.name}-friendly constraints so it translates naturally into ${profile.name}:

${constraintLines}

Approved Glossary mapping:
${glossaryEntries}

Register Notes:
${profile.registerNotes}`;
}
