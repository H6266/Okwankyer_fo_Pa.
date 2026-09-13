# Ɔkwankyerɛfo Pa ("The Good Guide")
### A Voice Accessibility & Transaction Safety Layer for Ghana's Digital Financial Services
**Built by Team Anidasoɔ (Hope)**

---

## 🌟 Executive Summary

Digital financial services and Mobile Money (MoMo) are the lifeblood of Ghana's economy, yet millions of citizens—particularly the visually impaired, the elderly, and individuals with low text literacy—remain excluded or vulnerable to fraud and transaction errors. Standard USSD interfaces (`*170#`) rely heavily on visual menus, rapid screen timeouts, and unforgiving text prompts.

**Ɔkwankyerɛfo Pa ("The Good Guide")** is not just an ordinary IVR menu. It is an **independent Voice Accessibility and Safety Layer** that bridges the gap between everyday callers and existing telecom/banking services. 

Through natural local language speech (**Akan / Twi** and English), structured voice navigation grammar, real-time recipient verification (KYC lookup), and a strict **Zero-PIN Security Gate**, Ɔkwankyerɛfo Pa ensures that anyone can transact with confidence, clarity, and safety using any basic feature phone.

---

## 🏗️ Architectural Innovation: The Bridge Layer

Rather than rebuilding existing mobile networks or banking backends, **Ɔkwankyerɛfo Pa sits as an intelligent middleware** between the caller and digital providers.

```
                    EXISTING DIGITAL WORLD
  ┌─────────────────────────────────────────────────────────┐
  │   MTN MoMo   │  Telecel Cash  │  AT Money  │   Banks    │
  └────────────────────────────▲────────────────────────────┘
                               │
                               │ Telecom / Banking APIs
                               │
                 ┌─────────────┴─────────────┐
                 │      ƆKWANKYERƐFO PA      │
                 │   VOICE ACCESSIBILITY     │
                 │          LAYER            │
                 └─────────────▲─────────────┘
                               │
                               │ Africa's Talking Voice Gateway
                               │ (VoiceXML / HTTP Callbacks)
                               │
                          📞 USER
               (Feature Phone / Smartphone)
```

---

## 🔄 End-to-End User Journey & Call Flow

```
                      USER CALLS
                    +233 30 804 8098
                           │
                           ▼
                 AFRICA'S TALKING GATEWAY
                           │
                           ▼
                  [ 1. WELCOME & LANGUAGE ]
              "Akwaaba kɔ Ɔkwankyerɛfo Pa..."
              [ 1 ] English      [ 2 ] Twi
                           │
                           ▼
                  [ 2. SERVICE SELECTION ]
              [ 1 ] Mobile Money  [ 2 ] Banking
                           │
                           ▼
                  [ 3. PROVIDER SELECTION ]
              [ 1 ] MTN   [ 2 ] Telecel   [ 3 ] AT
                           │
                           ▼
                  [ 4. ACTION SELECTION ]
              [ 1 ] Send Money    [ 2 ] Balance
                           │
                           ▼
                 [ 5. ENTER RECIPIENT ]
                    Dial 0241234567#
                           │
                           ▼
                 VALIDATION & KYC ENGINE
                 ├── Length & prefix verified?
                 └── Name resolved ("Kofi Annan")
                           │
                           ▼
                   [ 6. ENTER AMOUNT ]
                       Dial 50*00#
                           │
                           ▼
             ╔═════════════════════════════════════╗
             ║   [ 7. "SAFE CONFIRMATION" GATE ]   ║
             ║  "You are sending GH₵50 to          ║
             ║   Kofi Annan, ending in 4567."      ║
             ║  [ 1 ] Confirm  [ 2 ] Edit  [ 0 ] X ║
             ╚═════════════════════════════════════╝
                           │
                  ┌────────┴────────┐
                  │                 │
             [ 1 ] CONFIRM     [ 0 / 2 ] CANCEL / EDIT
                  │                 │
                  ▼                 ▼
          [ ZERO-PIN GATE ]     ABORTED SAFELY
        Prompt caller to enter  No funds deducted.
        PIN securely on screen.
                  │
                  ▼
              CALL ENDS
```

---

## 🛡️ Core Pillars & Innovations

### 1. The "Safe Confirmation" Engine
Transaction errors cost Ghanaians millions in unrecoverable funds. Ɔkwankyerɛfo Pa intercepts the transaction before any money moves by performing real-time recipient resolution and reading it back in clear human language:
> **Twi:** *"Woremane sika cedi 50 kɔma Kwame Mensah a ne nɔma wie 4567. Sɛ wopene so a, mia baako. Sɛ worepɛ sesa no a, mia mmienu. Sɛ worepɛ agyae koraa a, mia hwee."*
>
> **English:** *"You are sending 50 Ghana Cedis to Kwame Mensah, ending in 4567. Press 1 to confirm, 2 to re-enter details, or 0 to cancel."*

### 2. The Zero-PIN Voice Security Gate
*Security Rule:* **Ɔkwankyerɛfo Pa NEVER asks users to speak or dial their secret MoMo PIN over the voice call.**
- Spoken PINs in public or over audio recordings expose users to eavesdropping and social engineering.
- Instead, upon voice confirmation, the system triggers the carrier's native USSD screen push: *"Transaction authorized. Please check your screen now to enter your Mobile Money PIN privately."*

### 3. Universal Voice Interaction Grammar
A standardized, predictable navigation syntax ensures elderly or non-tech-savvy users never feel trapped in a menu:

| Key | Action | Function |
|:---:|:---|:---|
| <kbd>#</kbd> | **Submit** | Submits multi-digit input (recipient phone number or amount). |
| <kbd>0</kbd> | **Cancel** | Immediately aborts the transaction and exits safely. |
| <kbd>8</kbd> | **Back** | Navigates back to the preceding menu level. |
| <kbd>9</kbd> | **Repeat** | Replays the current spoken instructions. |
| <kbd>*</kbd> | **Decimal** | Inputs pesewas (e.g., `50*50#` = GH₵50.50). |

### 4. Hybrid Audio Engine (Pre-Recorded Twi + Dynamic TTS)
- Pre-recorded, natural human voice clips (`audio/intro.mp3`, `audio/confirm_twi.mp3`, `audio/success_twi.mp3`) deliver culturally warm and comforting guidance.
- Fallback dynamic synthesis smoothly reads dynamic variables like currency amounts and verified recipient names.
- Served with HTTP 206 Byte-Range streaming headers (`Accept-Ranges: bytes`) for real-time cellular streaming over Africa's Talking.

---

## 📁 Repository Structure

```
├── africastalking/         # Africa's Talking Voice & SMS API SDK wrappers
├── audio/                  # Pre-recorded native audio clips (MP3/WAV)
│   ├── intro.mp3           # Welcome & Language selection
│   ├── confirm_twi.mp3     # Safe confirmation prompt in Akan (Twi)
│   ├── confirm_en.mp3      # Safe confirmation prompt in English
│   ├── success_twi.mp3     # Authorization feedback in Twi
│   └── cancel_twi.mp3      # Safe cancellation notice in Twi
├── server.ts               # Core Engine: Express server, VoiceXML flows, KYC validation
├── render.yaml             # Render deployment blueprint (Node.js runtime)
├── package.json            # Node.js dependencies & build scripts
├── tsconfig.json           # TypeScript configuration
└── README.md               # Architecture documentation & Hackathon brief
```

---

## 🚀 Deployment & Configuration

### 1. Environment Variables

| Variable | Description | Example |
|---|---|---|
| `AT_USERNAME` | Africa's Talking account username | `sandbox` or `production_user` |
| `AT_API_KEY` | Africa's Talking API key | `atsk_...` |
| `AT_VOICE_NUMBER`| Virtual phone number assigned by AT | `+233308048098` |
| `BASE_URL` | Public HTTPS domain of the deployed server | `https://okwankyer-fo-pa.onrender.com` |
| `PORT` | Local web server listening port | `3000` |

### 2. Render Deployment (`render.yaml`)
This service is built for 100% automated deployment on Render using the Node.js runtime:
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Port:** Auto-routed to port `3000`

### 3. Africa's Talking Callback Configuration
In the **Africa's Talking Dashboard** under **Voice ➔ Phone Numbers ➔ `+233308048098`**:
- **Callback URL:** `https://okwankyer-fo-pa.onrender.com/voice-menu`

---

## 🔮 Future Roadmap

```
  Phase 1 (Complete)   Phase 2 (Current)     Phase 3 (Next)          Phase 4 (Scale)
┌────────────────────┐ ┌───────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│ Voice Foundation   │ │ Local Dialects    │ │ Deep Telco Adapters │ │ Public Services     │
│ Africa's Talking   │ │ Akan Twi Engine   │ │ Direct MoMo API     │ │ NHIS Renewal, ECG   │
│ Inbound Callback   │ │ Safe Confirmation │ │ Banking Adapters    │ │ Prepaid, Water Bills│
│ Grammar (#, 0, 8)  │ │ KYC Resolution    │ │ Ga, Ewe & Dagbani   │ │ Voice AI Assistant  │
└────────────────────┘ └───────────────────┘ └─────────────────────┘ └─────────────────────┘
```

1. **Additional Ghanaian Languages:** Expanding beyond English and Akan (Twi) to Ga, Ewe, and Dagbani.
2. **Direct Bank & Fintech Integrations:** Pluggable adapters for Ghana Pay, GhIPSS Instant Pay (GIP), and commercial banks.
3. **Government Services (GovTech):** Voice-guided NHIS registration/renewal and utility bill payments (ECG, Ghana Water).

---

## 👥 Team Anidasoɔ ("Hope")

*Crafting accessible, secure, and human-centered voice technology for Ghana and West Africa.*
