/**
 * Ɔkwankyerɛfo Pa - Response Planner
 * Voice-first conversational response generation for Ghanaian callers.
 */

import {
  DialogueOutput,
  EntitySlotMap,
  IntentName,
  AiLanguage,
  RiskLevel,
} from "../core/aiTypes";
import { slotManager } from "./slotManager";
import { confirmationGuard } from "../safety/confirmationGuard";

export class ResponsePlanner {
  public plan(
    intent: IntentName,
    slots: EntitySlotMap,
    language: AiLanguage = "tw",
    confidence: number = 1.0,
    isCorrection: boolean = false
  ): DialogueOutput {
    const isTwi = language === "tw" || language === "ak" || language === "en-ak";

    // 1. Check for slot completeness
    const slotCheck = slotManager.checkRequiredSlots(intent, slots);
    if (!slotCheck.isComplete) {
      const response = isTwi ? (slotCheck.promptTwi || "") : (slotCheck.promptEn || "");
      return {
        type: "ASK_SLOT",
        response,
        promptLanguage: language,
        needsClarification: false,
      };
    }

    // 2. Cancellation
    if (intent === "CANCEL") {
      const response = isTwi
        ? "Yɛatwa mu. Sika biara mfiri wo account mu. Akwaaba."
        : "Transaction cancelled. No money has been deducted from your account. Goodbye.";
      return {
        type: "INFORM_AND_EXIT",
        response,
        promptLanguage: language,
        needsClarification: false,
      };
    }

    // 3. Balance Check
    if (intent === "CHECK_BALANCE") {
      const response = isTwi
        ? "Woregye wo balance. Sesei, hwɛ wo phone screen na bɔ wo MoMo PIN pɛpɛɛpɛ."
        : "Checking balance. Please check your screen now to enter your PIN securely on the network prompt.";
      return {
        type: "CONTINUE_TRANSACTION",
        response,
        promptLanguage: language,
        needsClarification: false,
      };
    }

    // 4. Send Money confirmation readback
    if (intent === "SEND_MONEY" || intent === "CONFIRM" || isCorrection) {
      if (slots.amount && (slots.recipientPhone || slots.recipientName)) {
        const readback = confirmationGuard.check(slots);
        const response = isTwi ? readback.readbackTwi : readback.readbackEnglish;
        return {
          type: "CONFIRM_ACTION",
          response,
          promptLanguage: language,
          needsClarification: false,
        };
      }
    }

    // 5. Help
    if (intent === "HELP") {
      const response = isTwi
        ? "Ɔkwankyerɛfo Pa boa wo ma wosend sika anaa wocheck balance pɛpɛɛpɛ. Ka nea wopɛ sɛ woyɛ."
        : "Ɔkwankyerɛfo Pa helps you transfer money or check your balance using voice. Tell me what you'd like to do.";
      return {
        type: "CONTINUE_TRANSACTION",
        response,
        promptLanguage: language,
        needsClarification: false,
      };
    }

    // Default polite prompt
    const response = isTwi
      ? "Akwaaba kɔ Ɔkwankyerɛfo Pa. Sɛ wopɛ sɛ womane sika a, ka sɛ 'mane sika'. Sɛ balance a, ka sɛ 'balance'."
      : "Welcome to Ɔkwankyerɛfo Pa. To send money, say 'send money'. To check balance, say 'check balance'.";

    return {
      type: "CONTINUE_TRANSACTION",
      response,
      promptLanguage: language,
      needsClarification: false,
    };
  }
}

export const responsePlanner = new ResponsePlanner();
