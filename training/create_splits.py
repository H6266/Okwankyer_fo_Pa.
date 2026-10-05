#!/usr/bin/env python3
"""
Ɔkwankyerɛfo Pa - Speaker-Disjoint Split Generator (create_splits.py)

Enforces:
1. Zero speaker overlap between train, validation, and test splits
2. Stratified intent distribution across splits
3. Deterministic pseudo-random seeding for reproducibility
"""

import json
import random
import argparse
import os
from collections import defaultdict
from typing import List, Dict, Any

def create_splits(data: List[Dict[str, Any]], train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, seed=42):
    ratios = (train_ratio, val_ratio, test_ratio)
    if any(ratio <= 0 for ratio in ratios) or abs(sum(ratios) - 1.0) > 1e-9:
        raise ValueError("train/validation/test ratios must be positive and sum to 1.0")
    # Group examples by speaker ID to prevent speaker leakage
    speaker_map = defaultdict(list)
    for idx, item in enumerate(data):
        speaker = item.get("speaker_id")
        if not isinstance(speaker, str) or not speaker.strip():
            raise ValueError(f"Example {idx} has no real speaker_id; cannot claim speaker-disjoint evaluation")
        speaker = speaker.strip()
        speaker_map[speaker].append(item)

    speakers = sorted(speaker_map)
    if len(speakers) < 3:
        raise ValueError("At least three distinct real speakers are required for non-empty disjoint splits")
    random.Random(seed).shuffle(speakers)

    n_total = len(speakers)
    n_train = int(n_total * train_ratio)
    n_val = int(n_total * val_ratio)

    train_spks = set(speakers[:n_train])
    val_spks = set(speakers[n_train:n_train + n_val])
    test_spks = set(speakers[n_train + n_val:])

    if not train_spks or not val_spks or not test_spks:
        raise ValueError("Ratios and speaker count produced an empty split")

    train_set = [item for spk in sorted(train_spks) for item in speaker_map[spk]]
    val_set = [item for spk in sorted(val_spks) for item in speaker_map[spk]]
    test_set = [item for spk in sorted(test_spks) for item in speaker_map[spk]]

    if (train_spks & val_spks) or (train_spks & test_spks) or (val_spks & test_spks):
        raise AssertionError("Speaker leakage detected after split construction")

    return train_set, val_set, test_set


def balance_report(splits):
    report = {}
    for name, examples in splits.items():
        intents = defaultdict(int)
        languages = defaultdict(int)
        for item in examples:
            intents[str(item.get("intent", "UNKNOWN"))] += 1
            languages[str(item.get("language", "UNKNOWN"))] += 1
        report[name] = {
            "samples": len(examples),
            "speakers": len({item["speaker_id"].strip() for item in examples}),
            "intent_counts": dict(sorted(intents.items())),
            "language_counts": dict(sorted(languages.items())),
        }
    return report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Create speaker-disjoint dataset splits")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-prefix", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        corpus = json.load(f)

    train, val, test = create_splits(corpus)
    os.makedirs(os.path.dirname(os.path.abspath(args.output_prefix)), exist_ok=True)
    subsets = {"train": train, "val": val, "test": test}

    for name, subset in subsets.items():
        out_path = f"{args.output_prefix}_{name}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(subset, f, indent=2, ensure_ascii=False)
        print(f"✓ Wrote {len(subset)} examples to {out_path}")

    with open(f"{args.output_prefix}_report.json", "w", encoding="utf-8") as f:
        json.dump({"seed": 42, "speaker_disjoint": True, "splits": balance_report(subsets)}, f, indent=2, ensure_ascii=False)
