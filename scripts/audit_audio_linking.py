#!/usr/bin/env python3
"""
Read-only IVR audio-linking audit for Ɔkwankyerɛfo Pa.

Checks:
- Literal audio paths in application source/configuration
- Exact, basename-only, missing, and ambiguous file matches
- Empty audio files and duplicate SHA-256 hashes
- IVR audio inventory status counts
- Known risky audio-selection and simulator code patterns

This script does NOT change source code or audio files.
It writes reports/audio-linking-audit.md and
reports/audio-linking-audit.json.
"""

from pathlib import Path
from collections import Counter, defaultdict
from urllib.parse import urlsplit, unquote
import csv
import hashlib
import json
import re
import sys
from datetime import datetime, timezone

ROOT = Path.cwd()
AUDIO_EXTENSIONS = {
    ".m4a", ".mp3", ".wav", ".ogg", ".aac",
    ".flac", ".opus", ".webm"
}
SKIP_DIRS = {
    ".git", "node_modules", "dist", "build",
    "coverage", ".next", ".venv", "venv", "__pycache__"
}
CODE_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs",
    ".cjs", ".json"
}

# Find quoted literal references ending in a known audio extension.
AUDIO_LITERAL_RE = re.compile(
    r"""(?P<quote>["'`])(?P<ref>[^"'`\r\n]{1,700}"""
    r"""\.(?:m4a|mp3|wav|ogg|aac|flac|opus|webm)"""
    r"""(?:\?[^"'`\r\n]*)?)(?P=quote)""",
    re.IGNORECASE,
)


def rel(path):
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def norm_text(value):
    return str(value or "").strip()


def safe_read_text(path):
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except (OSError, UnicodeError):
        return ""


def should_skip(path):
    return any(part in SKIP_DIRS for part in path.parts)


def discover_audio_files():
    found = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or should_skip(path):
            continue
        if path.suffix.lower() in AUDIO_EXTENSIONS:
            found.append(path)
    return sorted(set(found), key=lambda p: rel(p).lower())


def discover_code_and_config_files():
    found = []
    scan_roots = [ROOT / "src", ROOT / "Audio_files", ROOT / "public"]
    for scan_root in scan_roots:
        if not scan_root.exists():
            continue
        for path in scan_root.rglob("*"):
            if not path.is_file() or should_skip(path):
                continue
            if path.suffix.lower() not in CODE_EXTENSIONS:
                continue
            # Avoid giant dependency/build files if present in a scanned tree.
            if path.name in {"package-lock.json", "pnpm-lock.yaml", "yarn.lock"}:
                continue
            found.append(path)
    return sorted(set(found), key=lambda p: rel(p).lower())


def sha256_file(path):
    digest = hashlib.sha256()
    try:
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except OSError:
        return None


def make_audio_indexes(audio_files):
    by_rel_path = {}
    by_name = defaultdict(list)
    for path in audio_files:
        key = rel(path).replace("\\", "/").lower()
        by_rel_path[key] = path
        by_name[path.name.lower()].append(path)
    return by_rel_path, by_name


def clean_audio_reference(reference):
    value = norm_text(reference)
    value = value.replace("\\", "/")
    value = unquote(value)

    # A URL points to a URL path, not its domain.
    if value.lower().startswith(("http://", "https://")):
        value = urlsplit(value).path

    # Drop query strings and fragments when matching local files.
    value = value.split("?", 1)[0].split("#", 1)[0]
    value = value.strip()
    while value.startswith("./"):
        value = value[2:]
    return value


def resolve_audio_reference(reference, by_rel_path, by_name):
    """
    Returns (status, matching paths).

    EXACT: path is present exactly or through a known public/audio mount.
    BASENAME_ONLY: one file shares the filename but not the requested path.
    AMBIGUOUS: multiple files could match the basename.
    MISSING: no matching local file found.
    """
    cleaned = clean_audio_reference(reference)
    if not cleaned:
        return "MISSING", []

    no_leading_slash = cleaned.lstrip("/")
    candidates = []

    def add_candidate(value):
        value = value.replace("\\", "/").lstrip("/")
        if value and value not in candidates:
            candidates.append(value)

    add_candidate(no_leading_slash)

    # A website URL such as /audio/example.m4a may map to different
    # static-file roots depending on the server configuration.
    if no_leading_slash.lower().startswith("audio/"):
        remainder = no_leading_slash[len("audio/"):]
        add_candidate("public/audio/" + remainder)
        add_candidate("Audio_files/audio/" + remainder)
        add_candidate("audio/" + remainder)
        add_candidate("Audio_files/" + no_leading_slash)
    elif no_leading_slash.lower().startswith("audio_files/"):
        add_candidate("public/" + no_leading_slash)

    # Also allow /public/audio/... or /Audio_files/... references.
    for candidate in candidates:
        key = candidate.lower()
        if key in by_rel_path:
            return "EXACT", [by_rel_path[key]]

    basename = Path(no_leading_slash).name.lower()
    matches = by_name.get(basename, [])

    if len(matches) == 1:
        return "BASENAME_ONLY", matches
    if len(matches) > 1:
        return "AMBIGUOUS", matches
    return "MISSING", []


def find_inventory():
    expected = [
        ROOT / "docs" / "IVR_AUDIO_INVENTORY.csv",
        ROOT / "IVR_AUDIO_INVENTORY.csv",
    ]
    for path in expected:
        if path.is_file():
            return path

    # Fallback: locate a similarly named inventory.
    for path in ROOT.rglob("*"):
        if path.is_file() and not should_skip(path):
            if path.name.lower() == "ivr_audio_inventory.csv":
                return path
    return None


def inventory_summary(path):
    result = {
        "path": rel(path) if path else None,
        "rows": 0,
        "columns": [],
        "status_columns": {},
        "asset_columns": [],
        "rows_with_audio_filename": 0,
        "referenced_audio_cells": 0,
    }
    if not path:
        return result

    try:
        with path.open("r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            headers = reader.fieldnames or []
            result["columns"] = headers
            status_cols = [
                h for h in headers
                if any(word in h.lower() for word in ("status", "mapping", "verified"))
            ]
            asset_cols = [
                h for h in headers
                if any(word in h.lower() for word in (
                    "file", "path", "url", "asset", "audio", "recording", "filename"
                ))
            ]
            result["asset_columns"] = asset_cols
            status_counts = {h: Counter() for h in status_cols}
            for row in reader:
                result["rows"] += 1
                row_has_audio = False
                for header in headers:
                    cell = norm_text(row.get(header))
                    if re.search(
                        r"\.(?:m4a|mp3|wav|ogg|aac|flac|opus|webm)(?:$|[?#])",
                        cell, re.IGNORECASE
                    ):
                        result["referenced_audio_cells"] += 1
                        row_has_audio = True
                if row_has_audio:
                    result["rows_with_audio_filename"] += 1
                for header in status_cols:
                    value = norm_text(row.get(header)) or "(blank)"
                    status_counts[header][value] += 1
            result["status_columns"] = {
                header: dict(counts.most_common())
                for header, counts in status_counts.items()
            }
    except Exception as error:
        result["error"] = str(error)
    return result


def code_risk_checks(source_texts):
    """Pattern checks are warnings for manual review, not runtime proof."""
    checks = []

    controller = next(
        (text for path, text in source_texts.items()
         if path.endswith("src/audio/audioPlaybackController.ts")),
        ""
    )
    simulator = next(
        (text for path, text in source_texts.items()
         if path.endswith("src/pages/dashboard/PhoneSimulatorPage.tsx")),
        ""
    )
    voice_routes = next(
        (text for path, text in source_texts.items()
         if path.endswith("src/routes/voiceRoutes.ts")),
        ""
    )
    registry = next(
        (text for path, text in source_texts.items()
         if path.endswith("src/audio/recordingRegistry.ts")),
        ""
    )
    tts_service = next(
        (text for path, text in source_texts.items()
         if path.endswith("src/modules/ttsService.ts")),
        ""
    )

    def add(severity, title, detail):
        checks.append({
            "severity": severity,
            "title": title,
            "detail": detail,
        })

    if re.search(
        r"matchReplyToAudio\s*\(\s*cleanText\s*,\s*['\"]twi['\"]",
        controller, re.IGNORECASE
    ):
        add(
            "HIGH",
            "Reply matching appears hard-coded to Twi",
            "audioPlaybackController.ts appears to call matchReplyToAudio "
            "with 'twi' for cleanText. Verify that English prompts and "
            "dynamic recipient readbacks cannot be replaced by Twi recordings."
        )

    if re.search(
        r"resolveSimulatorAudioUrl\s*\(\s*audioUrl\s*,\s*['\"]twi['\"]",
        simulator, re.IGNORECASE
    ):
        add(
            "HIGH",
            "Simulator can fall back to Twi audio",
            "PhoneSimulatorPage.tsx appears to attempt Twi after resolving "
            "the selected language. This can make an English flow play Twi."
        )

    if re.search(r"\|\|\s*audioUrl\b", simulator):
        add(
            "MEDIUM",
            "Simulator may return an unresolved raw audio URL",
            "The simulator source appears to use the original audioUrl as a "
            "fallback. Check whether invalid paths are reported as errors "
            "instead of being passed to the player."
        )

    if (
        re.search(r"welcomePrompt", voice_routes, re.IGNORECASE)
        and re.search(r"langPrompt|languagePrompt", voice_routes, re.IGNORECASE)
        and re.search(r"GetDigits", voice_routes, re.IGNORECASE)
    ):
        add(
            "HIGH",
            "Review welcome and language-selection prompt separation",
            "voiceRoutes.ts contains welcome, language-selection, and "
            "GetDigits-related code. Manually verify that OP01 welcome "
            "finishes before OP02 language selection begins, rather than "
            "both being played together in one response."
        )

    # Find the prompt-ID lookup block, then test whether it explicitly checks
    # verification status inside the lookup implementation.
    start = registry.find("getRecordingByPromptId")
    end = registry.find("getRecordingsByPromptId", start + 1) if start >= 0 else -1
    prompt_lookup = registry[start:end] if start >= 0 and end > start else (
        registry[start:start + 5000] if start >= 0 else ""
    )
    if prompt_lookup and not re.search(
        r"mappingStatus|VERIFIED|recordingRole", prompt_lookup, re.IGNORECASE
    ):
        add(
            "HIGH",
            "Prompt-ID lookup may not enforce verified fixed recordings",
            "The getRecordingByPromptId lookup block does not visibly check "
            "mappingStatus/VERIFIED or recordingRole. Ensure ambiguous or "
            "unverified recordings cannot be selected for live prompts."
        )

    if re.search(r"\.(?:m4a|aac).*?\.mp3|replace\s*\([^)]*m4a[^)]*mp3",
                 tts_service, re.IGNORECASE | re.DOTALL):
        add(
            "MEDIUM",
            "Review audio-extension rewriting",
            "ttsService.ts may rewrite an .m4a/.aac path to .mp3. Confirm "
            "that the target MP3 actually exists; do not change extensions "
            "without a real converted file."
        )

    if (
        re.search(r"startPinAuthorizationFlow", simulator)
        and re.search(r"zeroPinOverlay", simulator)
    ):
        add(
            "HIGH",
            "Review simulator PIN authorization completion",
            "The simulator has a PIN-authorization/zero-PIN path. It should "
            "never collect the real MoMo PIN. Verify there is a test-only "
            "approval/result path or a provider status callback so the "
            "simulated transaction can continue after authorization."
        )

    if not checks:
        add(
            "INFO",
            "No known-risk patterns detected by these checks",
            "This is not proof the audio flow works. Continue with the "
            "path, mapping, and real call/simulator tests."
        )

    return checks


def main():
    if not (ROOT / "src").exists():
        print("ERROR: I cannot see a 'src' directory here.")
        print("Open the Okwankyer_fo_Pa repository root, then run this script again.")
        sys.exit(2)

    audio_files = discover_audio_files()
    code_files = discover_code_and_config_files()
    by_rel_path, by_name = make_audio_indexes(audio_files)

    source_texts = {}
    refs = []
    for path in code_files:
        content = safe_read_text(path)
        source_texts[rel(path)] = content
        for line_number, line in enumerate(content.splitlines(), start=1):
            for match in AUDIO_LITERAL_RE.finditer(line):
                refs.append({
                    "source": rel(path),
                    "line": line_number,
                    "reference": match.group("ref"),
                })

    # Resolve all discovered references.
    for item in refs:
        status, matches = resolve_audio_reference(
            item["reference"], by_rel_path, by_name
        )
        item["status"] = status
        item["matches"] = [rel(path) for path in matches]

    resolution_counts = Counter(item["status"] for item in refs)
    seen_resolved = set()
    for item in refs:
        if item["status"] in {"EXACT", "BASENAME_ONLY"}:
            seen_resolved.update(item["matches"])

    unreferenced_by_literal = [
        rel(path) for path in audio_files if rel(path) not in seen_resolved
    ]

    # Find zero-byte files and duplicate byte-for-byte recordings.
    empty_files = []
    hash_groups = defaultdict(list)
    for path in audio_files:
        try:
            if path.stat().st_size == 0:
                empty_files.append(rel(path))
        except OSError:
            pass
        digest = sha256_file(path)
        if digest:
            hash_groups[digest].append(rel(path))

    duplicate_groups = [
        {"sha256": digest, "files": sorted(paths)}
        for digest, paths in hash_groups.items()
        if len(paths) > 1
    ]
    duplicate_groups.sort(key=lambda group: (-len(group["files"]), group["files"][0]))

    inventory_path = find_inventory()
    inventory = inventory_summary(inventory_path)
    risk_checks = code_risk_checks(source_texts)

    missing_refs = [r for r in refs if r["status"] == "MISSING"]
    ambiguous_refs = [r for r in refs if r["status"] == "AMBIGUOUS"]
    basename_refs = [r for r in refs if r["status"] == "BASENAME_ONLY"]

    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "repository_root": str(ROOT),
        "note": (
            "Static audit only. It does not play recordings, place a phone call, "
            "test speech recognition, verify Twilio/telecom callbacks, or prove "
            "that prompt semantics match the recording content."
        ),
        "summary": {
            "audio_files_found": len(audio_files),
            "source_and_config_files_scanned": len(code_files),
            "literal_audio_references_found": len(refs),
            "reference_status_counts": dict(resolution_counts),
            "files_with_zero_bytes": len(empty_files),
            "duplicate_sha256_groups": len(duplicate_groups),
            "audio_files_not_found_by_literal_reference": len(unreferenced_by_literal),
            "inventory_rows": inventory.get("rows", 0),
        },
        "inventory": inventory,
        "references": refs,
        "missing_references": missing_refs,
        "ambiguous_references": ambiguous_refs,
        "basename_only_references": basename_refs,
        "audio_files_not_found_by_literal_reference": unreferenced_by_literal,
        "empty_files": empty_files,
        "duplicate_sha256_groups": duplicate_groups,
        "code_risk_checks": risk_checks,
        "all_audio_files": [rel(path) for path in audio_files],
    }

    output_json = ROOT / "reports" / "audio-linking-audit.json"
    output_md = ROOT / "reports" / "audio-linking-audit.md"
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )

    lines = []
    lines.append("# Ɔkwankyerɛfo Pa — IVR Audio-Linking Audit")
    lines.append("")
    lines.append(f"- Generated (UTC): {report['generated_at_utc']}")
    lines.append(f"- Repository root: `{ROOT}`")
    lines.append("- Audit type: static/read-only")
    lines.append("")
    lines.append("## 1. Summary")
    lines.append("")
    summary = report["summary"]
    lines.append(f"- Audio files found: **{summary['audio_files_found']}**")
    lines.append(
        f"- Source/config files scanned: **{summary['source_and_config_files_scanned']}**"
    )
    lines.append(
        f"- Literal audio references found in scanned files: **{summary['literal_audio_references_found']}**"
    )
    lines.append(f"- Reference resolution counts: `{dict(resolution_counts)}`")
    lines.append(f"- Zero-byte audio files: **{len(empty_files)}**")
    lines.append(f"- Duplicate SHA-256 groups: **{len(duplicate_groups)}**")
    lines.append(
        f"- Audio files not reached by a discovered literal path: **{len(unreferenced_by_literal)}**"
    )
    lines.append(f"- Inventory rows: **{inventory.get('rows', 0)}**")
    lines.append("")
    lines.append(
        "> Important: a file not reached by a literal path may be linked indirectly "
        "through a prompt ID or registry. Treat it as a review item, not automatic proof "
        "that the recording is unused."
    )
    lines.append("")
    lines.append("## 2. Code-risk checks")
    lines.append("")
    for check in risk_checks:
        lines.append(f"### [{check['severity']}] {check['title']}")
        lines.append(check["detail"])
        lines.append("")

    lines.append("## 3. Missing audio references")
    lines.append("")
    if missing_refs:
        for item in missing_refs:
            lines.append(
                f"- `{item['source']}:{item['line']}` → `{item['reference']}`"
            )
    else:
        lines.append("None found by the literal-reference scan.")
    lines.append("")

    lines.append("## 4. Ambiguous references")
    lines.append("")
    if ambiguous_refs:
        for item in ambiguous_refs:
            lines.append(
                f"- `{item['source']}:{item['line']}` → `{item['reference']}`"
            )
            for match_path in item["matches"]:
                lines.append(f"  - Possible match: `{match_path}`")
    else:
        lines.append("None found.")
    lines.append("")

    lines.append("## 5. Basename-only matches")
    lines.append("")
    if basename_refs:
        for item in basename_refs:
            lines.append(
                f"- `{item['source']}:{item['line']}` → `{item['reference']}` "
                f"matches `{', '.join(item['matches'])}` by filename only"
            )
    else:
        lines.append("None found.")
    lines.append("")

    lines.append("## 6. Inventory status")
    lines.append("")
    if inventory.get("path"):
        lines.append(f"- Inventory file: `{inventory['path']}`")
        lines.append(f"- Rows: **{inventory.get('rows', 0)}**")
        lines.append(f"- Columns: `{inventory.get('columns', [])}`")
        lines.append(f"- Asset-like columns: `{inventory.get('asset_columns', [])}`")
        for column, counts in inventory.get("status_columns", {}).items():
            lines.append(f"- Values in `{column}`: `{counts}`")
    else:
        lines.append("No `IVR_AUDIO_INVENTORY.csv` was found.")
    lines.append("")

    lines.append("## 7. Empty audio files")
    lines.append("")
    if empty_files:
        lines.extend(f"- `{path}`" for path in empty_files)
    else:
        lines.append("None found.")
    lines.append("")

    lines.append("## 8. Duplicate recordings (same SHA-256)")
    lines.append("")
    if duplicate_groups:
        for group in duplicate_groups:
            lines.append(f"- SHA-256 `{group['sha256']}`")
            for path in group["files"]:
                lines.append(f"  - `{path}`")
    else:
        lines.append("No byte-for-byte duplicate files found.")
    lines.append("")

    lines.append("## 9. Audio files not reached by literal source/config paths")
    lines.append("")
    lines.append(
        "These need registry/prompt-ID review. Their absence from literal code "
        "does not prove they are unused."
    )
    lines.append("")
    if unreferenced_by_literal:
        lines.extend(f"- `{path}`" for path in unreferenced_by_literal)
    else:
        lines.append("Every discovered asset was reached by at least one literal reference.")
    lines.append("")

    lines.append("## 10. Every discovered literal audio reference")
    lines.append("")
    if refs:
        for item in refs:
            matches = ", ".join(item["matches"]) if item["matches"] else "(no local match)"
            lines.append(
                f"- **{item['status']}** — `{item['source']}:{item['line']}` "
                f"→ `{item['reference']}` → {matches}"
            )
    else:
        lines.append(
            "No quoted audio filenames were found. The project may build links "
            "dynamically, so inspect the registry and URL resolver manually."
        )
    lines.append("")
    lines.append("## 11. What this audit cannot prove")
    lines.append("")
    lines.append(
        "- It cannot listen to the audio and confirm that a clip says the intended prompt."
    )
    lines.append(
        "- It cannot prove that the welcome, language, recipient, amount, confirmation, "
        "and handoff recordings play in the correct order."
    )
    lines.append(
        "- It cannot confirm that a live/sandbox MoMo authorization prompt was initiated."
    )
    lines.append(
        "- A clean path report is not an end-to-end pass. Run the simulator/call tests "
        "and verify each prompt against its expected script."
    )
    lines.append("")

    output_md.write_text("\n".join(lines), encoding="utf-8")

    print("\n" + "=" * 68)
    print("ƆKWANKYERƐFO PA — IVR AUDIO LINKING AUDIT")
    print("=" * 68)
    print(f"Repository:              {ROOT}")
    print(f"Audio files:             {len(audio_files)}")
    print(f"Scanned source/config:   {len(code_files)}")
    print(f"Audio references:        {len(refs)}")
    print(f"Exact matches:           {resolution_counts.get('EXACT', 0)}")
    print(f"Basename-only matches:   {resolution_counts.get('BASENAME_ONLY', 0)}")
    print(f"Ambiguous references:    {resolution_counts.get('AMBIGUOUS', 0)}")
    print(f"Missing references:      {resolution_counts.get('MISSING', 0)}")
    print(f"Empty audio files:       {len(empty_files)}")
    print(f"Duplicate hash groups:   {len(duplicate_groups)}")
    print(f"Inventory rows:          {inventory.get('rows', 0)}")
    print("\nCODE-RISK CHECKS")
    for check in risk_checks:
        print(f"[{check['severity']}] {check['title']}")
        print(f"  {check['detail']}")
    print("\nREPORTS CREATED")
    print(f"  {rel(output_md)}")
    print(f"  {rel(output_json)}")
    print("\nNo source code or audio recordings were changed.")
    print("=" * 68)


if __name__ == "__main__":
    main()
