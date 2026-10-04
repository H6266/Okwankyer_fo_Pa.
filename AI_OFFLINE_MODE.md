# Ɔkwankyerɛfo Pa - Offline-First AI Specification (AI_OFFLINE_MODE.md)

## 1. Principle of Full Offline Autonomy
Ɔkwankyerɛfo Pa is designed to operate seamlessly without internet connectivity, external cloud APIs, or a `GEMINI_API_KEY`. The offline engine is **not** a degraded fallback; it is a full-featured, self-contained cognitive platform.

When external AI services are disabled, offline, or experiencing rate-limiting (HTTP 429), the system executes:
```
Caller Audio / Keypad
  ↓
Local Offline ASR (8kHz Telephony / 16kHz Web Audio)
  ↓
Local Fast Language Identification
  ↓
Local Ghana-Aware Speech & Number Normalizer
  ↓
Local Deterministic Ghanaian NLU
  ↓
Local Contextual Reasoning & Coreference Engine
  ↓
Local Dialogue Manager & Single-Slot Clarification
  ↓
Deterministic Safety Gate (Zero-PIN)
  ↓
Local Ghanaian TTS Synthesis (Local Phonetic Audio + Cached Prompt Audio)
  ↓
Caller Audio Stream
```

---

## 2. Supported Offline Modalities & Grammars

The offline engine natively handles:
1. **Languages**:
   - English (standard and Ghanaian English)
   - Akan Twi (Asante and Akuapem dialects)
   - Ghanaian English / Twi code-switching ("I want to send sika kɔ ma me mother")
2. **Keypad DTMF Fallback**:
   - `0`: Return to Main Menu (`HOME`)
   - `8`: Go Back one step (`BACK`)
   - `9`: Repeat the last prompt (`REPEAT`)
   - `#`: Confirm input / Submit digits (`SUBMIT`)
   - `*`: Cancel current task (`CANCEL`)
3. **Conversational Workflows**:
   - `SEND_MONEY`: Transfer money to any valid Ghanaian mobile phone.
   - `BUY_AIRTIME`: Top up airtime for caller or another number.
   - `BUY_DATA`: Purchase data bundles.
   - `PAY_BILL`: Pay utility bills (ECG, GWCL, etc.).
   - `CASH_OUT`: Authorize agent withdrawal.
   - `CHECK_BALANCE`: Explain API balance limitation & direct to USSD `*170#`.
   - `HELP` / `GO_BACK` / `CANCEL` / `REPEAT`.
4. **Context Understanding & Corrections**:
   - Mid-flight amount change ("Actually make that 100").
   - Recipient correction ("Not Ama, send it to Kofi").
   - Same-slot retention ("Same amount", "Send it to the same person").
   - Task interruption ("Wait, check my balance first") and subsequent resumption ("Okay continue").

---

## 3. Local Speech Recognition (Offline ASR)

The offline ASR subsystem accepts both **8 kHz narrowband GSM telephony audio** and **16 kHz wideband audio**.

- **Primary Local Engine**: `OfflineSpeechRecognizer` abstraction utilizing acoustic energy analysis, DTMF decoding, and phoneme pattern matching.
- **Dialect Handling**: Trained on vowel vowel-harmony variations in Akan Twi (`ɛ`, `ɔ`, `ae`, `ie`).
- **Hesitation & Noise Robustness**: Filters out common filler sounds ("uh", "err", "mpo", "saa") and market background noise.

---

## 4. Local Ghanaian Speech Synthesis (Offline TTS)

The offline TTS architecture ensures audio is always returned to the caller:
1. **Local Synthesizer**: Generates standard WAV audio buffers locally based on pitch, cadence, and phoneme frequency modulation.
2. **Pre-recorded Studio Catalog**: 26 authentic Ghanaian studio audio prompts recorded in both English and Akan Twi (`/audio/English/` and `/audio/Twi/`).
3. **Dynamic Spoken Token Splicing**: For numbers, currencies, and names, digits and phrases are verbalized with natural Ghanaian cadence ("zero five five, three eight three, eight four six four").

---

## 5. Verification Checklist for Complete Offline Functionality

| Capability | Behavior When GEMINI_API_KEY is Unset | Test Proving Operation |
|---|---|---|
| Natural Language Understanding | Uses local Ghanaian NLU with calibrated confidence | `tests/offlineAIEngine.test.ts` |
| Twi Language Recognition | Understands Asante and Akuapem intent & numbers | `tests/offlineAIEngine.test.ts` |
| Conversational Slot Revisions | Preserves state through corrections and revisions | `tests/conversationalContextAndCorrection.test.ts` |
| Zero-PIN Security | Redacts spoken PIN and triggers handset security | `tests/pinSecurityAndInvariants.test.ts` |
| Balance Verification | Rejects fake balance; directs to USSD *170# | `tests/truthEngineAndBalance.test.ts` |
| Speech Audio Output | Generates valid WAV audio buffers without network | `tests/offlineAIEngine.test.ts` |
