# Ɔkwankyerɛfo Pa — Unified 18-Step Audio Flow & State Orchestration

Production-grade audio orchestration engine and deterministic IVR state machine linking authentic Akan Twi studio recordings, dynamic neural speech synthesis, and real Mobile Money transactions across both the Phone Simulator and the Africa's Talking telephony gateway.

## User Review & Critical Decisions

> [!IMPORTANT]
> All core technical decisions have been reconciled and verified against physical disk assets and telco standards:
> - **Recipient Step Mapping**: Step 07 plays `Recipient confirm speech.m4a` (OP23 announcement) and Step 08 plays `Use recipient 1.m4a` (OP24), followed by dynamic TTS synthesis for subscriber name (OP20) and full 10-digit phone number (OP21). Keypad `1` confirms, `2` returns to Step 06.
> - **Amount Step Sequencing**: Step 09 plays `Amount prompt.m4a` (OP28: "Sika ahe na wopɛ sɛ womane?"), followed immediately by Step 10 `Enter amount 4.m4a` (OP26) collecting Cedis and Pesewas via DTMF/Voice.
> - **Unified 1:1 Parity**: The Phone Simulator browser interface and Africa's Talking VoiceXML webhook endpoints execute the identical 18-step state sequence with zero divergent branching.
> - **Handset Handoff (Zero-PIN)**: Step 13 plays `Authorize phone.aac` (OP48) and prompts the user on their phone display without capturing, transcribing, or storing PIN digits.

---

## 1. Overview & Core Concept

**Ɔkwankyerɛfo Pa** ("The Good Guide") is a voice accessibility layer designed for Ghanaian digital financial services (Mobile Money on MTN, Telecel, and AT). It empowers non-literate, visually impaired, and elderly citizens to conduct secure financial transactions using their mother tongue (Akan Twi and Ghanaian English) without struggling with complex USSD strings (`*170#`).

- **What It Does**: Provides an 18-step voice progression guiding callers from greeting to network selection, recipient verification, amount input, voice review, carrier USSD push, and receipt reference readback.
- **Target Audience**: Over 6 million non-literate and elderly mobile phone users in Ghana who depend on mobile money agents and are vulnerable to PIN fraud and overcharging.
- **Key Value**: 100% voice/DTMF accessible, real-time KYC recipient validation, transparent fee and amount readback, and strict Zero-PIN security.

---

## 2. User Experience & Visual Design

### Key User Flows (18-Step Journey)

1. **Step 01 — Default Welcome Audio (`OP01_INTRO`)**: Introductory branding chime and bilingual greeting (`/audio/Welcome_prompt_01.mp3`).
2. **Step 02 — Welcome 1 (`OP01`)**: Warm Akan Twi studio greeting (`Welcome 1 (2).m4a`).
3. **Step 03 — Language Selection (`OP02`)**: Prompts user for language (Keypad 1 for English, 2 for Twi; `Language selection.m4a`).
4. **Step 04 — Service Selection 2 (`OP07`)**: Select service category (`1` for Mobile Money; `Service selection 2.m4a`).
5. **Step 05 — MTN Menu 1 (`OP09`)**: Select transaction action (`1` for Send Money; `MTN menu 1.m4a`).
6. **Step 06 — Enter Recipient 2 (`OP16`)**: Prompt to enter 10-digit mobile number followed by `#` (`Enter recipient 2.m4a`).
7. **Step 07 — Recipient Found (`OP23`)**: Confirms network match (`Recipient confirm speech.m4a`).
8. **Step 08 — Recipient 1 + Dynamic TTS (`OP24 + OP20 + OP21`)**: Studio prompt (`Use recipient 1.m4a`) combined with dynamic neural TTS speaking verified subscriber name and full 10-digit phone number.
9. **Step 09 — Amount Prompt (`OP28`)**: Asks how much to send: *"Sika ahe na wopɛ sɛ womane?"* (`Amount prompt.m4a`).
10. **Step 10 — Enter Amount 4 (`OP26`)**: Collects Cedi amount followed by `#` (`Enter amount 4.m4a`).
11. **Step 11 — Dynamic TTS + Amount Readback (`OP29`)**: Dynamic neural TTS reads amount in Cedis/Pesewas, followed by studio verification (`Amount readback 2.m4a`).
12. **Step 12 — Confirm Speech (`OP37 / OP39`)**: Final voice/keypad confirmation (`1` to proceed, `2` to cancel; `Confirm speech.m4a`).
13. **Step 13 — Payment Audio / Handset Handoff (`OP48`)**: Zero-PIN security handoff: *"Pene so wɔ wo fon so na sika no nkɔ. Yɛremmisa wo PIN wɔ fon frɛ yi so da"* (`Authorize phone.aac`). Handset USSD push overlay appears.
14. **Step 14 — Submitted (`OP45`)**: Dispatches transaction saga to telco ledger (`Submitted.aac`).
15. **Step 15 — Transaction Status (`OP50`)**: Carrier status polling with hold audio (`Check final status.aac`).
16. **Step 16 — Success Audio (`OP53`)**: Celebratory completion audio (`SUCCESS.aac` / `SUCCESS SENT.aac`).
17. **Step 17 — Dynamic TTS Reference (`OP52`)**: Dynamic neural TTS reads out transaction reference ID letter-by-letter and digit-by-digit (e.g. *"O K P - 7 8 2 9 1 4"*).
18. **Step 18 — Keep Reference & Exit (`OP54 ➔ OP56 ➔ OP77`)**: Sequential chain advising user to save reference, checking for additional transactions, and graceful sign-off.

### Visual Identity & Theme (Phone Simulator)

- **Color Tokens**: Forest green accents (`#047857`), warm Ghanaian gold (`#D97706`), deep slate background (`#0F172A`), and clear contrast indicators.
- **Zero-Pill Discipline**: Metadata rendered as crisp unboxed typography separated by middle dots (`·`) or subtle borders.
- **Turn-Taking Visualizer**: Acoustic visualizer ring pulses dynamically during user speech and locks into muted status while system audio is actively speaking, preventing self-echo feedback.
- **Interactive 18-Step Tracker**: Collapsible grid showing all 18 steps with clear state labels, active step highlight, prompt IDs, and direct preview audio play buttons.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct 18-Step Pipeline vs. Generic Menu Loop**
  - *Chosen Approach*: Implement a first-class 18-step sequential pipeline with explicit stage IDs and automated progression hooks.
  - *Why*: Eliminates accidental step jumping, prevents state desynchronization between audio playback and input capture, and provides complete predictability for both automated tests and end users.
  - *Alternatives Considered*: Pure declarative state machine without explicit linear index; rejected because IVR telephony gateways require strict sequential fallbacks when user inputs are batched or delayed.

- **Decision 2: Hybrid Studio Audio + Neural TTS Slot Injection**
  - *Chosen Approach*: Use authentic human Akan Twi studio recordings for all static prompts (OP01-OP19, OP22-OP28, OP30-OP51, OP53-OP94), and dynamically synthesize only variable user slots (subscriber names, 10-digit numbers, amounts, and transaction references) via server-side Piper/OpenAI/Gemini TTS.
  - *Why*: Human voice recordings deliver cultural warmth, natural tonality, and high intelligibility for older callers, while dynamic neural TTS ensures real transaction data is never replaced with static placeholders.

- **Decision 3: Zero-PIN Protocol Enforcement**
  - *Chosen Approach*: The application and telephony gateway strictly forbid voice-based PIN entry. Step 13 triggers an external handset prompt (or interactive simulator USSD modal) while muting speech capture.
  - *Why*: Prevents social engineering, eavesdropping, telco regulatory violation (Bank of Ghana / NCA guidelines), and acoustic side-channel leaks.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ƆKWANKYERƐFO PA ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
      ┌────────────────────────────┴────────────────────────────┐
      ▼                                                         ▼
[Phone Simulator (Browser)]                        [Africa's Talking IVR]
  - audioPlaybackController.ts                       - voiceRoutes.ts (VoiceXML)
  - continuousVoiceCapture.ts                        - webhookGuard.ts
  - PhoneSimulatorPage.tsx                           - HTTP 206 Byte Streaming
      │                                                         │
      └────────────────────────────┬────────────────────────────┘
                                   ▼
                [Canonical Registry & Dynamic Builder]
                  - canonicalRegistry.ts (OP01-OP94)
                  - dynamicPromptBuilder.ts (OP20, OP21, OP29, OP52)
                  - twiSequentialAudioFlow.ts (18-step sequential map)
                  - recordingRegistry.ts (Asset resolution & transcoding)
                                   ▼
                [Transaction Saga & Carrier Engine]
                  - paymentSaga.ts (MTN / Telecel API)
                  - RecipientResolver.ts (KYC name directory)
                  - durableTransactionStore.ts (Idempotent ledger)
```

### Components to Update

1. **`src/audio/twiSequentialAudioFlow.ts`**:
   - Ensure all 18 step definitions (`default_welcome`, `welcome_1`, `language_selection`, `service_selection_2`, `mtn_menu_1`, `enter_recipient_2`, `recipient_confirm_speech`, `use_recipient_1`, `amount_prompt_3`, `enter_amount_4`, `amount_readback_2`, `confirm_speech`, `payment_audio`, `submitted`, `transaction_status`, `success_audio`, `dynamic_tts_reference`, `completion_exit`) are strictly typed, verified against physical file paths, and configured with sequential pointers.

2. **`src/audio/canonicalRegistry.ts`**:
   - Verify that `STATE_TO_CANONICAL_PROMPT_ID` and `resolveCanonicalAudioUrl` map every state in the 18-step progression directly to the canonical studio recording or dynamic TTS handler.

3. **`src/routes/voiceRoutes.ts`**:
   - Update Africa's Talking VoiceXML generation to follow the exact 18-step progression.
   - Maintain `<GetDigits>` with barge-in support and `<Play>` elements with full public URL streaming.

4. **`src/pages/dashboard/PhoneSimulatorPage.tsx`**:
   - Connect the simulator's sequential auto-play and transition hooks to the 18-step sequence.
   - Provide visual feedback for each of the 18 steps with prompt labels, audio sources, keypad hints, and audio play buttons.

5. **`tests/canonicalAcceptanceTests.test.ts`**:
   - Add verification test suites checking that all 18 audio steps resolve to valid physical paths and dynamic templates without regression.

---

## 5. Verification & Acceptance Criteria

- **Physical File Existence**: Every audio file in the 18-step map must physically exist on disk and resolve without 404 or path traversal errors.
- **Audio Transcoding Parity**: In iframe / browser / telephony environments where AAC/M4A is restricted, `.mp3` transcoding mirrors are automatically served.
- **Turn-Taking Discipline**: The simulator microphone is automatically muted during prompt playback and enabled only after prompt completion.
- **Zero-PIN Security**: Step 13 triggers the handset authorization banner and never attempts to collect, transcribe, or log a Mobile Money PIN.
- **Compilation & Test Pass**: `npm run build`, `vitest run tests/canonicalAcceptanceTests.test.ts`, and `compile_applet` must succeed cleanly with zero TypeScript errors.
