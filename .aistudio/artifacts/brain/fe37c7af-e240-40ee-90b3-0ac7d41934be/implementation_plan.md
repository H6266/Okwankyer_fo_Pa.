# Ɔkwankyerɛfo Pa — Simplified Complete Audio and TTS Flow Architecture

Comprehensive implementation plan establishing the 22-step canonical audio sequence, full 10-digit recipient phone number verification, dedicated OP52b slow reference-number readback, studio audio clip concatenation, and a strict 60-second silence watchdog with OP67 prompt repetition.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and audio flow choices were confirmed through Phase 1 clarification:

- **Confirmed Decision 1 (Dedicated Reference Prompt OP52b)**: Introduce a dedicated prompt ID `OP52b` (`STATE: REFERENCE_READBACK`) specifically for speaking the transaction reference. This cleanly decouples generic success audio (`OP53`), keep-reference advice (`OP54`), and reference-reading (`OP52b`) so that the application never announces success twice.
- **Confirmed Decision 2 (Digit Speech Synthesis Strategy)**: Pre-recorded individual studio number audio clips concatenated with deliberate 400ms inter-digit pauses and prefix voicing (e.g., "O-K-P ... two ... seven ... two"), backed by neural TTS fallback if any individual phoneme or digit clip is missing.
- **Confirmed Decision 3 (Silence & Inactivity Handling)**: Strict 60-second (1 minute) silence timeout. When a caller remains silent, the application never skips a step or advances automatically; instead, it plays `OP67 — Please Respond` (`Audio_files/Twi_library/Please_respond.mp3`), repeating the current input instruction until the caller enters a valid response or explicitly cancels.
- **Confirmed Decision 4 (Full Telephone Number Verification)**: Eliminates the last-4-digit shortcut. Recipient checking at Step 10 (`OP21`) and final review at Step 17 speak all 10 digits of the recipient's phone number individually to guarantee caller verification before authorization.

---

## 1. Overview & Core Concept

### What It Does
**Ɔkwankyerɛfo Pa** ("The Good Guide") provides an accessible voice navigation and Mobile Money transfer layer for Ghanaian citizens, especially elderly, non-literate, and visually impaired users. It strictly enforces three governing audio rules:
1. **Human Audio Gives the Instruction**: All navigational choices, prompts, warnings, and confirmations use verified studio recordings in Akan Twi and Ghanaian English.
2. **Dynamic Speech Speaks What Changes**: The recipient's actual registered name (`OP20`), full 10-digit telephone number (`OP21`), exact transfer amount in Cedis and Pesewas (`OP29`), and complete transaction reference (`OP52b`) are dynamically synthesized or concatenated from individual studio digit assets.
3. **Deterministic Branching Without Skipping**: Every input is validated. The system never advances upon silence or invalid entry; instead, it branches to dedicated diagnostic audio clips (`OP17` invalid recipient, `OP27` invalid amount, `OP31` amount too high, `OP32` amount too low, `OP67` please respond) and returns to the input prompt.

### Target Audience & Persona
- **Rural Farmers & Market Traders**: Everyday Ghanaians conducting Mobile Money transactions in Akan Twi who need crystal-clear, unhurried voice confirmation of names and amounts.
- **Elderly Pensioners & Visually Impaired Callers**: Users who cannot read USSD text prompts or smartphone glass screens and rely on deliberate, slow digit-by-digit spoken readback of 10-digit phone numbers and transaction references.

---

## 2. User Experience & Visual Design

### Key User Flows

#### 1. Main 22-Step Sequential Audio Journey
```
[01. OP01 Welcome & Language]
        │
[02. OP07 Service Selection] ──> [03. OP08 Network Selection]
        │
[04. OP09 MTN Service Menu] ──> [05. OP10 Send Money Selected]
        │
[06. OP16 Enter Recipient Phone Number (#)]
        │ ──(Invalid)──> [OP17 Invalid Recipient Audio] ──> Return to OP16
        │ ──(Valid Lookup)
[07. OP18 Recipient Found Audio]
        │
[08. OP19 Recipient Verification Intro]
        │
[09. TTS/Dynamic OP20: Spoken Recipient Name]
        │
[10. TTS/Concat OP21: Full 10-Digit Phone Number (Digit-by-Digit)]
        │
[11. OP23 Recipient Confirmation: Proceed (1/Yes), Change (2/No), Cancel (0)]
        ├──(Change 2)──> [OP25 Change Recipient] ──> Return to OP16
        ├──(Cancel 0)──> [OP76 Cancel Audio] ──> [OP77 Exit]
        └──(Proceed 1)
[12. OP24 Use Recipient Acknowledgement]
        │
[13. OP28 Amount Prompt] ──> [14. OP26 Enter Amount (#)]
        │ ──(Too High)──> [OP31 Amount Too High] ──> Return to OP26
        │ ──(Too Low)───> [OP32 Amount Too Low] ───> Return to OP26
        │ ──(Invalid)───> [OP27 Invalid Amount] ───> Return to OP26
        │ ──(Valid Amount)
[15. TTS/Dynamic OP29: Spoken Exact Amount (Cedis & Pesewas)]
        │
[16. OP35/OP36 Generic Confirmation & Transaction Review]
        │
[17. TTS/Concat: Complete Transaction Review (Name, Full Number, Network, Amount)]
        │ ──(Change Amount)──> [OP33 Change Amount] ──> Return to OP26
        │ ──(Change Recipient)──> [OP25 Change Recipient] ──> Return to OP16
        │ ──(Confirmed)
[18. OP39/OP40 Handset PIN Handoff (Zero-PIN over Voice)]
        │
[19. OP45/OP46 Submitted & Waiting for Handset Confirmation]
        │ ──(Customer Declined)──> [OP57 Customer Declined] ──> Safe Exit
        │ ──(Timeout)────────────> [OP59 Timeout Audio] ──> Check Messages
        │ ──(Network Failure)────> [OP58 Transaction Failed] ──> Retry
        └──(Success Verified)
[20. OP53 Success Audio ("Money sent successfully")]
        │
[21. OP54 Keep Reference Audio ("Please keep this reference")]
        │
[22. OP52b Dedicated Reference Read-Back: Spoken Slow & Digit-by-Digit]
        │
[23. OP56 Anything Else?] ──> Another Transaction (OP92) or Exit (OP77)
```

### Visual & Interactive Dashboard Elements
- **Interactive Call Simulator**: Updated with a dedicated 22-step progress scrubber, full-phone-number badge (`054 354 6010` formatted with high legibility), slow reference readback waveform visualizer, and 60-second inactivity countdown timer.
- **Audio Studio & IVR Lab**: Added inspector showing the exact mapping of `OP52b` (Reference Readback) distinct from `OP53` (Success Sent) and `OP54` (Keep Reference), with audio audition buttons for both Akan Twi and English.
- **Zero-PIN Security Handoff**: Visual handset simulation displaying the USSD push prompt on the phone screen while the voice call remains securely awaiting network verification.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Dedicated OP52b vs Modifying OP52
- **Chosen Approach**: Introduce `OP52b` (`REFERENCE_READBACK`) as an explicit canonical prompt ID, keeping `OP52` for legacy compatibility and `OP53` for `SUCCESS_SENT`.
- **Why**: Eliminates audio stutter or duplicate announcements. The user hears:
  `OP53` (We have sent the money successfully) → `OP54` (Please keep this reference) → `OP52b` ("O - K - P ... two ... seven ... two").
- **Alternatives Considered**: Inlining the reference into OP53. Rejected because mixing fixed human recordings with dynamic TTS creates jarring acoustic discontinuities.

### Decision 2: Digit Concatenation Engine with Fallback
- **Chosen Approach**: Build a deterministic digit sequencer that plays individual studio clips (`0.m4a` through `9.m4a`, plus letters if available) spaced with a 400ms silent buffer, falling back to local Piper neural TTS at 0.8x rate.
- **Why**: Conforms directly to the user's requirement to pronounce actual numbers with authentic Akan phonetics.
- **Timing**: 400ms pause between digits, 700ms pause between prefix and number blocks.

### Decision 3: 60-Second Silence Guard with OP67 Repetition
- **Chosen Approach**: Implement an explicit 60,000ms inactivity timer in both the backend session state machine and the frontend simulator. When the timer elapses without DTMF or speech input:
  1. Play `OP67` (`Please_respond.mp3`: *"I did not get any response from you, please give us a response!"*).
  2. Repeat the current step's input instruction (e.g. `OP16` or `OP26`).
  3. Reset the 60s timer (up to 3 cycles before graceful `OP77` session exit).
- **Why**: Elderly and low-dexterity callers frequently pause to look at bank slips, consult notes, or reach for their eyeglasses; strict 60-second patience prevents premature hang-ups or accidental skips.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Ɔkwankyerɛfo Pa Engine                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
         ┌──────────────────────────┴──────────────────────────┐
         ▼                                                     ▼
┌───────────────────────────────┐             ┌───────────────────────────────┐
│     Client Phone Simulator    │             │   Africa's Talking Telephony  │
│  (React 19 / Web Audio API)   │             │   (VoiceXML / MP3 Streamer)   │
└───────────────┬───────────────┘             └───────────────┬───────────────┘
                │                                             │
                └──────────────────────┬──────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Canonical Prompt Router & Registry                  │
│   - OP01-OP19, OP22-OP28, OP30-OP51, OP53-OP69, OP71-OP94 (Fixed Clips)│
│   - OP20: Recipient Name (Dynamic TTS)                                 │
│   - OP21: Full 10-Digit Recipient Phone Number (Digit Concat / TTS)    │
│   - OP29: Exact Monetary Amount (Cedis & Pesewas Synthesizer)          │
│   - OP52b: Slow Reference Number Readback (400ms Digit Spacing)        │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌───────────────────┐       ┌──────────────────────┐       ┌───────────────────┐
│ Studio Audio Hub  │       │ Digit Concat Engine  │       │ 60s Silence Guard │
│ Audio_files/      │       │ Spaced Audio Stream  │       │ Watchdog Timer    │
│ Twi & English     │       │ 0.8x Speed / 400ms   │       │ OP67 Prompt Play  │
└───────────────────┘       └──────────────────────┘       └───────────────────┘
```

### Data Model & State Schema

```typescript
export interface MomoTransactionState {
  sessionId: string;
  stepIndex: number; // 1 to 22
  currentPromptId: string; // e.g. "OP16", "OP21", "OP52b"
  language: "twi" | "en";
  recipientPhone: string; // Full 10 digits, e.g. "0543546010"
  recipientName: string; // e.g. "Hannes Aboagye"
  recipientFound: boolean;
  amountCedis: number; // e.g. 50
  amountPesewas: number; // e.g. 0
  transactionRef: string; // e.g. "OKP-272"
  inactivityTimerMs: number; // 60,000 ms
  silenceCount: number; // Max 3 before OP77 exit
  handoffStatus: "idle" | "awaiting_pin" | "authorized" | "declined" | "timeout";
  paymentStatus: "unsubmitted" | "pending" | "success" | "failed";
}
```

### Prompt Mapping Table (22 Steps & Diagnostic Branches)

| Step | Canonical ID | Display Name | Audio File / Generator | Spoken Content / Template |
| :--- | :--- | :--- | :--- | :--- |
| **01** | `OP01` | Welcome & Language | `Opening_voice_welcome_to_okwankyerefopa.mp3` | Welcome to Ɔkwankyerɛfo Pa. English press 1, Twi press 2 |
| **02** | `OP07` | Service Selection | `Service_selection.mp3` | For Mobile Money press 1, banking press 2 |
| **03** | `OP08` | Network Selection | `Network_selection.mp3` | MTN press 1, Telecel press 2, AirtelTigo press 3 |
| **04** | `OP09` | Network Menu | `MTN menu.mp3` | MTN Mobile Money: To transfer money press 1 |
| **05** | `OP10` | Send Money Selected | `Send_money_selected.mp3` | You have selected 1 to transfer money |
| **06** | `OP16` | Enter Recipient Number | `Enter_recipient.mp3` | Please enter recipient's 10-digit number followed by # |
| **BR** | `OP17` | Invalid Recipient | `Invalid_recipient.mp3` | Number is invalid, please re-enter followed by # |
| **07** | `OP18` | Recipient Found | `Recipient_found.mp3` | We have found the name of the person you are sending money to |
| **08** | `OP19` | Recipient Verify Intro| `Recipient_verify.mp3` | Listen to the recipient name and full telephone number |
| **09** | `OP20` | Recipient Actual Name | Dynamic TTS | [Actual Recipient Name from Lookup, e.g. "Kwame Mensah"] |
| **10** | `OP21` | Full Phone Number | Digit Concat (400ms pause) | [Full 10 Digits Spoken Individually: "0 5 4 3 5 4 6 0 1 0"] |
| **11** | `OP23` | Confirm Recipient | `Recipient_confirm_speech.mp3`| Press 1 to proceed, 2 to change recipient, 0 to cancel |
| **BR** | `OP25` | Change Recipient | `Change recipient.mp3` | Please enter the other number you want to send money to |
| **12** | `OP24` | Use Recipient Ack | `Use_recipient 1.mp3` | Okay, we will use this recipient |
| **13** | `OP28` | Amount Prompt | `Amount prompt.mp3` | How much money do you want to send? |
| **14** | `OP26` | Enter Amount | `Enter amount.mp3` | Enter amount in Cedis (* for pesewas), followed by # |
| **BR** | `OP27` | Invalid Amount | `Invalid_amount.mp3` | Amount is invalid, please enter a valid amount |
| **BR** | `OP31` | Amount Too High | `Amount too high 3.mp3` | Amount exceeds allowed limit, please enter a lower amount |
| **BR** | `OP32` | Amount Too Low | `Amount too low.mp3` | Amount is too low, please enter a valid amount |
| **15** | `OP29` | Amount Readback | Dynamic Amount Synthesizer | [Exact Amount, e.g. "Ghana Cedis 50"] |
| **16** | `OP35` | Review Intro | `Review transaction.mp3` | Please verify your transaction details before proceeding |
| **17** | `OP36` | Full Summary Review | Dynamic Composite TTS | Summary: [Amount] to [Name] at [Full 10-Digit Number]. 1 to confirm, 2 to change |
| **BR** | `OP33` | Change Amount | `Change_amount.mp3` | Please enter a different amount |
| **18** | `OP40` | Secure PIN Handoff | `Authorize_phone.mp3` | Please authorize transaction on your phone prompt (No PIN over call) |
| **19** | `OP46` | Waiting Confirmation | `Waiting_confirmation.mp3` | Waiting for confirmation from the Mobile Money service |
| **20** | `OP53` | Success Audio | `Success_sent.mp3` | Money has been sent successfully |
| **21** | `OP54` | Keep Reference Audio | `Keep_reference.mp3` | For future occurrences, please keep this reference |
| **22** | `OP52b`| Reference Read-Back | Slow Digit Concat (0.8x) | Complete reference: "O - K - P ... two ... seven ... two" |
| **23** | `OP56` | Anything Else | `Anything_else.mp3` | Would you like to perform another transaction? |
| **BR** | `OP67` | Please Respond | `Please_respond.mp3` | 60s silence alert: Did not receive response, please respond! |

---

## 5. Execution & Verification Plan

### Implementation Steps
1. **Canonical Registry Update**:
   - Register `OP52b` (`REFERENCE_READBACK`) in `src/audio/canonicalRegistry.ts`.
   - Update `DYNAMIC_PROMPT_IDS` to include `OP52b`.
   - Ensure `OP21` renders full 10-digit spaced phone numbers.
2. **Digit Audio Concatenation Service**:
   - Create `src/audio/digitAudioSynthesizer.ts` implementing sequential digit playback with 400ms inter-digit pauses, natural pacing (0.8x equivalent), and prefix pronunciation ("OKP-272").
3. **60-Second Inactivity Watchdog**:
   - Wire `OP67` (`Please_respond.mp3`) trigger upon 60,000ms idle in `usePhoneSimulator.ts`, `ivrDecisionEngine.ts`, and telephony webhook routes.
   - Guard against auto-advancement on empty inputs.
4. **Full 22-Step Simulator & Telephony Parity**:
   - Synchronize `TWI_SEQUENTIAL_FLOW_STEPS` in `src/audio/twiSequentialAudioFlow.ts` and `momoFlowSequence.ts` to exactly mirror the 22-step flow.
   - Update `PhoneSimulatorPage.tsx` and `IvrLabPage.tsx` with full phone verification and slow reference read-back visualizers.
5. **Compilation & Automated Verification**:
   - Execute `compile_applet` and verify zero TypeScript/bundle errors.
   - Verify unit and integration test coverage for the 22-step audio flow.
