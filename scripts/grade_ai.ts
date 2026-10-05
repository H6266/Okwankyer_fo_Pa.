/**
 * Evidence summary for the AI stack. This intentionally does not issue a score:
 * the repository does not yet have validated production acceptance criteria
 * across all the dimensions previously listed in this report.
 */
import { runEvaluationHarness } from "../src/ai_eval/evalHarness";
import { aiSafety } from "../src/ai_system/core/aiSafety";
import { DataLicenseGate } from "../DATA_LICENSE_GATE";

async function reportEvidence(): Promise<void> {
  const evaluation = await runEvaluationHarness();
  const datasets = DataLicenseGate.auditAllDatasets();
  const pinProbe = aiSafety.detectSpokenPin("my pin is 9988");
  const amountProbe = aiSafety.detectSpokenPin("send 500 cedis");

  console.log("AI evidence summary (not a product score)");
  console.log("==========================================");
  console.log(
    `Intent harness: ${evaluation.correctClassifications}/${evaluation.totalUtterances} ` +
    `(${evaluation.accuracyPercent}%) on the repository's labeled text corpus.`,
  );
  console.log(`Intent mismatches: ${evaluation.failures.length}`);
  console.log(
    `Dataset registry: ${datasets.totalDatasets} entries; ` +
    `${datasets.nonCommercialRestrictedCount} non-commercial/restricted; ` +
    `${datasets.productionTrainingApprovedCount} approved for production training.`,
  );
  console.log(`Spoken-PIN probe blocked: ${pinProbe}`);
  console.log(`Ordinary money-amount probe allowed: ${!amountProbe}`);
  console.log("\nThese checks do not establish production readiness or a 10/10 rating.");
}

reportEvidence().catch((error: unknown) => {
  console.error("Evidence report failed:", error);
  process.exitCode = 1;
});
