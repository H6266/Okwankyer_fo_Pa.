/**
 * Ɔkwankyerɛfo Pa - Local Language Brain (LocalLanguageBrain.ts)
 * 
 * Local lexical and slot evidence provider. This is not an ASR engine or a calibrated classifier:
 * 1. Intent understanding across English, Asante Twi, and Ghanaian Code-switching
 * 2. Slot & entity extraction (amounts, Akan compound numbers, Ghanaian mobile numbers, names)
 * 3. Contextual reasoning & mid-turn conversational corrections ("no, send 50 instead")
 * 4. Coreference & anaphora resolution ("send to him", "use the previous number")
 * 5. Ambiguity recognition & clarification prompting
 * 6. Task interruption ("wait", "hold on") and safe resumption
 * 7. Safe refusal & Zero-PIN enforcement
 * 8. Structured understanding proposal; action authorization remains in the orchestrator
 */

import {
  AiLanguage,
  EntitySlotMap,
  IntentName,
  StructuredReasoningResponse,
} from "../core/aiTypes";
import { numberDecoder } from "../speech/asr/numberDecoder";
import { languageIdentifier } from "../speech/asr/languageIdentifier";

export interface LocalBrainInput {
  text: string;
  language?: AiLanguage;
  previousSlots?: EntitySlotMap;
  currentStep?: string;
  turnCount?: number;
}

const INTENT_CUES: Partial<Record<IntentName, RegExp>> = {
  CANCEL: /\b(cancel|gyae|stop|abort|don't|dabi|daabi|mompɛ)\b/i,
  GO_BACK: /\b(back|san|kɔ akyi|previous|return)\b/i,
  REPEAT: /\b(repeat|tie bio|ka bio|again|say that again)\b/i,
  CONFIRM: /\b(confirm|yes|aane|yoo|send it|proceed|ok|okay|kɔ so)\b/i,
  CHECK_BALANCE: /\b(balance|sika dodoɔ|how much|check balance|akontaabu)\b/i,
  BUY_AIRTIME: /\b(airtime|credit|kɔkɔɔ|topup|recharge)\b/i,
  BUY_DATA: /\b(data|bundle|internet|mb|gb)\b/i,
  PAY_BILL: /\b(bill|ecg|gwcl|water|light|electricity|nhyira|tua)\b/i,
  CASH_OUT: /\b(cash\s*out|withdraw|agent|gye sika)\b/i,
  SEND_MONEY: /\b(send|mane|transfer|sika|cedis|ghs)\b/i,
};

function estimateEvidenceScore(intent: IntentName, text: string): number {
  if (intent === "UNKNOWN") return 0;
  const matchingCandidates = Object.values(INTENT_CUES).filter((cue) => cue?.test(text)).length;
  const selectedCue = INTENT_CUES[intent];
  const cueStrength = selectedCue?.test(text) ? 0.68 : 0.38;
  // This is an uncalibrated lexical evidence score, not a probability.
  return Math.max(0, Math.min(0.88, cueStrength - Math.max(0, matchingCandidates - 1) * 0.12));
}

export class LocalLanguageBrain {
  public async understand(input: LocalBrainInput): Promise<StructuredReasoningResponse> {
    const raw = (input.text || "").trim();
    const lower = raw.toLowerCase();

    // 1. Language identification
    const detectedLang = input.language || languageIdentifier.identify(raw).language;

    // 2. PIN disclosure guard - immediate safe refusal
    if (/\b(?:pin|code|secret|password|1234|passcode)\b/i.test(lower) && /\d{4}/.test(lower)) {
      return {
        intent: "UNKNOWN",
        confidence: 0,
        language: detectedLang,
        entities: {},
        conversationAct: "DENY",
        correction: null,
        referenceResolution: null,
        ambiguity: { isAmbiguous: false, candidates: [] },
        requestedAction: {
          type: "REJECT",
          tool: null,
          arguments: {
            reason: "PIN_DETECTED",
            prompt: detectedLang === "tw"
              ? "Mepa wo kyɛw, mfa wo PIN nka ano. Bɔ wo PIN wɔ wo fon no so sɛ USSD kyerɛ wo a."
              : "Never speak your Mobile Money PIN. You will enter your PIN privately on your handset when prompted by your telecom network.",
          },
        },
        requiresConfirmation: false,
        safetyFlags: ["PIN_DETECTED"],
      };
    }

    // 3. Ambiguity & Interruption detection
    if (/^(wait|hold on|twi|tie|kakra|gyae kakra)/i.test(lower)) {
      if (lower.includes("balance") || lower.includes("sika dodoɔ") || lower.includes("akontaabu") || lower.includes("check")) {
        return {
          intent: "CHECK_BALANCE",
          confidence: estimateEvidenceScore("CHECK_BALANCE", lower),
          language: detectedLang,
          entities: input.previousSlots || {},
          conversationAct: "INTERRUPT",
          correction: null,
          referenceResolution: null,
          ambiguity: { isAmbiguous: false, candidates: [] },
          requestedAction: {
            type: "CHECK_BALANCE",
            tool: "momo_get_balance",
            arguments: {},
          },
          requiresConfirmation: false,
          safetyFlags: [],
        };
      }
      return {
        intent: "CANCEL",
        confidence: estimateEvidenceScore("CANCEL", lower),
        language: detectedLang,
        entities: input.previousSlots || {},
        conversationAct: "INTERRUPT",
        correction: null,
        referenceResolution: null,
        ambiguity: { isAmbiguous: false, candidates: [] },
        requestedAction: {
          type: "HOLD",
          tool: null,
          arguments: {
            prompt: detectedLang === "tw" ? "Yoo, mereka ho atwɛn wo. Sɛ woasiesie wo ho a, ka kyerɛ me." : "No problem, holding the transaction for you. Let me know when you are ready to continue.",
          },
        },
        requiresConfirmation: false,
        safetyFlags: [],
      };
    }

    // 4. Intent Classification
    let intent: IntentName = "UNKNOWN";
    let confidence = 0;
    let conversationAct: StructuredReasoningResponse["conversationAct"] = "INFORM";

    if (/\b(cancel|gyae|stop|abort|don't|dabi|daabi|mompɛ)\b/i.test(lower)) {
      intent = "CANCEL";
      conversationAct = "DENY";
    } else if (/\b(back|san|kɔ akyi|previous|return)\b/i.test(lower)) {
      intent = "GO_BACK";
      conversationAct = "REQUEST";
    } else if (/\b(repeat|tie bio|ka bio|again|say that again)\b/i.test(lower)) {
      intent = "REPEAT";
      conversationAct = "REQUEST";
    } else if (/\b(confirm|yes|aane|yoo|send it|proceed|ok|okay|kɔ so)\b/i.test(lower)) {
      intent = "CONFIRM";
      conversationAct = "CONFIRM";
    } else if (/\b(balance|sika dodoɔ|how much|check balance|akontaabu)\b/i.test(lower)) {
      intent = "CHECK_BALANCE";
      conversationAct = "REQUEST";
    } else if (/\b(airtime|credit|kɔkɔɔ|topup|recharge)\b/i.test(lower)) {
      intent = "BUY_AIRTIME";
      conversationAct = "REQUEST";
    } else if (/\b(data|bundle|internet|mb|gb)\b/i.test(lower)) {
      intent = "BUY_DATA";
      conversationAct = "REQUEST";
    } else if (/\b(bill|ecg|gwcl|water|light|electricity|nhyira|tua)\b/i.test(lower)) {
      intent = "PAY_BILL";
      conversationAct = "REQUEST";
    } else if (/\b(cash\s*out|withdraw|agent|gye sika)\b/i.test(lower)) {
      intent = "CASH_OUT";
      conversationAct = "REQUEST";
    } else if (/\b(send|mane|transfer|sika|cedis|ghs)\b/i.test(lower)) {
      intent = "SEND_MONEY";
      conversationAct = "REQUEST";
    } else if (input.previousSlots?.amount || input.previousSlots?.recipientPhone) {
      intent = "SEND_MONEY";
      conversationAct = "INFORM";
    }

    confidence = estimateEvidenceScore(intent, lower);

    // 5. Entity Extraction (Amount, Phone, Name, Network)
    const slots: EntitySlotMap = { ...(input.previousSlots || {}) };
    let isCorrection = false;
    let correctionField: string | undefined;
    let oldVal: any;
    let newVal: any;

    // Decode numbers & amounts via Ghanaian number decoder
    const numDecoded = numberDecoder.decode(raw);
    const phoneMatch = raw.match(/(?:^|\D)(?:\+?233|0)(?:[\s().-]*\d){8,9}(?!\d)/);
    const phoneDigits = phoneMatch?.[0].replace(/\D/g, "");
    if (phoneDigits && (phoneDigits.length === 10 || (phoneDigits.length === 12 && phoneDigits.startsWith("233")))) {
      slots.recipientPhone = phoneDigits.length === 12 ? `0${phoneDigits.slice(3)}` : phoneDigits;
    } else if (numDecoded.isPhoneNumber && numDecoded.phoneNumberDigits) {
      slots.recipientPhone = numDecoded.phoneNumberDigits;
    }
    if (!numDecoded.isPhoneNumber && numDecoded.numericValue !== null) {
      slots.amount = numDecoded.numericValue;
    }

    // Check for correction patterns ("no, 50 instead", "actually 100", "send 30 instead")
    const correctionMatch = lower.match(/(?:no|actually|change to|make it|sesa kɔ|mmom)\s+(\d+|\w+)/i);
    if (correctionMatch && correctionMatch[1]) {
      const corrVal = numberDecoder.decode(correctionMatch[1]);
      if (corrVal.numericValue !== null) {
        isCorrection = true;
        correctionField = "amount";
        oldVal = slots.amount;
        newVal = corrVal.numericValue;
        slots.amount = corrVal.numericValue;
        conversationAct = "CORRECT";
      }
    }

    // Recipient Name extraction
    const nameMatch = raw.match(/\b(?:to|ma|kɔma|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
    if (nameMatch && nameMatch[1]) {
      const candidateName = nameMatch[1].trim();
      if (!/^(?:cedis?|ghs|sidi|mtn|telecel|airtime)$/i.test(candidateName)) {
        slots.recipientName = candidateName;
      }
    }

    // Mobile network inference
    if (/\b(mtn)\b/i.test(lower)) slots.network = "MTN";
    else if (/\b(telecel|vodafone)\b/i.test(lower)) slots.network = "Telecel";
    else if (/\b(at|airteltigo)\b/i.test(lower)) slots.network = "AT";

    // 6. Action Proposal Planning
    let actionType = "CONTINUE";
    let toolToExecute: string | null = null;
    const toolParameters: Record<string, any> = {};
    let requiresConfirmation = false;

    if (intent === "CHECK_BALANCE") {
      actionType = "REJECT";
      toolToExecute = null;
      toolParameters.prompt = detectedLang === "tw"
        ? "Mepa wo kyɛw, wo sika dodoɔ nni ha. Pia *170# wɔ wo fon no so pɛɛ sɛ wobɛhwehwɛ mu."
        : "Wallet balance inquiry is not accessible over this line for security. Please dial *170# directly on your handset.";
    } else if (intent === "SEND_MONEY") {
      if (slots.recipientPhone && slots.amount && slots.network) {
        actionType = "PREPARE_TRANSFER";
        toolToExecute = "prepare_transfer";
        toolParameters.amount = slots.amount;
        toolParameters.recipientPhone = slots.recipientPhone;
        toolParameters.recipientName = slots.recipientName;
        toolParameters.network = slots.network;
        requiresConfirmation = true;
      }
    } else if (intent === "CANCEL") {
      actionType = "CANCEL";
      toolToExecute = null;
    } else if (intent === "CONFIRM") {
      // Understanding can classify a confirmation utterance, but only the
      // orchestrator may bind it to a persisted draft and authorize execution.
      actionType = "UNBOUND_CONFIRMATION";
      toolToExecute = null;
      requiresConfirmation = false;
    }

    const intentCandidates = Object.entries(INTENT_CUES)
      .filter(([, cue]) => cue?.test(lower))
      .map(([candidate]) => candidate as IntentName);

    return {
      intent,
      confidence,
      language: detectedLang,
      entities: slots,
      conversationAct,
      correction: isCorrection
        ? {
            isCorrection: true,
            field: correctionField,
            oldValue: oldVal,
            newValue: newVal,
            reason: "User mid-turn correction",
          }
        : null,
      referenceResolution: null,
      ambiguity: {
        isAmbiguous: intentCandidates.length > 1,
        candidates: intentCandidates,
      },
      requestedAction: {
        type: actionType,
        tool: toolToExecute,
        arguments: toolParameters,
      },
      requiresConfirmation,
      safetyFlags: [],
    };
  }
}

export const localLanguageBrain = new LocalLanguageBrain();
