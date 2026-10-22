# Automatic Audio Playback & Dual-Flow Interaction Architecture

A complete system blueprint to resolve audio autoplay failures, prioritize the 88 verified Akan Twi studio recordings, and enable automatic bidirectional turn-taking (voice and DTMF keypad) across both **Prompt Mode** and **Conversational Mode**.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed via interactive user requirements clarification:
> - **Primary Audio Track**: Focused entirely on ready **Akan Twi studio recordings** (`Audio_files/Twi/...` and `Audio_files/*.m4a`). English audio files will be uploaded in a future phase; the system will play the ready Twi assets directly as the primary default and fallback smoothly to neural speech synthesis without blocking playback.
> - **Dual-Flow Compatibility**: Both the **Prompt format** (step-by-step IVR menus) and the **Conversational format** (freeform natural speech) must accept **both Voice speech and Keypad DTMF** interchangeably.
> - **Automated Turn-Taking & Auto-Unmute**:
>   1. When an audio prompt starts playing, the microphone is automatically muted to prevent acoustic echo feedback into ASR.
>   2. The moment prompt audio finishes (`onEnd`), the microphone automatically un-mutes and actively listens for the user's speech, while keypad DTMF remains simultaneously active.
>   3. As soon as the user responds (voice speech recognized or keypad pressed), the next audio plays automatically, muting the microphone again until completion.

---

### 1. Overview & Core Concept

**Ɔkwankyerɛfo Pa** provides a voice accessibility layer for digital financial services (MTN Mobile Money, Telecel, AT) designed specifically for visually impaired, non-literate, and elderly Ghanaians. 

This update resolves the current root causes of silent playback:
1. **The `<Redirect>` Execution Bug**: When starting at `/voice-menu`, the simulator immediately follows the VoiceXML redirect to `/language-selection` before reaching the audio play call, cutting off the welcome audio.
2. **Language Audio Filtering Mismatch**: The audio resolver strictly required `recording.language === "en"` when the default was English, rejecting the 88 ready Akan Twi studio recordings.
3. **Turn-Taking Gating**: The microphone and audio player did not communicate lifecycle states cleanly, causing audio to be blocked by browser autoplay constraints or microphone contention.

Once implemented, users can dial into the interactive simulator, hear native Akan Twi prompts play automatically without clicking "Play", and immediately speak or press keypad digits to advance the transaction.

---

### 2. User Experience & Visual Design

#### Key User Flows

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CALL INITIATION FLOW                            │
└────────────────────────────────────────────────────────────────────────┘
       │ User clicks "Start Call" or lifts phone handset
       ▼
 ┌───────────────┐        🔊 Auto-plays OP01 / Twi Welcome Prompt
 │ Audio Playback│ ──────► Microphone: MUTED (echo guard active)
 └───────┬───────┘         Visual: Speaker waveform pulsing in emerald
         │
         │ Audio onEnd event triggers automatically
         ▼
 ┌───────────────┐        🎙️ Auto-unmutes microphone
 │ Listening Turn│ ──────► Visual: Green pulsing mic halo + Keypad active
 └───────┬───────┘         Caller can speak Akan Twi/English OR tap keypad
         │
         ├─── Spoken Voice ("Mane sika aduonum kɔma Kwame") ───┐
         │                                                      │
         └─── DTMF Keypad (Taps '1' or '2') ───────────────────┤
                                                                ▼
                                                       ┌─────────────────┐
                                                       │ Process Input & │
                                                       │ Play Next Step  │
                                                       └─────────────────┘
```

#### Dual-Mode Interface Architecture

- **Prompt Mode (Structured Step-by-Step)**:
  - Sequential step progression: Service Selection $\rightarrow$ Recipient Entry $\rightarrow$ Amount Entry $\rightarrow$ Safe Confirmation $\rightarrow$ Zero-PIN Handoff.
  - Plays canonical studio audio clips (OP01, OP10, OP16, OP32, OP40, etc.).
  - Accepts both single-digit voice utterances (*"Baako"*, *"One"*) and keypad clicks (*"1"*).

- **Conversational Mode (AI Brain Natural Language)**:
  - Freeform multi-slot speech parsing (*"I want to send 20 cedis to Ama Mensah"*).
  - Plays composite native audio sequences (e.g. `OP10_send_money` + dynamic recipient readback) or neural Twi synthesis.
  - Automatically verifies KYC recipient and transitions to safe confirmation without requiring repetitive intermediate menus.

#### Visual Indicators & Accessibility

- **Audio Playing Indicator**: An active acoustic visualizer bar in `#047857` (Ghana Forest Green) showing genuine playback timing and soundwave animation.
- **Microphone Turn Halo**: A distinct emerald glow with an unmuted microphone icon that illuminates the instant audio ends, signaling clearly to the user that it is their turn to respond.
- **Dual Input Badges**: Real-time status chips indicating `Voice Active` and `Keypad Ready` simultaneously.
- **Transcript Readout**: Large-font, high-legibility Atkinson Hyperlegible subtitles showing the spoken Akan Twi text and English translation side-by-side.

---

### 3. Key Product Decisions & Trade-Offs

#### Decision 1: Default to Akan Twi Audio Assets Immediately
- **Chosen Approach**: When audio is resolved in the simulator, prioritize the 88 ready Akan Twi studio recordings as the primary audio source regardless of initial locale selection, until English audio assets are uploaded.
- **Why**: The user confirmed that English assets will be provided later. Forcing an English lookup resulted in `null` audio URLs, dead clicks, or fallback tones instead of playing the rich native voice recordings.
- **Alternative Considered**: Synthesizing English robotic browser TTS via Web Speech API. *Rejected* because browser SpeechSynthesis lacks Ghanaian phonetics and sounds robotic compared to authentic studio recordings.

#### Decision 2: Play Audio First Before Executing VoiceXML `<Redirect>`
- **Chosen Approach**: When a VoiceXML response contains both `<Play url="..."/>` (or `<Say>`) AND `<Redirect url="..."/>`, the simulator will await the completion of the prompt playback before firing the redirect webhook.
- **Why**: In Africa's Talking telephony, `<Play>` blocks the call leg until audio completes, after which `<Redirect>` fetches the next menu. In the web simulator, the redirect was executing asynchronously in zero milliseconds, aborting the audio element.
- **Alternative Considered**: Removing `<Redirect>` from server routes. *Rejected* because server routes must maintain 100% parity with live Africa's Talking telephony webhooks.

#### Decision 3: Audio Lifecycle-Coupled Microphone Auto-Unmute
- **Chosen Approach**: Wire `audioPlaybackController.play()` callbacks (`onStart` and `onEnd`) directly into `continuousAudioEngine` and state refs:
  - `onStart`: Set `isMicMuted = true` and pause VAD processing.
  - `onEnd`: Set `isMicMuted = false`, resume VAD, and notify caller via visual indicator.
- **Why**: Guarantees zero acoustic echo (the microphone will never hear the prompt audio playing from the device speakers) and eliminates manual push-to-talk clicks.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│               SIMULATOR TURN-TAKING SYSTEM ARCHITECTURE                │
└────────────────────────────────────────────────────────────────────────┘

 [ Africa's Talking / Server Webhook ]
                  │ VoiceXML with <Play> & <GetDigits>
                  ▼
       ┌─────────────────────┐
       │ PhoneSimulatorPage  │
       └──────────┬──────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 ┌──────────────┐    ┌──────────────┐
 │ Twi Audio    │    │ Audio State  │◄───── Browser AudioContext Unlocked
 │ Resolver     │    │ Controller   │
 └──────┬───────┘    └──────┬───────┘
        │                   │
        │ Clean URL         │ .play(url, { onStart, onEnd })
        ▼                   ▼
 ┌──────────────┐    ┌──────────────┐
 │ Audio Cache  │───►│ HTML5 Audio /│
 │ (Preloaded)  │    │ Web Audio    │
 └──────────────┘    └──────┬───────┘
                            │
               ┌────────────┴────────────┐
               │                         │
     onStart: Mute Mic          onEnd: Unmute Mic
               │                         │
               ▼                         ▼
      ┌────────────────┐        ┌────────────────┐
      │ Echo Rejection │        │ Continuous Mic │
      │ Guard Active   │        │ Capture & VAD  │
      └────────────────┘        └───────┬────────┘
                                        │ User Speaks / Presses Key
                                        ▼
                                ┌────────────────┐
                                │ Dispatch Input │
                                │ to Next Step   │
                                └────────────────┘
```

#### Detailed File & Module Workplan

1. **`src/modules/ttsService.ts`**:
   - Update `resolveSimulatorAudioUrl` to allow Twi studio recordings to serve as authoritative audio for both flows whenever dedicated English recordings are pending.
   - Ensure `getRecordingByPromptKey` falls back to the canonical Twi audio take when English audio is null.

2. **`src/pages/dashboard/PhoneSimulatorPage.tsx`**:
   - Fix the `<Redirect>` execution bug: when `<Play>` audio is present with `<Redirect>`, trigger `await audioPlaybackController.play(playbackUrl)` before dispatching `dispatchVoiceWebhook(redirectUrl)`.
   - Wire `audioPlaybackController.subscribe` so that when `isPlaying` transitions from `true` to `false`, the microphone immediately un-mutes and starts listening.
   - Synchronize both Voice Speech and Keypad DTMF across Prompt and Conversational modes:
     - In Prompt Mode: Speech is mapped to digits or single-slot choices (*"1"*, *"Send Money"*).
     - In Conversational Mode: Speech is parsed via AI Brain with real-time slot extraction; DTMF keypad digits are also accepted (e.g. typing a 10-digit number or amount).

3. **`src/audio/audioPlaybackController.ts`**:
   - Ensure `unlockAudio()` completely resumes suspended AudioContext and primes HTML5 audio on initial handset lift or dial button press.
   - Guarantee `play()` handles consecutive turns without race conditions or aborted audio token drops.

---

### 5. Verification & Testing Plan

1. **Autoplay Verification**: Lift handset or click "Call" in the Phone Simulator $\rightarrow$ Verify that the Akan Twi Welcome prompt (`welcome_prompt_01.mp3` or `OP01`) plays audibly through the browser speakers immediately without manual user intervention.
2. **Turn-Taking Verification**: Once the prompt completes, verify the microphone status changes to `Active (Listening)` and the acoustic visualizer responds to spoken input.
3. **Voice Response Feedback**: Speak a menu choice (*"Send money"* or *"Baako"*) $\rightarrow$ Verify speech is captured, processed, and the subsequent prompt (`OP10` or `enter_recipient`) begins playing automatically.
4. **Keypad DTMF Fallback**: In the same step, press keypad `1` $\rightarrow$ Verify DTMF tone plays, webhook dispatches, and next prompt plays automatically.
5. **Conversational AI Flow**: Speak a full sentence (*"Mane sika aduonum kɔma Kwame"*) $\rightarrow$ Verify AI extracts the slots, reads back confirmation in Twi audio, and auto-prompts for user approval.
6. **Regression & Build Verification**: Run `compile_applet` and `lint_applet` to ensure pristine compilation and zero regressions.
