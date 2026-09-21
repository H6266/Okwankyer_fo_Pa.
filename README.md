# Ɔkwankyerɛfo Pa ("The Good Guide")
### A Voice Accessibility & Transaction Safety Layer for Ghana's Digital Financial Services
**Built by Team Anidasoɔ ("Hope") | Africa's Talking Voice Hackathon**

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

## 🏗️ System Architecture: The Independent Voice Bridge

Rather than asking telcos or banks to overhaul their core infrastructure, **Ɔkwankyerɛfo Pa** functions as an intelligent middleware layer accessible via standard cellular voice calls (`+233 30 804 8098`).

```
                              TELCO & BANKING ECOSYSTEM
       ┌────────────────────────────────────────────────────────────────────────┐
       │   MTN MoMo API   │  Telecel Cash API  │  AT Money API  │  GhIPSS / GIP │
       └───────────────────────────────────▲────────────────────────────────────┘
                                           │
                        REST / USSD Push Orchestration APIs
                                           │
              ┌────────────────────────────┴────────────────────────────┐
              │             ƆKWANKYERƐFO PA CORE ENGINE                 │
              │                                                         │
              │  ┌─────────────────────────┐ ┌───────────────────────┐  │
              │  │  Strict Language Engine │ │  KYC Identity Engine  │  │
              │  │  - English Flow (11)    │ │  - Phone validation   │  │
              │  │  - Akan Twi Flow (12)   │ │  - Name readback      │  │
              │  └─────────────────────────┘ └───────────────────────┘  │
              │  ┌─────────────────────────┐ ┌───────────────────────┐  │
              │  │ VoiceXML & DTMF Router  │ │  Zero-PIN Security    │  │
              │  │ - # Submit  - 8 Back    │ │  - Never speak PIN    │  │
              │  │ - 9 Replay  - 0 Exit    │ │  - OS screen handoff  │  │
              │  └─────────────────────────┘ └───────────────────────┘  │
              │  ┌───────────────────────────────────────────────────┐  │
              │  │      HTTP 206 Byte-Range Audio Streaming          │  │
              │  │      (/audio/English/*.mp3 & /audio/Twi/*.mp3)    │  │
              │  └───────────────────────────────────────────────────┘  │
              └────────────────────────────▲────────────────────────────┘
                                           │
                         VoiceXML / HTTP Webhook Callbacks
                                           │
              ┌────────────────────────────┴────────────────────────────┐
              │             AFRICA'S TALKING VOICE GATEWAY              │
              │          Inbound Phone Number: +233 30 804 8098         │
              └────────────────────────────▲────────────────────────────┘
                                           │
                                 Standard Cellular Call
                                 (PSTN / 2G / 3G / 4G)
                                           │
                                  📞 CITIZEN HANDSET
                             Any Feature Phone or Smartphone
```

---

## 🔀 Strict Language Separation Call Flows

The system strictly enforces complete language isolation. Once a caller chooses their preferred language at the welcome greeting, **no cross-language audio contamination occurs**.

```
                                  INCOMING CALL
                                 +233 30 804 8098
                                        │
                                        ▼
                           [ Step 1: Welcome Greeting ]
                     "For English, press 1. For Twi, press 2."
                                        │
                  ┌─────────────────────┴─────────────────────┐
                  │                                           │
             PRESS [ 1 ]                                 PRESS [ 2 ]
                  │                                           │
                  ▼                                           ▼
       ═════════════════════                       ═════════════════════
       ENGLISH TRACK LOCKED                        AKAN TWI TRACK LOCKED
       (100% English Audios)                       (100% Akan Twi Audios)
       ═════════════════════                       ═════════════════════
                  │                                           │
                  ▼                                           ▼
       [ Step 2: Service Selection ]               [ Step 2: Network Selection ]
       "For Telecom MoMo, press 1..."              "Afei select-i wo network..."
       (Audio_prompt_02.mp3)                       (Audio_prompt_twi_02.mp3)
                  │                                           │
                  ▼                                           ▼
       [ Step 3: Network Selection ]               [ Step 3: Action Menu ]
       "Select network: 1 MTN..."                  "Sɛ wopɛ sɛ wosend sika..."
       (Audio_prompt_03.mp3)                       (Audio_prompt_twi_04.mp3)
                  │                                           │
                  ▼                                           ▼
       [ Step 4: Action Menu ]                     [ Step 4: Recipient Entry ]
       "1: Send Money, 2: Bills..."                "Bɔ nɔmba no a wopɛ... (#)"
       (Audio_prompt_05.mp3)                       (Audio_prompt_twi_05.mp3)
                  │                                           │
                  ▼                                           ▼
       [ Step 5: Recipient Entry ]                 [ Step 5: KYC Verification ]
       "Enter 10 digit number + #"                 "Kwame Nyamebre (8464)..."
       (Audio_prompt_06.mp3)                       (Audio_prompt_twi_06.mp3)
                  │                                           │
                  ▼                                           ▼
       [ Step 6: KYC Verification ]                [ Step 6: Amount Entry ]
       "Sending to Kwame Nyamebre..."              "Siidi amount a wopɛ... (#)"
       (Audio_prompt_08.mp3)                       (Audio_prompt_twi_07.mp3)
                  │                                           │
                  ▼                                           ▼
       [ Step 7: Amount Entry ]                    [ Step 7: Safe Confirmation ]
       "Enter cedi amount + #"                     "500 Cedis kɔ Kwame Nyamebre"
       (Audio_prompt_09.mp3)                       (Audio_prompt_twi_08.mp3)
                  │                                           │
                  ▼                                           ▼
       [ Step 8: Safe Confirmation ]               [ Step 8: Zero-PIN Handoff ]
       "Send 500 Cedis to Kwame..."                "Hwɛ wo phone screen so..."
       (Audio_prompt_10.mp3)                       (Audio_prompt_twi_09.mp3)
                  │                                           │
                  ▼                                           ▼
       [ Step 9: Zero-PIN Handoff ]                [ Step 9: Receipt & Exit ]
       "Check screen to enter PIN..."              "Congratulations... OKP847291"
       (Audio_prompt_11.mp3)                       (Audio_prompt_twi_10.mp3)
                  │                                           │
                  ▼                                           ▼
       [ Step 10: Receipt & Exit ]                 [ Complete / End Call ]
       "500 Cedis successfully sent..."
       (Audio_prompt_12.mp3)
```

---

## 🛡️ Core Innovation Pillars

### 1. The "Safe Confirmation" Verification Gate
In traditional USSD menus, once an amount is entered, users are immediately pushed for a PIN with minimal visual confirmation. Ɔkwankyerɛfo Pa introduces an **audible verification checkpoint**:
- **Name Resolution**: The system queries the subscriber registry and speaks the recipient's verified legal name.
- **Amount Readback**: Confirms both the Cedis and Pesewas.
- **Explicit Consent**: <kbd>1</kbd> to proceed, <kbd>2</kbd> to re-enter, <kbd>0</kbd> to abort.

### 2. The Zero-PIN Voice Security Protocol
*Security Rule:* **Ɔkwankyerɛfo Pa NEVER records, prompts, or transmits a user's secret Mobile Money PIN over the voice audio stream.**
- Spoken PINs in public transport, markets, or homes expose citizens to eavesdropping, shoulder surfing, and fraudulent call recordings.
- Instead, once voice authorization is granted, the IVR server triggers a carrier-grade USSD screen push modal:
  > *"Confirmed. Now, please check your phone's screen and enter your Mobile Money PIN accurately."*
- Speech recognition is **strictly terminated** during the PIN phase to eliminate acoustic leakage.

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

## 📂 Audio Asset Suite & Inventory

The project includes **11 studio audio recordings for English** and **12 studio audio recordings for Akan Twi**, located under `/audio/English/` and `/audio/Twi/`.

### English Suite (`/audio/English/`)
1. `Welcome_prompt_01.mp3` - Welcome to Ɔkwankyerɛfo Pa & Language Choice
2. `Audio_prompt_02.mp3` - Telecom MoMo vs Banking Services Selection
3. `Audio_prompt_03.mp3` - Network Selection (MTN, Telecel, AirtelTigo)
4. `Audio_prompt_04.mp3` - Network Selection (Alternative repeat menu)
5. `Audio_prompt_05.mp3` - MTN Main MoMo Services Menu (Send, Pay, Airtime, Cashout, Account)
6. `Audio_prompt_06.mp3` - Recipient 10-digit Phone Number Entry + Hash
7. `Audio_prompt_07.mp3` - Phone Number Entry Demo (`0241234567#`)
8. `Audio_prompt_08.mp3` - Recipient Verification & KYC Name Confirmation
9. `Audio_prompt_09.mp3` - Amount Entry in Ghana Cedis + Hash
10. `Audio_prompt_10.mp3` - Safe Confirmation (Send 500 GHS to Kwame Nyamebre)
11. `Audio_prompt_11.mp3` - Zero-PIN Handoff (Check phone screen for PIN prompt)
12. `Audio_prompt_12.mp3` - Final Transaction Success Receipt (Reference: OKP847291)

### Akan Twi Suite (`/audio/Twi/`)
1. `Welcome_prompt_01.mp3` - Welcome & Language Selection (Mia 2 ma Twi)
2. `Audio_prompt_twi_02.mp3` - Network Selection (MTN, Telecel, AirtelTigo)
3. `Audio_prompt_twi_03.mp3` - MoMo Action Options (Extended dialect)
4. `Audio_prompt_twi_04.mp3` - MoMo Services Menu (Send, Bosea, Airtime, Cashout, Account)
5. `Audio_prompt_twi_05.mp3` - Recipient Phone Number Entry + Hash
6. `Audio_prompt_twi_06.mp3` - Recipient Verification (Kwame Nyamebre ending in 8464)
7. `Audio_prompt_twi_07.mp3` - Cedi Amount Entry + Hash (* ma pesewas)
8. `Audio_prompt_twi_08.mp3` - Safe Confirmation (500 Cedis kɔ Kwame Nyamebre)
9. `Audio_prompt_twi_09.mp3` - Zero-PIN Screen Prompt Notice
10. `Audio_prompt_twi_10.mp3` - Transaction Success Receipt (OKP847291)
11. `Audio_prompt_twi_11.mp3` - Cancellation & Polite Sign-off
12. `Audio_prompt_twi_12.mp3` - Calibration & Reference Prompt

*See [`IVR_SCRIPT.md`](./IVR_SCRIPT.md) for the full verbatim transcripts, phonetic guides, and system responses.*

---

## 💻 Tech Stack & Standards

- **Runtime & Backend**: Node.js, Express, TypeScript
- **Telephony & IVR Gateway**: Africa's Talking Voice API (VoiceXML / HTTP Callbacks)
- **Audio Streaming Protocol**: HTTP 206 Byte-Range streaming (`Accept-Ranges: bytes`) for smooth playback on cellular channels
- **Speech Recognition**: Dual-track Web Speech API with Echo Cancellation (`echoCancellation: true`) & Noise Suppression
- **Frontend & Simulator**: Responsive HTML5, CSS3, Vanilla JavaScript with interactive handset emulator and live VoiceXML inspector

---

## 🚀 Getting Started & Local Development

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/your-org/okwankyer-fo-pa.git
cd okwankyer-fo-pa

# Install dependencies
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate the variables:
```env
AT_USERNAME=sandbox
AT_API_KEY=atsk_your_africas_talking_key_here
AT_VOICE_NUMBER=+233308048098
BASE_URL=https://your-domain.ngrok-free.app
PORT=3000
```

### 3. Run the Development Server
```bash
npm run dev
```
Open your browser to `http://localhost:3000` to interact with the **Ghana MoMo Handset Simulator**.

---

## 🧪 Testing the Simulator

1. Click **"Place New Call"** on the simulated handset.
2. The welcome audio begins playing: *"Welcome to Okwanchofapa... For English, press 1. For Twi, press 2."*
3. **To test English**: Press <kbd>1</kbd>.
   - Step through Service Menu (<kbd>1</kbd>), Network (<kbd>1</kbd>), MoMo Menu (<kbd>1</kbd>), Recipient (`0553838464#`), KYC Confirmation (<kbd>1</kbd>), Amount (`500#`), and Safe Confirmation (<kbd>1</kbd>).
   - Verify that **only English audio files** are loaded and played.
4. **To test Akan Twi**: Click "Place New Call" and press <kbd>2</kbd>.
   - Step through Network (<kbd>1</kbd>), MoMo Menu (<kbd>1</kbd>), Recipient (`0553838464#`), KYC Confirmation (<kbd>1</kbd>), Amount (`500#`), and Safe Confirmation (<kbd>1</kbd>).
   - Verify that **only Akan Twi audio files** are loaded and played.
5. In the handset display, notice:
   - **🎵 Playing**: Displays the exact audio file path being streamed.
   - **Live VoiceXML**: Displays the dynamic Africa's Talking XML generated for the current step.
   - **Zero-PIN Card**: Appears upon confirmation, prompting the user to enter their secret PIN securely on their screen.

---

## 🌐 Production Deployment (Render)

This repository is configured for one-click deployment via `render.yaml`:
1. Push changes to GitHub.
2. Connect your repository to [Render](https://render.com).
3. Render automatically reads `render.yaml`:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Set the **Callback URL** in the Africa's Talking Dashboard under **Voice ➔ Phone Numbers ➔ `+233 30 804 8098`**:
   ```
   https://your-service.onrender.com/voice-menu
   ```

---

## 👥 Team Anidasoɔ ("Hope")
*Crafting accessible, secure, and human-centered voice technology for Ghana and West Africa.*
