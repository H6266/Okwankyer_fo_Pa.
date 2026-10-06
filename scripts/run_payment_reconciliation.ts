/**
 * Ɔkwankyerɛfo Pa - Payment Reconciliation Script
 * (scripts/run_payment_reconciliation.ts)
 * 
 * Scans durable transaction store for payments stuck in PENDING status.
 * Reconciles with provider status and expires overdue dangling transactions (>5m).
 * 
 * Executable via: `npx tsx scripts/run_payment_reconciliation.ts`
 */

import { paymentReconciliation } from '../src/services/paymentReconciliation';

export async function runReconciliationCLI(): Promise<void> {
  console.log('='.repeat(72));
  console.log("Ɔkwankyerɛfo Pa - Payment Reconciliation Scanner");
  console.log('='.repeat(72));

  const timeoutMinutes = 5;
  console.log(`Scanning for transactions stuck in PENDING status > ${timeoutMinutes} minutes...`);

  const report = await paymentReconciliation.reconcilePendingPayments(timeoutMinutes * 60 * 1000);

  console.log(`Scan completed at      : ${report.timestamp}`);
  console.log(`Total Pending Scanned  : ${report.totalPendingScanned}`);
  console.log(`Successfully Reconciled: ${report.reconciledCount}`);
  console.log(`Flagged / Expired      : ${report.flaggedCount}`);
  console.log('-'.repeat(72));

  if (report.results.length === 0) {
    console.log("✓ All transactions reconciled clean. Zero dangling payments detected.");
  } else {
    console.log("Reconciliation Details:");
    for (const res of report.results) {
      console.log(`  - Ref: ${res.referenceId.slice(0, 16)} | Session: ${res.sessionId.slice(0, 16)}`);
      console.log(`    State: ${res.previousState} -> ${res.resolvedState} (Age: ${res.ageMinutes}m)`);
      console.log(`    Notes: ${res.notes}`);
    }
  }

  console.log('='.repeat(72));
}

if (process.argv[1]?.includes('run_payment_reconciliation')) {
  runReconciliationCLI().catch((err) => {
    console.error("Reconciliation execution failed:", err);
    process.exit(1);
  });
}
