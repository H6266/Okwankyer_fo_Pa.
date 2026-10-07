/**
 * Ɔkwankyerɛfo Pa - Shadow Disagreement Summary Script
 * 
 * Computes and prints summary analytics of model vs offline disagreements:
 * - Overall disagreement rate
 * - Rate and breakdown by type (INTENT_MISMATCH, DECISION_KIND_MISMATCH, SLOT_PRESENCE_MISMATCH)
 * - Rate and breakdown by language
 * - Rate and breakdown by intent
 * 
 * Strict Invariant: Reads only ZERO-PII shadow logs.
 */

import fs from 'fs';
import path from 'path';
import { shadowEngine } from '../src/ai_system/brain/shadowEngine';

export interface ShadowSummaryReport {
  totalEvaluations: number;
  totalDisagreements: number;
  overallDisagreementRatePct: number;
  byType: Record<string, { count: number; pct: number }>;
  byLanguage: Record<string, { count: number; pct: number }>;
  byIntent: Record<string, { count: number; pct: number }>;
}

export function generateShadowSummary(customLogs?: any[]): ShadowSummaryReport {
  let logs: any[] = customLogs || [];
  if (!customLogs) {
    const filePath = path.resolve(process.cwd(), 'data/shadow_disagreements.json');
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        logs = JSON.parse(raw);
      } catch (err) {
        console.warn('Could not read data/shadow_disagreements.json:', err);
      }
    } else {
      logs = shadowEngine.getDisagreements();
    }
  }

  const totalDisagreements = logs.length;
  const totalEvaluations = Math.max(shadowEngine.getTotalEvaluations(), totalDisagreements, 1);
  const overallRate = (totalDisagreements / totalEvaluations) * 100;

  const typeCounts: Record<string, number> = {
    INTENT_MISMATCH: 0,
    DECISION_KIND_MISMATCH: 0,
    SLOT_PRESENCE_MISMATCH: 0,
  };
  const langCounts: Record<string, number> = {};
  const intentCounts: Record<string, number> = {};

  for (const log of logs) {
    if (log.disagreementType) {
      typeCounts[log.disagreementType] = (typeCounts[log.disagreementType] || 0) + 1;
    }
    const lang = log.language || 'unknown';
    langCounts[lang] = (langCounts[lang] || 0) + 1;

    const intent = log.offlineDecision?.intent || log.modelDecision?.intent || 'unknown';
    intentCounts[intent] = (intentCounts[intent] || 0) + 1;
  }

  const byType: Record<string, { count: number; pct: number }> = {};
  for (const [k, count] of Object.entries(typeCounts)) {
    byType[k] = {
      count,
      pct: totalDisagreements > 0 ? (count / totalDisagreements) * 100 : 0,
    };
  }

  const byLanguage: Record<string, { count: number; pct: number }> = {};
  for (const [k, count] of Object.entries(langCounts)) {
    byLanguage[k] = {
      count,
      pct: totalDisagreements > 0 ? (count / totalDisagreements) * 100 : 0,
    };
  }

  const byIntent: Record<string, { count: number; pct: number }> = {};
  for (const [k, count] of Object.entries(intentCounts)) {
    byIntent[k] = {
      count,
      pct: totalDisagreements > 0 ? (count / totalDisagreements) * 100 : 0,
    };
  }

  return {
    totalEvaluations,
    totalDisagreements,
    overallDisagreementRatePct: Number(overallRate.toFixed(2)),
    byType,
    byLanguage,
    byIntent,
  };
}

export function printShadowSummary(report: ShadowSummaryReport): void {
  console.log('===============================================================');
  console.log('      ƆKWANKYERƐFO PA - SHADOW EVALUATION SUMMARY REPORT      ');
  console.log('===============================================================');
  console.log(`Total Evaluations:     ${report.totalEvaluations}`);
  console.log(`Total Disagreements:   ${report.totalDisagreements}`);
  console.log(`Overall Disagreement:  ${report.overallDisagreementRatePct.toFixed(2)}%\n`);

  console.log('--- Disagreement By Type ---');
  for (const [t, data] of Object.entries(report.byType)) {
    console.log(`  • ${t.padEnd(25)}: ${String(data.count).padStart(3)} (${data.pct.toFixed(1)}%)`);
  }

  console.log('\n--- Disagreement By Language ---');
  for (const [lang, data] of Object.entries(report.byLanguage)) {
    console.log(`  • ${lang.padEnd(25)}: ${String(data.count).padStart(3)} (${data.pct.toFixed(1)}%)`);
  }

  console.log('\n--- Disagreement By Intent ---');
  for (const [intent, data] of Object.entries(report.byIntent)) {
    console.log(`  • ${intent.padEnd(25)}: ${String(data.count).padStart(3)} (${data.pct.toFixed(1)}%)`);
  }
  console.log('===============================================================\n');
}

// Execute if run directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('summarizeShadowDisagreements')) {
  const report = generateShadowSummary();
  printShadowSummary(report);
}
