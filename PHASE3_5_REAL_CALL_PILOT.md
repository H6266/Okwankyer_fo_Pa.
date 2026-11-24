# Phase 3.5 Real-Call Pilot Evidence

**Status:** The collector is implemented but disabled by default. No consenting human participants or real carrier calls have been conducted in this environment.

## Pilot state

| Metric | Result |
|---|---|
| Consenting participants | 0 |
| Actual calls attempted | 0 |
| Actual calls completed | 0 |
| English calls | 0 |
| Twi calls | 0 |
| Real carrier-call WER/CER | Unavailable |
| Real intent/entity accuracy | Unavailable |
| Accessibility feedback | 0 |

## 1. Evidence collection

The admin-only evidence endpoint accepts observations only when `PILOT_EVIDENCE_ENABLED=true` and an absolute `PILOT_EVIDENCE_STORAGE_PATH` is configured. Both are disabled/empty in the staging Blueprint. An absolute path does not prove that the platform mounted persistent storage; an operator must verify that separately. The endpoint is not ready for participant evidence collection.

An admin-only `/api/pilot/call-evidence` endpoint accepts consent-gated call observations:

- pseudonymized participant and call IDs (deterministic, unsalted SHA-256 prefixes; not anonymous);
- preferred language;
- test task;
- optional human-verified and provider transcripts;
- identified intent;
- synthetic entity references;
- clarification and recovery outcome;
- spoken response delivery;
- unexpected termination;
- empty transcription and timeout flags;
- failure origin;
- optional accessibility feedback.

The endpoint requires explicit `consentRecorded: true`. Phone-like and PIN-like text is redacted before persistence. Redaction cannot guarantee removal of arbitrary personal information.

The `/api/pilot/call-evidence/report` endpoint is admin-authenticated. Individual records can include transcripts, intents, synthetic entities, accessibility answers, and call outcomes, so they remain sensitive even after redaction.

## Storage, access, retention, and deletion

- The collector writes JSON Lines to a local filesystem path. A free Render service has ephemeral storage; evidence and file-based pilot-control changes are not durable across service replacement or redeploy.
- An approved persistent disk or database has not been selected or configured. No external storage subscription is authorized by this work.
- Evidence endpoints require admin authentication and rate limiting. The collector does not encrypt records itself; platform storage controls and encryption must be assessed before use.
- There is no evidence-specific retention/deletion workflow or participant-level withdrawal endpoint. The testing-only clear method is not an operational deletion process.
- No backup or recovery procedure is configured. Do not rely on evidence surviving restart, redeploy, or service loss.

Until storage, access review, retention, backup/recovery, and participant withdrawal/deletion procedures are approved and tested, keep evidence collection disabled and do not submit participant evidence. The call-evidence endpoint returns HTTP 503 unless it is explicitly enabled with a configured absolute storage path.

## 2. Pilot controls

The existing pilot controls support:

- a runtime kill switch;
- a caller allowlist;
- offline-only fallback for non-pilot callers;
- bounded clarification attempts;
- the existing pilot metrics API.

The pilot router is mounted in the Express application. Call evidence is disabled by default and requires an explicitly enabled persistent-storage path; the current staging blueprint leaves it disabled.

## 3. Real carrier-call readiness

No controlled call should be attempted until all of these are true:

1. The operator has explicit authorization.
2. Africa's Talking callback authenticity is established using a provider-supported mechanism or an approved, verified compensating control.
3. Inbound voice is explicitly enabled only after callback security verification.
4. Twi prompts have been reviewed and approved by a fluent human before any Twi participant call.
5. Participant consent is obtained before any call.
6. Caller numbers are allowlisted.
7. Approved persistent evidence storage, access controls, retention, withdrawal/deletion, and backup/recovery are configured and tested before any evidence is collected.
8. The environment is restricted to sandbox/synthetic transactions.

No real financial transaction is authorized by this document or collector.

## 4. Synthetic and existing evidence

Existing synthetic evidence:

- 819/819 automated tests passed in the current repository verification run.
- 30 synthetic voice scenarios passed.
- Low-confidence and empty-speech fallback tests passed.
- DTMF fallback and spoken-PIN tests passed.

Existing recorded assets:

- 86+ Twi system-response recordings.
- 3 English library candidates.
- These are not recordings of consenting human callers and cannot establish WER/CER.

## 5. English results

**Not measured.** No real Ghanaian-English caller sample or provider transcript was supplied.

## 6. Twi results

**Not measured.** No real Akan/Twi caller sample or provider transcript was supplied.

## 7. Conversation and recovery

- Real completed-call rate: unavailable.
- Real empty-transcription rate: unavailable.
- Real clarification/recovery success: unavailable.
- Real unexpected termination rate: unavailable.
- Synthetic low-confidence and empty-transcription response recovery is implemented and tested.

## 8. Accessibility feedback

No real participant accessibility feedback is available.

The collector is prepared to record, separately from automated metrics:

- whether instructions were understood;
- whether the participant could select the preferred language;
- whether screen-free navigation was possible;
- whether recovery was successful;
- whether the task completed without assistance.

## 9. Failure investigation

No real call failures exist to classify.

When evidence is collected, the record requires one of:

- carrier;
- ASR;
- normalization;
- NLU;
- session;
- audio;
- none.

Every confirmed software defect must receive a focused regression test before release.

## 10. Readiness assessment

**Not ready for telephone or participant traffic.** Callback authentication is unresolved, persistent evidence storage and deletion procedures are not configured, Twi has not been linguistically approved, and real human-call evidence is missing.

Readiness requirements:

- at least 10 consenting adult speakers;
- English and fluent Twi coverage;
- diverse speeds, accents, environments, and telephone quality;
- sandbox-only call activities;
- verified callback authenticity or approved compensating controls;
- persistent evidence storage and tested data handling procedures;
- fluent human Twi approval before Twi participant calls;
- actual carrier callback recording/transcript data;
- human-verified transcripts where permitted;
- audited recovery and audio delivery outcomes;
- explicit authorization before staging or production changes.
