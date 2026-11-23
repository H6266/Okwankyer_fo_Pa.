# Render staging deployment guide

## Status and scope

This guide prepares a separate Render web service named `okwankyer-fo-pa-staging`. It does not modify the existing `render.yaml` production service, deploy anything, or configure a provider callback. The staging blueprint has auto-deploy disabled and contains no provider credentials.

The staging service is **not operational** until Render configuration is complete and an authorized real Africa's Talking callback is independently observed in its logs. A successful health check alone does not verify a provider callback.

## Verified application commands and configuration

The repository's `package.json` defines:

- Build: `npm install --legacy-peer-deps && npm run build`
- Production build script: `vite build --outDir dist/client && esbuild src/serverApp.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`
- Start: `npm start` (`node dist/server.cjs`)
- Tests: `npm test` (`vitest run --testTimeout=15000`)
- TypeScript check: `npm run typecheck` (`tsc --noEmit`)

Render should use Node 22. Render supplies `PORT`; the server binds to `0.0.0.0` and uses that port. The production process validates `AT_WEBHOOK_SECRET` at startup, and production encryption requires an `ENCRYPTION_KEY` of at least 32 bytes. Set independent `ADMIN_TOKEN` and `SESSION_SECRET` values; do not rely on application fallback values.

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
| `AT_WEBHOOK_SECRET` | Independently generated secret, at least 16 characters |
| `AT_USERNAME` | Authorized non-production Africa's Talking account/username |
| `AT_API_KEY` | Authorized non-production Africa's Talking credential |
| `AT_VOICE_NUMBER` | Number assigned to the staging/non-production provider account |

Generate secret values locally (for example, `openssl rand -hex 32`) and enter them directly into the staging service's Render environment settings. Never put them in Git, a Blueprint, a URL, a log, or this guide. Keep `SESSION_SECRET`, `ADMIN_TOKEN`, and `ENCRYPTION_KEY` distinct from one another and from production values.

The Blueprint also sets `PILOT_KILL_SWITCH=true`, `PILOT_ALLOWLIST_ENABLED=true`, `PILOT_ALLOWED_NUMBERS` to an explicit empty value, `PILOT_CONSENT_NOTICE_ENABLED=true`, and `BRAIN_MODE=offline_only`. The explicit empty allowlist overrides any list in a bundled `data/pilot_controls.json`; an empty enabled allowlist now denies live-mode eligibility, including when caller identity is missing. Do not populate the allowlist until staging checks are complete and an authorized pilot is approved.

The Blueprint sets `ENABLE_SIMULATOR=false`, `DEMO_MODE=false`, `SESSION_TTL_MS=1800000`, `GEMINI_MODEL=gemini-3.8-flash`, and MTN MoMo sandbox target/base URL/environment/currency. Do not link a production environment group or add `MOMO_*`, `MTN_*`, or `TELECEL_*` transaction credentials to staging. In particular, do not add production financial-provider credentials. No `GEMINI_API_KEY` or `GROQ_API_KEY` is configured; the kill switch and `BRAIN_MODE` are independently set to offline.

`ENCRYPTION_KEY` controls the encryption format for stored encrypted fields: changing it later makes data encrypted with the prior key unreadable. Keep it private and back it up securely. The admin session cookie is HTTP-only, signed using `SESSION_SECRET`, secure in production, and has a one-hour cookie lifetime. `SESSION_TTL_MS` is used by session/transaction retention; it is not the admin cookie lifetime.

## Africa's Talking callback configuration

### Callback URLs

Set the **staging provider number's** Voice Callback URL to:

`https://<STAGING_RENDER_HOST>/voice-menu`

The host must exactly match the staging `BASE_URL`. The source also exposes `GET https://<STAGING_RENDER_HOST>/api/telephony/webhook-info` to report the host-derived primary URL and aliases. Do not configure the production provider number to point at staging.

`/voice-menu` is the canonical inbound entry. The app also registers `/voice`, `/voice/callback`, `/voice/webhook`, `/voice-callback`, `/callback`, `/telephony/callback`, `/api/voice`, and `/api/voice/callback`; these are aliases, not separate callbacks to configure. The IVR response generates absolute follow-up callback URLs using the request host / configured base URL. They include `/language-selection`, `/speech-fallback`, `/voice/events`, and menu/transaction step paths such as `/service-choice`, `/provider-choice`, `/action-choice`, `/verify-recipient`, `/verify-amount`, and `/submit-transfer`. Configure only the primary callback in Africa's Talking.

### Request and response contract observed in source

- The inbound route and IVR step routes use Express `all` handlers: the application accepts any HTTP method. The method actually used by the provider must be observed in a real staging request; this source inspection does not establish it.
- The production webhook guard requires a valid `sessionId` (3–128 allowed alphanumeric, dash, dot, colon, underscore characters) except where it creates a fallback for recognized provider-shaped data. The entry handler reads `callerNumber` or `phoneNumber`, `isActive`, and optional language fields (`lang` / `language`). Later IVR callbacks use `sessionId`, `dtmfDigits`, language, and, for speech callbacks, step/transcript or recording URL fields.
- For an inbound call, the expected response is Africa's Talking VoiceXML in an `application/xml` response, starting with a `<Response>` document. An end-of-call callback (`isActive=0`) returns plain-text `OK`; `/voice/events` also returns plain-text `OK`.
- `AT_WEBHOOK_SECRET` must be configured for production startup and an explicitly supplied wrong secret is rejected. The source also permits native-provider callbacks without that secret when the request contains recognized Africa's Talking fields, because native voice callbacks do not attach custom headers. Thus, setting this variable does **not** prove that an incoming provider request was cryptographically authenticated.
- Important: current `xmlResponse` code appends `AT_WEBHOOK_SECRET` as a `secret` query parameter to same-origin follow-up callback URLs in VoiceXML. Do not manually add it to the provider's primary callback URL, but be aware the provider receives it on follow-up URLs and URL query values may be retained in provider or service logs. Before any real participant call, confirm provider handling and log redaction/retention for those URLs. The secret itself is only to be entered in Render's staging environment; never put its value in Git, this guide, or chat.

No callback has been verified by this guide. Only a genuine request from the authorized non-production provider, observed at the staging service, can verify reachability and the provider's actual request method/parameters.

## Health checks and safe test procedure

1. Confirm the Render deployment is healthy at `GET https://<STAGING_RENDER_HOST>/health`. Expect JSON with `status: "ok"` and the staging callback URL. This is an application liveness check only; it does not check callback delivery.
2. Using the staging-only `ADMIN_TOKEN` over HTTPS, call `GET /api/pilot/status` with `Authorization: Bearer <staging-admin-token>`. Confirm the kill switch is active. Call `GET /api/pilot/allowlist` and confirm it is enabled and empty. Never put the token in a URL or paste it into chat.
3. Confirm in Render that `BASE_URL` is staging-only, the `AT_*` values belong to an authorized non-production account/line, all financial-provider credentials are absent, and MoMo is configured only for sandbox.
4. Have the Africa's Talking account owner configure the staging number's Voice Callback URL above. Use an authorized staging test line/participant and follow the approved consent procedure. Begin with the welcome/language prompts and end the call; do not enter a transfer, PIN, or other transaction flow. Do not use a production provider number or real financial credentials.
5. Inspect staging logs for the actual callback method, expected provider parameters, XML response, and staging host in generated follow-up URLs. Do not simulate a provider callback or treat a locally fabricated request as provider verification.
6. Before enabling any pilot caller, obtain explicit pilot approval, complete safety/privacy review, independently verify provider reachability/authentication, and then manage the allowlist through the authenticated staging pilot endpoint. Consent remains mandatory for evidence submission. The pilot evidence report is available only through the authenticated pilot routes.

The free-tier Blueprint has no persistent disk and Render's filesystem is ephemeral. Do not rely on staging evidence or pilot-control file changes surviving restarts/redeploys. Before collecting real participant evidence, choose and configure an approved persistent-storage and retention approach, or explicitly accept that evidence is ephemeral. A staging service on a free plan may also sleep; upgrade it if continuous callback availability is required.

## Rollback

1. For an immediate staging-only rollback, remove or disable the callback on the **staging Africa's Talking number** and pause the `okwankyer-fo-pa-staging` service in Render. Do not change the production provider number or production Render service.
2. The pilot kill switch forces the AI brain to `offline_only`; it does not reject the call or disable every deterministic IVR route. Do not use it as the sole callback/traffic shutdown mechanism.
3. If only the staging application deploy is faulty, manually redeploy the last known-good staging commit from Render. Keep auto-deploy disabled until verified.
4. Preserve logs and any required staging evidence under the approved retention policy. Do not copy staging secrets or evidence into production.

## Remaining manual steps

- Create the separate Render Blueprint service from `render.staging.yaml`; no service has been created or deployed by this change.
- Enter the staging-only secrets and authorized non-production Africa's Talking credentials in Render, then set the exact assigned staging hostname as `BASE_URL`.
- Confirm the provider account has an authorized non-production voice number and configure its callback to `/voice-menu`.
- Independently verify a genuine provider callback in staging and confirm its method, parameters, response, and callback reachability.
- Decide on paid/always-on hosting and persistent evidence storage before a real-caller pilot.
- Keep the staging kill switch engaged and allowlist empty until the controls, provider callback, consent workflow, and rollback procedure have been reviewed.
