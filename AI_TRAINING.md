# Ɔkwankyerɛfo Pa - Training & Fine-Tuning Architecture (AI_TRAINING.md)

## Current Implementation Status (2026-10-18)

- `training/train_nlu.py` trains a standalone Naive Bayes intent artifact from an explicitly supplied JSON corpus. It is not loaded by the live `AiEngine` or `LocalLanguageBrain`.
- Production training now fails closed unless the dataset manifest records production approval, commercial permission, text/parallel modality, source checksum, exact reviewed training-split checksum, consent review, PII review, source, and provenance.
- No dataset currently meets that gate for NLU. The production-approved English-Twi code-switch dataset is speech-only; the text/dialogue datasets are not approved for production training. Do not train a production artifact from user, simulator, payment-sandbox, or ASR-feedback records.
- `training/evaluate_nlu.py` uses the trainer's tokenizer and intent scorer, but reports intent accuracy only. Its softmax score is not calibrated, and it is not a release benchmark.
- `models/manifest.json` records no verified trained artifacts. No training result or accuracy claim is currently available.
- ASR corrections require explicit consent and are stored separately; they do not automatically enter training. Any later corpus build still requires human label review, data minimization, license/provenance review, speaker-safe splits where applicable, and a held-out evaluation set.

## 1. Principles of Compact & Specialized Training
Rather than attempting to train a multi-billion parameter general model from scratch, Ɔkwankyerɛfo Pa employs a modular training strategy:
- **Task-Specific NLU Classifiers**: High-speed, lightweight intent classifiers (<15MB, <10ms CPU inference).
- **Sequence Labeling Slot Extractors**: Specialized token classifiers for Ghanaian phone numbers, monetary amounts, and telco networks.
- **LoRA / QLoRA Adapters**: Parameter-efficient fine-tuning on compact base models (e.g., MiniCPM-1B, Llama-3.2-1B) using Ghanaian bilingual instruction data.
- **Phoneme & Acoustic Aligners**: Fast acoustic feature extractors for 8 kHz telephony voice inputs.
- **Decoupled Training**: Training pipelines are strictly offline and separated from production inference.

---

## 2. Target Directory Layout & Pipeline Scripts

The following describes the intended architecture, not the current checked-in directory structure. Only the listed scripts below are currently present; other stages require implementation.

```
training/
├── datasets/                Raw and cached dataset downloads
├── manifests/               Dataset manifests with SHA-256 and speaker splits
├── preprocess/              Normalization, IPA conversion, audio resampling
├── deduplicate/             MinHash and exact deduplication
├── pii_redaction/           Automated scrubber for phone numbers and names
├── split/                   Strict disjoint speaker train/val/test splits
├── asr/                     Acoustic model fine-tuning & CTC export
├── nlu/                     Intent classifier & slot model training
├── dialogue/                Multi-turn conversation policy optimization
├── tts/                     Phoneme dictionary & voice profile training
├── checkpoints/             Versioned model weights
└── export/                  Quantized ONNX and CPU-optimized runtime artifacts
```

### Existing Training Pipeline Scripts:
- `training/download_datasets.py`: Resumable dataset acquisition with hash verification.
- `training/redact_pii.py`: Scrubbing of sensitive identifiers prior to ingestion.
- `training/create_splits.py`: Enforces zero speaker leakage across train and test sets.
- `training/train_nlu.py`: Trains the local intent classification and entity extraction models.
- `training/evaluate_nlu.py`: Evaluates intent accuracy using the trainer's shared scoring implementation; does not report calibrated confidence or a full release scorecard.
- `training/export_model.py`: Generates versioned `models/` manifests for deployment.

Slot-model training, speech fine-tuning, dialogue-policy optimization, model compilation, and live inference integration remain planned work unless separately implemented and validated.
