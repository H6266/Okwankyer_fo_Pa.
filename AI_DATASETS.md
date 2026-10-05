# Ɔkwankyerɛfo Pa - Ghanaian Language & Speech Datasets (AI_DATASETS.md)

## 1. Dataset Strategy & Provenance
To achieve production-grade conversational and speech performance in Ghana without runtime dependencies on external services, Ɔkwankyerɛfo Pa curates and ingests verified Ghanaian speech, text, and financial dialogue corpora.

Every dataset tracked in the system must record:
- **Dataset ID**: Unique canonical identifier.
- **Source**: Host repository, organization, or collection agency.
- **License**: Explicit licensing terms (e.g., CC-BY-4.0, MIT, Research-Only).
- **Language / Dialect**: Asante Twi, Akuapem Twi, Ghanaian English, Code-Switching.
- **Domain**: Telephony, Financial Services, Agricultural Advisory, General Conversational.
- **Speaker Metadata**: Region, gender, age bracket (where consented).
- **Integrity**: SHA-256 checksum and version.

---

## 2. Ingested & Evaluated Resources

| Dataset ID | Source Repository | License | Language | Primary Modality | Application |
|---|---|---|---|---|---|
| `ghana-speech` | `ghananlpcommunity/ghana-speech` | CC-BY-NC-4.0 | Multiple Ghanaian languages | Speech | Research/evaluation only; no commercial production training |
| `ghana-codeswitch-ipa` | `ghananlpcommunity/Ghana_English-Twi_Code-switching_Speech-ipa` | Apache-2.0 | English-Twi | Speech & IPA | Use subject to dataset terms and documented speaker splits |
| `pristine-twi` | `ghananlpcommunity/pristine-twi` | CC-BY-NC-4.0 | Twi | Text | Non-commercial research/evaluation only |
| `twi-english-reasoning-sft-mix` | `ghananlpcommunity/twi-english-reasoning-sft-mix` | CC-BY-NC-4.0 | Twi / Ghanaian English | Instruction text | Research/evaluation only; no commercial production training |
| `ghana-farmer-qa-twi` | `ghananlpcommunity/ghana-farmer-qa-twi` | CC-BY-SA-4.0* | Twi | Text | Weak supervision; verify current terms before use |
| `ghok-chat` | `ghananlpcommunity/ghok-chat` | Apache-2.0* | Twi / Ghanaian English | Dialogue | Verify source terms and provenance before use |
| `okwankyerɛfo-gold-financial-corpus` | Internal project data | Unverified / restricted | English, Twi, Code-Switch | IVR financial turns | Not approved for training or research pending rights, provenance, consent, and quality review |

Dataset terms can change. This table mirrors the repository manifest and registry where specified; `*` marks values that require confirmation against the current source before ingestion. No license label alone establishes that consent, privacy, or downstream-use requirements have been met.

The current Ghana Speech card declares CC BY-NC 4.0, the English–Twi code-switching IPA card declares Apache-2.0, and the Pristine Twi card declares CC BY-NC 4.0. See their [source cards](https://huggingface.co/datasets/ghananlpcommunity/ghana-speech), [code-switching card](https://huggingface.co/datasets/ghananlpcommunity/Ghana_English-Twi_Code-switching_Speech-ipa), and [Pristine Twi card](https://huggingface.co/datasets/ghananlpcommunity/pristine-twi).

---

## 3. Data Governance & Hygiene Invariants
1. **No Untrusted Runtime Learning**: Production models never mutate weights from live caller conversations.
2. **Strict PII Redaction**: Phone numbers, subscriber names, and any accidental credentials must be scrubbed before logging turns into the evaluation corpus.
3. **No License Mixing**: Commercially restricted datasets are isolated to research/benchmark tracks and are never exported into production binaries.
4. **Disjoint Speaker Splits**: The test set and training set must never share speakers.
