/**
 * Ɔkwankyerɛfo Pa - Fast Local Reasoner (fastLocalReasoner.ts)
 * 
 * Provides an ultra-low-latency deterministic fast path (<2ms):
 * - Keypad DTMF tokens (0, 1, 2, 8, 9, #, *)
 * - Simple confirmations & denials ("yes", "aane", "no", "dabi")
 * - Navigation commands ("back", "repeat", "cancel")
 * - Standalone phone numbers & amounts
 * - Conversational courtesies ("hello", "thanks", "goodbye", "help")
 * - Direct slot updates during active collection steps
 * 
 * Bypasses remote LLM calls completely for simple or deterministic inputs.
 */

import { IntentName, EntitySlotMap, AiLanguage, MobileNetwork } from "../core/aiTypes";
import { parseAndValidateAmount, validateGhanaPhoneNumber } from "../../domain/validation";
import { numberDecoder } from "../speech/asr/numberDecoder";

export interface FastReasoningResult {
  canFastPath: boolean;
  intent: IntentName;
  confidence: number;
  entities: EntitySlotMap;
  isCorrection?: boolean;
  correctionField?: string;
  correctionNewValue?: any;
  conversationAct?: "CONFIRM" | "DENY" | "REQUEST" | "INFORM" | "GREETING" | "CHITCHAT" | "INTERRUPT";
}

export class FastLocalReasoner {
  public evaluate(params: {
    input: string;
    currentStep?: string;
    existingSlots?: EntitySlotMap;
    languageHint?: AiLanguage;
  }): FastReasoningResult {
    const raw = (params.input || "").trim();
    const lower = raw.toLowerCase().replace(/[\r\n]+/g, " ").trim();

    if (!lower) {
      return { canFastPath: true, intent: "REPEAT", confidence: 1.0, entities: {} };
    }

    // 1. DTMF Keypad Signals
    if (lower === "0" || lower === "home") {
      return { canFastPath: true, intent: "GO_HOME", confidence: 1.0, entities: {} };
    }
    if (lower === "8" || lower === "back") {
      return { canFastPath: true, intent: "GO_BACK", confidence: 1.0, entities: {} };
    }
    if (lower === "9" || lower === "repeat") {
      return { canFastPath: true, intent: "REPEAT", confidence: 1.0, entities: {} };
    }

    // 2. Simple Confirmations & Affirmations
    if (/^(1|yes|aane|yoo|confirm|proceed|ok|okay|kɔ so|ko so|ɛyɛ|eyie|sure|send it)$/i.test(lower)) {
      return {
        canFastPath: true,
        intent: "CONFIRM",
        confidence: 0.99,
        entities: {},
        conversationAct: "CONFIRM",
      };
    }

    // 3. Simple Denials & Cancellations
    if (/^(0|no|dabi|daabi|cancel|gyae|stop|abort|don't|mompɛ|annul)$/i.test(lower)) {
      return {
        canFastPath: true,
        intent: "CANCEL",
        confidence: 0.99,
        entities: {},
        conversationAct: "DENY",
      };
    }

    // 4. Repeat requests
    if (/^(repeat|say again|say that again|what did you say|ka bio|tie bio|tie biom|pardon)$/i.test(lower)) {
      return {
        canFastPath: true,
        intent: "REPEAT",
        confidence: 0.98,
        entities: {},
      };
    }

    // 5. Back navigation
    if (/^(back|go back|san|kɔ akyi|previous|return)$/i.test(lower)) {
      return {
        canFastPath: true,
        intent: "GO_BACK",
        confidence: 0.98,
        entities: {},
      };
    }

    // 6. Conversational Greetings
    if (/^(hello|hi|hey|good morning|good afternoon|good evening|akwaaba|are you there|maakye|maaha|maadwo)$/i.test(lower)) {
      return {
        canFastPath: true,
        intent: "GREETING",
        confidence: 0.98,
        entities: {},
        conversationAct: "GREETING",
      };
    }

    // 7. Conversational Thanks & Acknowledgments
    if (/^(thank you|thanks|medaase|medaase pa ara|mo|yoo medaase)$/i.test(lower)) {
      return {
        canFastPath: true,
        intent: "THANKS",
        confidence: 0.98,
        entities: {},
      };
    }

    // 8. Conversational Goodbyes
    if (/^(bye|goodbye|bye bye|nante yie|baaye)$/i.test(lower)) {
      return {
        canFastPath: true,
        intent: "GOODBYE",
        confidence: 0.98,
        entities: {},
      };
    }

    // 9. Help & Explanations
    if (/^(help|what can you do|what can i do|explain|boa me|dɛn na wotumi yɛ|how does this work)$/i.test(lower)) {
      return {
        canFastPath: true,
        intent: "EXPLANATION",
        confidence: 0.95,
        entities: {},
      };
    }

    // 10. Standalone Phone Number Entry (e.g. at enter-recipient step or spoken directly)
    const phoneVal = validateGhanaPhoneNumber(raw);
    if (phoneVal.valid && phoneVal.normalized && raw.replace(/\D/g, "").length >= 9) {
      const isRecipientStep = params.currentStep === "recipient" || params.currentStep === "enter_recipient" || Boolean(params.existingSlots?.amount);
      const inferredNetwork = phoneVal.network || "MTN";
      return {
        canFastPath: true,
        intent: "SEND_MONEY",
        confidence: 0.98,
        entities: {
          recipientPhone: phoneVal.normalized,
          network: inferredNetwork as MobileNetwork,
        },
        conversationAct: "INFORM",
      };
    }

    // 11. Standalone Amount Entry (e.g. "50", "50 cedis", "cedi 100", "aduasa")
    const amountVal = parseAndValidateAmount(raw);
    if (amountVal.valid && amountVal.amount && amountVal.amount > 0 && amountVal.amount <= 5000) {
      // Ensure it's not a phone number or DTMF code
      if (!raw.startsWith("0") && raw.length < 7) {
        return {
          canFastPath: true,
          intent: "SEND_MONEY",
          confidence: 0.96,
          entities: {
            amount: amountVal.amount,
          },
          conversationAct: "INFORM",
        };
      }
    }

    // Twi number word standalone
    const twiNum = numberDecoder.decode(raw);
    if (!twiNum.isPhoneNumber && twiNum.numericValue && twiNum.numericValue > 0 && twiNum.numericValue <= 5000) {
      return {
        canFastPath: true,
        intent: "SEND_MONEY",
        confidence: 0.95,
        entities: {
          amount: twiNum.numericValue,
        },
        conversationAct: "INFORM",
      };
    }

    // 12. Simple Amount Correction ("make it 80", "sesa kɔ 50")
    const amountCorrection = lower.match(/^(?:make it|actually|change to|sesa kɔ|rather)\s+(\d+(?:\.\d+)?)(?:\s*(?:cedis|cedi|ghs))?$/i);
    if (amountCorrection) {
      const val = parseFloat(amountCorrection[1]);
      if (!isNaN(val) && val > 0) {
        return {
          canFastPath: true,
          intent: "CHANGE_INFORMATION",
          confidence: 0.96,
          entities: { amount: val },
          isCorrection: true,
          correctionField: "amount",
          correctionNewValue: val,
        };
      }
    }

    // Fall through to LLM / Deliberative Reasoning
    return {
      canFastPath: false,
      intent: "UNKNOWN",
      confidence: 0,
      entities: {},
    };
  }
}

export const fastLocalReasoner = new FastLocalReasoner();
