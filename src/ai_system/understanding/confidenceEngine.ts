/**
 * Ɔkwankyerɛfo Pa - Confidence Engine
 * Enforces the three-tier confidence governance policy:
 * - >= 0.90: Execute immediately if safe.
 * - 0.60 - 0.89: Confirm interpretation before irreversible action.
 * - < 0.60: Ask a clarifying question.
 */

import { AI_CONFIG } from "../core/aiConfig";
import { RiskLevel } from "../core/aiTypes";

export type ConfidenceTier = "EXECUTE_IMMEDIATE" | "CONFIRM_INTERPRETATION" | "CLARIFY_AMBIGUITY";

export interface ConfidenceAssessment {
  score: number;
  tier: ConfidenceTier;
  policyReason: string;
  requiresVerbalConfirmation: boolean;
}

export class ConfidenceEngine {
  public assess(confidenceScore: number, riskLevel: RiskLevel = "LOW"): ConfidenceAssessment {
    const { high, medium } = AI_CONFIG.confidenceThresholds;

    // High risk actions (financial transfer, bill pay) always require explicit confirmation
    // even with high confidence
    if (riskLevel === "HIGH") {
      return {
        score: confidenceScore,
        tier: confidenceScore >= medium ? "CONFIRM_INTERPRETATION" : "CLARIFY_AMBIGUITY",
        policyReason: "High-risk financial operations strictly require explicit confirmation before execution.",
        requiresVerbalConfirmation: true,
      };
    }

    if (confidenceScore >= high) {
      return {
        score: confidenceScore,
        tier: "EXECUTE_IMMEDIATE",
        policyReason: "Confidence score exceeds 0.90 threshold for safe navigation.",
        requiresVerbalConfirmation: false,
      };
    }

    if (confidenceScore >= medium) {
      return {
        score: confidenceScore,
        tier: "CONFIRM_INTERPRETATION",
        policyReason: "Moderate confidence (0.60 - 0.89) requires user verification before advancing.",
        requiresVerbalConfirmation: true,
      };
    }

    return {
      score: confidenceScore,
      tier: "CLARIFY_AMBIGUITY",
      policyReason: "Low confidence (< 0.60). Asking a direct clarification question.",
      requiresVerbalConfirmation: true,
    };
  }
}

export const confidenceEngine = new ConfidenceEngine();
