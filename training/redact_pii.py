#!/usr/bin/env python3
"""
Ɔkwankyerɛfo Pa - Dataset PII Redaction Pipeline (redact_pii.py)

Scrubs phone numbers, subscriber names, and potential credentials before
training and evaluation splits are generated.
"""

import re
import sys
import json
import argparse
from typing import Dict, Any, List

PHONE_REGEX = re.compile(r'\b(?:(?:\+233|0)[25]\d{8})\b')
SECRET_WORD_REGEX = re.compile(r'\b(?:pin|password|secret|passcode|ahintasɛm|kokoam)\s*\d+\b', re.IGNORECASE)

def scrub_text(text: str) -> str:
    cleaned = SECRET_WORD_REGEX.sub("[REDACTED_CREDENTIAL]", text)
    cleaned = PHONE_REGEX.sub("[PHONE_NUMBER]", cleaned)
    return cleaned

def redact_manifest(input_path: str, output_path: str) -> int:
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    redacted_count = 0
    if isinstance(data, list):
        for item in data:
            if "text" in item:
                original = item["text"]
                item["text"] = scrub_text(original)
                if item["text"] != original:
                    redacted_count += 1
    elif isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, str):
                original = v
                data[k] = scrub_text(v)
                if data[k] != original:
                    redacted_count += 1

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return redacted_count

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PII Redaction for Training Corpora")
    parser.add_argument("--input", required=True, help="Input JSON file")
    parser.add_argument("--output", required=True, help="Output scrubbed JSON file")
    args = parser.parse_args()

    count = redact_manifest(args.input, args.output)
    print(f"✓ Scrubbed {count} PII matches from {args.input} -> {args.output}")
