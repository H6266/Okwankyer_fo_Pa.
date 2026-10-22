import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from training.train_nlu import validate_dataset_eligibility


class TrainNluGateTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        root = Path(self.temp_dir.name)
        self.manifest_path = root / "manifest.json"
        self.training_path = root / "train.json"
        self.training_path.write_text('[{"text":"mepɛ sɛ mesoma sika","intent":"SEND_MONEY"}]', encoding="utf-8")
        self.dataset = {
            "id": "approved-nlu",
            "source": "reviewed-project-corpus",
            "provenance": "review record 2026-01",
            "license": "Apache-2.0",
            "commercial_use_allowed": True,
            "approved_for_training": True,
            "modality": "text",
            "checksum": "a" * 64,
            "training_split_sha256": hashlib.sha256(self.training_path.read_bytes()).hexdigest(),
            "consent_verified": True,
            "pii_reviewed": True,
        }
        self.write_manifest(self.dataset)

    def tearDown(self):
        self.temp_dir.cleanup()

    def write_manifest(self, dataset):
        self.manifest_path.write_text(
            json.dumps({"version": "test", "datasets": [dataset]}),
            encoding="utf-8",
        )

    def validate(self):
        return validate_dataset_eligibility(
            str(self.manifest_path),
            "approved-nlu",
            str(self.training_path),
        )

    def test_accepts_only_reviewed_production_nlu_data(self):
        manifest, dataset = self.validate()
        self.assertEqual(manifest["version"], "test")
        self.assertEqual(dataset["id"], "approved-nlu")

    def test_checked_in_manifest_does_not_authorize_current_nlu_training(self):
        manifest_path = Path(__file__).resolve().parents[1] / "DATASET_MANIFEST.json"
        with self.assertRaisesRegex(ValueError, "not approved for production training"):
            validate_dataset_eligibility(
                str(manifest_path),
                "ghana-codeswitch-ipa",
                str(self.training_path),
            )
        with self.assertRaisesRegex(ValueError, "not approved for production training"):
            validate_dataset_eligibility(
                str(manifest_path),
                "ghok-chat",
                str(self.training_path),
            )

    def test_rejects_unknown_or_unapproved_datasets(self):
        with self.assertRaisesRegex(ValueError, "not registered"):
            validate_dataset_eligibility(str(self.manifest_path), "unknown", str(self.training_path))

        self.dataset["approved_for_training"] = False
        self.write_manifest(self.dataset)
        with self.assertRaisesRegex(ValueError, "not approved for production training"):
            self.validate()

    def test_rejects_speech_only_data_for_nlu_training(self):
        self.dataset["modality"] = "speech"
        self.write_manifest(self.dataset)
        with self.assertRaisesRegex(ValueError, "not a text or parallel corpus"):
            self.validate()

    def test_rejects_a_training_file_that_does_not_match_the_approved_split(self):
        self.training_path.write_text("[]", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "does not match the reviewed split"):
            self.validate()

    def test_requires_checksum_consent_and_pii_review(self):
        for field, value, message in (
            ("checksum", None, "verified SHA-256"),
            ("training_split_sha256", None, "reviewed training-split SHA-256"),
            ("consent_verified", False, "consent review"),
            ("pii_reviewed", False, "PII review"),
        ):
            with self.subTest(field=field):
                self.dataset[field] = value
                self.write_manifest(self.dataset)
                with self.assertRaisesRegex(ValueError, message):
                    self.validate()
                if field == "checksum":
                    self.dataset[field] = "a" * 64
                elif field == "training_split_sha256":
                    self.dataset[field] = hashlib.sha256(self.training_path.read_bytes()).hexdigest()
                else:
                    self.dataset[field] = True


if __name__ == "__main__":
    unittest.main()