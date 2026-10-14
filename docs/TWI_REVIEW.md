# Akan Twi Linguistic Review & Dialect Consistency Audit
### Ɔkwankyerɛfo Pa Voice Accessibility System

**Review Document Status:** Prepared for Native Akan (Asante/Akuapem Twi) Linguist Review  
**Date:** 2026-10-03  
**Auditor Note:** In accordance with project instructions, no Twi text has been unilaterally altered. Linguistic anomalies, Anglicisms, loanword adaptations, and dialectal variations are flagged below for native expert validation.

---

## 1. Verbatim Twi Studio Audio Catalog & Review Flags

| Prompt File | Spoken Twi Transcript | English Meaning | Linguistic Review Flags & Observations |
|---|---|---|---|
| `Welcome_prompt_01.mp3` | *"Welcome to Ɔkwankyerɛfo Pa, an easy financial transaction service. For English, press 1. Twi firi mu, mia 2."* | "Welcome to Ɔkwankyerɛfo Pa... For English press 1. For Twi, press 2." | ⚠️ **Flag 1 (Phrasing):** *"Twi firi mu, mia 2"* literally translates to *"Twi exit/from inside, press 2"*. Standard idiom should typically be *"Sɛ wopɛ Twi a, mia 2"* or *"Twi kasa mu, mia 2"*. |
| `Audio_prompt_twi_02.mp3` | *"Afei selecte wo network. Sɛ MTN a, mia baako. Sɛ Telecel a, mia mmienu. Sɛ AirtelTigo a, mia mmiɛnsa. Mia anan na tie wei biom. Mia zero na si ha."* | "Now select your network. If MTN press 1. If Telecel press 2. If AirtelTigo press 3. Press 4 to hear this again. Press 0 to stop here." | ⚠️ **Flag 2 (Code-Switching):** Uses loanword *"selecte"* instead of native Akan *"paw"*. <br>⚠️ **Flag 3 (Navigation Grammar):** Uses *"mia anan (4) na tie wei biom"* for repeat, whereas universal grammar uses <kbd>9</kbd>. <br>⚠️ **Flag 4 (Exit Phrase):** *"Mia zero na si ha"* (literally "stop here") is understandable colloquially, but *"firi mu"* or *"gyae"* is more conventional. |
| `Audio_prompt_twi_03.mp3` | *"Sɛ wopɛ sɛ wosende sika kɔ Mobile Money a, mia baako. Sikakorabea dwumadie no, mia mmienu."* | "If you want to send money to Mobile Money, press 1. For banking services, press 2." | ⚠️ **Flag 5 (Loanword Verb):** Uses *"wosende"* (English 'send' with Akan suffix) instead of traditional Akan verb *"womane"* (to remit/send). |
| `Audio_prompt_twi_04.mp3` | *"Sɛ wopɛ sɛ wosend sika kɔ ma MoMo user a, mia 1. Sɛ wopɛ sɛ wotua bills a, mia 2. Sɛ wopɛ sɛ wotɔ airtime anaa bundle a, mia 3. Sɛ wopɛ sɛ woallow-i cash out a, mia 4. Sɛ wopɛ sɛ wocheck-i wo account no a, mia 5. Mia 8 na kɔ back. Mia 0 na firi ha."* | "If you want to send money to a MoMo user press 1. Pay bills press 2. Buy airtime/bundle press 3. Allow cash out press 4. Check account press 5. Press 8 to go back. Press 0 to exit." | ⚠️ **Flag 6 (Heavy Code-Switching):** Multiple hybrid loanwords: *"wosend"*, *"bills"*, *"bundle"*, *"woallow-i"*, *"wocheck-i"*, *"kɔ back"*. Native alternatives exist for several (e.g., *"gye sika"* for cash out; *"hwɛ wo sika"* for balance check). |
| `Audio_prompt_twi_05.mp3` | *"Afei, bɔ nɔmba no a wopɛ sɛ wosende sika no to so no. Wowie a, fa hash ka ho. Mia zero na san akyi."* | "Now, enter the number you want to send money to. When finished, append hash. Press 0 to go back." | ⚠️ **Flag 7 (Inconsistent Key Grammar):** Prompt states *"Mia zero na san akyi"* (Press 0 to go back), whereas project universal keypad standard specifies <kbd>8</kbd> for Back and <kbd>0</kbd> for Exit/Cancel. |
| `Audio_prompt_twi_06.mp3` | *"Me pɛ sɛ wo bɛ sendi sika kɔ Kwame Nyamebrɛ fɔn so, anaa number 8464 ɛna ɛtɔ. Sɛ wo pɛ sɛ wo gye tum na wo sendi sika ma me a baako (1). Sɛ wo pɛ sɛ wo cancel a mia mmienu (2). Sɛ wo pɛ sɛ wo firi mu a mia zero (0)."* | "I want you to send money to Kwame Nyamebrɛ's phone, or number ending in 8464. If you accept to send money press 1. If you cancel press 2. If you exit press 0." | ⚠️ **Flag 8 (Inconsistent Recipient Name):** Recipient name is spoken as *"Kwame Nyamebrɛ"* (here) vs *"Kwame Nyamebere"* in English vs *"Kwame Nyame Brɛfo"* in Prompt 07. <br>⚠️ **Flag 9 (Pronoun Perspective):** Prompt says *"sendi sika ma me"* ("send money for me"), mixing the system's role with the caller's action. |
| `Audio_prompt_twi_07.mp3` | *"Mepa wo kyɛw, si di amount a wo pɛ sɛ wo send ɛkɔ Kwame Nyame Brɛfo so, woyɛ a fa hash ɛntua to."* | "Please, enter the amount you want to send to Kwame Nyame Brɛfo, when done append hash." | ⚠️ **Flag 10 (Recipient Name Mutation):** Name mutated again to *"Kwame Nyame Brɛfo"*. <br>⚠️ **Flag 11 (Phonetics):** *"si di amount"* is a phonetic transcription of English *"cedi amount"*. |
| `Audio_prompt_twi_08.mp3` | *"Me pɛ sɛ wo sendi 500 Ghana cedis asɛm a kɔ m'abɛɛ na namba so. Sɛ wopɛ sɛ woyi tum na wo sendi a, mia baako (1). Sɛ wopɛ sɛ wo cancel a, mia mmienu (2)."* | "I want you to send 500 Ghana cedis... If you confirm press 1. If you cancel press 2." | ⚠️ **Flag 12 (Static Financial Values):** Hardcodes "500 Ghana cedis" in studio audio; MUST be superseded by dynamic TTS in production. <br>⚠️ **Flag 13 (Syntax):** *"asɛm a kɔ m'abɛɛ na namba so"* is awkward/garbled syntax in the recording. |
| `Audio_prompt_twi_09.mp3` | *"Me pɛ sɛ ɔfa ɛsi wo phone no so na bɔ wo MoMo PIN."* | "I want you to look at your phone screen and enter your MoMo PIN." | ⚠️ **Flag 14 (Subject Agreement):** *"ɔfa ɛsi wo phone no so"* is colloquial Asante; a clearer standard phrasing is *"hwɛ wo fon screen so na fa wo PIN bɔ mu"*. |
| `Audio_prompt_twi_10.mp3` | *"Congratulations! 500 Ghana Cedis a wosendee to Kwame Nyamebrɛ namba no so no yɛ successful. Wo transaction no yɛ completed wɔ 17th September 2026..."* | "Congratulations! The 500 Ghana Cedis you sent to Kwame Nyamebrɛ was successful. Completed on 17 Sept 2026..." | ⚠️ **Flag 15 (Hardcoded Static Receipt):** Fixed amount, past date (17 Sept 2026), and hardcoded reference; MUST be superseded by dynamic receipt generator. |
| `Audio_prompt_twi_11.mp3` | *"Mpanimfoɔ, fakyɛ yɛn sɛ option yi nni hɔ bio. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Goodbye."* | "Respected elders/people, forgive us that this option is no longer available. Thank you for using Ɔkwankyerɛfo Pa. Goodbye." | ⚠️ **Flag 16 (Register & Sign-off):** *"Mpanimfoɔ"* is a high honorific used for elders/chiefs. In a public IVR service, polite formal *"Yɛsrɛ wo"* or *"Mepa wo kyɛw"* is more standard. Ends with English *"Goodbye"* rather than Twi *"Nante yie"*. |
| `Audio_prompt_twi_12.mp3` | *"Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa adi dwuma. Nante yie."* | "We thank you for using Ɔkwankyerɛfo Pa. Travel/walk well (Farewell)." | ✅ **Clean Standard Twi:** Excellent natural cadence and culturally authentic idiom. |

---

## 2. Accessibility Best Practices Enforced in Code

1. **Gentle Timeouts & Re-prompts:**
   - On initial silence/timeout, a gentle re-prompt is spoken.
   - Max 2 re-prompts before ending the call safely.
2. **Replay on Every Step:**
   - Key <kbd>9</kbd> (or spoken *"tie biom"*) replays current instructions without advancing state.
3. **No Money Moved Guarantee:**
   - Every cancellation or exit path explicitly speaks:
     - Twi: *"Yɛatwa mu. Sika biara mfirii wo account mu. Nante yie."*
     - English: *"Transaction cancelled. No money has been deducted from your account. Goodbye."*
