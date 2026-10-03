# Twi review flag list

This document is intentionally limited to flagging wording that may be inconsistent or awkward. It does not rewrite the Twi text.

## Flagged prompt lines

1. `"For English, press 1. Twi firi mu, mia 2."`
   - Meaning: English/choice prompt.
   - Flag: Mixed-language wording within a single line may be awkward for a strict language-lock flow.

2. `"Worepɛ sɛ wosend ${amount} Ghana Cedis kɔ ${name} nɔmba a ɛwo awiei ${suffix} no so."`
   - Meaning: confirmation prompt.
   - Flag: Code-switching between Twi and English for currency naming and reading of the recipient number may be inconsistent.

3. `"Medaase, woapene so pɛpɛɛpɛ. Me pa wo kyɛw, hwɛ wo fon so sesei ara na fa wo MoMo PIN bɔ mu ahobammbɔ mu."`
   - Meaning: secure handoff prompt.
   - Flag: The phrase `MoMo PIN` may not match the caller’s preferred Twi phrasing, and `ahobammbɔ mu` is a mixed technical phrase that may need review.

4. `"Worepɛ sɛ wosend 500 Ghana Cedis kɔ Kwame..."`
   - Meaning: confirmation message shown in the demo path.
   - Flag: Hardcoded name and amount remain risk-prone and not suitable for production. This is not a final verified message.

5. `"Yɛapene so. Sesei, hwɛ wo screen na fa wo MoMo PIN nwura mu sika no nkɔ pɛpɛɛpɛ."`
   - Meaning: PIN prompt note.
   - Flag: The phrase `PIN` and the final `nwura mu` wording may need a native Twi review to ensure clarity and consistency.

## Notes for review

- A native Twi speaker should confirm spelling consistency across all prompt variants.
- The current repo includes both English and Twi prompts, but the Twi wording must be reviewed before any real-money usage.
