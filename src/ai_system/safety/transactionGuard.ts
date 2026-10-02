/**
 * Ɔkwankyerɛfo Pa - Zero-PIN & Transaction Guard
 * Strictly prevents PIN interception, storage, or execution bypass.
 */

import { ActionOutput, SafetyOutput } from "../core/aiTypes";

export class TransactionGuard {
  /**
   * Scans input text and actions for spoken PINs or security bypass attempts.
   */
  public evaluate(rawInput: string, action: ActionOutput): SafetyOutput {
    // 1. PIN detection pattern: 4 to 6 consecutive digits that might be spoken credentials
    const pinRegex = /\b(my pin is|me pin|pin no|pin)\s*([0-9]{4,6})\b/i;
    const isPinSpoken = pinRegex.test(rawInput);

    // 2. Redact sensitive patterns from input
    const piiMaskedInput = this.maskPii(rawInput);

    // 3. Evaluate confirmation requirement
    const requiresConfirmation =
      action.riskLevel === "HIGH" ||
      action.tool === "confirm_transaction" ||
      action.requiresClientConfirmation;

    const blockedReason = isPinSpoken
      ? "ZERO-PIN ALERT: User attempted to speak a PIN. Never accept PINs over voice. Handoff to phone screen required."
      : undefined;

    return {
      riskLevel: action.riskLevel,
      requiresConfirmation,
      pinDetectedInVoice: isPinSpoken,
      blockedReason,
      sanitized: !isPinSpoken,
      piiMaskedInput,
    };
  }

  public maskPii(text: string): string {
    return text
      .replace(/\b0[25][0-9]{8}\b/g, (match) => `${match.slice(0, 3)}****${match.slice(-3)}`)
      .replace(/\b\d{4,6}\b/g, "[REDACTED_DIGITS]");
  }
}

export const transactionGuard = new TransactionGuard();
