/**
 * Ɔkwankyerɛfo Pa - Contextual Conversational Reasoning Engine (contextualReasoningEngine.ts)
 * 
 * Handles multi-turn conversational intelligence without relying on cloud LLMs:
 * 1. Slot Revision & Correction ("Actually make that 100", "No, make it 80")
 * 2. Recipient Substitution ("Not Ama. Send it to Kofi")
 * 3. Anaphora & Coreference ("Same amount", "Send it to him", "Same person")
 * 4. Task Interruption & Resumption ("Wait, check my balance first" -> "Okay, continue")
 * 5. Dialectal Ghanaian Expressions & Code-Switching
 */

import { EntitySlotMap, IntentName, TaskState } from "../core/aiTypes";
import { isPhoneNumber, normalizePhoneNumber } from "../../domain/phoneUtils";
import { parseAndValidateAmount } from "../../domain/validation";
import { inputNormalizer } from "../perception/inputNormalizer";

export interface ContextualTurnInput {
  utterance: string;
  currentSlots: EntitySlotMap;
  activeTask?: TaskState | null;
  interruptedTask?: TaskState | null;
  recentTurns?: Array<{ role: string; text: string }>;
}

export interface ContextualTurnOutput {
  intent: IntentName;
  confidence: number;
  updatedSlots: EntitySlotMap;
  isCorrection: boolean;
  correctionDetail?: {
    field: "amount" | "recipientPhone" | "recipientName" | "network";
    oldValue: any;
    newValue: any;
    reason: string;
  };
  isTaskInterruption: boolean;
  isTaskResumption: boolean;
  ambiguityDetail?: {
    isAmbiguous: boolean;
    missingField?: string;
    clarificationPrompt?: string;
  };
}

export class ContextualReasoningEngine {
  /**
   * Evaluates caller utterance against existing context, handling revisions,
   * anaphoric references, and interruptions.
   */
  public analyzeTurn(input: ContextualTurnInput): ContextualTurnOutput {
    const raw = (input.utterance || "").trim();
    const lower = raw.toLowerCase();
    const currentSlots: EntitySlotMap = { ...input.currentSlots };

    const cleanLower = lower.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Check for Task Resumption ("continue", "okay, continue", "toa so", "proceed")
    // ─────────────────────────────────────────────────────────────────────────
    if (
      cleanLower.includes("continue") ||
      cleanLower.includes("proceed") ||
      cleanLower.includes("toa so") ||
      cleanLower.includes("yɛntoa so")
    ) {
      if (input.interruptedTask) {
        return {
          intent: input.interruptedTask.type as IntentName,
          confidence: 0.98,
          updatedSlots: { ...input.interruptedTask.slots, ...currentSlots },
          isCorrection: false,
          isTaskInterruption: false,
          isTaskResumption: true,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Check for Task Interruption (e.g. "Wait, check my balance first")
    // ─────────────────────────────────────────────────────────────────────────
    const isInterruptionPattern = 
      lower.includes("wait") ||
      lower.includes("first") ||
      lower.includes("ansa") ||
      lower.includes("twɛn") ||
      lower.includes("before sending");

    const isBalanceInquiry = 
      lower.includes("balance") ||
      lower.includes("check balance") ||
      lower.includes("hwɛ balance") ||
      lower.includes("sika a aka");

    if (isBalanceInquiry && (isInterruptionPattern || currentSlots.amount || currentSlots.recipientPhone)) {
      return {
        intent: "CHECK_BALANCE",
        confidence: 0.96,
        updatedSlots: currentSlots,
        isCorrection: false,
        isTaskInterruption: true,
        isTaskResumption: false,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Amount Corrections ("Actually make that 100", "No, make it 80", "change to 50")
    // ─────────────────────────────────────────────────────────────────────────
    const amountCorrectionRegex = /\b(?:actually\s+make\s+that|make\s+it|make\s+that|change\s+(?:it\s+)?to|no\s*,?\s*make\s+it|rather|sesa\s+kɔ)\b/i;
    const amountMatch = amountCorrectionRegex.test(lower);

    if (amountMatch || (lower.startsWith("no") && /\d+/.test(lower))) {
      const extractedAmt = inputNormalizer.extractNumber(raw);
      if (extractedAmt && extractedAmt > 0) {
        const parsed = parseAndValidateAmount(String(extractedAmt));
        if (parsed.valid && parsed.amount && parsed.amount > 0) {
          const oldAmt = currentSlots.amount;
          currentSlots.amount = parsed.amount;
          return {
            intent: "SEND_MONEY",
            confidence: 0.95,
            updatedSlots: currentSlots,
            isCorrection: true,
            correctionDetail: {
              field: "amount",
              oldValue: oldAmt,
              newValue: parsed.amount,
              reason: "Caller revised monetary amount",
            },
            isTaskInterruption: false,
            isTaskResumption: false,
          };
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Recipient Corrections ("Not Ama. Send it to Kofi", "Change recipient to...")
    // ─────────────────────────────────────────────────────────────────────────
    const recipientCorrectionRegex = /\b(?:not\s+([A-Za-z]+)|send\s+it\s+to\s+([A-Za-z]+)\s+instead|change\s+(?:recipient\s+to|person\s+to)\s+([A-Za-z]+))\b/i;
    const recMatch = raw.match(recipientCorrectionRegex);
    if (recMatch) {
      const newName = (recMatch[2] || recMatch[3] || "").trim();
      if (newName) {
        const oldName = currentSlots.recipientName;
        currentSlots.recipientName = newName;
        currentSlots.recipientPhone = undefined; // Phone must be re-specified for the new person
        return {
          intent: "SEND_MONEY",
          confidence: 0.94,
          updatedSlots: currentSlots,
          isCorrection: true,
          correctionDetail: {
            field: "recipientName",
            oldValue: oldName,
            newValue: newName,
            reason: "Caller changed recipient name",
          },
          isTaskInterruption: false,
          isTaskResumption: false,
        };
      }
    }

    // Check for "Not Ama. Send to Kofi" with period split
    if (lower.includes("not ") && (lower.includes("send it to ") || lower.includes("send to "))) {
      const parts = raw.split(/[.;]/);
      for (const part of parts) {
        const sendMatch = part.match(/\b(?:send\s+(?:it\s+)?to)\s+([A-Za-z]+)\b/i);
        if (sendMatch) {
          const newName = sendMatch[1].trim();
          const oldName = currentSlots.recipientName;
          currentSlots.recipientName = newName;
          currentSlots.recipientPhone = undefined;
          return {
            intent: "SEND_MONEY",
            confidence: 0.95,
            updatedSlots: currentSlots,
            isCorrection: true,
            correctionDetail: {
              field: "recipientName",
              oldValue: oldName,
              newValue: newName,
              reason: "Caller replaced recipient",
            },
            isTaskInterruption: false,
            isTaskResumption: false,
          };
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Coreference Resolution ("Same amount", "Same person")
    // ─────────────────────────────────────────────────────────────────────────
    if (lower.includes("same amount") || lower.includes("sika koro no ara")) {
      // Retains existing or previous amount
      return {
        intent: "SEND_MONEY",
        confidence: 0.92,
        updatedSlots: currentSlots,
        isCorrection: false,
        isTaskInterruption: false,
        isTaskResumption: false,
      };
    }

    if (lower.includes("same person") || lower.includes("same number") || lower.includes("nipa koro no ara")) {
      return {
        intent: "SEND_MONEY",
        confidence: 0.92,
        updatedSlots: currentSlots,
        isCorrection: false,
        isTaskInterruption: false,
        isTaskResumption: false,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Navigation Intents: Home, Back, Cancel
    // ─────────────────────────────────────────────────────────────────────────
    if (
      lower.includes("go back") ||
      lower.includes("previous") ||
      lower === "back" ||
      lower.includes("san akyi") ||
      lower.includes("kɔ akyi")
    ) {
      return {
        intent: "GO_BACK",
        confidence: 0.98,
        updatedSlots: currentSlots,
        isCorrection: false,
        isTaskInterruption: false,
        isTaskResumption: false,
      };
    }

    if (
      lower.includes("go home") ||
      lower.includes("home") ||
      lower.includes("main menu") ||
      lower.includes("ahyɛase") ||
      lower.includes("ahyɛaseɛ") ||
      lower.includes("san kɔ ahyɛase")
    ) {
      return {
        intent: "GO_HOME",
        confidence: 0.98,
        updatedSlots: currentSlots,
        isCorrection: false,
        isTaskInterruption: false,
        isTaskResumption: false,
      };
    }

    if (
      lower === "cancel" ||
      lower === "stop" ||
      lower.includes("cancel") ||
      lower.includes("gyae")
    ) {
      return {
        intent: "CANCEL",
        confidence: 0.98,
        updatedSlots: currentSlots,
        isCorrection: false,
        isTaskInterruption: false,
        isTaskResumption: false,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Direct Phone Number & Amount Extraction
    // ─────────────────────────────────────────────────────────────────────────
    const phoneCandidates = raw.match(/\b0[25]\d{8}\b/);
    if (phoneCandidates) {
      const cleanPhone = normalizePhoneNumber(phoneCandidates[0]);
      if (isPhoneNumber(cleanPhone)) {
        currentSlots.recipientPhone = cleanPhone;
      }
    }

    // Amount extraction using inputNormalizer (supports Akan word numbers and digits, excludes phone numbers)
    if (!currentSlots.amount) {
      const extractedAmt = inputNormalizer.extractNumber(raw);
      if (extractedAmt && extractedAmt > 0) {
        currentSlots.amount = extractedAmt;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Direct Initial Request ("Send 50 to Ama")
    // ─────────────────────────────────────────────────────────────────────────
    const initialSendMatch = raw.match(/\b(?:send|transfer|mane)\s+(\d+(?:\.\d{1,2})?)\s*(?:cedis?|ghs)?\s*(?:to|kɔma)\s*([A-Za-z]+)\b/i);
    if (initialSendMatch) {
      const amt = parseFloat(initialSendMatch[1]);
      const name = initialSendMatch[2].trim();
      currentSlots.amount = amt;
      currentSlots.recipientName = name;
      return {
        intent: "SEND_MONEY",
        confidence: 0.95,
        updatedSlots: currentSlots,
        isCorrection: false,
        isTaskInterruption: false,
        isTaskResumption: false,
      };
    }

    if (lower.includes("send") || lower.includes("mane") || lower.includes("transfer") || (currentSlots.recipientPhone && currentSlots.amount)) {
      return {
        intent: "SEND_MONEY",
        confidence: 0.95,
        updatedSlots: currentSlots,
        isCorrection: false,
        isTaskInterruption: false,
        isTaskResumption: false,
      };
    }

    // Default fallback
    return {
      intent: "UNKNOWN",
      confidence: 0.3,
      updatedSlots: currentSlots,
      isCorrection: false,
      isTaskInterruption: false,
      isTaskResumption: false,
    };
  }
}

export const contextualReasoningEngine = new ContextualReasoningEngine();
