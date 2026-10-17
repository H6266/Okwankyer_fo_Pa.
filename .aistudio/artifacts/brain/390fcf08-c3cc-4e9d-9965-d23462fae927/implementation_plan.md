# Ɔkwankyerɛfo Pa Voice MoMo Telephony & Simulator Stabilization Plan

A comprehensive, order-dependent plan to fix audio playback bleed, recipient verification and dynamic readback, step synchronization between IVR and Central Brain, spoken and keypad PIN capture, and API response reliability without regressions.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The fixes are structured in strict dependency order across four phases. Each phase builds upon the previous one to ensure that acoustic echo cancellation, IVR state transitions, and financial security guards work in harmony.

- **Audio Playback Gate**: Half-duplex gating will ensure the microphone is 100% hardware-muted while audio is playing (both pre-recorded studio files and dynamic neural TTS) and only turns ON when the IVR has finished speaking and is waiting for input.
- **Dynamic KYC Readback**: `/verify-recipient` will play the introductory audio clip (*"Yoo..."*) immediately followed by dynamic speech synthesis of the KYC recipient's name and full phone number, giving the caller clear confirmation options (*"1 to confirm, 2 to re-enter"*).
- **Zero-PIN Safety Exception**: `pinSafety.ts` will allowlist the dedicated `"enter-pin"` and `"verify-pin"` states so that valid 4-digit PINs spoken by the user are not discarded as accidental credential leaks.
- **Asynchronous Payment Saga**: The `/verify-pin` endpoint will complete the transaction state machine and return the success receipt VoiceXML immediately, dispatching external telco sandbox calls asynchronously to prevent HTTP hanging.

---

## 1. Overview & Core Concept

**Ɔkwankyerɛfo Pa** is a voice accessibility service for digital financial services (Mobile Money) in Ghana. The system guides visually impaired, elderly, or semi-literate users through mobile money transactions using natural Akan Twi and Ghanaian English speech and keypad DTMF.

This plan addresses recent operational friction in the phone simulator:
1. Microphone acoustic bleed during IVR playback.
2. Silent failure and missing KYC readback during recipient verification.
3. Desynchronization between the IVR session and the Central Reasoning Brain.
4. PIN disappearance and lack of API response during authorization.

---

## 2. Technical Architecture & Orderly Fix Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CALLER AUDIO INTERFACE                          │
│  [ Microphone Stream ] ──(Half-Duplex Gate)──> [ Web Speech / Whisper ]│
│                                                       │                │
│                                              Clean Utterance           │
│                                                       ▼                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    PHONESIMULATORPAGE.TSX                         │  │
│  │  1. Step-Aware Router (Detects Active Step: Recipient / PIN)     │  │
│  │  2. Keypad DTMF Manager (Buffers 4 Digits for PIN, 10 for Phone) │  │
│  │  3. Brain Draft Synchronizer (Mirrors Verified Backend Slots)     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                               │                                        │
│                        Dispatched Webhook                              │
│                               ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      VOICE ROUTES & STATE                        │  │
│  │  /verify-recipient -> Chains Intro Audio + Dynamic KYC Readback   │  │
│  │  /enter-pin        -> Sets 4-Digit Expectation                   │  │
│  │  /verify-pin       -> Transitions State & Dispatches Saga Async  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                               │                                        │
│                        VoiceXML Response                               │
│                               ▼                                        │
│  [ Audio Controller ] ──> Play Intro Clip ──> Synthesize Dynamic Readback│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Order-Dependent Execution Plan

### Phase 1: Audio Playback & Microphone Half-Duplex Gate
*Target Files: `src/audio/audioPlaybackController.ts`, `src/audio/continuousAudioEngine.ts`, `src/pages/dashboard/PhoneSimulatorPage.tsx`*

- **Fix Audio State Race Condition**:
  - In `audioPlaybackController.play()`, do not emit a premature `isPlaying: false` event when switching clips. Maintain `isPlaying: true` until the entire audio sequence has concluded.
  - In `audioPlaybackController.playSequence()`, ensure `activeText` is maintained across all sequence clips so the acoustic echo filter (`isAcousticSystemEcho`) can compare incoming microphone audio against the prompt text.
- **Enforce Strict Half-Duplex Recording**:
  - Ensure `ContinuousAudioEngine` discards any Web Speech API results buffered during playback, and only opens the microphone gate 200ms after the audio stream has physically stopped.

### Phase 2: Recipient Verification & Dynamic KYC Readback (`OP24`)
*Target Files: `src/pages/dashboard/PhoneSimulatorPage.tsx`, `src/domain/stepRegistry.ts`, `src/routes/voiceRoutes.ts`*

- **Correct Step Registry & OLED Display**:
  - In `STEP_OPTIONS_MAP` and `src/domain/stepRegistry.ts`, update `verify-recipient` from `"10-digit number followed by #"` to `"1=Confirm Recipient, 2=Re-enter Number, 0=Exit"`.
  - In `PhoneSimulatorPage.tsx`, update the handset OLED screen check so that `verify-recipient` displays the recipient confirmation view (showing the recipient's name) rather than the 10-digit number entry prompt.
- **Preserve Dynamic KYC Readback in `executeVoiceXml`**:
  - Prevent line 683 from overwriting `promptText` with generic audio catalog labels when `<Say>` contains dynamic recipient or amount details.
  - Chain playback so that if an intro audio clip (such as `Use recipient 1.m4a`) is present alongside dynamic `<Say>` text, the system plays the intro clip and immediately synthesizes the KYC readback without silence.
- **Synchronize Central Brain Draft**:
  - When `/verify-recipient` successfully resolves a recipient, update `brainDraftRef.current.slots.recipient` with the verified name and phone number. When the user subsequently enters or speaks an amount (e.g. *"100"*), the Brain will recognize that the recipient is already known and will not ask for the phone number again.

### Phase 3: PIN Safety Guard & Keypad Stabilization
*Target Files: `src/domain/pinSafety.ts`, `src/pages/dashboard/PhoneSimulatorPage.tsx`, `src/audio/audioPlaybackController.ts`*

- **Allowlist PIN Steps in Safety Gate**:
  - In `src/domain/pinSafety.ts`, update `shouldDiscardSensitiveSpeech` to explicitly allowlist `"enter-pin"`, `"verify-pin"`, and `"pin-handoff"` so that spoken PINs during authorization steps are processed rather than discarded.
- **Prevent Keypad Swallowing & Lockup**:
  - In `handleKeypadPress`, ensure that transitioning from `safe-confirmation` to `enter-pin` does not wipe subsequent digits if the user immediately begins entering their PIN.
  - Reset `digitsBuffer` whenever entering `enter-pin` and if a PIN verification attempt fails, allowing the caller to retry without keypad lockup.
- **Fix PIN Audio Asset Path**:
  - In `audioPlaybackController.ts`, correct the fallback path for PIN handoff audio to reference valid existing repository audio files (`/Audio_files/Twi/6.PIN & Security/Pin block.aac` or `/Audio_files/Pin Handoff.m4a`), preventing 404 playback errors.

### Phase 4: Decouple Payment Saga Execution in `/verify-pin`
*Target Files: `src/routes/voiceRoutes.ts`*

- **Non-Blocking Background Saga Execution**:
  - In `ivrRouter.all("/verify-pin")`, transition the session to `COMPLETED` and generate the success VoiceXML receipt immediately.
  - Dispatch `paymentSaga.executeConfirmedTransferSaga` in the background (asynchronous promise without blocking Express response) with a strict 4-second timeout to prevent external telco network timeouts from hanging the caller session.

---

## 4. Verification & Testing Strategy

1. **Compilation & Syntax**: Run `compile_applet` to verify clean build without TypeScript or bundling errors.
2. **End-to-End Simulation in English & Twi**:
   - Welcome Gate -> Select Twi (2) -> MoMo (1) -> MTN (1) -> Send Money (1).
   - Recipient Entry: Enter `0553434232#`.
   - Verify that the system plays `"Yoo..."` and speaks the recipient KYC name (`Kwame Boateng`), showing options `1=Confirm, 2=Re-enter`.
   - Confirm with `1` -> Amount Entry: Enter `50#`.
   - Verify Safe Confirmation readback -> Confirm with `1`.
   - PIN Entry: Type `1234` on keypad and test spoken PIN.
   - Verify that PIN dots display, `/verify-pin` responds promptly, and the transaction completion receipt is read back.
3. **Microphone Gate Check**: Ensure no audio playback echoes or transcribes into the chat timeline while IVR prompts are speaking.
