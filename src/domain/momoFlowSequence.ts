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
    id: "LANGUAGE",
    name: "1. Language",
    description: "Language selection: 1 for English, 2 for Akan Twi.",
    defaultAudioFilename: "Language_selection.mp3",
    defaultAudioUrl: "/audio/Twi/Language_selection.mp3",
    twiSpokenText: "Akwaaba kɔ Ɔkwankyerɛfo Pa. Sɛ wopɛ Borɔfo a mia 1, sɛ wopɛ Twi a mia 2.",
    englishSpokenText: "Welcome to Ɔkwankyerɛfo Pa. For English press 1, for Twi press 2.",
    keypadPrompt: "1: English, 2: Twi",
    expectedInputType: "dtmf",
    nextStepId: "SERVICE",
  },
  {
    stepNumber: 2,
    id: "SERVICE",
    name: "2. Service",
    description: "Service menu: 1 for Mobile Money Transfer.",
    defaultAudioFilename: "Service_selection.mp3",
    defaultAudioUrl: "/audio/Twi/Service_selection.mp3",
    twiSpokenText: "Sɛ wopɛ Mobile Money transfer a mia 1, mia 9 na tie bio, anaa mia 0 na woapue.",
    englishSpokenText: "For a supported Mobile Money transfer, press 1. Press 9 to repeat, or 0 to exit.",
    keypadPrompt: "1: Mobile Money, 9: Repeat, 0: Exit",
    expectedInputType: "dtmf",
    nextStepId: "NETWORKS",
  },
  {
    stepNumber: 3,
    id: "NETWORKS",
    name: "3. Networks",
    description: "Network selection: 1 for MTN, 2 for Telecel Cash.",
    defaultAudioFilename: "Network_selection.mp3",
    defaultAudioUrl: "/audio/Twi/Network_selection.mp3",
    twiSpokenText: "Sɛ wo network yɛ MTN a mia 1, sɛ ɛyɛ Telecel a mia 2, mia 9 na tie bio, anaa 0 na woapue.",
    englishSpokenText: "For MTN Mobile Money press 1. For Telecel Cash press 2. Press 9 to repeat, or 0 to exit.",
    keypadPrompt: "1: MTN, 2: Telecel Cash, 9: Repeat, 0: Exit",
    expectedInputType: "dtmf",
    nextStepId: "RECIPIENT",
  },
  {
    stepNumber: 4,
    id: "RECIPIENT",
    name: "4. Recipient",
    description: "10-digit Ghana mobile recipient number followed by hash (#).",
    defaultAudioFilename: "Enter_recipient.mp3",
    defaultAudioUrl: "/audio/Twi/Enter_recipient.mp3",
    twiSpokenText: "Yɛsrɛ wo, bɔ obi a woremane no sika no fon nɔmba a ɛyɛ du, na fa hash ka ho.",
    englishSpokenText: "Please enter the recipient's ten-digit phone number, followed by the hash key.",
    keypadPrompt: "Enter 10-digit number + # (e.g. 0553838464#)",
    expectedInputType: "phone",
    nextStepId: "AMOUNT",
  },
  {
    stepNumber: 5,
    id: "AMOUNT",
    name: "5. Amount",
    description: "Transfer amount in Ghana Cedis followed by hash (#). Use star (*) for pesewas.",
    defaultAudioFilename: "Enter amount.mp3",
    defaultAudioUrl: "/audio/Twi/Enter amount.mp3",
    twiSpokenText: "Yɛsrɛ wo, bɔ sika dodow a wopɛ sɛ womane no wɔ Ghana Cedi mu na fa hash ka ho.",
    englishSpokenText: "Please enter the amount in Ghana Cedis followed by the hash key.",
    keypadPrompt: "Amount in Cedis + # (e.g. 50#)",
    expectedInputType: "amount",
    nextStepId: "CHECK_REFERENCE",
  },
  {
    stepNumber: 6,
    id: "CHECK_REFERENCE",
    name: "6. Check for Reference",
    description: "Telco KYC lookup: reports back registered subscriber name and amount. Press 1 to confirm, 2 to change.",
    defaultAudioFilename: "Recipient_verify.mp3",
    defaultAudioUrl: "/audio/Twi/Recipient_verify.mp3",
    twiSpokenText: "Worebɛmane GHS {amount} akɔma {name} wɔ {phone}. Edin a ɛwɔ so ne {name}. Mia 1 sɛ wopene so, anaa 2 sɛ wosakra.",
    englishSpokenText: "You are about to send {amount} Cedis to {name} on {phone}. The registered name on this account is {name}. Press 1 to confirm, or 2 to change.",
    keypadPrompt: "1: Confirm & Proceed, 2: Change",
    expectedInputType: "confirmation",
    nextStepId: "PIN_GATE",
  },
  {
    stepNumber: 7,
    id: "PIN_GATE",
    name: "7. Pin Gate Security",
    description: "Zero-PIN Security Gate: Authorize privately on handset prompt or enter PIN ending in # (e.g. 2838#).",
    defaultAudioFilename: "Pin Handoff.mp3",
    defaultAudioUrl: "/audio/Twi/Pin Handoff.mp3",
    twiSpokenText: "Pene so wɔ wo handset so. Mfa wo PIN nka wɔ telefon frɛ yi mu.",
    englishSpokenText: "Please authorize the transaction privately with your secret PIN on your handset.",
    keypadPrompt: "Private PIN + # (e.g. 2838#)",
    expectedInputType: "pin",
    nextStepId: "INITIATE_TRANSACTION",
    isAuthentication: true,
  },
  {
    stepNumber: 8,
    id: "INITIATE_TRANSACTION",
    name: "8. Initiate Transaction",
    description: "Idempotent telecom payment saga execution with carrier disbursement/collection.",
    defaultAudioFilename: "Processing.mp3",
    defaultAudioUrl: "/audio/Twi/Processing.mp3",
    twiSpokenText: "Yɛretwɛn provider no mmuae. Yɛresoma sika no seesei.",
    englishSpokenText: "Initiating transaction with telecom provider. Please wait...",
    keypadPrompt: "Executing Transfer Saga...",
    expectedInputType: "confirmation",
    nextStepId: "REPORT_STATE",
  },
  {
    stepNumber: 9,
    id: "REPORT_STATE",
    name: "9. Report Back State",
    description: "Audible transaction status receipt with reference number readback.",
    defaultAudioFilename: "Success_sent.mp3",
    defaultAudioUrl: "/audio/Twi/Success_sent.mp3",
    twiSpokenText: "Sika mane no wiee pɛpɛɛpɛ! Wo reference nɔmba ne {reference}. Meda wo ase.",
    englishSpokenText: "Transfer completed successfully! Your transaction reference is {reference}. Thank you.",
    keypadPrompt: "Transaction Complete (Receipt Issued)",
    expectedInputType: "confirmation",
  },
];

export function getMomoStepByNumber(stepNum: number): MomoFlowStep | undefined {
  return MOMO_9_STEP_SEQUENCE.find((s) => s.stepNumber === stepNum);
}

export function getMomoStepById(stepId: string): MomoFlowStep | undefined {
  return MOMO_9_STEP_SEQUENCE.find((s) => s.id === stepId);
}
