#!/usr/bin/env python3
"""
Ɔkwankyerɛfo Pa - Model Packaging & Manifest Exporter (export_model.py)

Creates standardized model cards, computes SHA-256 checksums, and updates
the models/ directory manifest for deployment.
"""

import os
import json
import hashlib
import argparse

def compute_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def export(model_path: str, model_id: str, version: str, license_type: str, output_manifest: str):
    checksum = compute_sha256(model_path)
    size_bytes = os.path.getsize(model_path)

    manifest_entry = {
        "model_id": model_id,
        "version": version,
        "filename": os.path.basename(model_path),
        "license": license_type,
        "sha256": checksum,
        "size_bytes": size_bytes,
        "size_mb": round(size_bytes / (1024 * 1024), 2),
        "runtime": "CPU_INFERENCE_LOCAL",
        "supported_dialects": ["asante_twi", "akuapem_twi", "ghanaian_english"],
        "deployment_ready": True
    }

    manifest = {}
    if os.path.exists(output_manifest):
        with open(output_manifest, "r", encoding="utf-8") as f:
            manifest = json.load(f)

    manifest[model_id] = manifest_entry

    with open(output_manifest, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"✓ Model '{model_id}' exported to manifest {output_manifest}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export model to manifest")
    parser.add_argument("--model-file", required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--version", default="1.0.0")
    parser.add_argument("--license", default="Apache-2.0")
    parser.add_argument("--manifest-file", default="models/manifest.json")
    args = parser.parse_args()

    export(args.model_file, args.model_id, args.version, args.license, args.manifest_file)
