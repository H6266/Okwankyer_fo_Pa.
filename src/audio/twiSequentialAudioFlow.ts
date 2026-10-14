/**
 * Ɔkwankyerɛfo Pa - Twi Sequential Audio Flow Architecture
 *
 * Defines the standard structured sequential audio journey:
 * 1. audio/welcome (Welcome prompt)
 * 2. twi/description/ (Service description)
 * 3. twi/main service navigation/network selection
 * 4. twi/main service navigation/services selection
 * 5. twi/main service navigation/send money selected
 * 6. twi/Recipient_Entry_Verification/enter recipient
 * 7. twi/amount_enter_verification/enter amount prompt
 * 8. twi/transaction/confirmation_intro
 * 9. twi/transaction_confirmation/review transaction
 * 10. (transaction is read / displayed) -> dynamic readback
 * 11. twi/transaction_confirmation/ready_submit & confirm speech audio
 * 12. Outcomes:
 *     - Error/Reject: twi/transaction_confirmation/reject speech
 *     - Success: twi/success_completion/success sent + success close speech
 */

export interface FlowStepDefinition {
  id: string;
  stepIndex: number;
  name: string;
  audioUrl: string;
  fallbackAudioUrl?: string;
  spokenTextTwi: string;
  spokenTextEn: string;
  nextStepId?: string;
  keypadPrompt?: string;
  isDynamicReadback?: boolean;
}

export const TWI_SEQUENTIAL_FLOW_STEPS: FlowStepDefinition[] = [
  {
    id: "welcome",
    stepIndex: 1,
    name: "audio/welcome",
    audioUrl: "/audio/Welcome_prompt_01.mp3",
    fallbackAudioUrl: "/audio/Twi/01_Welcome_Session_Start/Welcome%20back.mp3",
    spokenTextTwi: "Akwaaba kɔ MTN Mobile Money so. Yɛbɛtumi aboa wo dɛn nnɛ?",
    spokenTextEn: "Welcome to MTN Mobile Money. How can we assist you today?",
    nextStepId: "description",
  },
  {
    id: "description",
    stepIndex: 2,
    name: "twi/description/",
    audioUrl: "/audio/Twi/service_description.m4a",
    spokenTextTwi: "Ɔkwankyerɛfo Pa yɛ nne dwumadie a ɛboa wo ma womane sika, tua bills, na woyɛ mobile money dwumadie nyinaa akyire kwan pa so.",
    spokenTextEn: "Ɔkwankyerɛfo Pa voice service guides you to transfer money and complete transactions smoothly.",
    nextStepId: "network_selection",
  },
  {
    id: "network_selection",
    stepIndex: 3,
    name: "twi/main service navigation/network selection",
    audioUrl: "/audio/Twi/02_Main_Service_Navigation/Network%20selection.mp3",
    spokenTextTwi: "Yɛsrɛ wo, paw network a wopɛ sɛ womane kɔ so. Sɛ ɛyɛ MTN a mia 1, Telecel mia 2, AT mia 3.",
    spokenTextEn: "Please select the destination network. For MTN press 1, Telecel press 2, AT press 3.",
    keypadPrompt: "1",
    nextStepId: "services_selection",
  },
  {
    id: "services_selection",
    stepIndex: 4,
    name: "twi/main service navigation/services selection",
    audioUrl: "/audio/Twi/02_Main_Service_Navigation/Service%20selection.mp3",
    spokenTextTwi: "Sɛ wopɛ sɛ womane sika a mia 1, tua bills mia 2, tɔ airtime mia 3.",
    spokenTextEn: "For Mobile Money transfers press 1, bill payments press 2, airtime press 3.",
    keypadPrompt: "1",
    nextStepId: "send_money_selected",
  },
  {
    id: "send_money_selected",
    stepIndex: 5,
    name: "twi/main service navigation/send money selected",
    audioUrl: "/audio/Twi/02_Main_Service_Navigation/Send%20money%20selected.mp3",
    spokenTextTwi: "Wapaw sɛ woremane sika. Yɛrekɔ anim.",
    spokenTextEn: "Send money selected. Proceeding.",
    nextStepId: "enter_recipient",
  },
  {
    id: "enter_recipient",
    stepIndex: 6,
    name: "twi/Recipient_Entry_Verification/enter recipient",
    audioUrl: "/audio/Twi/03_Recipient_Entry_Verification/Enter%20recipient.mp3",
    spokenTextTwi: "Yɛsrɛ wo, bɔ obi a woremane no no fon nɔmba a ɛyɛ du na fa hash ka ho.",
    spokenTextEn: "Please enter the recipient's ten-digit phone number, followed by hash.",
    nextStepId: "enter_amount",
  },
  {
    id: "enter_amount",
    stepIndex: 7,
    name: "twi/amount_enter_verification/enter amount prompt",
    audioUrl: "/audio/Twi/04_Amount_Entry_Verification/Amount%20prompt.mp3",
    fallbackAudioUrl: "/audio/Twi/04_Amount_Entry_Verification/Enter%20amount.mp3",
    spokenTextTwi: "Yɛsrɛ wo bɔ sika dodow a wopɛ sɛ womane no wɔ Cedi mu na fa hash ka ho.",
    spokenTextEn: "Please enter the amount in Cedis, followed by hash.",
    nextStepId: "confirmation_intro",
  },
  {
    id: "confirmation_intro",
    stepIndex: 8,
    name: "twi/transaction/confirmation_intro",
    audioUrl: "/audio/Twi/05_Transaction_Confirmation/Confirmation%20intro.mp3",
    spokenTextTwi: "Yɛrekɔ transaction confirmation so. Yɛsrɛ wo tie deɛ ɛdidi so yi yie.",
    spokenTextEn: "Proceeding to transaction confirmation. Please listen carefully.",
    nextStepId: "review_transaction",
  },
  {
    id: "review_transaction",
    stepIndex: 9,
    name: "twi/transaction_confirmation/review transaction",
    audioUrl: "/audio/Twi/05_Transaction_Confirmation/Review%20transaction.m4a",
    spokenTextTwi: "Yɛsrɛ wo hwɛ wo transaction no yie na fa wo nsa to so.",
    spokenTextEn: "Please review your transaction details before approving.",
    nextStepId: "transaction_readback",
  },
  {
    id: "transaction_readback",
    stepIndex: 10,
    name: "(transaction is read / displayed)",
    audioUrl: "", // Dynamic readback of amount and recipient phone number
    isDynamicReadback: true,
    spokenTextTwi: "Woremane sika {amount} akɔ {recipient} nkyɛn.",
    spokenTextEn: "You are sending {amount} Cedis to {recipient}.",
    nextStepId: "ready_submit_confirm",
  },
  {
    id: "ready_submit_confirm",
    stepIndex: 11,
    name: "twi/transaction_confirmation/ready_submit & confirm speech audio",
    audioUrl: "/audio/Twi/05_Transaction_Confirmation/Ready%20submit.mp3",
    fallbackAudioUrl: "/audio/Twi/05_Transaction_Confirmation/Confirm%20speech.mp3",
    spokenTextTwi: "Sɛ wopene so a, mia 1 anaasɛ ka aane. Sɛ wopɛ sɛ wotwa mu a, mia 2 anaasɛ ka dabi.",
    spokenTextEn: "To confirm and submit, press 1 or say yes. To cancel, press 2 or say no.",
  },
  {
    id: "reject_error",
    stepIndex: 12,
    name: "twi/transaction_confirmation/reject speech - error",
    audioUrl: "/audio/Twi/05_Transaction_Confirmation/Reject%20speech.mp3",
    spokenTextTwi: "Wotwaa transaction no mu anaasɛ mfomsoɔ bi sii. Yɛrentumi nkɔ so.",
    spokenTextEn: "Transaction cancelled or rejected. The transfer was not executed.",
  },
  {
    id: "success_sent",
    stepIndex: 13,
    name: "twi/success_completion/success sent - success",
    audioUrl: "/audio/Twi/08_Success_Completion/SUCCESS%20SENT.aac",
    spokenTextTwi: "Sika no akɔ pɛpɛɛpɛ! MoMo transaction no agye atom.",
    spokenTextEn: "Transfer sent successfully! The mobile money payment was completed.",
    nextStepId: "success_close",
  },
  {
    id: "success_close",
    stepIndex: 14,
    name: "twi/success_completion/success close speech",
    audioUrl: "/audio/Twi/08_Success_Completion/SUCCESS%20CLOSE.aac",
    spokenTextTwi: "Meda wo ase sɛ wode Ɔkwankyerɛfo Pa dii dwuma. Yɛbɛhyia bio. Nante yie!",
    spokenTextEn: "Thank you for using Ɔkwankyerɛfo Pa. Goodbye!",
  },
];

export function getFlowStepById(stepId: string): FlowStepDefinition | undefined {
  return TWI_SEQUENTIAL_FLOW_STEPS.find((s) => s.id === stepId);
}

export function getFlowStepByIndex(index: number): FlowStepDefinition | undefined {
  return TWI_SEQUENTIAL_FLOW_STEPS.find((s) => s.stepIndex === index);
}

export function getNextFlowStep(currentStepId: string): FlowStepDefinition | undefined {
  const current = getFlowStepById(currentStepId);
  if (!current?.nextStepId) return undefined;
  return getFlowStepById(current.nextStepId);
}
