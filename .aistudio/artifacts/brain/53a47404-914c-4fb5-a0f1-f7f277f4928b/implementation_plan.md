# Ɔkwankyerɛfo Pa — Unified 18-Step Audio Flow & State Orchestration

A production-grade audio orchestration engine and deterministic IVR state machine linking authentic Akan Twi studio recordings, dynamic neural speech synthesis, and real Mobile Money transactions across both the Phone Simulator and the Africa's Talking telephony gateway.

## User Review & Critical Decisions

> [!IMPORTANT]
> The clarifying answers provided have been integrated into this architecture:
> - **Recipient Step Mapping**: Step 07 maps to `Recipient confirm speech.m4a` and Step 08 maps to `Use recipient 1.m4a`, followed by dynamic TTS slot synthesis (OP20 name and OP21 full 10-digit number).
> - **Amount Step Sequencing**: Step 09 plays `Amount prompt.m4a` ("Sika ahe na wopɛ sɛ womane?") followed by Step 10 `Enter amount 4.m4a`, collecting and validating Cedis and Pesewas.
> - **Unified 1:1 Parity**: The exact same 18-step progression, audio assets, error loops, and completion handlers govern both the interactive browser simulator and Africa's Talking VoiceXML webhook responses.

---

## 1. Overview & Core Concept

**Ɔkwankyerɛfo Pa** ("The Good Guide") acts as an accessible voice gateway for Ghanaian digital financial services (Mobile Money on MTN, Telecel, and AT). Non-literate, elderly, and visually impaired users navigate transactions via authentic human voice prompts in Akan Twi and English without navigating complex USSD menus (*170#).

This specification guarantees:
1. **Zero Unmapped Steps**: All 18 steps resolve to verified physical audio recordings in `Audio_files/` or approved dynamic neural TTS templates.
2. **Dynamic Slot Integrity**: Recipient names, full 10-digit phone numbers, amounts in Cedis & Pesewas, and transaction references are synthesized dynamically using exact session variables—never hard-coded placeholders or brackets.
3. **Zero-PIN Security**: Authorization prompts (Step 13) strictly hand off to the official SIM/USSD handset screen without collecting PINs over voice.

---

## 2. The 18-Step Canonical Audio Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       18-STEP CANONICAL AUDIO FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘
  [01] Default Welcome Audio (/audio/Welcome_prompt_01.mp3)
       │ (Finished playback)
  [02] Welcome 1 (Welcome 1 (2).m4a)
       │
  [03] Language Selection (Language selection.m4a) ──► Keypad 1 (EN) / 2 (TWI)
       │ (Language locked for session)
  [04] Service Selection 2 (Service selection 2.m4a) ──► 1 = Mobile Money
       │
  [05] MTN Menu 1 (MTN menu 1.m4a) ──► 1 = Send Money
       │
  [06] Enter Recipient 2 (Enter recipient 2.m4a) ──► 10 Digits + #
       │ (Validated: Prefix, 10 digits, KYC resolution)
  [07] Recipient 5 (Recipient confirm speech.m4a)
       │
  [08] Recipient 1 (Use recipient 1.m4a) ──► Dynamic TTS (Name + 10 Digits)
       │ (1 = Confirm, 2 = Reject/Return to Step 06)
  [09] Enter Amount 3 (Amount prompt.m4a)
       │
  [10] Enter Amount 4 (Enter amount 4.m4a) ──► Amount in Cedis + # (* for Pesewas)
       │ (Validated against wallet tier limits)
  [11] Dynamic TTS (Amount Readback) ──► Amount readback 2.m4a
       │
  [12] Confirm Speech (Confirm speech.m4a) ──► 1 = Proceed, 2 = Reject
       │
  [13] Payment Audio (Authorize phone.aac) ──► USSD Push / Handset Handoff
       │ (Zero-PIN: No PIN captured in audio or app)
  [14] Submitted (Submitted.aac / Submitted.m4a)
       │
  [15] Transaction Status (Check final status.aac) ──► Carrier Status Polling
       │
  [16] Success Audio (SUCCESS.aac / SUCCESS SENT.aac)
       │ (Wait until recording completes)
  [17] Dynamic TTS — Reference Readback (OP52: "OKP-XXXXXX" letter by letter)
       │
  [18] Keep Reference (Keep reference.aac) 
       ──► Anything Else (ANYTHING ELSE.aac) 
       ──► Exit / Another Transaction
```

---

## 3. Detailed Step-by-Step Asset & Behavior Map

| Step # | Flow Name | Primary Asset Location | Canonical ID | Fallback / Dynamic Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **01** | Default Welcome Audio | `/audio/Welcome_prompt_01.mp3` | `OP01_INTRO` | Introductory branding tone & general greeting |
| **02** | Welcome 1 | `Audio_files/Twi/1.Welcome & Session Start/Welcome 1 (2).m4a` | `OP01` | Akan Twi studio welcome greeting |
| **03** | Language Selection | `Audio_files/Twi/1.Welcome & Session Start/Language selection.m4a` | `OP02` | Locks session language: `1` for English, `2` for Twi |
| **04** | Service Selection 2 | `Audio_files/Twi/2.Main Service Navigation/Service selection 2.m4a` | `OP07` | Menu options: `1` Mobile Money, `2` Other, `0` Exit |
| **05** | MTN Menu 1 | `Audio_files/Twi/2.Main Service Navigation/MTN menu 1.m4a` | `OP09` | Transfers menu: `1` Send Money |
| **06** | Enter Recipient 2 | `Audio_files/Twi/3.Recipient Entry & Verification/Enter recipient 2.m4a` | `OP16` | Awaits 10 digits followed by `#`; validates format |
| **07** | Recipient 5 | `Audio_files/Twi/3.Recipient Entry & Verification/Recipient confirm speech.m4a` | `OP23` | Announces single-recipient selection |
| **08** | Recipient 1 + Dynamic TTS | `Audio_files/Twi/3.Recipient Entry & Verification/Use recipient 1.m4a` | `OP24` + `OP20` + `OP21` | Plays studio confirmation prompt, then TTS speaks verified subscriber name and full 10 digits; `2` returns to 06 |
| **09** | Enter Amount 3 | `Audio_files/Twi/4.Amount Entry & Verification/Amount prompt.m4a` | `OP28` | "Sika ahe na wopɛ sɛ womane?" (How much do you want to send?) |
| **10** | Enter Amount 4 | `Audio_files/Twi/4.Amount Entry & Verification/Enter amount 4.m4a` | `OP26` | Keypad/speech collection for Cedis followed by `#` |
| **11** | Dynamic TTS + Amount Readback 2 | Neural TTS + `Audio_files/Twi/4.Amount Entry & Verification/Amount readback 2.m4a` | `OP29` | TTS speaks exact parsed amount (`X Cedis Y Pesewas`), then plays studio readback verification |
| **12** | Confirm Speech | `Audio_files/Twi/5.Transaction Confirmation/Confirm speech.m4a` | `OP37` / `OP39` | User confirms (`1` / "aane") or cancels (`2` / "dabi") |
| **13** | Payment Audio | `Audio_files/Twi/7.Transaction Processing/Authorize phone.aac` | `OP48` | Zero-PIN security advisory: prompts user to authorize prompt on mobile handset |
| **14** | Submitted | `Audio_files/Twi/7.Transaction Processing/Submitted.aac` | `OP45` | Confirms payment saga dispatched to carrier ledger |
| **15** | Transaction Status | `Audio_files/Twi/7.Transaction Processing/Check final status.aac` | `OP50` | Polls carrier status; routes to retry or decline if rejected |
| **16** | Success Audio | `Audio_files/Twi/8.Success & Completion/SUCCESS.aac` | `OP53` | Plays official celebratory success completion audio |
| **17** | Dynamic TTS — Reference | Neural TTS (`/api/audio/prompt-tts/:lang/OP52`) | `OP52` | Reads exact carrier reference (e.g. `O K P - 7 8 2 9 1 4`) |
| **18** | Keep Reference → Anything Else → Exit | `Keep reference.aac` ➔ `ANYTHING ELSE.aac` ➔ `Exit.aac` | `OP54` ➔ `OP56` ➔ `OP77` | Sequential completion chain: SMS records guidance, additional actions, graceful sign-off |

---

## 4. Technical Architecture & File Modifications

```
┌───────────────────────────────────────────────────────────────────────────┐
│                      ƆKWANKYERƐFO PA ARCHITECTURE                         │
└───────────────────────────────────────────────────────────────────────────┘
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

### Components to Update:
1. `src/audio/twiSequentialAudioFlow.ts`:
   - Expand the 14-step flow to the full authoritative 18-step sequence (`welcome_intro`, `welcome_1`, `language_selection`, `service_selection_2`, `mtn_menu_1`, `enter_recipient_2`, `recipient_confirm_speech`, `use_recipient_tts`, `amount_prompt_3`, `enter_amount_4`, `amount_readback_tts`, `confirm_speech`, `payment_authorize`, `submitted`, `transaction_status`, `success_audio`, `dynamic_reference_tts`, `completion_exit`).
2. `src/audio/canonicalRegistry.ts`:
   - Ensure `resolveCanonicalAudioUrl` and `STATE_TO_CANONICAL_PROMPT_ID` map all 18 states directly to the identified physical recordings and TTS handlers.
3. `src/routes/voiceRoutes.ts`:
   - Update Africa's Talking VoiceXML generation to follow the exact 18-step progression.
   - Maintain `<GetDigits>` with barge-in support for prompt menus and speech fallback.
4. `src/pages/dashboard/PhoneSimulatorPage.tsx`:
   - Connect the simulator's sequential auto-play and transition hooks to the 18-step sequence.
   - Provide visual feedback for each of the 18 steps with prompt labels, audio sources, and keypad hints.
5. `tests/canonicalAcceptanceTests.test.ts`:
   - Add verification tests asserting that all 18 audio steps resolve to valid physical paths and dynamic templates without regression.

---

## 5. Verification & Acceptance Criteria

1. **Physical File Existence**: Every audio file in the 18-step map must physically exist on disk and resolve without 404 or path traversal errors.
2. **Audio Transcoding Parity**: In iframe / browser / telephony environments where AAC/M4A is restricted, `.mp3` transcoding mirrors are automatically served.
3. **Turn-Taking Discipline**: The simulator microphone is automatically muted during prompt playback and enabled only after prompt completion.
4. **Zero-PIN Security**: Step 13 triggers the handset authorization banner and never attempts to collect, transcribe, or log a Mobile Money PIN.
5. **Compilation & Test Pass**: `npm run build` and `compile_applet` must succeed cleanly with zero TypeScript errors.
