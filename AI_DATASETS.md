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
| `ghana-speech-v1` | `ghananlpcommunity/ghana-speech` | CC-BY-4.0 | Akan Twi, Ghanaian English | Audio (8/16kHz) | ASR acoustic modeling & noise robustness |
| `ghana-cs-ipa-v1` | `ghananlpcommunity/Ghana_English-Twi_Code-switching_Speech-ipa` | CC-BY-4.0 | English-Twi Code-Switch | Audio & IPA | Code-switching phoneme alignment |
| `twi-tts-asr-v1` | `ghananlpcommunity/twi-tts-asr` | CC-BY-SA-4.0 | Asante / Akuapem Twi | Audio & Transcripts | Speech synthesis and acoustic validation |
| `pristine-twi-v1` | `ghananlpcommunity/pristine-twi` | Open Data Commons | Akan Twi | Monolingual Text | Language modeling & lexicon validation |
| `ghok-chat-v1` | `ghananlpcommunity/ghok-chat` | CC-BY-4.0 | Twi / Ghanaian English | Multi-turn Dialogue | Conversational flow & colloquial phrasing |
| `twi-en-reasoning-v1` | `ghananlpcommunity/twi-english-reasoning-sft-mix` | Apache-2.0 | Bilingual Code-Switch | Instruction / SFT | Compact SLM reasoning & intent parsing |
| `okwankyerɛfo-gold-v1`| Internal Hand-Curated Gold Corpus | Proprietary / CC-BY-4.0 | English, Twi, Code-Switch | IVR Financial Turns | Gold evaluation benchmark (16 intents) |

---

## 3. Data Governance & Hygiene Invariants
1. **No Untrusted Runtime Learning**: Production models never mutate weights from live caller conversations.
2. **Strict PII Redaction**: Phone numbers, subscriber names, and any accidental credentials must be scrubbed before logging turns into the evaluation corpus.
3. **No License Mixing**: Commercially restricted datasets are isolated to research/benchmark tracks and are never exported into production binaries.
4. **Disjoint Speaker Splits**: The test set and training set must never share speakers.
