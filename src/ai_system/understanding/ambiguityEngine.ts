/**
 * Ɔkwankyerɛfo Pa - Ambiguity Engine
 * Detects underspecified or multi-meaning utterances and generates targeted disambiguation options.
 */

import { AiLanguage } from "../core/aiTypes";

export interface AmbiguityCheckResult {
  isAmbiguous: boolean;
  clarificationQuestionEn: string;
  clarificationQuestionTwi: string;
  candidateIntents: string[];
}

export class AmbiguityEngine {
  public check(utterance: string): AmbiguityCheckResult {
    const lower = utterance.toLowerCase();

    // Check vague queries like "money thing", "sika dwuma", "financial", "do something"
    if (
      lower.includes("money thing") ||
      lower.includes("sika no") ||
      lower.includes("money service") ||
      lower.trim() === "sika" ||
      lower.trim() === "money"
    ) {
      return {
        isAmbiguous: true,
        clarificationQuestionEn: "Do you want to send money, check your balance, or buy airtime?",
        clarificationQuestionTwi: "Wopɛ sɛ womane sika, hwɛ wo balance, anaa wotɔ airtime?",
        candidateIntents: ["SEND_MONEY", "CHECK_BALANCE", "BUY_AIRTIME"],
      };
    }

    // Check vague telecom queries
    if (lower.includes("network") && !lower.includes("mtn") && !lower.includes("telecel") && !lower.includes("at")) {
      return {
        isAmbiguous: true,
        clarificationQuestionEn: "Which network? For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3.",
        clarificationQuestionTwi: "Network bɛn? Sɛ MTN a, mia 1. Sɛ Telecel a, mia 2. Sɛ AirtelTigo a, mia 3.",
        candidateIntents: ["SELECT_NETWORK"],
      };
    }

    return {
      isAmbiguous: false,
      clarificationQuestionEn: "",
      clarificationQuestionTwi: "",
      candidateIntents: [],
    };
  }
}

export const ambiguityEngine = new AmbiguityEngine();
