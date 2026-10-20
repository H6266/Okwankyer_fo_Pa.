# Telephony Parity & Direct VoiceXML Orchestration for Africa's Talking

Establish complete 1:1 functional parity between live telephony calls over Africa's Talking and the interactive Phone Simulator by replacing unsupported `<Redirect>` tags with direct inline VoiceXML state generators, eliminating English TTS voice interference in Akan Twi flows, and ensuring seamless dual-mode keypad (DTMF) and voice recognition.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed via interactive clarification:
> - **Direct VoiceXML Transitions**: Every Africa's Talking webhook callback (`/language-selection`, `/service-choice`, `/provider-choice`, `/action-choice`, `/verify-recipient`, `/verify-amount`, `/safe-outcome`, `/speech-fallback`) will immediately return the next state's full `<Response><GetDigits><Play .../></GetDigits><Record .../></Response>` document directly, completely removing unsupported `<Redirect>` tags that cause Africa's Talking to drop calls.
> - **Strict Akan Twi Audio Isolation**: When Twi is selected (DTMF 2), the system will exclusively use verified studio audio recordings (`Audio_files/Twi_library/*.mp3`) and Akan Twi digit pronunciation maps (`hwee`, `baako`, `mmienu`, `mmiɛnsa`, `nnan`, `nnum`, `nsia`, `nson`, `nwɔtwe`, `nkron`). Under no circumstances will English `<Say voice="female">` fallback prompts be emitted during a Twi session.
> - **Dual Input Modality**: Every step will present a `<GetDigits>` wrapper containing the authentic prompt `<Play>` and an immediate fallback `<Record>` action, allowing callers on live phone lines to navigate using either keypad DTMF or natural voice speech.

---

## 1. Overview & Core Concept

### What It Does
When a caller dials the Africa's Talking phone number (`+233 30 804 8098` or sandbox equivalent), the server acts as an intelligent VoiceXML application gateway. It guides the caller through:
1. **Welcome & Language Selection**: OP01 (`welcome_en.mp3` / `welcome_twi.mp3` / `Opening_voice_welcome_to_okwankyerefopa.mp3`) with dual keypad (1 for English, 2 for Twi) and voice recognition.
2. **Service Selection**: OP07 (`Service_selection.mp3` / `2.m4a`) for Mobile Money transfer.
3. **Network / Provider Selection**: OP08 (`Network_selection.mp3` / `3.m4a`) for MTN MoMo or Telecel Cash.
4. **Action Menu**: OP09/OP10 (`MTN menu.mp3` / `Send_money_selected.mp3`).
5. **Recipient Phone Number Entry**: OP16 (`Enter_recipient.mp3`) with 10-digit input window and instant KYC lookup.
6. **Recipient Verification Readback**: OP19 (`Recipient_verify.mp3`) with full 10-digit Akan Twi / English digit pronunciation (OP21) and confirmation prompt (OP23 `Recipient_confirm_speech.mp3`).
7. **Amount Entry & Readback**: OP26 (`Enter amount.mp3`), OP28 (`Amount prompt.mp3`), and OP29 (`Amount readback.mp3`).
8. **Zero-PIN Security Handoff**: OP41 (`Security_warning.mp3`) and OP40 (`Pin_Handoff.mp3`), triggering the real MTN MoMo push to the subscriber's handset while keeping the call securely informed.
9. **Transaction Outcome**: OP53 (`Success_sent.mp3`) with slow reference number readback (OP52b).

### Target Audience & Persona
- Ghanaian citizens calling from low-resource feature phones (keypad-only), smartphones, or landlines.
- Visually impaired, non-literate, and elderly users who require patient prompts and native Akan Twi guidance without cryptic English system errors.

---

## 2. Technical Architecture & Telephony Pipeline

### Africa's Talking VoiceXML Request/Response Lifecycle

```
Caller (Mobile / Landline)
       │
       ▼ (Dial +233 30 804 8098)
Africa's Talking Telephony Gateway
       │
       │ POST /voice-menu (sessionId, callerNumber, isActive=1)
       ▼
Ɔkwankyerɛfo Pa Server (Express & Voice Router)
       │
       ├─► Generates Direct VoiceXML:
       │   <Response>
       │     <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="/language-selection?sessionId=...">
       │       <Play url="https://.../audio/public/welcome_en.mp3?format=mp3"/>
       │     </GetDigits>
       │     <Record timeout="4" finishOnKey="#" callbackUrl="/speech-fallback?step=language-selection..."/>
       │   </Response>
       ▼
Caller Enters DTMF "2" (Twi) or Speaks "Twi"
       │
       │ POST /language-selection (dtmfDigits="2", sessionId=...)
       ▼
Ɔkwankyerɛfo Pa Server:
       │
       ├─► Sets session.language = "twi"
       ├─► NO <Redirect>!
       ├─► IMMEDIATELY returns Step 2 VoiceXML directly:
       │   <Response>
       │     <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="/service-choice?sessionId=...&amp;lang=twi">
       │       <Play url="https://.../audio/Twi_library/Service_selection.mp3?format=mp3"/>
       │     </GetDigits>
       │     <Record timeout="5" callbackUrl="/speech-fallback?step=service-select..."/>
       │   </Response>
       ▼
Caller Hears Crisp Native Twi Recording ──► Continues smoothly to completion!
```

---

## 3. Key Telephony Issues & Precise Solutions

### Issue 1: Africa's Talking Freezes or Drops Calls after Language Selection
- **Root Cause**: The simulator in the browser was coded with an automated `<Redirect>` parser that made simulated HTTP calls when seeing `<Redirect>URL</Redirect>`. Africa's Talking's live VoiceXML parser does **not** support `<Redirect>`. When AT received `<Redirect>`, it stopped executing, encountered no further `<Say>` or `<Play>`, and hung up.
- **Solution**: Refactor all telephony route handlers (`language-selection`, `service-choice`, `provider-choice`, `action-choice`, `verify-recipient`, `verify-amount`, `safe-outcome`, `speech-fallback`) into pure modular state builders that return the next state's full `<Response><GetDigits><Play .../></GetDigits><Record .../></Response>` XML directly in the HTTP response.

### Issue 2: English Voice ("Twi audio is unavailable...") Interrupted the Twi Flow
- **Root Cause**:
  1. In `src/audio/twiLibraryManifest.ts`, filenames were specified as `.m4a` (e.g. `Language_selection.m4a`, `Service_selection.m4a`), whereas on disk the actual physical assets in `/Audio_files/Twi_library/` are `.mp3`.
  2. When `resolvePromptXml` failed to resolve the `.m4a` file, it fell back to:
     `<Say voice="female">Twi audio is unavailable. Press 1 for English, or try again later.</Say>`
  3. Africa's Talking does not have a Twi TTS engine; its `<Say>` element plays in an English synthetic voice.
- **Solution**:
  1. Audit and normalize `twiLibraryManifest.ts` and `canonicalRegistry.ts` so all paths point to the real on-disk files (`.mp3` in `Audio_files/Twi_library/`).
  2. Implement an Akan Twi digit & number synthesizer for dynamic slots (phone numbers and amounts) that outputs either concatenated Twi digit audio or valid Twi phonetic text.
  3. Strict Language Isolation: In Twi mode, prohibit `<Say voice="female">` English fallback. If an asset is resolving, always route to the verified Twi canonical audio recording.

### Issue 3: Dual Modality (DTMF + Speech Fallback) on Live Calls
- **Root Cause**: In Africa's Talking VoiceXML, `<GetDigits>` and `<Record>` must be sequenced properly. If `<Record>` is improperly placed or uses a timeout that prematurely intercepts digits, DTMF can be delayed or missed.
- **Solution**:
  1. Ensure standard `<GetDigits timeout="12" finishOnKey="#" numDigits="X" callbackUrl="...">` wraps `<Play url="..."/>`.
  2. Follow immediately with `<Record trimSilence="true" finishOnKey="#" playBeep="false" maxLength="6" timeout="5" callbackUrl="...">`.
  3. If DTMF is entered, AT cancels the `<Record>` and posts to the `callbackUrl` of `<GetDigits>`. If no DTMF is pressed and the caller speaks, AT finishes `<Record>` and posts the audio recording URL to `/speech-fallback`.

---

## 4. Execution Plan & Phased Changes

### Phase 1: Audio Manifest & Extension Reconciliation
- Update `src/audio/twiLibraryManifest.ts` and `src/audio/recordingRegistry.ts` to guarantee that all Twi recordings match the verified files on disk in `/Audio_files/Twi_library/*.mp3`.
- Verify `resolveSafeAudioPath` in `src/audio/streaming.ts` seamlessly resolves both `Twi_library/` and canonical `Twi/` URLs regardless of `.mp3` or `.m4a` requested extension.
- Pre-warm and verify all MP3 cache entries so Africa's Talking receives immediate 200/206 audio streams without transcoding lag.

### Phase 2: Direct Telephony State Machine & VoiceXML Generator
- Create a unified `TelephonyVoiceXmlRenderer` helper in `src/routes/voiceRoutes.ts`:
  - `renderLanguageSelectionXml(sessionId, baseUrl)`
  - `renderServiceSelectXml(sessionId, lang, baseUrl)`
  - `renderProviderSelectXml(sessionId, lang, baseUrl)`
  - `renderActionSelectXml(sessionId, lang, baseUrl, provider)`
  - `renderEnterRecipientXml(sessionId, lang, baseUrl)`
  - `renderRecipientVerifyXml(sessionId, lang, baseUrl, phone, name)`
  - `renderEnterAmountXml(sessionId, lang, baseUrl, phone, name)`
  - `renderSafeConfirmationXml(sessionId, lang, baseUrl, amount, phone, name)`
  - `renderPinHandoffXml(sessionId, lang, baseUrl, amount, phone, name, refId)`
  - `renderOutcomeXml(sessionId, lang, baseUrl, status, refId)`
- Update every route handler in `voiceRoutes.ts` so that when a choice is made, it directly calls the corresponding render helper and returns the complete VoiceXML payload with 0 redirects.

### Phase 3: Akan Twi Digit & Slot Synthesis for Telephony
- Connect `buildDigitPronunciations` and `formatFullPhoneNumberSpaced` (`hwee, baako, mmienu...`) so that when the recipient's 10 digits (e.g., `0543546010`) are verified or read back, the system speaks full Ghanaian Twi words without defaulting to English.
- Connect slow reference number pronunciation (`OP52b`) for post-transaction receipts.

### Phase 4: Full Telephony & Simulator Parity Verification
- Run Vitest telephony test suite: `tests/voicexmlSnapshots.test.ts`, `tests/stepRegistryAndIvrDecision.test.ts`, `tests/ivrFullFlowIntegration.test.ts`.
- Verify that every VoiceXML response is valid XML conforming to Africa's Talking standards (no `<Redirect>` tags, valid `<Response>`, `<GetDigits>`, `<Play>`, `<Record>`).
- Test with simulated inbound requests mirroring Africa's Talking telephony payloads (DTMF digits, callerNumber, sessionId).
