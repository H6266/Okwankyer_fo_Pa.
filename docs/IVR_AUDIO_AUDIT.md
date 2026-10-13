# Ɔkwankyerɛfo Pa — IVR Audio Asset Audit
**Version 1.0 • 13 October 2026**
**Team Anidasoɔ — MTN Ghana Tɛkyerɛma Pa Hackathon**

---

## 1. Executive Summary

This audit assesses the physical audio asset inventory of Ɔkwankyerɛfo Pa across three project audio roots:
- `Audio_files/audio/` (40 supplied studio recordings)
- `Audio_files_2/` (54 modular recovery/terminal recordings)
- `public/audio/` (29 legacy recordings in English and Twi)
- Repository Root (1 test asset: `test_render_welcome.mp3`)
- **Total Physical Assets Discovered**: 126 files

All files have been inventoried with cryptographic SHA-256 signatures, exact byte sizes, and `ffprobe`-calculated playback durations in [`docs/IVR_AUDIO_INVENTORY.csv`](./IVR_AUDIO_INVENTORY.csv).

---

## 2. Key Audit Findings & Discrepancies Resolved

### 2.1 The Legacy Numbering Mismatch (`Audio_prompt_twi_02.mp3`)
- **Issue**: The legacy call simulator mapped `Audio_prompt_twi_02.mp3` to Step 2 (Service Selection).
- **Finding**: Phonetic inspection and transcript analysis reveal that `Audio_prompt_twi_02.mp3` speaks: *"Afei select-i wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa..."* which corresponds to **Network Selection (`OP08`)**, not Service Selection (`OP07`).
- **Remediation**: The canonical registry decouples prompt identification from numeric filename order. `OP07` now correctly maps to `Audio_files/audio/Twi/02_Main_Service_Navigation/Service selection.m4a`, while `Audio_prompt_twi_02.mp3` is labeled as an alternate candidate for `OP08`.

### 2.2 Combined Welcome & Language Selection (`TW-WELCOME-COPIES`)
- **Issue**: `audio/welcome_prompt_01.mp3`, `audio/Twi/welcome_prompt_01.mp3`, and `public/audio/Welcome_prompt_01.mp3` share the exact Git blob SHA `95fd24a0acc9be0c33b965b232393d6f9944df6e`.
- **Finding**: This audio take combines Welcome and Language Selection into a single sentence (*"Welcome to Okwanchofapa... For English, press 1. For Twi, press 2."*). Playing this file at Step 1 (Welcome) and then again at Step 2 (Language Selection) causes annoying repetition.
- **Remediation**: In Twi mode, the system now prioritizes the discrete `Welcome 1.m4a` for `OP01` and `Language selection.m4a` for `OP02`. When the combined legacy file is played, the session advances directly to awaiting user language input (`1` or `2`) without double-playing.

### 2.3 Sample-Contaminated Dynamic Prompts (`Audio_prompt_twi_06` to `10`)
- **Issue**: Legacy takes `Audio_prompt_twi_06.mp3`, `07.mp3`, `08.mp3`, and `10.mp3` contained hardcoded sample transaction details (e.g., announcing "500 Ghana cedis" and a fixed demo recipient ending in `8464`).
- **Finding**: Playing these files during live transactions creates severe financial misinformation if the user entered 20 GHS or a different recipient.
- **Remediation**: Marked as `DYNAMIC_SAMPLE_DO_NOT_USE_LIVE`. Fixed IVR playback never plays these static takes for dynamic states (`OP20`, `OP21`, `OP29`, `OP52`). Instead, dynamic synthesis or the agreed gentle tone indicator is used.

### 2.4 Unlocking `Audio_files_2/`
- **Issue**: Previously, all 54 `.m4a` files in `Audio_files_2/` had `url: null` in the registry and could not be streamed by the backend.
- **Finding**: These files contain essential terminal, security, and recovery prompts:
  - `Pin Handoff.m4a` (`OP40`)
  - `Security warning.m4a` (`OP41`)
  - `Secure pin.m4a` (`OP42`)
  - `Pin Block.m4a` (`OP43`)
  - `Customer Declined.m4a` (`OP57`)
  - `Timeout.m4a` (`OP59`)
  - `Cancel.m4a` (`OP76`)
  - `Exit.m4a` (`OP77`)
  - `Help.m4a` (`OP86`)
- **Remediation**: `src/audio/streaming.ts` and `src/audio/recordingRegistry.ts` now support `/audio/additional/*` with full path-traversal guards, enabling all 54 assets for playback.

---

## 3. Coverage by Canonical Prompt Category

| Category | Canonical Range | English Coverage | Twi Coverage | Notes |
|---|:---:|:---:|:---:|---|
| **01. Welcome & Session Start** | OP01–OP06 | OP01–OP06 | OP01–OP06 | Discrete files available in `Audio_files/` |
| **02. Service Navigation** | OP07–OP15 | OP07–OP13 | OP07–OP15 | OP07–OP15 fully covered in Twi |
| **03. Recipient Verification** | OP16–OP25 | OP16 | OP16–OP25 | Dynamic fields (OP20, OP21) use TTS / tone |
| **04. Amount Verification** | OP26–OP33 | OP26 | OP26–OP33 | Readback (OP29) uses dynamic synthesis / tone |
| **05. Transaction Confirmation** | OP34–OP39 | OP36 | OP34–OP39 | Fixed review and confirmation prompts active |
| **06. PIN & Security** | OP40–OP44 | Fallback Tone | OP40–OP44 | Sourced from `Audio_files_2/` (Zero-PIN gate) |
| **07. Processing** | OP45–OP51 | Fallback Tone | OP45–OP51 | Sourced from `Audio_files_2/` |
| **08. Success & Completion** | OP52–OP56 | Fallback Tone | OP53–OP56 | Dynamic reference (OP52) handled safely |
| **09. Failure, Decline & Timeout** | OP57–OP63 | Fallback Tone | OP57–OP63 | Decline, timeout, failure retry mapped |
| **10. Voice Understanding** | OP64–OP72 | Fallback Tone | OP64–OP72 | Sourced from `Audio_files_2/` |
| **11. Navigation & Recovery** | OP73–OP80 | Fallback Tone | OP73–OP80 | Back, main menu, cancel, exit mapped |
| **12. Accessibility & Help** | OP81–OP87 | Fallback Tone | OP81–OP87 | Keypad option, take your time, help mapped |
| **13. Balance / Unsupported** | OP88–OP90 | Fallback Tone | OP88–OP90 | Balance unavailable, system error mapped |
| **14. Post-Transaction** | OP91–OP94 | Fallback Tone | OP91–OP94 | Another transaction, finish mapped |
