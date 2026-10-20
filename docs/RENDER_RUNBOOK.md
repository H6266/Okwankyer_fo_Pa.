# Render Deployment Runbook
### Ɔkwankyerɛfo Pa ("The Good Guide")

This runbook guides production deployment of the Ɔkwankyerɛfo Pa Voice Accessibility Layer on Render.

---

## 1. Prerequisites

1. An active [Render](https://render.com) account.
2. An [Africa's Talking](https://africastalking.com) account with the active Voice Virtual Number `+233 30 804 8097`.
3. A Google Cloud project with the [Gemini API](https://aistudio.google.com) enabled.
4. MTN Mobile Money Developer Portal credentials (for live MoMo pilot).

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
| `AT_WEBHOOK_SECRET` | Yes | Random URL-safe value (at least 16 characters) | Authenticity token for telephony webhooks; the initial phone-number callback URL must include the exact same value. |
| `GEMINI_API_KEY` | Yes | `AIzaSy...` | Google Gemini API key for spoken ASR & intent parsing. |
| `ADMIN_TOKEN` | Yes | `sec_admin_...` | Secret Bearer token protecting administrative endpoints (`/api/upload-audio`). |
| `MOMO_SUBSCRIPTION_KEY` | Optional | `32-char hex string` | MTN MoMo API subscription key. |
| `MOMO_API_USER_ID` | Optional | `uuid` | MTN MoMo API User UUID. |
| `MOMO_API_KEY` | Optional | `secret` | MTN MoMo API Secret Key. |
| `MOMO_TARGET_ENV` | Optional | `sandbox` (or `production`) | Target environment for MTN MoMo. |
| `CORS_ORIGINS` | Optional | `*` | Allowed CORS origins for dashboard API access. |
| `DEMO_MODE` | Optional | `false` | When false, suppresses synthetic test fixture data in production views. |

---

## 3. Deployment Steps via `render.yaml`

1. **Connect Repository**:
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

## 4. Configuring Africa's Talking Voice Callback

1. Log into your **Africa's Talking Dashboard**.
2. Navigate to **Voice ➔ Phone Numbers**.
3. In Render, set `AT_WEBHOOK_SECRET` to a private random value of at least 16 characters. Do not use the literal text `YOUR_WEBHOOK_SECRET`.
4. Locate phone number **`+233 30 804 8097`**.
5. Set the **Callback URL** to the stable Render endpoint:
   ```
   https://okwankyer-fo-pa.onrender.com/voice-menu
   ```
   Do not put the webhook secret in the Africa's Talking dashboard URL. The initial inbound Africa's Talking payload is validated as a telephony request, and the app appends the configured `AT_WEBHOOK_SECRET` to subsequent callback and redirect URLs.
6. Click **Save**, then redeploy the Render service after changing its environment variables.

**Secret rotation:** If the repository's example/default webhook secret has ever been used in a deployed callback or shared in a call log, replace `AT_WEBHOOK_SECRET` in Render with a new random value of at least 32 characters and redeploy. Never paste that secret into source control, the Africa's Talking URL field, or chat logs.

Use the stable Render URL for the Africa's Talking callback in production.
GitHub Codespaces also starts the app on port 3000 and exposes a public
forwarded URL for development, but that URL can change and the development
server is not a production endpoint. Do not configure a production phone
number to use the Codespaces URL.

An AT session marked **Aborted** can occur when the webhook is rejected. The production app returns HTTP 401 and `<Reject/>` if the URL's `secret` is missing or does not exactly match Render's `AT_WEBHOOK_SECRET`. If calls still fail after correcting this, inspect the AT session's request/response details and Render logs for the webhook status.

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
If any check fails, inspect application logs in Render Dashboard to view correlation IDs and detailed probe diagnostics. An unsigned request to `/voice-menu` should return HTTP 401 in production; configure the callback URL in Africa's Talking with the URL-encoded `AT_WEBHOOK_SECRET` as shown above.

The Blueprint currently uses Render's free plan. Free web services can spin
down when idle and take time to start again, which can delay an inbound
Africa's Talking webhook. For dependable live calling, use an always-on
Render plan; changing the service plan may incur charges.
