/**
 * Ɔkwankyerɛfo Pa - Linguistic Approval Workflow (approvalWorkflow.ts)
 * 
 * Implements Phase 3d Approval Governance:
 * 1. Loads reviewed template & number metadata from the reviewed data file (data/reviewed_templates.json).
 * 2. Invariant: Every approved:true entry MUST possess verified reviewer name and reviewedAt ISO date.
 * 3. A production build/deployment MUST refuse approved:true entries without that metadata.
 */

import fs from 'fs';
import path from 'path';

export interface ReviewMetadata {
  approved: boolean;
  reviewer?: string;
  reviewedAt?: string;
  notes?: string;
}

export interface ReviewedDataFile {
  templates: Record<string, ReviewMetadata>;
  numberWords?: Record<string, ReviewMetadata>;
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
   * A production build must refuse approved:true entries without valid reviewer and reviewedAt metadata.
   */
  public validateProductionApprovals(customData?: ReviewedDataFile): { valid: boolean; errors: string[] } {
    const dataToValidate = customData || this.reviewedData;
    const errors: string[] = [];

    // 1. Validate templates
    for (const [key, meta] of Object.entries(dataToValidate.templates || {})) {
      if (meta.approved) {
        if (!meta.reviewer || typeof meta.reviewer !== 'string' || meta.reviewer.trim().length === 0) {
          errors.push(`Template '${key}' has approved:true but is missing a valid reviewer.`);
        }
        if (!meta.reviewedAt || typeof meta.reviewedAt !== 'string' || isNaN(Date.parse(meta.reviewedAt))) {
          errors.push(`Template '${key}' has approved:true but is missing a valid reviewedAt ISO timestamp.`);
        }
      }
    }

    // 2. Validate number words
    for (const [key, meta] of Object.entries(dataToValidate.numberWords || {})) {
      if (meta.approved) {
        if (!meta.reviewer || typeof meta.reviewer !== 'string' || meta.reviewer.trim().length === 0) {
          errors.push(`Number '${key}' has approved:true but is missing a valid reviewer.`);
        }
        if (!meta.reviewedAt || typeof meta.reviewedAt !== 'string' || isNaN(Date.parse(meta.reviewedAt))) {
          errors.push(`Number '${key}' has approved:true but is missing a valid reviewedAt ISO timestamp.`);
        }
      }
    }

    if (errors.length > 0 && process.env.NODE_ENV === 'production') {
      throw new Error(`PRODUCTION_BUILD_REFUSED: Linguistic approval metadata incomplete:\n${errors.join('\n')}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public getTemplateApproval(key: string): ReviewMetadata {
    return this.reviewedData.templates[key] || { approved: false };
  }

  public isTemplateApproved(key: string): boolean {
    const meta = this.getTemplateApproval(key);
    return Boolean(meta.approved && meta.reviewer && meta.reviewedAt);
  }

  public getNumberApproval(key: string | number): ReviewMetadata {
    const strKey = String(key);
    return this.reviewedData.numberWords?.[strKey] || { approved: false };
  }

  public isNumberApproved(key: string | number): boolean {
    const meta = this.getNumberApproval(key);
    return Boolean(meta.approved && meta.reviewer && meta.reviewedAt);
  }
}

export const approvalWorkflow = new ApprovalWorkflow();
