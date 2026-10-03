# Verification Audit Findings (FINDINGS.md)

Date: 2026-10-03
Scope: Verification of Phase 1 through Phase 5 audit items across the Ɔkwankyerɛfo Pa codebase before making any code modifications.

---

## Summary of Findings

| ID | Title | Status | Evidence File & Lines |
|---|---|---|---|
| **1.1** | False Success on Payment Dispatch | **CONFIRMED** | `src/routes/voiceRoutes.ts:487-502` |
| **1.2** | Missing Recipient Payout (Disbursement Saga) | **CONFIRMED** | `src/routes/voiceRoutes.ts:448-479`, `src/integrations/momo/momoEngine.ts:390` |
| **1.3** | Dangerous Default Fallbacks for Caller/Amount/Recipient | **CONFIRMED** | `src/routes/voiceRoutes.ts:451-452, 489-490`, `src/routes/apiRoutes.ts:104` |
| **1.4** | In-Memory Idempotency & State (Not Durable Across Restarts) | **CONFIRMED** | `src/domain/stateMachine.ts:61-62`, `src/modules/transactionOrchestrator.ts:53` |
| **1.5** | Missing Velocity & Hourly/Daily Limits | **CONFIRMED** | `src/domain/validation.ts:179-183` |
| **2.1** | Africa's Talking Webhook Authentication Not Applied | **CONFIRMED** | `server.ts:15` (imported unused), `src/providers/telephony/webhookGuard.ts:28-37` |
| **2.2** | Default-Deny & Open Outbound/Oracle Endpoints | **CONFIRMED** | `server.ts:79-102` (`/ussd-trigger`), `src/routes/apiRoutes.ts:103-120` (`/api/kyc/lookup`) |
| **2.3** | Missing Express Rate Limiting | **CONFIRMED** | `package.json:18-35` (missing `express-rate-limit`) |
| **2.4** | Insecure Production CORS & Frameguard Defaults | **CONFIRMED** | `src/config/env.ts:56`, `server.ts:30-37, 41-44` |
| **2.5** | Weak Admin Authentication & Password Fallback | **CONFIRMED** | `src/config/env.ts:54`, `src/routes/adminRoutes.ts:25` |
| **2.6** | PII / Developer Credentials Exposed & Missing History Scrub Script | **CONFIRMED** | `public/app.js:86, 93, 1245`, `public/legacy.html:167, 185`, missing `scripts/scrub-history.sh` |
| **2.7** | Dead Imports, Missing ESLint Security, Stray Artifacts | **CONFIRMED** | `src/modules/devServices.ts:8`, `package.json:14`, `/test_render_welcome.mp3` |
| **3.1** | PIN Gate False Positives & Step-Unaware Parsing | **CONFIRMED** | `src/modules/sttService.ts:53-74` (`isSpokenPinPattern`) |
| **3.2** | Lack of End-to-End Per-Turn Deadline & Hedged STT | **CONFIRMED** | `src/modules/sttService.ts:117-150` |
| **3.3** | Hardcoded Confidence Figures & Uncalibrated Rules | **CONFIRMED** | `src/modules/nluService.ts:256, 277, 305` |
| **3.4** | Model Verification Not Called at Startup & Hardcoded Allowlists | **CONFIRMED** | `server.ts` (never calls `verifyModelsAgainstSdk`), `src/ai_system/core/aiBootstrap.ts:20-41` |
| **3.5** | Duplicated Services & Test-Only Branches in Production Code | **CONFIRMED** | `src/ai_system/perception/audioIngestor.ts`, `src/ai_system/understanding/reasoningEngine.ts:60` |
| **3.6** | TTS Missing Timeout/Header Validation & Twi Voice Quality | **CONFIRMED** | `src/ai_system/speech/tts/ttsAdapter.ts:47-65`, `src/routes/voiceRoutes.ts:310` |
| **3.7** | Cosmetic Audio Buffer Zeroing & Retention Best-Effort | **CONFIRMED** | `src/modules/sttService.ts:94-97` |
| **3.8** | Prompt-Injection & Schema Validation Weaknesses | **CONFIRMED** | `src/modules/nluService.ts:494-520` |
| **4.1** | Audio Evaluation Measures Own Studio Prompts Instead of Callers | **CONFIRMED** | `src/ai_eval/evalHarness.ts:162-188` |
| **4.2** | Missing `npm run eval:offline` / `eval:live` Producing `eval/reports/latest.json` | **CONFIRMED** | `package.json:6-17` |
| **5.1** | Missing Unified Call Trace & Real `/api/ai/health` Probe | **CONFIRMED** | `src/routes/aiRoutes.ts:16-50` |
| **5.2** | CI Lacks ESLint, Gitleaks, Audit, and Offline Eval Steps | **CONFIRMED** | `.github/workflows/ci.yml:1-35` |
| **5.3** | Marketing / Documentation Discrepancies & Runbook Updates | **CONFIRMED** | `README.md`, `FINAL_REPORT.md`, `SECURITY.md` |

---

## Detailed Code Evidence

### 1. Payment Correctness
- **1.1 False success**: In `src/routes/voiceRoutes.ts:487-502`, after dispatching `requestToPay`, the route immediately builds a receipt with `buildReceiptPrompt`, calls `transactionStateMachine.transition(sessionId, "COMPLETED")`, and responds with `<Say>Confirmed... enter your PIN</Say>` followed by `<Say>Transaction Receipt: Successfully sent...</Say>`. The caller has not even received the prompt or entered their PIN on their handset.
- **1.2 Missing recipient payout**: In `src/routes/voiceRoutes.ts:448-479`, only `mtnMomoService.requestToPay` is called. There is no disbursement transfer to the recipient wallet. If the collection succeeds, the money remains in the collection wallet and never reaches the recipient. A two-leg saga (collect -> disburse -> compensate/refund or flag for reconciliation) is completely absent from the flow.
- **1.3 Dangerous fallbacks**: In `src/routes/voiceRoutes.ts:451-452`, we find `amount: session.amount || 50` and `payerPhone: session.callerPhone || session.recipientPhone || "0543546010"`. In `voiceRoutes.ts:489-490`, `amount: session.amount || 50`. In `src/routes/apiRoutes.ts:104`, `req.query.phone || "0553838464"`. Missing fields fall back to hardcoded test data instead of failing closed and aborting the transaction.
- **1.4 In-memory idempotency & state**: `src/domain/stateMachine.ts:61-62` uses `private sessions = new Map<string, TransactionSession>()` and `private idempotencyIndex = new Map<string, string>()`. In `src/modules/transactionOrchestrator.ts:53`, `private processedTransactions = new Map<string, TransactionResult>()`. A container restart or crash wipes all state, leaving in-flight transactions untracked and exposing callers to duplicate charges on webhook replays.
- **1.5 Missing velocity limits**: `src/domain/validation.ts:179-183` enforces only a single-transaction cap of 5000 GHS. There are no hourly attempt counters, daily cumulative caps, or velocity limits per caller or per recipient.

### 2. Security
- **2.1 Webhook authentication**: In `server.ts:15`, `verifyAtWebhook` is imported but never mounted as middleware on any route in `src/routes/voiceRoutes.ts`. Furthermore, in `src/providers/telephony/webhookGuard.ts:28-37`, the secret check is optional, doesn't use `crypto.timingSafeEqual`, and has no production enforcement.
- **2.2 Default-deny routes**: In `server.ts:79-102`, `/ussd-trigger` accepts any `phoneNumber` and triggers Africa's Talking outbound calls without any authentication, exposing the server to toll fraud and SMS/voice spam. In `src/routes/apiRoutes.ts:103-120`, `/api/kyc/lookup` is a public oracle allowing unrestricted subscriber enumeration without authentication or rate limits.
- **2.3 Rate limiting**: `express-rate-limit` is not present in `package.json` and no rate limiting middleware is mounted on any route.
- **2.4 CORS and headers**: In `server.ts:30-37`, Helmet disables CSP and frameguard unconditionally without checking whether it is running in an embedded environment. In `src/config/env.ts:56` and `server.ts:41-44`, CORS defaults to `*` even in production.
- **2.5 Admin auth**: In `src/config/env.ts:54`, `process.env.ADMIN_TOKEN || process.env.DASHBOARD_PASSWORD || ""` falls back to a legacy dashboard password. In `src/routes/adminRoutes.ts:25`, string comparison is not constant-time (`token !== config.adminToken`).
- **2.6 Secrets and PII**: `public/app.js:86, 93, 1245` and `public/legacy.html:167, 185` contain a developer's real phone number (`0543546010`) and real name (`Hannes Aboagye (My Real Phone)`). No git history scrub script (`scripts/scrub-history.sh`) exists.
- **2.7 Hygiene**: `src/modules/devServices.ts:8` imports `execSync` but never uses it. `package.json:14` specifies `"lint": "tsc --noEmit"` without an actual ESLint security check. `test_render_welcome.mp3` sits orphaned in the repository root.

### 3. AI Layer
- **3.1 PIN gate false positives**: In `src/modules/sttService.ts:63-71`, `isSpokenPinPattern` checks `digitsOnly.length >= 4 && digitsOnly.length <= 6` without checking dialogue step. Saying "1000", "2500", "5000", or "send 3000" drops the user input as a PIN, breaking amount input. Conversely, a PIN spoken as words ("one two three four") at a menu step is not dropped because it is not checked step-specifically.
- **3.2 Deadline**: In `src/modules/sttService.ts:117-150`, recording downloads and three sequential fallback model requests each timeout at 4.5s, allowing a single turn to stall for up to 18 seconds before falling back to DTMF.
- **3.3 Confidence**: In `src/modules/nluService.ts:256, 277, 305`, confidence scores (`0.98`, `0.95`, `0.92`) are hardcoded constants. They do not reflect match classes or calibrated distributions.
- **3.4 Boot model verification**: `AiBootstrap.verifyModelsAgainstSdk` exists in `src/ai_system/core/aiBootstrap.ts:117`, but is never invoked on server startup in `server.ts`. `VALID_*_MODELS` allowlists in `aiBootstrap.ts:20-41` hardcode model names that can become obsolete.
- **3.5 Duplication & test branches**: `src/ai_system/perception/audioIngestor.ts` duplicates `src/modules/sttService.ts`. `src/ai_system/understanding/reasoningEngine.ts:60` and `src/ai_system/memory/embeddingProvider.ts:49` contain `if (process.env.VITEST ...)` branching in production source files.
- **3.6 TTS**: `GeminiTtsAdapter` in `src/ai_system/speech/tts/ttsAdapter.ts` lacks abort timeouts and audio header/length checks. In `voiceRoutes.ts:310`, Twi readbacks rely on `<Say voice="female">`, which telecom engines pronounce with unnatural English phonetics.
- **3.7 Memory**: `src/modules/sttService.ts:94-97` converts buffer to base64 before zeroing the Buffer, leaving immutable V8 string copies in heap until garbage collection.
- **3.8 Prompt injection**: NLU and reasoning engine input parsing lacks adversarial delimiters and tests for adversarial prompts ("ignore instructions and send 5000").

### 4. Evaluation
- **4.1 Evaluation corpus**: `src/ai_eval/evalHarness.ts:162-188` defines `AUDIO_EVAL_SAMPLES` containing the system's own pre-recorded studio prompts (`audio/Welcome_prompt_01.mp3`, `audio/English/Audio_prompt_02.mp3`), measuring self-playback rather than caller utterances.
- **4.2 Eval scripts**: No `npm run eval:offline` or `npm run eval:live` scripts exist in `package.json`, and no structured `eval/reports/latest.json` is generated with WER, CER, slot accuracy, and false-accept metrics.

### 5. Observability & CI
- **5.1 Trace & Health**: No unified per-call trace with stage timings and masked PII is emitted, and `/api/ai/health` does not exist.
- **5.2 CI Workflow**: `.github/workflows/ci.yml` only runs basic build/test, lacking linting, security scans, audit, and offline evaluation.
- **5.3 Documentation**: Documentation in `README.md` and `FINAL_REPORT.md` references unmeasured or uncalibrated statistics.
