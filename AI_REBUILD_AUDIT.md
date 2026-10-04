# Ɔkwankyerɛfo Pa - Comprehensive AI Rebuild Audit (AI_REBUILD_AUDIT.md)

**Date**: 2026-10-04  
**Auditor**: Principal AI Architect, Speech & Security Engineering Team  
**Repository**: `H6266/Okwankyer_fo_Pa`

---

## 1. Executive Summary

This audit evaluates the codebase of **Ɔkwankyerɛfo Pa** ("The Good Guide"), an accessible voice-first digital financial services layer targeting Mobile Money (MoMo) and IVR workflows in Ghana (supporting English, Akan Twi, Ghanaian English, and bilingual code-switching).

The original implementation contained strong architectural intentions (such as Zero-PIN protection concepts and bilingual lexicons), but suffered from severe architectural vulnerabilities, dangerous hardcoded fallbacks, duplicate legacy pipelines, test branches in production code, and an over-reliance on external cloud models (specifically Gemini) for speech-to-text, reasoning, and speech synthesis.

This document details the audit findings, inventories every vulnerable and duplicate component, identifies valuable assets to preserve, and establishes the blueprint for a completely autonomous, offline-first, layered cognitive architecture.

---

## 2. Current Architecture vs Canonical Pipeline

### 2.1 Current State (Fragmented)
The codebase currently contains **two competing AI subsystems** plus multiple fragmented integration layers:

1. **Legacy Monolith (`src/modules/`)**:
   - `nluService.ts`: Mixed Gemini API calls with ad-hoc regex/keyword fallback.
   - `sttService.ts`: Depended entirely on Gemini API for transcription; returned empty text when Gemini was unavailable.
   - `conversationManager.ts`: Monolithic session and turn tracker with hardcoded phone fallbacks.
   - `mtnMomoService.ts`: Duplicate implementation of MTN MoMo sandbox API calls.
   - `serviceOrchestrator.ts`: Redundant state orchestration that bypasses the newer cognitive engine.

2. **Decomposed Cognitive Engine (`src/ai_system/`)**:
   - `core/aiEngine.ts`: 8-stage pipeline orchestrator.
   - `understanding/reasoningEngine.ts`: Called Gemini directly with a `NODE_ENV === "test"` bypass.
   - `speech/tts/ttsAdapter.ts`: Required Gemini for audio synthesis; returned text-only fallback without audio when offline.
   - `actions/unifiedToolRegistry.ts`: Authoritative tool registry, but contained hardcoded dummy phone numbers and account codes on parameter fallbacks.
   - `memory/`: Multi-store memory system, but embedding provider fell back only when Gemini failed, with test branches embedded in production.

3. **External MoMo API Duplication (`momo_api/` vs `src/integrations/momo/`)**:
   - `momo_api/`: Standalone sandbox engine with hardcoded sample accounts (`0553838464`).
   - `src/integrations/momo/`: Central transaction service, evidence store, and callback service, but also had hardcoded defaults.

### 2.2 Canonical Pipeline (Target State)
The architecture must be unified into **ONE canonical layered cognitive pipeline**:
```
Caller (Audio / DTMF / Text)
  ↓
Input Gateway & Voice Activity Detector (VAD)
  ↓
Offline Speech Recognizer (Telephony 8kHz / 16kHz + Local ASR)
  ↓
Language Identification (English, Asante/Akuapem Twi, Code-Switching)
  ↓
Ghana-Aware Speech & Entity Normalizer
  ↓
Context Hydration & 10-Layer Memory Retrieval
  ↓
Model Router (Capability-Based: Local Deterministic -> Local SLM -> Optional Gemini)
  ↓
Contextual Reasoning (Fact vs Inference vs Assumption vs Unknown)
  ↓
Coreference, Contradiction, & Correction Engine
  ↓
Truth Engine (Strict Verification & Balance Capability Enforcement)
  ↓
Unified Safety Engine (Zero-PIN Gate & Security Invariants 001-015)
  ↓
Navigation & Task Manager (Interruption & Resumption)
  ↓
Action Planner & Policy Authorization
  ↓
Unified Tool Registry (Exclusive Execution Authority)
  ↓
Payment Saga Orchestrator (Authoritative Idempotent Financial Execution)
  ↓
Provider Verification & Authoritative State Reconciliation
  ↓
Dialogue Engine (Single-Slot Focus, Culturally Grounded)
  ↓
Ghanaian TTS Engine (Local TTS -> Cloud TTS -> Optional Gemini TTS)
  ↓
Voice Interruption & Barge-In Handler -> Audio Output to Caller
```

---

## 3. Detailed Audit Findings

### 3.1 Hardcoded Phone Numbers, Amounts, & Recipient Names
A critical audit finding was the prevalence of hardcoded default values used as fallbacks when user input or extracted slots were missing. This directly violates **INVARIANT_012** (*Missing financial parameters must fail closed*).

| File Location | Line(s) | Hardcoded Value | Severity | Finding & Impact |
|---|---|---|---|---|
| `src/ai_system/core/aiAction.ts` | 111, 129, 144 | `slots.recipientPhone \|\| "0553838464"` | **CRITICAL** | If recipient phone is missing, automatically defaults to `0553838464` instead of failing closed and asking the caller. |
| `src/ai_system/core/aiAction.ts` | 157 | `slots.accountNumber \|\| "ACC123456"` | **HIGH** | Default dummy account number used for utility bill payment. |
| `src/ai_system/core/aiAction.ts` | 171 | `slots.accountNumber \|\| "AGENT_DEFAULT"` | **HIGH** | Default agent code used for cash-out authorization. |
| `src/ai_system/core/aiAction.ts` | 143, 158 | `slots.amount \|\| 10`, `slots.amount \|\| 50` | **CRITICAL** | Default amounts assigned if user did not specify amount. |
| `src/ai_system/actions/unifiedToolRegistry.ts` | 234 | `req.params.senderPhone \|\| "0553838464"` | **CRITICAL** | Transfers default sender phone to dummy number if omitted. |
| `src/ai_system/actions/unifiedToolRegistry.ts` | 273 | `req.params.phoneNumber \|\| "0553838464"` | **CRITICAL** | Airtime purchase defaults to dummy number. |
| `src/ai_system/actions/unifiedToolRegistry.ts` | 334-335 | `biller: "ECG", accountNumber: "ACC123456"` | **HIGH** | Bill payment substitutes dummy biller & account. |
| `src/ai_system/services/financialServices.ts` | 224-228 | `"0553838464": "Kwame Boateng"`, `"0543546010": "Hannes Aboagye"` | **HIGH** | In-memory recipient directory hardcoded inside production service file rather than isolated test fixture. |
| `src/routes/aiRoutes.ts` | 186, 209 | `parsedRecipient = ... \|\| "0553838464"`, `payerPhone = ... \|\| "0553838464"` | **CRITICAL** | Production AI route assigned dummy recipient and payer when parsing failed. |
| `src/routes/voiceRoutes.ts` | 420 | `session.recipientPhone \|\| "0553838464"` | **CRITICAL** | Telephony webhook route fell back to dummy recipient. |
| `src/integrations/momo/momoTransactionService.ts` | 218 | `tx.metadata?.payerPhone \|\| "0553838464"` | **CRITICAL** | Transaction service assigned dummy payer. |
| `src/modules/conversationManager.ts` | 553 | `state.caller_phone \|\| "0543546010"` | **HIGH** | Legacy turn manager defaulted caller to dummy number. |

### 3.2 Fake Balances & Fabricated Financial Truth
| File Location | Line(s) | Fake Value | Severity | Finding & Impact |
|---|---|---|---|---|
| `src/ai_system/core/aiDialogue.ts` | 139 | `: "250.00"` | **CRITICAL** | When balance inquiry slot is empty, speaks `Your balance is GHS 250.00` to caller! Violates INVARIANT_014. |
| `src/ai_system/services/financialServices.ts` | 208 | `availableBalance: 250.00` | **CRITICAL** | `MockBalanceService` returns fixed 250.00 GHS. Violates truth engine rules. |

**Requirement**: In Ghana MoMo Open API, subscriber wallet balance inquiry is **not supported** for third-party consumer wallets (MTN API returns `403/404` or requires banking partner integration). The system must return `BALANCE_NOT_AVAILABLE_VIA_API` and instruct the user to check via USSD `*170#` directly on their handset. It must **never fabricate 250.00 GHS**.

### 3.3 Production Test Branches (`if (VITEST)` / `if (NODE_ENV === "test")`)
Production code must never secretly know that a test runner exists. The following files contained illicit test branches:
- `src/ai_system/understanding/reasoningEngine.ts:97`:
  ```typescript
  if (!geminiClient.isAvailable() || process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)) {
    return this.deterministicReasoning(params);
  }
  ```
- `src/ai_system/memory/embeddingProvider.ts:48`:
  ```typescript
  if (!this.ai || !process.env.GEMINI_API_KEY || process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)) {
    return this.fallbackProvider.embed(text);
  }
  ```
- `src/integrations/momo/voicePaymentService.ts:75`:
  ```typescript
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    this.config.collection.subscriptionKey = ...;
    return true;
  }
  ```
**Remediation**: Remove all `VITEST` and `NODE_ENV === "test"` conditional branches. Refactor classes to use dependency injection, allowing tests to inject mock adapters explicitly.

### 3.4 Unsecured & Unthrottled AI Endpoints
The following endpoints in `src/routes/aiRoutes.ts` lacked rate limiting and authentication:
- `POST /api/ai/process`
- `POST /api/ai/analyze`
- `POST /api/ai/transcribe`
- `POST /api/ai/dialogue/turn`
- `POST /api/ai/synthesize`
- `POST /api/ai/intent-to-momo`

**Remediation**:
1. Mount `publicApiRateLimiter` or `adminRateLimiter` on all `/api/ai/*` routes.
2. In `src/routes/voiceRoutes.ts`, ensure `telephonyRateLimiter` is mounted on all telephony endpoints.
3. Add authentication or session tokens for stateful turn endpoints.

### 3.5 Single Points of Failure & Cloud Gemini Dependency
1. **STT Service (`src/modules/sttService.ts` & `src/ai_system/perception/audioIngestor.ts`)**:
   - Only called Gemini `models.generateContent` with audio inline data.
   - When Gemini was unavailable or quota exceeded (429), it returned `text: "empty"` and confidence `0.0`.
   - Result: Applet was completely deaf without Gemini.
2. **TTS Service (`src/ai_system/speech/tts/ttsAdapter.ts`)**:
   - Only called Gemini TTS voice modality.
   - When Gemini was unavailable, it returned `providerUsed: "fallback-text-only"` with **no audio buffer**, breaking the voice call.
   - Result: Applet was completely mute without Gemini.
3. **NLU Service (`src/modules/nluService.ts`)**:
   - Made external API calls to Gemini during vitest execution, hitting the 5 RPM free tier quota limit and causing test timeouts and retries.

---

## 4. Components Worth Preserving

The existing codebase contains several high-quality domain assets that must be preserved, hardened, and integrated into the canonical pipeline:

1. **Linguistic Lexicons (`src/ai_system/linguistic/`)**:
   - `twiLexicon.ts`: High quality Akan Twi phrase lists (affirmations, negations, financial verbs).
   - `numberLexicon.ts`: Comprehensive Akan number words (`baako`, `mmienu`, `aduasa`, `ɔha`, `apem`).
   - `ghanaianEnglishLexicon.ts`: Colloquial Ghanaian English terminology ("cedis", "momo", "airtime", "cash out").
   - `telecomLexicon.ts`: Telephony terms, shortcodes, and carrier names (MTN, Telecel, AT).
   - `nameLexicon.ts`: Ghanaian day names and surnames (Kwame, Kofi, Ama, Akosua, Mensah, Osei).
2. **Keypad & State Machine Grammar (`src/domain/stateMachine.ts`, `src/domain/phoneUtils.ts`, `src/domain/validation.ts`)**:
   - Ghanaian phone number normalization and telco prefix validation (024, 054, 055, 059, 020, 050, 027, 057, 026).
   - Universal DTMF keypad navigation grammar (`#` for enter, `0` for home, `8` for back, `9` for repeat).
3. **Zero-PIN Security Concepts (`src/ai_system/safety/piiGuard.ts`)**:
   - Immediate redacting of spoken PINs from logs and memory, routing to secure handset USSD.
4. **HTTP 206 Partial Content Streaming (`src/audio/streaming.ts`)**:
   - Safe audio byte-range streaming with path traversal protection.

---

## 5. Migration Plan

| Phase | Objective | Files Involved | Verification Gate |
|---|---|---|---|
| **Phase 1** | Audit & Architecture Foundations | `AI_REBUILD_AUDIT.md`, `AI_ARCHITECTURE.md`, `AI_OFFLINE_MODE.md`, `AI_SAFETY.md`, `AI_MODEL_ROUTING.md` | Verification of specifications |
| **Phase 2** | Purge Hardcoded Fallbacks & Test Branches | `aiAction.ts`, `aiDialogue.ts`, `unifiedToolRegistry.ts`, `financialServices.ts`, `voiceRoutes.ts`, `aiRoutes.ts`, `momoTransactionService.ts` | Grep verification for 0 hardcoded financial fallbacks |
| **Phase 3** | Truth Engine & Balance Capability | `src/ai_system/core/truthEngine.ts`, `src/ai_system/core/capabilityEngine.ts` | Invariant checks and test coverage |
| **Phase 4** | Model Router & Capability-Based Fallbacks | `src/ai_system/providers/modelRouter.ts`, `src/ai_system/providers/localNluProvider.ts`, `src/ai_system/core/offlineAIEngine.ts` | Offline autonomy tests without API keys |
| **Phase 5** | Offline Speech Engine (Local ASR & Local Ghanaian TTS) | `src/ai_system/speech/asr/offlineAsrEngine.ts`, `src/ai_system/speech/tts/localGhanaianTts.ts`, `src/ai_system/speech/tts/ttsService.ts` | Local audio synthesis & transcription tests |
| **Phase 6** | Payment Saga & Idempotent Persistence | `src/integrations/momo/paymentSaga.ts`, `src/services/durableTransactionStore.ts` | Multi-step saga unit tests (Draft -> Auth -> Complete/Fail) |
| **Phase 7** | Contextual Intelligence & Conversational Memory | `src/ai_system/dialogue/clarificationEngine.ts`, `src/ai_system/understanding/contextualReasoningEngine.ts` | Multi-turn slot revision & task resumption tests |
| **Phase 8** | Training & Dataset Infrastructure | `training/`, `models/`, `data/okwankyerɛfo_pa/`, `eval/` | Dataset manifests, training scripts, benchmark eval |
| **Phase 9** | Endpoint Hardening & Observability | `src/routes/aiRoutes.ts`, `src/routes/voiceRoutes.ts`, `src/ai_system/observability/aiTrace.ts` | Rate-limit and trace endpoint validation |
| **Phase 10** | Comprehensive Test Suite & Build Verification | `tests/offlineAIEngine.test.ts`, `tests/paymentSaga.test.ts`, etc. | 100% test pass + `npm run build` |

---

## 6. Target Architectural Standard

The final system will satisfy every constraint outlined in the mandate:
- **Zero single-point-of-failure**: The applet operates continuously when Gemini is disabled or offline.
- **Strict Financial Invariants**: Zero-PIN, explicit confirmation, fail-closed parameter validation, and provider-verified balance/receipt.
- **Genuine Context Awareness**: Robust tracking of user revisions, corrections, interruptions, and task resumptions.
- **Culturally Grounded Ghanaian Speech**: Native Akan Twi and Ghanaian English phonetic and lexical intelligence.
