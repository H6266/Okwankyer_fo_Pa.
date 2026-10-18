# Canonical IVR Audio Mapping

Generated from the prompt manifest, runtime registry, and current checkout by `scripts/generate_audio_inventory_and_mapping.ts`.

The inventory contains 92 physical audio files. The approved library contains 84 Twi and 4 English fixed recordings. Canonical audio URLs are served from their registered asset roots. Other candidate and ambiguous files remain blocked from automatic playback. Dynamic prompts must use validated live values and approved TTS; no static sample audio is eligible for them.

Coverage totals (English and Twi combined): VERIFIED_FIXED_ASSET 92, CANDIDATE_NOT_AUDIO_VERIFIED 0, AMBIGUOUS_REVIEW_REQUIRED 0, DYNAMIC_TTS_REQUIRED 14, SAFE_FALLBACK_ONLY 84, MISSING_ASSET 0.

| Prompt ID | State | Type | English status | English asset path(s) | Twi status | Twi asset path(s) |
|---|---|---|---|---|---|---|
| OP01 | WELCOME | FIXED | VERIFIED_FIXED_ASSET | public/audio/welcome_en.mp3 | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Opening_voice_welcome_to_okwankyerefopa.mp3 |
| OP02 | LANGUAGE_SELECTION | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Language_selection.mp3 |
| OP03 | GREETING | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Greetings.mp3 |
| OP04 | WELCOME_BACK | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Welcome back.mp3 |
| OP05 | ACKNOWLEDGE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Acknowledge.mp3 |
| OP06 | PROCESSING | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Processing.mp3 |
| OP07 | SERVICE_SELECTION | FIXED | VERIFIED_FIXED_ASSET | Audio_files/English_Library/2.m4a | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Service_selection.mp3 |
| OP08 | NETWORK_SELECTION | FIXED | VERIFIED_FIXED_ASSET | Audio_files/English_Library/3.m4a | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Network_selection.mp3 |
| OP09 | MTN_MENU | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/MTN menu.mp3 |
| OP10 | SEND_MONEY_SELECTED | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Send_money_selected.mp3 |
| OP11 | SERVICE_UNAVAILABLE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Service unavailable.mp3 |
| OP12 | SERVICE_ALTERNATIVE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Service_alternative.mp3 |
| OP13 | SERVICE_NOT_READY | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Service_notready.mp3 |
| OP14 | TRY_ANOTHER_SERVICE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Try_another_service.mp3 |
| OP15 | CHOOSE_INSTEAD | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Choose instead.mp3 |
| OP16 | ENTER_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Enter_recipient.mp3 |
| OP17 | INVALID_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Invalid_recipient.mp3 |
| OP18 | RECIPIENT_FOUND | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Recipient_found.mp3 |
| OP19 | RECIPIENT_VERIFY | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Recipient_verify.mp3 |
| OP20 | RECIPIENT_NAME | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP21 | RECIPIENT_FULL_NUMBER | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP22 | RECIPIENT_CONFIRM | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Recipient_confirm_speech.mp3 |
| OP23 | RECIPIENT_CONFIRM_SPEECH | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Recipient_confirm_speech.mp3 |
| OP24 | USE_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Use_recipient 1.mp3 |
| OP25 | CHANGE_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Change recipient.mp3 |
| OP26 | ENTER_AMOUNT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Enter amount.mp3 |
| OP27 | INVALID_AMOUNT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Invalid_amount.mp3 |
| OP28 | AMOUNT_PROMPT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Amount prompt.mp3 |
| OP29 | AMOUNT_READBACK | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP30 | REPEAT_AMOUNT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Repeat amount.mp3 |
| OP31 | AMOUNT_TOO_HIGH | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Amount too high 3.mp3 |
| OP32 | AMOUNT_TOO_LOW | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Amount too low.mp3 |
| OP33 | CHANGE_AMOUNT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Change_amount.mp3 |
| OP34 | CONFIRMATION_INTRO | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Review transaction.mp3 |
| OP35 | REVIEW_TRANSACTION | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP36 | CONFIRM_CONTINUE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Confirm_continue.mp3 |
| OP37 | CONFIRM_SPEECH | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Confirm speech.mp3 |
| OP38 | REJECT_SPEECH | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Reject speech.mp3 |
| OP39 | READY_SUBMIT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Ready submit.mp3 |
| OP40 | PIN_HANDOFF | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Authorize_phone.mp3 |
| OP41 | SECURITY_WARNING | FIXED | VERIFIED_FIXED_ASSET | Audio_files/English_Library/4.m4a | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Security_warning.mp3 |
| OP42 | SECURE_PIN | FIXED | SAFE_FALLBACK_ONLY | — | SAFE_FALLBACK_ONLY | — |
| OP43 | PIN_BLOCK | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Pin Block.mp3 |
| OP44 | SENSITIVE_BLOCK | FIXED | VERIFIED_FIXED_ASSET | Audio_files/English_Library/4.m4a | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Security_warning.mp3 |
| OP45 | SUBMITTED | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Submitted.mp3 |
| OP46 | WAITING_CONFIRMATION | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Waiting_confirmation.mp3 |
| OP47 | CHECK_PHONE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Check phone.mp3 |
| OP48 | AUTH | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Authorize_phone.mp3 |
| OP49 | AUTH_RECEIVED | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Auth_received.mp3 |
| OP50 | CHECK_FINAL_STATUS | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Check_final_tatus.mp3 |
| OP51 | AUTH | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Processing.mp3 |
| OP52 | SUCCESS | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP53 | SUCCESS_SENT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Success_sent.mp3 |
| OP54 | KEEP_REFERENCE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Keep_reference.mp3 |
| OP55 | SUCCESS_CLOSE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Success_close.mp3 |
| OP56 | ANYTHING_ELSE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Anything_else.mp3 |
| OP57 | CUSTOMER_DECLINED | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Customer_Declined.mp3 |
| OP58 | FAILED | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Failed.mp3 |
| OP59 | TIMEOUT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Timeout.mp3 |
| OP60 | FAILURE_RETRY | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Failure_Retry.mp3 |
| OP61 | NO_TRANSFER_CONFIRMED | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/No_transfer_confirmed.mp3 |
| OP62 | CHECK_MESSAGES | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Check_messages.mp3 |
| OP63 | START_AGAIN | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Start_Again.mp3 |
| OP64 | NOT_UNDERSTOOD | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Not understood.mp3 |
| OP65 | DID_NOT_GET | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Did_not_get.mp3 |
| OP66 | NO_RESPONSE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Please_respond.mp3 |
| OP67 | PLEASE_RESPOND | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Please_respond.mp3 |
| OP68 | INPUT_NOT_RECOGNIZED | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Input_not_recognized.mp3 |
| OP69 | REPEAT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Repeat.mp3 |
| OP70 | CONFIRM_UNDERSTANDING | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |
| OP71 | CORRECT_PROMPT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Correct_prompt.mp3 |
| OP72 | YES_NO | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Yes_No.mp3 |
| OP73 | BACK | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Back.mp3 |
| OP74 | MAIN_MENU | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Main_menu.mp3 |
| OP75 | RESTART | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Restart.mp3 |
| OP76 | CANCEL | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Cancel.mp3 |
| OP77 | EXIT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Exit.mp3 |
| OP78 | SESSION_END | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Session_End.mp3 |
| OP79 | CONTINUE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Continue.mp3 |
| OP80 | SESSION_TIMEOUT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Session timeout.mp3 |
| OP81 | REPEAT_OPTIONS | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Repeat_Option.mp3 |
| OP82 | KEYPAD_OPTION | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Keypad_option.mp3 |
| OP83 | VOICE_OR_KEYPAD | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Voice_or_keypad.mp3 |
| OP84 | TAKE_YOUR_TIME | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Take_your_time.mp3 |
| OP85 | YES_NO_KEYPAD | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Yes_no_keypad.mp3 |
| OP86 | HELP | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Help.mp3 |
| OP87 | HELP_COMMANDS | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Help_command.mp3 |
| OP88 | BALANCE_UNAVAILABLE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Balance_Unavailable.mp3 |
| OP89 | UNSUPPORTED_SERVICE | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Unsupported_service.mp3 |
| OP90 | SYSTEM_ERROR | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/System_Error.mp3 |
| OP91 | POST_SUCCESS_HELP | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Post_success_Help.mp3 |
| OP92 | ANOTHER_TRANSACTION | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Do_you_want_Another_transaction.mp3 |
| OP93 | ANOTHER_RECIPIENT | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Do_you_want_to_send_money_to_another_person.mp3 |
| OP94 | FINISH | FIXED | SAFE_FALLBACK_ONLY | — | VERIFIED_FIXED_ASSET | Audio_files/Twi_library/Finish.mp3 |
| OP52b | REFERENCE_READBACK | DYNAMIC | DYNAMIC_TTS_REQUIRED | — | DYNAMIC_TTS_REQUIRED | — |

## Review Rules

For any new or changed recording, decode and listen to it, check it against the canonical script, check for combined prompts or sample transaction values, and obtain qualified language review where needed. Keep `audioVerified=true` only for recordings approved for runtime playback, then regenerate this file and the inventory.