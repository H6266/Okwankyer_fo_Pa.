# Phase 3.5 Real-Call Pilot Evidence

**Status:** Pilot collector and controlled-call safeguards are implemented. No consenting human participants or real carrier calls have been conducted in this environment.

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

The existing Africa's Talking voice routes now feed the existing pilot metrics collector and data-retention session registry.

An admin-only `/api/pilot/call-evidence` endpoint accepts anonymized, consent-gated call observations:

- anonymized participant and call IDs;
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

The endpoint requires explicit `consentRecorded: true`. IDs are hashed. Phone-like and PIN-like text is redacted before persistence.

The `/api/pilot/call-evidence/report` endpoint produces aggregate evidence only.

## 2. Pilot controls

The existing pilot controls support:

- a runtime kill switch;
- a caller allowlist;
- offline-only fallback for non-pilot callers;
- bounded clarification attempts;
- the existing pilot metrics API.

The pilot router is now mounted in the Express application. Real-call evidence can therefore be collected only through the existing authenticated admin API.

## 3. Real carrier-call readiness

The application is ready for a controlled call attempt only when:

1. The operator has explicit authorization.
2. Africa's Talking credentials and webhook configuration are set.
3. The inbound number callback is configured.
4. Participant consent is obtained before any call.
5. Caller numbers are allowlisted.
6. Pilot metrics and ASR feedback storage have no PIN or PII exposure.
7. The environment is restricted to sandbox/synthetic transactions.

No real financial transaction is authorized by this document or collector.

## 4. Synthetic and existing evidence

Existing synthetic evidence:

- 807/807 automated tests passed.
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

**Not ready for a larger accessibility pilot solely on the strength of automated tests.** The infrastructure is pilot-ready, but real human-call evidence is missing.

Readiness requirements:

- at least 10 consenting adult speakers;
- English and fluent Twi coverage;
- diverse speeds, accents, environments, and telephone quality;
- sandbox-only call activities;
- actual carrier callback recording/transcript data;
- human-verified transcripts where permitted;
- audited recovery and audio delivery outcomes;
- explicit authorization before staging or production changes.
