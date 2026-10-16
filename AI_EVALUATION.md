# AI evaluation status and methodology

**Updated:** 2026-10-05

## Current evidence

There is no checked-in, reproducible held-out evaluation report supporting project-wide accuracy, F1, calibration, latency, ASR WER/CER, or security interception percentages. Targets in older documentation were not measurements and are removed from this status page. `eval/reports/` must contain generated, versioned artifacts before model or product performance is claimed.

The application has deterministic unit and security tests, but the new tests in this branch could not be run because dependencies are absent (`vitest`, `tsc`, `eslint`, and `tsx` are unavailable in the checkout). No result is reported as passing from this environment.

## Required evaluation protocol

1. Freeze dataset source, revision, license, checksum, and consent/provenance metadata.
2. Separate train, validation, and test speakers using real speaker identifiers. Fail if the dataset lacks speaker IDs; never generate IDs to imply disjointness.
3. Preserve the test split and report dataset/sample counts and language/intent distribution.
4. Run the same versioned harness and commit against each candidate system.
5. Store raw per-example predictions separately from aggregate metrics and retain prior reports.

## Metrics to report when supported by data

- NLU: accuracy, macro/micro precision/recall/F1, per-intent metrics, confusion matrix, slot exact match/F1, correction/coreference accuracy, ambiguity and OOD detection, financial-slot safety errors.
- ASR: WER, CER, language/intent/slot accuracy, amount and phone-digit accuracy, false transcription on silence/noise, and latency percentiles.
- Calibration: Brier score, Expected Calibration Error, and reliability bins. Heuristic scores must be labelled uncalibrated unless fitted and evaluated against a separate calibration set.
- Systems: p50/p95/p99 latency, failure rate, provider/capability readiness, and hardware/configuration details. Targets must be distinguished from measured results.

## Current artifacts and commands

`scripts/run_ai_eval.ts`, `scripts/run_ai_benchmark.ts`, and `scripts/run_asr_eval.ts` are candidate harnesses and must be audited against the protocol above before their results are treated as release evidence. Do not overwrite historical evidence. No current benchmark scores are published.
