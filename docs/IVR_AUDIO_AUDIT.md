# IVR Audio Asset Audit

Generated from the checked-out repository by `scripts/generate_audio_inventory_and_mapping.ts`.

The current checkout contains **92 audio files**. Extension counts: .m4a 3, .mp3 89.

| Current root | Audio files |
|---|---:|
| Canonical `Audio_files/audio/Twi/` | 0 |
| Legacy `Audio_files/Twi_library/` | 86 |
| Other files under `Audio_files/` | 3 |
| `public/audio/` | 2 |
| `audio/` | 0 |
| Repository root | 1 |

The runtime registry contains 91 selected entries, and 0 are approved fixed recordings. Physical files without an exact registry path remain unmapped candidates.

No recording is marked audio-verified. The current registry returns safe text/TTS fallback for candidate, ambiguous, missing, and dynamic recordings. A filename, transcript, hash, or successful HTTP response is not audio verification.

The per-prompt English/Twi statuses and exact registered candidate paths are in `docs/IVR_AUDIO_MAPPING.md`. The complete physical inventory, including exact paths, sizes, durations when `ffprobe` is installed, and SHA-256 hashes, is in `docs/IVR_AUDIO_INVENTORY.csv`.

Before promoting any asset, listen to it, compare its content with the canonical script, check for combined prompts and sample transaction values, and obtain a qualified Twi review where needed.