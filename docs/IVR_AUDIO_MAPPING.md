# Canonical IVR Audio Mapping

Generated from the prompt manifest, runtime registry, and current checkout by `scripts/generate_audio_inventory_and_mapping.ts`.

The inventory contains 170 physical audio files. No recording is marked audio-verified in the current checkout. Candidate and ambiguous files are not eligible for automatic playback. Dynamic prompts must use validated live values and approved TTS; no static sample audio is eligible for them.

Coverage totals (English and Twi combined): VERIFIED_FIXED_ASSET 0, CANDIDATE_NOT_AUDIO_VERIFIED 75, AMBIGUOUS_REVIEW_REQUIRED 12, DYNAMIC_TTS_REQUIRED 10, SAFE_FALLBACK_ONLY 91, MISSING_ASSET 0.

| Prompt ID | State | Type | English status | English asset path(s) | Twi status | Twi asset path(s) |
|---|---|---|---|---|---|---|
| OP01 | WELCOME | FIXED | AMBIGUOUS_REVIEW_REQUIRED | public/audio/Welcome_prompt_01.mp3<br>public/audio/welcome_prompt_01.mp3 | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Twi/1.Welcome & Session Start/Welcome 1 (2).m4a |
| OP02 | LANGUAGE_SELECTION | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Twi/1.Welcome & Session Start/Language selection.m4a |
| OP03 | GREETING | FIXED | SAFE_FALLBACK_ONLY | — | SAFE_FALLBACK_ONLY | — |
| OP04 | WELCOME_BACK | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/1.Welcome & Session Start/Welcome back.m4a |
| OP05 | ACKNOWLEDGE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/1.Welcome & Session Start/Acknowledge.m4a |
| OP06 | PROCESSING | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/1.Welcome & Session Start/Processing.m4a |
| OP07 | SERVICE_SELECTION | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Twi/2.Main Service Navigation/Service selection.m4a |
| OP08 | NETWORK_SELECTION | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/2.Main Service Navigation/Network selection.m4a |
| OP09 | MTN_MENU | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/2.Main Service Navigation/MTN menu.m4a |
| OP10 | SEND_MONEY_SELECTED | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/2.Main Service Navigation/Send money selected.m4a |
| OP11 | SERVICE_UNAVAILABLE | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Twi/2.Main Service Navigation/Main service Unavailable.m4a<br>Audio_files/Twi/2.Main Service Navigation/Service unavailable.m4a |
| OP12 | SERVICE_ALTERNATIVE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/2.Main Service Navigation/Service alternative.m4a |
| OP13 | SERVICE_NOT_READY | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/2.Main Service Navigation/Service not ready.m4a |
| OP14 | TRY_ANOTHER_SERVICE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/2.Main Service Navigation/Try another service.m4a |
| OP15 | CHOOSE_INSTEAD | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/2.Main Service Navigation/Choose instead.m4a |
| OP16 | ENTER_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/3.Recipient Entry & Verification/Enter recipient 2.m4a |
| OP17 | INVALID_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/3.Recipient Entry & Verification/Invalid recipient 1.m4a |
| OP18 | RECIPIENT_FOUND | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/3.Recipient Entry & Verification/Recipient found.m4a |
| OP19 | RECIPIENT_VERIFY | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/3.Recipient Entry & Verification/Recipient verify.m4a |
| OP20 | RECIPIENT_NAME | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP21 | RECIPIENT_FULL_NUMBER | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP22 | RECIPIENT_CONFIRM | FIXED | SAFE_FALLBACK_ONLY | — | SAFE_FALLBACK_ONLY | — |
| OP23 | RECIPIENT_CONFIRM_SPEECH | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/3.Recipient Entry & Verification/Recipient confirm speech.m4a |
| OP24 | USE_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/3.Recipient Entry & Verification/Use recipient 1.m4a |
| OP25 | CHANGE_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/3.Recipient Entry & Verification/Change recipient.m4a |
| OP26 | ENTER_AMOUNT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/4.Amount Entry & Verification/Enter amount 4.m4a |
| OP27 | INVALID_AMOUNT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/4.Amount Entry & Verification/Invalid amount.m4a |
| OP28 | AMOUNT_PROMPT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/4.Amount Entry & Verification/Amount prompt.m4a |
| OP29 | AMOUNT_READBACK | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP30 | REPEAT_AMOUNT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/4.Amount Entry & Verification/Repeat amount.m4a |
| OP31 | AMOUNT_TOO_HIGH | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/4.Amount Entry & Verification/Amount too high 3.m4a |
| OP32 | AMOUNT_TOO_LOW | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/4.Amount Entry & Verification/Amount too low.m4a |
| OP33 | CHANGE_AMOUNT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/4.Amount Entry & Verification/Change amount 2.m4a |
| OP34 | CONFIRMATION_INTRO | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/5.Transaction Confirmation/Confirmation intro.m4a |
| OP35 | REVIEW_TRANSACTION | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/5.Transaction Confirmation/Review transaction.m4a |
| OP36 | CONFIRM_CONTINUE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/5.Transaction Confirmation/Confirm continue.m4a |
| OP37 | CONFIRM_SPEECH | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/5.Transaction Confirmation/Confirm speech.m4a |
| OP38 | REJECT_SPEECH | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/5.Transaction Confirmation/Reject speech.m4a |
| OP39 | READY_SUBMIT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Twi/5.Transaction Confirmation/Ready submit.m4a |
| OP40 | PIN_HANDOFF | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Pin Handoff.m4a |
| OP41 | SECURITY_WARNING | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Security warning.m4a |
| OP42 | SECURE_PIN | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Secure pin.m4a |
| OP43 | PIN_BLOCK | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Pin Block.m4a |
| OP44 | SENSITIVE_BLOCK | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Sensitive Block.m4a |
| OP45 | SUBMITTED | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Submitted.m4a |
| OP46 | WAITING_CONFIRMATION | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Waiting confirmation.m4a |
| OP47 | CHECK_PHONE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Check phone.m4a |
| OP48 | AUTHORIZE_PHONE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Authorize phone.m4a |
| OP49 | AUTH_RECEIVED | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Auth received.m4a |
| OP50 | CHECK_FINAL_STATUS | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Check final status.m4a |
| OP51 | PROCESSING | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Processing.m4a |
| OP52 | SUCCESS | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP53 | SUCCESS_SENT | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Success sent.m4a<br>Audio_files/Success.m4a |
| OP54 | KEEP_REFERENCE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Keep reference.m4a |
| OP55 | SUCCESS_CLOSE | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Success close.m4a |
| OP56 | ANYTHING_ELSE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Anything else.m4a |
| OP57 | CUSTOMER_DECLINED | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Customer Declined.m4a |
| OP58 | FAILED | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Failed.m4a |
| OP59 | TIMEOUT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Timeout.m4a |
| OP60 | FAILURE_RETRY | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Failure Retry.m4a |
| OP61 | NO_TRANSFER_CONFIRMED | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/No transfer confirmed.m4a |
| OP62 | CHECK_MESSAGES | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Check messages.m4a |
| OP63 | START_AGAIN | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Start Again.m4a |
| OP64 | NOT_UNDERSTOOD | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Not understood.m4a |
| OP65 | DID_NOT_GET | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Did not get.m4a |
| OP66 | NO_RESPONSE | FIXED | SAFE_FALLBACK_ONLY | — | SAFE_FALLBACK_ONLY | — |
| OP67 | PLEASE_RESPOND | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Please respond.m4a |
| OP68 | INPUT_NOT_RECOGNIZED | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Input not recognized.m4a |
| OP69 | REPEAT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Repeat.m4a |
| OP70 | CONFIRM_UNDERSTANDING | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP71 | CORRECT_PROMPT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Correct prompt.m4a |
| OP72 | YES_NO | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Yes -No.m4a |
| OP73 | BACK | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Back.m4a |
| OP74 | MAIN_MENU | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Main menu.m4a |
| OP75 | RESTART | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Restart.m4a |
| OP76 | CANCEL | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Cancel.m4a |
| OP77 | EXIT | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Exit.m4a |
| OP78 | SESSION_END | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Session End.m4a |
| OP79 | CONTINUE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Continue.m4a |
| OP80 | SESSION_TIMEOUT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Session timeout.m4a |
| OP81 | REPEAT_OPTIONS | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Repeat Option.m4a |
| OP82 | KEYPAD_OPTION | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Keypad option.m4a |
| OP83 | VOICE_OR_KEYPAD | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Voice or keypad.m4a |
| OP84 | TAKE_YOUR_TIME | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Take your time.m4a |
| OP85 | YES_NO_KEYPAD | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Yes -no- keypad.m4a |
| OP86 | HELP | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Help.m4a |
| OP87 | HELP_COMMANDS | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Help command.m4a |
| OP88 | BALANCE_UNAVAILABLE | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Balance Unavailable.m4a |
| OP89 | UNSUPPORTED_SERVICE | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Unsupported service.m4a |
| OP90 | SYSTEM_ERROR | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/System Error.m4a |
| OP91 | POST_SUCCESS_HELP | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Post success Help.m4a |
| OP92 | ANOTHER_TRANSACTION | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Another transaction.m4a |
| OP93 | ANOTHER_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | CANDIDATE_NOT_AUDIO_VERIFIED | Audio_files/Another recipient.m4a |
| OP94 | FINISH | FIXED | SAFE_FALLBACK_ONLY | — | AMBIGUOUS_REVIEW_REQUIRED | Audio_files/Finish.m4a |

## Review Rules

Promote a recording only after it has been decoded and listened to, checked against the canonical script, checked for combined prompts or sample transaction values, and approved by a qualified language reviewer where needed. Update the manifest status and regenerate this file and the inventory after approval.