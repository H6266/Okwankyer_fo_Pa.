# Ɔkwankyerɛfo Pa architecture

**Status date:** 2026-10-17
This document describes the current implemented seams and their limits. It is not a claim that the full target architecture has shipped.

## Current execution path

Dashboard simulator turns, Africa's Talking free-form speech, `/api/ai/brain/process`, and utterance analysis now enter through `aiSystem.process()` and the canonical `src/ai_system/core/aiEngine.ts`. The engine normalizes input, loads session/task state, routes understanding through `CognitiveRouter`, plans navigation and actions, applies the safety engine, generates a response, and stores the turn. Simulator and telephony conversation turns use understand-only execution; keypad navigation remains deterministic. Confirmed transfers are dispatched by the payment saga, not by a second conversational brain. Audio ingestion delegates through the ASR router.

This consolidates the natural-language decisions for these channels, but does not mean every NLU, payment, or speech path in the repository has been unified. Other engine callers may use the tool registry directly, and non-transfer services and speech workers still require separate release verification.

Simulator turns are admin-authenticated and rate-limited. They can prepare a transfer and collect a confirmation for diagnostics, but they never submit a payment. Public `/api/ai/process` requests and the browser live-voice gateway are forced to understand-only execution, regardless of client-supplied execution policies. The retired legacy brain registry cannot execute transfers, and the central transaction submission endpoint is retired. When `AT_WEBHOOK_SECRET` is configured, telephony callbacks must provide it; generated callback and redirect URLs carry the configured secret.

```text
simulator/public AI input -> aiEngine understanding -> persisted draft and explanation
  -> no payment dispatch

verified telephony input -> deterministic confirmation policy
  -> payment saga -> provider evidence -> truthful response
```

The simulator route cannot dispatch a saga. Confirmation at the wrong stage, an unverified draft, or a changed transaction amount must not execute on the telephony path.

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

`LocalLanguageBrain` is a lexical/slot evidence provider. It uses phrase cues and number parsing, proposes no direct execution, and does not provide a calibrated probability. The score is explicitly an uncalibrated lexical evidence score. Model output in `CognitiveRouter` is schema-checked and constrained against utterance evidence. The old route-level `brain.process()` decision path has been removed from the simulator and telephony handlers; the canonical engine still coordinates multiple understanding providers, and the NLU training artifact has not been verified against production runtime loading.

## Provider and transaction boundaries

`PaymentSaga` models transfer lifecycle transitions and requires provider financial evidence for completion. The MoMo integration still has direct route and provider paths that are not all routed through one saga, and some non-transfer services remain mock/unimplemented. Voice and dashboard routes have had obvious payer/recipient/network defaults removed, but telephony authentication, webhook replay protection, full reconciliation, and cross-instance idempotency still need completion.

## Evaluation and delivery

Historical unsupported metrics and file-existence grading were removed from the evaluation scripts. Phase 1 verification in this checkout includes type-checking, a production build, and focused brain, simulator, telephony, and payment regression tests. Full CI/release gates and empirical accuracy, latency, or Ghanaian-language quality benchmarks are not claimed.

## Production status

This repository is **not production-ready for financial execution**. Remaining release blockers include full payment-path consolidation, shared persistence/idempotency, authenticated provider webhook processing, complete telephony hardening, comprehensive empirical Ghanaian-language and speech evaluation, and a successful full CI/release-gate run.
