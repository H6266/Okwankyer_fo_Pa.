/**
 * Ɔkwankyerɛfo Pa - Deterministic Safety Gate (aiSafety.ts)
 *
 * Implements:
 * 1. Zero-PIN Gate: Spoken PINs are instantly intercepted, blocked, and scrubbed
 * 2. PII & Credential Sanitization: Passwords, OTPs, PINs masked before processing
 * 3. Replay Attack & Rate-Limiting Protection: Max 3 failed attempts, nonce check
 * 4. Social Engineering & Coercion Detector: Detects urgency, pressure, and suspicious transfers
 * 5. High-Risk Transaction Guard: Mandatory verbal parameter validation for HIGH/CRITICAL actions
 *
 * Performance budget: < 8ms
 */

import {
  ActionOutput,
  EntitySlotMap,
  RiskLevel,
  SafetyOutput,
} from "./aiTypes";

export interface SocialEngineeringCheckResult {
  detected: boolean;
  reasons: string[];
  riskScore: number; // 0.0 - 1.0
}

export class AiSafety {
  // Session failed attempt counter: sessionId -> failed attempts
  private sessionFailureCount = new Map<string, number>();

  // Seen reference nonce store for replay attack protection
  private processedReferences = new Set<string>();

  /**
   * Evaluates incoming utterance and action against strict Ghanaian MoMo safety boundaries (<8ms).
   */
  public evaluate(
    sessionId: string,
    rawUtterance: string,
    action: ActionOutput,
    slots: EntitySlotMap = {}
  ): SafetyOutput {
    const start = performance.now();
    let sanitized = false;
    let blockedReason: string | undefined = undefined;

    // 1. PIN & Secret Detection Gate (Uncompromising Zero-PIN policy)
    const pinDetectedInVoice = this.detectSpokenPin(rawUtterance);
    const piiMaskedInput = this.maskCredentials(rawUtterance);
    if (piiMaskedInput !== rawUtterance) {
      sanitized = true;
    }

    if (pinDetectedInVoice) {
      blockedReason = "ZERO-PIN ALERT: Spoken PIN intercepted. For security, PINs must never be spoken.";
      this.incrementFailureCount(sessionId);
    }

    // 2. Rate Limiting Check (Lock after 3 failures)
    const failureCount = this.sessionFailureCount.get(sessionId) || 0;
    const rateLimitExceeded = failureCount >= 3;
    if (rateLimitExceeded) {
      blockedReason = "SESSION LOCKED: Maximum safety verification attempts exceeded. Please try again later.";
    }

    // 3. Replay Attack Verification
    if (action.params.referenceId) {
      if (this.processedReferences.has(action.params.referenceId)) {
        blockedReason = "REPLAY ATTACK PREVENTED: Transaction reference was already processed.";
      } else {
        this.processedReferences.add(action.params.referenceId);
      }
    }

    // 4. Social Engineering & Coercion Analysis
    const socialEng = this.detectSocialEngineering(rawUtterance, slots);

    // 5. Overall Risk Level Evaluation
    let finalRiskLevel: RiskLevel = action.riskLevel;
    if (pinDetectedInVoice || rateLimitExceeded) {
      finalRiskLevel = "CRITICAL";
    } else if (socialEng.detected && socialEng.riskScore > 0.6) {
      finalRiskLevel = "HIGH";
      blockedReason = `CAUTION: Unusual urgency or transfer pattern detected (${socialEng.reasons.join(", ")}).`;
    }

    const requiresConfirmation = finalRiskLevel === "HIGH" || finalRiskLevel === "CRITICAL";

    return {
      riskLevel: finalRiskLevel,
      requiresConfirmation,
      pinDetectedInVoice,
      blockedReason,
      sanitized,
      piiMaskedInput,
      rateLimitExceeded,
      failedAttemptsCount: failureCount,
      socialEngineeringAlert: socialEng,
    };
  }

  /**
   * Detects spoken PIN patterns like "my pin is 1234", "bɔ me pin 4321", "pin 0000"
   */
  public detectSpokenPin(text: string): boolean {
    const lower = text.toLowerCase();

    // 1. Direct PIN keywords combined with 4-5 digits
    const pinPhraseRegex = /\b(?:pin|p\.i\.n|password|secret|kokoam|koodi)\b.{0,15}\b\d{4,6}\b/i;
    if (pinPhraseRegex.test(lower)) return true;

    // 2. "my pin is XXXX", "code is XXXX"
    const myPinRegex = /\b(?:my pin is|the pin is|pin no yɛ|me pin yɛ|code is)\s+\d{4,6}\b/i;
    if (myPinRegex.test(lower)) return true;

    // 3. Standalone 4-digit code in an authentication step or when preceded by "pin"
    if (/\bpin\s*[:=]?\s*\d{4,6}\b/i.test(lower)) return true;

    return false;
  }

  /**
   * Masks any detected PIN, password, or security code from logging or memory
   */
  public maskCredentials(text: string): string {
    return text
      .replace(/\b(?:pin|password|secret)\s*[:=]?\s*(\d{4,6})\b/gi, "[REDACTED_PIN]")
      .replace(/\b(my pin is\s+)\d{4,6}\b/gi, "$1[REDACTED_PIN]")
      .replace(/\b(\d{4,6})\s*(?:is my pin)\b/gi, "[REDACTED_PIN] is my pin");
  }

  /**
   * Detects suspicious urgency, pressure phrases, or romance/impersonation scam signals
   */
  public detectSocialEngineering(text: string, slots: EntitySlotMap): SocialEngineeringCheckResult {
    const lower = text.toLowerCase();
    const reasons: string[] = [];
    let riskScore = 0.0;

    // High urgency markers
    if (
      lower.includes("immediately") ||
      lower.includes("ntɛm pa ara") ||
      lower.includes("before she dies") ||
      lower.includes("police are holding") ||
      lower.includes("emergency") ||
      lower.includes("arrested")
    ) {
      reasons.push("Emergency or high-urgency emotional trigger detected");
      riskScore += 0.45;
    }

    // Suspicious recipient relationship terms paired with large amount
    if (
      (lower.includes("girlfriend") || lower.includes("stranger") || lower.includes("military") || lower.includes("customs officer")) &&
      slots.amount &&
      slots.amount >= 500
    ) {
      reasons.push("High-risk relationship keyword associated with large transfer");
      riskScore += 0.35;
    }

    // Third-party coaching markers
    if (
      lower.includes("someone told me to") ||
      lower.includes("he told me on the phone") ||
      lower.includes("they said i won a prize")
    ) {
      reasons.push("Lottery or prize scam coaching phrase detected");
      riskScore += 0.60;
    }

    return {
      detected: reasons.length > 0,
      reasons,
      riskScore: Math.min(1.0, riskScore),
    };
  }

  private incrementFailureCount(sessionId: string): void {
    const current = this.sessionFailureCount.get(sessionId) || 0;
    this.sessionFailureCount.set(sessionId, current + 1);
  }

  public resetFailureCount(sessionId: string): void {
    this.sessionFailureCount.delete(sessionId);
  }
}

export const aiSafety = new AiSafety();
