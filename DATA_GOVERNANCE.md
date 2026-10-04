# Ɔkwankyerɛfo Pa - Model Data Governance Framework (DATA_GOVERNANCE.md)

**Project**: Ɔkwankyerɛfo Pa ("The Good Guide")  
**Organization**: Team Anidasoɔ (Hope)  
**Classification**: Production Governance Standard  
**Revision Date**: 2026-10-04  

---

## 1. Governance Charter & Principles

Ɔkwankyerɛfo Pa processes spoken voice and financial interaction data for Ghanaian citizens, elderly pensioners, rural farmers, and visually impaired mobile money subscribers. Because financial speech interactions contain sensitive identifiers (names, recipient phone numbers, transaction amounts), data governance is enforced as an immutable technical gate rather than an aspirational policy.

### Core Governance Principles:
1. **Zero-PIN Storage Invariant**: Mobile money PINs and banking passcodes are NEVER recorded, transcribed, retained, cached, or utilized in model training under any circumstance.
2. **License Gate Strictness**: Datasets bearing Non-Commercial restrictions (such as `CC BY-NC 4.0`) are mathematically and programmatically blocked from commercial production model weights via `DATA_LICENSE_GATE.ts`.
3. **Epistemic Data Tiering**: Datasets are segregated into **GOLD** (human-verified, speaker-partitioned), **SILVER** (high-quality community-reviewed), and **BRONZE** (synthetic or machine-translated). Bronze data is NEVER used as an authoritative evaluation benchmark.
4. **Speaker-Disjoint Evaluation**: Evaluation partitions strictly guarantee that no speaker appearing in the training set appears in the benchmark test set.
5. **No Blind Production Ingestion**: Production user interactions NEVER automatically retrain models in an unsupervised loop. Telemetry is anonymized, consented, human-reviewed, and filtered before entering training datasets.

---

## 2. Dataset Inventory & Provenance Matrix

| Dataset ID | Modality | License | Commercial Permitted | Tier | Speaker Partitioning | Provenance | Approved Scope |
|---|---|---|---|---|---|---|---|
| **okwankyerɛfo-gold-financial-corpus** | Parallel Speech & Text | Apache-2.0 | **YES** | **GOLD** | Disjoint verified speaker groups | Team Anidasoɔ field research & verified Ghanaian MoMo transcripts | Production training, evaluation, unit testing |
| **ghana-codeswitch-ipa** | Speech & IPA | CC-BY-4.0 | **YES** | **GOLD** | Predefined speaker-disjoint splits | GhanaNLP Community academic research with human verification | Production acoustic adaptation, pronunciation modeling |
| **ghana-speech** | Audio Speech | CC-BY-4.0 | **YES** | **SILVER** | Multi-region crowd-sourced | 2,200+ hours across 40+ Ghanaian languages | General ASR pretraining & dialect adaptation |
| **pristine-twi** | Text Corpus | CC-BY-NC-4.0 | **NO (RESTRICTED)** | **SILVER** | N/A (written text) | GhanaNLP Akan text archive | **Academic research & offline experiments only** |
| **twi-english-reasoning-sft-mix** | Text / Instruction | CC-BY-NC-4.0 | **NO (RESTRICTED)** | **BRONZE** | N/A | Community instruction mix with partial machine translation | Offline reasoning experiments only |
| **ghana-farmer-qa-twi** | Text QA | CC-BY-SA-4.0 | **YES** | **BRONZE** | N/A | Machine-translated Twi agricultural Q&A | Weak supervision domain vocabulary only |
| **ghok-chat** | Text / Dialogue | Apache-2.0 | **YES** | **BRONZE** | Synthetic | Synthetic multi-turn Ghanaian conversation transcripts | Dialogue flow testing only; filtered for PII |

---

## 3. PII Handling & Data Scrubbing Standards

All datasets admitted into `data/` or `training/` must undergo rigorous programmatic sanitization:

1. **Phone Number Masking**: Spoken phone numbers in training datasets are replaced with standardized synthetic MSISDNs in the range `233240000000` to `233240000999`.
2. **Full Name Generalization**: Personal names are replaced with common Ghanaian archetypes (`Kwame`, `Ama`, `Kofi`, `Akosua`) drawn from `nameLexicon.ts` to prevent memorization of private identities.
3. **PIN Scrubbing**: Any audio segment or text containing the sequence "PIN", "passcode", or 4-digit numeric blocks spoken in isolation during a security step is discarded and permanently excised.
4. **Transaction IDs**: Real provider financial transaction IDs (e.g. MTN MoMo financialTransactionId) are replaced with synthetic RFC4122 v4 UUIDs.

---

## 4. Bias Assessment & Known Limitations

### 4.1 Dialect Representation
- **Asante Twi**: High representation (~65% of Twi corpus). Strongest performance on acoustic and language modeling.
- **Akuapem Twi**: Moderate representation (~35% of Twi corpus). Evaluated separately to ensure vocabulary variations (e.g., `dɛn` vs `deɛn`) are recognized without accuracy degradation.
- **Fante**: Candidate for future expansion; currently treated with acoustic dialect adaptation.

### 4.2 Acoustic Environment Robustness
- **Telephony Audio**: Standard mobile phone calls in Ghana operate on 8kHz narrowband or 16kHz AMR-WB codecs. Benchmarks explicitly resample evaluation audio to 8kHz to prevent lab-quality overfitting.
- **Background Noise**: High ambient noise in Ghanaian markets (Makola, Kejetia) and trotro stations is simulated using road and market noise augmentation in `training/create_splits.py`.

---

## 5. Model Release & Rollback Policy

No model or weights package may transition to `PRODUCTION` status in `MODEL_REGISTRY.json` unless:
1. **Safety Gate Verification**: Zero-PIN interception rate is strictly **100.0%** (0 false negatives).
2. **Intent Accuracy**: Greater than or equal to **95.0%** on the Gold Financial Corpus.
3. **Schema Compliance**: Schema validation failure rate is **0.0%**.
4. **Licensing Compliance**: Programmatic assertion via `DataLicenseGate.assertProductionTrainingApproved()` passes without warning.
5. **Rollback Plan**: Previous stable deterministic model (`local-deterministic-nlu`) remains preloaded in memory as the unconditional fallback.
