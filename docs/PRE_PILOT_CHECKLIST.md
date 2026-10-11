# Ɔkwankyerɛfo Pa - Pre-Pilot Operational Checklist
### Mandatory Verification Gates Before Live Pilot Launch

Every item below must be confirmed GREEN before routing live caller traffic through the system.

---

## Pre-Pilot Verification Gates

| Gate ID | Verification Item | Target Status | Verification Command |
|---|---|---|---|
| **GATE-01** | **Linguistic Approval Gate** | GREEN | Native template hashes bound; no placeholder approvals in production. Checked via `approvalWorkflow.validateProductionApprovals()`. |
| **GATE-02** | **Model Environment Variable** | GREEN | `GEMINI_MODEL` explicitly defined (e.g., `gemini-2.5-flash` or `gemini-3.8-flash`). Literal fallbacks forbidden. |
| **GATE-03** | **Per-Number Allowlist** | GREEN | Allowlist active (`pilotControls.isAllowlistEnabled()`); only approved test numbers receive model calls. |
| **GATE-04** | **Runtime Kill Switch** | GREEN | Kill switch tested and operational. Instantly forces `offline_only` mode without deployment. |
| **GATE-05** | **Webhook Authenticity & Replays** | GREEN | `AT_WEBHOOK_SECRET` enforced; duplicate nonces rejected; caller rate limiting active. |
| **GATE-06** | **Zero-PIN & PII Protection** | GREEN | Spoken PINs intercepted before models or logs; all 10-digit numbers masked; consent notice active. |
| **GATE-07** | **Payment Reconciliation** | GREEN | Automated scanner checks and resolves PENDING payments exceeding 5-minute timeout. |
| **GATE-08** | **Dialect Safety Gate** | GREEN | Akuapem Twi strictly gated (`productionReady: false`) until native verification files are provided. |
| **GATE-09** | **Full Automated Test Suite** | GREEN | 100% of test suites passing (`npm test`). |

---

## Automated Verification Script

Run the automated pre-pilot gate verification script:
```bash
npx tsx scripts/verify_pilot_gates.ts
```
The script exits with code 0 if all gates are GREEN, or code 1 with actionable failure remediation.
