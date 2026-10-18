/**
 * Ɔkwankyerɛfo Pa - Authoritative Twi Audio Library Manifest
 *
 * Ground-truth catalog parsed and synchronized from:
 * Audio_files/Twi_library/transcriped_twi_audio_library.txt
 * All audio files reside physically in Audio_files/Twi_library/
 */

export interface TwiLibraryItem {
  key: string;
  filename: string;
  audioUrl: string;
  transcript: string;
  category: "session" | "navigation" | "recipient" | "amount" | "confirmation" | "auth" | "outcome" | "help" | "general";
  keywords: string[];
}

export const TWI_AUDIO_LIBRARY_ITEMS: TwiLibraryItem[] = [
  {
    key: "opening_voice_welcome_to_okwankyerefopa",
    filename: "Opening_voice_welcome_to_okwankyerefopa.mp3",
    audioUrl: "/audio/Twi_library/Opening_voice_welcome_to_okwankyerefopa.mp3",
    transcript: "welcome to okwankyereforpa, an easy financial service, for English press 1 for twi press2",
    category: "session",
    keywords: ["welcome", "akwaaba", "okwankyerefo", "okwankyerefopa", "english", "twi", "press 1", "press 2"]
  },
  {
    key: "language_selection",
    filename: "Language_selection.mp3",
    audioUrl: "/audio/Twi_library/Language_selection.mp3",
    transcript: "for English press 1 for twi press 2",
    category: "session",
    keywords: ["language", "english", "twi", "press 1", "press 2"]
  },
  {
    key: "greetings",
    filename: "Greetings.mp3",
    audioUrl: "/audio/Twi_library/Greetings.mp3",
    transcript: "welcome, what would you like us to help you with today ?",
    category: "session",
    keywords: ["welcome", "greetings", "help", "today", "dɛn", "boa"]
  },
  {
    key: "welcome_back",
    filename: "Welcome back.mp3",
    audioUrl: "/audio/Twi_library/Welcome back.mp3",
    transcript: "welcome again, what can i help you with",
    category: "session",
    keywords: ["welcome again", "welcome back", "help", "san"]
  },
  {
    key: "service_description",
    filename: "service_description.mp3",
    audioUrl: "/audio/Twi_library/service_description.mp3",
    transcript: "welcome to okwankyerefo pa, we are an accessibility layer that help and makes services easy for everyone with inclusivity, the elderly and disabled",
    category: "session",
    keywords: ["accessibility", "elderly", "disabled", "inclusivity", "easy", "service description"]
  },
  {
    key: "main_menu",
    filename: "Main_menu.mp3",
    audioUrl: "/audio/Twi_library/Main_menu.mp3",
    transcript: "Then please,let us go back to the main menu",
    category: "navigation",
    keywords: ["main menu", "menu", "san kɔ", "menu titire"]
  },
  {
    key: "choose_instead",
    filename: "Choose instead.mp3",
    audioUrl: "/audio/Twi_library/Choose instead.mp3",
    transcript: "okay, what would you like to do now ?",
    category: "navigation",
    keywords: ["choose instead", "what would you like to do", "dɛn na wopɛ"]
  },
  {
    key: "service_selection",
    filename: "Service_selection.mp3",
    audioUrl: "/audio/Twi_library/Service_selection.mp3",
    transcript: "if you want mobile money service, press 1, for banking service press 2, press 9 for repeat, or press 0 to end the service",
    category: "navigation",
    keywords: ["mobile money", "momo", "banking", "press 1", "press 2", "repeat", "end"]
  },
  {
    key: "network_selection",
    filename: "Network_selection.mp3",
    audioUrl: "/audio/Twi_library/Network_selection.mp3",
    transcript: "please, select network, for mtn press 1, for telecel press 2, for airteltigo press 3, press 9 so i repeat this again, to end the session press 0",
    category: "navigation",
    keywords: ["network", "mtn", "telecel", "airteltigo", "press 1", "press 2", "press 3"]
  },
  {
    key: "mtn_menu",
    filename: "MTN menu.mp3",
    audioUrl: "/audio/Twi_library/MTN menu.mp3",
    transcript: "this is mtn service, for mobile money press 1,to check account press 2 for press 8 to go back or press 0 to go back",
    category: "navigation",
    keywords: ["mtn service", "mobile money", "check account", "go back"]
  },
  {
    key: "send_money_selected",
    filename: "Send_money_selected.mp3",
    audioUrl: "/audio/Twi_library/Send_money_selected.mp3",
    transcript: "please you have selected 1 to send transfer money",
    category: "navigation",
    keywords: ["send money", "transfer money", "sika", "mane sika", "selected 1"]
  },
  {
    key: "do_you_want_to_send_money_to_another_person",
    filename: "Do_you_want_to_send_money_to_another_person.mp3",
    audioUrl: "/audio/Twi_library/Do_you_want_to_send_money_to_another_person.mp3",
    transcript: "Do you want to send money to another person ?",
    category: "recipient",
    keywords: ["send money to another person", "another person", "obi foforɔ"]
  },
  {
    key: "enter_recipient",
    filename: "Enter_recipient.mp3",
    audioUrl: "/audio/Twi_library/Enter_recipient.mp3",
    transcript: "please enter the recipient number , when you are done press # at the end, or press 0 to end the conversation here",
    category: "recipient",
    keywords: ["enter recipient", "recipient number", "phone number", "nɔma", "hash"]
  },
  {
    key: "invalid_recipient",
    filename: "Invalid_recipient.mp3",
    audioUrl: "/audio/Twi_library/Invalid_recipient.mp3",
    transcript: "the number you gave is not correct, it seems there is a problem with it, please enter the number you want to send the money to , when you are done add # to it",
    category: "recipient",
    keywords: ["invalid recipient", "number not correct", "problem", "nɔma nyɛ"]
  },
  {
    key: "recipient_found",
    filename: "Recipient_found.mp3",
    audioUrl: "/audio/Twi_library/Recipient_found.mp3",
    transcript: "i have found the name of the person you want to send the money to ",
    category: "recipient",
    keywords: ["recipient found", "found the name", "adin", "yeahu din"]
  },
  {
    key: "recipient_verify",
    filename: "Recipient_verify.mp3",
    audioUrl: "/audio/Twi_library/Recipient_verify.mp3",
    transcript: "Please i have found the name of the person you are sending the money to, please listen to the name and the 4 numbers that ends with the contact",
    category: "recipient",
    keywords: ["recipient verify", "listen to the name", "4 numbers that ends", "verify"]
  },
  {
    key: "recipient_confirm_speech",
    filename: "Recipient_confirm_speech.mp3",
    audioUrl: "/audio/Twi_library/Recipient_confirm_speech.mp3",
    transcript: "please you are sending money to this person, say yes or press 1 to proceed if not press 2 or say no to cancel",
    category: "recipient",
    keywords: ["recipient confirm", "say yes", "press 1", "press 2", "cancel"]
  },
  {
    key: "use_recipient",
    filename: "Use_recipient 1.mp3",
    audioUrl: "/audio/Twi_library/Use_recipient 1.mp3",
    transcript: "okay we will send the money to the recipeient for you",
    category: "recipient",
    keywords: ["use recipient", "send to recipient", "yɛbɛmane sika"]
  },
  {
    key: "change_recipient",
    filename: "Change recipient.mp3",
    audioUrl: "/audio/Twi_library/Change recipient.mp3",
    transcript: "Okay, please mention the number other number you want to send the money to ",
    category: "recipient",
    keywords: ["change recipient", "other number", "different recipient", "sesa nɔma"]
  },
  {
    key: "amount_prompt",
    filename: "Amount prompt.mp3",
    audioUrl: "/audio/Twi_library/Amount prompt.mp3",
    transcript: "please how much do you want to send to the person",
    category: "amount",
    keywords: ["how much", "amount prompt", "sika ahe", "sika dodow"]
  },
  {
    key: "enter_amount",
    filename: "Enter amount.mp3",
    audioUrl: "/audio/Twi_library/Enter amount.mp3",
    transcript: "yes please, enter the amount you want to send, press * to add pesewas , when you are done press #",
    category: "amount",
    keywords: ["enter amount", "pesewas", "hash", "hyehyɛ sika dodow"]
  },
  {
    key: "amount_readback",
    filename: "Amount readback.mp3",
    audioUrl: "/audio/Twi_library/Amount readback.mp3",
    transcript: "please what i heard is that you want to send",
    category: "amount",
    keywords: ["amount readback", "what i heard", "wopɛ sɛ womane"]
  },
  {
    key: "amount_too_high",
    filename: "Amount too high 3.mp3",
    audioUrl: "/audio/Twi_library/Amount too high 3.mp3",
    transcript: "please the money you want to send exceed the allowed cash out on your account, please mention an another amount so that we send it",
    category: "amount",
    keywords: ["amount too high", "exceed", "allowed limit", "doso dodo"]
  },
  {
    key: "amount_too_low",
    filename: "Amount too low.mp3",
    audioUrl: "/audio/Twi_library/Amount too low.mp3",
    transcript: "please the money you want to send is too low than the allowed cash out on your account, please mention an another amount so that we send it",
    category: "amount",
    keywords: ["amount too low", "too low", "sua dodo"]
  },
  {
    key: "invalid_amount",
    filename: "Invalid_amount.mp3",
    audioUrl: "/audio/Twi_library/Invalid_amount.mp3",
    transcript: "please the amount you mentioned is invalid, please give us a different amount to continue with this transaction",
    category: "amount",
    keywords: ["invalid amount", "different amount", "sika nyɛ pɛpɛɛpɛ"]
  },
  {
    key: "repeat_amount",
    filename: "Repeat amount.mp3",
    audioUrl: "/audio/Twi_library/Repeat amount.mp3",
    transcript: "please mention the amount again",
    category: "amount",
    keywords: ["mention amount again", "repeat amount", "ka sika bio"]
  },
  {
    key: "change_amount",
    filename: "Change_amount.mp3",
    audioUrl: "/audio/Twi_library/Change_amount.mp3",
    transcript: "yes please, then mention a different amount",
    category: "amount",
    keywords: ["change amount", "different amount", "sesa sika"]
  },
  {
    key: "review_transaction",
    filename: "Review transaction.mp3",
    audioUrl: "/audio/Twi_library/Review transaction.mp3",
    transcript: "please look through your transaction before we continue",
    category: "confirmation",
    keywords: ["review transaction", "look through", "hwɛ mu yie", "nsɛm no"]
  },
  {
    key: "confirm_continue",
    filename: "Confirm_continue.mp3",
    audioUrl: "/audio/Twi_library/Confirm_continue.mp3",
    transcript: "if you agree to continue press1, if you dont agree press 2, to exit press 0",
    category: "confirmation",
    keywords: ["agree to continue", "press 1", "press 2", "exit press 0", "pene so"]
  },
  {
    key: "confirm_speech",
    filename: "Confirm speech.mp3",
    audioUrl: "/audio/Twi_library/Confirm speech.mp3",
    transcript: "if you agree on this transaction, press 1 or say outloud yes",
    category: "confirmation",
    keywords: ["agree on this transaction", "say yes", "press 1", "ka aane"]
  },
  {
    key: "reject_speech",
    filename: "Reject speech.mp3",
    audioUrl: "/audio/Twi_library/Reject speech.mp3",
    transcript: "if you want to change this transaction say no or press 2",
    category: "confirmation",
    keywords: ["change this transaction", "say no", "press 2", "ka dabi"]
  },
  {
    key: "ready_submit",
    filename: "Ready submit.mp3",
    audioUrl: "/audio/Twi_library/Ready submit.mp3",
    transcript: "your transaction is ready to be submitted, do you want to continue ?",
    category: "confirmation",
    keywords: ["ready to be submitted", "continue", "asiesie"]
  },
  {
    key: "authorize_phone",
    filename: "Authorize_phone.mp3",
    audioUrl: "/audio/Twi_library/Authorize_phone.mp3",
    transcript: "Please authorize the transaction on your phone!",
    category: "auth",
    keywords: ["authorize", "phone", "enter pin", "screen prompt", "hyɛ nso"]
  },
  {
    key: "check_phone",
    filename: "Check phone.mp3",
    audioUrl: "/audio/Twi_library/Check phone.mp3",
    transcript: "Please check your phone screen to complete the authorization",
    category: "auth",
    keywords: ["check phone", "phone screen", "hwɛ wo fon so"]
  },
  {
    key: "pin_block",
    filename: "Pin Block.mp3",
    audioUrl: "/audio/Twi_library/Pin Block.mp3",
    transcript: "Please i can not work with this pin you entered !",
    category: "auth",
    keywords: ["pin block", "cannot work with pin", "pin invalid", "pin nyɛ"]
  },
  {
    key: "auth_received",
    filename: "Auth_received.mp3",
    audioUrl: "/audio/Twi_library/Auth_received.mp3",
    transcript: "We have received your authorization to proceed",
    category: "auth",
    keywords: ["authorization received", "auth received", "proceed", "nsoa aba"]
  },
  {
    key: "processing",
    filename: "Processing.mp3",
    audioUrl: "/audio/Twi_library/Processing.mp3",
    transcript: "Your authorization is not complete, so please wait as we check your authorization process!",
    category: "auth",
    keywords: ["processing", "wait", "checking authorization", "twɛn kakra"]
  },
  {
    key: "submitted",
    filename: "Submitted.mp3",
    audioUrl: "/audio/Twi_library/Submitted.mp3",
    transcript: "Please i have submitted your transaction !",
    category: "outcome",
    keywords: ["submitted", "submitted your transaction", "de akɔ"]
  },
  {
    key: "waiting_confirmation",
    filename: "Waiting_confirmation.mp3",
    audioUrl: "/audio/Twi_library/Waiting_confirmation.mp3",
    transcript: "We are waiting for confirmation from the mobikle money service",
    category: "outcome",
    keywords: ["waiting confirmation", "mobile money service", "twɛn nkyerɛwee"]
  },
  {
    key: "check_final_status",
    filename: "Check_final_tatus.mp3",
    audioUrl: "/audio/Twi_library/Check_final_tatus.mp3",
    transcript: "please we are checking the final transaction status",
    category: "outcome",
    keywords: ["checking final transaction status", "status", "hwɛ nea ewiei"]
  },
  {
    key: "check_messages",
    filename: "Check_messages.mp3",
    audioUrl: "/audio/Twi_library/Check_messages.mp3",
    transcript: "Please check your messages for transaction confirmation SMS",
    category: "outcome",
    keywords: ["check messages", "sms", "messages", "hwɛ wo nkratoɔ"]
  },
  {
    key: "success_sent",
    filename: "Success_sent.mp3",
    audioUrl: "/audio/Twi_library/Success_sent.mp3",
    transcript: "we have sent the money successfully ?",
    category: "outcome",
    keywords: ["success sent", "money sent successfully", "we have sent the money successfully", "sent the money", "sika akɔ yie"]
  },
  {
    key: "success_close",
    filename: "Success_close.mp3",
    audioUrl: "/audio/Twi_library/Success_close.mp3",
    transcript: "please we have successfully completed your transaction, thank you for using okwankyerefo pa",
    category: "outcome",
    keywords: ["success close", "successfully completed", "thank you", "edaase"]
  },
  {
    key: "failed",
    filename: "Failed.mp3",
    audioUrl: "/audio/Twi_library/Failed.mp3",
    transcript: "We could not finish your transaction, because of that the transfer did you happend, please try again later",
    category: "outcome",
    keywords: ["failed", "could not finish", "did not happen", "anwie yie"]
  },
  {
    key: "failure_retry",
    filename: "Failure_Retry.mp3",
    audioUrl: "/audio/Twi_library/Failure_Retry.mp3",
    transcript: "Awww, we could not succeed with your transaction, do you want to try again ?",
    category: "outcome",
    keywords: ["failure retry", "not succeed", "try again", "san bɔ mmɔden bio"]
  },
  {
    key: "customer_declined",
    filename: "Customer_Declined.mp3",
    audioUrl: "/audio/Twi_library/Customer_Declined.mp3",
    transcript: "You did not give the transaction authorization, so we cant transfer your money !",
    category: "outcome",
    keywords: ["customer declined", "did not give authorization", "poo no"]
  },
  {
    key: "cancel",
    filename: "Cancel.mp3",
    audioUrl: "/audio/Twi_library/Cancel.mp3",
    transcript: "Please your transaction has been cancelled, we were not able to perform any transaction ",
    category: "outcome",
    keywords: ["cancelled", "transaction cancelled", "twaa mu"]
  },
  {
    key: "no_transfer_confirmed",
    filename: "No_transfer_confirmed.mp3",
    audioUrl: "/audio/Twi_library/No_transfer_confirmed.mp3",
    transcript: "Please you have not given confirmed any transaction",
    category: "outcome",
    keywords: ["no transfer confirmed", "not confirmed"]
  },
  {
    key: "timeout",
    filename: "Timeout.mp3",
    audioUrl: "/audio/Twi_library/Timeout.mp3",
    transcript: "Please we could not get your confirmation in time, please check your mobile money messages before you try again",
    category: "outcome",
    keywords: ["timeout", "not get confirmation in time", "bere atwa mu"]
  },
  {
    key: "session_timeout",
    filename: "Session timeout.mp3",
    audioUrl: "/audio/Twi_library/Session timeout.mp3",
    transcript: "Session timeout",
    category: "session",
    keywords: ["session timeout", "timeout", "bere asa"]
  },
  {
    key: "session_end",
    filename: "Session_End.mp3",
    audioUrl: "/audio/Twi_library/Session_End.mp3",
    transcript: "please we are at the end of this session",
    category: "session",
    keywords: ["end of session", "session end", "awie"]
  },
  {
    key: "finish",
    filename: "Finish.mp3",
    audioUrl: "/audio/Twi_library/Finish.mp3",
    transcript: "Okay, your request is now complete, thank you for using okwankyerefo pa",
    category: "outcome",
    keywords: ["complete", "finish", "thank you for using", "awie pɛyɛ"]
  },
  {
    key: "anything_else",
    filename: "Anything_else.mp3",
    audioUrl: "/audio/Twi_library/Anything_else.mp3",
    transcript: "Would you like us to perform another transaction for you ?",
    category: "outcome",
    keywords: ["anything else", "another transaction", "biribi foforɔ"]
  },
  {
    key: "do_you_want_another_transaction",
    filename: "Do_you_want_Another_transaction.mp3",
    audioUrl: "/audio/Twi_library/Do_you_want_Another_transaction.mp3",
    transcript: "Do you want to perform another transaction ?",
    category: "outcome",
    keywords: ["another transaction", "dwumadie foforɔ"]
  },
  {
    key: "post_success_help",
    filename: "Post_success_Help.mp3",
    audioUrl: "/audio/Twi_library/Post_success_Help.mp3",
    transcript: "Your transaction is complete, can i help you with something else, like sending money ?",
    category: "outcome",
    keywords: ["post success help", "transaction complete", "something else"]
  },
  {
    key: "start_again",
    filename: "Start_Again.mp3",
    audioUrl: "/audio/Twi_library/Start_Again.mp3",
    transcript: "Do you want to start again ?",
    category: "navigation",
    keywords: ["start again", "hyɛ aseɛ bio"]
  },
  {
    key: "restart",
    filename: "Restart.mp3",
    audioUrl: "/audio/Twi_library/Restart.mp3",
    transcript: "okay, let us start again then",
    category: "navigation",
    keywords: ["restart", "let us start again"]
  },
  {
    key: "continue",
    filename: "Continue.mp3",
    audioUrl: "/audio/Twi_library/Continue.mp3",
    transcript: "Please do you want to continue ?",
    category: "navigation",
    keywords: ["continue", "toaso"]
  },
  {
    key: "back",
    filename: "Back.mp3",
    audioUrl: "/audio/Twi_library/Back.mp3",
    transcript: "Okay, let us move one step backwards",
    category: "navigation",
    keywords: ["back", "step backwards", "san akyi"]
  },
  {
    key: "exit",
    filename: "Exit.mp3",
    audioUrl: "/audio/Twi_library/Exit.mp3",
    transcript: "Thank you for using okwankyerefopa, later",
    category: "navigation",
    keywords: ["exit", "bye", "later", "nkyɛ"]
  },
  {
    key: "help",
    filename: "Help.mp3",
    audioUrl: "/audio/Twi_library/Help.mp3",
    transcript: "Need help? You can ask me or mention your desired action",
    category: "help",
    keywords: ["help", "boa", "assistance"]
  },
  {
    key: "help_command",
    filename: "Help_command.mp3",
    audioUrl: "/audio/Twi_library/Help_command.mp3",
    transcript: "You can say help, repeat,cancel, anything you want",
    category: "help",
    keywords: ["help command", "say help", "repeat", "cancel", "bisa boa"]
  },
  {
    key: "did_not_get",
    filename: "Did_not_get.mp3",
    audioUrl: "/audio/Twi_library/Did_not_get.mp3",
    transcript: "Please i did not get what you said, please mention it again ",
    category: "help",
    keywords: ["did not get", "mention it again", "ante aseɛ", "ka bio"]
  },
  {
    key: "not_understood",
    filename: "Not understood.mp3",
    audioUrl: "/audio/Twi_library/Not understood.mp3",
    transcript: "please i did not understand what said please say it again",
    category: "help",
    keywords: ["not understood", "say it again", "menteaseɛ"]
  },
  {
    key: "input_not_recognized",
    filename: "Input_not_recognized.mp3",
    audioUrl: "/audio/Twi_library/Input_not_recognized.mp3",
    transcript: "I can not work with your reply, please come again !",
    category: "help",
    keywords: ["input not recognized", "cannot work with reply", "come again"]
  },
  {
    key: "please_respond",
    filename: "Please_respond.mp3",
    audioUrl: "/audio/Twi_library/Please_respond.mp3",
    transcript: "I did not get any response from you, please give us a response!",
    category: "help",
    keywords: ["please respond", "no response", "bua"]
  },
  {
    key: "confirm_understanding",
    filename: "Confirm_understanding.mp3",
    audioUrl: "/audio/Twi_library/Confirm_understanding.mp3",
    transcript: "i heard you want to send money, is that so ?",
    category: "help",
    keywords: ["confirm understanding", "heard you want to send money", "mate"]
  },
  {
    key: "correct_prompt",
    filename: "Correct_prompt.mp3",
    audioUrl: "/audio/Twi_library/Correct_prompt.mp3",
    transcript: "Please i understood what you said !",
    category: "help",
    keywords: ["correct prompt", "understood what you said", "mate aseɛ yie"]
  },
  {
    key: "repeat",
    filename: "Repeat.mp3",
    audioUrl: "/audio/Twi_library/Repeat.mp3",
    transcript: "Repeating previous information",
    category: "help",
    keywords: ["repeat", "ka bio", "ti mu"]
  },
  {
    key: "repeat_option",
    filename: "Repeat_Option.mp3",
    audioUrl: "/audio/Twi_library/Repeat_Option.mp3",
    transcript: "I will again mention your options",
    category: "help",
    keywords: ["repeat option", "mention your options", "ti akwan"]
  },
  {
    key: "keypad_option",
    filename: "Keypad_option.mp3",
    audioUrl: "/audio/Twi_library/Keypad_option.mp3",
    transcript: "Please you can use your phone keypad",
    category: "navigation",
    keywords: ["keypad option", "phone keypad", "keypad"]
  },
  {
    key: "voice_or_keypad",
    filename: "Voice_or_keypad.mp3",
    audioUrl: "/audio/Twi_library/Voice_or_keypad.mp3",
    transcript: "You can use your use or your keypad",
    category: "navigation",
    keywords: ["voice or keypad", "voice", "keypad"]
  },
  {
    key: "yes_no",
    filename: "Yes_No.mp3",
    audioUrl: "/audio/Twi_library/Yes_No.mp3",
    transcript: "if yes say outloud yes or press 1, if no say outloud no or press 2",
    category: "confirmation",
    keywords: ["yes or no", "say yes", "say no", "press 1", "press 2"]
  },
  {
    key: "yes_no_keypad",
    filename: "Yes_no_keypad.mp3",
    audioUrl: "/audio/Twi_library/Yes_no_keypad.mp3",
    transcript: "If yes press 1 , if no press 2",
    category: "confirmation",
    keywords: ["yes no keypad", "press 1", "press 2"]
  },
  {
    key: "take_your_time",
    filename: "Take_your_time.mp3",
    audioUrl: "/audio/Twi_library/Take_your_time.mp3",
    transcript: "Please take your time to perform this task, do not be in a rush",
    category: "general",
    keywords: ["take your time", "not in a rush", "nya aboterɛ"]
  },
  {
    key: "keep_reference",
    filename: "Keep_reference.mp3",
    audioUrl: "/audio/Twi_library/Keep_reference.mp3",
    transcript: "For future occurances, please keep this reference",
    category: "general",
    keywords: ["keep reference", "reference", "kora reference"]
  },
  {
    key: "security_warning",
    filename: "Security_warning.mp3",
    audioUrl: "/audio/Twi_library/Security_warning.mp3",
    transcript: "i cannot work on this for you, because it can expose your credentials and vital informations",
    category: "auth",
    keywords: ["security warning", "credentials", "expose", "ahobammɔ"]
  },
  {
    key: "balance_unavailable",
    filename: "Balance_Unavailable.mp3",
    audioUrl: "/audio/Twi_library/Balance_Unavailable.mp3",
    transcript: "Please i cannot confirm your mobile money balance on this channels, please use the official mobile mobile channel to check your balance",
    category: "general",
    keywords: ["balance unavailable", "official channel", "balance", "sika a aka"]
  },
  {
    key: "service_unavailable",
    filename: "Service unavailable.mp3",
    audioUrl: "/audio/Twi_library/Service unavailable.mp3",
    transcript: "This service is currently unavailable",
    category: "general",
    keywords: ["service unavailable", "unavailable", "nyɛ hwee seesei"]
  },
  {
    key: "service_unavailable_alt",
    filename: "Service unavailable 1.mp3",
    audioUrl: "/audio/Twi_library/Service unavailable 1.mp3",
    transcript: "Service unavailable, please try another option",
    category: "general",
    keywords: ["service unavailable alt", "another option"]
  },
  {
    key: "service_alternative",
    filename: "Service_alternative.mp3",
    audioUrl: "/audio/Twi_library/Service_alternative.mp3",
    transcript: "this service is not available however, i can help with you with another services like sending money to someone else",
    category: "general",
    keywords: ["service alternative", "not available", "help with another service", "sending money"]
  },
  {
    key: "service_notready",
    filename: "Service_notready.mp3",
    audioUrl: "/audio/Twi_library/Service_notready.mp3",
    transcript: "this service, i can not help you with that, however i can help you with sending money to to someone or transferring money",
    category: "general",
    keywords: ["service not ready", "transferring money"]
  },
  {
    key: "try_another_service",
    filename: "Try_another_service.mp3",
    audioUrl: "/audio/Twi_library/Try_another_service.mp3",
    transcript: "Do you want to use another service ?",
    category: "general",
    keywords: ["try another service", "another service", "dwumadie foforɔ"]
  },
  {
    key: "unsupported_service",
    filename: "Unsupported_service.mp3",
    audioUrl: "/audio/Twi_library/Unsupported_service.mp3",
    transcript: "This service is not available, please choose another service !",
    category: "general",
    keywords: ["unsupported service", "choose another service"]
  },
  {
    key: "system_error",
    filename: "System_Error.mp3",
    audioUrl: "/audio/Twi_library/System_Error.mp3",
    transcript: "Sorry we could not complete this transaction due to system error , please try again again later",
    category: "general",
    keywords: ["system error", "error", "try again later", "mfomsoɔ"]
  },
  {
    key: "acknowledge",
    filename: "Acknowledge.mp3",
    audioUrl: "/audio/Twi_library/Acknowledge.mp3",
    transcript: "Okay, i understand you, please let you continue",
    category: "general",
    keywords: ["acknowledge", "understand you", "continue", "mate aseɛ"]
  }
];

export const TWI_AUDIO_KEY_LOOKUP = new Map<string, TwiLibraryItem>(
  TWI_AUDIO_LIBRARY_ITEMS.map((item) => [item.key, item])
);

export const TWI_AUDIO_FILENAME_LOOKUP = new Map<string, TwiLibraryItem>(
  TWI_AUDIO_LIBRARY_ITEMS.map((item) => [item.filename.toLowerCase(), item])
);
