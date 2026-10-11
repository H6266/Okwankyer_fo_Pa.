# Ɔkwankyerɛfo Pa - Pilot Operational Runbook
### Production Operations, Incidents, Metrics & Escalation Guide

---

## 1. Emergency Controls & Rollback Procedures

### 1.1 Disabling the Model Immediately (Dynamic Kill Switch)
If the model exhibits unexpected behavior, quota exhaustion, or degraded latency:
1. **API / UI Method (Zero Downtime, No Redeployment):**
   ```bash
   curl -X POST https://<APP_HOST>/api/pilot/kill-switch \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"active": true, "reason": "Operator manual kill switch engagement"}'
   ```
2. **Environment Variable Method:**
   Set `PILOT_KILL_SWITCH=true` or `FORCE_OFFLINE_ONLY=true` in Cloud Run / container environment variables and redeploy.
3. **Verification:**
   Check `GET /api/pilot/status`. Effective mode will confirm `FORCED_OFFLINE_BY_KILL_SWITCH`.

### 1.2 Full Telephony Rollback to Deterministic DTMF Only
To fall back telephony completely to classic keypad-only IVR without ASR/NLU:
- Set `SPEECH_PROVIDER=disabled`
- Set `BRAIN_MODE=offline_only`

---

## 2. Managing Pilot Numbers (Allowlist)

### 2.1 View Allowed Numbers
```bash
curl https://<APP_HOST>/api/pilot/allowlist \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 2.2 Add Caller Number to Pilot
```bash
curl -X POST https://<APP_HOST>/api/pilot/allowlist \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"phone": "0553838464"}'
```

### 2.3 Remove Caller Number from Pilot
```bash
curl -X DELETE https://<APP_HOST>/api/pilot/allowlist/0553838464 \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## 3. Reading Operational Metrics & Shadow Output

### 3.1 Operational Metrics (Zero-PII)
- **CLI Report:**
  ```bash
  npx tsx scripts/report_pilot_metrics.ts
  ```
- **API Endpoint:**
  ```bash
  GET /api/pilot/metrics
  ```
- **Key Indicators to Monitor:**
  - `turnLatency.p95`: Should remain below 1200ms.
  - `model.timeoutRate`: Alert if > 2.0%.
  - `fallbacks.fallbackRate`: Indicates percent of turns handled by deterministic fallback.
  - `clarifications.callsExceedingThreshold`: Number of calls that reached the 3-loop limit and fell back to DTMF keypad.
  - `abandonment.abandonmentRate`: Callers disconnecting before confirmation.

### 3.2 Shadow Mode Disagreement Analysis
Shadow mode logs disagreements between offline deterministic decisions and model inferences:
- **CLI Summary:**
  ```bash
  npm run shadow:summary
  ```
- **Data File:**
  `data/shadow_disagreements.json` contains disagreement types (`INTENT_MISMATCH`, `SLOT_MISMATCH`, `DECISION_KIND_MISMATCH`).

---

## 4. Stuck PENDING Payments & Reconciliation

### 4.1 Automated Payment Reconciliation Scanner
If a transaction remains in `PIN_PENDING` beyond 5 minutes without USSD completion callback:
```bash
npx tsx scripts/run_payment_reconciliation.ts
```
Or trigger via API:
```bash
curl -X POST https://<APP_HOST>/api/pilot/reconciliation/run \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 4.2 Escalation Matrix & Contact Procedures

| Incident Severity | Threshold | Immediate Action | Contact |
|---|---|---|---|
| **P1: Stuck Pending > 5m** | Payment unconfirmed on handset after 5 minutes | 1. Run reconciliation script.<br>2. Check MTN MoMo Partner Portal with `referenceId`.<br>3. Verify user was not debited. | **MoMo Operations Desk**<br>📞 MTN FinTech Ops Hotline: `+233 (0) 24 100 0170`<br>✉️ `momo-support@mtn.com` |
| **P2: Telephony Latency Spike** | Turn p95 > 2500ms or AT webhook timeouts | Engage Kill Switch to force offline_only. | **Telephony On-Call**<br>✉️ `voice-ops@okwankyerɛfo.gh` |
| **P3: Quota / 429 Spikes** | Gemini error rate > 5% | Circuit breaker trips automatically; verify offline fallback is active. | **AI Engine Lead** |

---

## 5. Daily Maintenance & Data Retention Sweep

Enforce daily transcript and audio purge:
```bash
curl -X POST https://<APP_HOST>/api/pilot/retention/sweep \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```
Or execute in maintenance cron job.
