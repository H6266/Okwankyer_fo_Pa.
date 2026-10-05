# AI rebuild audit: current findings

**Updated:** 2026-10-05
This file supersedes older task-completion checklists and architectural target descriptions. Findings below are based on source inspection; runtime verification was blocked because this workspace has no installed Node/Python toolchains.

## High-priority fixes already committed

- Removed the default-mode synthetic transfer-success branch from `aiEngine`.
- A bare “yes” no longer creates a transfer draft or authorizes execution based only on a client step value.
- Financial completion requires real-provider source, successful terminal status, and a provider financial transaction ID; internal IDs are insufficient.
- Transfer/network inputs no longer receive silent MTN, sender, or recipient-name defaults in the inspected AI/tool path.
- Airtime pending/mock results and data mock results no longer report provider-completed success.
- MoMo HTTP routes no longer infer payer from recipient (or vice versa); recipient format and explicit network are required where used.
- Local language understanding no longer assigns fixed high confidence values or proposes direct transfer execution.
- Gemini response content is schema checked, conflicts with local interpretation become ambiguity, and extracted values are constrained to what is present in the utterance.
- Dynamic TTS routes no longer silently fall back to formant synthesis. Piper health performs an inference probe, and its audio response is read before the temporary directory is removed.
- Historical unsupported benchmark/model claims and file-existence grading claims have been invalidated in current reports.

## Additional changes in the current working tree

- Production memory selection now uses encrypted single-host file repositories. Session/user identifiers are hashed for filenames, writes are atomic, semantic/task state is bounded, and task drafts persist across process restarts.
- Production startup rejects missing/weak `ADMIN_TOKEN`, `SESSION_SECRET`, and `ENCRYPTION_KEY`, as well as wildcard CORS.
- New tests cover provider truth, unbound confirmation, missing-network behavior, local understanding, and durable encrypted task/session storage.
- Capability, model, evaluation, and final-status documents now describe only verifiable current behavior.
- Production sandbox mode is rejected; the MTN saga refuses a production transfer without both provider legs, and missing provider transaction IDs cannot advance collection/disbursement to success.
- The MoMo diagnostics route no longer fills in a sample phone number. The Gemini TTS paths no longer default to obsolete preview model IDs.
- CI now provisions Python, compiles Python tooling, and runs speaker split tests. A flat ESLint configuration was added.

## Confirmed remaining blockers

1. Multiple payment paths still bypass a single saga/provider execution authority.
2. Webhook authentication, event deduplication/replay defense, ordering, reconciliation, and dead-letter processing are incomplete.
3. File persistence is single-host and not safe for horizontally scaled exactly-once execution; PostgreSQL-backed memory and idempotency are not implemented.
4. Some working/correction state remains process-local; field-level data lifecycle/consent/retention needs a fuller audit.
5. ASR/TTS workers and models are optional and were not available for readiness checks here. Ghanaian-language model coverage and quality lack empirical results.
6. Duplicate/legacy NLU, STT, and TTS integrations remain in the repository; full caller migration is not complete.
7. Telephony URL allowlisting, authenticated caller identity, session replay/expiry, payload limits, and rate-limiting require end-to-end review.
8. Full typecheck, lint, tests, security audit, dataset validation, benchmark, build, and release gate could not be run because the required dependencies/toolchains are absent. The npm install attempt did not complete in this environment.

## Release status

Not production-ready for financial execution. There is no current accuracy/latency score or overall AI grade; no reproducible evidence supports one.
