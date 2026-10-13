# Ɔkwankyerɛfo Pa — Canonical IVR Audio Mapping Specification
**Version 1.0 • 13 October 2026**
**Team Anidasoɔ — MTN Ghana Tɛkyerɛma Pa Hackathon**

---

## 1. Mapping Philosophy

1. **Deterministic Single Source of Truth**: Every IVR state maps to a canonical Prompt ID (`OP01`–`OP94`).
2. **Strict Language Isolation**:
   - `en` session → Queries ONLY English audio assets (`public/audio/English/` or English takes).
   - `twi` session → Queries ONLY Twi audio assets (`Audio_files/audio/Twi/`, `Audio_files_2/`, `public/audio/Twi/`).
   - Never cross-play audio between languages.
3. **Safety-Gated Dynamic Templates**:
   - `OP20` (Recipient Name)
   - `OP21` (Recipient Last 4)
   - `OP29` (Amount Readback)
   - `OP52` (Success Reference)
   - `OP70` (Confirm Understanding)
   These are dynamic templates. They are never mapped to hardcoded static recordings that speak fixed sample data.
4. **Tone Fallback Policy**:
   - When a specific prompt recording is unrecorded or pending review, the engine emits a 350ms non-blocking dual chime (440Hz / 880Hz) and allows immediate continuation via keypad DTMF.

---

## 2. Master Canonical Mapping Table (`OP01`–`OP94`)

| Prompt ID | State / Use | Type | English Asset Path | Twi Asset Path | Status |
|:---:|---|:---:|---|---|:---:|
| **OP01** | WELCOME | FIXED | `public/audio/English/Welcome_prompt_01.mp3` | `Audio_files/audio/Twi/01_Welcome_Session_Start/Welcome 1.m4a` | VERIFIED |
| **OP02** | LANGUAGE_SELECTION | FIXED | `public/audio/English/Audio_prompt_02.mp3` (alt) | `Audio_files/audio/Twi/01_Welcome_Session_Start/Language selection.m4a` | VERIFIED |
| **OP03** | GREETING | FIXED | Tone Fallback | `Audio_files/audio/Twi/01_Welcome_Session_Start/Welcome back.m4a` (alt) | CANDIDATE |
| **OP04** | WELCOME_BACK | FIXED | Tone Fallback | `Audio_files/audio/Twi/01_Welcome_Session_Start/Welcome back.m4a` | VERIFIED |
| **OP05** | ACKNOWLEDGE | FIXED | Tone Fallback | `Audio_files/audio/Twi/01_Welcome_Session_Start/Acknowledge.m4a` | VERIFIED |
| **OP06** | PROCESSING | FIXED | Tone Fallback | `Audio_files/audio/Twi/01_Welcome_Session_Start/Processing.m4a` | VERIFIED |
| **OP07** | SERVICE_SELECTION | FIXED | `public/audio/English/Audio_prompt_02.mp3` | `Audio_files/audio/Twi/02_Main_Service_Navigation/Service selection.m4a` | VERIFIED |
| **OP08** | NETWORK_SELECTION | FIXED | `public/audio/English/Audio_prompt_03.mp3` | `Audio_files/audio/Twi/02_Main_Service_Navigation/Network selection.m4a` | VERIFIED |
| **OP09** | MTN_MENU | FIXED | `public/audio/English/Audio_prompt_05.mp3` | `Audio_files/audio/Twi/02_Main_Service_Navigation/MTN menu.m4a` | VERIFIED |
| **OP10** | SEND_MONEY_SELECTED | FIXED | Tone Fallback | `Audio_files/audio/Twi/02_Main_Service_Navigation/Send money selected.m4a` | VERIFIED |
| **OP11** | SERVICE_UNAVAILABLE | FIXED | Tone Fallback | `Audio_files/audio/Twi/02_Main_Service_Navigation/Service unavailable.m4a` | VERIFIED |
| **OP12** | SERVICE_ALTERNATIVE | FIXED | Tone Fallback | `Audio_files/audio/Twi/02_Main_Service_Navigation/Service alternative.m4a` | VERIFIED |
| **OP13** | SERVICE_NOT_READY | FIXED | Tone Fallback | `Audio_files/audio/Twi/02_Main_Service_Navigation/Service not ready.m4a` | VERIFIED |
| **OP14** | TRY_ANOTHER_SERVICE | FIXED | Tone Fallback | `Audio_files/audio/Twi/02_Main_Service_Navigation/Try another service.m4a` | VERIFIED |
| **OP15** | CHOOSE_INSTEAD | FIXED | Tone Fallback | `Audio_files/audio/Twi/02_Main_Service_Navigation/Choose instead.m4a` | VERIFIED |
| **OP16** | ENTER_RECIPIENT | FIXED | `public/audio/English/Audio_prompt_06.mp3` | `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Enter recipient.m4a` | VERIFIED |
| **OP17** | INVALID_RECIPIENT | FIXED | Tone Fallback | `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Invalid recipient.m4a` | VERIFIED |
| **OP18** | RECIPIENT_FOUND | FIXED | Tone Fallback | `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Recipient found.m4a` | VERIFIED |
| **OP19** | RECIPIENT_VERIFY | FIXED | Tone Fallback | `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Recipient verify.m4a` | VERIFIED |
| **OP20** | RECIPIENT_NAME | DYN | Dynamic TTS / Tone | Dynamic TTS / Tone | DYNAMIC |
| **OP21** | RECIPIENT_LAST4 | DYN | Dynamic TTS / Tone | Dynamic TTS / Tone | DYNAMIC |
| **OP22** | RECIPIENT_CONFIRM | FIXED | Tone Fallback | `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Recipient confirm.m4a` | VERIFIED |
| **OP23** | RECIPIENT_CONFIRM_SPEECH | FIXED | Tone Fallback | Tone Fallback | PENDING |
| **OP24** | USE_RECIPIENT | FIXED | Tone Fallback | `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Use recipient.m4a` | VERIFIED |
| **OP25** | CHANGE_RECIPIENT | FIXED | Tone Fallback | `Audio_files/audio/Twi/03_Recipient_Entry_Verification/Change recipient.m4a` | VERIFIED |
| **OP26** | ENTER_AMOUNT | FIXED | `public/audio/English/Audio_prompt_07.mp3` | `Audio_files/audio/Twi/04_Amount_Entry_Verification/Enter amount.m4a` | VERIFIED |
| **OP27** | INVALID_AMOUNT | FIXED | Tone Fallback | `Audio_files/audio/Twi/04_Amount_Entry_Verification/Invalid amount.m4a` | VERIFIED |
| **OP28** | AMOUNT_PROMPT | FIXED | Tone Fallback | `Audio_files/audio/Twi/04_Amount_Entry_Verification/Amount prompt.m4a` | VERIFIED |
| **OP29** | AMOUNT_READBACK | DYN | Dynamic TTS / Tone | Dynamic TTS / Tone | DYNAMIC |
| **OP30** | REPEAT_AMOUNT | FIXED | Tone Fallback | `Audio_files/audio/Twi/04_Amount_Entry_Verification/Repeat amount.m4a` | VERIFIED |
| **OP31** | AMOUNT_TOO_HIGH | FIXED | Tone Fallback | `Audio_files/audio/Twi/04_Amount_Entry_Verification/Amount too high.m4a` | VERIFIED |
| **OP32** | AMOUNT_TOO_LOW | FIXED | Tone Fallback | `Audio_files/audio/Twi/04_Amount_Entry_Verification/Amount too low.m4a` | VERIFIED |
| **OP33** | CHANGE_AMOUNT | FIXED | Tone Fallback | `Audio_files/audio/Twi/04_Amount_Entry_Verification/Change amount.m4a` | VERIFIED |
| **OP34** | CONFIRMATION_INTRO | FIXED | Tone Fallback | `Audio_files/audio/Twi/05_Transaction_Confirmation/Confirmation intro.m4a` | VERIFIED |
| **OP35** | REVIEW_TRANSACTION | FIXED | Tone Fallback | `Audio_files/audio/Twi/05_Transaction_Confirmation/Review transaction.m4a` | VERIFIED |
| **OP36** | CONFIRM_CONTINUE | FIXED | `public/audio/English/Audio_prompt_08.mp3` | `Audio_files_2/Yes -No.m4a` | CANDIDATE |
| **OP37** | CONFIRM_SPEECH | FIXED | Tone Fallback | `Audio_files/audio/Twi/05_Transaction_Confirmation/Confirm speech.m4a` | VERIFIED |
| **OP38** | REJECT_SPEECH | FIXED | Tone Fallback | `Audio_files/audio/Twi/05_Transaction_Confirmation/Reject speech.m4a` | VERIFIED |
| **OP39** | READY_SUBMIT | FIXED | Tone Fallback | `Audio_files/audio/Twi/05_Transaction_Confirmation/Ready submit.m4a` | VERIFIED |
| **OP40** | PIN_HANDOFF | FIXED | Tone Fallback | `Audio_files_2/Pin Handoff.m4a` | SECURITY |
| **OP41** | SECURITY_WARNING | FIXED | Tone Fallback | `Audio_files_2/Security warning.m4a` | SECURITY |
| **OP42** | SECURE_PIN | FIXED | Tone Fallback | `Audio_files_2/Secure pin.m4a` | SECURITY |
| **OP43** | PIN_BLOCK | FIXED | Tone Fallback | `Audio_files_2/Pin Block.m4a` | SECURITY |
| **OP44** | SENSITIVE_BLOCK | FIXED | Tone Fallback | `Audio_files_2/Sensitive Block.m4a` | SECURITY |
| **OP45** | SUBMITTED | FIXED | Tone Fallback | `Audio_files_2/Submitted.m4a` | VERIFIED |
| **OP46** | WAITING_CONFIRMATION | FIXED | Tone Fallback | `Audio_files_2/Waiting confirmation.m4a` | VERIFIED |
| **OP47** | CHECK_PHONE | FIXED | Tone Fallback | `Audio_files_2/Check phone.m4a` | VERIFIED |
| **OP48** | AUTHORIZE_PHONE | FIXED | Tone Fallback | `Audio_files_2/Authorize phone.m4a` | VERIFIED |
| **OP49** | AUTH_RECEIVED | FIXED | Tone Fallback | `Audio_files_2/Auth received.m4a` | VERIFIED |
| **OP50** | CHECK_FINAL_STATUS | FIXED | Tone Fallback | `Audio_files_2/Check final status.m4a` | VERIFIED |
| **OP51** | PROCESSING | FIXED | Tone Fallback | `Audio_files_2/Processing.m4a` | VERIFIED |
| **OP52** | SUCCESS | DYN | Dynamic TTS / Tone | Dynamic TTS / Tone | DYNAMIC |
| **OP53** | SUCCESS_SENT | FIXED | `public/audio/English/Audio_prompt_10.mp3` | `Audio_files_2/Success sent.m4a` | VERIFIED |
| **OP54** | KEEP_REFERENCE | FIXED | Tone Fallback | `Audio_files_2/Keep reference.m4a` | VERIFIED |
| **OP55** | SUCCESS_CLOSE | FIXED | Tone Fallback | `Audio_files_2/Success close.m4a` | VERIFIED |
| **OP56** | ANYTHING_ELSE | FIXED | Tone Fallback | `Audio_files_2/Anything else.m4a` | VERIFIED |
| **OP57** | CUSTOMER_DECLINED | FIXED | Tone Fallback | `Audio_files_2/Customer Declined.m4a` | VERIFIED |
| **OP58** | FAILED | FIXED | Tone Fallback | `Audio_files_2/Failed.m4a` | VERIFIED |
| **OP59** | TIMEOUT | FIXED | Tone Fallback | `Audio_files_2/Timeout.m4a` | VERIFIED |
| **OP60** | FAILURE_RETRY | FIXED | Tone Fallback | `Audio_files_2/Failure Retry.m4a` | VERIFIED |
| **OP61** | NO_TRANSFER_CONFIRMED| FIXED | Tone Fallback | `Audio_files_2/No transfer confirmed.m4a`| VERIFIED |
| **OP62** | CHECK_MESSAGES | FIXED | Tone Fallback | `Audio_files_2/Check messages.m4a` | VERIFIED |
| **OP63** | START_AGAIN | FIXED | Tone Fallback | `Audio_files_2/Start Again.m4a` | VERIFIED |
| **OP64** | NOT_UNDERSTOOD | FIXED | Tone Fallback | `Audio_files_2/Not understood.m4a` | VERIFIED |
| **OP65** | DID_NOT_GET | FIXED | Tone Fallback | `Audio_files_2/Did not get.m4a` | VERIFIED |
| **OP66** | NO_RESPONSE | FIXED | Tone Fallback | Tone Fallback | PENDING |
| **OP67** | PLEASE_RESPOND | FIXED | Tone Fallback | `Audio_files_2/Please respond.m4a` | VERIFIED |
| **OP68** | INPUT_NOT_RECOGNIZED | FIXED | Tone Fallback | `Audio_files_2/Input not recognized.m4a` | VERIFIED |
| **OP69** | REPEAT | FIXED | Tone Fallback | `Audio_files_2/Repeat.m4a` | VERIFIED |
| **OP70** | CONFIRM_UNDERSTANDING| DYN | Dynamic TTS / Tone | `Audio_files_2/Confirm understanding.m4a`| DYNAMIC |
| **OP71** | CORRECT_PROMPT | FIXED | Tone Fallback | `Audio_files_2/Correct prompt.m4a` | VERIFIED |
| **OP72** | YES_NO | FIXED | Tone Fallback | `Audio_files_2/Yes -No.m4a` | VERIFIED |
| **OP73** | BACK | FIXED | Tone Fallback | `Audio_files_2/Back.m4a` | VERIFIED |
| **OP74** | MAIN_MENU | FIXED | Tone Fallback | `Audio_files_2/Main menu.m4a` | VERIFIED |
| **OP75** | RESTART | FIXED | Tone Fallback | `Audio_files_2/Restart.m4a` | VERIFIED |
| **OP76** | CANCEL | FIXED | `public/audio/English/Audio_prompt_11.mp3` | `Audio_files_2/Cancel.m4a` | VERIFIED |
| **OP77** | EXIT | FIXED | `public/audio/English/Audio_prompt_12.mp3` | `Audio_files_2/Exit.m4a` | VERIFIED |
| **OP78** | SESSION_END | FIXED | Tone Fallback | `Audio_files_2/Session End.m4a` | VERIFIED |
| **OP79** | CONTINUE | FIXED | Tone Fallback | `Audio_files_2/Continue.m4a` | VERIFIED |
| **OP80** | SESSION_TIMEOUT | FIXED | Tone Fallback | `Audio_files_2/Session timeout.m4a` | VERIFIED |
| **OP81** | REPEAT_OPTIONS | FIXED | Tone Fallback | `Audio_files_2/Repeat Option.m4a` | VERIFIED |
| **OP82** | KEYPAD_OPTION | FIXED | Tone Fallback | `Audio_files_2/Keypad option.m4a` | VERIFIED |
| **OP83** | VOICE_OR_KEYPAD | FIXED | Tone Fallback | `Audio_files_2/Voice or keypad.m4a` | VERIFIED |
| **OP84** | TAKE_YOUR_TIME | FIXED | Tone Fallback | `Audio_files_2/Take your time.m4a` | VERIFIED |
| **OP85** | YES_NO_KEYPAD | FIXED | Tone Fallback | `Audio_files_2/Yes -no- keypad.m4a` | VERIFIED |
| **OP86** | HELP | FIXED | `public/audio/English/Audio_prompt_13.mp3` | `Audio_files_2/Help.m4a` | VERIFIED |
| **OP87** | HELP_COMMANDS | FIXED | Tone Fallback | `Audio_files_2/Help command.m4a` | VERIFIED |
| **OP88** | BALANCE_UNAVAILABLE | FIXED | Tone Fallback | `Audio_files_2/Balance Unavailable.m4a` | VERIFIED |
| **OP89** | UNSUPPORTED_SERVICE | FIXED | Tone Fallback | `Audio_files_2/Unsupported service.m4a` | VERIFIED |
| **OP90** | SYSTEM_ERROR | FIXED | Tone Fallback | `Audio_files_2/System Error.m4a` | VERIFIED |
| **OP91** | POST_SUCCESS_HELP | FIXED | Tone Fallback | `Audio_files_2/Post success Help.m4a` | VERIFIED |
| **OP92** | ANOTHER_TRANSACTION | FIXED | Tone Fallback | `Audio_files_2/Another transaction.m4a`| VERIFIED |
| **OP93** | ANOTHER_RECIPIENT | FIXED | Tone Fallback | `Audio_files_2/Another recipient.m4a` | VERIFIED |
| **OP94** | FINISH | FIXED | Tone Fallback | `Audio_files_2/Finish.m4a` | VERIFIED |
