# IVR Audio Asset Audit

Generated from the checked-out repository by `scripts/generate_audio_inventory_and_mapping.ts`.

The current checkout contains **91 audio files**. Extension counts: .m4a 3, .mp3 88.

6 Twi recordings contain M4A/MP4 data despite their .mp3 filenames. Browser streaming serves the detected audio/mp4 type; telephony requests transcode them to MP3 with the bundled FFmpeg binary.

| Current root | Audio files |
|---|---:|
| Canonical `Audio_files/audio/Twi/` | 0 |
| Legacy `Audio_files/Twi_library/` | 85 |
| Other files under `Audio_files/` | 3 |
| `public/audio/` | 2 |
| `audio/` | 0 |
| Repository root | 1 |

The runtime registry contains 91 selected entries, and 87 are approved fixed recordings. Physical files without an exact registry path remain unmapped candidates.

87 approved fixed recordings are enabled for runtime playback. Unapproved candidate and ambiguous recordings stay blocked; dynamic prompts use validated live values and the dynamic speech path.

The per-prompt English/Twi statuses and exact registered asset paths are in `docs/IVR_AUDIO_MAPPING.md`. The complete physical inventory, including exact paths, sizes, durations when `ffprobe` is installed, and SHA-256 hashes, is in `docs/IVR_AUDIO_INVENTORY.csv`.

The approved library contains 83 Twi and 4 English fixed recordings. Review new or changed assets against the canonical script and obtain qualified language review where needed before enabling them.