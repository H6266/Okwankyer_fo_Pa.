# Rational Audio Sequence & Flow Re-Architecture: Eliminating Language Resets and Streamlining Prompt & Conversational Transfers

A production-grade re-architecture of the IVR Prompt and Conversational speech pipelines to ensure deterministic state progression, prevent unwanted resets to language selection after recipient submission, play authentic studio recordings for invalid numbers, and streamline transfer flows.

### User Review & Critical Decisions

> [!IMPORTANT]
> The three core interaction behaviors confirmed during Phase 1 have been formalized into strict system invariants:

- **Confirmed Decision 1 (IVR Prompt Flow Sequence)**: When a recipient phone number is submitted in IVR Prompt mode, the system announces the recipient's verified name and full 10-digit phone number (KYC readback), and immediately advances to Transfer Amount Entry without bouncing the caller.
- **Confirmed Decision 2 (Conversational Dual-Slot Extraction)**: In Conversational mode, if the caller utters both the recipient and amount together in one sentence (e.g., *"Send 50 cedis to 0543546010"* or *"Mane Kwame Nyamebere 50 cedis"*), both slots are resolved simultaneously, bypassing redundant back-and-forth prompts and advancing directly to the Safe Review & Confirmation stage.
- **Confirmed Decision 3 (Guarded Error Recovery & Invalid Number Studio Audio)**: If a spoken or keypad recipient number cannot be recognized or is invalid, the system plays the authentic Twi studio recording (`Invalid recipient 1.m4a` / `invalid_recipient`) and re-prompts the caller to enter the recipient number while strictly preserving session language, caller context, and state. Resets to `/voice-menu` or language selection are permanently eliminated.

---

### 1. Overview & Core Concept

- **What It Does**: Resolves erratic audio prompt sequencing in both IVR Prompt and Conversational modes. Callers who speak or type recipient numbers now experience smooth, logical progression into amount entry and confirmation, with authentic studio voice feedback for invalid numbers.
- **Target Audience / Persona**: Ghanaian citizens—including non-literate, visually impaired, and rural mobile money subscribers—interacting via Akan Twi or Ghanaian English over telephony and web audio simulators.
- **Key Value**: Predictable, anxiety-free audio interactions that mirror natural human banking conversations and never trap the user in cyclical language-selection loops.

---

### 2. User Experience & Rational Audio Flow

```
                      IVR PROMPT MODE (Keypad / Short Voice)
┌────────────────┐      ┌─────────────────────────┐      ┌────────────────────────┐
│  Enter Phone   │ ───► │  Announce KYC Name &    │ ───► │  Enter Amount & #      │
│  10 digits + # │      │  Full Number Readback   │      │  (OP26 Studio Audio)   │
└────────────────┘      └─────────────────────────┘      └────────────────────────┘
        │                            ▲                                │
        ▼ (Invalid Number)           │                                ▼
┌────────────────┐                   │                   ┌────────────────────────┐
│ Studio Audio:  │ ──────────────────┘                   │ Review & Confirm       │
│ "Invalid Recip"│   (Re-prompt in current lang)         │ (OP34-OP36)            │
└────────────────┘                                       └────────────────────────┘

                 NATURAL CONVERSATIONAL MODE (Free Speech)
┌────────────────────────────────────────────────────────┐
│ Caller: "Send 50 cedis to Kwame on 0543546010"         │
└────────────────────────────────────────────────────────┘
                           │
                           ▼ (Dual-Slot NLU & KYC Resolver)
┌────────────────────────────────────────────────────────┐
│ AI Brain: Extracted [Amount: 50, Recipient: 0543546010] │
│ Auto-Resolves: KYC Name = "Hannes Aboagye"             │
└────────────────────────────────────────────────────────┘
                           │
                           ▼ (Direct Leap)
┌────────────────────────────────────────────────────────┐
│ Safe Review & Confirmation Stage:                       │
│ "You are about to send 50 Cedis to Hannes Aboagye...   │
│  Press 1 to confirm, or 2 to cancel."                   │
└────────────────────────────────────────────────────────┘
```

#### Step-by-Step UX Walkthrough

1. **Language Gate Locked In**: The caller selects English (1) or Akan Twi (2) once at session initiation. The session context irrevocably locks this preference for all subsequent turns.
2. **Recipient Entry & Validation**:
   - In **Prompt Mode**, the caller enters 10 digits followed by `#` (or speaks the digits).
   - If valid, the system retrieves KYC name identity and plays the readback prompt: *"Yɛahu obi a woremane no sika no... Obi a woremane no din ne [Name]. Ne fon nɔmba ne [Number]"*, advancing cleanly to Amount Entry.
   - If invalid or unverified, the system plays `Invalid recipient 1.m4a` and replays the recipient entry prompt in the active language.
3. **Conversational Multi-Entity Shortcutting**:
   - If the caller speaks both details at once, the system skips intermediate recipient and amount prompts, presenting the unified transaction confirmation immediately.
4. **Resilient Session Fallbacks**:
   - If an unexpected error occurs during speech fallback, the handler returns the caller to the *current active step* rather than defaulting to the root `/voice-menu` endpoint.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Immediate Progression vs. Multi-Confirmation Intermediates
- **Chosen Approach**: After recipient verification readback in prompt mode, automatically cue Amount Entry while keeping keypad `2` (Change Recipient) and `0` (Cancel) active.
- **Why**: Eliminates conversational friction and redundant confirmation turns that confuse elderly and first-time users.
- **Alternatives Considered**: Forcing a separate menu selection before allowing amount entry (rejected as user testing showed this caused repetitive hang-ups).

#### Decision 2: Guarded Step-Specific Fallbacks vs. Root URL Fallbacks
- **Chosen Approach**: Every step handler maintains an explicit, scoped recovery target. If an unrecognized utterance occurs on `enter-recipient`, the fallback URL is strictly `enter-recipient`, not `voice-menu`.
- **Why**: Guarantees that callers never lose their progress or get unexpectedly kicked back to language selection.
- **Alternatives Considered**: Generic catch-all error handler (rejected as it was the root cause of the language reset bug).

#### Decision 3: Authentic Akan Twi Studio Audio Priority
- **Chosen Approach**: Explicitly wire `Audio_files/Twi/3.Recipient Entry & Verification/Invalid recipient 1.m4a` and `Enter recipient 2.m4a` for invalid recipient recovery.
- **Why**: Provides culturally authentic native human voice guidance rather than synthetic robotic fallback.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                           Telephony & Client                           │
│     [Phone Simulator / AT Voice Gateway / Continuous Speech Engine]    │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Session State & Context Guard                    │
│   - Session Locked Language ('twi' | 'en')                             │
│   - State Tracker: INITIATED ➔ RECIPIENT_ENTERED ➔ AMOUNT_ENTERED      │
│   - Anti-Reset Rule: Default fallback target = currentStep, NOT root   │
└────────────────────────────────────────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌───────────────────────────────────┐       ┌───────────────────────────────────┐
│     Prompt Route Controller       │       │    Conversational AI Brain        │
│  - verify-recipient handler       │       │  - Dual-slot extraction engine    │
│  - KYC Resolver lookup            │       │  - Combined amount + recipient    │
│  - Play Invalid Recipient Studio  │       │  - Direct leap to Safe Confirm    │
│  - Advance to enter-amount        │       │  - State sync with Transaction    │
└───────────────────────────────────┘       └───────────────────────────────────┘
          │                                                   │
          └─────────────────────────┬─────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Audio Output Controller                         │
│  - Studio Clips: Invalid recipient 1.m4a, Enter recipient 2.m4a        │
│  - Dynamic TTS: Amount readback, Name readback                         │
│  - Zero-PIN Handset Handoff (Microphone strictly muted)                │
└────────────────────────────────────────────────────────────────────────┘
```

#### Key Technical Modifications Planned

1. **Telephony & Simulator Routing (`voiceRoutes.ts`)**:
   - In `/verify-recipient`: After validating the recipient and retrieving the KYC name, seamlessly transition session state to `RECIPIENT_VERIFIED` and supply the amount prompt directly.
   - In `/speech-fallback`: Rewrite fallback redirection logic so invalid or empty inputs return to the originating step (`${baseUrl}/${step}?sessionId=...`), removing the rogue `${baseUrl}/voice-menu` default.
   - For invalid phone format: Return `<Play url=".../Invalid recipient 1.m4a"/>` with the re-prompt.

2. **Simulator Presentation Logic (`PhoneSimulatorPage.tsx`)**:
   - Update `getFallbackCallbackUrl`: Never return `voice-menu` if the call is already in progress. Default to `currentStep` or `enter-recipient`.
   - Update `handleKeypadPress`: Allow single-digit confirmation options (1 to proceed, 2 to change) on `verify-recipient` without waiting for `#`.
   - In `processSpokenUtterance`: Add `verify-recipient` to the confirmation group so spoken "aane", "yes", or "confirm" automatically advances to amount entry.

3. **Conversational AI Brain (`aiRoutes.ts` & `brain.ts`)**:
   - When Gemini / NLU identifies both `recipient` and `amount` in a single conversational turn, set intent to `momo.transfer`, populate both slots in `updatedDraft`, and transition directly to `confirm` (Safe Confirmation), avoiding redundant questioning.
