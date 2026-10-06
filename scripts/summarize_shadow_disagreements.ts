/**
 * Ɔkwankyerɛfo Pa - Shadow Mode Disagreements Summary Tool
 * (scripts/summarize_shadow_disagreements.ts)
 * 
 * Analyzes persisted shadow disagreements (ZERO PII) and reports:
 * - Total evaluations vs total disagreements
 * - Disagreement rate by type (INTENT_MISMATCH, DECISION_KIND_MISMATCH, SLOT_PRESENCE_MISMATCH)
 * - Disagreement rate by language (en, twi-asante, mixed-twi-en)
 * - Disagreement breakdown by intent (momo.transfer, momo.check_balance, etc.)
 */

import fs from 'fs';
import path from 'path';

interface ShadowDisagreementLog {
  id: string;
  timestamp: string;
  language: string;
  turnId?: number;
  offlineDecision: {
    intent?: string;
    kind: string;
    hasAmount: boolean;
    hasRecipientPhone: boolean;
  };
  modelDecision: {
    intent?: string;
    confidence?: number;
    kind?: string;
    hasAmount: boolean;
    hasRecipientPhone: boolean;
  };
  disagreementType: 'INTENT_MISMATCH' | 'DECISION_KIND_MISMATCH' | 'SLOT_PRESENCE_MISMATCH';
}

export function summarizeShadowDisagreements(logFilePath?: string): {
  total: number;
  byType: Record<string, { count: number; percentage: string }>;
  byLanguage: Record<string, { count: number; percentage: string }>;
  byIntent: Record<string, { count: number; percentage: string }>;
} {
  const file = logFilePath || path.resolve(process.cwd(), 'data/shadow_disagreements.json');
  if (!fs.existsSync(file)) {
    return {
      total: 0,
      byType: {},
      byLanguage: {},
      byIntent: {},
    };
  }

  let logs: ShadowDisagreementLog[] = [];
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    if (raw.trim()) {
      logs = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to read shadow disagreement file:', err);
    return { total: 0, byType: {}, byLanguage: {}, byIntent: {} };
  }

  const total = logs.length;
  if (total === 0) {
    return { total: 0, byType: {}, byLanguage: {}, byIntent: {} };
  }

  const typeCounts: Record<string, number> = {};
  const langCounts: Record<string, number> = {};
  const intentCounts: Record<string, number> = {};

  for (const log of logs) {
    // 1. By Type
    const type = log.disagreementType || 'UNKNOWN';
    typeCounts[type] = (typeCounts[type] || 0) + 1;

    // 2. By Language
    const lang = log.language || 'unknown';
    langCounts[lang] = (langCounts[lang] || 0) + 1;

    // 3. By Intent (Offline ground truth intent)
    const intent = log.offlineDecision?.intent || 'unknown';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }

  const byType: Record<string, { count: number; percentage: string }> = {};
  for (const [k, count] of Object.entries(typeCounts)) {
    byType[k] = { count, percentage: `${((count / total) * 100).toFixed(1)}%` };
  }

  const byLanguage: Record<string, { count: number; percentage: string }> = {};
  for (const [k, count] of Object.entries(langCounts)) {
    byLanguage[k] = { count, percentage: `${((count / total) * 100).toFixed(1)}%` };
  }

  const byIntent: Record<string, { count: number; percentage: string }> = {};
  for (const [k, count] of Object.entries(intentCounts)) {
    byIntent[k] = { count, percentage: `${((count / total) * 100).toFixed(1)}%` };
  }

  return { total, byType, byLanguage, byIntent };
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = summarizeShadowDisagreements();
  console.log('====================================================');
  console.log('Ɔkwankyerɛfo Pa - Shadow Disagreement Summary Report');
  console.log('====================================================');
  console.log(`Total Logged Disagreements: ${summary.total}\n`);

  console.log('--- Disagreement by Type ---');
  for (const [type, data] of Object.entries(summary.byType)) {
    console.log(`  ${type.padEnd(25)}: ${data.count} (${data.percentage})`);
  }

  console.log('\n--- Disagreement by Language ---');
  for (const [lang, data] of Object.entries(summary.byLanguage)) {
    console.log(`  ${lang.padEnd(25)}: ${data.count} (${data.percentage})`);
  }

  console.log('\n--- Disagreement by Ground Truth Intent ---');
  for (const [intent, data] of Object.entries(summary.byIntent)) {
    console.log(`  ${intent.padEnd(25)}: ${data.count} (${data.percentage})`);
  }
  console.log('====================================================');
}
