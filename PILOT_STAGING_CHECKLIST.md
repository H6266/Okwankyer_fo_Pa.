# Controlled Real-Call Pilot Staging Checklist

This checklist prepares a staging environment. It does not authorise deployment or real financial calls.

**Twi approval gate:** All Twi wording and recordings remain unreviewed. A fluent human reviewer must approve the exact prompts before any participant call. Do not describe the Twi material as linguistically approved before that review is recorded.

## 1. Scope and authorization

- [ ] Written authorization for the controlled pilot.
- [ ] Participant recruitment and consent material approved.
- [ ] Sandbox-only provider accounts confirmed.
- [ ] Real payment, purchase, disbursement, and collection disabled or physically blocked.
- [ ] Named stop authority identified.
- [ ] Emergency kill-switch operator identified.

## 2. Required environment variables

Set secrets only in the staging platform's secret manager:

- `NODE_ENV=staging` or `test` as appropriate for the staging service.
- `PORT`
- `BASE_URL`: public staging HTTPS callback base.
- `AT_USERNAME`
- `AT_API_KEY`
- `AT_VOICE_NUMBER`
- `AT_INBOUND_VOICE_ENABLED=false` until provider authentication or a verified compensating control is approved.
- `AT_WEBHOOK_SECRET` (at least 32 characters; signs follow-up capabilities but does not prove provider origin).
- `ADMIN_TOKEN`
- `SESSION_SECRET`
- `GEMINI_API_KEY` only if ASR/NLU/brain provider access is authorised.
- `UG_HCI_LAB_API_KEY` if HCI Lab Twi ASR is part of the test.
- `SPEECH_PROVIDER`
- `BRAIN_MODE`
- `PILOT_ALLOWLIST_ENABLED=true`
- `PILOT_ALLOWED_NUMBERS=<comma-separated test numbers>`
- `PILOT_KILL_SWITCH=true` before initial configuration.
- `PILOT_EVIDENCE_ENABLED=false`
- `PILOT_EVIDENCE_STORAGE_PATH` empty until approved persistent storage is configured.
- `MAX_CLARIFICATION_ATTEMPTS=3`
- `PILOT_CONSENT_NOTICE_ENABLED=true`
- `MOMO_TARGET_ENV=sandbox`
- `MOMO_BASE_URL=https://sandbox...` only
- `ASR_FEEDBACK_ENABLED=true`
- `ASR_FEEDBACK_RETENTION_DAYS`
- `TRANSCRIPT_RETENTION_HOURS`
- `AUDIO_RETENTION_HOURS`
- `LOG_RETENTION_DAYS`

Do not paste secrets into source code, this checklist, chat, or call evidence.

## 3. Africa's Talking authentication gate

- [ ] Obtain provider documentation/support confirmation of a request-authentication mechanism or provider-origin network controls.
- [ ] Independently verify the mechanism and document residual risks; a valid session ID or callback-shaped body is not authentication.
- [ ] Do not configure a callback or enable `AT_INBOUND_VOICE_ENABLED` until the security control is reviewed and approved.
- [ ] Do not put `AT_WEBHOOK_SECRET` in a URL. Follow-up capabilities are session/path-bound and short-lived but query values may be retained by external logs.
- [ ] The callback does not request or accept a PIN.

No credentials or callback logs should contain raw caller transcripts, phone numbers, or unredacted query capabilities.

## 4. Callback verification (after security gate)

Only after the authentication gate above is satisfied, verify with an authorized provider-owned test call:

- inbound call callback;
- language selection;
- speech fallback;
- recording URL download;
- empty recording callback;
- DTMF callback;
- call hangup callback;
- timeout callback;
- no unexpected redirect loops.

Do not treat locally fabricated HTTP requests as proof of provider authenticity. Before the gate is satisfied, limit checks to health endpoints and local tests; keep inbound voice disabled.

## 5. Admin access

- [ ] `ADMIN_TOKEN` is at least 32 characters in staging.
- [ ] `SESSION_SECRET` is configured.
- [ ] Administrator uses HTTPS.
- [ ] Admin endpoints require a valid bearer token or signed session.
- [ ] Rate limiting is active.
- [ ] Non-pilot callers cannot use the pilot evidence endpoints.
- [ ] Pilot evidence report is reviewed only by authorised personnel.

## 6. Pilot allowlist

- [ ] `PILOT_ALLOWLIST_ENABLED=true`.
- [ ] Only approved test numbers are present.
- [ ] Participant numbers are in local +233/Ghana format or are normalized successfully.
- [ ] Non-allowlisted calls force offline-only brain behavior.
- [ ] Allowlist status is verified at `/api/pilot/status`.
- [ ] No real customer number is allowlisted.

## 7. Kill switch verification

Before opening calls:

- [ ] Engage with `{"active":true,"reason":"Pre-pilot readiness check"}`.
- [ ] Verify status: `FORCED_OFFLINE_BY_KILL_SWITCH`.
- [ ] Verify non-pilot or test calls cannot proceed with live brain behavior.
- [ ] Disengage only after all other checks pass.
- [ ] Test a second kill-switch engagement during a simulated call.

## 8. Health checks

- [ ] `/health` responds successfully.
- [ ] Static audio routes return 200 or 206.
- [ ] Canonical English audio can be served.
- [ ] Canonical Twi audio can be served.
- [ ] TTS fallback fails explicitly when Twi synthesis is not reviewed.
- [ ] ASR provider health is reported honestly.
- [ ] Callback URL generation uses HTTPS `BASE_URL`.

## 9. Test-number readiness

- [ ] At least 10 participant slots or test dial attempts planned.
- [ ] English test script and Twi test script prepared.
- [ ] Synthetic recipient number is documented only outside real evidence.
- [ ] Synthetic amount and tasks are approved.
- [ ] No caller PIN is requested.
- [ ] DTMF fallback keys are known.
- [ ] Participant consent is completed before each call.

## 10. Financial safeguards

- [ ] `MOMO_TARGET_ENV=sandbox`.
- [ ] Sandbox credentials only.
- [ ] Provider submission remains unreachable for this pilot or is a feature-disabled test route.
- [ ] Confirmation readback is required.
- [ ] Spoken confirmation cannot initiate payment.
- [ ] Provider success is reported only after provider confirmation.

## 11. Evidence persistence and participant data

- [ ] Evidence collection remains disabled by default.
- [ ] Approve a persistent storage approach before enabling collection; do not use free-tier ephemeral storage for participant evidence.
- [ ] Verify the configured storage path is actually mounted persistent storage; an absolute path alone is insufficient.
- [ ] Document access controls and encryption; evidence can contain transcripts, intent/entity fields, accessibility feedback, and call outcomes.
- [ ] Approve retention and tested backup/recovery procedures.
- [ ] Exercise the administrator-authenticated participant withdrawal route `DELETE /api/pilot/call-evidence/participant/:participantId` on the approved persistent store; verify matching evidence is removed and the report is updated.
- [ ] Obtain documented legal/operational approval for retention, deletion timing, backup contents, restore procedures, and deletion propagation to backups.
- [ ] Obtain approval before adding any external database or storage subscription.

## 12. Rollback and emergency shutdown

1. Call the kill-switch endpoint with `active:true`.
2. Disable the allowlist.
3. Remove allowlisted test numbers.
4. Stop inbound voice route access if the kill switch is insufficient.
5. Cancel or avoid any provider submission.
6. Verify no live `MOMO_*` disbursement credentials are active.
7. Preserve anonymized incident records only.
8. Restore the prior staging environment configuration only under authorised change control.

## 13. Go/no-go decision

Proceed only if:

- [ ] provider callback authentication or an approved compensating control is verified;
- [ ] health and audio delivery pass;
- [ ] pilot controls pass;
- [ ] kill switch passes;
- [ ] consent procedure passes;
- [ ] test numbers are approved;
- [ ] sandbox financial protections pass;
- [ ] Twi wording is approved by a fluent human reviewer before Twi participant calls;
- [ ] approved persistent evidence storage and participant-data controls are operational before evidence collection;
- [ ] named operator and stop authority are available.

If any item fails, do not start a real call.
