# Central Brain Latency & Token Optimization Plan

A production-grade architectural overhaul to eliminate token exhaustion, quota barriers, and reasoning latency in the Central Brain by establishing a zero-token Tier 1 deterministic bypass, compact Gemini Flash schema extraction for complex intents, sliding-window session compression, and instant zero-token audio matching for MoMo sandbox feed events.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural priorities were confirmed during Phase 1:
> - **Core Architecture**: Hybrid routing with zero-token deterministic rules as Tier 1, reserving compact `gemini-3.8-flash` schema calls only for ambiguous or multi-slot natural speech.
> - **MoMo Sandbox Feed Handling**: 100% zero-token deterministic state machine updates and direct studio audio playback (no LLM overhead for transaction callbacks).
> - **Primary Workflow Target**: Sub-second conversational voice call transfers over live telephony (Africa's Talking) and the interactive Phone Simulator.

- **Confirmed Decision 1**: Tier 1 Deterministic Bypass — Standard IVR turns (language select, provider choice, phone digit entry, amount entry, confirmation press/speech) bypass the Gemini API completely. Response latency drops from ~1,800ms to <15ms with 0 tokens consumed.
- **Confirmed Decision 2**: Token-Capped Gemini Flash Schema — When caller speech is freeform/conversational (e.g., *"Mepɛ sɛ mesoma cedi aduonu kɔma me nuabarima Kwame"*), use `gemini-3.8-flash` with a strict `responseSchema` (JSON) and a compact 400-word prompt, cutting token overhead by 78%.
- **Confirmed Decision 3**: Deterministic MoMo Sandbox Audio Dispatch — Webhook callbacks from MTN MoMo sandbox (`POST /api/momo/callback`) resolve via `momoAudioFeedResolver.ts` directly into canonical studio recordings (OP47, OP49, OP53, OP57, OP58) with zero model invocation.
- **Open Decision / Recommended Default**: Sliding Window Session Memory — Cap conversational history to the last 4 active dialogue turns (plus fixed slot state) to guarantee that session memory never expands toward LLM token boundaries during long calls.

---

## 1. Overview & Core Concept

### What It Does
This optimization addresses the core bottlenecks of voice AI systems in Ghanaian digital financial services: LLM token rate-limits, model latency jitter on telephony calls, and erratic multi-turn memory expansion. By instituting a tiered cognitive pipeline, 85%+ of call turns execute with **zero cloud tokens** and **sub-15ms response times**, while non-standard colloquial Twi/English phrases are parsed using a lean, schema-constrained Gemini instance.

### Target Audience & Persona
- **Rural farmers, market traders, visually impaired, and elderly citizens** using 2G/feature phones on Africa's Talking telephony lines, who need immediate audio feedback without awkward 2-3 second AI thinking pauses.
- **System Operators & Developers** testing against MTN MoMo and Telecel sandbox gateways without risking API quota depletion or token exhaustion during load testing.

### Key Value
- **Zero Token Exhaustion**: Repetitive state transitions and sandbox status webhooks consume 0 tokens.
- **Sub-Second Telephony Parity**: Voice prompts trigger immediately, eliminating silent lag that causes feature phone callers to hang up.
- **Guaranteed Ghanaian Audio**: Studio recordings (OP01–OP94) always play first, falling back to local Piper TTS only for dynamic recipient names and numbers.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Direct Fast-Path IVR Turn (0 Tokens, <15ms)**:
   Caller says *"Medaase, mede MTN"* or presses `1`. Tier 1 deterministic grammar extracts provider `MTN`, selects recording `OP05` / `OP07`, and immediately streams audio over the call.
2. **Colloquial Conversational Transfer (Compact Model Turn, ~350 Tokens, ~380ms)**:
   Caller says *"Mepɛ sɛ mekɔsom sika kakra kɔma Kwame"* (mixed multi-intent). Tier 1 flags ambiguity $\rightarrow$ Tier 2 compact Gemini Flash extracts `{ intent: "SEND_MONEY", recipient: "Kwame", amount: null }` $\rightarrow$ Brain asks for amount using studio audio `OP19`.
3. **Real-Time MoMo Sandbox Feed Sync (0 Tokens, Instant)**:
   MTN Sandbox pushes USSD confirmation callback. `momoCallbackService` receives status `SUCCESSFUL`, triggers `transactionStateMachine.transition("COMPLETED")`, and broadcasts `OP53` (*"Sika no akɔ"*) to the caller's active session without calling Gemini.

### Visual Identity & Theme (Dashboard Integration in LlmLabPage & MomoLabPage)
- **Palette**: Ghana heritage green (`#047857`), warm gold (`#D97706`), slate neutrals (`#0F172A`, `#F8FAFC`).
- **Typography**: Tabular numerals (`font-mono`, `tabular-nums`) across latency monitors, token counters, and transaction tables.
- **Anti-Slop Discipline**: Clean unboxed metadata separated by middots (`·`), zero floating pill badges, flat 1px subtle borders, high-density telemetry rows.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Strict Tiered Cognitive Router (Tier 1 vs. Tier 2)
- **Chosen Approach**: All incoming utterances first pass through the deterministic grammar (`ivrDecisionEngine.ts` & regex/phonetic slot matcher). If confidence $\ge 0.75$, the turn is resolved immediately without invoking the Gemini SDK.
- **Why**: Standard financial transactions follow structured constraints (phone numbers, amounts, confirmations). Querying an LLM for "yes", "no", or 10-digit phone numbers is wasteful, expensive, and slow.
- **Alternatives Considered**: Always calling Gemini in parallel (Shadow Mode) was consuming unnecessary quota and creating token spikes.

### Decision 2: Compact System Instruction with Strict `responseSchema`
- **Chosen Approach**: Replace large prompt string concatenations (`MOMO_SYSTEM_INSTRUCTION` + full verbose language policy) with a minified 350-token system instruction paired with a strict Gemini `responseSchema` (`Type.OBJECT`).
- **Why**: Structured JSON schemas prevent markdown chat responses, eliminate parser retries, and drastically reduce input and output tokens.
- **Alternatives Considered**: Freeform natural language prompt generation with post-parsing, which frequently hit token limits and required fallback retries.

### Decision 3: Zero-Token MoMo Sandbox Webhook Handling
- **Chosen Approach**: MoMo callback feeds (`POST /api/momo/callback`) directly invoke `resolveMomoAudioFeed()` in `momoAudioFeedResolver.ts`, mapping transaction statuses directly to canonical prompt IDs (`OP47`, `OP49`, `OP53`, `OP57`, `OP58`).
- **Why**: Sandbox webhooks are machine-to-machine events with fixed schema payloads. Injecting an LLM to "summarize" a payment status wastes tokens and introduces unpredictable failure points in financial settlement.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
                 Incoming Caller Audio / DTMF
                              │
                              ▼
                   ┌───────────────────────┐
                   │  ASR / Speech Normal  │
                   └──────────┬────────────┘
                              │ Utterance / Transcript
                              ▼
               ┌───────────────────────────────┐
               │    Tier 1: Deterministic      │
               │    IVR & Slot Regex Engine    │
               └──────────────┬────────────────┘
                              │
                 Confidence   │   Confidence
                   >= 0.75    │    < 0.75
             ┌────────────────┴────────────────┐
             ▼                                 ▼
   ┌───────────────────┐             ┌───────────────────┐
   │ Tier 1 Fast-Path  │             │ Tier 2 Model Path │
   │ (Zero-Token Rule) │             │ (Compact Gemini)  │
   │  < 15ms Latency   │             │   ~380ms Latency  │
   └─────────┬─────────┘             └─────────┬─────────┘
             │                                 │
             │   Settled Intent & Slots        │
             └────────────────┬────────────────┘
                              ▼
               ┌───────────────────────────────┐
               │   Transaction State Machine   │
               │   & Zero-PIN Security Guard   │
               └──────────────┬────────────────┘
                              │
                              ▼
               ┌───────────────────────────────┐
               │    Audio Prompt Resolver      │
               │  (OP01–OP94 Studio Audio)     │
               └──────────────┬────────────────┘
                              │
               ┌──────────────┴───────────────┐
               ▼                              ▼
      ┌─────────────────┐            ┌──────────────────┐
      │ Africa's Talk.  │            │ Phone Simulator  │
      │ Telephony IVR   │            │ Browser Playback │
      └─────────────────┘            └──────────────────┘

               ▲                              ▲
               │ Direct Audio Webhook Trigger │
               └──────────────┬───────────────┘
                              │
               ┌──────────────┴───────────────┐
               │    MoMo Sandbox Callback     │
               │  (Zero-Token Webhook Feed)   │
               └──────────────────────────────┘
```

### Data Model & State Strategy
- **Session Context Window**: Keep conversation history to a sliding window of max 4 turns (`callerUtterance`, `brainPrompt`).
- **Draft State Store**: Keep immutable draft slots `{ recipientPhone, recipientName, amount, network, isConfirmed }` isolated from LLM dialogue tokens.
- **Feed Event Matcher**: Webhook payload `{ referenceId, status, financialTransactionId, reason }` maps directly to `MomoFeedAudioMatch` containing `{ promptIds, audioUrls, voiceXml }`.

### Interactive Component & State Mapping
- **`src/ai_system/brain/brain.ts`**:
  - Implement Tier 1 pre-filter before calling `geminiClient`.
  - Apply 4-turn sliding window memory truncation.
  - Set `thinkingLevel: ThinkingLevel.LOW` for fast interactive turn-taking.
- **`src/ai_system/understanding/reasoningEngine.ts`**:
  - Introduce `COMPACT_MOMO_PROMPT` schema using `@google/genai` `Type.OBJECT` definition.
- **`src/audio/momoAudioFeedResolver.ts` & `src/integrations/momo/momoCallbackService.ts`**:
  - Ensure all incoming sandbox callbacks trigger instant state transitions and direct VoiceXML audio response without LLM involvement.
- **`src/pages/dashboard/LlmLabPage.tsx`**:
  - Add real-time Token Usage & Latency Breakdown (Tier 1 vs Tier 2 turns, token savings gauge).
