# AI evaluation status and methodology

**Updated:** 2026-10-18

## Current evidence

There is no checked-in, reproducible held-out evaluation report supporting project-wide accuracy, F1, calibration, latency, ASR WER/CER, or security interception percentages. Targets in older documentation were not measurements and are removed from this status page. `eval/reports/` must contain generated, versioned artifacts before model or product performance is claimed.

The standalone NLU trainer and evaluator now share the same Akan-aware unigram/bigram tokenizer and Naive Bayes intent scorer. The evaluator reports intent accuracy, per-intent precision/recall/F1, macro precision/recall/F1, and a confusion matrix. It does not yet report slot metrics, calibration, dataset checksums in the report, or a release scorecard. No current dataset passes the production NLU training gate, and no trained NLU artifact is integrated into live inference.

Focused validation run on 2026-10-18 passed for the new local-ASR fallback, ASR-feedback consent/redaction, NLU scorer/evaluator, training eligibility, dataset-license validator, and offline AI-engine tests. The production build also succeeds. The local speech health check reports local ASR `NOT_READY` and local Piper TTS `READY`.

The full TypeScript check passed on 2026-10-19. No project-wide accuracy result is published: the checked-in evaluation harnesses have not been shown to represent disjoint, human-reviewed Twi/English holdouts across the live brain, ASR, slots, and safety behavior.

## Exploratory transcript check (2026-10-19)

The 30-row `data/evalTranscripts.json` smoke corpus now scores deterministic intent and exact amount/phone/name slot agreement. Latest result: intent 100.0%, slot exact match 86.7%; scenario intent scores were English 100%, Twi 100%, and code-switched 100%, while slot exact-match scores were 100%, 80%, and 80%, respectively. The runner made zero live model calls, so no live-model score was measured; it mirrored offline fallback results. This small internal corpus is not documented as speaker-disjoint or human-reviewed, and its recipient-name labels are incomplete. Treat these numbers as debugging evidence only, not model accuracy or release evidence.

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
