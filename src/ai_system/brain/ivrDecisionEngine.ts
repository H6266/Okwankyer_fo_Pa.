/**
 * Ɔkwankyerɛfo Pa - Cognitive IVR Decision Engine (ivrDecisionEngine.ts)
 * 
 * Provides structured conversational reasoning for all off-script, invalid,
 * or spoken inputs across the telephony IVR flow.
 * 
 * Implements strict spec contract:
 * - invalid_choice: Explains input and why it is invalid, replays current step prompt.
 * - understood_intent: Maps to supported action/slots, advances with short reply.
 * - clarify: Answers user question or repeats options.
 * - unsupported: Explains that requested feature is outside system capabilities.
 * - unknown: Fallback re-prompt.
 */

import { getStepDefinition, StepDefinition } from "../../domain/stepRegistry";
import { validateGhanaPhoneNumber, parseAndValidateAmount, GhanaianNetwork } from "../../domain/validation";
import { extractAmount, extractRecipient, extractNetwork } from "../../modules/nluService";

export type IvrDecisionType =
  | "invalid_choice"
  | "understood_intent"
  | "clarify"
  | "unsupported"
  | "unknown";

export interface IvrTurnContext {
  stepId: string;
  language: "en" | "twi";
  input: string;
  inputMethod: "keypad" | "speech";
  retryCount?: number;
  sessionId?: string;
  slots?: {
    service?: string;
    network?: GhanaianNetwork;
    action?: string;
    recipientPhone?: string;
    recipientName?: string;
    amount?: number;
  };
}

export interface IvrDecision {
  type: IvrDecisionType;
  reason: string;
  replyText: string;
  replyKey: string;
  nextStep?: string;
  action: "replay" | "advance" | "back" | "repeat" | "hangup";
  updatedSlots?: Record<string, any>;
  promptReplayKey?: string;
}

const MAX_RETRIES = 3;

export class IvrDecisionEngine {
  /**
   * Main entry point to reason over off-contract or spoken input
   */
  public decide(context: IvrTurnContext): IvrDecision {
    const { stepId, language, input, inputMethod } = context;
    const retryCount = context.retryCount || 0;
    const stepDef = getStepDefinition(stepId);
    const clean = input.trim();
    const cleanLower = clean.toLowerCase().replace(/[.,!?;:]/g, "");

    // ── 0. Max-Retry Hangup Gate ──────────────────────────────────────────
    if (retryCount >= MAX_RETRIES) {
      return {
        type: "invalid_choice",
        reason: `Exceeded maximum retries (${retryCount} >= ${MAX_RETRIES}) at step ${stepId}.`,
        replyText:
          language === "twi"
            ? "Wobɔɔ mmɔden pii a yɛante ase. Ahobammbɔ nti, yɛtwa frɛ yi mu seesei. Nante yie."
            : "Too many unrecognized attempts. For your security, this call will now end. Goodbye.",
        replyKey: "max_retries_exceeded",
        action: "hangup",
      };
    }

    // ── 1. Spoken Universal Navigation & Clarification ───────────────────
    if (inputMethod === "speech") {
      // Repeat / What did you say
      if (/\b(repeat|again|say again|what did you say|what\?|tie bio|ka bio)\b/i.test(cleanLower)) {
        return {
          type: "clarify",
          reason: `Caller requested to repeat options at step '${stepId}'.`,
          replyText:
            language === "twi"
              ? "Mema woate nkyerɛkyerɛmu no bio."
              : "Let me repeat the options for you.",
          replyKey: "let_me_repeat",
          nextStep: stepDef ? stepDef.id : stepId,
          action: "repeat",
          promptReplayKey: stepDef?.promptKey,
        };
      }

      // Back / Previous
      if (/\b(back|go back|previous|san|san akyi|akyiri)\b/i.test(cleanLower)) {
        if (stepDef?.navigation.allowBack) {
          const target = stepDef.navigation.getBackTarget ? stepDef.navigation.getBackTarget(language) : "language-selection";
          return {
            type: "clarify",
            reason: `Caller requested navigation back from '${stepId}' to '${target}'.`,
            replyText:
              language === "twi"
                ? "Yɛresan akɔ akyi."
                : "Going back to the previous menu.",
            replyKey: "going_back",
            nextStep: target,
            action: "back",
          };
        } else {
          return {
            type: "invalid_choice",
            reason: `Cannot go back from initial menu '${stepId}'.`,
            replyText:
              language === "twi"
                ? "Wontumi nsan nkɔ akyi mfiri ha. Yɛsrɛ wo, paw deɛ ɛwɔ menyu no so."
                : "You cannot go back from this main menu. Please choose from the available options.",
            replyKey: "invalid_choice",
            nextStep: stepDef?.id || stepId,
            action: "replay",
            promptReplayKey: stepDef?.promptKey,
          };
        }
      }

      // Cancel / Exit
      if (/\b(cancel|exit|stop|abort|quit|gyae|hwee)\b/i.test(cleanLower)) {
        return {
          type: "understood_intent",
          reason: "Caller requested to cancel transaction.",
          replyText:
            language === "twi"
              ? "Yɛatwa mu. Nante yie."
              : "Transaction cancelled. Goodbye.",
          replyKey: "cancelled",
          action: "hangup",
        };
      }

      // Unsupported Services requested by voice (Banking, Crypto, Loans)
      if (/\b(bank|banking|loan|bosea|crypto|bitcoin|dollar|foreign|wire)\b/i.test(cleanLower)) {
        return {
          type: "unsupported",
          reason: `Requested service outside pilot capability: '${clean}'.`,
          replyText:
            language === "twi"
              ? "Saa dwumadie yi nnya nkɔ so. Mprempren yi yɛboa Mobile Money sika mane wɔ MTN, Telecel ne AT so."
              : "This service is currently not supported. This pilot supports Mobile Money transfers on MTN, Telecel, and AT.",
          replyKey: "service_unsupported",
          nextStep: "service-select",
          action: "replay",
          promptReplayKey: "service_select",
        };
      }

      // Balance Inquiry over Voice
      if (/\b(balance|check balance|what's my balance|whats my balance|sika dodow)\b/i.test(cleanLower)) {
        return {
          type: "unsupported",
          reason: "Direct wallet balance check over voice is not supported due to telco PIN security policies.",
          replyText:
            language === "twi"
              ? "Mentumi nhwɛ wo wallet balance wɔ fon frɛ yi so. Sɛ wopɛ sɛ wohwɛ wo sika dodow a, bɔ star baako nson hwee hash wɔ wo fon so."
              : "I cannot check wallet balances over this voice service. To check your balance, please dial star one seven zero hash directly on your phone keypad.",
          replyKey: "balance_inquiry_unsupported",
          action: "hangup",
        };
      }

      // "Send Money" / "Mane Sika" intent spoken at service or action step
      if (/\b(send money|send|transfer|transfer money|mane sika|sika mane|mane)\b/i.test(cleanLower)) {
        // Multi-slot check (e.g. "send 50 to 0553838464" or "send money to Kwame")
        const extractedAmt = extractAmount(clean);
        const extractedRec = extractRecipient(clean);
        const extractedNet = extractNetwork(clean);

        if (extractedAmt !== null && extractedRec.phone) {
          return {
            type: "understood_intent",
            reason: `Understood complete transfer intent: ${extractedAmt} GHS to ${extractedRec.phone}.`,
            replyText:
              language === "twi"
                ? `Mate aseɛ. Wopɛ sɛ womane GHS ${extractedAmt} kɔma ${extractedRec.name || extractedRec.phone}.`
                : `Understood. You want to send ${extractedAmt} Cedis to ${extractedRec.name || extractedRec.phone}.`,
            replyKey: "intent_understood_proceed",
            nextStep: "safe-confirmation",
            action: "advance",
            updatedSlots: {
              amount: extractedAmt,
              recipientPhone: extractedRec.phone,
              recipientName: extractedRec.name,
              network: extractedNet || undefined,
            },
          };
        }

        if (extractedRec.phone) {
          return {
            type: "understood_intent",
            reason: `Understood send money intent with recipient ${extractedRec.phone}. Asking for amount.`,
            replyText:
              language === "twi"
                ? `Mate aseɛ. Woremane sika kɔma ${extractedRec.name || extractedRec.phone}. Afei bɔ sika dodow no na fa hash ka ho.`
                : `Understood. Sending money to ${extractedRec.name || extractedRec.phone}. Please enter the amount in Cedis followed by hash.`,
            replyKey: "intent_understood_ask_amount",
            nextStep: "enter-amount",
            action: "advance",
            updatedSlots: {
              recipientPhone: extractedRec.phone,
              recipientName: extractedRec.name,
              network: extractedNet || undefined,
            },
          };
        }

        // Generic "send money" -> prompt for recipient number
        return {
          type: "understood_intent",
          reason: "Understood intent to send money. Moving caller to recipient phone number step.",
          replyText:
            language === "twi"
              ? "Mate aseɛ, wopɛ sɛ womane sika. Yɛsrɛ wo, bɔ obi a woremane no no fon nɔmba a ɛyɛ du na fa hash ka ho."
              : "Understood, you want to send money. Please enter the recipient's ten-digit phone number, followed by the hash key.",
          replyKey: "intent_understood_ask_number",
          nextStep: "enter-recipient",
          action: "advance",
          updatedSlots: {
            action: "send_money",
          },
          promptReplayKey: "enter_recipient",
        };
      }
    }

    // ── 2. Recipient Phone Number Validation Diagnostics ──────────────────
    if (stepDef?.inputType === "phone_number" || stepId.includes("recipient")) {
      const digitsOnly = clean.replace(/[^0-9]/g, "");

      // A) Check length
      if (digitsOnly.length < 10) {
        const reason = `Recipient number '${clean}' has only ${digitsOnly.length} digits. Ghana phone numbers must be 10 digits.`;
        return {
          type: "invalid_choice",
          reason,
          replyText:
            language === "twi"
              ? `Fon nɔmba no yɛ tia dodo, ɛyɛ nɔmba ${digitsOnly.length} pɛ. Ghana nɔmba yɛ du. Yɛsrɛ wo, bɔ nɔmba a ɛyɛ du na fa hash ka ho.`
              : `The phone number entered is too short with only ${digitsOnly.length} digits. Ghana mobile numbers must be ten digits. Please try again followed by hash.`,
          replyKey: "number_invalid",
          nextStep: "enter-recipient",
          action: "replay",
          promptReplayKey: "enter_recipient",
        };
      }

      if (digitsOnly.length > 11) {
        const reason = `Recipient number '${clean}' has ${digitsOnly.length} digits, which exceeds valid length.`;
        return {
          type: "invalid_choice",
          reason,
          replyText:
            language === "twi"
              ? `Fon nɔmba no ware dodo. Ghana nɔmba yɛ du pɛ. Yɛsrɛ wo, bɔ nɔmba a ɛyɛ du na fa hash ka ho.`
              : `The phone number entered is too long with ${digitsOnly.length} digits. Ghana numbers are ten digits. Please re-enter the ten-digit number followed by hash.`,
          replyKey: "number_invalid",
          nextStep: "enter-recipient",
          action: "replay",
          promptReplayKey: "enter_recipient",
        };
      }

      // B) Validate Ghana phone number and prefix
      const phoneVal = validateGhanaPhoneNumber(clean);
      if (!phoneVal.valid) {
        const prefix = digitsOnly.slice(0, 3);
        const reason = `Recipient number '${clean}' has invalid network prefix '${prefix}' (error: ${phoneVal.error}).`;
        return {
          type: "invalid_choice",
          reason,
          replyText:
            language === "twi"
              ? `Yɛnnim nɔmba ahyɛase ${prefix} no. Ghana Mobile Money nɔmba hyɛase ne MTN, Telecel, anaa AT nɔmba te sɛ 024, 054, 055, 020, anaa 027. Yɛsrɛ wo san bɔ nɔmba no.`
              : `The prefix ${prefix} is not a valid Ghanaian mobile network. Valid numbers start with MTN (024, 054, 055), Telecel (020, 050), or AT (027, 057). Please re-enter the number.`,
          replyKey: "number_invalid",
          nextStep: "enter-recipient",
          action: "replay",
          promptReplayKey: "enter_recipient",
        };
      }

      // C) Valid number received!
      return {
        type: "understood_intent",
        reason: `Valid Ghanaian ${phoneVal.network} number ${phoneVal.normalized} recognized.`,
        replyText:
          language === "twi"
            ? `Yɛahu wo nɔmba a ɛwie ${phoneVal.last4Spaced}.`
            : `Phone number ending with ${phoneVal.last4Spaced} recognized on ${phoneVal.network}.`,
        replyKey: "recipient_verified",
        nextStep: "recipient-verify-choice",
        action: "advance",
        updatedSlots: {
          recipientPhone: phoneVal.normalized,
          network: phoneVal.network,
        },
      };
    }

    // ── 3. Amount Entry Validation Diagnostics ───────────────────────────
    if (stepDef?.inputType === "amount" || stepId.includes("amount")) {
      const amtVal = parseAndValidateAmount(clean);
      if (!amtVal.valid || amtVal.amount === undefined) {
        const reason = amtVal.error || `Invalid amount '${clean}'.`;
        return {
          type: "invalid_choice",
          reason,
          replyText:
            language === "twi"
              ? `Sika dodow a wobɔe no nyɛ pɛpɛɛpɛ: ${amtVal.error || "Wobɔɔ nɔmba bɔne"}. Yɛsrɛ wo, bɔ sika dodow a wopɛ sɛ womane no na fa hash ka ho.`
              : `The amount entered is invalid: ${amtVal.error || "Incorrect amount format"}. Please enter a valid amount in Cedis followed by hash.`,
          replyKey: "amount_invalid",
          nextStep: "enter-amount",
          action: "replay",
          promptReplayKey: "enter_amount",
        };
      }

      return {
        type: "understood_intent",
        reason: `Valid amount GHS ${amtVal.amount} entered.`,
        replyText:
          language === "twi"
            ? `Wobɔɔ Cedi ${amtVal.amount}.`
            : `You entered ${amtVal.amount} Cedis.`,
        replyKey: "intent_understood_proceed",
        nextStep: "safe-confirmation",
        action: "advance",
        updatedSlots: {
          amount: amtVal.amount,
        },
      };
    }

    // ── 4. Menu Selection Invalid Choice Diagnostics ──────────────────────
    if (stepDef && (stepDef.inputType === "single_digit" || stepDef.inputType === "confirm")) {
      const optionsEn = stepDef.optionsDescription.en;
      const optionsTwi = stepDef.optionsDescription.twi;

      // Caller pressed key outside accepted options (e.g. 5, 6, 7 at service-select)
      const reason = `Input '${clean}' is not a valid option for ${stepDef.name}. Accepted options: ${optionsEn}.`;

      return {
        type: "invalid_choice",
        reason,
        replyText:
          language === "twi"
            ? `Paw ${clean} nyɛ pɛpɛɛpɛ wɔ ha. Yɛsrɛ wo, paw: ${optionsTwi}.`
            : `Option ${clean} is not a valid choice. Please choose: ${optionsEn}.`,
        replyKey: "invalid_choice",
        nextStep: stepDef.id,
        action: "replay",
        promptReplayKey: stepDef.promptKey,
      };
    }

    // ── 5. Default Unknown Fallback ──────────────────────────────────────
    return {
      type: "unknown",
      reason: `Unrecognized input '${clean}' at step '${stepId}'.`,
      replyText:
        language === "twi"
          ? "Mante deɛ wobɔe no ase. Yɛsrɛ wo tie nkyerɛkyerɛmu no yie na paw deɛ wopɛ."
          : "I did not understand your input. Please listen carefully and select from the available options.",
      replyKey: "unknown_input",
      nextStep: stepDef?.id || stepId,
      action: "replay",
      promptReplayKey: stepDef?.promptKey,
    };
  }
}

export const ivrDecisionEngine = new IvrDecisionEngine();
