/**
 * Ɔkwankyerɛfo Pa - Risk Engine
 * Computes risk scores and dictates security enforcement level.
 */

import { RiskLevel, ActionOutput, EntitySlotMap } from "../core/aiTypes";

export class RiskEngine {
  public computeRisk(action: ActionOutput, slots: EntitySlotMap): RiskLevel {
    // 1. If financial transfer or payout
    if (action.tool === "confirm_transaction" || action.tool === "navigate_send_money") {
      // High amount threshold (e.g. > 500 GHS) elevates vigilance
      if (slots.amount && slots.amount > 500) {
        return "HIGH";
      }
      return "HIGH";
    }

    // 2. Medium risk: setting slots / changing parameters
    if (
      action.tool === "set_amount" ||
      action.tool === "set_recipient" ||
      action.tool === "select_network"
    ) {
      return "MEDIUM";
    }

    // 3. Low risk: navigation, repetition, help, cancel
    return "LOW";
  }
}

export const riskEngine = new RiskEngine();
