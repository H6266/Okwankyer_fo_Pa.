/**
 * Ɔkwankyerɛfo Pa - Pilot Operational Metrics Report CLI
 * (scripts/report_pilot_metrics.ts)
 * 
 * Summarizes operational KPIs (Zero-PII):
 * - Turn latency distribution (p50, p95, p99)
 * - Model timeout rate & offline fallback rate
 * - Clarification loops per call & DTMF fallback rate
 * - Abandonment rate before confirmation
 * - Payment outcome distribution
 * 
 * Executable via: `npx tsx scripts/report_pilot_metrics.ts`
 */

import { pilotMetrics } from '../src/services/pilotMetrics';

export function printMetricsReport(): void {
  const report = pilotMetrics.getMetricsReport();

  console.log('='.repeat(72));
  console.log("Ɔkwankyerɛfo Pa - Pilot Operational Metrics Report (Zero-PII)");
  console.log('='.repeat(72));
  console.log(`Reporting Period Start : ${report.periodStart}`);
  console.log(`Total Handled Calls    : ${report.totalCalls}`);
  console.log(`Total Processed Turns  : ${report.totalTurns}`);
  console.log('-'.repeat(72));

  console.log('1. Turn Latencies (Speech-to-Decision):');
  console.log(`   - p50 (Median)      : ${report.turnLatency.p50} ms`);
  console.log(`   - p95               : ${report.turnLatency.p95} ms`);
  console.log(`   - p99               : ${report.turnLatency.p99} ms`);
  console.log(`   - Average           : ${report.turnLatency.avg} ms`);
  console.log(`   - Samples Recorded  : ${report.turnLatency.count}`);

  console.log('\n2. Model Reliability & Fallback:');
  console.log(`   - Model Invocations : ${report.model.totalCalls}`);
  console.log(`   - Successes         : ${report.model.success}`);
  console.log(`   - Timeouts          : ${report.model.timeouts} (${report.model.timeoutRate}%)`);
  console.log(`   - Offline Fallbacks : ${report.fallbacks.total} (${report.fallbacks.fallbackRate}% of turns)`);

  console.log('\n3. Clarification & Keypad Fallback:');
  console.log(`   - Clarification Loops : ${report.clarifications.totalLoops}`);
  console.log(`   - Average Loops / Call: ${report.clarifications.avgLoopsPerCall}`);
  console.log(`   - Max Loops in 1 Call : ${report.clarifications.maxLoopsInCall}`);
  console.log(`   - Calls >= 3 Loops    : ${report.clarifications.callsExceedingThreshold}`);
  console.log(`   - DTMF Fallback Count : ${report.fallbacks.dtmfFallbacks} (${report.fallbacks.dtmfFallbackRate}% of calls)`);

  console.log('\n4. Abandonment Before Confirmation:');
  console.log(`   - Abandoned Calls   : ${report.abandonment.abandonedBeforeConfirmation} (${report.abandonment.abandonmentRate}% of calls)`);

  console.log('\n5. Payment Outcome Distribution:');
  for (const [status, count] of Object.entries(report.paymentOutcomes)) {
    console.log(`   - ${status.padEnd(30)}: ${count}`);
  }

  console.log('='.repeat(72));
}

// Execute directly if run via CLI
if (process.argv[1]?.includes('report_pilot_metrics')) {
  printMetricsReport();
}
