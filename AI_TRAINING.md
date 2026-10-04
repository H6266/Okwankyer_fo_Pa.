# Ɔkwankyerɛfo Pa - Training & Fine-Tuning Architecture (AI_TRAINING.md)

## 1. Principles of Compact & Specialized Training
Rather than attempting to train a multi-billion parameter general model from scratch, Ɔkwankyerɛfo Pa employs a modular training strategy:
- **Task-Specific NLU Classifiers**: High-speed, lightweight intent classifiers (<15MB, <10ms CPU inference).
- **Sequence Labeling Slot Extractors**: Specialized token classifiers for Ghanaian phone numbers, monetary amounts, and telco networks.
- **LoRA / QLoRA Adapters**: Parameter-efficient fine-tuning on compact base models (e.g., MiniCPM-1B, Llama-3.2-1B) using Ghanaian bilingual instruction data.
- **Phoneme & Acoustic Aligners**: Fast acoustic feature extractors for 8 kHz telephony voice inputs.
- **Decoupled Training**: Training pipelines are strictly offline and separated from production inference.

---

## 2. Directory Layout & Pipeline Scripts

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

### Key Training Pipeline Scripts:
- `training/download_datasets.py`: Resumable dataset acquisition with hash verification.
- `training/redact_pii.py`: Scrubbing of sensitive identifiers prior to ingestion.
- `training/create_splits.py`: Enforces zero speaker leakage across train and test sets.
- `training/train_nlu.py`: Trains the local intent classification and entity extraction models.
- `training/train_slot_model.py`: Fine-tunes token sequence tagging for amounts and phones.
- `training/build_local_model.py`: Compiles lexical graphs and quantized weights.
- `training/export_model.py`: Generates versioned `models/` manifests for deployment.
