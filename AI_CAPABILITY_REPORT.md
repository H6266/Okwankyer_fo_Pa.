# Ɔkwankyerɛfo Pa - AI Capability & Production Readiness Report (AI_CAPABILITY_REPORT.md)

**Generated**: 2026-10-04  
**Auditor**: Systems Architecture & Safety Team  
**Evaluation Target**: `Ɔkwankyerɛfo Pa` (Voice Accessibility Layer for Ghanaian Digital Services)  
**Standard**: Empirical Engineering Verification — No Marketing Claims  

---

## 1. System Capability Matrix by Operating Mode

| Capability / Feature | Offline / Local Only (No Internet, No Gemini) | Internet Connected (No Gemini) | Internet + Gemini Active | Provider Requirement | Production Status |
|---|---|---|---|---|---|
| **Voice Navigation (IVR Keypad)** | ✅ Full Operation (DTMF 0, 8, 9, #) | ✅ Full Operation | ✅ Full Operation | None (Local PBX / Audio) | **PRODUCTION READY** |
| **Language Isolation (English / Twi)** | ✅ Full Operation | ✅ Full Operation | ✅ Full Operation | None | **PRODUCTION READY** |
| **Akan Twi Number Normalization** | ✅ Full Operation (`aduasa` -> 30, `ɔha` -> 100) | ✅ Full Operation | ✅ Full Operation | None | **PRODUCTION READY** |
| **Zero-PIN Security Interception** | ✅ Full Operation (Spoken PINs blocked) | ✅ Full Operation | ✅ Full Operation | None | **PRODUCTION READY** |
| **Core Financial Intent Parsing** | ✅ Full Operation (Deterministic Engine) | ✅ Full Operation | ✅ Accelerated | None | **PRODUCTION READY** |
| **Mid-Turn Revisions & Corrections** | ✅ Full Operation (CorrectionEngine) | ✅ Full Operation | ✅ Accelerated | None | **PRODUCTION READY** |
| **Coreference Resolution** | ✅ Full Operation ("same person", "that number") | ✅ Full Operation | ✅ Accelerated | None | **PRODUCTION READY** |
| **Spoken Safe Confirmation Generation** | ✅ Full Operation (Dynamic Builder) | ✅ Full Operation | ✅ Full Operation | None | **PRODUCTION READY** |
| **Audio Prompt Playback (Pre-rendered)** | ✅ Full Operation (Catalog MP3s) | ✅ Full Operation | ✅ Full Operation | None | **PRODUCTION READY** |
| **Subscriber KYC Lookup** | ❌ Fails Closed / Local Cache Only | ✅ Live Query | ✅ Live Query | MTN MoMo API (`/basicuserinfo`) | **PRODUCTION READY** |
| **RequestToPay Dispatch (USSD Prompt)** | ❌ Cannot dispatch over wire | ✅ Live Dispatch | ✅ Live Dispatch | MTN MoMo API (`/requesttopay`) | **PRODUCTION READY** |
| **Idempotent Transaction State Machine** | ✅ Full Operation (Durable Store) | ✅ Full Operation | ✅ Full Operation | Local / PostgreSQL Store | **PRODUCTION READY** |
| **Complex Colloquial Ambiguity Reasoning** | ⚠️ Deterministic Clarification Prompt | ⚠️ Deterministic Clarification Prompt | ✅ Semantic Extraction | Google Gemini API (Optional) | **PRODUCTION READY (HYBRID)** |
| **Freeform Open-Ended General Q&A** | ❌ Refuses ("Out of Scope") | ❌ Refuses ("Out of Scope") | ✅ Answers via Gemini | Google Gemini API (Optional) | **EXPERIMENTAL** |
| **Subscriber Wallet Balance Display** | ❌ Blocked (`*170#` instruction spoken) | ❌ Blocked (`*170#` instruction spoken) | ❌ Blocked (`*170#` instruction spoken) | **Not supported by Telco Open API** | **ENFORCED INVARIANT** |

---

## 2. Detailed Capability Breakdown

### 2.1 What Works 100% Offline (No Internet, No API Keys)
- **Deterministic Cognitive Core**: `local-deterministic-nlu` parses all standard banking and mobile money intents (`SEND_MONEY`, `BUY_AIRTIME`, `BUY_DATA`, `PAY_BILL`, `CASH_OUT`, `CANCEL`, `GO_BACK`, `EXIT`, `REPEAT`).
- **Phonetic & Lexicon Normalizer**: Translates spoken Akan number words into numeric amounts (e.g. "sika aduasa" -> GHS 30).
- **Zero-PIN Safety Gate**: Scans input for PIN disclosures, redacting numeric sequences and guiding caller to the handset screen.
- **Dynamic Spoken Confirmation Builder**: Assembles grammatically valid Akan Twi and English confirmation phrases without external TTS.
- **Keypad Grammar State Machine**: Recognizes `#` for submission, `*` for decimal separator, `8` for backstep, and `0` for session termination.
- **Audio Catalog Streaming**: Serves pre-recorded high-fidelity Ghanaian human voice prompts over HTTP 206 byte-ranges.

### 2.2 What Requires Internet Access (Telephony / Telco Integration)
- **Africa's Talking Telephony Gateway**: Receiving inbound voice calls from mobile phones (`POST /voice-menu`) and dispatching outbound calls.
- **MTN MoMo Sandbox / Production API**: Calling MTN endpoints (`/accountholder/active`, `/basicuserinfo`, `/requesttopay`, `/transfer`).
- **Webhook Delivery**: Receiving asynchronous telco payment completion notifications.

### 2.3 What Requires Gemini (Optional Acceleration Only)
- **High-Ambiguity Slang Interpretation**: Resolving highly convoluted colloquial phrasing that falls outside the 250+ standard phrasing patterns in `twiLexicon.ts` and `ghanaianEnglishLexicon.ts`.
- **Live Multimodal Audio Gateway (`liveVoiceGateway.ts`)**: Low-latency bi-directional voice streaming over WebSockets when experimental browser live voice testing is initiated.
- **Fallback Rule**: When Gemini is unavailable, timed out, or rate-limited, the system **never fails open**. It seamlessly executes deterministic reasoning, lowers confidence appropriately, and prompts for clarification if ambiguous.

### 2.4 What Is Sandbox-Only vs Production-Ready
- **Production-Ready**:
  - `voicePaymentService.ts`: Real HTTP gateway executor with RFC4122 v4 UUID evidence recording and byte-level Content-Length verification.
  - `truthEngine.ts`: Verifies real telco receipts before announcing completion.
  - `paymentSaga.ts`: Handles two-leg collection -> disbursement workflows with state persistence.
  - `securityRedactor.ts`: Masks PII from logs and audit records.
- **Sandbox-Only / Demo Features**:
  - `MockAirtimeService`, `MockBillPaymentService`: Simulator services restricted to non-production environments via `assertNotProduction()`.
  - Sandbox test runner in `MomoLabPage.tsx`: Allows developers to simulate network responses and explore telco errors.

---

## 3. Provenance of Truth & Balance Restrictions

1. **Subscriber Balance Inquiry**: Third-party mobile money applications in Ghana cannot read private wallet balances through open developer APIs. The system truthfully explains:
   - *English*: "For your security, your mobile money balance cannot be read out over this call. Please dial *170# directly on your handset."
   - *Twi*: "Ahobammbɔ nti, yɛrentumi nkenkan wo sika ano wɔ fon yi so. Mepa wo kyɛw, bɔ *170# wɔ wo fon no so pɛpɛɛpɛ."
2. **Transaction Receipts**: A transaction is marked `SUCCESSFUL` only after receiving a verified callback from MTN or polling status returns `SUCCESSFUL` with an authentic `financialTransactionId`. HTTP 202 is reported as `PENDING`, never as `COMPLETED`.
