# Accessible In-Call PIN Authorization & ASR Filter Gate Optimization

Proposes a production-ready architectural implementation that enables blind and elderly users to complete Mobile Money transactions autonomously using accessible in-call PIN authentication (DTMF keypad or spoken PIN), while curing speech recognition mangling caused by over-aggressive echo filter gates.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design choices were confirmed during requirement clarification and define the operational boundaries of this update:

- **Confirmed Decision 1 (PIN Workflow)**: Dual Mode: In-Call PIN (DTMF Keypad or Spoken PIN) and Handset Screen Push. The system provides an accessible in-call authentication step where blind and elderly users can either key in their PIN (`****#`) or speak it directly without needing an assistant or third party. Handset USSD push is preserved as an alternative.
- **Confirmed Decision 2 (Privacy & Zero-Log Invariant)**: In-call PIN entries are masked as `****` in simulator chat turns, terminal events, and call logs. Raw PIN digits are never stored in transaction stores, audit logs, or session state, and are never routed to TTS synthesis.
- **Confirmed Decision 3 (ASR Echo Filter Tuning)**: Acoustic echo filtering against the 144-item system prompt catalog is strictly confined to intervals when the assistant is actively speaking (`isAssistantSpeaking: true`). When the assistant is quiet, caller speech is never erased or truncated by the catalog gate.

---

## 1. Overview & Core Concept

### What It Does
1. **Accessible In-Call PIN Authorization (Judge & Telco Partner Flow)**:
   - Extends Step 7 (`PIN_GATE`) from a static handoff into an interactive authentication state.
   - Plays clear bilingual voice prompts (OP40/Pin Handoff): *"Please enter your 4-digit Mobile Money PIN on your keypad followed by the hash key, or speak your PIN clearly. For security, your PIN is never spoken back."*
   - Listens for DTMF keypad input (4–6 digits ending in `#`) or spoken numeric digits.
   - Upon receiving valid PIN input, the call flow seamlessly executes Step 8 (`INITIATE_TRANSACTION`), triggers the telecom payment saga, verifies transaction state, and proceeds to Step 9 (`REPORT_STATE`) with reference number readback.
2. **ASR Filter Gate Restoration**:
   - Disables false-positive echo filtering when the assistant is not playing audio, ensuring natural Ghanaian phrases (e.g. *"I want to send 50 cedis to Kwame"*, *"Me pɛ sɛ me mane sika..."*) are faithfully transcribed without truncation.
   - Fixes stale React closure states in `useSpeechRecognition.ts` so `isSpeaking` dynamically reflects actual audio playback state.

### Target Audience & Persona
- **Visually Impaired Ghanaians**: Users who cannot read handset USSD screens or SMS authorization prompts, enabling complete end-to-end self-service.
- **Elderly Citizens**: Callers with tactile dexterity challenges who prefer speaking their credentials in private environments.
- **Hackathon Judges & Telco Integrators**: Demonstrates the live, working end-to-end payment lifecycle from speech greeting through automated receipt issuance.

---

## 2. User Experience & Visual Design

### Key User Flows

#### A. In-Call PIN Entry Flow (Accessible Voice / DTMF)
```
[ Safe Confirmation (Step 6) ] 
       │ Caller presses "1" (Confirm)
       ▼
[ PIN Gate (Step 7) ]
       │ "Please enter your 4-digit PIN followed by #, or speak your PIN."
       ├─────────────────────────────────┬─────────────────────────────────┐
       ▼ (DTMF Entry)                    ▼ (Voice Entry)                   ▼ (Handset Push)
  User taps "2 8 3 8 #"             User speaks "two eight three eight"  User waits for USSD
       │ DTMF tone chime                 │ Detected digits                 │ Handset prompt
       │ Masked as "****" in UI          │ Masked as "****" in UI          │ Screen notification
       └─────────────────────────────────┴─────────────────────────────────┘
                                         │
                                         ▼
                   [ Execute Payment Saga (Step 8) ]
                                         │
                                         ▼
                   [ Audible Receipt & TX ID (Step 9) ]
```

#### B. Visual Presentation & Simulator Enhancements
- **Accessible PIN Mode Banner**: A clean, high-contrast toggle bar inside the Interactive Call Simulator:
  - `Mode: Partner Live Demo (Accessible PIN: DTMF & Voice)` vs. `Mode: Strict Telco USSD Handset Handoff`.
- **Masked Turn Display**: Chat bubble shows `****` with a discrete lock icon (`🔒 Authenticated via encrypted channel`).
- **Real-Time ASR Audio Indicator**: Visual feedback showing when the microphone is listening vs. suppressed during audio playback, preventing confusion.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Dual Mode vs. Deprecating Zero-PIN
- **Chosen Approach**: Retain the original Zero-PIN USSD screen push as a configurable mode while introducing the In-Call Accessible PIN mode for live demos, telco partner evaluation, and accessibility trials.
- **Why**: Maintaining both modes preserves security compliance for strict enterprise audits while empowering blind users who physically cannot use visual USSD pop-ups.
- **Alternative Considered**: Forcing only voice PIN entry would violate standard security policies when used in public spaces.

### Decision 2: Echo Suppression Scope in `echoFilter.ts`
- **Chosen Approach**: Restrict the 144-prompt catalog search strictly to `if (isAssistantSpeaking)`. When the assistant is silent, only exact repeated acoustic tails within 300ms of prompt completion are filtered.
- **Why**: Genuine users naturally repeat phrases like *"send money"* or *"twenty cedis"* that appear in prompt text. Bypassing catalog matching during caller speech turns restores 100% transcript fidelity.
- **Alternative Considered**: Deleting the prompt catalog entirely would cause speaker-to-mic feedback loops in environments without headphones.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Interactive Phone Simulator                     │
│  ┌───────────────────────┐          ┌───────────────────────────────┐  │
│  │ Web Speech / Live ASR │          │ Keypad DTMF Barge-In Handler  │  │
│  └───────────┬───────────┘          └───────────────┬───────────────┘  │
│              │ Live Transcript                      │ DTMF Tones       │
│              ▼                                      ▼                  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │              Echo Filter Gate (Acoustic Guard)                   │  │
│  │  - If isAssistantSpeaking == true  --> Filter catalog echoes     │  │
│  │  - If isAssistantSpeaking == false --> Pass transcript verbatim  │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │ Filtered Utterance / DTMF
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Express & Telephony Route Gateway                    │
│                                                                        │
│   /safe-outcome  ──(Confirm 1)──>  /enter-pin                          │
│                                      │                                 │
│                                      ├─ DTMF: <GetDigits numDigits=4>  │
│                                      ├─ Voice: Speech PIN detection    │
│                                      │                                 │
│                                      ▼                                 │
│                                /authorize-pin                          │
│                                      │                                 │
│                                      ▼ (Mask PIN as ****)              │
│                       paymentSaga.executeConfirmedTransfer()           │
│                                      │                                 │
│                                      ▼                                 │
│                                /check-status                           │
│                                      │                                 │
│                                      ▼                                 │
│                       OP52 Success Audio & TX Reference                │
└────────────────────────────────────────────────────────────────────────┘
```

### Component State & Route Modifications

1. **`src/domain/echoFilter.ts`**:
   - Update `isAcousticSystemEcho`: Wrap Check 5 (catalog phrase loop) inside `if (isAssistantSpeaking)`.
   - Update `stripSystemEchoFromTranscript`: Guard prompt stripping so it only applies when the assistant was recently or actively speaking.

2. **`src/hooks/useSpeechRecognition.ts`**:
   - Use `useRef` for `options.isSpeaking` and `options.activePrompt` so `recognition.onresult` reads current values without stale closure locks.
   - Add spoken PIN digit normalization for `PIN_GATE` step with automatic `****` masking.

3. **`src/domain/pinSafety.ts`**:
   - Add `isAccessiblePinModeActive()` check: Allow DTMF and guarded spoken PIN entry when accessible in-call authentication mode is active, while continuing to block unintended PIN blurting at menus and recipient steps.

4. **`src/routes/voiceRoutes.ts`**:
   - Add `/enter-pin` route: Prompts for 4-digit PIN with `<GetDigits timeout="15" finishOnKey="#" numDigits="4">` and fallback speech recording.
   - Add `/authorize-pin` route: Validates 4-digit input, redacts to `****`, advances session state to `INITIATE_TRANSACTION`, and executes `paymentSaga`.
   - Support both simulator and live Africa's Talking telephony endpoints.

5. **`src/pages/dashboard/PhoneSimulatorPage.tsx`**:
   - Add Accessible PIN Demo toggle in the simulator settings bar.
   - Wire in-call PIN submission to auto-advance to payment completion and success receipt readback.
