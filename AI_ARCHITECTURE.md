# Ɔkwankyerɛfo Pa architecture

**Status date:** 2026-10-05
This document describes the current implemented seams and their limits. It is not a claim that the full target architecture has shipped.

## Current execution path

The main text/audio entry point is `src/ai_system/core/aiEngine.ts`. It normalizes input, loads session/task state, calls `reasoningEngine`, plans navigation and actions, applies the safety engine, dispatches only through `unifiedToolRegistry`, generates a response, and stores the turn. Audio ingestion delegates through the ASR router. This architecture still has parallel/legacy NLU, payment, and speech paths; complete deduplication is work in progress.

For high-risk financial actions, the intended authority order is:

```text
utterance
  -> normalized evidence and slots
  -> persisted draft and confirmation fingerprint
  -> deterministic policy and safety checks
  -> canonical tool registry
  -> provider adapter
  -> authoritative provider transaction evidence
  -> verified response
```

The model may assist understanding. It does not authorize payment. A positive response requires a real provider result and a provider financial transaction ID. Internal IDs, HTTP acceptance, and customer confirmation alone do not establish completion.

## Memory and persistence

In production, repository-backed sessions, turns, preferences, transaction records, semantic vectors, pronunciation entries, and task drafts use encrypted file storage under `.data`. Filenames use hashes of session/user identifiers, writes use temporary files plus rename, and records are encrypted with AES-256-GCM. This is a single-host persistence option, not a multi-instance database. A PostgreSQL adapter and shared atomic idempotency backend are not present. Some transient working/correction state remains process-local.

Production startup requires `ADMIN_TOKEN`, `SESSION_SECRET`, `ENCRYPTION_KEY` (each at least 32 characters), and explicit `CORS_ORIGINS`. Keep the encryption key stable and protected; key rotation requires a data migration.

## Speech capabilities

- DTMF decoding and voice activity detection are signal-processing utilities. They do not transcribe speech.
- Local neural ASR is a separate worker and requires an explicitly configured model. Readiness must be checked against the running model worker.
- Fixed recordings are human studio speech, not TTS.
- Dynamic local neural speech uses the Piper worker when configured. TTS no longer silently falls back to formant synthesis. The experimental formant provider is behind an explicit development setting.
- Local ASR/TTS model weights are not included in the repository. Their language coverage depends on the selected licensed model and has not been benchmarked for Ghanaian English/Twi here.

## Understanding and confidence

`LocalLanguageBrain` is a lexical/slot evidence provider. It uses phrase cues and number parsing, proposes no direct execution, and does not provide a calibrated probability. The score is explicitly an uncalibrated lexical evidence score. Gemini output in `CognitiveRouter` is strictly schema-checked, constrained against literal utterance evidence for extracted values, and rejected when its intent conflicts with local interpretation. The main `AiEngine` is not yet fully integrated with one centralized model gateway or one NLU implementation.

## Provider and transaction boundaries

`PaymentSaga` models transfer lifecycle transitions and requires provider financial evidence for completion. The MoMo integration still has direct route and provider paths that are not all routed through one saga, and some non-transfer services remain mock/unimplemented. Voice and dashboard routes have had obvious payer/recipient/network defaults removed, but telephony authentication, webhook replay protection, full reconciliation, and cross-instance idempotency still need completion.

## Evaluation and delivery

Historical unsupported metrics and file-existence grading were removed from the evaluation scripts. The current test additions cover provider truth, unbound confirmation, missing networks, safe local understanding, and durable encrypted memory. They were not runnable in this environment because the checkout has no installed `vitest`, `tsc`, `eslint`, or `tsx`; Python is also unavailable. No benchmark, accuracy, latency, or release score is claimed.

## Production status

This repository is **not production-ready for financial execution**. Remaining release blockers include full payment-path consolidation, shared persistence/idempotency, authenticated provider webhook processing, complete telephony hardening, comprehensive empirical Ghanaian-language and speech evaluation, and a successful full CI/release-gate run.
