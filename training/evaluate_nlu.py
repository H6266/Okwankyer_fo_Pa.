#!/usr/bin/env python3
"""Evaluate intent accuracy with the same scorer used by the NLU trainer."""

import json
import argparse
from typing import List, Dict, Any

if __package__:
    from .train_nlu import predict_nlu_artifact
else:
    from train_nlu import predict_nlu_artifact


def summarize_intent_predictions(expected: List[str], predicted: List[str]) -> Dict[str, Any]:
    if len(expected) != len(predicted):
        raise ValueError("Expected and predicted intent lists must have the same length")

    labels = sorted(set(expected) | set(predicted))
    confusion = {actual: {guess: 0 for guess in labels} for actual in labels}
    for actual, guess in zip(expected, predicted):
        confusion[actual][guess] += 1

    per_intent = {}
    for label in labels:
        true_positive = confusion[label][label]
        support = sum(confusion[label].values())
        predicted_count = sum(confusion[actual][label] for actual in labels)
        false_negative = support - true_positive
        false_positive = predicted_count - true_positive
        precision = true_positive / predicted_count if predicted_count else 0.0
        recall = true_positive / support if support else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        per_intent[label] = {
            "accuracy_percent": round(recall * 100, 2),
            "precision_percent": round(precision * 100, 2),
            "recall_percent": round(recall * 100, 2),
            "f1_percent": round(f1 * 100, 2),
            "count": support,
            "false_positives": false_positive,
            "false_negatives": false_negative,
        }

    total = len(expected)
    correct = sum(confusion[label][label] for label in labels)
    macro = {
        metric: round(
            sum(per_intent[label][f"{metric}_percent"] for label in labels) / len(labels), 2
        ) if labels else 0.0
        for metric in ("precision", "recall", "f1")
    }

    return {
        "total_test_samples": total,
        "correct_predictions": correct,
        "overall_accuracy_percent": round(correct / total * 100, 2) if total else 0.0,
        "macro_precision_percent": macro["precision"],
        "macro_recall_percent": macro["recall"],
        "macro_f1_percent": macro["f1"],
        "per_intent_breakdown": per_intent,
        "confusion_matrix": confusion,
    }


def evaluate(test_examples: List[Dict[str, Any]], model_artifact_path: str):
    with open(model_artifact_path, "r", encoding="utf-8") as f:
        model = json.load(f)

    expected_intents = []
    predicted_intents = []

    for ex in test_examples:
        text = ex["text"]
        expected = ex["intent"]
        pred_intent, _ = predict_nlu_artifact(model, text)
        expected_intents.append(expected)
        predicted_intents.append(pred_intent)

    return summarize_intent_predictions(expected_intents, predicted_intents)

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

    print(
        f"Evaluation Complete: accuracy={rep['overall_accuracy_percent']}%, "
        f"macro-F1={rep['macro_f1_percent']}% "
        f"({rep['correct_predictions']}/{rep['total_test_samples']})"
    )
