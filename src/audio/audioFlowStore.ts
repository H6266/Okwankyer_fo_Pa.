/**
 * Ɔkwankyerɛfo Pa - Audio Flow Store & Custom Audio Assignment Registry
 * 
 * Provides:
 * 1. Sequential Money Transfer Audio Flow definitions (Normal IVR Flow & Conversational Voice Flow).
 * 2. Real-time persistent custom audio assignments (changes affect the entire application).
 * 3. Master volume amplification controller (100% to 250% high-gain boost with limiter).
 * 4. Catalog of authentic studio recordings in Audio_files/Twi_library/ & English_Library/.
 */

import { audioPlaybackController } from "./audioPlaybackController";

export interface FlowStepAudioConfig {
  id: string; // e.g. "step_welcome", "step_recipient"
  promptId: string; // e.g. "OP01", "OP16"
  flowType: "NORMAL" | "CONVERSATIONAL";
  sequenceOrder: number;
  titleEn: string;
  titleTwi: string;
  category: "session" | "service" | "recipient" | "amount" | "auth" | "outcome" | "recovery";
  defaultAudioEn: string;
  defaultAudioTwi: string;
  transcriptEn: string;
  transcriptTwi: string;
  keypadAction?: string;
  conversationalUtterance?: string;
  suggestedFilesTwi: string[];
}

export interface AvailableAudioFile {
  filename: string;
  url: string;
  title: string;
  language: "twi" | "en";
  transcript: string;
  category: string;
}

// ── Complete Catalog of Authentic Studio Audio Files ─────────────────────────
export const AUTHENTIC_TWI_RECORDINGS: AvailableAudioFile[] = [
  { filename: "Opening_voice_welcome_to_okwankyerefopa.mp3", url: "/audio/Twi_library/Opening_voice_welcome_to_okwankyerefopa.mp3", title: "Opening Welcome to Ɔkwankyerɛfo Pa", language: "twi", transcript: "Welcome to Ɔkwankyerɛfo Pa, an easy financial service, for English press 1, for Twi press 2", category: "session" },
  { filename: "Language_selection.mp3", url: "/audio/Twi_library/Language_selection.mp3", title: "Language Selection", language: "twi", transcript: "For English press 1, for Twi press 2", category: "session" },
  { filename: "Greetings.mp3", url: "/audio/Twi_library/Greetings.mp3", title: "Greetings & Inquiry", language: "twi", transcript: "Akwaaba, what would you like us to help you with today?", category: "session" },
  { filename: "service_description.mp3", url: "/audio/Twi_library/service_description.mp3", title: "Service Description & Accessibility", language: "twi", transcript: "Welcome to Ɔkwankyerɛfo Pa, we are an accessibility layer that makes mobile money easy for everyone with inclusivity, the elderly and disabled", category: "session" },
  { filename: "Main_menu.mp3", url: "/audio/Twi_library/Main_menu.mp3", title: "Return to Main Menu", language: "twi", transcript: "Then please, let us go back to the main menu", category: "navigation" },
  { filename: "Service_selection.mp3", url: "/audio/Twi_library/Service_selection.mp3", title: "Service Selection (MoMo / Banking)", language: "twi", transcript: "If you want Mobile Money service press 1, for banking service press 2, press 9 to repeat, or press 0 to end", category: "service" },
  { filename: "Network_selection.mp3", url: "/audio/Twi_library/Network_selection.mp3", title: "Network Provider Selection (MTN / Telecel / AT)", language: "twi", transcript: "Please select network: for MTN press 1, for Telecel press 2, for AT press 3, press 9 to repeat, or press 0 to exit", category: "service" },
  { filename: "MTN menu.mp3", url: "/audio/Twi_library/MTN menu.mp3", title: "MTN Service Menu", language: "twi", transcript: "This is MTN service: to transfer money press 1, press 8 to go back, or press 0 to exit", category: "service" },
  { filename: "Send_money_selected.mp3", url: "/audio/Twi_library/Send_money_selected.mp3", title: "Send Money Confirmed", language: "twi", transcript: "You have selected 1 to transfer money", category: "service" },
  { filename: "Enter_recipient.mp3", url: "/audio/Twi_library/Enter_recipient.mp3", title: "Enter Recipient Phone Number", language: "twi", transcript: "Please enter the recipient phone number, when you are done press # at the end, or press 0 to end", category: "recipient" },
  { filename: "Recipient_found.mp3", url: "/audio/Twi_library/Recipient_found.mp3", title: "Recipient Name Found", language: "twi", transcript: "I have found the registered name of the person you want to send money to", category: "recipient" },
  { filename: "Recipient_verify.mp3", url: "/audio/Twi_library/Recipient_verify.mp3", title: "Recipient Verification Readback", language: "twi", transcript: "Please listen to the recipient name and verify the phone number", category: "recipient" },
  { filename: "Recipient_confirm_speech.mp3", url: "/audio/Twi_library/Recipient_confirm_speech.mp3", title: "Recipient Confirm Spoken", language: "twi", transcript: "You are sending money to this person: say yes or press 1 to proceed, or say no or press 2 to change", category: "recipient" },
  { filename: "Use_recipient 1.mp3", url: "/audio/Twi_library/Use_recipient 1.mp3", title: "Use Found Recipient", language: "twi", transcript: "Okay, we will send the money to this recipient for you", category: "recipient" },
  { filename: "Invalid_recipient.mp3", url: "/audio/Twi_library/Invalid_recipient.mp3", title: "Invalid Recipient Number", language: "twi", transcript: "The phone number you gave is not correct. Please re-enter the 10-digit number and add # at the end", category: "recovery" },
  { filename: "Change recipient.mp3", url: "/audio/Twi_library/Change recipient.mp3", title: "Change Recipient", language: "twi", transcript: "Okay, please enter or say the new phone number you want to send money to", category: "recipient" },
  { filename: "Enter amount.mp3", url: "/audio/Twi_library/Enter amount.mp3", title: "Enter Amount", language: "twi", transcript: "Please enter the amount you want to send, press * to add pesewas, when you are done press #", category: "amount" },
  { filename: "Amount prompt.mp3", url: "/audio/Twi_library/Amount prompt.mp3", title: "Amount Prompt", language: "twi", transcript: "Please how much money do you want to transfer?", category: "amount" },
  { filename: "Amount readback.mp3", url: "/audio/Twi_library/Amount readback.mp3", title: "Amount Readback", language: "twi", transcript: "What I heard is that you want to send this amount", category: "amount" },
  { filename: "Amount too high 3.mp3", url: "/audio/Twi_library/Amount too high 3.mp3", title: "Amount Exceeds Limit", language: "twi", transcript: "The money you want to send exceeds your allowed transfer limit. Please enter a different amount", category: "recovery" },
  { filename: "Amount too low.mp3", url: "/audio/Twi_library/Amount too low.mp3", title: "Amount Too Low", language: "twi", transcript: "The money you want to send is below the minimum allowed amount. Please enter a higher amount", category: "recovery" },
  { filename: "Change_amount.mp3", url: "/audio/Twi_library/Change_amount.mp3", title: "Change Amount", language: "twi", transcript: "Yes please, then enter or say a different amount", category: "amount" },
  { filename: "Repeat amount.mp3", url: "/audio/Twi_library/Repeat amount.mp3", title: "Repeat Amount", language: "twi", transcript: "Please mention or enter the amount again", category: "amount" },
  { filename: "Review transaction.mp3", url: "/audio/Twi_library/Review transaction.mp3", title: "Review Transaction Details", language: "twi", transcript: "Please review your transaction details before we continue", category: "amount" },
  { filename: "Confirm_continue.mp3", url: "/audio/Twi_library/Confirm_continue.mp3", title: "Confirm Continue (Keypad)", language: "twi", transcript: "If you agree to continue press 1, if you do not agree press 2, to exit press 0", category: "confirmation" },
  { filename: "Confirm speech.mp3", url: "/audio/Twi_library/Confirm speech.mp3", title: "Confirm Spoken Yes/No", language: "twi", transcript: "If you agree with this transaction, press 1 or say out loud yes", category: "confirmation" },
  { filename: "Confirm_understanding.mp3", url: "/audio/Twi_library/Confirm_understanding.mp3", title: "Confirm Understanding", language: "twi", transcript: "I heard you want to send money, is that correct?", category: "confirmation" },
  { filename: "Reject speech.mp3", url: "/audio/Twi_library/Reject speech.mp3", title: "Reject / Change Spoken", language: "twi", transcript: "If you want to change this transaction say no or press 2", category: "confirmation" },
  { filename: "Ready submit.mp3", url: "/audio/Twi_library/Ready submit.mp3", title: "Ready to Submit", language: "twi", transcript: "Your transaction is ready to be submitted, do you want to proceed?", category: "confirmation" },
  { filename: "Authorize_phone.mp3", url: "/audio/Twi_library/Authorize_phone.mp3", title: "Authorize on Phone (Zero-PIN Handoff)", language: "twi", transcript: "Please authorize the transaction on your phone when the prompt appears. Do not mention your PIN over the call!", category: "auth" },
  { filename: "Security_warning.mp3", url: "/audio/Twi_library/Security_warning.mp3", title: "Zero-PIN Security Warning", language: "twi", transcript: "I cannot take your PIN over voice call because it would expose your credentials. Enter it privately on your phone keypad!", category: "auth" },
  { filename: "Pin Block.mp3", url: "/audio/Twi_library/Pin Block.mp3", title: "Spoken PIN Block Safeguard", language: "twi", transcript: "Please I cannot work with any PIN entered or spoken over voice! Protect your PIN.", category: "auth" },
  { filename: "Processing.mp3", url: "/audio/Twi_library/Processing.mp3", title: "Processing Transaction", language: "twi", transcript: "Please wait while we check your authorization process with the network", category: "outcome" },
  { filename: "Waiting_confirmation.mp3", url: "/audio/Twi_library/Waiting_confirmation.mp3", title: "Waiting for MoMo Confirmation", language: "twi", transcript: "We are waiting for confirmation from the Mobile Money service", category: "outcome" },
  { filename: "Auth_received.mp3", url: "/audio/Twi_library/Auth_received.mp3", title: "Authorization Received", language: "twi", transcript: "We have received your authorization to proceed", category: "outcome" },
  { filename: "Submitted.mp3", url: "/audio/Twi_library/Submitted.mp3", title: "Transaction Submitted", language: "twi", transcript: "Please I have submitted your transfer request to the network", category: "outcome" },
  { filename: "Success_sent.mp3", url: "/audio/Twi_library/Success_sent.mp3", title: "Money Sent Successfully", language: "twi", transcript: "We have transferred the money successfully!", category: "outcome" },
  { filename: "Success_close.mp3", url: "/audio/Twi_library/Success_close.mp3", title: "Success & Closing", language: "twi", transcript: "We have successfully completed your transaction. Thank you for using Ɔkwankyerɛfo Pa", category: "outcome" },
  { filename: "Keep_reference.mp3", url: "/audio/Twi_library/Keep_reference.mp3", title: "Keep Transaction Reference", language: "twi", transcript: "For future reference, please keep this transaction reference number", category: "outcome" },
  { filename: "Check phone.mp3", url: "/audio/Twi_library/Check phone.mp3", title: "Check Phone Screen", language: "twi", transcript: "Please check your phone screen to confirm the approval prompt", category: "auth" },
  { filename: "Check_messages.mp3", url: "/audio/Twi_library/Check_messages.mp3", title: "Check SMS Messages", language: "twi", transcript: "Please check your SMS messages for the transfer receipt from your network", category: "outcome" },
  { filename: "Finish.mp3", url: "/audio/Twi_library/Finish.mp3", title: "Finish Session", language: "twi", transcript: "Okay, your request is now complete. Thank you for using Ɔkwankyerɛfo Pa", category: "session" },
  { filename: "Acknowledge.mp3", url: "/audio/Twi_library/Acknowledge.mp3", title: "Acknowledge & Continue", language: "twi", transcript: "Okay, I understand you. Let us continue", category: "navigation" },
  { filename: "Continue.mp3", url: "/audio/Twi_library/Continue.mp3", title: "Continue Prompt", language: "twi", transcript: "Please do you want to continue?", category: "navigation" },
  { filename: "Back.mp3", url: "/audio/Twi_library/Back.mp3", title: "Go Back One Step", language: "twi", transcript: "Okay, let us move one step backwards", category: "navigation" },
  { filename: "Repeat.mp3", url: "/audio/Twi_library/Repeat.mp3", title: "Repeat Prompt", language: "twi", transcript: "I will repeat this prompt for you", category: "navigation" },
  { filename: "Repeat_Option.mp3", url: "/audio/Twi_library/Repeat_Option.mp3", title: "Repeat Available Options", language: "twi", transcript: "I will mention your options again", category: "navigation" },
  { filename: "Take_your_time.mp3", url: "/audio/Twi_library/Take_your_time.mp3", title: "Patience / Take Your Time", language: "twi", transcript: "Please take your time to perform this task, do not be in a rush", category: "recovery" },
  { filename: "Please_respond.mp3", url: "/audio/Twi_library/Please_respond.mp3", title: "Please Respond (Silence Watchdog)", language: "twi", transcript: "I did not get any response from you. Please provide a response or enter an option", category: "recovery" },
  { filename: "Did_not_get.mp3", url: "/audio/Twi_library/Did_not_get.mp3", title: "Did Not Get Response", language: "twi", transcript: "Please I did not get what you said. Please mention or enter it again", category: "recovery" },
  { filename: "Not understood.mp3", url: "/audio/Twi_library/Not understood.mp3", title: "Not Understood", language: "twi", transcript: "Please I did not understand what was said. Please say it again", category: "recovery" },
  { filename: "Input_not_recognized.mp3", url: "/audio/Twi_library/Input_not_recognized.mp3", title: "Input Not Recognized", language: "twi", transcript: "I cannot work with this response. Please come again", category: "recovery" },
  { filename: "Cancel.mp3", url: "/audio/Twi_library/Cancel.mp3", title: "Transaction Cancelled", language: "twi", transcript: "Your transaction has been cancelled. No money was transferred", category: "recovery" },
  { filename: "Customer_Declined.mp3", url: "/audio/Twi_library/Customer_Declined.mp3", title: "Customer Declined Authorization", language: "twi", transcript: "You did not give the authorization, so we cannot transfer your money", category: "recovery" },
  { filename: "Timeout.mp3", url: "/audio/Twi_library/Timeout.mp3", title: "Session Timeout", language: "twi", transcript: "We could not get your confirmation in time. Please check your messages before trying again", category: "recovery" },
  { filename: "Session timeout.mp3", url: "/audio/Twi_library/Session timeout.mp3", title: "Call Timeout Notice", language: "twi", transcript: "Your session has timed out due to inactivity", category: "recovery" },
  { filename: "Exit.mp3", url: "/audio/Twi_library/Exit.mp3", title: "Exit Call", language: "twi", transcript: "Thank you for using Ɔkwankyerɛfo Pa. Goodbye!", category: "session" },
];

export const AUTHENTIC_EN_RECORDINGS: AvailableAudioFile[] = [
  { filename: "welcome_en.mp3", url: "/audio/welcome_en.mp3", title: "English Welcome & Guide", language: "en", transcript: "Welcome to Ɔkwankyerɛfo Pa, your accessible voice guide for Mobile Money and digital services.", category: "session" },
  { filename: "2.m4a", url: "/audio/English_Library/2.m4a", title: "English Take 2 Prompt", language: "en", transcript: "Please follow the voice instructions to complete your transfer.", category: "session" },
  { filename: "3.m4a", url: "/audio/English_Library/3.m4a", title: "English Take 3 Prompt", language: "en", transcript: "Mobile Money transfer service menu.", category: "service" },
  { filename: "4.m4a", url: "/audio/English_Library/4.m4a", title: "English Take 4 Prompt", language: "en", transcript: "Authorize transfer on your mobile device.", category: "auth" },
];

// ── The Canonical 12 Steps in Transferring Money (Simulator Order) ────────────
export const MONEY_TRANSFER_FLOW_STEPS: FlowStepAudioConfig[] = [
  // ── NORMAL FLOW (IVR / Step-by-Step Prompt Flow) ──────────────────────────
  {
    id: "normal_step_1_welcome",
    promptId: "OP01",
    flowType: "NORMAL",
    sequenceOrder: 1,
    titleEn: "Step 1: Welcome Greeting & Language Choice",
    titleTwi: "Gyinapɛn 1: Akwaaba Nkaebɔ ne Kasa Paw",
    category: "session",
    defaultAudioEn: "/audio/welcome_en.mp3",
    defaultAudioTwi: "/audio/Twi_library/Opening_voice_welcome_to_okwankyerefopa.mp3",
    transcriptEn: "Welcome to Ɔkwankyerɛfo Pa. For English press 1. For Akan Twi press 2.",
    transcriptTwi: "Akwaaba kɔ Ɔkwankyerɛfo Pa. Sɛ wopɛ Borɔfo a mia 1, sɛ wopɛ Twi a mia 2.",
    keypadAction: "Press 1 (English) or 2 (Twi)",
    suggestedFilesTwi: ["Opening_voice_welcome_to_okwankyerefopa.mp3", "Language_selection.mp3", "Greetings.mp3", "service_description.mp3"],
  },
  {
    id: "normal_step_2_service",
    promptId: "OP07",
    flowType: "NORMAL",
    sequenceOrder: 2,
    titleEn: "Step 2: Service Selection (Mobile Money vs Banking)",
    titleTwi: "Gyinapɛn 2: Dwumadie Paw (MoMo anaa Sikakorabea)",
    category: "service",
    defaultAudioEn: "/api/audio/prompt-tts/en/service_selection",
    defaultAudioTwi: "/audio/Twi_library/Service_selection.mp3",
    transcriptEn: "For Mobile Money transfer, press 1. For Banking services, press 2. Press 9 to repeat, or 0 to exit.",
    transcriptTwi: "Sɛ wopɛ Mobile Money transfer a mia 1, sikakorabea mia 2. Mia 9 na tie bio, anaasɛ mia 0 na woapue.",
    keypadAction: "Press 1 (Mobile Money)",
    suggestedFilesTwi: ["Service_selection.mp3", "Service_alternative.mp3", "Choose instead.mp3"],
  },
  {
    id: "normal_step_3_network",
    promptId: "OP08",
    flowType: "NORMAL",
    sequenceOrder: 3,
    titleEn: "Step 3: Network Provider Selection",
    titleTwi: "Gyinapɛn 3: Network Paw (MTN / Telecel / AT)",
    category: "service",
    defaultAudioEn: "/api/audio/prompt-tts/en/network_selection",
    defaultAudioTwi: "/audio/Twi_library/Network_selection.mp3",
    transcriptEn: "For MTN Mobile Money press 1. For Telecel Cash press 2. For AT Money press 3. Press 9 to repeat, or 0 to exit.",
    transcriptTwi: "Sɛ wo network yɛ MTN a mia 1, Telecel Cash mia 2, AT Money mia 3. Mia 9 na tie bio, anaa 0 na pue.",
    keypadAction: "Press 1 (MTN) or 2 (Telecel)",
    suggestedFilesTwi: ["Network_selection.mp3", "MTN menu.mp3", "Choose instead.mp3"],
  },
  {
    id: "normal_step_4_action",
    promptId: "OP09",
    flowType: "NORMAL",
    sequenceOrder: 4,
    titleEn: "Step 4: Action Selection (Transfer Money)",
    titleTwi: "Gyinapɛn 4: Sika Mane Paw",
    category: "service",
    defaultAudioEn: "/api/audio/prompt-tts/en/mtn_menu",
    defaultAudioTwi: "/audio/Twi_library/MTN menu.mp3",
    transcriptEn: "To send money press 1. To go back press 8. Press 9 to repeat, or 0 to exit.",
    transcriptTwi: "Sɛ wopɛ sɛ womane sika a mia 1. Mia 8 na san kɔ akyi, 9 na tie bio, anaa 0 na pue.",
    keypadAction: "Press 1 (Send Money)",
    suggestedFilesTwi: ["MTN menu.mp3", "Send_money_selected.mp3", "Continue.mp3"],
  },
  {
    id: "normal_step_5_recipient",
    promptId: "OP16",
    flowType: "NORMAL",
    sequenceOrder: 5,
    titleEn: "Step 5: Enter Recipient Phone Number",
    titleTwi: "Gyinapɛn 5: Bɔ Nɔmba a Womane no Sika no",
    category: "recipient",
    defaultAudioEn: "/api/audio/prompt-tts/en/enter_recipient",
    defaultAudioTwi: "/audio/Twi_library/Enter_recipient.mp3",
    transcriptEn: "Please enter the recipient ten-digit phone number. When finished, press hash (#). Or press 0 to exit.",
    transcriptTwi: "Mepawokyɛw bɔ obi a woremane no sika no fon nɔmba edu no. Wowie a mia hash (#), anaa mia 0.",
    keypadAction: "Enter 10 Digits + #",
    suggestedFilesTwi: ["Enter_recipient.mp3", "Enter amount.mp3", "Keypad_option.mp3"],
  },
  {
    id: "normal_step_6_kyc",
    promptId: "OP19",
    flowType: "NORMAL",
    sequenceOrder: 6,
    titleEn: "Step 6: Smart KYC Name Verification & Readback",
    titleTwi: "Gyinapɛn 6: Din ne Nɔmba Nkaebɔ (KYC)",
    category: "recipient",
    defaultAudioEn: "/api/audio/prompt-tts/en/recipient_verify",
    defaultAudioTwi: "/audio/Twi_library/Recipient_verify.mp3",
    transcriptEn: "Recipient name found. Please verify the recipient name and phone digits. Press 1 to confirm, or 2 to change.",
    transcriptTwi: "Yɛahu obi a woremane no sika no din. Tie din ne fon nɔmba no yiye. Sɛ ɛyɛ pɛ a mia 1, anaa mia 2 na sesa.",
    keypadAction: "Press 1 (Confirm) or 2 (Change)",
    suggestedFilesTwi: ["Recipient_verify.mp3", "Recipient_found.mp3", "Use_recipient 1.mp3", "Change recipient.mp3"],
  },
  {
    id: "normal_step_7_amount",
    promptId: "OP26",
    flowType: "NORMAL",
    sequenceOrder: 7,
    titleEn: "Step 7: Enter Transfer Amount (Cedis & Pesewas)",
    titleTwi: "Gyinapɛn 7: Bɔ Sika Dodoɔ a Wopɛ sɛ Womane",
    category: "amount",
    defaultAudioEn: "/api/audio/prompt-tts/en/enter_amount",
    defaultAudioTwi: "/audio/Twi_library/Enter amount.mp3",
    transcriptEn: "Please enter the amount to transfer. Press star (*) for pesewas, and press hash (#) when done.",
    transcriptTwi: "Mepawokyɛw bɔ sika a wopɛ sɛ womane no. Mia star (*) ma pesewas, na mia hash (#) bere a wowie.",
    keypadAction: "Enter Cedis + #",
    suggestedFilesTwi: ["Enter amount.mp3", "Amount prompt.mp3", "Change_amount.mp3"],
  },
  {
    id: "normal_step_8_confirm",
    promptId: "OP36",
    flowType: "NORMAL",
    sequenceOrder: 8,
    titleEn: "Step 8: Review & Confirm Transaction",
    titleTwi: "Gyinapɛn 8: Sika Nhwehwɛmu ne Nsiemupɛ",
    category: "confirmation",
    defaultAudioEn: "/api/audio/prompt-tts/en/confirm_continue",
    defaultAudioTwi: "/audio/Twi_library/Confirm_continue.mp3",
    transcriptEn: "You are sending the specified amount. To continue and authorize, press 1. To change, press 2. To exit, press 0.",
    transcriptTwi: "Woremane sika yi. Sɛ wopene so a mia 1, sɛ wopɛ sɛ wosese a mia 2, anaa mia 0 na woapue.",
    keypadAction: "Press 1 (Proceed to Handoff)",
    suggestedFilesTwi: ["Confirm_continue.mp3", "Amount readback.mp3", "Review transaction.mp3", "Ready submit.mp3"],
  },
  {
    id: "normal_step_9_zero_pin",
    promptId: "OP40",
    flowType: "NORMAL",
    sequenceOrder: 9,
    titleEn: "Step 9: Zero-PIN Security Handset Handoff",
    titleTwi: "Gyinapɛn 9: Fon So Banbɔ (PIN Handoff - Zero-PIN)",
    category: "auth",
    defaultAudioEn: "/audio/welcome_en.mp3",
    defaultAudioTwi: "/audio/Twi_library/Authorize_phone.mp3",
    transcriptEn: "Please authorize the transfer privately on your phone keypad. Never speak or enter your PIN over voice!",
    transcriptTwi: "Mepawokyɛw yɛ transaction authorization wɔ wo fon no ankasa so. Mma nka wo PIN wɔ nne yi mu da!",
    keypadAction: "Authorize Privately on Phone Prompt",
    suggestedFilesTwi: ["Authorize_phone.mp3", "Security_warning.mp3", "Check phone.mp3", "Pin Block.mp3"],
  },
  {
    id: "normal_step_10_processing",
    promptId: "OP06",
    flowType: "NORMAL",
    sequenceOrder: 10,
    titleEn: "Step 10: Processing & Telephony Submission",
    titleTwi: "Gyinapɛn 10: Yɛrehwɛ Sika No Akyi Dwumadie",
    category: "outcome",
    defaultAudioEn: "/api/audio/prompt-tts/en/processing",
    defaultAudioTwi: "/audio/Twi_library/Processing.mp3",
    transcriptEn: "Your transaction has been submitted. Please wait while we verify authorization with the network.",
    transcriptTwi: "Yɛasoma wo sika mane no. Twɛn kakra berɛ a yɛregye nsiemupɛ afiri network hɔ.",
    keypadAction: "Wait for Network Push Response",
    suggestedFilesTwi: ["Processing.mp3", "Submitted.mp3", "Waiting_confirmation.mp3", "Auth_received.mp3"],
  },
  {
    id: "normal_step_11_success",
    promptId: "OP52",
    flowType: "NORMAL",
    sequenceOrder: 11,
    titleEn: "Step 11: Transfer Complete & Reference Readback",
    titleTwi: "Gyinapɛn 11: Nkunimdie Nkaebɔ ne Reference Nɔmba",
    category: "outcome",
    defaultAudioEn: "/api/audio/prompt-tts/en/OP52",
    defaultAudioTwi: "/audio/Twi_library/Success_sent.mp3",
    transcriptEn: "Transfer complete! The money has been transferred successfully. Please keep your transaction reference.",
    transcriptTwi: "Sika mane no wiee pɛpɛɛpɛ! Yɛamane sika no kɔma no. Kora wo transaction reference nɔmba yi yiye.",
    keypadAction: "Call Completes Cleanly",
    suggestedFilesTwi: ["Success_sent.mp3", "Success_close.mp3", "Keep_reference.mp3", "Check_messages.mp3", "Finish.mp3"],
  },
  {
    id: "normal_step_12_recovery",
    promptId: "OP17",
    flowType: "NORMAL",
    sequenceOrder: 12,
    titleEn: "Step 12: Recovery, Invalid Input & Timeout Safeguards",
    titleTwi: "Gyinapɛn 12: Nfomsoɔ Nsiesie ne Berɛ Atwa Mu",
    category: "recovery",
    defaultAudioEn: "/api/audio/prompt-tts/en/invalid_recipient",
    defaultAudioTwi: "/audio/Twi_library/Invalid_recipient.mp3",
    transcriptEn: "The number or input entered was not recognized. Please follow the instructions to re-enter or exit.",
    transcriptTwi: "Nɔmba anaasɛ nneyɛe a wode mae no nyɛ pɛ. Mepawokyɛw tie akwankyerɛ no na bɔ bio.",
    keypadAction: "Auto-reprompt or press 0 to exit",
    suggestedFilesTwi: ["Invalid_recipient.mp3", "Please_respond.mp3", "Did_not_get.mp3", "Timeout.mp3", "Failure_Retry.mp3"],
  },

  // ── CONVERSATIONAL FLOW (Natural Spoken Dialogue Flow) ───────────────────
  {
    id: "conv_step_1_greeting",
    promptId: "OP03",
    flowType: "CONVERSATIONAL",
    sequenceOrder: 1,
    titleEn: "Turn 1: Natural Ghanaian Spoken Greeting",
    titleTwi: "Nkitahodie 1: Nnipa Akwaaba Kasa",
    category: "session",
    defaultAudioEn: "/audio/welcome_en.mp3",
    defaultAudioTwi: "/audio/Twi_library/Greetings.mp3",
    transcriptEn: "Welcome! What service would you like us to help you with today?",
    transcriptTwi: "Akwaaba! Dɛn na wopɛ sɛ yɛmfa mmoa wo nnɛ?",
    conversationalUtterance: "Caller says: 'Mepɛ sɛ memane sika kɔma Kwame' (I want to send money to Kwame)",
    suggestedFilesTwi: ["Greetings.mp3", "Welcome back.mp3", "service_description.mp3"],
  },
  {
    id: "conv_step_2_intent_confirm",
    promptId: "OP70",
    flowType: "CONVERSATIONAL",
    sequenceOrder: 2,
    titleEn: "Turn 2: Spoken Intent & Slot Understanding",
    titleTwi: "Nkitahodie 2: Adwen ne Nteaseɛ Nsiemupɛ",
    category: "service",
    defaultAudioEn: "/api/audio/prompt-tts/en/OP70",
    defaultAudioTwi: "/audio/Twi_library/Confirm_understanding.mp3",
    transcriptEn: "I heard you want to send money. Is that correct?",
    transcriptTwi: "Mate sɛ wopɛ sɛ womane sika, ɛyɛ nokware anaa?",
    conversationalUtterance: "Caller says: 'Aane, ɛyɛ nokware' (Yes, that is correct)",
    suggestedFilesTwi: ["Confirm_understanding.mp3", "Acknowledge.mp3", "Send_money_selected.mp3", "Correct_prompt.mp3"],
  },
  {
    id: "conv_step_3_recipient_inquiry",
    promptId: "OP23",
    flowType: "CONVERSATIONAL",
    sequenceOrder: 3,
    titleEn: "Turn 3: Natural Recipient Inquiry & KYC Readback",
    titleTwi: "Nkitahodie 3: Obi a Woremane no Sika no Bisabisa",
    category: "recipient",
    defaultAudioEn: "/api/audio/prompt-tts/en/recipient_confirm_speech",
    defaultAudioTwi: "/audio/Twi_library/Recipient_confirm_speech.mp3",
    transcriptEn: "You are sending money to this person. Say yes to proceed, or say no to change.",
    transcriptTwi: "Woremane sika kɔma onipa yi. Ka yes na kɔ anim, anaa ka no na sesa.",
    conversationalUtterance: "Caller speaks: 'Yes, proceed' or '055 383 8464'",
    suggestedFilesTwi: ["Recipient_confirm_speech.mp3", "Recipient_found.mp3", "Use_recipient 1.mp3"],
  },
  {
    id: "conv_step_4_amount_inquiry",
    promptId: "OP28",
    flowType: "CONVERSATIONAL",
    sequenceOrder: 4,
    titleEn: "Turn 4: Spoken Amount Inquiry & Verification",
    titleTwi: "Nkitahodie 4: Sika Dodoɔ Bisabisa ne Nteaseɛ",
    category: "amount",
    defaultAudioEn: "/api/audio/prompt-tts/en/amount_prompt",
    defaultAudioTwi: "/audio/Twi_library/Amount prompt.mp3",
    transcriptEn: "Please how much money do you want to transfer to them?",
    transcriptTwi: "Mepawokyɛw sika dodoɔ sɛn na wopɛ sɛ womane no?",
    conversationalUtterance: "Caller speaks: 'Aduonum Cedis' (Fifty Cedis / GHS 50)",
    suggestedFilesTwi: ["Amount prompt.mp3", "Amount readback.mp3", "Repeat amount.mp3"],
  },
  {
    id: "conv_step_5_spoken_confirmation",
    promptId: "OP37",
    flowType: "CONVERSATIONAL",
    sequenceOrder: 5,
    titleEn: "Turn 5: Spoken Safe Confirmation (Yes / No)",
    titleTwi: "Nkitahodie 5: Nne Aane / Dabi Nsiemupɛ",
    category: "confirmation",
    defaultAudioEn: "/api/audio/prompt-tts/en/confirm_speech",
    defaultAudioTwi: "/audio/Twi_library/Confirm speech.mp3",
    transcriptEn: "If you agree with this transaction, say yes out loud, or press 1.",
    transcriptTwi: "Sɛ wopene transaction yi so a, ka aane kɛseɛ, anaa mia 1.",
    conversationalUtterance: "Caller speaks: 'Aane' (Yes) or presses 1",
    suggestedFilesTwi: ["Confirm speech.mp3", "Confirm_continue.mp3", "Yes_No.mp3", "Yes_no_keypad.mp3"],
  },
  {
    id: "conv_step_6_zero_pin_warning",
    promptId: "OP41",
    flowType: "CONVERSATIONAL",
    sequenceOrder: 6,
    titleEn: "Turn 6: Zero-PIN Security Voice Handoff Warning",
    titleTwi: "Gyinapɛn 6: Banbɔ Nkaebɔ (Mma nka PIN wɔ fon mu)",
    category: "auth",
    defaultAudioEn: "/audio/welcome_en.mp3",
    defaultAudioTwi: "/audio/Twi_library/Security_warning.mp3",
    transcriptEn: "I cannot take your PIN over this call because that would compromise your credentials. Enter it privately on your phone screen!",
    transcriptTwi: "Merentumi nnye wo PIN wɔ fon yi mu, ɛfiri sɛ ɛbɛtumi de wo ho nsɛm bɔne aba. Bɔ no kokoam wɔ wo fon so!",
    conversationalUtterance: "Central Brain interrupts any spoken 4-digit blurt to guard the customer's wallet",
    suggestedFilesTwi: ["Security_warning.mp3", "Authorize_phone.mp3", "Pin Block.mp3"],
  },
  {
    id: "conv_step_7_outcome_gratitude",
    promptId: "OP53",
    flowType: "CONVERSATIONAL",
    sequenceOrder: 7,
    titleEn: "Turn 7: Natural Transfer Success & Post-Service Inquiry",
    titleTwi: "Nkitahodie 7: Nkunimdie ne Aseda",
    category: "outcome",
    defaultAudioEn: "/api/audio/prompt-tts/en/OP52",
    defaultAudioTwi: "/audio/Twi_library/Success_close.mp3",
    transcriptEn: "We have successfully completed your transfer. Thank you for using Ɔkwankyerɛfo Pa. Would you like anything else?",
    transcriptTwi: "Yɛawie wo transaction no pɛpɛɛpɛ. Medaase sɛ wode Ɔkwankyerɛfo Pa yɛɛ adwuma. Wopɛ biribi foforɔ?",
    conversationalUtterance: "Caller says: 'Dabi, medaase' (No, thank you)",
    suggestedFilesTwi: ["Success_close.mp3", "Success_sent.mp3", "Keep_reference.mp3", "Post_success_Help.mp3", "Anything_else.mp3"],
  },
  {
    id: "conv_step_8_clarification",
    promptId: "OP67",
    flowType: "CONVERSATIONAL",
    sequenceOrder: 8,
    titleEn: "Turn 8: Conversational Clarification & Patience",
    titleTwi: "Nkitahodie 8: Nteaseɛ Pa ne Boasetɔ",
    category: "recovery",
    defaultAudioEn: "/api/audio/prompt-tts/en/did_not_get",
    defaultAudioTwi: "/audio/Twi_library/Take_your_time.mp3",
    transcriptEn: "Please take your time, do not be in a rush. Whenever you are ready, mention it again.",
    transcriptTwi: "Mepawokyɛw fa wo berɛ, mma nsi so mbɔ mmirika. Berɛ biara a woasiesie wo ho no, ka bio.",
    conversationalUtterance: "Elderly or rural caller speaking at relaxed pace",
    suggestedFilesTwi: ["Take_your_time.mp3", "Did_not_get.mp3", "Not understood.mp3", "Please_respond.mp3"],
  },
];

// ── Persistent Storage Key ────────────────────────────────────────────────────
const STORAGE_KEY_OVERRIDES = "okwankyer_audio_flow_overrides_v2";
const STORAGE_KEY_VOLUME = "okwankyer_master_volume_v2";

export interface AudioFlowOverrides {
  [stepId: string]: {
    customAudioTwi?: string;
    customAudioEn?: string;
    customVolume?: number;
    notes?: string;
    updatedAt: number;
  };
}

class AudioFlowStore {
  private overrides: AudioFlowOverrides = {};
  private masterVolume: number = 2.0; // 200% high-gain amplification
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_OVERRIDES);
      if (raw) {
        this.overrides = JSON.parse(raw);
      }
      const rawVol = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (rawVol) {
        const parsed = parseFloat(rawVol);
        if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 3.0) {
          this.masterVolume = parsed;
          audioPlaybackController.setVolumeMultiplier(parsed);
        }
      } else {
        // Initialize high-gain volume
        audioPlaybackController.setVolumeMultiplier(this.masterVolume);
      }
    } catch (e) {
      console.warn("[AudioFlowStore] Storage load notice:", e);
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(this.overrides));
      localStorage.setItem(STORAGE_KEY_VOLUME, this.masterVolume.toString());
    } catch (e) {
      console.warn("[AudioFlowStore] Storage save notice:", e);
    }
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }

  public getOverrides(): AudioFlowOverrides {
    return { ...this.overrides };
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setMasterVolume(multiplier: number): void {
    const clamped = Math.max(0.5, Math.min(3.0, multiplier));
    this.masterVolume = clamped;
    audioPlaybackController.setVolumeMultiplier(clamped);
    this.saveToStorage();
  }

  public assignAudioForStep(
    stepId: string,
    language: "twi" | "en",
    audioUrl: string
  ): void {
    if (!this.overrides[stepId]) {
      this.overrides[stepId] = { updatedAt: Date.now() };
    }
    if (language === "twi") {
      this.overrides[stepId].customAudioTwi = audioUrl;
    } else {
      this.overrides[stepId].customAudioEn = audioUrl;
    }
    this.overrides[stepId].updatedAt = Date.now();
    this.saveToStorage();
  }

  public resetStepToDefault(stepId: string): void {
    if (this.overrides[stepId]) {
      delete this.overrides[stepId];
      this.saveToStorage();
    }
  }

  public resetAllToDefaults(): void {
    this.overrides = {};
    this.masterVolume = 2.0;
    audioPlaybackController.setVolumeMultiplier(2.0);
    this.saveToStorage();
  }

  /**
   * Resolves the active audio URL for a given step, checking user overrides first.
   */
  public resolveStepAudio(stepConfig: FlowStepAudioConfig, language: "twi" | "en"): string {
    const override = this.overrides[stepConfig.id];
    if (language === "twi" && override?.customAudioTwi) {
      return override.customAudioTwi;
    }
    if (language === "en" && override?.customAudioEn) {
      return override.customAudioEn;
    }
    return language === "twi" ? stepConfig.defaultAudioTwi : stepConfig.defaultAudioEn;
  }

  /**
   * Resolves prompt key to custom audio URL if overridden by user.
   */
  public resolvePromptOverride(promptKeyOrId: string, language: "twi" | "en"): string | null {
    const norm = promptKeyOrId.toLowerCase().replace(/[-_]/g, "");
    for (const step of MONEY_TRANSFER_FLOW_STEPS) {
      const stepNorm = step.id.toLowerCase().replace(/[-_]/g, "");
      const promptNorm = step.promptId.toLowerCase().replace(/[-_]/g, "");
      if (stepNorm.includes(norm) || promptNorm === norm) {
        const override = this.overrides[step.id];
        if (language === "twi" && override?.customAudioTwi) return override.customAudioTwi;
        if (language === "en" && override?.customAudioEn) return override.customAudioEn;
      }
    }
    return null;
  }
}

export const audioFlowStore = new AudioFlowStore();
