# Human Action Items (HUMAN_TODO.md)

This document tracks all external, legal, telco, operational, and cryptographic actions that require human authorization or action and cannot be automated in code.

---

## 1. MTN MoMo Partner Agreement & Float Provisioning (Item 1.2)
- **Why**: Two-leg payment flows (pull from caller via `requestToPay`, push to recipient via `transfer`) require a funded MTN MoMo Disbursement Account and an active B2C/Disbursement Partner Agreement with MTN Ghana.
- **Action Required**:
  1. Complete MTN Ghana Business Onboarding for Mobile Money Open API (Disbursement product).
  2. Fund the disbursement float account with sufficient Ghanaian Cedi (GHS) reserves to cover payouts.
  3. Obtain production credentials for MTN MoMo Disbursement (`MOMO_DISBURSEMENT_SUBSCRIPTION_KEY`, `MOMO_DISBURSEMENT_API_USER_ID`, `MOMO_DISBURSEMENT_API_KEY`).
  4. Ensure IP allowlisting for production callback endpoints on MTN Developer Portal.

---

## 2. MTN Developer Portal Key Rotation & Secret Scrubbing (Item 2.6)
- **Why**: Historical developer subscription keys previously committed to version control must be revoked immediately at the source.
- **Action Required**:
  1. Log into the MTN MoMo Developer Portal (https://momodeveloper.mtn.com).
  2. Navigate to API Products -> Subscriptions.
  3. Regenerate both Primary and Secondary keys for all sandbox and production products (Collection and Disbursement).
  4. Run `bash scripts/scrub-history.sh` on the GitHub remote repository to strip historical commits containing obsolete keys from git history.
  5. Update production environment secrets in deployment environments (e.g. Render, GCP) with the newly generated keys.

---

## 3. Africa's Talking Telecom Production Verification & Twi TTS Review (Items 2.1 & 3.6)
- **Why**: Africa's Talking Text-to-Speech (`<Say voice="female">`) uses an English acoustic model that cannot authentically pronounce Akan Twi phonemes (e.g. vowels Ɔ, Ɛ, and tonal pitches).
- **Action Required**:
  1. Place a live test call through the assigned Africa's Talking virtual number (`+233308048098`).
  2. Verify that Africa's Talking webhook signatures / secrets match the configured `AT_WEBHOOK_SECRET`.
  3. Have a native Akan Twi speaker audit spoken prompts. For production deployments, all dynamic Twi numbers, recipient readbacks, and cedi amounts should use pre-recorded audio snippets (Akan number bank) played via `<Play>` rather than `<Say>` synthesized English TTS.

---

## 4. Consented Real-Caller Speech Corpus Collection (Item 4.1)
- **Why**: Evaluating ASR accuracy on studio audio only tests system prompts. Measuring true Word Error Rate (WER) and Character Error Rate (CER) requires real caller voices.
- **Action Required**:
  1. Collect consented recordings from at least 30 native Ghanaian English and Akan Twi speakers across age brackets (elders, youth, market traders).
  2. Record in realistic Ghanaian acoustic environments: quiet room, roadside trotro stop, open market, and mobile speakerphone.
  3. Downsample and encode test samples to 8kHz mono PCM/WAV (simulating standard GSM telephony codecs).
  4. Add recordings and transcripts to `eval/manifest.json`.
  5. Run `npm run eval:live` with a configured `GEMINI_API_KEY` to establish the definitive production baseline.
