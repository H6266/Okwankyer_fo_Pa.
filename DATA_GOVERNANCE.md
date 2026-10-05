# Dataset governance status

**Updated:** 2026-10-05
This document distinguishes dataset-card licensing from verified provenance, consent, data quality, and actual project use. Registry inclusion is not evidence that the project downloaded, evaluated, or trained on a dataset.

## Current dataset declarations

The current source/license declarations are recorded in `DATASET_MANIFEST.json` and `DATA_LICENSE_GATE.ts`. External dataset cards were reviewed for the license changes in this branch; release contents, provenance, consent, and quality still require dataset-specific review before use.

| Dataset | Declared license | Production training status | Current limits |
|---|---|---|---|
| Ghana Speech (`ghananlpcommunity/ghana-speech`) | CC BY-NC 4.0 | Prohibited | Research/evaluation only; verify release, consent, and sample-level restrictions. |
| Ghana English-Twi Code-Switching Speech IPA | Apache-2.0 | License gate permits, but no production training is established | Check exact release contents, provenance, consent, and quality before acquisition or use. |
| Pristine Twi | CC BY-NC 4.0 | Prohibited | Non-commercial research scope only. |
| Twi-English Reasoning SFT Mix | CC BY-NC 4.0 | Prohibited | Non-commercial restriction; translation quality and data provenance remain to be assessed. |
| Ghana Farmer QA Twi | CC BY-SA 4.0 | Not approved by the current gate | Review share-alike obligations, translation quality, provenance, and intended use. |
| GhOk Chat | Apache-2.0 declared | Not approved by the current gate | Synthetic dialogue; verify source, generation method, and PII handling. |
| Internal financial corpus | Unverified | Prohibited pending review | Rights, provenance, consent, and any personal data have not been established. |

Dataset checksums in the repository are `null` until downloaded artifacts are actually acquired and hashed. They must not be invented or represented by placeholder hashes.

## Speaker split requirements

`training/create_splits.py` now requires a non-empty real `speaker_id` for every example and fails closed when one is absent. It creates speaker-disjoint splits and emits sample/speaker/intent/language counts. This code has not been executed in the current environment. A split report is not proof that the source speaker IDs are correct or that dataset licenses permit the use.

## Privacy and retention

- Do not place raw PINs, credentials, or unnecessary raw caller audio in training or evaluation datasets.
- Do not use production interactions for training by default. Any future use requires documented consent, purpose, retention, redaction, access controls, and legal review.
- PII redaction scripts are not a substitute for human review or source-dataset authorization.

## Current model-use declaration

The repository does not contain verified trained weights derived from the listed datasets. The deterministic local language code is not a trained model. ASR/TTS models are external configurable artifacts and require their own checksum, license, commercial-use decision, language support, runtime validation, and benchmark record before deployment.

## Validation

Run `npm run ai:data:validate` after installing dependencies. The dataset gate checks manifest/license consistency and non-commercial restrictions; it does not independently verify the upstream dataset card, checksum, consent, or speaker identity. No dataset acquisition or training pipeline is approved solely by a passing manifest check.
