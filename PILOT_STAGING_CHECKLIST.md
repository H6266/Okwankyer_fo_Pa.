# Controlled Real-Call Pilot Staging Checklist

This checklist prepares a staging environment. It does not authorise deployment or real financial calls.

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
- `AT_INBOUND_VOICE_ENABLED=true`
- `AT_WEBHOOK_SECRET`
- `ADMIN_TOKEN`
- `SESSION_SECRET`
- `GEMINI_API_KEY` only if ASR/NLU/brain provider access is authorised.
- `UG_HCI_LAB_API_KEY` if HCI Lab Twi ASR is part of the test.
- `SPEECH_PROVIDER`
- `BRAIN_MODE`
- `PILOT_ALLOWLIST_ENABLED=true`
- `PILOT_ALLOWED_NUMBERS=<comma-separated test numbers>`
- `PILOT_KILL_SWITCH=true` before initial configuration.
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

## 3. Africa's Talking configuration

- [ ] Sandbox/approved voice number enabled.
- [ ] Voice callback URL points to staging HTTPS `/voice-menu` or the configured inbound route.
- [ ] Speech callback URL accepts `sessionId`, `step`, `lang`, and recording fields.
- [ ] Recording callback URL is publicly accessible.
- [ ] Callback timeout and retry behavior verified.
- [ ] `AT_WEBHOOK_SECRET` verification tested without weakening webhook handling.
- [ ] The callback does not request or accept a PIN.

No credentials or callback logs should contain raw caller transcripts or phone numbers.

## 4. Callback verification

Verify:

- inbound call callback;
- language selection;
- speech fallback;
- recording URL download;
- empty recording callback;
- DTMF callback;
- call hangup callback;
- timeout callback;
- no unexpected redirect loops.

Call health and callback endpoints with test sessions only.

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

## 11. Rollback and emergency shutdown

1. Call the kill-switch endpoint with `active:true`.
2. Disable the allowlist.
3. Remove allowlisted test numbers.
4. Stop inbound voice route access if the kill switch is insufficient.
5. Cancel or avoid any provider submission.
6. Verify no live `MOMO_*` disbursement credentials are active.
7. Preserve anonymized incident records only.
8. Restore the prior staging environment configuration only under authorised change control.

## 12. Go/no-go decision

Proceed only if:

- [ ] callback is verified;
- [ ] health and audio delivery pass;
- [ ] pilot controls pass;
- [ ] kill switch passes;
- [ ] consent procedure passes;
- [ ] test numbers are approved;
- [ ] sandbox financial protections pass;
- [ ] named operator and stop authority are available.

If any item fails, do not start a real call.
