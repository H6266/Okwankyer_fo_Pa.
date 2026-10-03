# AI Layer Audit: Ɔkwankyerɛfo Pa

**Date:** 2026-10-03  
**Auditor:** Principal AI & Telephony Architect  
**Objective:** Comprehensive inventory of all AI and Gemini model touchpoints across the codebase prior to architectural upgrade.

---

## 1. Inventory of AI Model Invocations

| File | Subsystem / Function | Model Used | Timeout | On-Failure Behavior | Issues / Violations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `src/modules/sttService.ts` | `transcribeAudioBufferWithGemini` | `gemini-3.1-flash-lite`, `gemini-flash-latest`, `gemini-3.8-flash` | **None** (unbounded await) | Iterates model array on error/429; returns `{ text: "empty", confidence: 0.1 }` on total failure | • Hardcodes fake confidence `0.95` on any non-empty text<br>• Uses text models instead of recommended `gemini-3.5-transcribe`<br>• No timeout on network `fetch` or model call<br>• No PIN detection or immediate scrubbing<br>• No zod schema validation |
| `src/modules/nluService.ts` | `parseUserIntent` | `gemini-3.1-flash-lite`, `gemini-flash-latest`, `gemini-3.8-flash` | **None** (unbounded await) | Iterates candidate models; on total failure falls back to `classifyIntentLocally` | • Untrusted caller speech directly concatenated into prompt (prompt injection vulnerability)<br>• Uses `JSON.parse` without zod validation<br>• Hardcodes confidence `0.85` or local static confidence (`0.94`, `0.80`, `0.25`)<br>• Duplicates logic from `src/ai_system/understanding/` |
| `src/ai_system/perception/audioIngestor.ts` | `transcribe` | `AI_CONFIG.transcriptionModel` (`gemini-3.5-transcribe`) | **None** (unbounded await) | Returns empty string with confidence `0.0` | • Contains fake results in test mode: `if (process.env.VITEST) return { text: "send 100 to Kwame", confidence: 0.95 }`<br>• Duplicates `sttService.ts` |
| `src/ai_system/understanding/reasoningEngine.ts` | `reason` | `AI_CONFIG.model` (`gemini-3.8-flash`) | 2500ms (`Promise.race`) | Falls back to `this.deterministicReasoning` | • Uses unescaped user string in prompt<br>• Parses JSON without zod schema validation<br>• Vitest bypasses live reasoning |
| `src/ai_system/providers/modelAdapter.ts` | `reason` | `AI_CONFIG.model` (`gemini-3.8-flash`) | 2500ms (`Promise.race`) | Falls back to `this.fallbackReasoning` | • Duplicate copy of `reasoningEngine.ts`<br>• Hardcodes `confidence: 0.85` if omitted<br>• Unchecked JSON parsing |
| `src/ai_system/speech/tts/ttsAdapter.ts` | `synthesize` | `AI_CONFIG.ttsModel` (`gemini-3.8-flash-lite-tts`) | **None** (unbounded await) | Returns `{ providerUsed: "error-fallback" }` | • No request timeout<br>• Does not validate WAV headers or byte integrity |
| `src/ai_system/voice/liveVoiceGateway.ts` | `setupLiveConnection` | `AI_CONFIG.liveModel` (`gemini-3.8-live`) | **None** on connection | WebSocket logs warning; client falls back | • Not wired to Africa's Talking telephone path (which is HTTP webhook based)<br>• Dead/experimental for production IVR |
| `src/services/healthService.ts` | `probeGeminiHealth` | `gemini-2.5-flash` | 4000ms | Returns health check degradation | • Uses outdated `gemini-2.5-flash` instead of canonical model |
| `ai_system/transcriptionEngine.ts` | `transcribe` | `DEFAULT_AI_CONFIG.geminiModel` | None | Returns empty | **Dead code** (root duplicate) |
| `ai_system/nluEngine.ts` | `understand` | `DEFAULT_AI_CONFIG.geminiModel` | None | Local regex fallback | **Dead code** (root duplicate) |
| `ai_system/speechSynthesisEngine.ts` | `synthesize` | `DEFAULT_AI_CONFIG.geminiModel` | None | Empty buffer | **Dead code** (root duplicate) |

---

## 2. Dead Code & Duplications

1. **Root `ai_system/` Directory (`/ai_system/*`):**
   - Contains: `config.ts`, `dialogueEngine.ts`, `index.ts`, `nluEngine.ts`, `speechSynthesisEngine.ts`, `transcriptionEngine.ts`, `types.ts`, `README.md`.
   - **Finding:** Completely orphaned. Nothing in `src/`, `server.ts`, or `tests/` imports from `/ai_system`. All active code uses `src/ai_system` or `src/modules`.
   - **Action:** Delete root `/ai_system` to eliminate confusion and dead-code drag.

2. **Divergent NLU Implementations:**
   - `src/modules/nluService.ts` vs `src/ai_system/understanding/reasoningEngine.ts` vs `src/ai_system/providers/modelAdapter.ts`.
   - `src/routes/voiceRoutes.ts` and `src/ai_eval/evalHarness.ts` call `src/modules/nluService.ts`.
   - `src/routes/aiRoutes.ts` calls `src/ai_system/index.ts`.
   - **Action:** Unify the NLU engine into a single canonical, high-performance module with strict Zod validation, defensive prompt isolation, and real confidence calculation.

3. **Divergent STT Implementations:**
   - `src/modules/sttService.ts` vs `src/ai_system/perception/audioIngestor.ts`.
   - `voiceRoutes.ts` uses `speechToText` in `src/modules/sttService.ts`.
   - **Action:** Unify into a high-speed, reliable STT service targeting `gemini-3.5-transcribe` with bounded timeouts, download retry/guards, real confidence measurement, and PIN scrubbing.

---

## 3. Evaluation Gap Analysis

- **Current State (`src/ai_eval/evalHarness.ts`):** Only evaluates synthetic typed text strings against `parseUserIntent`.
- **Missing Ground Truth:**
  - Zero measurement of speech recognition (ASR/STT) on real recorded audio files (`.mp3` / `.wav`).
  - No evaluation of acoustic noise, phone codec compression (GSM/PSTN), or spoken Ghanaian English and Akan Twi.
  - No measurement of STT latency under realistic carrier payload conditions.
- **Required Upgrade:**
  - Create an audio-based evaluation harness with real audio files from the repo (`audio/English/*.mp3`, `audio/Twi/*.mp3`, generated test speech buffers).
  - Measure Word Error Rate (WER) / Intent Error Rate, actual latency (ms), and DTMF fallback triggering.

---

## 4. Boot-Time Model Verification

- **Current State (`src/ai_system/core/aiBootstrap.ts`):** Only compares model strings against hardcoded in-memory sets (`VALID_REASONING_MODELS.has(...)`).
- **Violation of Rule 8:** If Google deprecates a model or if an API key lacks access, the app boots without noticing until a user call fails.
- **Required Upgrade:** At boot time, call `@google/genai` `ai.models.list()`, inspect available models, verify each configured model exists and is permitted, and fail fast or fall back gracefully with clear logging.
