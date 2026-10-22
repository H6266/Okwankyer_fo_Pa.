#!/usr/bin/env python3
"""Acquire one pinned, reviewed Hugging Face dataset split with hash verification."""

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "DATASET_MANIFEST.json"
LICENSE_ALIASES = {
    "apache-2.0": "Apache-2.0",
    "cc-by-4.0": "CC-BY-4.0",
    "cc-by-sa-4.0": "CC-BY-SA-4.0",
    "cc-by-nc-4.0": "CC-BY-NC-4.0",
    "mit": "MIT",
}


def load_dataset_record(manifest_path: Path, dataset_id: str) -> dict:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    datasets = manifest.get("datasets") if isinstance(manifest, dict) else None
    if not isinstance(datasets, list):
        raise ValueError("Dataset manifest must contain a datasets array")

    record = next((item for item in datasets if item.get("id") == dataset_id), None)
    if record is None:
        raise ValueError(f"Dataset '{dataset_id}' is not registered in the manifest")
    if record.get("approved_for_research_and_eval") is not True:
        raise ValueError(f"Dataset '{dataset_id}' is not approved for research/evaluation acquisition")
    if record.get("consent_verified") is not True:
        raise ValueError(f"Dataset '{dataset_id}' is blocked until source consent is reviewed")
    if record.get("pii_reviewed") is not True:
        raise ValueError(f"Dataset '{dataset_id}' is blocked until PII review is completed")
    if record.get("commercial_use_allowed") is not True:
        raise ValueError(f"Dataset '{dataset_id}' is not approved for this acquisition workflow")

    repo_id = record.get("source", "")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo_id):
        raise ValueError(f"Dataset '{dataset_id}' does not name a supported Hugging Face repository")
    revision = record.get("revision", "")
    if not re.fullmatch(r"[a-fA-F0-9]{40}", revision):
        raise ValueError(f"Dataset '{dataset_id}' must have a pinned 40-character commit revision")
    if not record.get("license") or record["license"] == "Unverified":
        raise ValueError(f"Dataset '{dataset_id}' does not have a verified license")
    return record


def request_json(url: str) -> dict | list:
    request = Request(url, headers={"User-Agent": "okwankyer-fo-pa-dataset-adopter/1.0"})
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def verify_repository_metadata(record: dict) -> tuple[str, list[dict]]:
    repo_id = record["source"]
    revision = record["revision"]
    encoded_repo = quote(repo_id, safe="/")
    revision_url = f"https://huggingface.co/api/datasets/{encoded_repo}/revision/{revision}"
    metadata = request_json(revision_url)
    if metadata.get("sha") != revision:
        raise ValueError("Hugging Face did not return the requested immutable dataset revision")

    remote_license = str(metadata.get("cardData", {}).get("license", "")).lower()
    canonical_remote_license = LICENSE_ALIASES.get(remote_license, remote_license)
    if canonical_remote_license != record["license"]:
        raise ValueError(
            f"License mismatch for '{record['id']}': manifest={record['license']}, "
            f"Hugging Face={canonical_remote_license or 'missing'}"
        )

    tree_url = f"https://huggingface.co/api/datasets/{encoded_repo}/tree/{revision}?recursive=true&expand=true"
    files = request_json(tree_url)
    if not isinstance(files, list):
        raise ValueError("Hugging Face returned an invalid repository file listing")
    return canonical_remote_license, files


def select_split_files(files: list[dict], split: str) -> list[dict]:
    prefix = f"data/{split}-"
    selected = []
    for entry in files:
        path = entry.get("path", "")
        lfs = entry.get("lfs") or {}
        digest = lfs.get("oid", "")
        if not path.startswith(prefix) or not path.endswith(".parquet"):
            continue
        safe_path = PurePosixPath(path)
        if safe_path.is_absolute() or ".." in safe_path.parts:
            raise ValueError(f"Unsafe repository path: {path}")
        if not re.fullmatch(r"[a-fA-F0-9]{64}", digest):
            raise ValueError(f"Missing verified LFS SHA-256 for '{path}'")
        if not isinstance(entry.get("size"), int) or entry["size"] <= 0:
            raise ValueError(f"Missing valid file size for '{path}'")
        selected.append({"path": path, "sha256": digest.lower(), "size": entry["size"]})

    if not selected:
        raise ValueError(f"No Parquet shards found for split '{split}'")
    return sorted(selected, key=lambda item: item["path"])


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def download_verified_file(repo_id: str, revision: str, file_info: dict, destination: Path) -> None:
    if destination.exists() and destination.stat().st_size == file_info["size"]:
        if sha256_file(destination) == file_info["sha256"]:
            return

    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".part")
    offset = partial.stat().st_size if partial.exists() else 0
    url = (
        f"https://huggingface.co/datasets/{quote(repo_id, safe='/')}"
        f"/resolve/{revision}/{quote(file_info['path'], safe='/')}"
    )
    headers = {"User-Agent": "okwankyer-fo-pa-dataset-adopter/1.0"}
    if offset:
        headers["Range"] = f"bytes={offset}-"
    request = Request(url, headers=headers)

    with urlopen(request, timeout=120) as response:
        append = offset > 0 and getattr(response, "status", 200) == 206
        mode = "ab" if append else "wb"
        with partial.open(mode) as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)

    actual_size = partial.stat().st_size
    if actual_size != file_info["size"]:
        raise ValueError(
            f"Size mismatch for '{file_info['path']}': expected {file_info['size']}, got {actual_size}"
        )
    actual_hash = sha256_file(partial)
    if actual_hash != file_info["sha256"]:
        partial.unlink(missing_ok=True)
        raise ValueError(f"SHA-256 mismatch for '{file_info['path']}'")
    partial.replace(destination)


def acquire_dataset(record: dict, split: str, output_dir: Path, dry_run: bool) -> list[dict]:
    license_name, remote_files = verify_repository_metadata(record)
    selected = select_split_files(remote_files, split)
    total_size = sum(item["size"] for item in selected)
    print(
        f"Dataset: {record['id']}\n"
        f"Repository: {record['source']}\n"
        f"Revision: {record['revision']}\n"
        f"License: {license_name}\n"
        f"Split: {split}\n"
        f"Shards: {len(selected)} ({total_size:,} bytes)"
    )
    if dry_run:
        print("Dry run only. No files were downloaded or marked ready.")
        return selected

    dataset_dir = output_dir / record["id"] / record["revision"]
    free_bytes = shutil.disk_usage(output_dir if output_dir.exists() else output_dir.parent).free
    if free_bytes < total_size:
        raise ValueError(f"Insufficient disk space: need {total_size:,} bytes, have {free_bytes:,}")

    for index, file_info in enumerate(selected, start=1):
        destination = dataset_dir.joinpath(*PurePosixPath(file_info["path"]).parts)
        print(f"[{index}/{len(selected)}] Verifying {file_info['path']} ({file_info['size']:,} bytes)")
        download_verified_file(record["source"], record["revision"], file_info, destination)

    receipt_path = dataset_dir / "acquisition_manifest.json"
    receipt = {
        "dataset_id": record["id"],
        "repository": record["source"],
        "revision": record["revision"],
        "license": license_name,
        "split": split,
        "purpose": "research/evaluation only; production training remains separately gated",
        "verified_files": selected,
        "verified_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(f"Acquisition verified. Receipt: {receipt_path}")
    return selected


def main() -> int:
    parser = argparse.ArgumentParser(description="Acquire one reviewed Hugging Face dataset split")
    parser.add_argument("--dataset", required=True, help="Dataset ID from DATASET_MANIFEST.json")
    parser.add_argument("--split", choices=("train", "validation", "test"), default="test")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data" / "external")
    parser.add_argument("--dry-run", action="store_true", help="Verify remote metadata and report the plan without downloading")
    args = parser.parse_args()

    try:
        record = load_dataset_record(args.manifest, args.dataset)
        acquire_dataset(record, args.split, args.output_dir, args.dry_run)
    except (HTTPError, URLError, OSError, ValueError, KeyError) as error:
        print(f"Acquisition blocked: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
