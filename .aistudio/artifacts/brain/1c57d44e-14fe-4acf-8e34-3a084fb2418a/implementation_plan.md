# Canonical State-to-Prompt Audio Architecture & Telephony Parity

Establishing a single, shared canonical prompt engine (OP01–OP94) across the interactive Phone Simulator and Africa's Talking telephony gateway, guaranteeing 1:1 parity in state transitions, dynamic TTS slot synthesis, and adaptive voice recovery.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed with the user during Phase 1 clarification:
> - **Dynamic Slot Synthesis (OP20, OP21, OP29, OP52, OP70)**: Handled strictly via the approved dynamic TTS template pipeline (rendering caller names, amounts in Akan/English, phone digits, and reference IDs) rather than static audio files with placeholder tokens.
> - **Simulator and Africa's Talking Parity**: Driven by a single shared canonical registry with identical audio URLs, prompt IDs, and state transitions across both channels.
> - **Acoustic Recovery Strategy**: Allows multiple speech recognition attempts with adaptive acoustic clarification and noise filtering before falling back to DTMF keypad mode.

---

## 1. Overview & Core Concept

- **What It Does**: Unifies the application's audio playback and conversational state engine so that dialing the Africa's Talking telephony number (`+233 30 804 8097`/`8`) and testing in the web-based Phone Simulator invoke the exact same state machine, prompt IDs, and TTS synthesis rules.
- **Target Audience**: Ghanaian mobile money users—particularly visually impaired, elderly, and rural non-literate citizens—who rely on natural spoken Akan Twi or Ghanaian English.
- **Key Value**: Eliminates audio discrepancies, ghost greetings, and placeholder audio blurs. Every prompt is either an authentic studio-recorded Ghanaian voice clip or a cleanly synthesized dynamic TTS phrase rendered on demand.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[Inbound Dial / Simulator Launch]
               │
               ▼
   [OP01/OP02 Welcome & Language Gate]
         (English: 1 | Twi: 2)
               │
               ├───────────────────────────────┐
               ▼                               ▼
    [English Flow (en)]               [Akan Twi Flow (tw)]
               │                               │
               ▼                               ▼
 [Service Selection: OP07]          [Service Selection: OP07]
      (Send Money: 1)                    (Send Money: 1)
               │                               │
               ▼                               ▼
 [Recipient Input & Resolver]       [Recipient Input & Resolver]
  Spoken or Keypad + KYC Name        Spoken or Keypad + KYC Name
               │                               │
               ▼                               ▼
 [Dynamic Name Readback: OP20]      [Dynamic Name Readback: OP20]
      (Approved TTS Audio)               (Approved TTS Audio)
               │                               │
               ▼                               ▼
 [Amount Input & Readback: OP29]    [Amount Input & Readback: OP29]
      (Approved TTS Audio)               (Approved TTS Audio)
               │                               │
               ▼                               ▼
 [Safe Confirmation: OP34/OP36]     [Safe Confirmation: OP34/OP36]
   (Zero-PIN Telephony Handoff)       (Zero-PIN Telephony Handoff)
               │                               │
               ▼                               ▼
    [Completion & Reference]           [Completion & Reference]
    (OP52 Dynamic Reference)           (OP52 Dynamic Reference)
```

### Visual Identity & Phone Simulator Ergonomics
- **Visual Discipline**: Adheres to zero-pill UI guidelines. Metadata (call duration, carrier name, prompt IDs, confidence scores) is displayed using clean typographic separators (`·` and `/`) and tabular monospace numerals without rounded pill badges.
- **Dual Verification Interface**: The Phone Simulator dashboard displays the active canonical prompt ID (e.g. `OP20: RECIPIENT_NAME`), current conversation state, audio source (Studio Native vs. Dynamic TTS), and real-time audio visualizer waveform.
- **Palette**: Deep Ghanaian forest green (`#047857`), warm gold accents (`#D97706`), crisp slate surfaces (`#F8FAFC`), and WCAG AA compliant text contrast.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Shared Canonical Prompt Engine over Channel-Specific Routers
- **Chosen Approach**: A single `promptRegistry` and `conversationStateMachine` that both Africa's Talking (VoiceXML generator) and the React Phone Simulator import directly.
- **Why**: Prevents behavioral drift. Bug fixes, new prompt wording, or transaction logic updates apply simultaneously to telephony and the web interface.
- **Alternatives Considered**: Dual implementations (one for Web Audio API and one for VoiceXML). Rejected because maintaining two state machines causes subtle routing divergence.

### Decision 2: Server-Side TTS Template Rendering for Variable Slots
- **Chosen Approach**: Dynamic prompts (`OP20`, `OP21`, `OP29`, `OP52`, `OP70`) resolve to dynamic audio streaming endpoints (`/api/audio/prompt-tts/:lang/:id?amount=...&recipient=...`).
- **Why**: Eliminates disjointed concatenative splicing or awkward silence gaps where recorded names and amounts would otherwise be clumsily inserted.
- **Alternatives Considered**: Client-side speech synthesis (Web Speech API). Rejected because mobile carrier telephony requires a server-accessible MP3/WAV audio stream.

### Decision 3: Adaptive Acoustic Clarification with Escalation Guard
- **Chosen Approach**: On first recognition hesitation or acoustic ambiguity, the system uses natural spoken clarification (e.g., repeating the prompt or asking targeted single-slot questions). Only after repeated ambiguity does it offer DTMF numeric fallback.
- **Why**: Protects non-literate users who cannot easily switch to keypad dialing, while maintaining a deterministic safety net.

---

## 4. Technical Architecture & Telephony Parity

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Canonical Prompt Layer                          │
│       Audio_files/prompts.json ➔ src/audio/canonicalRegistry.ts        │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
       ┌────────────────────────┐       ┌────────────────────────┐
       │   Phone Simulator UI   │       │ Africa's Talking IVR   │
       │   (Browser Web Audio)  │       │ (VoiceXML / HTTP 206)  │
       └────────────┬───────────┘       └────────────┬───────────┘
                    │                                │
                    └───────────────┬────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │             Conversation State Machine                  │
       │        (src/domain/stateMachine.ts - Unified)           │
       └────────────────────────────┬────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       ┌────────────────────────┐      ┌────────────────────────┐
       │  Static Prompt Player  │      │  Dynamic TTS Pipeline  │
       │  Native Studio Audio   │      │  OP20, OP21, OP29,     │
       │  (Audio_files/audio/)  │      │  OP52, OP70 Synthesis  │
       └────────────────────────┘      └────────────────────────┘
```

### Component & State Mapping

| Canonical ID | State Machine Node | Audio Type | Template / Audio Asset | Parity Guarantee |
|---|---|---|---|---|
| **OP01** | `WELCOME` | Fixed Studio | `Welcome 1.m4a` / `Welcome_prompt_01.mp3` | Plays once at call start; no duplicate greeting |
| **OP02** | `LANGUAGE_SELECTION` | Fixed Studio | `Language selection.m4a` | Enforces 1=English, 2=Twi gate before service logic |
| **OP07** | `SERVICE_SELECTION` | Fixed Studio | `Service selection.m4a` | Universal navigation (# to confirm, 0 to cancel) |
| **OP20** | `RECIPIENT_NAME` | Dynamic TTS | Spoken recipient full name from KYC lookup | Verified via dynamic template; zero placeholders |
| **OP21** | `RECIPIENT_FULL_NUMBER` | Dynamic TTS | Spoken 10-digit Ghanaian MSISDN | Natural grouping (e.g., "054", "354", "6010") |
| **OP29** | `AMOUNT_READBACK` | Dynamic TTS | Spoken Ghana cedis & pesewas in Akan/English | Canonical Akan number words (`sika dodow`) |
| **OP34/OP36** | `SAFE_CONFIRMATION` | Fixed Studio | `Review transaction.m4a` / `Confirm speech.mp3` | Zero-PIN security guarantee before telco USSD |
| **OP52** | `TRANSACTION_SUCCESS` | Dynamic TTS | Spoken transaction reference & provider ID | Emitted only upon verified ledger success |
| **OP70** | `CONFIRM_UNDERSTANDING`| Dynamic TTS | Spoken intent confirmation on noisy inputs | Acoustic recovery before state commitment |

### Verification & Regression Strategy
- **Prompt-Level Unit Tests**: Validate that all 94 prompt IDs exist, resolve to valid audio paths or template renderers, and match linguistic invariants.
- **Dual-Channel Scenario Parity Tests**: Programmatically execute standard Send Money scenarios across both `/api/simulator` and `/voice-menu`, asserting identical state transitions and prompt IDs.
- **Audio Stream HTTP 206 Tests**: Ensure all generated dynamic TTS endpoints stream byte-ranges cleanly for mobile telephony gateways.
