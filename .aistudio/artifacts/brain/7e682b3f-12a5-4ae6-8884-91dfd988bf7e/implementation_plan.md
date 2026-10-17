# IVR Flow Progression, Pin Handoff Audio & Master Audio Normalization

Resolve the recipient and amount verification stalls in the Ɔkwankyerɛfo Pa IVR simulator, connect the Pin Handoff audio (`Pin Handoff.m4a` / OP40) immediately following caller amount confirmation, ensure the microphone remains active and unmuted for seamless voice continuity, and apply high-gain audio normalization across all voice prompts.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following critical decisions were confirmed during interactive clarification and user feedback, and govern this implementation:

- **Confirmed Decision 1 (PIN Audio Selection)**: Directly map and play the Pin Handoff prompt (`Audio_files/Pin Handoff.m4a` / OP40) following caller amount confirmation. This prompt instructs the caller on entering their secret PIN securely.
- **Confirmed Decision 2 (Amount to PIN Transition)**: Transition directly from Safe Confirmation readback (OP36) into the PIN prompt when the caller inputs the confirmation key (Press 1 / "Aane"), eliminating dead-end freezes, infinite loops, and multi-digit timeout stalls.
- **Confirmed Decision 3 (Microphone Unmuted Policy)**: In accordance with user instruction, the microphone will **not** be muted during the Pin Handoff or PIN flow. The microphone remains active and unmuted so callers can continue speaking, entering PIN digits via keypad or voice, and maintaining continuous two-way communication.
- **Confirmed Decision 4 (Audio Normalization & Volume Boost)**: Implement maximum clean volume boost with Web Audio API `GainNode` amplification ($2.2\times$ gain / $+6.8\text{ dB}$) paired with an inline `DynamicsCompressorNode` limiter across all Twi studio recordings, synthesized TTS streams, and simulator audio playback, guaranteeing crystal-clear, loud, and unclipped output.

---

## 1. Overview & Core Concept

- **What It Does**: Fixes the IVR state machine, callback routing, and telephony webhook handlers so callers smoothly progress from Recipient Verification (OP24) to Amount Entry (OP28), Amount Readback & Confirmation (OP36), and Pin Handoff (OP40) without hanging or getting caught in fallback loops. Applies an active Web Audio amplification pipeline so every `.m4a`, `.aac`, and synthesized audio prompt plays at loud, legible volume on both desktop and mobile speakers, while keeping the microphone fully active.
- **Target Audience / Persona**: Ghanaian Mobile Money subscribers (especially visually impaired and elderly users navigating in Akan Twi) conducting voice transfers, as well as operators and QA testers in the interactive phone simulator.
- **Key Value**: Delivers zero-deadlock IVR progression across all 18 canonical steps, supports dual voice/keypad PIN entry without mic muting interruption, and guarantees acoustic legibility with active volume normalization.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[Recipient Entry: OP16] ──(10 Digits + #)──▶ [Recipient Verification: OP24]
                                                       │
                                              (Press 1 / "Aane")
                                                       │
                                                       ▼
[Safe Confirmation: OP36] ◀──(Amount + #)── [Amount Prompt: OP28]
         │
 (Press 1 / "Aane")
         │
         ▼
[Pin Handoff: OP40 (Pin Handoff.m4a)]
         │
   [Handset Screen & Audio Prompt Active]
   [Microphone Unmuted & Continuous]
         │
    (PIN Entered via Keypad or Spoken)
         │
         ▼
[Payment Submission & Success: OP45 / OP52]
```

1. **Recipient Verification (OP24)**:
   - Simulator resolves recipient phone (e.g. `0543546010`) and plays OP24 ("Yoo. Yɛde saa recipient yi bedi dwuma").
   - Caller presses `1` or speaks "Yoo" / "Aane".
   - System immediately routes to `/verify-recipient` or `/recipient-verify-choice`, recognizes confirmation digit `1`, and advances to Amount Prompt (OP28) without stalling or re-requesting phone digits.
2. **Amount Entry & Verification (OP28 – OP36)**:
   - Simulator prompts for amount (OP28). Caller enters amount (e.g. `50#`).
   - System validates amount, generates dynamic safe readback (OP36: "Woapaw sɛ wobɛmane GH₵ 50.00 kɔ ma... Sɛ wopene so a mia baako"), and waits for confirmation.
   - Caller presses `1` (or speaks "Aane").
3. **Pin Handoff Audio (OP40) & Continuous Microphone**:
   - System immediately plays `Pin Handoff.m4a` (OP40): "Wo transaction no ayɛ krado sɛ wode bɛma ho kwan...".
   - The handset displays the PIN entry interface with masked dots (`● ● ● ●`).
   - The microphone **remains unmuted and active** (`isMicMuted = false`, continuous audio engine active) allowing the user full flexibility to enter PIN on keypad or proceed with continuous voice interaction.
   - Caller enters their 4-digit PIN to trigger instant submission.
4. **Volume Control & Audio Normalization**:
   - Master volume slider on the simulator is bound to the Web Audio `GainNode` set to $2.2\times$ baseline amplification with dynamic compression limiter, ensuring quiet Akan recordings match broadcast-grade loudness without distortion.

### Visual Identity & Theme (Utilitarian Telecom Console)
- **Palette**: Dark slate foundation (`#0F172A`), structural surfaces (`#1E293B`), crisp emerald accents (`#10B981`) for active call state, warm amber (`#F59E0B`) for DTMF digit feedback, and high-contrast text (`#F8FAFC`).
- **Typography**: Display headings in `Plus Jakarta Sans` / `Outfit`, data values and phone numbers strictly in tabular monospace (`JetBrains Mono`, `tabular-nums`).
- **Discipline**: No decorative pill badges on status cards; clean inline metadata with bullet separators (`·`); clear focus rings and high-contrast UI controls.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Direct Mapping to OP40 (`Pin Handoff.m4a`) Following Amount Confirmation
- **Chosen Approach**: Directly transition from `safe-confirmation` (Press 1) to `pin-handoff` playing `Audio_files/Pin Handoff.m4a` (OP40).
- **Why**: Eliminates unnecessary intermediary loops, aligns with standard Ghana Mobile Money USSD push security patterns, and matches the user's explicit instruction.
- **Alternatives Considered**: Direct jump to unguided PIN capture without audio notice; rejected because callers require spoken guidance before entering PIN.

### Decision 2: Elimination of Recipient & Amount Verification Stacking
- **Chosen Approach**:
  1. In `src/routes/voiceRoutes.ts`: Update `/verify-recipient` so if incoming DTMF is `"1"` (or speech confirmation `"aane"`/`"yoo"`), and the session already has a resolved recipient, it cleanly transitions to `/enter-amount` instead of failing phone regex.
  2. In `PhoneSimulatorPage.tsx`: Ensure DTMF button `1` click and spoken recognition immediately submit single-digit confirmation without waiting for multi-digit 10-digit buffers or timeouts.
- **Why**: Fixes the root cause of the deadlock where pressing `1` was evaluated as an invalid 1-digit phone number.

### Decision 3: Microphone Kept Unmuted During Pin Handoff
- **Chosen Approach**: Keep the microphone active (`isMicMuted = false`) during Pin Handoff and PIN verification.
- **Why**: Directly implements user feedback; enables continuous natural interaction, allows users with visual or motor impairments to speak their PIN or confirm verbally, and prevents abrupt microphone muting.

### Decision 4: Web Audio Gain Normalization Engine
- **Chosen Approach**: Route the shared HTML5 `<audio>` element through an `AudioContext` with `GainNode` set to $2.2\times$ baseline amplification, coupled to a `DynamicsCompressorNode` (`threshold: -18dB`, `knee: 30`, `ratio: 8:1`, `attack: 0.003s`, `release: 0.25s`).
- **Why**: Guarantees audio files with low recorded amplitude (e.g. legacy field recordings) are boosted to match modern loud speaker output without digital clipping.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             PhoneSimulatorPage (React)                           │
│                                                                                  │
│   ┌───────────────────────┐    ┌────────────────────────┐    ┌─────────────────┐ │
│   │ DTMF & Voice Input    │    │ Continuous Audio Flow  │    │ Audio Gain &    │ │
│   │ (Mic Kept Unmuted)    │───▶│ State Orchestrator     │───▶│ Dynamics Engine │ │
│   └───────────┬───────────┘    └───────────┬────────────┘    └────────┬────────┘ │
└───────────────┼────────────────────────────┼──────────────────────────┼──────────┘
                │                            │                          │
                ▼                            ▼                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Express Backend (/api)                               │
│                                                                                  │
│   ┌──────────────────────────┐                  ┌────────────────────────────┐   │
│   │ POST /verify-recipient   │─────────────────▶│ GET /audio/Pin Handoff.m4a │   │
│   │ • Accepts '1' to confirm │                  │ • Transcoded MP3 with +6dB │   │
│   │ • Transitions to Amount  │                  │ • OP40 Canonical Registry  │   │
│   └────────────┬─────────────┘                  └─────────────▲──────────────┘   │
│                │                                              │                  │
│                ▼                                              │                  │
│   ┌──────────────────────────┐                  ┌─────────────┴──────────────┐   │
│   │ POST /safe-outcome       │─────────────────▶│ POST /pin-handoff          │   │
│   │ • Validates Amount       │                  │ • Sets PIN_PENDING State   │   │
│   │ • Press 1 triggers PIN   │                  │ • Mic Kept Live & Active   │   │
│   └──────────────────────────┘                  └────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Component & Handler Implementation Plan

1. **`src/routes/voiceRoutes.ts`**:
   - `/verify-recipient`: Detect if `rawDigits === "1"` when `session.recipientPhone` or `session.state === "RECIPIENT_VERIFIED"` exists; redirect directly to `/enter-amount`.
   - `/recipient-verify-choice`: Support `"1"` to redirect to `/enter-amount` immediately.
   - `/safe-outcome`: On `dtmf === "1"`, redirect directly to `/pin-handoff?sessionId=...&lang=...` instead of `/enter-pin`.
   - `/pin-handoff`: Play `Audio_files/Pin Handoff.m4a` via `<Play url="${baseUrl}/audio/Pin%20Handoff.mp3"/>`, set canonical prompt `OP40`, and serve `<GetDigits timeout="25" finishOnKey="#" numDigits="4" callbackUrl="${baseUrl}/verify-pin">`.

2. **`src/pages/dashboard/PhoneSimulatorPage.tsx`**:
   - Fix DTMF keypad and speech handlers during `recipient-verify-choice` / `verify-recipient` so pressing `1` immediately calls `/api/simulator/recipient-verify-choice` with `dtmfDigits: "1"`.
   - In `startPinAuthorizationFlow`: Play `Pin Handoff.m4a` / OP40 directly via `audioPlaybackController.play()`, keep `isMicMuted = false` and `setZeroPinMuted(false)` (microphone stays active), and display the PIN entry screen.
   - Master volume slider wired to `audioPlaybackController.setVolumeMultiplier()` with $2.2\times$ default.

3. **`src/audio/audioPlaybackController.ts` & `src/audio/streaming.ts`**:
   - Set baseline volume multiplier to $2.2\times$ in `AudioPlaybackController`.
   - Ensure `streaming.ts` on-the-fly MP3 transcoding uses `-filter:a volume=2.2` to normalize pre-recorded files at the telephony gateway level.

4. **Verification**:
   - Execute test suite (`npm test`) and run `compile_applet` to ensure zero compilation or typing regressions.
