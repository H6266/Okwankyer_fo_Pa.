import json
import tempfile
import unittest
from pathlib import Path

from training.evaluate_nlu import evaluate, summarize_intent_predictions
from training.train_nlu import NaiveBayesGhanaNLU


class EvaluateNluTests(unittest.TestCase):
    def test_evaluator_uses_the_trainer_tokenizer_and_scorer(self):
        examples = [
            {"text": "mepɛ sɛ mesoma sika", "intent": "SEND_MONEY"},
            {"text": "mepɛ sɛ mesoma sika kɔma Kwame", "intent": "SEND_MONEY"},
            {"text": "hwɛ sika dodoɔ", "intent": "CHECK_BALANCE"},
            {"text": "mepɛ sɛ mehwɛ sika dodoɔ", "intent": "CHECK_BALANCE"},
        ]
        model = NaiveBayesGhanaNLU()
        model.train(examples)
        artifact = {
            "class_priors": {
                intent: count / model.total_docs
                for intent, count in model.class_counts.items()
            },
            "feature_table": {
                intent: dict(features)
                for intent, features in model.feature_counts.items()
            },
            "vocab_size": len(model.vocab),
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            artifact_path = Path(temp_dir) / "model.json"
            artifact_path.write_text(json.dumps(artifact), encoding="utf-8")
            report = evaluate(examples, str(artifact_path))

        self.assertEqual(report["correct_predictions"], len(examples))
        self.assertEqual(report["overall_accuracy_percent"], 100.0)
        self.assertEqual(report["macro_f1_percent"], 100.0)

    def test_reports_per_intent_metrics_and_confusion_matrix(self):
        report = summarize_intent_predictions(
            ["SEND_MONEY", "SEND_MONEY", "CHECK_BALANCE", "CHECK_BALANCE"],
            ["SEND_MONEY", "CHECK_BALANCE", "CHECK_BALANCE", "UNKNOWN"],
        )

        self.assertEqual(report["overall_accuracy_percent"], 50.0)
        self.assertEqual(report["per_intent_breakdown"]["SEND_MONEY"]["precision_percent"], 100.0)
        self.assertEqual(report["per_intent_breakdown"]["SEND_MONEY"]["recall_percent"], 50.0)
        self.assertEqual(report["confusion_matrix"]["SEND_MONEY"]["CHECK_BALANCE"], 1)
        self.assertEqual(report["macro_f1_percent"], 38.89)


if __name__ == "__main__":
    unittest.main()