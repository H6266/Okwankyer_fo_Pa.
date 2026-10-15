# Audio Asset and Call Flow Map

Generated from the current runtime audio policy and IVR integration.

## Current inventory

The checkout contains 170 audio files across `Audio_files/Twi/` (110), `Audio_files/audio/` (1), flat `Audio_files/` (54), `public/audio/` (2), `audio/` (2), and the repository root (1). `Audio_files_2/` is absent.

The runtime registry contains 92 selected assets. None is approved for automatic playback. The resolver accepts only one exact, language-matched, VERIFIED fixed asset; candidates, ambiguous mappings, and dynamic recordings use a safe text/TTS path instead.

Full path-by-path inventory: `docs/IVR_AUDIO_INVENTORY.csv`. Per-prompt language coverage: `docs/IVR_AUDIO_MAPPING.md`.

## Call narrative

1. Inbound call requests OP01 in English, then redirects to the language-selection route.
2. The language-selection route requests OP02 separately. A selection locks the session language and proceeds to service selection.
3. Service and network menus advertise only the currently supported service paths. The Twi service menu does not replay the welcome.
4. Recipient digits and amount keys are collected until the caller presses #. The server validates only the completed value. Invalid recipient lengths do not trigger lookup.
5. A valid recipient lookup is deduplicated per session and submitted number. The caller must explicitly confirm before continuing.
6. Amount entry is validated and stored before the review. OP20 uses the live recipient name; OP21 reads all ten validated phone digits in order; OP29 reads the normalized amount.
7. Payment submission requires the AMOUNT_ENTERED state and explicit confirmation. Duplicate confirmation is rejected while a submission is pending.
8. Live provider requests hand off authorization to the official handset prompt. Pending or unknown status is not announced as success. OP52 receipt text uses the provider reference only after confirmed completion.

## Zero-PIN boundary

The simulator shows an external handset handoff, mutes its microphone, ignores keypad input in that state, and drops PIN-like speech before adding it to the transcript or logs. The simulator does not fabricate provider approval. Live VoiceXML directs callers to the official secure handset prompt; the application does not collect a PIN.

## Review and release limits

No recording was listened to or approved during this audit. Twi pronunciation and exact spoken contents remain unverified. Dynamic speech and real provider callbacks require their approved provider configuration. Run `npx tsx scripts/generate_audio_inventory_and_mapping.ts` after asset changes; only a human review may promote an asset to VERIFIED.