# Implementation Plan: Africa's Talking Telephony Audio Playback & VoiceXML Harmonization

Ensure real phone calls placed to the Africa's Talking voice gateway play audio reliably and seamlessly, matching the exact behavior of the Interactive Call Simulator.

---

## 1. Problem Diagnosis & Root Causes

1. **Audio Codec Incompatibility**:
   - The studio audio files in the repository are `.m4a` (MPEG-4 AAC) and `.aac` containers.
   - Web browsers (used by the simulator) natively decode `.m4a` and `.aac`.
   - Africa's Talking telephony media servers (which interface directly with telecommunication carrier trunks like MTN, Telecel, and AT Ghana) strictly require standard **MP3** (`audio/mpeg`) or **PCM WAV** (16-bit mono). When Africa's Talking encounters `.m4a`/`.aac`, its media gateway fails to decode the stream, producing complete silence on the phone line.

2. **Premature VoiceXML `<Redirect>` Audio Cutoff**:
   - In `handleInboundCall`, the server responds with:
     ```xml
     <Play url="..."/>
     <Redirect>.../language-selection</Redirect>
     ```
   - In Africa's Talking VoiceXML dialect, an unnested `<Redirect>` is executed immediately without waiting for `<Play>` to finish, aborting or skipping playback before the caller hears a single sound.

3. **Public URL and Protocol Integrity**:
   - The audio URLs passed inside `<Play url="...">` must be absolute, publicly accessible HTTPS URLs (`https://<domain>/audio/...`).
   - If behind reverse proxies (Cloud Run, Render, load balancers), `X-Forwarded-Proto` must resolve to `https` and the host header must reflect the external public origin.

---

## 2. Proposed Architecture & Solution

### A. Dynamic On-the-Fly MP3 Transcoding & Persistent Cache (`src/audio/streaming.ts`)
- Leverage the environment's native `ffmpeg` engine to convert `.m4a` and `.aac` studio recordings to clean **16kHz mono MP3** (`audio/mpeg`).
- Implement an on-disk cache directory (`.cache/audio_mp3/`) and in-memory buffer cache:
  - First request: ffmpeg converts the source audio to MP3 in ~50ms.
  - Subsequent requests: Served instantaneously from cache (< 5ms response time).
- Telephony routes will serve `.mp3` extension URLs for all `<Play>` directives, ensuring Africa's Talking receives guaranteed compliant MP3 audio with proper `Content-Type: audio/mpeg` and `Accept-Ranges` support.

### B. VoiceXML Callflow Harmonization (`src/routes/voiceRoutes.ts`)
- Eliminate the standalone `<Play>` + immediate `<Redirect>` pattern on inbound calls.
- Unify inbound call entry with Language Selection:
  - When a call connects, Africa's Talking receives a unified `<GetDigits>` block containing the Welcome audio and the Language Selection audio prompt:
    ```xml
    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/language-selection?sessionId=${sessionId}">
        <Play url="${baseUrl}/audio/.../Welcome.mp3"/>
        <Play url="${baseUrl}/audio/.../Language_selection.mp3"/>
    </GetDigits>
    <Record ... callbackUrl="${baseUrl}/speech-fallback?..."/>
    ```
  - Callers hear the welcome greeting and language choices aloud, and can barge in at any moment by pressing `1` (English) or `2` (Twi) or speaking their choice.

### C. Prompt URL Resolution (`src/modules/ttsService.ts` & `src/audio/recordingRegistry.ts`)
- Ensure `resolvePromptXml` and canonical prompt builders output `.mp3` URLs for all telephony `<Play>` tags.
- Fallback gracefully to `<Say voice="female">` if any specific audio file is completely missing or during dynamic slot readouts.

### D. Verification & Automated Testing
- Add automated end-to-end unit tests verifying:
  - Audio streaming route returns valid `audio/mpeg` with `HTTP 200/206` when requesting `.mp3`.
  - Inbound call webhook produces valid, non-blocking VoiceXML with no bare `<Redirect>` after `<Play>`.
  - Transcoding cache generates and serves MP3 files without stalling telephony timeouts.

---

## 3. Implementation Steps

1. **Update `src/audio/streaming.ts`**:
   - Add `transcodeToMp3(sourcePath: string): Promise<string>` using `ffmpeg`.
   - When `/audio/*` is requested with `.mp3` extension, resolve the source file (`.mp3`, `.m4a`, or `.aac`) and transcode if needed, serving cached MP3 with `audio/mpeg` headers.

2. **Update `src/modules/ttsService.ts`**:
   - Ensure `resolvePromptXml` appends or transforms audio URLs to `.mp3` so Africa's Talking receives explicit MP3 endpoints.

3. **Update `src/routes/voiceRoutes.ts`**:
   - Refactor `handleInboundCall` to avoid premature redirect and cleanly play the welcome prompt alongside the language prompt inside `<GetDigits>`.
   - Ensure all telephony `<Play>` elements reference `.mp3` URLs.

4. **Verify Build & Run Telephony Tests**:
   - Run `compile_applet` and targeted Vitest test suites to verify zero regressions and complete compatibility.
