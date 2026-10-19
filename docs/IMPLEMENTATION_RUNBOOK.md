# Ɔkwankyerɛfo Pa: Telephony, HCI Lab Speech API & Quota Defense Implementation Runbook

## 1. Executive Summary & Objective

This document is the authoritative, self-contained implementation plan for **Ɔkwankyerɛfo Pa**. If any session encounters a quota limit or switches accounts, this document provides the exact architectural contracts, file paths, code structures, and verification steps required to resume and complete the build immediately without lost context.

* **Target Milestone:** Final Presentation on **October 24, 2026**.
* **Key Technology Integrations:**
  * **Telephony Gateway:** Africa's Talking Voice (`/voice/incoming-call`, `/voice/speech-fallback`, VoiceXML).
  * **Local Language Speech:** University of Ghana HCI Lab API (`lab-subscription-platform.vercel.app`) for Akan Twi ASR (`/api/v1/asr`) and TTS (`/api/v1/tts`).
  * **AI Reasoning Cascade:** Google Gemini 3.8 Flash $\rightarrow$ Groq $\rightarrow$ Local Deterministic Ghanaian Brain.
  * **Financial Engine:** MTN MoMo Open API (Collections & Disbursements) with strict Zero-PIN security.
  * **Hosting Environment:** Render Web Service (Node.js 22 runtime, dynamic port binding, public HTTPS resolution).

---

## 2. API Credentials & Environment Variables

Ensure these environment variables are documented in `.env.example` and set in production/Render:

```env
# Telephony (Africa's Talking)
AT_USERNAME=sandbox
AT_API_KEY=atsk_...
AT_VOICE_NUMBER=+233308048098
AT_WEBHOOK_SECRET=

# Ghanaian Language Speech (HCI Lab)
UG_HCI_LAB_API_KEY=speech_live_...
UG_HCI_LAB_URL=https://lab-subscription-platform.vercel.app

# AI Central Brain Cascade
GEMINI_API_KEY=AIzaSy...
GEMINI_MODEL=gemini-3.8-flash

# MTN Mobile Money API
MOMO_SUBSCRIPTION_KEY=...
MOMO_API_USER_ID=...
MOMO_API_KEY=...
MOMO_TARGET_ENV=sandbox
MOMO_CURRENCY=GHS

# Render Deployment
PORT=3000
RENDER_EXTERNAL_URL=https://okwankyer-fo-pa.onrender.com
```

---

## 3. Quota Constraints & Zero-Waste Defense Rules

### Subscription Limits (Free Tier)
* **ASR (Speech-to-Text):** 10 requests / day | 50 requests / week | 30 minutes audio / week
* **TTS (Text-to-Speech):** 15 requests / day | 70 requests / week | 5,000 characters / week | Max 250 chars / req
* **Rate Limit:** 5 requests / minute
* **Reset Timers:** Daily reset at 00:00 UTC; Weekly reset every Monday at 00:00 UTC.

### Defense Rules
1. **Studio Audio First:** 100% of standard prompts use the 126 authentic `.m4a`/`.aac` human studio recordings in `Audio_files/Twi/` (0 API calls, 0 quota).
2. **Permanent Disk Caching:** All dynamic TTS outputs are hashed with SHA-256 and stored in `.cache/hci_tts/<hash>.wav`. Subsequent requests for identical readbacks hit disk cache with 0 API calls.
3. **Dual-Mode DTMF:** Numbers and confirmation choices default to `<GetDigits>` keypad presses (0 ASR calls). Voice ASR is only used when the caller explicitly speaks.
4. **Verbatim to AI:** Transcripts are passed directly to the AI Brain without brittle regex preprocessing. The AI understands Akan numbers, mental math (*"half of 90"*), and mid-turn corrections in a single pass.
5. **Circuit Breaker:** In-memory counter locks live requests when daily count reaches **8/10 ASR** or **12/15 TTS**, smoothly falling back to local Piper TTS or studio clips to prevent account lockout.
6. **Isolated Tests:** Vitest test suites and build scripts (`npm test`, `compile_applet`) are strictly mocked and never make external HTTP calls.

---

## 4. Phase-by-Phase Implementation Blueprint

### Phase 1: HCI Lab Client & Quota Guard (`src/services/hciLabService.ts`)
* Create `HciLabService` with:
  * Persistent caching in `.cache/hci_tts/` for audio buffers.
  * Strict adherence to API schema: `model_type: "ss"`, `speaker: "PT"`, max 250 characters.
  * In-memory usage tracker (`requestsToday`, `requestsThisWeek`, `charsThisWeek`) resetting at 00:00 UTC.
  * Methods:
    * `isConfigured(): boolean`
    * `getUsageReport(): HciLabUsageReport`
    * `synthesize(text: string, options?: { forceLive?: boolean }): Promise<Buffer>`
    * `transcribe(audioBuffer: Buffer, mimeType?: string): Promise<{ text: string; confidence: number }>`
    * `healthCheck(): Promise<{ ready: boolean; quotaRemaining: number }>`

### Phase 2: Telephony Host & Port Resolution (`src/serverApp.ts` & `src/routes/voiceRoutes.ts`)
* Respect dynamic port binding: `process.env.PORT || 3000`.
* In `src/routes/voiceRoutes.ts`, implement a robust `resolvePublicBaseUrl(req: Request)` helper:
  1. Priority 1: `process.env.RENDER_EXTERNAL_URL`
  2. Priority 2: `req.headers["x-forwarded-proto"] + "://" + req.headers["x-forwarded-host"]`
  3. Priority 3: `http://localhost:${config.port}`
* Ensure all `<Play>`, `<Redirect>`, and `<Record callbackUrl>` VoiceXML tags use this resolved public URL.

### Phase 3: Africa's Talking `<Record>` & ASR Webhook (`src/routes/voiceRoutes.ts`)
* Wire `/voice/speech-fallback`:
  * Receives `RecordingUrl` and `sessionId` from Africa's Talking.
  * Enforces elderly-friendly `<Record>` parameters:
    * `timeout="8"` (8-10 seconds initial pause).
    * `maxLength="15"` (15 seconds speaking window).
    * `trimSilence="true"`.
  * Silence / No-Response Handling:
    * Turn 1 silence $\rightarrow$ Plays `Audio_files/Twi/12.Accessibility & Help/TAKE YOUR TIME.aac`.
    * Turn 2 silence $\rightarrow$ Plays `Audio_files/Twi/10.Voice Understanding & Verification/Please respond.aac`.
    * Turn 3 silence $\rightarrow$ Plays `Audio_files/Twi/12.Accessibility & Help/VOICE OR KEYPAD.aac`.
  * Audio Ingestion:
    * Downloads `RecordingUrl` with a hard 1,000ms timeout.
  * Zero-PIN Sanitization:
    * Scans buffer/text for 4-digit PIN patterns. If detected, wipes immediately, plays `Pin block.aac`, and switches to DTMF `<GetDigits numDigits="4">`.
  * Direct AI Handover:
    * Forwards verbatim transcript to `brain.process({ utterance, sessionId, language: "twi" })`.

### Phase 4: Dynamic Akan TTS & Audio Streaming (`src/routes/voiceRoutes.ts`)
* When the call reaches the confirmation step (`safe-confirmation`):
  * Compose dynamic readback: *"Wo de sika GHS [amount] rekɔma [recipientName] wɔ nɔmba [phone] so. Wopene so a, mia baako."*
  * Check disk cache in `.cache/hci_tts/<hash>.wav`.
  * If missing and quota permits, call `hciLabService.synthesize(text)`. If quota locked, fallback to local Piper / studio chunking.
  * Expose route `/audio/dynamic-prompt/:id.wav` with HTTP 206 Partial Content support for telephony streaming.
  * Output VoiceXML: `<Play>https://<render-url>/audio/dynamic-prompt/<id>.wav</Play>`.

### Phase 5: Developer Dashboard & Phone Simulator Integration
* In `src/pages/dashboard/PhoneSimulatorPage.tsx`:
  * Add a Quota Status Bar showing live remaining ASR/TTS daily calls (e.g. `ASR: 10/10 remaining`, `TTS: 15/15 remaining`).
  * Add a "Mock Mode (Zero Quota)" vs "Live HCI Lab" toggle.
* In `src/pages/dashboard/AsrLabPage.tsx` and `TtsLabPage.tsx`:
  * Surface HCI Lab as a selectable provider alongside Gemini and Local Vosk/Piper.

---

## 6. Emergency Recovery & Cross-Account Handover

If token quota runs out on the AI Studio account:
1. Copy this file (`docs/IMPLEMENTATION_RUNBOOK.md`).
2. In the new account, provide the prompt: *"Resume implementation following docs/IMPLEMENTATION_RUNBOOK.md starting from Phase [X]"*.
3. Proceed directly to the pending phase without re-architecting.
