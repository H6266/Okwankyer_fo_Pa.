#!/usr/bin/env python3
"""
Ɔkwankyerɛfo Pa - NLU Intent & Classifier Trainer (train_nlu.py)

Trains lightweight Ghanaian NLU intent models with:
- Unigram and bigram lexical counts
- Softmax-normalized scores that remain uncalibrated
- Support for Asante Twi, Akuapem Twi, and Code-Switching
- A provenance-gated training artifact; live-runtime integration is separate work
"""

import json
import math
import argparse
import hashlib
import re
from pathlib import Path
from collections import defaultdict
from typing import List, Dict, Tuple


def tokenize_ghana_nlu(text: str) -> List[str]:
    words = text.lower().replace(",", " ").replace(".", " ").replace("?", " ").split()
    bigrams = [f"{words[index]}_{words[index + 1]}" for index in range(len(words) - 1)]
    return words + bigrams


def score_nlu_intent(
    class_priors: Dict[str, float],
    feature_table: Dict[str, Dict[str, int]],
    vocab_size: int,
    text: str,
) -> Tuple[str, float]:
    if not class_priors:
        return "UNKNOWN", 0.0

    tokens = tokenize_ghana_nlu(text)
    vocab_size = max(1, vocab_size)
    scores = {}

    for intent, prior in class_priors.items():
        log_probability = math.log(prior)
        intent_features = feature_table.get(intent, {})
        total_intent_tokens = sum(intent_features.values()) + vocab_size
        for token in tokens:
            token_count = intent_features.get(token, 0) + 1
            log_probability += math.log(token_count / total_intent_tokens)
        scores[intent] = log_probability

    max_log = max(scores.values())
    exp_scores = {intent: math.exp(score - max_log) for intent, score in scores.items()}
    total_exp = sum(exp_scores.values())
    best_intent = max(exp_scores, key=exp_scores.get)
    return best_intent, round(exp_scores[best_intent] / total_exp, 4)


def predict_nlu_artifact(model: Dict, text: str) -> Tuple[str, float]:
    return score_nlu_intent(
        model.get("class_priors", {}),
        model.get("feature_table", {}),
        model.get("vocab_size", 0),
        text,
    )


def validate_dataset_eligibility(
    manifest_path: str,
    dataset_id: str,
    training_data_path: str,
) -> Tuple[Dict, Dict]:
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    datasets = manifest.get("datasets") if isinstance(manifest, dict) else None
    if not isinstance(datasets, list):
        raise ValueError("Dataset manifest must contain a datasets array")

    dataset = next((item for item in datasets if isinstance(item, dict) and item.get("id") == dataset_id), None)
    if dataset is None:
        raise ValueError(f"Dataset '{dataset_id}' is not registered in the manifest")
    if dataset.get("approved_for_training") is not True:
        raise ValueError(f"Dataset '{dataset_id}' is not approved for production training")
    if dataset.get("commercial_use_allowed") is not True:
        raise ValueError(f"Dataset '{dataset_id}' is not approved for commercial use")

    license_name = str(dataset.get("license", ""))
    if "NC" in license_name.upper():
        raise ValueError(f"Non-commercial dataset '{dataset_id}' cannot be used for production training")
    if dataset.get("modality") not in {"text", "parallel"}:
        raise ValueError(f"Dataset '{dataset_id}' is not a text or parallel corpus for NLU training")

    checksum = dataset.get("checksum")
    if not isinstance(checksum, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", checksum):
        raise ValueError(f"Dataset '{dataset_id}' needs a verified SHA-256 checksum before training")
    training_checksum = dataset.get("training_split_sha256")
    if not isinstance(training_checksum, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", training_checksum):
        raise ValueError(f"Dataset '{dataset_id}' needs a reviewed training-split SHA-256 before training")
    actual_training_checksum = hashlib.sha256(Path(training_data_path).read_bytes()).hexdigest()
    if actual_training_checksum.lower() != training_checksum.lower():
        raise ValueError(f"Training corpus does not match the reviewed split for dataset '{dataset_id}'")
    if dataset.get("consent_verified") is not True:
        raise ValueError(f"Dataset '{dataset_id}' needs documented consent review before training")
    if dataset.get("pii_reviewed") is not True:
        raise ValueError(f"Dataset '{dataset_id}' needs PII review before training")
    if not dataset.get("provenance") or not dataset.get("source"):
        raise ValueError(f"Dataset '{dataset_id}' needs source and provenance metadata")

    return manifest, dataset

class NaiveBayesGhanaNLU:
    def __init__(self):
        self.class_counts = defaultdict(int)
        self.feature_counts = defaultdict(lambda: defaultdict(int))
        self.vocab = set()
        self.total_docs = 0

    def tokenize(self, text: str) -> List[str]:
        return tokenize_ghana_nlu(text)

    def train(self, examples: List[Dict[str, str]]):
        for ex in examples:
            intent = ex["intent"]
            tokens = self.tokenize(ex["text"])
            self.class_counts[intent] += 1
            self.total_docs += 1
            for tok in tokens:
                self.feature_counts[intent][tok] += 1
                self.vocab.add(tok)

    def predict(self, text: str) -> Tuple[str, float]:
        class_priors = {
            intent: count / self.total_docs
            for intent, count in self.class_counts.items()
        }
        return score_nlu_intent(class_priors, self.feature_counts, len(self.vocab), text)

def main():
    parser = argparse.ArgumentParser(description="Train lightweight Ghanaian NLU classifier")
    parser.add_argument("--train-data", required=True)
    parser.add_argument("--dataset-id", required=True, help="Approved source dataset ID from DATASET_MANIFEST.json")
    parser.add_argument(
        "--manifest",
        default=str(Path(__file__).resolve().parents[1] / "DATASET_MANIFEST.json"),
    )
    parser.add_argument("--output-model", default="models/ghana_nlu_v1.json")
    args = parser.parse_args()

    try:
        manifest, dataset = validate_dataset_eligibility(args.manifest, args.dataset_id, args.train_data)
    except (OSError, ValueError) as err:
        parser.error(str(err))

    with open(args.train_data, "r", encoding="utf-8") as f:
        corpus = json.load(f)
    if not isinstance(corpus, list) or not corpus:
        parser.error("Training corpus must be a non-empty JSON array")
    for index, example in enumerate(corpus):
        if not isinstance(example, dict) or not str(example.get("text", "")).strip() or not str(example.get("intent", "")).strip():
            parser.error(f"Training example {index} must contain non-empty text and intent fields")

    print(f"🏋️ Training NLU model on {len(corpus)} examples...")
    model = NaiveBayesGhanaNLU()
    model.train(corpus)

    model_artifact = {
        "model_type": "NAIVE_BAYES_N_GRAM_GHANA_NLU",
        "version": "1.0.0",
        "supported_intents": list(model.class_counts.keys()),
        "vocab_size": len(model.vocab),
        "total_documents": model.total_docs,
        "class_priors": {k: v / model.total_docs for k, v in model.class_counts.items()},
        "feature_table": {k: dict(v) for k, v in model.feature_counts.items()},
        "training_data": {
            "dataset_id": args.dataset_id,
            "source": dataset["source"],
            "license": dataset["license"],
            "source_sha256": dataset["checksum"],
            "training_split_sha256": hashlib.sha256(Path(args.train_data).read_bytes()).hexdigest(),
            "manifest_version": manifest.get("version"),
        },
    }

    with open(args.output_model, "w", encoding="utf-8") as f:
        json.dump(model_artifact, f, indent=2, ensure_ascii=False)

    print(f"✓ Model artifact exported to {args.output_model}")

if __name__ == "__main__":
    main()
