# Model and system card: Ɔkwankyerɛfo Pa

**Updated:** 2026-10-05
**Model type:** Repository application containing deterministic TypeScript rules, optional external model adapters, and separately configured speech workers. This repository does not contain a trained local NLU model artifact.

## Intended use

The software is intended to explore accessible voice/text interaction for Ghanaian digital services. It is not approved for production financial execution. The local language code is a lexical rule system and is not a validated model for Asante/Akuapem Twi or Ghanaian English.

## Components

- Local understanding: phrase rules, normalization, number parsing, and deterministic safety checks. Language coverage and extraction quality have not been empirically established.
- Optional Gemini adapter: external cloud service, requires credentials/network, and must not authorize or execute financial actions.
- Local ASR: optional faster-whisper worker; no model weights or verified Ghanaian-language model are bundled.
- Local TTS: optional Piper worker. Piper voice language/quality depends on the separately selected model. Fixed prompt recordings are human studio speech, not neural TTS.

## Training data and licensing

No trained model weights are produced by the application in this repository. Dataset manifests record allowed research/evaluation uses; they do not prove that a dataset was used to train a model. Non-commercial datasets must remain excluded from commercial training. See [DATA_GOVERNANCE.md](DATA_GOVERNANCE.md) and `DATASET_MANIFEST.json` for current source/license review.

## Evaluation

No reproducible held-out evaluation artifact is available for this card. Intent accuracy, slot F1, ASR WER/CER, calibration, latency, and security interception percentages are therefore **not reported**. Historical numbers without reproducible artifacts were removed or invalidated. The current test additions were not run in this environment because dependencies are not installed.

## Safety and limitations

- Model output is untrusted and cannot authorize payments.
- Transfer completion requires terminal provider status, `real_provider` source, and a provider financial transaction ID.
- Production memory uses local encrypted file storage; it is single-host and not a shared multi-instance database.
- Payment route consolidation, provider webhook replay protection, full Ghanaian-language empirical evaluation, and production readiness remain incomplete.

**Release status:** Not production-ready. No aggregate score is assigned.
