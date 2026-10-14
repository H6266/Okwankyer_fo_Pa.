# Render Deployment Runbook
### Ɔkwankyerɛfo Pa ("The Good Guide")

This runbook guides production deployment of the Ɔkwankyerɛfo Pa Voice Accessibility Layer on Render.

---

## 1. Prerequisites

1. An active [Render](https://render.com) account.
2. An [Africa's Talking](https://africastalking.com) account with an active Voice Virtual Number (e.g. `+233 30 804 8098`).
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
| `AT_VOICE_NUMBER` | Yes | `+233308048098` | Virtual telephony voice trunk number. |
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
3. Locate phone number **`+233 30 804 8098`**.
4. Set the **Callback URL** to:
   ```
   https://your-service.onrender.com/voice-menu
   ```
5. Click **Save**.

---

## 5. Post-Deployment Smoke Verification

Verify deployment health by running:
```bash
curl -X POST https://your-service.onrender.com/api/dev/smoke-test
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
If any check fails, inspect application logs in Render Dashboard to view correlation IDs and detailed probe diagnostics.
