# Automated Akan Twi Audio Playback & Dual-Flow Interaction Architecture

A root-cause analysis and implementation plan to ensure flawless, automatic audio playback across both **Prompt (Deterministic IVR)** and **Conversational (Natural Voice)** flows, leveraging the complete library of genuine Akan Twi studio recordings with seamless speech turn-taking.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Based on your clarifications, the application will prioritize a world-class **Akan Twi voice experience**:
> 1. **Twi Audio Primacy**: Use the complete repository of ready Akan Twi studio recordings for both Twi and English selections (with English subtitles/captions displayed in the UI transcript) until English voice recordings are uploaded.
> 2. **Conversational Speech Turn-Taking**: When in Conversational flow, the system will play the audio prompt automatically, keep the microphone muted during playback to prevent acoustic feedback, and **automatically unmute the microphone the instant playback finishes** so users can speak their answers naturally.
> 3. **Persistent Audio Session Unlock**: Unlock the browser's `AudioContext` and pre-warm the shared `<audio>` element on the initial **Call** / **Dial** button click, ensuring all subsequent turns play automatically without browser autoplay blocks.

---

## 1. Root-Cause Analysis: Why Audios Were Not Playing Automatically

Through thorough inspection of `useAudioPlayer.ts`, `PhoneSimulatorPage.tsx`, `audioPlaybackController.ts`, `serverApp.ts`, and the `/Audio_files` directory structure, four root causes were identified:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ROOT CAUSE BREAKDOWN                              │
├────────────────────────────────┬────────────────────────────────────────────┤
│ 1. Lost Browser Gesture Token  │ Async `fetch()` network requests lose the  │
│    in Async Callbacks          │ user gesture stack. Subsequent `.play()`   │
│                                │ triggers browser `NotAllowedError`.        │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 2. Path & Special Character    │ Directory names contain spaces and `&`     │
│    Encoding Mismatch           │ (e.g., `1.Welcome & Session Start`). URI   │
│                                │ decoding mismatches caused 404/403 blocks. │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 3. Codec & Extension Drift     │ Assets are split across `.m4a` and `.aac`. │
│    (.m4a vs .aac)              │ Certain browser containers reject raw .aac │
│                                │ without an explicit Audio/MPEG MIME type.  │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 4. Conversational Flow Mute    │ In Conversational flow, user speech input  │
│    Lockout                     │ was not triggering prompt playback or was  │
│                                │ prematurely cutting off audio playback.    │
└────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 2. Technical Architecture & Data Strategy

### System Audio & Interaction Flow Diagram

```
                 [ User Clicks "Call" / "Lift Handset" ]
                                   │
              ┌────────────────────▼────────────────────┐
              │  AudioContext Unlocked & Warmed Up      │
              │  (Tokens established on User Gesture)   │
              └────────────────────┬────────────────────┘
                                   │
               ┌───────────────────┴───────────────────┐
               ▼                                       ▼
    ┌───────────────────────┐               ┌───────────────────────┐
    │     PROMPT FLOW       │               │  CONVERSATIONAL FLOW  │
    │  (Structured IVR)     │               │  (Voice & Speech AI)  │
    └──────────┬────────────┘               └───────────┬───────────┘
               │                                        │
     1. Receive Step XML                      1. ASR / User Input Event
               │                                        │
     2. Lookup Akan Twi Asset                 2. Brain Resolves Intent
               │                                        │
     3. Auto-Play Twi Prompt                  3. Auto-Play Twi Audio
        (Single Audio Element)                   (Single Audio Element)
               │                                        │
     4. Wait for DTMF / Speech                          │
        (Keypad / Mic active)                 4. [Audio Finishes Event]
                                                        │
                                              5. Auto-Unmute Microphone
                                                 (User speaks response)
```

---

## 3. Implementation Steps

### Phase 1: Robust Audio Routing & Path Traversal Fix
- Update `src/audio/streaming.ts` and `src/audio/recordingRegistry.ts`:
  - Normalize URL encoding for directories with `&`, spaces, and special Akan characters (such as `ɔ`, `ɛ`).
  - Add fallback lookup across both flat `Audio_files/` and nested `Audio_files/Twi/` directories.
  - Set accurate MIME types (`audio/mp4`, `audio/aac`, `audio/mpeg`) and `Accept-Ranges: bytes` headers for seamless playback in iframe environments.

### Phase 2: Dual-Mode Audio Playback Controller Hardening
- In `src/audio/audioPlaybackController.ts`:
  - Enhance `unlockAudio()` to keep a pre-warmed audio element permanently bound to user gesture.
  - Implement a fallback sequence: Studio Twi Recording → Local Synthesizer → Harmonic Tone.
  - Guarantee `isSpeaking()` status is broadcast reliably to synchronize the microphone state.

### Phase 3: Conversational Auto-Unmute Turn-Taking
- In `src/pages/dashboard/PhoneSimulatorPage.tsx`:
  - In **Prompt Flow**: Play Twi prompt automatically; keep keypad and voice input ready.
  - In **Conversational Flow**:
    - When user sends speech/text, system processes intent and triggers the Twi audio response.
    - While the audio is playing, microphone is muted (visual status: `Speaking 🔊`).
    - As soon as the audio ends, a brief 150ms buffer prevents room echo, then the mic **automatically turns ON** (visual status: `Listening 🎙️`).
    - The user speaks their next answer without clicking any buttons.

### Phase 4: UI Audio Diagnostics & Visual Waveform Indicator
- Add an explicit **Audio Diagnostics Bar** in the simulator phone interface:
  - Shows current audio track (e.g. `Akwaaba Nkaebɔ (OP01.m4a)`).
  - Shows real-time playback progress bar and speaker wave indicator.
  - Displays instant Twi transcript with English translation subtitles.

---

## 4. Verification & Testing Plan
- **Verification 1**: Start call simulation via "Call" button — verify `AudioContext` status is `running` and OP01 Akwaaba plays immediately without user intervention.
- **Verification 2**: Navigate through MoMo transfer in Prompt mode — verify each step (Service -> Provider -> Recipient -> Amount) plays native Twi audio automatically.
- **Verification 3**: Switch to Conversational flow — speak or enter "I want to send money to Kwame" — verify Twi confirmation prompt plays, and microphone auto-unmutes immediately upon playback finish.
