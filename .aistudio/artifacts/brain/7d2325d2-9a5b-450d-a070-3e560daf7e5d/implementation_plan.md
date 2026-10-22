# Conversational Voice Audio Flow: "Transfer Money" Intent Mapping

A comprehensive architectural blueprint detailing how spoken requests like "transfer money" trigger the exact studio audio recordings and neural text-to-speech prompts in bilingual Akan Twi and English without compromising security.

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your preferences from Phase 1, the system will use:
> 1. **Step-by-step slot prompting**: Asking for recipient phone number first upon hearing "transfer money".
> 2. **Explicit language choice at session initiation**: Press 1 for English, Press 2 for Akan Twi (locking the audio track).
> 3. **Full neural TTS for dynamic data turns**: Generating seamless Ghanaian neural speech for custom recipient names and amounts, while playing crystal-clear studio human recordings for all static prompts.

- **Confirmed Decision 1**: Step-by-step guidance begins with recipient prompt (`OP16` / `Enter recipient 2.m4a`).
- **Confirmed Decision 2**: Explicit language gate at start ensures 100% dialect consistency (Akan Twi vs. English).
- **Confirmed Decision 3**: Full neural TTS dynamically renders names, amounts, and fees, avoiding robotic concatenation.

---

## 1. Overview & Core Concept

When a user calls the voice hotline and says a natural phrase such as **"transfer money"**, **"I want to send money"**, or in Twi **"Mepɛ sɛ memane sika"**, the conversational engine must:
1. Normalize and transcribe the audio utterance via ASR.
2. Classify the intent as `TRANSFER_MONEY` / `SEND_MONEY`.
3. Inspect the conversational slot context:
   - Recipient: *Missing*
   - Amount: *Missing*
4. Determine the next actionable slot: **Recipient Phone Number**.
5. Dispatch the corresponding high-fidelity studio recording (`OP10: Send Money Selected` + `OP16: Enter Recipient`).
6. Await the caller's spoken or keypad response, perform provider KYC lookup, and transition to amount and safe confirmation.

---

## 2. User Experience & Concrete Example Flow

### End-to-End Walkthrough Example

```
Caller                           System / Voice Gateway
  │                                        │
  │─── Inbound Call Connected ────────────>│
  │                                        │ (Plays OP02: Language selection)
  │<── "For English press 1.               │
  │     Sɛ wopɛ Twi a, mia 2." ────────────│
  │                                        │
  │─── Keypad [2] or Spoken "Twi" ────────>│ (Language set to Twi)
  │                                        │
  │─── Caller: "Mepɛ sɛ memane sika" ─────>│ (ASR: "memane sika" -> Intent: SEND_MONEY)
  │                                        │
  │                                        │ [Slot Recipient = null, Amount = null]
  │                                        │ Plays OP10 Studio: "Woapaw Send Money."
  │                                        │ + Plays OP16 Studio:
  │<── "Woapaw Send Money.                 │   "Kyerɛw recipient no fon nɔma
  │     Kyerɛw recipient no fon nɔma..." ──│    a ɛyɛ digit du no, na mia hash."
  │                                        │
  │─── Caller: "024 123 4567" ────────────>│ (Extracted recipient: 0241234567)
  │                                        │ [KYC Lookup -> Ama Mensah]
  │                                        │
  │                                        │ [Dynamic Turn -> Neural TTS Synthesis]
  │<── "Deɛ woremane sika no akɔma no ne   │
  │     Ama Mensah a ne nɔma wie 4 5 6 7.  │
  │     Sɛ ɛyɛ nokware a, mia 1.           │
  │     Sɛ worepɛ sɛ wosakra a, mia 2." ───│
  │                                        │
  │─── Caller: [1] (or "Aane") ───────────>│ [Recipient Confirmed: Ama Mensah]
  │                                        │
  │                                        │ [Next Missing Slot: Amount]
  │                                        │ Plays OP21 Studio:
  │<── "Kyerɛw sika dodoɔ a woremane no..."─│   "Kyerɛw sika dodoɔ a woremane no..."
  │                                        │
  │─── Caller: "50 cedis" ────────────────>│ (Extracted amount: 50 GHS)
  │                                        │
  │                                        │ [Dynamic Turn -> Neural TTS Synthesis]
  │<── "Worebɛmane sika GHS 50 akɔma       │
  │     Ama Mensah. Sɛ wo pɛ sɛ ɛkɔ a,      │
  │     mia 1. Sɛ woretwam a, mia 2." ─────│
  │                                        │
  │─── Caller: [1] (Confirmed) ───────────>│ [Zero-PIN Safety Gate Activated]
  │                                        │ Plays OP32 Studio:
  │<── "Yɛsrɛ wo, hwɛ wo fon screen so     │   "Yɛsrɛ wo, hwɛ wo fon screen so
  │     na fa wo secret PIN hyɛ mu..." ────│    na fa wo secret PIN hyɛ mu..."
  │                                        │ (Audio call disconnects; USSD prompt appears)
```

---

## 3. Key Product Decisions & Audio Mapping Rules

### 1. Dual-Track Prompt Resolution
- **Pre-recorded Studio Human Audio (Static Prompts)**: Used whenever the prompt text is invariant (welcome, language selection, service confirmation, keypad instructions, security warning).
- **Full Neural Text-to-Speech (Dynamic Prompts)**: Used whenever a prompt contains run-time entity variables (`recipientName`, `phoneNumber`, `amount`, `transactionFee`). This prevents unnatural voice jarring or abrupt pitch changes.

### 2. Audio Catalog & Manifest Reference

| Step / State | Prompt ID | Audio Asset Path | Spoken Text (Twi / English) |
|---|---|---|---|
| Language Gate | `OP02` | `audio/Twi/01_Welcome_Session_Start/Language selection.m4a` | "For English press 1. Sɛ wopɛ Twi a, mia 2." |
| Intent Acknowledge | `OP10` | `audio/Twi/02_Main_Service_Navigation/Send money selected.m4a` | "Woapaw Send Money." / "You have selected Send Money." |
| Prompt Recipient | `OP16` | `audio/Twi/03_Recipient_Entry_Verification/Enter recipient.m4a` | "Kyerɛw recipient no fon nɔma..." / "Enter the recipient's 10-digit number..." |
| Verify Recipient | Dynamic | Generated via Neural TTS | "The recipient is [Name] ending in [Digits]..." |
| Prompt Amount | `OP21` | `audio/Twi/04_Amount_Entry_Verification/Enter amount 4.m4a` | "Kyerɛw sika dodoɔ no..." / "Enter the amount in Ghana Cedis..." |
| Safe Confirmation | Dynamic | Generated via Neural TTS | "You are about to send [Amount] to [Name]..." |
| Zero-PIN Hand-Off | `OP32` | `audio/Twi/07_Transaction_Processing/Authorize phone.aac` | "Check your phone screen to enter your secret PIN..." |

### 3. Speech vs. DTMF Barge-In Tolerance
- Every prompt uses `<GetDigits>` with nested `<Play>` so visually impaired and elderly users can either speak or press keypad digits at any point without waiting for the audio to finish.

---

## 4. Technical Architecture & Data Strategy

### System Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    CALLER TELEPHONY / ASR                    │
│   (Africa's Talking Virtual Trunk + Browser Phone Simulator) │
└──────────────────────────────┬───────────────────────────────┘
                               │ Inbound Webhook / Audio Stream
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    VOICE & DIALOGUE ROUTER                   │
│                    (src/routes/voiceRoutes.ts)               │
│                                                              │
│  1. Check Language Session (English / Akan Twi)             │
│  2. Dispatch Speech to NLU Engine                            │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  COGNITIVE BRAIN & SLOTS                     │
│               (src/ai_system/brain/brain.ts)                 │
│                                                              │
│  - Intent: `TRANSFER_MONEY`                                  │
│  - Slot Evaluator: recipientPhone? amount?                   │
│  - Next Action: `PROMPT_RECIPIENT`                           │
└──────────────────────────────┬───────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
┌──────────────────────────────┐ ┌──────────────────────────────┐
│     STATIC STUDIO AUDIO      │ │       NEURAL DYNAMIC TTS     │
│   (src/audio/catalog.ts)     │ │   (Local Piper / Ghana TTS)  │
│                              │ │                              │
│ • OP10: Send Money Selected  │ │ • Recipient Name Readback    │
│ • OP16: Enter Recipient      │ │ • Dynamic Amount & Fee GHS   │
│ • OP32: Zero-PIN Hand-off    │ │ • Full Sentence Synthesis    │
└──────────────┬───────────────┘ └──────────────┬───────────────┘
               │                                │
               └───────────────┬────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   VOICEXML RESPONSE (<Response>)             │
│   <Play url=".../audio/Send money selected.m4a"/>             │
│   <Play url=".../audio/Enter recipient.m4a"/>                │
│   <GetDigits timeout="10" finishOnKey="#" numDigits="10"/>   │
│   <Record callbackUrl=".../speech-fallback"/>                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Verification & Safety Safeguards

1. **Zero-PIN Voice Boundary**: Never prompt or record PIN via voice. Handoff occurs directly to carrier network USSD push.
2. **Audio File Accessibility**: All audio links resolve to public HTTPS URLs so Africa's Talking servers never encounter inaccessible `localhost` addresses.
3. **Format Support**: Supports `.m4a`, `.aac`, `.mp3`, and `.wav` with HTTP 206 Byte-Range streaming.
