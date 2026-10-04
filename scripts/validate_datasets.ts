/**
 * Ɔkwankyerɛfo Pa - Dataset Licensing & Manifest Validation Script
 * Validates dataset licensing, commercial use compliance, and provenance.
 */

import fs from "fs";
import path from "path";
import { DataLicenseGate, REGISTERED_DATASETS } from "../DATA_LICENSE_GATE";

async function validateDatasets() {
  console.log("🔍 Validating Ɔkwankyerɛfo Pa Dataset Manifest and Licensing Gates...\n");

  const manifestPath = path.resolve(process.cwd(), "DATASET_MANIFEST.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("❌ Manifest file DATASET_MANIFEST.json not found!");
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  console.log(`Manifest Version: ${manifest.version} (${manifest.manifest_date})`);
  console.log(`Datasets Registered in Manifest: ${manifest.datasets.length}`);

  const audit = DataLicenseGate.auditAllDatasets();
  console.log(`Total Datasets in License Gate:   ${audit.totalDatasets}`);
  console.log(`Commercial Approved Datasets:     ${audit.commercialApprovedCount}`);
  console.log(`Non-Commercial Restricted:        ${audit.nonCommercialRestrictedCount}`);
  console.log(`Gold Tier Datasets:               ${audit.goldTierCount}`);
  console.log(`Silver Tier Datasets:             ${audit.silverTierCount}`);
  console.log(`Bronze Tier Datasets:             ${audit.bronzeTierCount}\n`);

  let errors = 0;

  for (const ds of manifest.datasets) {
    const gateRecord = REGISTERED_DATASETS[ds.id];
    if (!gateRecord) {
      console.error(`❌ Dataset '${ds.id}' in manifest is NOT registered in DATA_LICENSE_GATE.ts!`);
      errors++;
      continue;
    }

    if (ds.license !== gateRecord.license) {
      console.error(`❌ License mismatch for '${ds.id}': manifest=${ds.license}, gate=${gateRecord.license}`);
      errors++;
    }

    // Verify non-commercial invariant:
    if (ds.license.includes("NC") && ds.approved_for_training) {
      console.error(`❌ CRITICAL VIOLATION: Non-commercial dataset '${ds.id}' marked approved_for_training!`);
      errors++;
    } else {
      console.log(`  ✓ [${gateRecord.tier.padEnd(6)}] ${ds.id.padEnd(32)} -> License: ${ds.license.padEnd(12)} (Training Approved: ${ds.approved_for_training})`);
    }
  }

  if (errors > 0) {
    console.error(`\n❌ Dataset validation FAILED with ${errors} error(s).`);
    process.exit(1);
  }

  console.log("\n✅ All datasets validated. Non-commercial license gates strictly enforced.");
}

validateDatasets().catch((err) => {
  console.error("Fatal error validating datasets:", err);
  process.exit(1);
});
