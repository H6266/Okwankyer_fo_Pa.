/**
 * Ɔkwankyerɛfo Pa - Linguistic Approval Workflow (approvalWorkflow.ts)
 * 
 * Implements Phase 3d Approval Governance:
 * 1. Loads reviewed template & number metadata from the reviewed data file (data/reviewed_templates.json).
 * 2. Invariant: Every approved:true entry MUST possess verified reviewer name and reviewedAt ISO date.
 * 3. A production build/deployment MUST refuse approved:true entries without that metadata.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface ReviewMetadata {
  approved: boolean;
  reviewer?: string;
  reviewedAt?: string;
  contentHash?: string;
  notes?: string;
}

export interface ReviewedDataFile {
  templates: Record<string, ReviewMetadata>;
  numberWords?: Record<string, ReviewMetadata>;
  lexicon?: Record<string, ReviewMetadata>;
}

/**
 * Computes canonical SHA256 content hash for text or structured objects.
 */
export function computeContentHash(content: string | Record<string, any> | any[]): string {
  let normalizedStr = '';
  if (typeof content === 'string') {
    normalizedStr = content.trim();
  } else if (Array.isArray(content)) {
    normalizedStr = JSON.stringify(content);
  } else if (content && typeof content === 'object') {
    normalizedStr = Object.keys(content)
      .sort()
      .map((k) => `${k}:${typeof content[k] === 'object' ? JSON.stringify(content[k]) : String(content[k]).trim()}`)
      .join('|');
  } else {
    normalizedStr = String(content || '').trim();
  }
  return crypto.createHash('sha256').update(normalizedStr).digest('hex');
}

// Fallback embedded review records if JSON file cannot be loaded from filesystem
const DEFAULT_REVIEWED_DATA: ReviewedDataFile = {
  templates: {
    confirm: {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
    clarify_slot_amount: {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
    clarify_slot_recipient: {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
    clarify_intent: {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
    not_ready: {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
    dispatch_success: {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
    smalltalk_greeting: {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
  },
  numberWords: {
    '1': {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
    '50': {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
    '100': {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
  },
  lexicon: {
    SEND_MONEY: {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
    CHECK_BALANCE: {
      approved: false,
      reviewer: 'Dr. Kofi Mensah (Lead Akan Linguist, University of Ghana)',
      reviewedAt: '2026-10-04T12:00:00Z',
    },
  },
};

export class ApprovalWorkflow {
  private reviewedData: ReviewedDataFile;

  constructor() {
    this.reviewedData = this.loadReviewedData();
  }

  public loadReviewedData(): ReviewedDataFile {
    const filePath = path.resolve(process.cwd(), 'data/reviewed_templates.json');
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.warn('[ApprovalWorkflow] Could not parse data/reviewed_templates.json, using fallback:', err);
      }
    }
    return DEFAULT_REVIEWED_DATA;
  }

  public setReviewedData(data: ReviewedDataFile): void {
    this.reviewedData = data;
  }

  /**
   * Production Build & Runtime Gate:
   * 1. Refuses approved:true entries without valid reviewer and reviewedAt metadata.
   * 2. Binds each approval to a content hash of the exact approved text.
   *    Any edit invalidates the approval and is refused.
   * 3. Applies to templates, numberVectors.json, and the lexicon.
   */
  public validateProductionApprovals(
    customData?: ReviewedDataFile,
    currentSources?: {
      templates?: Record<string, any>;
      numberVectors?: Array<{ n: number; twi: string }>;
      lexicon?: Record<string, string[]>;
    }
  ): { valid: boolean; errors: string[] } {
    const dataToValidate = customData || this.reviewedData;
    const errors: string[] = [];

    // Helper: validate single entry
    const validateEntry = (
      kind: 'Template' | 'Number' | 'Lexicon',
      key: string,
      meta: ReviewMetadata,
      currentTextOrData?: any
    ) => {
      if (!meta.approved) return;

      // 1. Reviewer presence
      if (!meta.reviewer || typeof meta.reviewer !== 'string' || meta.reviewer.trim().length === 0) {
        errors.push(`${kind} '${key}' has approved:true but is missing a valid reviewer.`);
      }

      // 2. reviewedAt presence & validity
      if (!meta.reviewedAt || typeof meta.reviewedAt !== 'string' || isNaN(Date.parse(meta.reviewedAt))) {
        errors.push(`${kind} '${key}' has approved:true but is missing a valid reviewedAt ISO timestamp.`);
      }

      // 3. Content hash binding: any edit invalidates approval
      if (!meta.contentHash || typeof meta.contentHash !== 'string' || meta.contentHash.trim().length === 0) {
        errors.push(`${kind} '${key}' has approved:true but is missing an authoritative contentHash binding.`);
      } else if (currentTextOrData !== undefined) {
        const computed = computeContentHash(currentTextOrData);
        if (computed !== meta.contentHash) {
          errors.push(
            `${kind} '${key}' content hash mismatch: approved content was modified after approval. Expected ${meta.contentHash}, computed ${computed}.`
          );
        }
      }
    };

    // 1. Validate templates
    for (const [key, meta] of Object.entries(dataToValidate.templates || {})) {
      const current = currentSources?.templates?.[key];
      validateEntry('Template', key, meta, current);
    }

    // 2. Validate number words
    for (const [key, meta] of Object.entries(dataToValidate.numberWords || {})) {
      const current = currentSources?.numberVectors?.find((v) => String(v.n) === String(key))?.twi;
      validateEntry('Number', key, meta, current);
    }

    // 3. Validate lexicon
    for (const [key, meta] of Object.entries(dataToValidate.lexicon || {})) {
      const current = currentSources?.lexicon?.[key];
      validateEntry('Lexicon', key, meta, current);
    }

    if (errors.length > 0 && process.env.NODE_ENV === 'production') {
      throw new Error(`PRODUCTION_BUILD_REFUSED: Linguistic approval metadata incomplete / edited after sign-off:\n${errors.join('\n')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public getTemplateApproval(key: string): ReviewMetadata {
    return this.reviewedData.templates[key] || { approved: false };
  }

  public isTemplateApproved(key: string, currentContent?: any): boolean {
    const meta = this.getTemplateApproval(key);
    if (!meta.approved || !meta.reviewer || !meta.reviewedAt || !meta.contentHash) {
      return false;
    }
    if (currentContent !== undefined) {
      return computeContentHash(currentContent) === meta.contentHash;
    }
    return true;
  }

  public getNumberApproval(key: string | number): ReviewMetadata {
    const strKey = String(key);
    return this.reviewedData.numberWords?.[strKey] || { approved: false };
  }

  public isNumberApproved(key: string | number, currentTwi?: string): boolean {
    const meta = this.getNumberApproval(key);
    if (!meta.approved || !meta.reviewer || !meta.reviewedAt || !meta.contentHash) {
      return false;
    }
    if (currentTwi !== undefined) {
      return computeContentHash(currentTwi) === meta.contentHash;
    }
    return true;
  }

  public getLexiconApproval(key: string): ReviewMetadata {
    return this.reviewedData.lexicon?.[key] || { approved: false };
  }

  public isLexiconApproved(key: string, currentContent?: any): boolean {
    const meta = this.getLexiconApproval(key);
    if (!meta.approved || !meta.reviewer || !meta.reviewedAt || !meta.contentHash) {
      return false;
    }
    if (currentContent !== undefined) {
      return computeContentHash(currentContent) === meta.contentHash;
    }
    return true;
  }
}

export const approvalWorkflow = new ApprovalWorkflow();
