# Phase 2 Brain Audit

## Existing implementation

- **Speech input:** Africa's Talking VoiceXML, browser speech capture, Gemini/local ASR providers, audio normalization, echo filtering, and DTMF fallback are implemented under `src/modules/sttService.ts`, `src/ai_system/speech/asr/`, and `src/routes/voiceRoutes.ts`.
- **Language understanding:** A deterministic NLU module, Bayesian understanding engine, Twi number/name/telecom dictionaries, and an optional Gemini fallback are implemented under `src/modules/nluService.ts` and `src/ai_system/`.
- **Intent and entities:** Rule-based and trained classifier fallbacks extract amounts, Ghana phone numbers, names, and networks.
- **Conversation context:** Ephemeral/session memory, transaction state, slot management, correction, coreference, interruption, resumption, and cancel paths exist.
- **Dialogue:** Slot prompts, clarification, confirmation, and response planning exist.
- **USSD/navigation:** Guided keypad state, universal back/repeat/cancel, and USSD handoff are implemented in the telephony routes and state machine.
- **Transactions:** Transaction state transitions, idempotency, recipient validation, readback fingerprints, and provider saga handling exist.
- **Africa's Talking:** Voice, SMS, webhook, VoiceXML, and credential integration are implemented.

## Gaps addressed in this phase

- Common natural Twi transfer expressions were missing from the canonical local NLU and Bayesian lexicon.
- Ambiguous requests could still reach a guessed trained/model result instead of targeted clarification.
- Text evaluation did not clearly prove a 200-utterance held-out result or 20 complete conversation sequences.

## What remains

- Real acoustic accuracy depends on verified ASR recordings and carrier-grade audio, not text-only tests.
- No live provider credential or production callback is used by these tests.
- Spoken PIN collection remains prohibited; confirmation and provider final status remain mandatory.
