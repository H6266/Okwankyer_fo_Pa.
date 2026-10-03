# Audit: Reality vs. Claims in Ɔkwankyerɛfo Pa

**Date:** 2026-10-03  
**Auditor:** Lead Systems & Telecom Security Architect  
**Commit Scope:** Pre-refactor baseline inspection  

---

## 1. Executive Summary

This repository represents an ambitious hackathon prototype designed to bridge Ghanaian Mobile Money (MoMo) accessibility barriers using voice IVR over Africa's Talking. While the high-level concept and foundational building blocks (Vite frontend, basic Africa's Talking VoiceXML generation, MTN MoMo sandbox structures, and Gemini ASR) are present, the application currently operates on several critical compromises, hardcoded fixtures, and simulated shortcuts.

---

## 2. Detailed Findings: Claim vs. Reality

| # | System Area | README / Dashboard Claim | Actual Codebase Reality | Severity |
|---|---|---|---|---|
| 1 | **Safe Confirmation Readback** | Claims audible verification checkpoint speaking the verified recipient legal name, cedis, pesewas, and unique transaction reference. | **Static MP3s**: Both `/safe-confirmation` and receipt play pre-recorded MP3s (`Audio_prompt_10.mp3` and `Audio_prompt_12.mp3` in English; `Audio_prompt_twi_08.mp3` and `10.mp3` in Twi). Entering 25 GHS to an arbitrary number plays "500 Ghana cedis to Kwame Nyamebere completed on 17 September 2026, reference OKP-847291". | **Critical** (P1) |
| 2 | **KYC Identity Resolution** | "Real-time recipient identity resolution (KYC lookup) via telco subscriber registry". | **Hardcoded Dictionary & Hack**: Uses `REGISTERED_SUBSCRIBERS` object, a hardcoded rule `clean.endsWith("8464") => "Kwame Nyamebere"`, and fallbacks presenting unverified numbers as `"Subscriber ending in ..."`. No clean provider interface separating sandbox from live telco APIs. | **High** (P2) |
| 3 | **Zero-PIN Handset Handoff** | "Triggers a carrier-grade USSD screen push modal ... speech recognition strictly terminated". | **Incomplete Handoff**: `secureAuthGate` only returns `{ authenticated: true }` without managing a real state machine or polling for handset PIN outcome. Webhook repeats can cause duplicate billing. In `/safe-outcome`, `transactionOrchestrator.executeSendMoney` is called in background and caller is immediately hung up on with `<Reject/>` or fixed audio. | **Critical** (P3) |
| 4 | **AI & Speech Recognition** | README claims "Dual-track Web Speech API with Echo Cancellation & Noise Suppression". | **Contradictory Telephony Architecture**: Web Speech API is a browser-only JS API that cannot run on a PSTN cellular call. Telephony IVR actually uses Africa's Talking `<Record>` webhook + Gemini generative content. Confidence thresholds are loose and no labeled benchmark/evaluation harness exists. | **High** (P4) |
| 5 | **Security & Integrity** | Secure production-ready voice gateway. | **Major Vulnerabilities**: <br>• `/api/upload-audio` accepts unauthenticated 50MB uploads that can overwrite audio files.<br>• Wildcard CORS (`Access-Control-Allow-Origin: *`).<br>• No webhook authentication on `/voice-menu` (any HTTP client can spoof calls).<br>• Unsafe regex path traversal guard.<br>• Hardcoded fallback Cloud Run URL from previous deployment.<br>• Unredacted PII (real phone numbers and names) in code and default states. | **Critical** (P5) |
| 6 | **Code Architecture** | Modular production service. | **Monolithic `server.ts` (~4,967 lines)**: Combines Express routing, VoiceXML builders, simulated frontend HTML strings, Asana-style task trackers, fake release management, and duplicate prompt definitions into one file. | **Medium** (P6) |
| 7 | **Observability & Health** | Real-time monitoring and transaction history. | **Faked Smoke Tests & Hardcoded Logs**: `/api/dev/smoke-test` returns hardcoded `status: "pass"` and fabricated latencies (`12 + Math.floor(Math.random() * 8)`). `/api/audio/manifest` returns hardcoded sessions `sess-1`, `sess-2`, `sess-3`. | **High** (P7) |
| 8 | **Testing & CI** | Telecom-grade test verification. | Tests only cover basic mocked happy paths and synthetic Gemini wrappers. Zero coverage for amount mismatch, audio concatenation, traversal attacks, PIN pattern leakages, or webhook replay idempotency. | **High** (P8) |

---

## 3. Action Plan & Priority Mapping

1. **Task 1: Dynamic Safe Confirmation & Receipt**: Dynamic audio generator / dynamic VoiceXML `<Say>` & concatenated audio for caller's exact name/last-4, amount, reference, and date.
2. **Task 2: Real Recipient Resolution**: Provider interface `RecipientResolver` with Sandbox (demo folder) vs MTN MoMo implementations; reject invalid prefixes and malformed amounts (`5*0*1`).
3. **Task 3: Real Zero-PIN Handset Handoff**: Explicit state machine (`INITIATED` → `RECIPIENT_VERIFIED` → `AMOUNT_ENTERED` → `CONFIRMED` → `PIN_PENDING` → `COMPLETED`/`FAILED`/`CANCELLED`/`TIMEOUT`) with idempotency keys.
4. **Task 4: Real & Measurable AI**: Remove Web Speech API claim; implement strict confidence gating with DTMF fallback; evaluation harness for English and Twi utterance test sets.
5. **Task 5: Security Hardening**: Auth on admin endpoints, remove arbitrary upload or lock down with admin token & strict allowlist, webhook validation, path traversal defense via `path.resolve`, CORS allowlist, PII redaction.
6. **Task 6: Modular Architecture**: Refactor `server.ts` into clean domain, service, provider, and route layers.
7. **Task 7: Honest Observability**: Real health checks, real database-backed or structured in-memory sessions/ledger, no fake passes or synthetic latencies.
8. **Task 8: Production Test Suite**: Unit, integration, security, and idempotency tests with CI integration.
9. **Task 9: Akan Twi Quality & Accessibility**: Create `docs/TWI_REVIEW.md`, add graceful timeouts, repeat logic, and "no funds moved" guarantee on every exit.
10. **Task 10: Accurate Documentation & Deployment**: Update README, ARCHITECTURE.md, SECURITY.md, Render deployment runbook, and FINAL_REPORT.md.
