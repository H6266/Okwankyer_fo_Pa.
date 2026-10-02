/**
 * Ɔkwankyerɛfo Pa - Negation & Denial Engine
 * Distinguishes pure cancellations from corrective negations ("No, I said 200").
 */

export type NegationClassification =
  | "PURE_CANCELLATION"        // User explicitly wants to abort/cancel
  | "CORRECTIVE_NEGATION"      // "No, send to Ama" or "No, 200"
  | "PAUSE_REQUEST"            // "Wait", "Hold on", "Don't do that yet"
  | "NONE";

export interface NegationAssessment {
  type: NegationClassification;
  explanation: string;
}

export class NegationEngine {
  public assess(utterance: string): NegationAssessment {
    const lower = utterance.toLowerCase().trim();

    // 1. Pause or Hold request
    if (
      lower.startsWith("wait") ||
      lower.startsWith("hold on") ||
      lower.includes("twɛn") ||
      lower.includes("gyina hɔ") ||
      lower.includes("don't do that yet")
    ) {
      return {
        type: "PAUSE_REQUEST",
        explanation: "Caller requested a pause to clarify or change an instruction.",
      };
    }

    // 2. Check if utterance contains a negative marker
    const hasNo = /^(no|nope|dabi|not that|wrong|that's wrong|sesa)\b/i.test(lower);

    if (hasNo) {
      // If it contains an entity update or correction keyword, it is a corrective negation
      if (
        /\b(\d+|mtn|telecel|at|kwame|ama|kofi|yaw|actually|said|meant|instead)\b/i.test(lower)
      ) {
        return {
          type: "CORRECTIVE_NEGATION",
          explanation: "Caller negated previous interpretation and provided replacement values.",
        };
      }

      // If standalone "no" or "cancel", it's a pure cancellation
      return {
        type: "PURE_CANCELLATION",
        explanation: "Caller explicitly denied confirmation or requested cancellation.",
      };
    }

    return {
      type: "NONE",
      explanation: "No negation detected.",
    };
  }
}

export const negationEngine = new NegationEngine();
