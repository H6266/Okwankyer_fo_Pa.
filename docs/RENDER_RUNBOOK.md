# Render Deployment Runbook
### Ɔkwankyerɛfo Pa ("The Good Guide")

This runbook guides production deployment of the Ɔkwankyerɛfo Pa Voice Accessibility Layer on Render.

> **Deployment blocked:** This document is historical preparation, not authorization to create or update a production service. Provider callback authentication is unresolved, staging is not deployed, and no real-call pilot has been validated. Do not configure production provider callbacks or live financial credentials.

---

## 1. Prerequisites

1. An active [Render](https://render.com) account.
2. An [Africa's Talking](https://africastalking.com) account with the active Voice Virtual Number `+233 30 804 8097`.
3. A Google Cloud project with the [Gemini API](https://aistudio.google.com) enabled.
4. No production financial credentials; this pilot does not authorize real payments.

---

## 2. Environment Variables Configuration

Configure the following variables in the Render Dashboard under **Service ➔ Environment**:

| Variable Name | Required | Default / Example | Purpose |
|---|:---:|---|---|
| `NODE_ENV` | Yes | `production` | Enables production optimizations and static frontend serving. |
| `PORT` | Yes | `3000` | Port for the HTTP and WebSocket server. |
| `BASE_URL` | Yes | `https://okwankyer-fo-pa.onrender.com` | Public HTTPS URL for Africa's Talking webhook callbacks and audio streaming. |
| `AT_USERNAME` | Yes | `sandbox` (or live username) | Africa's Talking API account username. |
| `AT_API_KEY` | Yes | `atsk_...` | Africa's Talking API key for voice gateway connectivity. |
| `AT_VOICE_NUMBER` | Yes | `+233308048097` | Virtual telephony voice trunk number. |
| `AT_WEBHOOK_SECRET` | Yes | Independently generated value (at least 32 characters) | Signs application follow-up capabilities; it does not authenticate a native provider request by itself. |
| `GEMINI_API_KEY` | Yes | `AIzaSy...` | Google Gemini API key for spoken ASR & intent parsing. |
| `ADMIN_TOKEN` | Yes | `sec_admin_...` | Secret Bearer token protecting administrative endpoints (`/api/upload-audio`). |
| `MOMO_SUBSCRIPTION_KEY` | Not for this pilot | Unset | Do not configure production financial credentials. |
| `MOMO_API_USER_ID` | Not for this pilot | Unset | Do not configure production financial credentials. |
| `MOMO_API_KEY` | Not for this pilot | Unset | Do not configure production financial credentials. |
| `MOMO_TARGET_ENV` | Optional | `sandbox` only | No production target is authorized for the pilot. |
| `CORS_ORIGINS` | Optional | `*` | Allowed CORS origins for dashboard API access. |
| `DEMO_MODE` | Optional | `false` | When false, suppresses synthetic test fixture data in production views. |

---

## 3. Production deployment steps — do not execute

The steps below are retained for historical context only. Do not apply `render.yaml` or trigger a production deployment as part of pilot preparation.

1. **Connect Repository** (blocked):
   - In Render, click **New ➔ Blueprint**.
   - Select the repository: `https://github.com/H6266/Okwankyer_fo_Pa.git`.
2. **Review Blueprint**:
   - Render detects `render.yaml`:
     - **Build Command**: `npm install --legacy-peer-deps && npm run build`
     - **Start Command**: `npm start`
     - **Runtime**: `Node 22`
3. **Trigger Deployment**:
   - Click **Apply Blueprint**.
   - Render compiles the TypeScript client bundle to `dist/client` and builds the production standalone server in `dist/server.cjs`.

---

## 4. Africa's Talking voice callback — blocked pending security review

Do not configure a production callback. The application cannot currently prove that a native callback came from Africa's Talking. A session ID or callback-shaped body is not authentication; `AT_WEBHOOK_SECRET` must not be put into a URL and does not by itself authenticate the initial provider request.

No callback URL is provided here. Do not change any provider number or production deployment until the provider's authentication support or a provider-confirmed compensating control has been independently verified and formally approved.

**Secret rotation:** If the earlier query-string secret behavior was used in any deployed environment, treat `AT_WEBHOOK_SECRET` as exposed and rotate it before further use. Never paste it into source control, a callback URL, or chat logs.

Only revisit production callback configuration after the provider's authentication support or a provider-confirmed compensating control has been independently verified and formally approved. GitHub Codespaces is a development environment, not a production endpoint.

An AT session marked **Aborted** can occur when a callback is rejected. A correctly shaped callback body or session ID is not authentication. Do not enable provider traffic until the provider's supported authentication mechanism or an approved compensating control is verified.

---

## 5. Post-Deployment Smoke Verification

First check the public service status:
```bash
curl --fail https://okwankyer-fo-pa.onrender.com/health
```
The response should report `"status":"ok"`, `"atConfigured":true`, and the
configured `voiceNumber`. If `atConfigured` is false or `voiceNumber` is
empty, set `AT_USERNAME`, `AT_API_KEY`, and `AT_VOICE_NUMBER` in the Render
service environment. Do not put API keys or webhook secrets in source control
or paste them into support messages.

The full smoke test is admin-protected. Set `ADMIN_TOKEN` in your local shell
to the value already configured in Render, then run:
```bash
curl --fail-with-body \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -X POST https://okwankyer-fo-pa.onrender.com/api/dev/smoke-test
```
A healthy deployment returns:
```json
{
  "overallStatus": "pass",
  "passCount": 4,
  "failCount": 0,
  "warnCount": 0
}
```
If any check fails, inspect application logs in Render Dashboard using correlation IDs. Do not include callback query capabilities or credentials in tickets. Do not use a query-string secret to make an unsigned `/voice-menu` request pass.

The Blueprint currently uses Render's free plan. Free web services can spin
down when idle and take time to start again, which can delay an inbound
Africa's Talking webhook. For dependable live calling, use an always-on
Render plan; changing the service plan may incur charges.
