# Ɔkwankyerɛfo Pa: The Architectural Plan for a Resilient Conversational AI Brain

Construct a bilingual, latency-controlled, and safety-verified conversational brain for Ɔkwankyerɛfo Pa that combines Gemini's natural language intelligence with strict deterministic financial guardrails, absolute zero-PIN security, and reliable session memory across both telephone calls and simulator sessions.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following core strategic decisions were confirmed through Phase 1 requirements clarification and govern this implementation plan:

- **Confirmed Decision 1 (Model Reasoning & Fallback)**: Single-turn Gemini reasoning (`gemini-3.8-flash`) as the primary cognitive engine, paired with an instant local deterministic state machine as the fallback tier if the model latency exceeds budget or the network degrades.
- **Confirmed Decision 2 (PII & Phone Redaction)**: Cryptographic placeholder tokenization (`[RECIPIENT_TOKEN_<hash>]`) with a local session map. Gemini receives redacted transcripts and slot availability flags without ever seeing raw 10-digit phone numbers; absolute zero-PIN interception occurs before any prompt touches the network.
- **Confirmed Decision 3 (Triage & Hybrid Fast-Path)**: Hybrid routing engine. Deterministic fast-path bypasses Gemini for DTMF keypresses, exact navigation keywords (`cancel`, `repeat`, `back`), and readback confirmations. Natural voice speech and complex multi-intent utterances engage Gemini.
- **Confirmed Decision 4 (Evaluation & Benchmark)**: Balanced gold dataset expansion covering Asante Twi, Akuapem Twi, Ghanaian English, and code-switched dialogues, measuring exact-match slot extraction, confirmation revocation, and rejection of hallucinated details.

---

### 1. Overview & Core Concept

- **What It Does**: Ɔkwankyerɛfo Pa is a voice accessibility layer sitting between Ghanaian citizens and digital services (starting with Mobile Money transfers, cash-outs, balance inquiries, and bill payments). It accepts voice speech or keypad input over telephone calls (via Africa's Talking) and the web phone simulator, understanding colloquial Akan Twi, Ghanaian English, and mixed code-switching.
- **Target Audience / Persona**: Elderly pensioners, visually impaired users, market traders, and non-literate citizens across Ghana who navigate Mobile Money primarily through spoken voice rather than complex USSD visual menus.
- **Key Value**: Bridges digital financial exclusion through natural voice dialogue while guaranteeing strict safety invariants: no model ever touches a user PIN, all financial amounts and recipients are validated against deterministic ledgers before execution, and every transaction requires explicit readback and affirmative confirmation.

---

### 2. User Experience & Visual Design

The operator and testing experience is hosted within the Ɔkwankyerɛfo Pa Observability Dashboard (`/dashboard`), offering deep visibility into brain reasoning, model latency, slot grounding, and audio playback.

#### Key User & Operator Flows

1. **Call Simulation & Voice Session Flow**:
   - The user dials into the phone simulator or calls the live gateway (+233 30 804 8098).
   - The caller speaks naturally in Akan Twi (e.g., *"Mepɛ sɛ mesoma sika dɔla aduonum kɔma Kwame"* — *I want to send 50 cedis to Kwame*).
   - The hybrid router detects conversational speech and sends the cryptographically sanitized transcript to Gemini.
   - The brain extracts intent (`momo.transfer`), slots (`amount: 50`, `recipient: { name: "Kwame" }`), identifies missing recipient phone number, and triggers a canonical Akan prompt asking for the number.
   - Caller speaks or types phone digits. The deterministic number decoder captures the phone number into protected memory, reads back the verified recipient and amount, and requests explicit confirmation.
2. **Observability & Diagnostics Flow**:
   - Engineers and QA testers view live turn traces in `IvrLabPage` and `LlmLabPage`.
   - Each turn exposes: transcript input, redaction delta, Gemini prompt payload, latency breakdown (ASR ms, Brain ms, TTS ms), extracted slots, grounding verification checks, and prompt ID selected.

#### Visual Identity & Dashboard Theme

- **Aesthetic Direction**: High-legibility, utilitarian developer & telemetry dashboard inspired by industrial flight recorders and mission-critical financial consoles. Crisp flat surfaces, quiet 1px borders, and zero decorative fluff.
- **Color Palette & Contrast**:
  - Background: Crisp neutral light (`#FFFFFF`) / Dark mode slate (`#0A110D`)
  - Accent / Ghanaian Forest Heritage: Deep Emerald (`#047857`), Forest Shadow (`#064E3B`)
  - Accent / Gold Trim: Ghanaian Gold (`#D97706`), Warm Amber (`#F59E0B`)
  - Danger / Security Halt: Crisp Crimson (`#DC2626`)
  - Semantic Status: Emerald for Nominal/Verified, Amber for Clarification Needed, Crimson for Revoked/Rejected.
- **Typography & Tabular Numerals**:
  - Display & Headings: `Plus Jakarta Sans` / `Atkinson Hyperlegible` (featuring explicit Latin-extended Ghanaian characters: Ɔ, ɔ, Ɛ, ɛ).
  - Telemetry & Data Grids: Strictly monospace tabular numerals (`JetBrains Mono`, `font-variant-numeric: tabular-nums`) for currency figures (GH₵), latencies (ms), phone numbers, and draft hashes.
- **Anti-Slop Discipline**:
  - No static pill badges around metadata or status text. Metadata is rendered as quiet inline text separated by typographic middots (`·`).
  - Single-elevation card containers with subtle borders (`border-slate-200 dark:border-slate-800`).
  - No nested card-in-card containers.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Authoritative Single-Brain Architecture
- **Chosen Approach**: All decisions, intent classifications, slot validations, and state progressions flow through a single singleton `CentralBrain` (`src/ai_system/brain/brain.ts`). Both Africa's Talking telephone webhooks and the interactive Web Phone Simulator invoke the exact same method `brain.processTurn()`.
- **Why**: Eliminates behavioral drift and heuristic discrepancies between the web simulator and production phone lines.
- **Alternatives Considered**: Dual-brain simulator mocking was rejected because bugs observed in testing were bypassed in simulator-only logic.

#### Decision 2: Cryptographic Tokenization for PII Sanitization
- **Chosen Approach**: When speech contains phone numbers or account numbers, the deterministic pre-processor extracts them into an ephemeral, encrypted in-memory session vault, replacing the raw digits with `[RECIPIENT_TOKEN_<hash>]` before generating Gemini's prompt.
- **Why**: Protects user privacy and complies with data governance without depriving Gemini of linguistic context (the model knows a recipient phone was specified in the sentence).
- **Alternatives Considered**: Sending raw digits to Gemini was rejected due to financial data governance rules; completely blanking numbers caused the model to ask for the recipient again.

#### Decision 3: Deterministic Financial Invariants & Confirmation Revocation
- **Chosen Approach**: If any parameter (amount, recipient name, recipient phone, or network) changes after a readback confirmation has been issued, the confirmation is unconditionally revoked (`confirmed: false`), and a fresh readback of the updated values is mandated before transaction dispatch.
- **Why**: Prevents "bait-and-switch" conversational traps or prompt injections where an attacker modifies the recipient or amount in the confirmation turn.

#### Decision 4: Gemini Model Configuration & Active Catalog Check
- **Chosen Approach**: Centralize model definitions in `src/ai_system/core/aiConfig.ts` with `gemini-3.8-flash` as primary reasoning model and `gemini-flash-latest` as dynamic fallback. At startup, perform an active handshake probe against the `@google/genai` API. Deprecated preview models (`gemini-3.1-flash-lite`, `gemini-1.5-*`, `gemini-2.0-*`) are completely eliminated from configuration candidates.
- **Why**: Guarantees zero runtime crashes caused by deprecated or retired preview models.

---

### 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CALLER INTERFACE                               │
│     Africa's Talking Voice Webhook  │  Web Phone Simulator (WebAudio/DTMF)   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Raw Audio / DTMF / Speech Transcript
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SECURITY & INGESTION GATE                         │
│  - Zero-PIN Regex Interceptor (Halts turn immediately if PIN spoken)       │
│  - Normalizer & Delimiter Sanitizer (Strips prompt-injection tags)          │
│  - PII Cryptographic Redactor (Tokens for phone numbers, vault in session)  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Sanitized Utterance + Session Vault
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             HYBRID FAST ROUTER                              │
│  - DTMF Keypress (1, 2, #, *) ────────────► Fast Path (Local Decision Engine)
│  - Exact Keywords ("cancel", "repeat") ───► Instant Canonical Audio ID      │
│  - Complex Voice Utterance ───────────────► Cognition Layer (Gemini)        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COGNITION LAYER (GEMINI)                            │
│  - Model: gemini-3.8-flash (via @google/genai SDK, server-side only)        │
│  - Structured Output: responseSchema (Intent, Slots, Signals, Proposed Act) │
│  - Timeout: 3500ms hard deadline with graceful circuit breaker              │
│  - Memory: Structured Multi-Turn Snapshot (Turn history, pending question)  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Proposed Output Contract
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DETERMINISTIC VALIDATION & GUARD                       │
│  - Number Decoder: Exact-match & phonetic validation of amounts (GHS limits)│
│  - Recipient Grounding: Fuzzy match name in transcript; reject hallucinations
│  - Invariant Guard: Invalidate confirmation if amount or recipient changed  │
│  - State Machine Transition: Only valid transitions allowed                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Authorized Decision & Prompts
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CANONICAL AUDIO SUBSYSTEM                          │
│  - Static Prompts: OP01–OP94 authentic Akan Twi / English studio recordings  │
│  - Dynamic Slots: Piper Neural TTS / Telephony MP3 Streamer                 │
│  - Handoff Guard: Seamless transition to Telco USSD for handset PIN entry   │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Core Data Entities & Session Contracts

1. **Session Memory Store (`src/ai_system/memory/unifiedMemory.ts`)**:
   - `sessionId`: Unique UUID per telephone call or simulator session.
   - `language`: Selected dialect (`twi-asante`, `twi-akuapem`, `en`, `mixed-twi-en`).
   - `callerNumber`: E.164 phone number of caller.
   - `draft`: Validated transaction state (`intent`, `amount`, `recipient: { phone, name, network }`, `confirmedDraftHash`, `confirmed`).
   - `vault`: Map of cryptographic tokens to real phone numbers (`Map<string, string>`).
   - `turnHistory`: Bounded array of the last 6 turns with sanitized caller speech, brain decision, and prompt ID.
   - `outstandingQuestion`: The active slot currently being requested (`amount`, `recipient_phone`, `confirmation`, `none`).

2. **Structured Model Output Schema (`@google/genai` `Type.OBJECT`)**:
   - `intent`: `{ id: string, confidence: number }`
   - `slots`: `{ amount?: number, recipient_token?: string, recipient_name?: string, network?: string }`
   - `signals`: `{ correction: boolean, cancellation: boolean, user_confirmed: boolean }`
   - `reply`: `{ reply_kind: string, target_language: string, prompt_key?: string }`

3. **Grounding & Validation Rules**:
   - **Amount Range**: Must be between 1.00 GHS and 5,000.00 GHS. Ambiguous number phrases (e.g., *"mpem ahanu ne aduonum"*) trigger explicit keypad clarification.
   - **Recipient Name Grounding**: If Gemini extracts a recipient name that does not appear phonetically or textually in the transcript or contact address book, it is rejected.
   - **Readback Integrity**: The spoken confirmation readback must synthesize the exact numbers recorded in the validated draft, never Gemini's free-form hallucinations.
   - **Zero-PIN Boundary**: Any utterance matching PIN patterns (4-6 isolated digits or *"m'akoma mu nɔmba"*) immediately halts the call with warning prompt OP60 and terminates the session.

---

### 5. Implementation Roadmap & Milestones

#### Phase 1: Foundation Hardening & Security Redaction
1. **Fix Redaction Pipeline in `brain.ts`**:
   - Update `callModelWithFallback` to receive `redactedTranscript` instead of `rawTranscript`.
   - Implement `[RECIPIENT_TOKEN_<hash>]` tokenization and session vault storage.
   - Ensure `isSpokenPinPresent()` executes before any model call, returning security block prompt `OP60`.
2. **Centralize Model Configuration in `aiConfig.ts` & `brain.ts`**:
   - Consolidate all model identifiers to use `gemini-3.8-flash` as primary and `gemini-flash-latest` as secondary fallback.
   - Remove obsolete preview aliases (`gemini-3.1-flash-lite`, `gemini-2.0-flash`).
   - Add an asynchronous startup probe that verifies Gemini API reachability without hanging the server boot.
3. **Unify Brain Entry Point**:
   - Ensure `src/routes/voiceRoutes.ts` (Africa's Talking webhooks) and `src/routes/aiRoutes.ts` / `src/hooks/useCallSession.ts` (simulator) execute the identical `brain.processTurn` pipeline with shared memory state.

#### Phase 2: Conversational Context, Corrections & Memory
4. **Contextual Multi-Turn Snapshot**:
   - Inject the structured conversation snapshot (current step, verified draft details, outstanding question, last prompt played) into Gemini's system instruction and prompt context.
   - Support colloquial Ghanaian corrections (e.g., *"Actually, make it 70"*, *"Sesa no kɔ aduonum"*, *"No, that's the wrong number"*).
5. **Confirmation Revocation Invariant**:
   - Enforce automatic `confirmed = false` whenever an amount or recipient is updated after a readback.
6. **Bilingual Ghanaian Lexicon & Code-Switching**:
   - Enhance Twi number, name, and currency dictionaries in `src/ai_system/linguistic/` to parse mixed expressions (e.g., *"Fifty cedis"*, *"Sika 50"*, *"GHS 50"*).

#### Phase 3: Benchmark Dataset & Operational Observability
7. **Expand Evaluation Dataset (`data/evalTranscripts.json`)**:
   - Scale from 30 to 100+ rigorously labelled scenarios across Asante Twi, Akuapem Twi, Ghanaian English, and mixed dialogues.
   - Include adversarial prompt injections, background market noise transcripts, and PIN-blurt attempts.
8. **Fix Evaluation Script (`scripts/run_eval_transcripts.ts`)**:
   - Explicitly flag unexecuted live-model tests as `NOT_RUN` rather than echoing offline baseline numbers.
   - Integrate deterministic safety checks into automated test suites.
9. **Real-Time Turn Diagnostics**:
   - Surface model latency, token redaction status, circuit-breaker health, and prompt audio IDs on the `IvrLabPage` and `LlmLabPage`.
