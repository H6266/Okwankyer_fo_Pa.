# IVR Audio Asset Audit

Generated from the checked-out repository by `scripts/generate_audio_inventory_and_mapping.ts`.

The current checkout contains **170 audio files**. Extension counts: .aac 54, .m4a 100, .mp3 16.

| Current root | Audio files |
|---|---:|
| `Audio_files/Twi/` | 110 |
| `Audio_files/audio/` | 1 |
| Other files under `Audio_files/` | 54 |
| `public/audio/` | 2 |
| `audio/` | 2 |
| Repository root | 1 |

There is no `Audio_files_2/` directory in this checkout. The 54 flat terminal/recovery recordings are under `Audio_files/`. The runtime registry contains 92 selected entries, and 0 are approved fixed recordings.

No recording is marked audio-verified. The current registry returns safe text/TTS fallback for candidate, ambiguous, missing, and dynamic recordings. A filename, transcript, hash, or successful HTTP response is not audio verification.

The per-prompt English/Twi statuses and exact registered candidate paths are in `docs/IVR_AUDIO_MAPPING.md`. The complete physical inventory, including exact paths, sizes, durations when `ffprobe` is installed, and SHA-256 hashes, is in `docs/IVR_AUDIO_INVENTORY.csv`.

Before promoting any asset, listen to it, compare its content with the canonical script, check for combined prompts and sample transaction values, and obtain a qualified Twi review where needed.