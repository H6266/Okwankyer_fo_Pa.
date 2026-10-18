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
| `common-voice-akan` | `mozilla-foundation/common_voice_16_1` | CC0 | Akan Twi | Speech | Acoustic baseline & phone models |
| `google-fleurs-akan` | `google/fleurs` | CC-BY-4.0 | Akan Twi / Ghanaian English | Speech & Text | Multi-dialect benchmark & acoustic calibration |
| `ug-hci-speech-corpus` | `University of Ghana HCI Lab` | Academic / Evaluated | Akan Twi | Speech & Audio | Production native Akan ASR & TTS |
| `okwankyerɛfo-gold-financial-corpus` | Internal project data | Unverified / restricted | English, Twi, Code-Switch | IVR financial turns | Not approved for training or research pending rights, provenance, consent, and quality review |

Dataset terms can change. This table mirrors the repository manifest and registry where specified. No license label alone establishes that consent, privacy, or downstream-use requirements have been met.

---

## 3. Data Governance & Hygiene Invariants
1. **No Untrusted Runtime Learning**: Production models never mutate weights from live caller conversations.
2. **Strict PII Redaction**: Phone numbers, subscriber names, and any accidental credentials must be scrubbed before logging turns into the evaluation corpus.
3. **No License Mixing**: Commercially restricted datasets are isolated to research/benchmark tracks and are never exported into production binaries.
4. **Disjoint Speaker Splits**: The test set and training set must never share speakers.
