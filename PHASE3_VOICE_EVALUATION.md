# Phase 3 Voice Evaluation

**Status:** Backend and synthetic voice validation completed. Real human acoustic and Africa's Talking carrier-call validation remains unexecuted because consenting speaker audio and live carrier credentials were not provided.

## 1. Speech pipeline architecture

Caller voice is collected by Africa's Talking VoiceXML `Record` callbacks. The callback receives a recording URL, optional direct `speechText` from simulator/text testing, DTMF, language hint, step, and session ID. It does not establish from any assumption that the provider supplies raw audio itself:

1. Africa's Talking returns callback fields and/or `RecordingUrl`.
2. `speechToText` downloads the remote recording with an eight-second fetch timeout and one retry.
3. Audio is normalized to 16 kHz mono PCM WAV.
4. VAD and acoustic quality analysis run.
5. HCI Lab ASR is preferred for Twi.
6. Local neural ASR, Gemini audio ASR, and the offline recognizer are fallback stages.
7. Echo, background noise, pronunciation, number, and step-aware PIN post-processing run.
8. The brain and IVR decision engine update context and choose a response.
9. Canonical recorded audio or reviewed TTS assets generate the voice reply.
10. Empty, low-confidence, or repeated failures replay the prompt or offer DTMF fallback.

## 2. Provider and callback limitations

- The live carrier supplies a recording URL or a provider transcript depending on callback configuration; the application also supports direct test transcripts.
- Recording download is bounded to 15 MB and 8 seconds per attempt.
- Africa's Talking does not guarantee that every callback contains speech or a recording URL.
- Empty callbacks, no-speech callbacks, DTMF interruptions, and callback retries must remain separated.
- HCI Lab availability depends on credentials and service quota.
- Gemini ASR may be unavailable, quota-limited, or provide no reported probability.
- The local neural worker is optional and reports provider availability rather than invented confidence.
- The existing STT implementation also historically has separate short-lived and unified orchestration paths. The voice callback uses the unified HCI/Gemini/local/offline orchestrator.
- The callback cannot prove carrier acoustic quality until a real call is made.
- The live callback's audio recording can contain phone codec distortion, echo, and noise; the repository has no verified human caller dataset.

## 3. Dataset composition

### Existing assets

- 86+ Twi library audio files and 3 English library M4A candidates exist.
- The Twi files are predominantly system-response recordings, not recordings of callers speaking natural transfer requests.
- Existing transcripts are reviewed output text or candidate transcripts, not verified human input transcripts.
- These assets are valid for audio delivery and prompt-asset testing only.
- They must not be used as a genuine caller-ASR ground-truth dataset.

### Consenting human dataset

- Real speakers: **0**.
- Consenting English speech samples: **0**.
- Consenting Twi speech samples: **0**.
- Male/female, age, speed, noise, and telephone-quality splits: **Not collected**.
- Carrier calls: **0**.

No real PIN or financial credential recordings are included or required.

## 4. Synthetic and text-derived evaluation

The 200-utterance Phase 2 suite remains a text-intelligence test, not an acoustic test.

The Phase 3 harness now measures WER/CER with human transcript and ASR transcript pairs and calculates staged intent accuracy. The current committed test uses only fixed synthetic pairs and must not be interpreted as real acoustic performance.

The five-sample sanity run is designed to verify the metric implementation. It is not a performance claim.

## 5. English and Twi speech results

| Category | Result |
|---|---|
| Human-verified English speech | Not measured |
| Human-verified Akan/Twi speech | Not measured |
| Real English ASR transcripts | Not measured |
| Real Twi ASR transcripts | Not measured |
| Real carrier-call voice conversations | Not measured |
| Synthetic WER/CER implementation test | Implemented and passing |
| Synthetic 30-scenario voice matrix | Passing |
| Synthetic low-confidence/empty callback recovery | Passing |

## 6. WER and CER

No acoustic WER/CER can be reported from the repository assets.

WER and CER are calculated only from supplied human-reference versus ASR-transcript pairs by `voiceEvaluation.ts`. A result is not generated for a missing human recording or missing consented transcription.

## 7. Intent and entity stages

The Phase 3 test evaluates three stages structurally:

1. Human-verified transcript.
2. ASR transcript.
3. Intent and entity extraction.

Only synthetic stage pairs are committed. Real ASR-to-brain accuracy remains pending.

## 8. Common recognition failure categories

Existing normalisation and echo logic address:

- Ghanaian cedi pronunciation variants.
- Akan and English number words.
- MTN, Telecel, Vodafone, AirtelTigo/AT variants.
- Twi affirmations and negations.
- Menu navigation phrases.
- System prompt echo.
- Background noise and filler words.
- Four-to-six-digit PIN interception.

Remaining uncertain cases require fluent-speaker review before broad mapping. The system must ask for repetition or DTMF when confidence or slot identity is uncertain rather than silently changing intent.

## 9. Full conversation success rate

- 30 synthetic voice scenario matrices: **30/30 handled**.
- Real complete spoken calls: **0**.
- Real caller completion rate: **Not measured**.

The existing telephony and simulator suites continue to validate:

- Language selection.
- Recipient entry.
- Amount entry.
- Dynamic readback.
- Confirmation.
- PIN handoff.
- Empty and low-confidence recovery.
- DTMF fallback.
- Spoken PIN discard.

## 10. Audio delivery

- English fixed assets are registered and served by existing tests.
- Twi assets are mapped and streamed by existing audio registry tests.
- Dynamic Twi synthesis is intentionally unavailable unless a reviewed provider exists.
- Dynamic English TTS is not claimed to work in strict production mode unless the provider returns actual audio.
- Auditory Twi intelligibility has not been validated by human-listening tests.

## 11. Operational monitoring

The Phase 3 pipeline monitor tracks:

- ASR success and empty transcripts.
- ASR timeout placeholders.
- Callback failures.
- Intent failures.
- Session expiry.
- Response delivery failures.
- Unexpected call termination.
- Conversation completion.

The monitor stores only event counters and percentages. It does not retain transcript, phone number, PIN, password, or recipient details.

## 12. Outstanding defects and deployment gates

- Obtain explicit consent and human reference transcripts before real ASR measurement.
- Recruit native/fluent Akan and Ghanaian-English speakers with diverse speeds and environments.
- Conduct telephone-quality and moderate-noise recordings.
- Run real carrier callbacks and download the recording URLs.
- Measure real WER/CER and entity errors.
- Obtain human listening validation for Twi response assets.
- Verify callback retry and timeout behavior on Africa's Talking.
- Do not interpret synthetic metrics as real-world evidence.
- Do not execute a real financial transaction.
- Do not deploy to production without authorisation and credentials.
