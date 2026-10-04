/**
 * Ɔkwankyerɛfo Pa - Strict Data License Gate (DATA_LICENSE_GATE.ts)
 * 
 * Enforces Section 13 Licensing Invariant:
 * Datasets with non-commercial licenses (e.g. CC BY-NC 4.0) must NEVER be included
 * in production training weights or commercial deployment pipelines.
 */

export type LicenseType = 
  | "MIT" 
  | "Apache-2.0" 
  | "CC-BY-4.0" 
  | "CC-BY-NC-4.0" 
  | "CC-BY-SA-4.0" 
  | "OpenRAIL" 
  | "Proprietary" 
  | "Custom-Permissive";

export type DatasetTier = "GOLD" | "SILVER" | "BRONZE";

export interface DatasetLicenseRecord {
  id: string;
  name: string;
  source: string;
  url: string;
  license: LicenseType;
  commercialUseAllowed: boolean;
  tier: DatasetTier;
  language: string[];
  modality: "speech" | "text" | "parallel" | "audio-tts";
  approvedForProductionTraining: boolean;
  approvedForResearchAndEval: boolean;
  notes: string;
}

export const REGISTERED_DATASETS: Record<string, DatasetLicenseRecord> = {
  "ghana-speech": {
    id: "ghana-speech",
    name: "Ghana Speech (GhanaNLP Community)",
    source: "huggingface.co/datasets/ghananlpcommunity/ghana-speech",
    url: "https://huggingface.co/datasets/ghananlpcommunity/ghana-speech",
    license: "CC-BY-4.0",
    commercialUseAllowed: true,
    tier: "SILVER", // 2,200+ hours across 40+ Ghanaian languages; great coverage, community reviewed
    language: ["tw", "ak", "ee", "dag", "en-GH"],
    modality: "speech",
    approvedForProductionTraining: true,
    approvedForResearchAndEval: true,
    notes: "Primary corpus for Ghanaian acoustic adaptation and multilingual ASR. Not treated as gold truth without speaker isolation.",
  },
  "ghana-codeswitch-ipa": {
    id: "ghana-codeswitch-ipa",
    name: "Ghana English-Twi Code-Switching Speech IPA",
    source: "huggingface.co/datasets/ghananlpcommunity/Ghana_English-Twi_Code-switching_Speech-ipa",
    url: "https://huggingface.co/datasets/ghananlpcommunity/Ghana_English-Twi_Code-switching_Speech-ipa",
    license: "CC-BY-4.0",
    commercialUseAllowed: true,
    tier: "GOLD", // Human verified, phonetically transcribed with IPA alignments and explicit speaker splits
    language: ["en-GH", "tw", "en-tw"],
    modality: "speech",
    approvedForProductionTraining: true,
    approvedForResearchAndEval: true,
    notes: "Gold standard for English-Twi code-switching and pronunciation adaptation. Partitioned by speaker.",
  },
  "pristine-twi": {
    id: "pristine-twi",
    name: "Pristine Twi Text Corpus",
    source: "huggingface.co/datasets/ghananlpcommunity/pristine-twi",
    url: "https://huggingface.co/datasets/ghananlpcommunity/pristine-twi",
    license: "CC-BY-NC-4.0", // HARD GATE: Non-commercial only
    commercialUseAllowed: false,
    tier: "SILVER",
    language: ["tw", "ak"],
    modality: "text",
    approvedForProductionTraining: false, // STRICTLY PROHIBITED IN COMMERCIAL PRODUCTION WEIGHTS
    approvedForResearchAndEval: true,
    notes: "High quality text for language modeling research and offline evaluation only. Commercial production training gate rejects this dataset.",
  },
  "twi-english-reasoning-sft-mix": {
    id: "twi-english-reasoning-sft-mix",
    name: "Twi-English Reasoning SFT Mix",
    source: "huggingface.co/datasets/ghananlpcommunity/twi-english-reasoning-sft-mix",
    url: "https://huggingface.co/datasets/ghananlpcommunity/twi-english-reasoning-sft-mix",
    license: "CC-BY-NC-4.0",
    commercialUseAllowed: false,
    tier: "BRONZE",
    language: ["tw", "en", "en-tw"],
    modality: "text",
    approvedForProductionTraining: false,
    approvedForResearchAndEval: true,
    notes: "Experimental reasoning instruction mix. Restricted to research/offline exploration due to NC license and machine-translation components.",
  },
  "ghana-farmer-qa-twi": {
    id: "ghana-farmer-qa-twi",
    name: "Ghana Farmer QA Twi",
    source: "huggingface.co/datasets/ghananlpcommunity/ghana-farmer-qa-twi",
    url: "https://huggingface.co/datasets/ghananlpcommunity/ghana-farmer-qa-twi",
    license: "CC-BY-SA-4.0",
    commercialUseAllowed: true,
    tier: "BRONZE", // Machine translated Twi; strictly weak supervision, NOT gold linguistic benchmark
    language: ["tw"],
    modality: "text",
    approvedForProductionTraining: false, // Rejected as gold training data
    approvedForResearchAndEval: true,
    notes: "Contains agricultural domain terminology. Weak supervision only; never use as sole gold linguistic benchmark.",
  },
  "ghok-chat": {
    id: "ghok-chat",
    name: "Ghanaian Conversational Chat Mix",
    source: "huggingface.co/datasets/ghananlpcommunity/ghok-chat",
    url: "https://huggingface.co/datasets/ghananlpcommunity/ghok-chat",
    license: "Apache-2.0",
    commercialUseAllowed: true,
    tier: "BRONZE", // Synthetic dialogue data
    language: ["en-GH", "tw"],
    modality: "text",
    approvedForProductionTraining: false,
    approvedForResearchAndEval: true,
    notes: "Synthetic conversational dialogue. Weakly labeled; filtered through strict PII redactor.",
  },
  "okwankyerɛfo-gold-financial-corpus": {
    id: "okwankyerɛfo-gold-financial-corpus",
    name: "Ɔkwankyerɛfo Pa Gold Financial & IVR Corpus",
    source: "internal://data/okwankyerɛfo_pa/domain_corpus.json",
    url: "https://github.com/H6266/Okwankyer_fo_Pa",
    license: "Apache-2.0",
    commercialUseAllowed: true,
    tier: "GOLD", // Project-specific curated Ghanaian MoMo financial voice and keypad intents
    language: ["en-GH", "tw", "ak", "en-tw"],
    modality: "parallel",
    approvedForProductionTraining: true,
    approvedForResearchAndEval: true,
    notes: "Project-specific benchmark for Ghanaian mobile money voice commands, corrections, zero-PIN guards, and phone numbers.",
  },
};

export class DataLicenseGate {
  /**
   * Validates whether a dataset can be included in production training runs.
   * Throws an explicit error if a non-commercial or unauthorized dataset is targeted.
   */
  public static assertProductionTrainingApproved(datasetId: string): DatasetLicenseRecord {
    const record = REGISTERED_DATASETS[datasetId];
    if (!record) {
      throw new Error(`[DATA_LICENSE_GATE] Unknown dataset '${datasetId}'. Must be registered in DATA_LICENSE_GATE.ts.`);
    }

    if (!record.commercialUseAllowed) {
      throw new Error(
        `[DATA_LICENSE_GATE VIOLATION] Dataset '${datasetId}' has non-commercial license '${record.license}'. ` +
        `It is strictly forbidden in production training weights (Section 13 Invariant).`
      );
    }

    if (!record.approvedForProductionTraining) {
      throw new Error(
        `[DATA_LICENSE_GATE VIOLATION] Dataset '${datasetId}' (Tier: ${record.tier}) is not approved for production training.`
      );
    }

    return record;
  }

  /**
   * Validates dataset inclusion for research, offline experimentation, and benchmarking.
   */
  public static assertResearchOrEvalApproved(datasetId: string): DatasetLicenseRecord {
    const record = REGISTERED_DATASETS[datasetId];
    if (!record) {
      throw new Error(`[DATA_LICENSE_GATE] Unknown dataset '${datasetId}'.`);
    }

    if (!record.approvedForResearchAndEval) {
      throw new Error(`[DATA_LICENSE_GATE] Dataset '${datasetId}' is not approved for evaluation or research.`);
    }

    return record;
  }

  /**
   * Returns a complete audit report of all known datasets and their licensing compliance.
   */
  public static auditAllDatasets(): {
    totalDatasets: number;
    commercialApprovedCount: number;
    nonCommercialRestrictedCount: number;
    goldTierCount: number;
    silverTierCount: number;
    bronzeTierCount: number;
    records: DatasetLicenseRecord[];
  } {
    const records = Object.values(REGISTERED_DATASETS);
    return {
      totalDatasets: records.length,
      commercialApprovedCount: records.filter((r) => r.approvedForProductionTraining).length,
      nonCommercialRestrictedCount: records.filter((r) => !r.commercialUseAllowed).length,
      goldTierCount: records.filter((r) => r.tier === "GOLD").length,
      silverTierCount: records.filter((r) => r.tier === "SILVER").length,
      bronzeTierCount: records.filter((r) => r.tier === "BRONZE").length,
      records,
    };
  }
}
