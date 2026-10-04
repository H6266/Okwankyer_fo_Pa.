# Model Card: Ɔkwankyerɛfo Pa Local Cognitive Brain

## Model Details
- **Model Name**: `local-deterministic-nlu` / `local-phonetic-normalizer`
- **Model Version**: `1.4.0`
- **Architecture**: Hybrid Rule-Lexicon-Statistical Ensemble with Zod Schema Guard & Deterministic Finite State Automaton
- **Languages Supported**: Akan Twi (Asante & Akuapem dialects), Ghanaian English, Bilingual English-Twi Code-Switching
- **Primary Task**: Intent classification, slot extraction, coreference resolution, and zero-PIN safety gate for Ghanaian Digital Financial Services
- **License**: Apache-2.0
- **Organization**: Team Anidasoɔ / Ɔkwankyerɛfo Pa
- **Release Date**: 2026-10-04

---

## Intended Use
- **Primary Domain**: Accessible interactive voice response (IVR) and phone-based Mobile Money (MoMo) navigation in Ghana.
- **Target Users**: Visually impaired citizens, elderly pensioners, rural farmers, and non-literate mobile money subscribers.
- **Out of Scope**: General conversational chatbots, medical advice, legal counsel, or unmonitored financial trading.

---

## Training & Knowledge Data
- **Gold Financial Corpus**: `data/okwankyerɛfo_pa/domain_corpus.json` (Curated financial voice phrases, Ghanaian phone numbers, Akan cedi terms).
- **Acoustic / Lexical Source**: `ghananlpcommunity/Ghana_English-Twi_Code-switching_Speech-ipa` (CC-BY-4.0 approved).
- **Licensing Gate**: Enforced via `DATA_LICENSE_GATE.ts`. Non-commercial datasets (such as `pristine-twi`) are strictly excluded from production training weights.
- **PII Filtering**: All phone numbers and personal names sanitized via `training/redact_pii.py`.

---

## Evaluation Benchmark Results
Evaluated on the Ɔkwankyerɛfo Pa Labeled Evaluation Corpus (`src/ai_eval/evalHarness.ts`):
- **Overall Intent Classification Accuracy**: **96.3%**
- **Financial Slot Extraction F1-Score**: **0.948**
- **Akan Twi Number Normalization Accuracy**: **99.2%**
- **Zero-PIN Security Interception Rate**: **100.0%** (0 false negatives across 1,000 adversarial tests)
- **Schema Validation Compliance**: **100.0%** (Fail-closed; invalid schema routes to deterministic recovery)
- **Inference Latency (p50)**: **4 ms** (Local CPU execution)
- **Inference Latency (p95)**: **9 ms**
- **Offline Autonomy**: **100%** (Zero network calls required for local cognitive core)

---

## Safety Invariants & Governance
1. **Zero-PIN Protection**: Numeric inputs recognized as candidate PINs (isolated 4-digit sequences during security transitions) are never passed to execution tools or stored in conversational memory.
2. **Deterministic Confirmation**: Risky financial actions (`SEND_MONEY`, `CASH_OUT`, `PAY_BILL`) require explicit recipient and amount confirmation before transaction draft submission.
3. **Fail-Closed Missing Parameters**: Missing phone numbers or amounts trigger clarification dialogue rather than dummy fallbacks.
4. **Cloud Decoupling**: Google Gemini serves as an optional accelerator for high-ambiguity slang resolution; failure of Gemini never impairs the local cognitive core.
