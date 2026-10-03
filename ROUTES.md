# Production Route Audit & Access Control Matrix (ROUTES.md)

This document provides a comprehensive inventory of every HTTP and WebSocket route exposed by the Ɔkwankyerɛfo Pa server, detailing its authentication mechanism, rate limiting tier, and access policy.

---

## 1. Route Inventory Summary

| Method | Endpoint | Description | Auth Requirement | Rate Limit Tier |
|---|---|---|---|---|
| `POST` | `/voice-menu` | Inbound Africa's Talking call webhook | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/language-selection` | Language selection handler (EN/Twi) | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/service-choice` | Service category selection handler | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/provider-choice` | Network provider selection handler | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/verify-recipient` | Recipient phone number verification | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/recipient-verify-choice` | Spoken recipient confirmation choice | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/enter-amount` | Amount entry prompt step | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/verify-amount` | Amount verification step | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/safe-confirmation` | Spoken verbatim readback confirmation | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/safe-outcome` | Zero-PIN handoff to USSD / MoMo prompt | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/action-choice` | Universal action choice handler | AT Webhook Secret | Telephony (60/min) |
| `POST` | `/speech-fallback` | ASR timeout / DTMF fallback | AT Webhook Secret | Telephony (60/min) |
| `GET` | `/audio/stream` | Byte-range partial audio streaming | Public (Path traversal protected) | Public (120/min) |
| `GET` | `/health`, `/api/health` | Service health status | Public | Public (120/min) |
| `GET` | `/api/audio/manifest` | Audio assets manifest | Public | Public (120/min) |
| `POST` | `/ussd-trigger` | Outbound telephony call trigger | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/kyc/lookup` | Recipient directory lookup | Admin Bearer Token | KYC Lookup (10/min) |
| `POST` | `/api/dev/smoke-test` | Health probes runner | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/sessions` | Call session store | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/ledger` | Transaction ledger | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/dev/logs/stream` | Redacted structured audit logs | Admin Bearer Token | Admin (30/min) |
| `POST` | `/api/eval/run` | Evaluation harness runner | Admin Bearer Token | Admin (30/min) |
| `POST` | `/api/upload-audio` | Custom audio asset upload | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/phrase-bank` | Audio catalog phrase bank | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/prototype-audio` | English audio manifest | Admin Bearer Token | Admin (30/min) |
| `POST` | `/api/momo/request-to-pay` | Initiate MoMo collection | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/momo/collection/:ref` | Check collection status | Admin Bearer Token | Admin (30/min) |
| `POST` | `/api/momo/transfer` | Initiate MoMo disbursement | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/momo/transfer/:ref` | Check transfer status | Admin Bearer Token | Admin (30/min) |
| `POST` | `/api/momo/validate-account` | Verify account holder | Admin Bearer Token | Admin (30/min) |
| `POST` | `/api/momo/callback` | MTN MoMo status callback webhook | Reference ID Header / Secret | Webhook (60/min) |
| `GET` | `/api/momo/transactions` | MoMo transaction ledger | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/momo/keys` | MoMo API configuration status | Admin Bearer Token | Admin (30/min) |
| `POST` | `/api/momo/switch-env` | Switch target environment | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/shipping/status` | Telecom verification status | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/ai/status` | AI subsystem overview | Public | Public (120/min) |
| `GET` | `/api/ai/health` | AI health & model probe | Public | Public (120/min) |
| `GET` | `/api/ai/diagnostics` | AI diagnostics report | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/ai/eval` | AI text benchmark runner | Admin Bearer Token | Admin (30/min) |
| `GET` | `/api/ai/eval-audio` | Audio benchmark runner | Admin Bearer Token | Admin (30/min) |
| `POST` | `/api/ai/process` | Central AI turn processor | Public / Telephony | Public (120/min) |
| `POST` | `/api/ai/analyze` | AI NLU slot extraction | Public / Telephony | Public (120/min) |
| `POST` | `/api/ai/transcribe` | Gemini audio transcription | Public / Telephony | Public (120/min) |
| `POST` | `/api/ai/dialogue/turn` | Multi-turn dialogue turn | Public / Telephony | Public (120/min) |
| `POST` | `/api/ai/synthesize` | TTS audio synthesis | Public / Telephony | Public (120/min) |
| `WS` | `/ws/voice-stream` | Real-time bi-directional voice WebSocket | Session Token | Connection Limit (50 max) |

---

## 2. Authentication Enforcement Mechanisms

1. **Africa's Talking Webhooks (`verifyAtWebhook`)**:
   - Compares the `x-at-signature` or query parameter against `AT_WEBHOOK_SECRET` using `crypto.timingSafeEqual`.
   - In production (`NODE_ENV=production`), missing or mismatched credentials immediately return `401 Unauthorized` with logged security alert.
   - In development, an explicit warning is logged if the dev bypass is active.

2. **Admin API Authentication (`requireAdminAuth`)**:
   - Enforces `Authorization: Bearer <ADMIN_TOKEN>`.
   - In production, server startup fails if `ADMIN_TOKEN` is unset or less than 16 characters.
   - Prevents unauthorized access to ledger, KYC lookup oracle, developer tooling, and outbound dialers.

3. **Rate Limiting (`express-rate-limit`)**:
   - `telephonyRateLimiter`: 60 requests/minute per IP/Session.
   - `kycLookupRateLimiter`: 10 requests/minute per IP (prevents phone directory enumeration).
   - `adminRateLimiter`: 30 requests/minute per IP.
   - `publicRateLimiter`: 120 requests/minute per IP.
