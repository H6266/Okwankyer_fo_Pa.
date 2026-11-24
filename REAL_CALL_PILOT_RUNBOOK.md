# Real-Call Pilot Runbook

## Purpose

This runbook is preparatory only. **Do not place participant calls or collect evidence yet.** The staging callback authentication, persistent evidence storage, withdrawal/deletion procedures, and Twi linguistic approval are unresolved.

Do not treat the procedure below as authorization to deploy, configure a provider callback, recruit participants, or start calls. Written consent, test numbers, an authorized administrator, and a stop authority are necessary but not sufficient.

## Pilot objectives

- Test language selection and natural Ghanaian English/Akan Twi speech.
- Measure real ASR, intent, entity, conversation, and recovery performance.
- Test screen-free operation and recovery with visually impaired and low-digital-literacy participants.
- Use only simulated values and test recipients.
- Never initiate a real payment or purchase.

## Administrator responsibilities

Before any future pilot, the administrator must:

1. Obtain approval for a provider-supported callback authentication mechanism or verified compensating control.
2. Verify staging configuration and callback URLs only after that security gate.
3. Keep the kill switch engaged during setup.
4. Confirm that `MOMO_TARGET_ENV=sandbox` and no live financial credentials are configured.
5. Obtain approval for persistent evidence storage, access, retention, backup/recovery, and withdrawal/deletion.
6. Obtain fluent human review and approval of the Twi wording before any Twi participant call.
7. Obtain and document participant consent outside the application.
8. Enable inbound voice, allowlist, and evidence collection only after all gates pass.
9. Stop the pilot if calls, audio, credentials, storage, or consent are uncertain.

## Who to recruit

Only after all security, storage, language, and ethics gates pass, recruit at least 10 consenting adults, including:

- Native/fluent Akan/Twi speakers.
- Ghanaian English speakers.
- Older or first-time telephone-service users.
- Participants with visual impairments.
- Participants with limited digital literacy.
- Different speaking speeds and accents.
- Quiet and moderate-noise environments.

Recruit through an accessibility organisation or informed community facilitator. Developers, project staff, or researchers are not substitutes for these participants.

Do not collect participants' real PINs, passwords, account numbers, or financial credentials.

## Consent procedure

1. Give the participant `PILOT_PARTICIPANT_CONSENT.md`.
2. Explain that the session is simulated and may stop at any time.
3. Explain whether a provider recording or transcript will be used.
4. Obtain explicit consent and assign an anonymous participant ID.
5. Record `consentRecorded: true` for the evidence record only after consent.
6. Do not collect a consented recording unless the operator is authorised and provider recording is enabled.

Participants may decline or stop. A tested participant-level deletion process does not currently exist, so do not collect evidence until an approved withdrawal/deletion process is implemented and tested.

## Start procedure (blocked pending approvals)

Use admin authentication as implemented by `requireAdminAuth`. The current staging defaults intentionally keep inbound voice disabled, the kill switch active, the allowlist enabled and empty, and evidence collection disabled.

Until the security and storage gates are approved, limit checks to health and local tests. Do not configure a provider callback, add allowlisted caller numbers, disengage the kill switch, or enable evidence collection. Once approved, document and test the following separately:

1. Verify staging health:
   - `GET /health`
   - `GET /api/pilot/status`
2. Engage the kill switch:
   - `POST /api/pilot/kill-switch`
   - body: `{"active":true,"reason":"Controlled pilot setup"}`
3. Enable the allowlist:
   - `POST /api/pilot/allowlist/toggle`
   - body: `{"enabled":true}`
4. Remove unneeded existing numbers using `GET /api/pilot/allowlist` and `DELETE /api/pilot/allowlist/:phone`.
5. Add approved test numbers:
   - `POST /api/pilot/allowlist`
   - body: `{"phone":"<test number>"}`
6. Reset operational counters if starting a new measurement period:
   - `POST /api/pilot/metrics/reset`
7. Disengage the kill switch only after readiness checks:
   - `POST /api/pilot/kill-switch`
   - body: `{"active":false,"reason":"Pilot readiness checks passed"}`

The status endpoint masks allowlisted numbers. The allowlist `unmasked=true` option exists, but administrators should avoid using or sharing it.

## Calling a participant (not authorized yet)

Do not use a provider number or call a participant until callback authenticity and the other gates are independently verified and approved. The current staging Blueprint disables inbound voice. Do not send or receive real money.

Before each call:

1. Confirm consent.
2. Confirm the test recipient, amount, and language.
3. Confirm the caller number is allowlisted.
4. Confirm the kill switch is off and the allowlist is enabled.
5. State the task aloud using the assigned script.
6. Provide DTMF fallback if speech fails.

Suggested call observations:

- connection and first spoken prompt;
- language selection;
- requested task;
- ASR/provider text;
- brain intent;
- extracted synthetic entity;
- clarification;
- DTMF or repeated speech;
- response audio delivery;
- unexpected disconnection;
- conversation completion.

## Record call evidence (disabled)

The call-evidence endpoint returns HTTP 503 by default. Keep it disabled. Do not submit participant evidence until persistent storage, retention, backup/recovery, access control, and participant withdrawal/deletion procedures are approved and tested.

`POST /api/pilot/call-evidence`

Minimum body:

```json
{
  "consentRecorded": true,
  "callId": "<random call identifier>",
  "participantId": "<random participant identifier>",
  "language": "en",
  "task": "transfer",
  "clarificationRequired": false,
  "recoveryUsed": "none",
  "conversationCompleted": true,
  "spokenResponseDelivered": true,
  "unexpectedCallTermination": false,
  "emptyTranscription": false,
  "recognitionTimeout": false
}
```

Optional fields:

- `humanVerifiedTranscript`
- `providerTranscript`
- `identifiedIntent`
- `expectedIntent`
- `entities.amount`
- `entities.recipientReference`
- `failureOrigin`: `carrier`, `asr`, `normalization`, `nlu`, `session`, `audio`, or `none`
- `accessibility`: the five booleans in `PILOT_TEST_SCENARIOS.md`

Do not submit PINs, passwords, real phone numbers, or real financial details. The collector uses deterministic unsalted hashes for IDs and basic text redaction; records remain sensitive and potentially identifiable. Do not rely on that redaction as anonymization.

## Retrieve reports

- Operational: `GET /api/pilot/metrics`
- Pilot evidence: `GET /api/pilot/call-evidence/report`
- Status/allowlist: `GET /api/pilot/status`, `GET /api/pilot/allowlist`

The report currently contains no real-call evidence. Do not enable collection or describe synthetic results as real-pilot evidence.

## Failure handling

For each failure, record:

1. Task and language.
2. Exact stage: connection, prompt, language, ASR, intent, slot, confirmation, audio, or hangup.
3. Whether the callback supplied DTMF, transcript, recording, or neither.
4. Failure origin.
5. Whether the call remained active.
6. Whether DTMF recovery succeeded.
7. Whether spoken response audio was delivered.

Do not silently rewrite an uncertain financial instruction. Repeat or clarify. Never proceed to provider submission after uncertainty.

## Stop immediately

Stop first with the kill switch:

`POST /api/pilot/kill-switch`

Body: `{"active":true,"reason":"Pilot stopped after readiness or safety concern"}`

Then:

1. Remove all test-number allowlist entries.
2. Disable the allowlist.
3. Do not add new participant numbers.
4. Stop all real or live provider calls.
5. Verify status returns `FORCED_OFFLINE_BY_KILL_SWITCH`.
6. Run the retention sweep if authorised:
   - `POST /api/pilot/retention/sweep`
7. Preserve only anonymized incident evidence and a brief incident reason.

Emergency stop takes precedence over continuing even one call.

## Predefined pilot success criteria

These thresholds are targets established before recruitment or carrier calls. They are not present evidence.

### Minimum pilot size

- At least 10 consenting participants.
- Both English and Twi representation.
- At least 20 complete call attempts, with English and Twi reported separately.
- At least 5 English and 5 Twi calls for separate language conclusions.
- Participation by people with visual impairments and limited digital literacy.

### English targets

- Connection success: at least 90%.
- ASR WER: at most 25% when human-verified references are available.
- Intent accuracy: at least 85%.
- Entity extraction: at least 90% for synthetic amount and recipient-reference cases.
- Conversation completion: at least 80%.
- DTMF recovery success: at least 90%.
- Unexpected disconnection: at most 5%.

### Twi targets

- Connection success: at least 90%.
- ASR WER: at most 30% when human-verified references are available.
- Intent accuracy: at least 85%.
- Entity extraction: at least 85% for synthetic amount and recipient-reference cases.
- Conversation completion: at least 80%.
- DTMF recovery success: at least 90%.
- Unexpected disconnection: at most 5%.

### Accessibility targets

- At least 80% of participants report that instructions were understandable.
- At least 80% can select their preferred language.
- At least 80% report screen-free navigation was possible.
- At least 80% recover successfully after a misunderstanding.
- Visually impaired participants complete the core task independently in at least 80% of attempts.

### Safety gates

- No real payment or purchase.
- No PIN, password, or real account credential collected.
- Any PIN-like speech is discarded.
- Every sensitive operation requires explicit confirmation.
- 100% of confirmed provider outcomes match provider confirmation.

### Evidence status rules

- Report a metric as unavailable if the denominator is zero or the ground truth is missing.
- Do not combine synthetic and real-call samples when reporting results.
- Do not count backend success or synthetic tests as a real conversation completion.
- Do not declare broader accessibility readiness unless English and Twi targets and the accessibility gate are met.
