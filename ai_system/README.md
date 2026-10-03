# Ɔkwankyerɛfo Pa - AI System Architecture

The `/ai_system` folder houses the autonomous intelligence engine for Ɔkwankyerɛfo Pa, designed specifically for Ghanaian voice accessibility, multilingual financial transactions, and zero-PIN security.

---

## 🏛️ Subsystem Architecture

```
/ai_system
├── index.ts                  # Unified package export (aiSystem)
├── types.ts                  # Comprehensive TypeScript interfaces & types
├── config.ts                 # Model definitions, Akan Twi phonetics, system prompts
├── transcriptionEngine.ts    # Multimodal Speech-to-Text (ASR) with Twi/English support
├── nluEngine.ts              # Intent classification, slot extraction, confidence scoring
├── dialogueEngine.ts         # Conversational state machine & multi-turn session tracking
├── speechSynthesisEngine.ts  # Spoken prompt generation & voice synthesis
└── README.md                 # System overview and integration guide
```

---

## 🚀 Key Capabilities

### 1. Ghanaian Multilingual Speech-to-Text (`transcriptionEngine`)
- Direct transcription using Google Gemini multimodal audio analysis.
- Domain-tailored Akan Twi lexicon: *baako, mmienu, mmiɛnsa, mane sika, tua bill, pene so, twa mu*.
- Automatic dialect recognition (Akan Asante/Akuapem Twi vs. Ghanaian English).
- Code-switching support (e.g. *"Mepɛ sɛ mesend 50 cedis kɔ Kwame nɔmba so"*).

### 2. Natural Language Understanding & Extraction (`nluEngine`)
- **Supported Intents**:
  - `SEND_MONEY`, `PAY_BILL`, `BUY_AIRTIME`, `BUY_DATA`, `CASH_OUT`, `CHECK_BALANCE`, `CHECK_ACCOUNT`
  - Navigation: `CONFIRM`, `CANCEL`, `REPEAT`, `GO_BACK`, `SWITCH_LANGUAGE`, `HELP`, `EXIT`
- **Slot Extraction**:
  - Currency amounts in Ghana Cedis (`GHS`) with pesewas parsing.
  - 10-digit Ghanaian telco numbers (`024`, `054`, `055`, `020`, `050`, `027`, `057`).
  - Telco carrier auto-identification (MTN, Telecel, AT).
- **Zero-PIN Security Gate**:
  - Actively intercepts and flags whenever a user speaks 4-digit or 6-digit PIN numbers.
  - Immediately blocks PIN processing over voice to prevent eavesdropping and credential leakage.

### 3. Conversational State Machine (`dialogueEngine`)
- Maintains per-caller session memory (`DialogueSessionState`).
- Tracks progression across conversational milestones:
  1. `LANGUAGE_SELECT`
  2. `MAIN_MENU`
  3. `RECIPIENT_INPUT`
  4. `RECIPIENT_CONFIRM` (KYC Verified Name readback)
  5. `AMOUNT_INPUT`
  6. `TRANSACTION_CONFIRM` (Explicit verbal confirmation)
  7. `HANDOFF_PIN` (Handset screen prompt handoff)
- Configurable anti-hang retry limits and graceful fallbacks.

### 4. Spoken Voice Synthesis (`speechSynthesisEngine`)
- Natural Ghanaian vocal cadence using Gemini TTS models.
- Stylized warmth and clarity tailored for elderly, rural, and visually impaired users.

---

## 💻 Quick Code Example

```typescript
import { aiSystem } from "./ai_system";

// 1. Analyze user speech or text
const analysis = await aiSystem.analyzeUtterance(
  "Mepɛ sɛ mesend cedi aduonum kɔ Kwame Mensah so 0553838464",
  "twi"
);

console.log("Intent:", analysis.intent);           // "SEND_MONEY"
console.log("Amount:", analysis.amount);           // 50
console.log("Recipient:", analysis.recipientPhone); // "0553838464"
console.log("Network:", analysis.network);         // "MTN"

// 2. Process a full dialogue turn with session memory
const result = await aiSystem.handleTurn("session-user-01", {
  text: "baako", // "1" / "Yes" in Twi
});

console.log("Next prompt:", result.prompt.spokenText);
console.log("Next step:", result.session.currentStep);
```
