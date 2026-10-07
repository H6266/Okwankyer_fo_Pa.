/**
 * Ɔkwankyerɛfo Pa - Phase 3d Approval Workflow Tests
 * (tests/phase3ApprovalWorkflow.test.ts)
 * 
 * Verifies:
 * 1. Approved flags are stored in the reviewed data file with reviewer and date per entry.
 * 2. Production build validation strictly refuses approved:true entries without that metadata.
 * 3. Verified entries with reviewer and reviewedAt pass validation.
 */

import { describe, it, expect } from 'vitest';
import { approvalWorkflow, ReviewedDataFile } from '../src/ai_system/brain/approvalWorkflow';

describe('Phase 3d: Approval Workflow & Build Gate', () => {

  it('loads valid review metadata from data file', () => {
    const data = approvalWorkflow.loadReviewedData();
    expect(data.templates).toBeDefined();
    expect(data.templates['confirm']).toBeDefined();
    expect(data.templates['confirm'].approved).toBe(false);
    expect(data.templates['confirm'].reviewer).toBeDefined();
    expect(data.templates['confirm'].reviewedAt).toBeDefined();
  });

  it('validates authentic approved entries with complete metadata', () => {
    const validData: ReviewedDataFile = {
      templates: {
        confirm: {
          approved: true,
          reviewer: 'Dr. Kofi Mensah',
          reviewedAt: '2026-10-04T12:00:00Z',
          contentHash: '3514b8ce998c71b6932e650ef802353160a0a520427dae9e7b2ff9f688e1465d',
        },
      },
    };

    const res = approvalWorkflow.validateProductionApprovals(validData);
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  it('refuses approved:true entries that lack a reviewer', () => {
    const invalidData: ReviewedDataFile = {
      templates: {
        confirm: {
          approved: true,
          reviewer: '', // Missing reviewer!
          reviewedAt: '2026-10-04T12:00:00Z',
        },
      },
    };

    const res = approvalWorkflow.validateProductionApprovals(invalidData);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('missing a valid reviewer'))).toBe(true);
  });

  it('refuses approved:true entries that lack a valid reviewedAt ISO timestamp', () => {
    const invalidData: ReviewedDataFile = {
      templates: {
        confirm: {
          approved: true,
          reviewer: 'Dr. Kofi Mensah',
          reviewedAt: 'invalid-date-string', // Malformed date!
        },
      },
    };

    const res = approvalWorkflow.validateProductionApprovals(invalidData);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('missing a valid reviewedAt ISO timestamp'))).toBe(true);
  });

  it('throws in production mode if unreviewed approved:true entries are present', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const badData: ReviewedDataFile = {
      templates: {
        unreviewed_hack: {
          approved: true,
          // Missing metadata
        },
      },
    };

    expect(() => {
      approvalWorkflow.validateProductionApprovals(badData);
    }).toThrow('PRODUCTION_BUILD_REFUSED');

    process.env.NODE_ENV = originalEnv;
  });
});
