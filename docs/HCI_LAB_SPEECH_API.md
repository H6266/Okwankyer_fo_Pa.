# HCI Lab Akan Speech API (ASR & TTS) — Specification, Constraints & Quota Defense Blueprint

## 1. Executive Summary & Target Timeline

This document establishes the official integration specification, architectural boundaries, and quota protection protocols for the **University of Ghana HCI Lab Speech API** (`lab-subscription-platform.vercel.app`) within **Ɔkwankyerɛfo Pa**.

* **Target Presentation Date:** **October 24, 2026** (8 days away)
* **Goal:** Deliver native Akan Twi speech recognition (ASR) and neural speech synthesis (TTS) over live telephony and phone simulator, while guaranteeing that testing, rehearsals, and the final demonstration **never exhaust or lock the free-tier API quota**.

---

## 2. API Contract & Endpoints

### 2.1 Base Configuration & Authentication
* **Base URL:** `https://lab-subscription-platform.vercel.app`
* **Authentication:** Every request must include an `Authorization` header with a Bearer token:
  ```http
  Authorization: Bearer speech_live_xxxxxxxxxxxxxxxxxxxxxxxx
  ```
* **Environment Variables:**
  * `UG_HCI_LAB_API_KEY`: The live bearer token (`speech_live_...`)
  * `UG_HCI_LAB_URL`: `https://lab-subscription-platform.vercel.app` (default)

---

### 2.2 Speech-to-Text (ASR)
Upload an audio recording and receive a recognized transcript in Akan Twi or Ghanaian English.

* **Method & Path:** `POST /api/v1/asr`
* **Content-Type:** `multipart/form-data`
* **Form Field:** `file` (Required)
* **Supported Formats:** `wav`, `mp3`, `ogg`, `oga`, `opus`, `flac`, `m4a`, `mp4`, `aac`, `webm`, `aiff`, `aif`, `wma`, `amr`
* **Constraints:**
  * **Max audio duration:** 120 seconds per request
  * **Max file size:** 10 MB per request
  * **Concurrency:** Maximum 2 concurrent requests
* **Example Request:**
  ```bash
  curl -X POST https://lab-subscription-platform.vercel.app/api/v1/asr \
    -H "Authorization: Bearer speech_live_xxxxx" \
    -F "file=@caller_utterance.mp3"
  ```
* **Response Format:**
  ```json
  {
    "transcript": "Mepɛ sɛ memane sika aduonum kɔma Kwame Mensah",
    "confidence": 0.94,
    "language": "tw"
  }
  ```

---

### 2.3 Text-to-Speech (TTS)
Send text and receive a native Akan speech audio stream as a binary WAV file.

* **Method & Path:** `POST /api/v1/tts`
* **Headers:**
  * `Authorization: Bearer speech_live_xxxxx`
  * `Content-Type: application/json`
* **Body Parameters:**
  | Field | Type | Rule | Description |
  |---|---|---|---|
  | `text` | string | **Required** | The text to synthesize in Akan Twi (max 250 characters). |
  | `model_type` | string | **Required** | Voice model identifier. **MUST ALWAYS BE `"ss"`**. |
  | `speaker` | string | **Required** | Speaker identifier. **MUST ALWAYS BE `"PT"`**. |

* **Example Request:**
  ```bash
  curl -X POST https://lab-subscription-platform.vercel.app/api/v1/tts \
    -H "Authorization: Bearer speech_live_xxxxx" \
    -H "Content-Type: application/json" \
    -d '{"text":"Akwaaba kɔ Okwankyerɛfo Pa. Worebɛmane sika aduonum.","model_type":"ss","speaker":"PT"}' \
    --output synthesized_speech.wav
  ```
* **Response Headers & Payload:**
  * **Content-Type:** `audio/wav` (Binary WAV audio data)
  * `X-Request-ID`: e.g. `req_xxxxx`
  * `X-Model-Used`: e.g. `ss-pt`
  * `X-Speaker-Used`: `PT`
  * `X-Sample-Rate`: `22050`
  * `X-Duration-Sec`: Duration in seconds (e.g. `2.462`)
  * `X-Characters-Used`: Count of characters processed against quota

* **Character Limit:** Strictly **250 characters max** per single request.

---

### 2.4 Error Codes & Payload Structure
When errors occur (quota exhaustion, invalid parameters, upstream failure), the endpoint returns `application/json` instead of audio:
```json
{
  "request_id": "req_xxxxx",
  "error": {
    "code": "weekly_quota_exceeded",
    "message": "Weekly ASR request limit has been reached."
  }
}
```
**Key Error Codes to Handle:**
* `daily_quota_exceeded`: Daily limit reached (resets 00:00 UTC).
* `weekly_quota_exceeded`: Weekly limit reached (resets Monday 00:00 UTC).
* `rate_limit_exceeded`: Sent > 5 requests/min.
* `text_too_long`: Text exceeded 250 characters.
* `invalid_model_type` / `invalid_speaker`: `model_type` was not `"ss"` or `speaker` was not `"PT"`.

---

## 3. Subscription Plan Quotas & Hard Limits

| Resource | Daily Quota | Weekly Quota | Rate Limit | Max Size / Length |
|---|---|---|---|---|
| **ASR (Speech-to-Text)** | **10 requests** | **50 requests** | 5 req / min | 120s / 10MB |
| **ASR Audio Time** | — | **30 minutes** | — | — |
| **TTS (Text-to-Speech)** | **15 requests** | **70 requests** | 5 req / min | 250 chars / req |
| **TTS Characters** | — | **5,000 chars** | — | — |
| **Concurrency** | Max 2 requests simultaneously across both endpoints |

### Reset Schedule
* **Daily Quotas:** Reset at **00:00 UTC** every night.
* **Weekly Quotas:** Reset every **Monday at 00:00 UTC**.

---

## 4. Quota Defense Architecture: The 7 Pillars

To survive until October 24 and ensure 100% reliability during live presentation, we enforce 7 strict architectural rules:

### Pillar 1: 100% Studio Human Audio for Static Prompts (0 Quota)
The repository contains **126 authentic Akan Twi human studio recordings** (`/Audio_files/Twi/`):
* Welcome, greetings, network selection, invalid recipient warnings, PIN security handoff, patience reassurance (`TAKE YOUR TIME.aac`), session timeout, and success receipts.
* **Invariant:** Standard IVR prompts will **NEVER** call the HCI Lab TTS API. They are served directly from local static audio files (`< 5ms` latency, 0 quota used).

### Pillar 2: Permanent Local Disk Caching for Dynamic TTS
* When HCI Lab TTS synthesizes a dynamic readback (e.g. *"Wo de sika aduonum rekɔma Kwame Mensah wɔ 0543546010"*), the returned WAV buffer is immediately hashed (`SHA-256`) and saved to persistent disk storage (`.cache/hci_tts/<hash>.wav`).
* Subsequent calls with the same text serve directly from disk cache.
* **Quota cost on cache hit:** 0 requests, 0 characters.

### Pillar 3: Pre-Synthesized Demo Scenarios (Zero-Burn Rehearsals)
* Common demo scenarios (e.g., *Hannes Aboagye*, *Kwame Nyamebere*, *Ama Mensah*; amounts *5 GHS*, *20 GHS*, *50 GHS*) will be pre-cached into the dynamic audio store before rehearsals.
* Testing and rehearsals will run using pre-synthesized audio with zero live token burn.

### Pillar 4: Dual-Mode DTMF Keypad Entry (0 ASR Quota)
* For phone numbers (e.g. `0543546010`), amounts (`50`), and confirmation choices (`1` or `2`), Africa's Talking captures dual-tone multi-frequency (DTMF) keypad presses via `<GetDigits>`.
* Keypad entries are 100% accurate and consume **0 ASR quota**. Voice ASR is only triggered when the caller chooses to speak.

### Pillar 5: Direct-to-AI Verbatim Reasoning (No Regex Mangling)
* When speech is transcribed by ASR, the raw verbatim transcript is sent directly to the AI Brain (Gemini ➔ OpenAI ➔ Qwen ➔ Local Brain).
* The AI understands Akan numbers, mental math (*"half of 90"*), and mid-turn corrections in a single unified pass. No repetitive re-transcription or secondary verification passes are made.

### Pillar 6: Strict Test & CI Isolation
* `npm test`, `vitest`, `compile_applet`, and GitHub CI runs are strictly forbidden from contacting `lab-subscription-platform.vercel.app`.
* All automated unit and integration tests use deterministic in-memory fixtures.

### Pillar 7: Server-Side Quota Guard & Circuit Breaker
* An in-memory tracker monitors daily and weekly request counts.
* **Safety Thresholds:**
  * If daily ASR reaches **8 / 10** $\rightarrow$ ASR safety lock engages.
  * If daily TTS reaches **12 / 15** $\rightarrow$ TTS safety lock engages.
  * Under safety lock, requests fall back to local Piper TTS / pre-recorded audio chunks to prevent accidental account lockout before presentation day.

---

## 5. System Safety Audit Results

A thorough scan of the current repository confirmed:
1. **No background timers or interval pollers:** Neither `server.ts` nor frontend components poll external speech APIs on loops.
2. **Health checks are passive:** `/api/ai/health` only inspects environment variables and circuit breaker states (0 live API calls).
3. **No automatic ASR/TTS execution on page load:** `AsrLabPage.tsx` and `TtsLabPage.tsx` load local metadata and only execute tests when a user manually clicks an individual "Run Test" button.
4. **Vosk / GhanaNLP fallbacks are safe:** Existing fallback chains are gated behind explicit configuration flags and remain dormant when unconfigured.
