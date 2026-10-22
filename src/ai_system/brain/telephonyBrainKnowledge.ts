import { getLanguageProfile } from "./languageProfiles";
import { REPLY_FEW_SHOT_EXAMPLES } from "./replyExamples";
import { TargetLanguageId, IntentId } from "./types";
import {
  getCanonicalPrompt,
  STATE_TO_CANONICAL_PROMPT_ID,
} from "../../audio/canonicalRegistry";
import { SERVICE_CAPABILITIES, SUPPORTED_TRANSFER_NETWORKS } from "../../domain/serviceCapabilities";

export interface TelephonyBrainContext {
  targetLanguage: TargetLanguageId;
  intent?: IntentId;
  currentStep?: string;
  transactionState?: string;
  recipientVerified?: boolean;
}

export function maskDraftForModel(slots: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {
    ...slots,
    recipientPhone: slots.recipientPhone ? "[PHONE_MASKED]" : undefined,
    phone: slots.phone ? "[PHONE_MASKED]" : undefined,
    recipientName: slots.recipientName ? "[RECIPIENT_NAME_PRESENT]" : undefined,
  };
  if (slots.recipient && typeof slots.recipient === "object") {
    const recipient = slots.recipient as Record<string, unknown>;
    masked.recipient = {
      ...recipient,
      phone: recipient.phone ? "[PHONE_MASKED]" : undefined,
      name: recipient.name ? "[RECIPIENT_NAME_PRESENT]" : undefined,
    };
  }
  return masked;
}

const TELEPHONY_STEP_TO_STATE: Readonly<Record<string, string>> = {
  "service-select": "SERVICE_SELECTION",
  "service-choice": "SERVICE_SELECTION",
  "provider-select": "NETWORK_SELECTION",
  "provider-choice": "NETWORK_SELECTION",
  "action-select": "MTN_MENU",
  "action-choice": "MTN_MENU",
  "enter-recipient": "ENTER_RECIPIENT",
  "verify-recipient": "RECIPIENT_VERIFY",
  "recipient-verify-choice": "RECIPIENT_CONFIRM",
  "enter-amount": "AMOUNT_PROMPT",
  "verify-amount": "AMOUNT_PROMPT",
  "safe-confirmation": "CONFIRM_SPEECH",
  "confirm-speech": "CONFIRM_SPEECH",
  "safe-outcome": "CONFIRM_SPEECH",
  "enter-pin": "PIN_HANDOFF",
};

const TELEPHONY_INTENT_EXAMPLES = [
  'English: "send 25 cedis to Ama" means momo.transfer, amount 25, name Ama; a missing phone must remain missing.',
  'English: "I want to cash out" means momo.cash_out, not momo.transfer.',
  'English: "check my balance" means momo.check_balance; do not ask for a transfer recipient or amount.',
  'English correction: "make it 40, not 25" replaces only the amount with 40 and sets correction=true.',
  'Asante Twi: "mane sika ma Ama" expresses momo.transfer; only extract slots plainly present.',
  'Asante Twi: "hwɛ me balance" expresses momo.check_balance, not a transfer.',
  'Twi-English: "mane sika" and "send money" both express momo.transfer; retain the caller-selected reply language.',
  'Akuapem Twi: use the registered Akuapem profile (for example, "soma sika"); do not convert it into a different service.',
].join("\n");

const CORE_TRANSFER_AUDIO_STATES = [
  "ENTER_RECIPIENT",
  "RECIPIENT_VERIFY",
  "RECIPIENT_CONFIRM",
  "AMOUNT_PROMPT",
  "AMOUNT_READBACK",
  "REVIEW_TRANSACTION",
  "CONFIRM_SPEECH",
  "PIN_HANDOFF",
  "WAITING_CONFIRMATION",
  "SUCCESS",
  "FAILED",
] as const;

function resolveCurrentStage(context: TelephonyBrainContext): {
  transactionState: string;
  stageState: string;
  promptId?: string;
  promptText?: string;
} {
  const normalizedStep = context.currentStep?.trim().toLowerCase();
  const stageState = (normalizedStep && TELEPHONY_STEP_TO_STATE[normalizedStep])
    || context.transactionState
    || "INITIATED";
  const transactionState = context.transactionState || stageState;
  const promptId = STATE_TO_CANONICAL_PROMPT_ID[stageState.toUpperCase()];
  const prompt = promptId ? getCanonicalPrompt(promptId) : undefined;

  return {
    transactionState,
    stageState,
    promptId,
    promptText: prompt
      ? context.targetLanguage.startsWith("twi") ? prompt.twi : prompt.english
      : undefined,
  };
}

export function buildTelephonyBrainKnowledge(context: TelephonyBrainContext): string {
  const profile = getLanguageProfile(context.targetLanguage);
  const stage = resolveCurrentStage(context);
  const examples = REPLY_FEW_SHOT_EXAMPLES
    .filter((example) => example.language === context.targetLanguage)
    .filter((example) => example.decisionKind !== "dispatch")
    .slice(0, 8)
    .map((example) => `- ${example.decisionKind}${example.subType ? ` (${example.subType})` : ""}: "${example.phrasing}"`)
    .join("\n");
  const audioProgression = CORE_TRANSFER_AUDIO_STATES
    .map((state) => `${state}:${STATE_TO_CANONICAL_PROMPT_ID[state] || "unmapped"}`)
    .join(" -> ");

  return `SELECTED LANGUAGE AND DIALECT
Caller reply language is ${context.targetLanguage} (${profile.name}); do not switch because of a single borrowed word.
Language constraints: ${profile.constraints.join(" ")}
Glossary: ${Object.entries(profile.glossary).map(([term, translation]) => `${term}=${translation}`).join("; ")}
Registered ${profile.name} response examples (language reference only):
${examples || "- No examples are registered for this dialect."}

CURRENT TELEPHONY CONTEXT
Current input step: ${context.currentStep || "unspecified"}
Authoritative transaction state: ${stage.transactionState}
Expected workflow stage: ${stage.stageState}
Recipient verified by application: ${context.recipientVerified === undefined ? "not provided" : context.recipientVerified}
Current intent: ${context.intent || "unknown"}
Canonical stage prompt (context only; application chooses its audio): ${stage.promptId ? `${stage.promptId}: ${stage.promptText}` : "No canonical prompt is mapped for this stage."}
Canonical transfer audio progression (state:prompt ID, reference only): ${audioProgression}

AUTHORITATIVE SERVICE CAPABILITIES
- Send Money: ${SERVICE_CAPABILITIES.sendMoney.available ? "available" : "unavailable"}; networks: ${SUPPORTED_TRANSFER_NETWORKS.join(", ")}.
- Check balance: ${SERVICE_CAPABILITIES.checkBalance.available ? "available" : "unavailable"}.
- Cash out: ${SERVICE_CAPABILITIES.cashOut.available ? "available" : "unavailable"}.
- Buy airtime: ${SERVICE_CAPABILITIES.buyAirtime.available ? "available" : "unavailable"}.
- Buy data: ${SERVICE_CAPABILITIES.buyData.available ? "available" : "unavailable"}.
- Bill payment: ${SERVICE_CAPABILITIES.billPayment.available ? "available" : "unavailable"}.

TASK UNDERSTANDING EXAMPLES
${TELEPHONY_INTENT_EXAMPLES}

TRANSACTION AND SAFETY RULES
- Distinguish sending money from cash-out/withdrawal and balance questions; never reinterpret one as another.
- A transfer requires a verified recipient, a valid amount, a read-back, and explicit user confirmation before dispatch.
- State order is INITIATED -> RECIPIENT_VERIFIED -> AMOUNT_ENTERED -> CONFIRMED -> PIN_PENDING -> COMPLETED/FAILED/CANCELLED/TIMEOUT. Never claim a later state than the application reports.
- A spoken correction replaces only the corrected slot; preserve other known draft slots.
- Infer only information grounded in the caller's utterance or current draft. Never invent a recipient, phone number, amount, reference, or transaction outcome.
- A masked phone is not recoverable; never infer, generate, or return a phone number. Never request or process a PIN.
- The application owns validation, state transitions, and next-step selection. Never select a prompt ID, audio file, recording, URL, or action.`;
}
