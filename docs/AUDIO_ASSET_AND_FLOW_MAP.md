# Audio Asset and Call Flow Map

Generated from the current runtime audio policy and IVR integration.

## Current inventory

The checkout contains 92 audio files across canonical `Audio_files/audio/Twi/` (0), legacy `Audio_files/Twi_library/` (86), other `Audio_files/` paths (3), `public/audio/` (2), `audio/` (0), and the repository root (1).

6 Twi files have M4A/MP4 bytes behind .mp3 names. Browser playback uses the detected media type; telephony URLs are converted to MP3 with the bundled FFmpeg binary.

The runtime registry contains 91 selected assets. The resolver accepts only approved, language-matched recordings with audioVerified=true. Fixed prompts without an approved recording use text recovery; only dynamic prompts may request language-matched TTS.

Full path-by-path inventory: `docs/IVR_AUDIO_INVENTORY.csv`. Per-prompt language coverage: `docs/IVR_AUDIO_MAPPING.md`.

## Call narrative

1. OP01 plays once with language choices. OP02 is reserved for replay and recovery so the choices are not duplicated.
2. Language selection locks the session language, then routes through service, network, and send-money menus in order.
3. Recipient verification reads the OP19 introduction, live OP20 name, live OP21 full phone digits, then OP23 keypad confirmation.
4. Amount entry uses OP28/OP26, validates the completed # input, and asks OP29 accept/change/cancel before final review.
5. OP35 reviews the live amount, recipient, network, and last four phone digits. Editing recipient or amount clears stale fields and requires new read-back.
6. Final confirmation submits through the payment saga and hands authorization to the provider's secure handset prompt. Pending or unknown status remains in a repeated status-check branch; only trusted completion receives OP52.
7. OP52 uses the current transaction record and labels an OKP reference as an application reference. Post-success navigation offers another supported transfer or exit.

## Zero-PIN boundary

All legacy PIN URLs refuse keypad and speech input. Authorization belongs on the provider's secure handset prompt. Pending remains pending; no PIN, sample transaction, or locally generated reference can substitute for provider evidence.

## Review and release limits

The approved library contains 84 Twi and 4 English fixed recordings. Review Twi pronunciation and scripts for any newly added assets before enabling them. Dynamic speech and real provider callbacks require their approved provider configuration. Run `npx tsx scripts/generate_audio_inventory_and_mapping.ts` after asset changes; only approved assets should have `audioVerified=true`.