/**
 * Ɔkwankyerɛfo Pa - AI Evaluation Runner Script
 * Runs empirical NLU evaluation on English, Akan Twi, and Code-Switching corpora.
 */

import { runEvaluationHarness } from "../src/ai_eval/evalHarness";

async function main() {
  console.log("📊 Running Ɔkwankyerɛfo Pa Empirical AI Evaluation Harness...\n");
  const start = performance.now();
  const report = await runEvaluationHarness();
  const duration = Math.round(performance.now() - start);

  console.log("==================================================");
  console.log("            EVALUATION REPORT SUMMARY             ");
  console.log("==================================================");
  console.log(`Total Test Utterances:       ${report.totalUtterances}`);
  console.log(`Correct Classifications:    ${report.correctClassifications}`);
  console.log(`Intent Accuracy:            ${report.accuracyPercent}%`);
  console.log(`Out-of-Scope Fallback Rate: ${report.fallbackRatePercent}%`);
  console.log(`Financial Slots Gated:      ${report.financialSafelyGatedCount} / ${report.financialSlotCount}`);
  console.log(`Elapsed Benchmark Time:     ${duration} ms`);
  console.log("==================================================\n");

  if (report.failures.length > 0) {
    console.log(`⚠️ Mismatches (${report.failures.length}):`);
    for (const f of report.failures) {
      console.log(`  - [${f.id}] "${f.text}": expected=${f.expected}, actual=${f.actual} (conf=${f.confidence})`);
    }
  } else {
    console.log("✓ Zero classification failures across gold test corpus.");
  }

  if (report.accuracyPercent < 85) {
    console.error(`❌ Evaluation failed: Accuracy ${report.accuracyPercent}% is below target threshold of 85%.`);
    process.exit(1);
  }

  console.log(`\n✅ Evaluation PASSED with ${report.accuracyPercent}% accuracy.`);
}

main().catch((err) => {
  console.error("Evaluation script encountered fatal error:", err);
  process.exit(1);
});
