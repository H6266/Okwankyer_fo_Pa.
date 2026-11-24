# Render staging deployment guide

## Status and scope

This guide prepares a separate Render web service named `okwankyer-fo-pa-staging`. It does not modify the existing `render.yaml` production service, deploy anything, or configure a provider callback. The staging blueprint has auto-deploy disabled, inbound voice disabled, and no provider credentials.

Staging is **not ready for telephone calls or participant traffic**. Callback authenticity for native Africa's Talking requests has not been verified. Keep `AT_INBOUND_VOICE_ENABLED=false`; do not configure a provider callback or enable this setting until the provider's supported authentication mechanism or a provider-confirmed network restriction is verified and approved. A successful health check alone does not verify callback delivery or authenticity.

## Verified application commands and configuration

The repository's `package.json` defines:

- Build: `npm install --legacy-peer-deps && npm run build`
- Production build script: `vite build --outDir dist/client && esbuild src/serverApp.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`
- Start: `npm start` (`node dist/server.cjs`)
- Tests: `npm test` (`vitest run --testTimeout=15000`)
- TypeScript check: `npm run typecheck` (`tsc --noEmit`)

Render should use Node 22. Render supplies `PORT`; the server binds to `0.0.0.0` and uses that port. The production process requires an independently generated `AT_WEBHOOK_SECRET` of at least 32 characters and an `ENCRYPTION_KEY` of at least 32 bytes. The secret is used to sign short-lived follow-up capabilities; it does **not** prove that an initial request came from Africa's Talking. Set independent `ADMIN_TOKEN` and `SESSION_SECRET` values; do not rely on application fallback values.

## Create the separate Render service

1. Push a reviewed staging branch containing the application and `render.staging.yaml`. Do not deploy the worktree or edit the existing production service. Keep unrelated local changes out of the staging commit.
2. In Render, create a **new Blueprint** for this repository and select `render.staging.yaml` as the Blueprint file. Use the staging branch as the source.
3. Confirm Render creates a new service named `okwankyer-fo-pa-staging`. Do not select or update the existing `okwankyer-fo-pa` production service.
4. Keep **Auto-Deploy disabled**. The build and start commands, `/health` health-check path, Node 22 runtime, and safe defaults are declared in `render.staging.yaml`.
5. Before the first deploy, set the `sync: false` environment variables below in the staging service only. Set `BASE_URL` to the exact HTTPS hostname Render assigned to this staging service, with no trailing slash. Do not use the production hostname.
6. Deploy the staging service manually and wait for Render's deploy and health check to succeed.

### Required staging environment values

| Variable | Staging value |
| --- | --- |
| `NODE_ENV` | `production` |
| `BASE_URL` | Exact staging `https://…onrender.com` hostname |
| `ENCRYPTION_KEY` | Independently generated random value, at least 32 bytes |
| `SESSION_SECRET` | Independently generated secret; do not reuse the production value |
| `ADMIN_TOKEN` | Independently generated secret; do not reuse the production value |
| `AT_WEBHOOK_SECRET` | Independently generated secret, at least 32 characters; not proof of provider origin |
| `AT_USERNAME` | Authorized non-production Africa's Talking account/username |
| `AT_API_KEY` | Authorized non-production Africa's Talking credential |
| `AT_VOICE_NUMBER` | Number assigned to the staging/non-production provider account |

Generate secret values locally (for example, `openssl rand -hex 32`) and enter them directly into the staging service's Render environment settings. Never put them in Git, a Blueprint, a URL, a log, or this guide. Keep `SESSION_SECRET`, `ADMIN_TOKEN`, and `ENCRYPTION_KEY` distinct from one another and from production values.

The Blueprint also sets `AT_INBOUND_VOICE_ENABLED=false`, `PILOT_KILL_SWITCH=true`, `PILOT_ALLOWLIST_ENABLED=true`, `PILOT_ALLOWED_NUMBERS` to an explicit empty value, `PILOT_EVIDENCE_ENABLED=false`, `PILOT_EVIDENCE_STORAGE_PATH` empty, `PILOT_CONSENT_NOTICE_ENABLED=true`, and `BRAIN_MODE=offline_only`. The explicit empty allowlist overrides any list in a bundled `data/pilot_controls.json`; an empty enabled allowlist denies live-mode eligibility, including when caller identity is missing. Do not populate the allowlist or enable inbound voice until the security, storage, and pilot approvals below are complete.

The Blueprint sets `ENABLE_SIMULATOR=false`, `DEMO_MODE=false`, `SESSION_TTL_MS=1800000`, `GEMINI_MODEL=gemini-3.8-flash`, and MTN MoMo sandbox target/base URL/environment/currency. Do not link a production environment group or add `MOMO_*`, `MTN_*`, or `TELECEL_*` transaction credentials to staging. In particular, do not add production financial-provider credentials. No `GEMINI_API_KEY` or `GROQ_API_KEY` is configured; the kill switch and `BRAIN_MODE` are independently set to offline.

`ENCRYPTION_KEY` controls the encryption format for stored encrypted fields: changing it later makes data encrypted with the prior key unreadable. Keep it private and back it up securely. The admin session cookie is HTTP-only, signed using `SESSION_SECRET`, secure in production, and has a one-hour cookie lifetime. `SESSION_TTL_MS` is used by session/transaction retention; it is not the admin cookie lifetime.

## Africa's Talking callback configuration

### Callback URLs

Set the **staging provider number's** Voice Callback URL to:

`https://<STAGING_RENDER_HOST>/voice-menu`

The host must exactly match the staging `BASE_URL`. The source also exposes `GET https://<STAGING_RENDER_HOST>/api/telephony/webhook-info` to report the host-derived primary URL and aliases. Do not configure the production provider number to point at staging.

`/voice-menu` is the canonical inbound entry. The app also registers `/voice`, `/voice/callback`, `/voice/webhook`, `/voice-callback`, `/callback`, `/telephony/callback`, `/api/voice`, and `/api/voice/callback`; these are aliases, not separate callbacks to configure. The IVR response generates absolute follow-up callback URLs using the request host / configured base URL. They include `/language-selection`, `/speech-fallback`, `/voice/events`, and menu/transaction step paths such as `/service-choice`, `/provider-choice`, `/action-choice`, `/verify-recipient`, `/verify-amount`, and `/submit-transfer`. Configure only the primary callback in Africa's Talking.

### Callback authentication status and request contract

- The inbound route and IVR step routes use Express `all` handlers: the application accepts any HTTP method. The method actually used by the provider must be observed in a real staging request; this source inspection does not establish it.
- The production webhook guard requires a valid `sessionId` (3–128 allowed alphanumeric, dash, dot, colon, underscore characters). Callback-shaped fields do not authenticate a request, and the application no longer creates a fallback session ID. The entry handler reads `callerNumber` or `phoneNumber`, `isActive`, and optional language fields (`lang` / `language`). Later IVR callbacks use `sessionId`, `dtmfDigits`, language, and, for speech callbacks, step/transcript or recording URL fields.
- For an inbound call, the expected response is Africa's Talking VoiceXML in an `application/xml` response, starting with a `<Response>` document. An end-of-call callback (`isActive=0`) returns plain-text `OK`; `/voice/events` also returns plain-text `OK`.
- The application has no verified Africa's Talking signature, authenticated transport identity, or provider IP range for native callbacks. The provider documentation could not be independently verified during this repository audit. Native callback-shaped fields and session ID format are not proof of provider origin. The application now fails closed in production unless the request has a valid configured authentication header or a valid follow-up capability.
- Follow-up URLs receive a per-session, per-path HMAC capability that expires after five minutes, is single-use within one process, and is invalidated on process restart. Initial header-authenticated callbacks also reject duplicate session IDs for 24 hours within one process; this resets on restart and is not a provider signature or durable replay defense. The follow-up capability is not the shared `AT_WEBHOOK_SECRET`; however, as a query credential it may still be retained by external provider/platform logs. Application traces store only the callback path, and session trace APIs now require administrator authentication. Provider-side URL logging and retention are unverified.
- Do not configure the primary provider callback, enable inbound voice, or admit participants until Africa's Talking-supported authentication is confirmed. If the provider cannot authenticate a callback cryptographically, obtain and verify its supported network restrictions and document the residual risk before any participant traffic. No provider IP allowlist is configured or claimed here. Do not substitute `AT_WEBHOOK_SECRET` in a URL for provider authentication.

No callback has been verified by this guide. Only a genuine request from the authorized non-production provider, observed at the staging service, can verify reachability and the provider's actual request method/parameters.

## Health checks and safe test procedure

1. Confirm the Render deployment is healthy at `GET https://<STAGING_RENDER_HOST>/health`. Expect JSON with `status: "ok"` and the staging callback URL. This is an application liveness check only; it does not check callback delivery.
2. Using the staging-only `ADMIN_TOKEN` over HTTPS, call `GET /api/pilot/status` with `Authorization: Bearer <staging-admin-token>`. Confirm the kill switch is active. Call `GET /api/pilot/allowlist` and confirm it is enabled and empty. Never put the token in a URL or paste it into chat.
3. Confirm in Render that `BASE_URL` is staging-only, the `AT_*` values belong to an authorized non-production account/line, all financial-provider credentials are absent, and MoMo is configured only for sandbox.
4. Do not configure an Africa's Talking callback or place a telephone call yet. First obtain provider documentation/support confirmation of a request-authentication mechanism or provider-origin network controls and get the residual risk approved. Keep inbound voice disabled while this is unresolved.
5. After the authentication control is independently verified in staging, perform a provider-owned, non-participant callback test and verify the actual method, parameters, XML response, HTTPS host, and follow-up capability behavior. Do not simulate a provider callback or treat a locally fabricated request as provider verification.
6. Do not admit pilot callers until callback security, consent, Twi approval, evidence persistence, data controls, and rollback have all passed review. Evidence submission is disabled unless explicitly enabled with a configured absolute storage path; the path's persistence must be verified by the operator.

The free-tier Blueprint has no persistent disk and Render's filesystem is ephemeral. Evidence collection is disabled by default and must remain disabled. Do not accept ephemeral evidence storage. Before any collection, obtain approval for a persistent disk or external database, configure and verify the mount/path, and approve access, encryption, retention, withdrawal/deletion, and backup/recovery procedures. The application now provides an administrator-authenticated local JSONL participant-deletion route, but it is not a substitute for persistent storage or verified backup/deletion policy. No external storage subscription is included or authorized. Pilot-control file changes are also ephemeral; environment defaults keep the kill switch on and allowlist enabled/empty after restart. A staging service on a free plan may sleep.

## Rollback

1. For an immediate staging-only rollback, remove or disable the callback on the **staging Africa's Talking number** and pause the `okwankyer-fo-pa-staging` service in Render. Do not change the production provider number or production Render service.
2. The pilot kill switch forces the AI brain to `offline_only`; it does not reject the call or disable every deterministic IVR route. Do not use it as the sole callback/traffic shutdown mechanism.
3. If only the staging application deploy is faulty, manually redeploy the last known-good staging commit from Render. Keep auto-deploy disabled until verified.
4. Preserve logs and any required staging evidence under the approved retention policy. Do not copy staging secrets or evidence into production.

## Remaining manual steps

- Create the separate Render Blueprint service from `render.staging.yaml`; no service has been created or deployed by this change.
- Enter the staging-only secrets and authorized non-production Africa's Talking credentials in Render, then set the exact assigned staging hostname as `BASE_URL`.
- Confirm the provider account has an authorized non-production voice number and configure its callback to `/voice-menu`.
- Verify Africa's Talking authentication support and any provider-origin network controls; then review and test a compensating control before enabling inbound voice.
- Decide on approved persistent evidence storage and implement/test retention, backup/recovery, participant withdrawal, and deletion before collecting evidence.
- Obtain fluent human review and approval of Twi prompts before any participant call.
- Keep inbound voice disabled, the staging kill switch engaged, the allowlist empty, and evidence collection disabled until all controls, provider behavior, consent workflow, and rollback procedure have been approved.
