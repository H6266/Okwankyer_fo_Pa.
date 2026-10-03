# Ɔkwankyerɛfo Pa ("The Good Guide")
### A Voice Accessibility & Transaction Safety Layer for Ghana's Digital Financial Services
**Africa's Talking Voice Telephony | Node.js, Express, TypeScript, Vitest**

---

## 🌟 Executive Summary

Digital financial services and Mobile Money (MoMo) are the lifeblood of Ghana's economy, transacting billions of Ghana Cedis monthly. Yet millions of citizens—particularly the visually impaired, the elderly, and individuals with low text literacy—remain systematically excluded or highly vulnerable to fraud, panic timeouts, and unrecoverable "wrong number" mistakes.

Standard USSD interfaces (`*170#`) impose severe accessibility barriers:
- **Strict Visual Reliance**: Callers must read fast-scrolling text menus.
- **Aggressive Timeouts**: Carriers drop sessions in 15–20 seconds if users hesitate.
- **Unverified Transfers**: If a digit is mistyped, funds move with zero recourse.
- **Eavesdropping Risks**: Pushing PINs blindly in public exposes users to theft.

**Ɔkwankyerɛfo Pa ("The Good Guide")** is an **independent Voice Accessibility and Safety Layer** that sits between everyday citizens and existing telecom/banking backends. Through natural spoken local dialects (**Akan Twi** and English), structured voice navigation grammar, real-time recipient identity resolution (KYC lookup), and a strict **Zero-PIN Security Gate**, Ɔkwankyerɛfo Pa ensures that anyone can transact with confidence, clarity, and dignity using **any basic feature phone** (dumb phone) or smartphone.

---

## 📊 Implementation & Status Matrix

| System Component | Status | Implementation Details |
|---|:---:|---|
| **Dynamic Safe Confirmation** | ✅ **Implemented** | Generates dynamic VoiceXML readback speaking caller's exact entered Cedis, Pesewas, verified recipient name, or explicit unverified warning with extra confirmation gate. |
| **Recipient KYC Resolution** | ✅ **Implemented** | Modular `RecipientResolver` interface with isolated sandbox fixtures (`src/demo/`) and live MTN MoMo Basic User Info adapter when credentials exist. |
| **Zero-PIN Handset Handoff** | ✅ **Implemented** | IVR never prompts or captures PINs. Out-of-band RequestToPay pushed to handset with explicit idempotent state machine (`INITIATED` → `COMPLETED`). |
| **Bilingual Language Isolation** | ✅ **Implemented** | Strict separation between English and Akan Twi tracks. Replay (<kbd>9</kbd>), Back (<kbd>8</kbd>), and Cancel (<kbd>0</kbd>) active across all steps. |
| **HTTP 206 Audio Streaming** | ✅ **Implemented** | Byte-range partial content streaming with cross-platform `path.resolve` directory traversal protection. |
| **Speech Recognition & NLU** | ✅ **Implemented** | Telephony `<Record>` callbacks transcribed via Gemini ASR with strict confidence thresholds (≥0.75) and guaranteed DTMF fallback. |
| **MTN MoMo Collections & Transfers** | 🟡 **Sandbox / Live Ready** | Live sandbox integration active; connects to live production telco gateway upon provisioning production API keys. |
| **Telecel Cash & AT Money** | 🔵 **Roadmap** | Architecture and interfaces designed in `paymentProvider.ts`; awaiting telco partner API access. |

---

## 🏗️ System Architecture

```
                    CITIZEN CELLULAR HANDSET (Feature Phone or Smartphone)
                                             │
                                   PSTN / 2G / 3G / 4G Voice Call
                                             ▼
                             AFRICA'S TALKING TELEPHONY TRUNK
                                  (+233 30 804 8098)
                                             │
                                HTTP Webhooks / VoiceXML
                                             ▼
       ┌────────────────────────────────────────────────────────────────────────┐
       │                 ƆKWANKYERƐFO PA CORE APPLICATION                       │
       │                                                                        │
       │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
       │  │  Inbound Webhook Router │  │  Webhook Security Guard             │  │
       │  │  (/voice-menu)          │  │  - SessionID validation             │  │
       │  └────────────┬────────────┘  │  - Optional shared secret           │  │
       │               │               └─────────────────────────────────────┘  │
       │               ▼                                                        │
       │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
       │  │ Transaction State Mach. │  │ Recipient KYC Resolver              │  │
       │  │ (INITIATED → COMPLETED) │  │ - Sandbox fixtures (src/demo/)      │  │
       │  │ Idempotency Cache       │  │ - MTN MoMo API (live)               │  │
       │  └────────────┬────────────┘  └─────────────────────────────────────┘  │
       │               │                                                        │
       │               ▼                                                        │
       │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
       │  │ Dynamic Safe Readback   │  │ Dual-Track Speech / NLU Engine      │  │
       │  │ - Spoken exact Cedis    │  │ - Gemini ASR (English & Twi)        │  │
       │  │ - Spoken recipient/warn │  │ - Confidence threshold (≥ 0.75)     │  │
       │  │ - Unique per-tx Ref     │  │ - Guaranteed DTMF Keypad Fallback   │  │
       │  └────────────┬────────────┘  └─────────────────────────────────────┘  │
       │               │                                                        │
       │               ▼                                                        │
       │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  │
       │  │ Zero-PIN Handoff Gate   │  │ HTTP 206 Streaming Engine           │  │
       │  │ - Handset screen prompt │  │ - Byte ranges for telco channel     │  │
       │  │ - Never speaks/logs PIN │  │ - Path traversal protection         │  │
       │  └────────────┬────────────┘  └─────────────────────────────────────┘  │
       └───────────────┼────────────────────────────────────────────────────────┘
                       │
                       ▼ Out-of-band RequestToPay
        ┌──────────────────────────────────────────────┐
        │        MTN MOBILE MONEY PARTNER API          │
        │   (Dispatches USSD PIN prompt to caller)     │
        └──────────────────────────────────────────────┘
```

---

## 🛡️ Core Innovation Pillars

### 1. Dynamic Safe Confirmation
In traditional USSD menus, once an amount is entered, callers are immediately prompted for a PIN without clear auditory feedback. Ɔkwankyerɛfo Pa introduces an **audible verification checkpoint**:
- **Dynamic Recipient Readback**: Speaks the recipient's verified legal name. If the recipient cannot be verified, an explicit warning is given and extra confirmation is required.
- **Dynamic Amount Readback**: Speaks the exact Cedis and Pesewas entered by the caller.
- **Unique Per-Transaction Reference**: Generates a fresh transaction reference and speaks real date/time on completion.

### 2. Zero-PIN Voice Security Gate
*Security Invariant:* **Ɔkwankyerɛfo Pa NEVER records, prompts, or transmits a user's secret Mobile Money PIN over the voice audio stream.**
- Spoken PINs in public transport or markets expose citizens to acoustic eavesdropping.
- Instead, once voice authorization is granted, the IVR server triggers a carrier-grade USSD screen push modal:
  > *"Confirmed. Now, please check your phone's screen and enter your Mobile Money PIN accurately."*
- Speech recognition is strictly terminated during the PIN phase to eliminate acoustic leakage.

### 3. Universal Voice Interaction Grammar
A standardized, intuitive keypad grammar is active across all menus:

| Key | Action | Function |
|:---:|:---|:---|
| <kbd>#</kbd> | **Submit** | Submits multi-digit input (recipient phone number or cedi amount). |
| <kbd>*</kbd> | **Decimal** | Inputs pesewas (e.g., `50*50#` = GH₵ 50.50). |
| <kbd>8</kbd> | **Back** | Navigates back to the preceding menu step. |
| <kbd>9</kbd> | **Repeat** | Replays the current spoken instructions. |
| <kbd>0</kbd> | **Cancel / Exit** | Immediately aborts the transaction safely with zero fund movement. |

---

## 📂 Audio Asset Inventory

The repository contains **24 recorded studio audio prompts** plus dynamic speech synthesis:
- **1 Shared Bilingual Welcome Prompt**: `/audio/Welcome_prompt_01.mp3`
- **11 English Studio Prompts**: `/audio/English/` (`Audio_prompt_02.mp3` through `Audio_prompt_12.mp3`)
- **12 Akan Twi Studio Prompts**: `/audio/Twi/` (`Audio_prompt_twi_02.mp3` through `Audio_prompt_twi_12.mp3`)
- **Dynamic TTS Readbacks**: Dynamic VoiceXML `<Say>` prompts synthesized on-the-fly for caller-specific amounts, unverified warnings, references, and timestamps.

*See [`docs/TWI_REVIEW.md`](./docs/TWI_REVIEW.md) for verbatim Akan transcripts and linguistic dialect notes.*

---

## 💻 Tech Stack

- **Runtime & Backend**: Node.js 22, Express, TypeScript
- **Telephony & IVR Gateway**: Africa's Talking Voice API (VoiceXML / HTTP Callbacks)
- **Speech Recognition**: Google Gemini API (`@google/genai`) for spoken English and Akan Twi ASR
- **Security & Integrity**: Helmet, rate-limiting, PII redaction, path-traversal protection, and state machine idempotency
- **Testing**: Vitest, Supertest (119 automated unit, integration, and security tests)

---

## 🚀 Getting Started & Local Development

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/H6266/Okwankyer_fo_Pa.git
cd Okwankyer_fo_Pa

# Install dependencies
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate the configuration:
```env
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000
DEMO_MODE=true
ADMIN_TOKEN=your_secure_admin_token_here
CORS_ORIGINS=*
AT_USERNAME=sandbox
AT_API_KEY=atsk_your_key_here
AT_VOICE_NUMBER=+233308048098
GEMINI_API_KEY=your_gemini_api_key_here
MOMO_SUBSCRIPTION_KEY=your_momo_subscription_key
MOMO_API_USER_ID=your_momo_user_id
MOMO_API_KEY=your_momo_api_key
MOMO_TARGET_ENV=sandbox
MOMO_CURRENCY=GHS
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Run Test Suite
```bash
npm test
```

---

## 🌐 Production Deployment (Render)

This repository is configured for one-click deployment via `render.yaml`. See [`docs/RENDER_RUNBOOK.md`](./docs/RENDER_RUNBOOK.md) for full deployment instructions and Africa's Talking webhook configuration.

---

## 👥 Team Anidasoɔ ("Hope")
*Crafting accessible, secure, and human-centered voice technology for Ghana and West Africa.*
