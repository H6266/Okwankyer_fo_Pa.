# Fix OP16 Recipient Phone Entry Stall & Audio Overlap

Resolve the stall and dual-audio collision at OP16 (Recipient Phone Entry), ensuring smooth 10-digit entry, eliminating premature auto-advance into amount prompts, serializing audio playback, and guaranteeing seamless transitions across the Interactive Phone Simulator and telephony gateway.

## User Review & Critical Decisions

> [!IMPORTANT]
> The issue reported by the user has two interconnected root causes:
> 1. **Premature Auto-Advance & Dual Audio**: In the Phone Simulator (`PhoneSimulatorPage.tsx`), `scheduleRecipientAutoAdvance(600)` was firing after only 600ms during `recipient-verify-choice`, immediately requesting `/enter-amount` while the recipient name and telephone number audio (`Use recipient 1.m4a` and verification readback) were still playing. This triggered `Amount prompt.mp3` / `Enter amount 4.mp3` concurrently over the recipient audio.
> 2. **Input Freeze on 10 Digits**: Because the simulator had prematurely jumped to `enter-amount`, its keypad logic enforced an 8-character limit (`if (digitsBuffer.length >= 8) return`), causing the simulator to freeze and drop keystrokes when the user tried typing their 10-digit number. Moreover, in `enter-recipient`, typing 10 digits lacked auto-submission, leaving callers stranded if they didn't press `#`.

- **Confirmed Decision 1**: Remove the rogue 600ms premature auto-advance timer on recipient verification. Callers must hear the full recipient KYC name and telephone number, with audio playback strictly serialized and exclusive.
- **Confirmed Decision 2**: Enable intelligent 10-digit auto-submission for keypad entry. When a caller finishes typing a valid 10-digit Ghanaian mobile number (`02X`, `05X`, `03X`), the simulator will automatically submit after a brief 600ms debounce (while preserving immediate submission when `#` is pressed).
- **Confirmed Decision 3**: Synchronize simulator step state with server responses and prevent 8-character input caps from blocking phone number inputs.

---

## 1. Overview & Core Concept

- **What It Does**: Fixes the interactive flow at **OP16 (Recipient Phone Entry)** and **OP19-OP24 (Recipient KYC Verification Choice)** in the Phone Simulator so that:
  1. Phone numbers can be entered seamlessly on the keypad (auto-submitting on 10 valid digits or upon pressing `#`).
  2. Only one audio track plays at a time (preventing the overlapping "amount audio + telephone numbers" cacophony).
  3. The caller is allowed to hear and confirm the recipient KYC details before advancing to amount entry, without dropping digits or freezing the UI.
- **Target Audience / Persona**: Users, QA testers, and developers testing the Mobile Money IVR in the interactive web phone simulator, ensuring exact 1:1 parity with the Africa's Talking live voice gateway.
- **Key Value**: Eliminates user confusion, prevents audio collisions, and provides a reliable, responsive dialing experience without frustrating freezes.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[OP10: Send Money Selected]
            │
            ▼
[OP16: Recipient Phone Entry]
  • Voice: "Kyerɛw recipient no fon nɔma a ɛyɛ digit du no, na mia hash..."
  • Display: "Recipient phone number: 0 / 10 digits"
  • Keypad Entry: User dials 10 digits (e.g. 0543546010)
  • Dynamic Display: Formats cleanly as "054 354 6010"
  • Auto-Submit: Auto-submits on 10 digits (or instant submit on #)
            │
            ▼
[OP19/OP20/OP24: Recipient Verification]
  • Audio 1: "Use recipient 1.m4a" (Akan Twi studio recording)
  • Audio 2: KYC readback: "Obi a woremane no no din ne [Name]. Ne phone nɔmba a ɛdi mũ ne [054...]"
  • Interaction: Wait for audio completion. Prompt shows: "Press 1 to confirm, 2 to re-enter, 0 to cancel"
  • User presses 1 (or says "pene so" / confirms)
            │
            ▼
[OP26/OP28: Transfer Amount Entry]
  • Audio: "Amount prompt.mp3" ("Yɛsrɛ wo, bɔ sika dodow no...")
  • Input: Enter amount in GHS followed by #
```

### Visual Feedback & Keypad Improvements
- **Live Digit Progress Counter**: Update the simulator display to clearly show `X / 10 digits entered` with an auto-submit countdown indicator when 10 digits are reached (`Submitting in 1s or press #`).
- **One-Click Quick Action**: A dedicated "Submit (#)" button appears beside the keypad digits when 10 digits are reached.
- **Audio Visualizer Cleanliness**: Ensure the acoustic visualizer and transcript turn tracker accurately reflect the active step without conflicting state logs.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Auto-Submit on 10 Digits vs. Strict '#' Requirement
- *Chosen Approach*: Auto-submit 600ms after the 10th digit is entered if it passes Ghana phone validation (`0[235][0-9]{8}`), while still honoring immediate submission if `#` is pressed earlier or immediately.
- *Why*: In web simulators, users regularly expect modern number fields to advance once all digits are typed. Strict `#`-only enforcement led users to believe the app had frozen.
- *Alternatives Considered*: Enforcing `#` only (caused the reported bug); immediate 0ms submit on 10th digit (can cause accidental submission if typing quickly). A 600ms debounce strikes the right balance.

### Decision 2: Elimination of `scheduleRecipientAutoAdvance`
- *Chosen Approach*: Remove the premature 600ms auto-advance timer in `PhoneSimulatorPage.tsx`. Recipient verification must require caller confirmation (pressing 1 or voice confirmation) OR an explicit, gentle timeout (e.g., 8–10 seconds after audio ends, matching telephony IVR standards).
- *Why*: Firing DTMF "1" after only 600ms while the recipient audio was still playing caused the amount audio to collide with the telephone number audio, and forcibly switched the step to `enter-amount` prematurely.
- *Alternatives Considered*: Increasing the timer to 3 seconds (still cuts off longer Ghanaian names and phone number readbacks).

### Decision 3: Audio Serialization & Mutex in `audioPlaybackController`
- *Chosen Approach*: Enforce that whenever a new prompt or sequence is requested, any existing audio is immediately halted (`stop()`), and sequence playback strictly awaits the completion of clip N before starting clip N+1.
- *Why*: Eliminates dual-audio overlap completely.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Interactive Phone Simulator UI                        │
│                                                                             │
│  ┌───────────────────────┐                 ┌─────────────────────────────┐  │
│  │ Keypad Input Handler  │                 │ Audio Playback Controller   │  │
│  │  - 10-digit buffer    │                 │  - Strict single audio node │  │
│  │  - 600ms debounce     │                 │  - Sequence serialization   │  │
│  │  - '#' key shortcut   │                 │  - Cancel-on-new-step       │  │
│  └──────────┬────────────┘                 └──────────────▲──────────────┘  │
│             │                                             │                 │
└─────────────┼─────────────────────────────────────────────┼─────────────────┘
              │ POST /api/simulator/verify-recipient         │ VoiceXML Audio
              ▼                                             │
┌───────────────────────────────────────────────────────────┴─────────────────┐
│                      Express Voice & Simulator Router                       │
│                                                                             │
│  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐  │
│  │  /api/simulator/enter-recipient │   │  /api/simulator/verify-recipient│  │
│  │   Returns OP16 prompt:          │   │   Validates 10-digit Ghana MSISDN│  │
│  │   "Enter recipient 2.mp3"       │   │   Performs KYC lookup           │  │
│  │   GetDigits finishOnKey="#"     │   │   Returns verification VoiceXML │  │
│  └─────────────────────────────────┘   └─────────────────────────────────┘  │
│                                                         │                   │
│                                                         ▼                   │
│                                        ┌─────────────────────────────────┐  │
│                                        │/recipient-verify-choice         │  │
│                                        │  Digit '1' -> /enter-amount     │  │
│                                        │  Digit '2' -> re-enter recipient│  │
│                                        │  Digit '0' -> cancel            │  │
│                                        └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Files to Update in Phase 3 Execution
1. `src/pages/dashboard/PhoneSimulatorPage.tsx`:
   - Remove rogue `scheduleRecipientAutoAdvance` that triggered after 600ms and collided audios.
   - Update `handleKeypadClick` in `enter-recipient` to automatically trigger verification when 10 valid Ghana digits are entered (with a 600ms debounce) or immediately upon `#`.
   - Ensure `curStep` input caps (`maxLength >= 8`) do not apply to phone number steps.
   - Ensure audio cancellation on step transitions so that prior speech or prompts stop immediately before new ones begin.
2. `src/audio/audioPlaybackController.ts`:
   - Harden sequence playback and ensure `speakText` keyword matcher does not confuse recipient verification sentences with amount prompts.
3. Verification:
   - Run `compile_applet` and test simulator phone number entry end-to-end to verify that OP16 advances cleanly without audio collisions or freezes.
