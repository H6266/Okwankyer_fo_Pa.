/**
 * Ɔkwankyerɛfo Pa - Build & Startup Linguistic Approval Validator
 * 
 * Verifies that:
 * 1. Every approved entry in data/reviewed_templates.json has reviewer, reviewedAt, and contentHash.
 * 2. Any edit to templates, numberVectors.json, or numberLexicon.ts invalidates approvals.
 * 3. In production, build/startup fails if unapproved/invalidated entries are marked approved.
 */

import { approvalWorkflow } from '../src/ai_system/brain/approvalWorkflow';
import { APPROVED_REPLY_TEMPLATES } from '../src/ai_system/brain/replyTemplates';
import { validateProductionModelConfig } from '../src/ai_system/brain/brain';

export function runBuildApprovalValidation(): { valid: boolean; errors: string[] } {
  console.log('🔍 [BuildValidator] Validating linguistic approvals and content hashes...');
  
  // Validate production model config if explicitly requested or running startup check
  if (process.env.CHECK_MODEL_CONFIG === 'true') {
    validateProductionModelConfig();
  }

  // 2. Validate linguistic approvals
  const result = approvalWorkflow.validateProductionApprovals(
    undefined,
    APPROVED_REPLY_TEMPLATES
  );

  if (!result.valid) {
    console.error('❌ [BuildValidator] Linguistic approval validation failed:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  } else {
    console.log('✓ [BuildValidator] All linguistic approvals and content hashes verified successfully.');
  }

  return result;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('validate_approvals')) {
  runBuildApprovalValidation();
}
