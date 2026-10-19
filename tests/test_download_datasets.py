import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from training.download_datasets import (
    download_verified_file,
    load_dataset_record,
    select_split_files,
    verify_repository_metadata,
)


class FakeResponse:
    status = 200

    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _size=-1):
        payload, self.payload = self.payload, b""
        return payload


class DatasetAdoptionTests(unittest.TestCase):
    def test_manifest_blocks_unreviewed_consent_before_acquisition(self):
        manifest = Path(__file__).resolve().parents[1] / "DATASET_MANIFEST.json"
        with self.assertRaisesRegex(ValueError, "consent is reviewed"):
            load_dataset_record(manifest, "ghana-codeswitch-ipa")

    def test_selects_only_requested_split_and_requires_lfs_hashes(self):
        digest = "a" * 64
        files = [
            {"path": "data/train-00000-of-00001.parquet", "size": 50, "lfs": {"oid": digest}},
            {"path": "data/test-00000-of-00001.parquet", "size": 25, "lfs": {"oid": digest}},
        ]

        self.assertEqual(
            select_split_files(files, "test"),
            [{"path": "data/test-00000-of-00001.parquet", "sha256": digest, "size": 25}],
        )
        with self.assertRaisesRegex(ValueError, "Missing verified LFS SHA-256"):
            select_split_files([{"path": "data/test-00000-of-00001.parquet", "size": 25}], "test")

    def test_verifies_exact_revision_and_license_from_hub(self):
        revision = "1" * 40
        record = {
            "id": "test-dataset",
            "source": "owner/repo",
            "revision": revision,
            "license": "Apache-2.0",
        }
        with patch(
            "training.download_datasets.request_json",
            side_effect=[
                {"sha": revision, "cardData": {"license": "apache-2.0"}},
                [],
            ],
        ):
            license_name, files = verify_repository_metadata(record)

        self.assertEqual(license_name, "Apache-2.0")
        self.assertEqual(files, [])

    def test_download_verifies_sha256_before_publishing_file(self):
        payload = b"verified dataset shard"
        digest = hashlib.sha256(payload).hexdigest()
        file_info = {"path": "data/test-00000.parquet", "sha256": digest, "size": len(payload)}
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = Path(temp_dir) / "data" / "test-00000.parquet"
            with patch("training.download_datasets.urlopen", return_value=FakeResponse(payload)):
                download_verified_file("owner/repo", "1" * 40, file_info, destination)

            self.assertEqual(destination.read_bytes(), payload)
            self.assertFalse(destination.with_name(destination.name + ".part").exists())

    def test_rejects_hash_mismatch_without_publishing_file(self):
        payload = b"unverified shard"
        file_info = {"path": "data/test-00000.parquet", "sha256": "a" * 64, "size": len(payload)}
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = Path(temp_dir) / "data" / "test-00000.parquet"
            with patch("training.download_datasets.urlopen", return_value=FakeResponse(payload)):
                with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                    download_verified_file("owner/repo", "1" * 40, file_info, destination)

            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()