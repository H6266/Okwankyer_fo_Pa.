# Security status and operational limitations

## Current status

This repository contains a voice application prototype and a simulated pilot flow. No real payment, participant call, or production financial action is authorized by the pilot. The staging Blueprint keeps inbound voice disabled, the kill switch active, the allowlist enabled and empty, and evidence collection disabled.

**Do not enable telephone or participant traffic until the callback-authentication and evidence-storage gates below are resolved and approved.**

## Africa's Talking callback authentication

The application cannot currently establish that a native Africa's Talking callback came from Africa's Talking. This audit could not verify an official provider signature, authenticated transport identity, or provider IP range. Provider-shaped fields such as `callerNumber`, `isActive`, `recordingUrl`, and a syntactically valid `sessionId` are attacker-controlled input, not authentication.

In production, the webhook guard fails closed unless either:

- the request supplies the configured shared secret in `X-AT-Webhook-Secret` or `Authorization`; or
- a follow-up request presents an application-issued capability.

The application has not verified that Africa's Talking can send the shared-secret header. Therefore, a configured `AT_WEBHOOK_SECRET` alone does not authenticate a native provider request. Do not put that secret in a callback URL. Keep `AT_INBOUND_VOICE_ENABLED=false` until provider support for an authentication mechanism or provider-origin network control is confirmed and the residual risk is approved. No provider IP allowlist is configured.

After an authenticated request, generated follow-up VoiceXML callback/redirect URLs carry an HMAC-signed capability bound to a session ID and exact callback path. Capabilities expire after five minutes, are single-use within one process, and are invalid after a process restart. The shared signing secret is not included in the URL. The capability itself is a short-lived bearer value in the query string, so provider/platform access-log retention remains an external risk and has not been verified. This mechanism protects application-generated follow-ups; it does not authenticate the initial provider callback.

Header-authenticated initial callbacks reject a repeated session ID for 24 hours within one process. This in-memory check resets on restart and is not a provider signature or durable replay defense. Callback-shaped fallback session IDs are no longer generated. The root callback dispatch checks query as well as body fields, and the callback guard covers `/exit-grace-choice`. Do not run multiple app instances for these in-memory one-use capabilities; distributed replay storage is not implemented. Local development without a configured secret retains an unauthenticated callback path for tests only; never use that mode in staging or production.

The application trace stores the callback pathname, not the full URL. Call-session list/detail/turn/trace routes require administrator authentication and are rate-limited. Unauthorized administrator logs record only the route path, not query strings. Provider and hosting platform request logs may still record full URLs.

## Evidence and personal data

The call-evidence collector can store:

- deterministic, unsalted SHA-256 prefixes of participant and call IDs (pseudonymous, not anonymous);
- optional human and provider transcripts, intents, expected intents, synthetic entities, accessibility answers, and call outcomes.

Basic phone/PIN-like text redaction is not a guarantee that arbitrary personal information is removed. Individual records remain sensitive. The collector writes JSON Lines to a local filesystem path and does not encrypt records itself.

Evidence collection now requires both `PILOT_EVIDENCE_ENABLED=true` and an absolute `PILOT_EVIDENCE_STORAGE_PATH`; otherwise the submission endpoint returns HTTP 503. The staging Blueprint sets collection false and the path empty. An absolute path does not prove that a persistent disk is mounted. Render's free service filesystem is ephemeral; do not collect participant evidence there.

No persistent storage provider, access policy, encryption configuration, retention schedule, backup/recovery procedure, or verified participant-data restore procedure has been approved or implemented. An administrator-authenticated deletion primitive now exists at `DELETE /api/pilot/call-evidence/participant/:participantId`, and rewrites the configured local JSONL file after removing matching anonymized records. This route is not participant-facing, does not establish a verified backup/recovery process, and must not be used against free-tier ephemeral storage. Do not enable collection until persistent storage, access controls, retention, and tested deletion/restore procedures are selected and approved. No external storage subscription is included or authorized.

## Pilot language and financial boundaries

- The controlled IVR is a simulation: no payment, purchase, PIN prompt, or USSD/payment handoff should occur.
- Staging contains no live financial-provider credentials and uses `MOMO_TARGET_ENV=sandbox` and `MOMO_CURRENCY=GHS`.
- Twi prompts and recordings are not linguistically approved. A fluent human reviewer must approve the exact material before any Twi participant call.
- Automated tests do not establish provider authenticity, real-call accuracy, accessibility, or participant safety.

## Reporting and response

Report suspected vulnerabilities privately to the repository maintainers. Do not include production credentials, participant transcripts, phone numbers, or callback capability values in reports. Rotate any secret that may have appeared in URLs or logs; if the application has been deployed with the earlier query-string secret behavior, treat that shared secret as exposed.

## Verification scope

The audit reviewed application callback handling, URL generation and tracing, session APIs, evidence collection, staging defaults, and pilot documentation. It did not inspect Render service settings, provider account configuration, external platform logs, or the provider's inaccessible documentation. No staging deployment or live callback test was performed.
