/**
 * Ɔkwankyerɛfo Pa - Language Policy Engine (languagePolicy.ts)
 * 
 * Manages session language locking, evidence-based switching, code-switch mirroring,
 * and pluggable Akan dialect profiles (Asante v1, Akuapem pluggable).
 */

import { LanguageId, TargetLanguageId } from './types';

export interface DialectProfile {
  dialectId: LanguageId;
  name: string;
  parentLanguage: 'twi' | 'en';
  lexicalMarkers: string[];
  phoneticMarkers?: string[];
  isPluggable?: boolean;
}

export interface LanguageResolutionInput {
  transcript: string;
  detectedLanguage: LanguageId;
  detectedConfidence: number;
  currentSessionLanguage: LanguageId;
  consecutiveCandidateCount?: number;
  candidateLanguage?: LanguageId;
}

export interface LanguageResolutionResult {
  sessionLanguage: LanguageId;
  targetLanguage: TargetLanguageId;
  replyLanguage: LanguageId;
  switched: boolean;
  switchReason?: 'EXPLICIT_USER_REQUEST' | 'SUSTAINED_EVIDENCE' | 'INITIAL_LOCK' | 'MAINTAINED';
  consecutiveCandidateCount: number;
  candidateLanguage?: LanguageId;
}

export interface LanguagePolicyConfig {
  allowUnapprovedDialects: boolean;
}

export const languagePolicyConfig: LanguagePolicyConfig = {
  // Default false in production: Akuapem profile unreachable until approved
  allowUnapprovedDialects: false,
};

export function setAllowUnapprovedDialects(allowed: boolean): void {
  languagePolicyConfig.allowUnapprovedDialects = allowed;
}

function resolveTargetDialect(sessionLang: LanguageId, detectedLang?: LanguageId): TargetLanguageId {
  let dialect: TargetLanguageId = 'twi-asante';
  if (detectedLang === 'mixed-twi-en') {
    dialect = sessionLang === 'twi-akuapem' ? 'twi-akuapem' : 'twi-asante';
  } else if (sessionLang === 'twi-akuapem') {
    dialect = 'twi-akuapem';
  } else if (sessionLang === 'en') {
    dialect = 'en';
  } else {
    dialect = 'twi-asante';
  }

  // Item B: Akuapem dialect is unreachable in production until approved
  if (dialect === 'twi-akuapem' && !languagePolicyConfig.allowUnapprovedDialects) {
    return 'twi-asante';
  }
  return dialect;
}

const EXPLICIT_ENGLISH_PATTERNS = [
  /\b(?:speak|talk|use|switch\s+to)\s+(?:in\s+)?english\b/i,
  /\b(?:kasa|ka)\s+brɔfo\b/i,
  /\b(?:kasa|ka)\s+english\b/i,
  /\benglish\s+kɛkɛ\b/i,
];

const EXPLICIT_TWI_PATTERNS = [
  /\b(?:speak|talk|use|switch\s+to)\s+(?:in\s+)?twi\b/i,
  /\b(?:kasa|ka)\s+twi\b/i,
  /\btwi\s+kɛkɛ\b/i,
  /\bme\s+pɛ\s+twi\b/i,
];

export class LanguagePolicyEngine {
  private dialectProfiles = new Map<LanguageId, DialectProfile>();
  private readonly LOCK_CONFIDENCE_THRESHOLD = 0.80;
  private readonly SUSTAINED_TURNS_REQUIRED = 2;

  constructor() {
    this.registerBuiltInDialects();
  }

  private registerBuiltInDialects(): void {
    // 1. Asante Twi (Default Akan dialect)
    this.registerDialect({
      dialectId: 'twi-asante',
      name: 'Asante Twi',
      parentLanguage: 'twi',
      lexicalMarkers: ['mane', 'kɔma', 'sika', 'cedi', 'yoo', 'aane', 'daabi', 'dabi', 'ɛyɛ', 'bisa', 'tie'],
      phoneticMarkers: ['ɛ', 'ɔ'],
    });

    // 2. Ghanaian English
    this.registerDialect({
      dialectId: 'en',
      name: 'Ghanaian English',
      parentLanguage: 'en',
      lexicalMarkers: ['send', 'transfer', 'cedis', 'balance', 'please', 'yes', 'no', 'confirm', 'okay'],
    });

    // 3. Ghanaian Code-Switching (Twi base + English terms)
    this.registerDialect({
      dialectId: 'mixed-twi-en',
      name: 'Ghanaian Code-Switching (Twi + English)',
      parentLanguage: 'twi',
      lexicalMarkers: ['send', 'transfer', 'cedis', 'okay', 'please', 'mane', 'kɔma', 'sika', 'yoo'],
    });

    // 4. Akuapem Twi (Pluggable profile)
    this.registerDialect({
      dialectId: 'twi-akuapem',
      name: 'Akuapem Twi',
      parentLanguage: 'twi',
      lexicalMarkers: ['soma', 'kɔma', 'sika', 'yoo', 'yiwe', 'dabi', 'ampa', 'kasa'],
      phoneticMarkers: ['ɛ', 'ɔ'],
      isPluggable: true,
    });
  }

  /**
   * Registers a new or custom dialect profile without modifying core logic.
   */
  public registerDialect(profile: DialectProfile): void {
    this.dialectProfiles.set(profile.dialectId, profile);
  }

  public getDialect(id: LanguageId): DialectProfile | undefined {
    return this.dialectProfiles.get(id);
  }

  /**
   * Detects explicit user voice instructions to switch session language.
   */
  public checkExplicitRequest(transcript: string): LanguageId | null {
    const text = transcript.trim().toLowerCase();
    for (const pattern of EXPLICIT_ENGLISH_PATTERNS) {
      if (pattern.test(text)) return 'en';
    }
    for (const pattern of EXPLICIT_TWI_PATTERNS) {
      if (pattern.test(text)) return 'twi-asante';
    }
    return null;
  }

  /**
   * Resolves session language and target reply language based on locking and switching rules.
   */
  public resolveLanguage(input: LanguageResolutionInput): LanguageResolutionResult {
    const { transcript, detectedLanguage, detectedConfidence, currentSessionLanguage } = input;
    let consecutiveCount = input.consecutiveCandidateCount || 0;
    let candidate = input.candidateLanguage;

    // Rule 1: Explicit user request takes immediate effect
    const explicitRequested = this.checkExplicitRequest(transcript);
    if (explicitRequested && explicitRequested !== currentSessionLanguage) {
      return {
        sessionLanguage: explicitRequested,
        targetLanguage: resolveTargetDialect(explicitRequested, detectedLanguage),
        replyLanguage: explicitRequested,
        switched: true,
        switchReason: 'EXPLICIT_USER_REQUEST',
        consecutiveCandidateCount: 0,
        candidateLanguage: undefined,
      };
    }

    // Rule 2: Code-switching mirroring
    // If the caller mixes Twi and English, the target language is Twi,
    // keeping English loanwords Ghanaians naturally use (cedis, MoMo, send, ok).
    if (detectedLanguage === 'mixed-twi-en') {
      const activeSession = currentSessionLanguage || 'twi-asante';
      return {
        sessionLanguage: activeSession,
        targetLanguage: resolveTargetDialect(activeSession, 'mixed-twi-en'),
        replyLanguage: 'mixed-twi-en',
        switched: false,
        switchReason: 'MAINTAINED',
        consecutiveCandidateCount: 0,
        candidateLanguage: undefined,
      };
    }

    // Rule 3: Initial session lock if not yet locked
    if (!currentSessionLanguage || currentSessionLanguage === 'unknown' as any) {
      const initial = detectedConfidence >= 0.5 ? detectedLanguage : 'en';
      return {
        sessionLanguage: initial,
        targetLanguage: resolveTargetDialect(initial, detectedLanguage),
        replyLanguage: initial,
        switched: true,
        switchReason: 'INITIAL_LOCK',
        consecutiveCandidateCount: 0,
        candidateLanguage: undefined,
      };
    }

    // Rule 4: If detected language matches current session language, reset consecutive counter
    if (detectedLanguage === currentSessionLanguage) {
      return {
        sessionLanguage: currentSessionLanguage,
        targetLanguage: resolveTargetDialect(currentSessionLanguage, detectedLanguage),
        replyLanguage: currentSessionLanguage,
        switched: false,
        switchReason: 'MAINTAINED',
        consecutiveCandidateCount: 0,
        candidateLanguage: undefined,
      };
    }

    // Rule 5: Sustained evidence check
    // Switch ONLY after two consecutive turns of confident evidence in the new language
    if (detectedConfidence >= this.LOCK_CONFIDENCE_THRESHOLD) {
      if (candidate === detectedLanguage) {
        consecutiveCount += 1;
      } else {
        candidate = detectedLanguage;
        consecutiveCount = 1;
      }

      if (consecutiveCount >= this.SUSTAINED_TURNS_REQUIRED) {
        return {
          sessionLanguage: detectedLanguage,
          targetLanguage: resolveTargetDialect(detectedLanguage, detectedLanguage),
          replyLanguage: detectedLanguage,
          switched: true,
          switchReason: 'SUSTAINED_EVIDENCE',
          consecutiveCandidateCount: 0,
          candidateLanguage: undefined,
        };
      }
    } else {
      // Low confidence does not count towards sustained evidence
      consecutiveCount = 0;
      candidate = undefined;
    }

    // Rule 6: Maintain locked session language against single noisy turn
    return {
      sessionLanguage: currentSessionLanguage,
      targetLanguage: resolveTargetDialect(currentSessionLanguage, detectedLanguage),
      replyLanguage: currentSessionLanguage,
      switched: false,
      switchReason: 'MAINTAINED',
      consecutiveCandidateCount: consecutiveCount,
      candidateLanguage: candidate,
    };
  }
}

export const languagePolicy = new LanguagePolicyEngine();
