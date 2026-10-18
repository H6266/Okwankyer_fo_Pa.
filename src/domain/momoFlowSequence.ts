/**
 * Ɔkwankyerɛfo Pa - 9-Step USSD/MoMo Money Transfer Flow Sequence
 *
 * Defines the authoritative 9-step financial transfer state machine:
 * 1. Initiate Session (*170# / App open)
 * 2. Choose Service Category (Main Menu: 1=Transfer Money, 2=Pay Bill, 3=Airtime/Bundles)
 * 3. Select Sub-Service (1=MoMo User, 2=Non-MoMo User, 3=Other Networks)
 * 4. Enter Destination Details (Recipient Phone Number / Till)
 * 5. Enter Amount (Amount in Cedis)
 * 6. Provide Reference (Optional note: e.g. "Food", "Rent")
 * 7. Review Summary (Name, Amount, Network Fee verification)
 * 8. Enter PIN (Authentication - strictly private, zero-readback)
 * 9. Receive Confirmation (Success notice, SMS receipt, TX ID, updated balance)
 */

export interface MomoFlowStep {
  stepNumber: number;
  id: string;
  name: string;
  description: string;
  defaultAudioFilename: string;
  defaultAudioUrl: string;
  twiSpokenText: string;
  englishSpokenText: string;
  keypadPrompt?: string;
  expectedInputType: "dtmf" | "phone" | "amount" | "text" | "pin" | "confirmation";
  nextStepId?: string;
  isAuthentication?: boolean;
}

export const MOMO_9_STEP_SEQUENCE: MomoFlowStep[] = [
  {
    stepNumber: 1,
    id: "INITIATE_SESSION",
    name: "1. Initiate Session",
    description: "Dial USSD shortcode (*170#) or launch app to open the voice accessibility layer.",
    defaultAudioFilename: "Opening_voice_welcome_to_okwankyerefopa.mp3",
    defaultAudioUrl: "/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3",
    twiSpokenText: "welcome to okwankyereforpa, an easy financial service, for English press 1 for twi press 2",
    englishSpokenText: "Welcome to Okwankyerɛfo Pa, an easy financial service. For English press 1, for Twi press 2.",
    keypadPrompt: "1: English, 2: Twi",
    expectedInputType: "dtmf",
    nextStepId: "CHOOSE_SERVICE_CATEGORY",
  },
  {
    stepNumber: 2,
    id: "CHOOSE_SERVICE_CATEGORY",
    name: "2. Choose Service Category",
    description: "Main Menu: 1 for Transfer Money, 2 for Pay Bill, 3 for Airtime/Bundles.",
    defaultAudioFilename: "Service_selection.mp3",
    defaultAudioUrl: "/audio/Twi/Service_selection.mp3",
    twiSpokenText: "if you want mobile money service, press 1, for banking service press 2, press 9 for repeat, or press 0 to end the service",
    englishSpokenText: "For Transfer Money, press 1. For Pay Bill, press 2. For Airtime and Bundles, press 3.",
    keypadPrompt: "1: Transfer Money, 2: Pay Bill, 3: Airtime",
    expectedInputType: "dtmf",
    nextStepId: "SELECT_SUBSERVICE",
  },
  {
    stepNumber: 3,
    id: "SELECT_SUBSERVICE",
    name: "3. Select Sub-Service",
    description: "Destination type: 1 for MoMo User, 2 for Non-MoMo User, 3 for Other Networks.",
    defaultAudioFilename: "Network_selection.mp3",
    defaultAudioUrl: "/audio/Twi/Network_selection.mp3",
    twiSpokenText: "please, select network, for mtn press 1, for telecel press 2, for airteltigo press 3, press 9 so i repeat this again, to end the session press 0",
    englishSpokenText: "Select destination: 1 for MoMo user, 2 for Non-MoMo user, 3 for Other Networks.",
    keypadPrompt: "1: MTN, 2: Telecel, 3: AirtelTigo",
    expectedInputType: "dtmf",
    nextStepId: "ENTER_DESTINATION_DETAILS",
  },
  {
    stepNumber: 4,
    id: "ENTER_DESTINATION_DETAILS",
    name: "4. Enter Destination Details",
    description: "Input recipient mobile phone number, merchant Till, or utility account number.",
    defaultAudioFilename: "Enter_recipient.mp3",
    defaultAudioUrl: "/audio/Twi/Enter_recipient.mp3",
    twiSpokenText: "please enter the recipient number , when you are done press # at the end, or press 0 to end the conversation here",
    englishSpokenText: "Enter the recipient 10-digit mobile number, then press #.",
    keypadPrompt: "Enter 10-digit phone number + #",
    expectedInputType: "phone",
    nextStepId: "VERIFY_RECIPIENT",
  },
  {
    stepNumber: 5,
    id: "VERIFY_RECIPIENT",
    name: "5. Verify Recipient",
    description: "Smart KYC lookup to read back and verify the recipient's registered mobile money name.",
    defaultAudioFilename: "Recipient_verify.mp3",
    defaultAudioUrl: "/audio/Twi/Recipient_verify.mp3",
    twiSpokenText: "Tie din ne fon nɔmba no yie. Sɛ ɛyɛ pɛ a mia 1, anaa mia 2 na sesa.",
    englishSpokenText: "Please verify the recipient name and phone number. Press 1 to confirm, or 2 to change.",
    keypadPrompt: "1: Confirm Recipient, 2: Change",
    expectedInputType: "confirmation",
    nextStepId: "ENTER_AMOUNT",
  },
  {
    stepNumber: 6,
    id: "ENTER_AMOUNT",
    name: "6. Enter Amount",
    description: "Type the monetary transfer value in Ghana Cedis (* for pesewas, # to submit).",
    defaultAudioFilename: "Enter amount.mp3",
    defaultAudioUrl: "/audio/Twi/Enter amount.mp3",
    twiSpokenText: "yes please, enter the amount you want to send, press * to add pesewas , when you are done press #",
    englishSpokenText: "Enter the amount in Cedis you want to transfer, then press #.",
    keypadPrompt: "Amount in Cedis (e.g. 50) + #",
    expectedInputType: "amount",
    nextStepId: "REVIEW_SUMMARY",
  },
  {
    stepNumber: 7,
    id: "REVIEW_SUMMARY",
    name: "7. Review Summary",
    description: "Confirmation screen showing recipient registered name, amount, and exact fee.",
    defaultAudioFilename: "Review transaction.mp3",
    defaultAudioUrl: "/audio/Twi/Review transaction.mp3",
    twiSpokenText: "please look through your transaction before we continue",
    englishSpokenText: "Review your transaction summary carefully. Press 1 to confirm, 2 to cancel.",
    keypadPrompt: "1: Confirm & Proceed, 2: Cancel",
    expectedInputType: "confirmation",
    nextStepId: "PIN_HANDOFF",
  },
  {
    stepNumber: 8,
    id: "PIN_HANDOFF",
    name: "8. PIN Handoff (Authentication)",
    description: "Zero-PIN Security Protocol: Never enter or speak PIN over voice. Authorize privately on handset prompt.",
    defaultAudioFilename: "Pin Handoff.mp3",
    defaultAudioUrl: "/audio/Twi/Pin Handoff.mp3",
    twiSpokenText: "Please authorize the transaction privately on your phone keypad. Never share your PIN over voice!",
    englishSpokenText: "Please authorize the transaction with your private 4-digit PIN on your phone handset prompt.",
    keypadPrompt: "Authorize Privately on Phone Prompt (Zero-PIN Handoff)",
    expectedInputType: "pin",
    nextStepId: "RECEIVE_CONFIRMATION",
    isAuthentication: true,
  },
  {
    stepNumber: 9,
    id: "RECEIVE_CONFIRMATION",
    name: "9. Success & References",
    description: "Transaction completed successfully with reference number readback, SMS receipt, and service closing.",
    defaultAudioFilename: "Success_sent.mp3",
    defaultAudioUrl: "/audio/Twi/Success_sent.mp3",
    twiSpokenText: "Sika mane no wiee pɛpɛɛpɛ! Kora wo transaction reference nɔmba yi yiye.",
    englishSpokenText: "Transfer complete! The money has been transferred successfully. Please keep your transaction reference.",
    keypadPrompt: "Session Complete (Reference Kept)",
    expectedInputType: "confirmation",
  },
];

export function getMomoStepByNumber(stepNum: number): MomoFlowStep | undefined {
  return MOMO_9_STEP_SEQUENCE.find((s) => s.stepNumber === stepNum);
}

export function getMomoStepById(stepId: string): MomoFlowStep | undefined {
  return MOMO_9_STEP_SEQUENCE.find((s) => s.id === stepId);
}
