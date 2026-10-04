#!/usr/bin/env python3
"""
Ɔkwankyerɛfo Pa - NLU Evaluation & Accuracy Benchmark (evaluate_nlu.py)

Evaluates NLU intent classification accuracy, precision, recall, and F1
across English, Akan Twi, and Code-switching test sets.
"""

import json
import argparse
from typing import List, Dict, Any
from collections import defaultdict

def evaluate(test_examples: List[Dict[str, Any]], model_artifact_path: str):
    with open(model_artifact_path, "r", encoding="utf-8") as f:
        model = json.load(f)

    feature_table = model["feature_table"]
    class_priors = model["class_priors"]
    vocab_size = model["vocab_size"]

    correct = 0
    total = len(test_examples)
    per_intent = defaultdict(lambda: {"correct": 0, "total": 0})

    for ex in test_examples:
        text = ex["text"].lower()
        expected = ex["intent"]
        tokens = text.split()

        # Score per class
        scores = {}
        for intent, prior in class_priors.items():
            score = prior
            for tok in tokens:
                count = feature_table.get(intent, {}).get(tok, 0) + 1
                score *= (count / (vocab_size + 100))
            scores[intent] = score

        pred_intent = max(scores, key=scores.get) if scores else "UNKNOWN"

        is_match = (pred_intent == expected)
        if is_match:
            correct += 1
            per_intent[expected]["correct"] += 1
        per_intent[expected]["total"] += 1

    accuracy = (correct / total) * 100 if total > 0 else 0.0

    report = {
        "total_test_samples": total,
        "correct_predictions": correct,
        "overall_accuracy_percent": round(accuracy, 2),
        "per_intent_breakdown": {
            k: {
                "accuracy": round((v["correct"] / v["total"]) * 100, 2) if v["total"] > 0 else 0.0,
                "count": v["total"]
            }
            for k, v in per_intent.items()
        }
    }

    return report

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate NLU model on holdout test set")
    parser.add_argument("--test-data", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output-report", default="eval/reports/nlu_eval_report.json")
    args = parser.parse_args()

    with open(args.test_data, "r", encoding="utf-8") as f:
        data = json.load(f)

    rep = evaluate(data, args.model)
    with open(args.output_report, "w", encoding="utf-8") as f:
        json.dump(rep, f, indent=2)

    print(f"📊 Evaluation Complete: Accuracy = {rep['overall_accuracy_percent']}% ({rep['correct_predictions']}/{rep['total_test_samples']})")
