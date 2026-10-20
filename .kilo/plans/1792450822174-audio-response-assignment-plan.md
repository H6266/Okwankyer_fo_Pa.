# Plan: Assign User Responses to Correct Response Audio

## Goal
Ensure each conversational turn plays the audio that matches the user's response and selected language, with deterministic prompt-ID lookup first and recorded-audio matching as fallback.

## Context
- `src/audio/canonicalRegistry.ts` maps step/prompt IDs to audio URLs per language.
- `src/audio/dynamicPromptBuilder.ts` renders OP20/OP21/OP29/OP35/OP52/OP52B/OP70 dynamic text.
- `src/audio/replyAudioMatcher.ts` matches AI reply text to recorded studio audio with a confidence gate.
- `src/routes/voiceRoutes.ts` `brainPromptElement()` and `canonicalPromptElement()` select the final `<Play>`/`<Say>` element.

## Approach
1. Prefer canonical prompt ID lookup (`resolvePromptXml(promptId, language)`) when a step/prompt ID is known — deterministic, no text matching.
2. For dynamic prompts, use `buildSafeConfirmationPrompt`/`renderDynamicPromptTemplate` to generate the exact spoken text, then match to a verified recording via `matchReplyToAudio(text, language)`.
3. Filter recordings by `normalizeRecordingLanguage(language)` so Twi never receives English audio and vice versa.
4. Fall back to `<Say voice="woman">` TTS only when no recorded match meets the confidence threshold.
5. Guard against cross-language leakage: in Twi mode, never use manifest English cross-match unless explicitly intended; prefer pause over English Say.

## Cross-Language Leakage Prevention (Twi vs English)
- In `replyAudioMatcher.ts`, disable the manifest English cross-match (`manifest_english_crossmatch`) when `wantedLanguage` is Twi, unless an explicit opt-in flag is set.
- Filter `catalogCandidates` strictly by `r.language === wantedLanguage`; never fall back to English recordings.
- In `canonicalPromptElement`/`brainPromptElement`, the Twi branch must return Twi audio or a pause; never an English `<Say>`.
- Ensure dynamic prompt templates render Twi text for Twi language; never pass English fallback text.
- For recovery/clarification prompts, use Twi `please_respond` audio or pause, not English Say.

## Validation
- Manual: select Twi, confirm all prompts are Twi audio; select English, confirm English.
- Add a test asserting no English text appears in Twi responses.

## Out of scope
- Offline training; runtime memory already captures feedback.
