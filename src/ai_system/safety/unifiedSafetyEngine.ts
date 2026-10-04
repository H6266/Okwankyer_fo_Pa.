/**
 * Ɔkwankyerɛfo Pa - Canonical Unified Safety Engine (unifiedSafetyEngine.ts)
 *
 * Deterministic Zero-PIN security, credential sanitization, rate-limiting,
 * social engineering detection, and hard financial invariant enforcement.
 */

import {
  ActionOutput,
  EntitySlotMap,
  RiskLevel,
  SafetyOutput,
  SECURITY_INVARIANTS,
  TransactionDraft,
} from "../core/aiTypes";

export interface SecurityEvaluationResult extends SafetyOutput {
  invariantViolations: string[];
  isActionPermitted: boolean;
}

export class UnifiedSafetyEngine {
  private failedAttempts = new Map<string, number>();
  private processedReferences = new Set<string>();

  /**
   * Primary deterministic gate checking utterance, slots, draft, and intended action.
   */
  public evaluate(
    sessionId: string,
    rawUtterance: string,
    action: ActionOutput,
    draft?: TransactionDraft | null,
    slots: EntitySlotMap = {}
  ): SecurityEvaluationResult {
    const invariantViolations: string[] = [];
    let isActionPermitted = true;

    // 1. PIN Detection in both digits ("1234") and spoken words ("one two three four")
    const pinDetectedInVoice = this.detectSpokenPin(rawUtterance);
    const piiMaskedInput = this.maskCredentials(rawUtterance);
    const sanitized = piiMaskedInput !== rawUtterance;

    if (pinDetectedInVoice) {
      invariantViolations.push(SECURITY_INVARIANTS.INVARIANT_001);
      this.incrementFailureCount(sessionId);
      isActionPermitted = false;
    }

    // Check INVARIANT_001: ensure action parameters never contain a PIN
    if (this.containsPinParameter(action.params)) {
      invariantViolations.push(SECURITY_INVARIANTS.INVARIANT_001);
      isActionPermitted = false;
    }

    // 2. Rate-Limiting Protection (Lock after 3 failed attempts)
    const failureCount = this.failedAttempts.get(sessionId) || 0;
    const rateLimitExceeded = failureCount >= 3;
    if (rateLimitExceeded) {
      isActionPermitted = false;
    }

    // 3. Replay Protection & Idempotency (INVARIANT_007)
    if (action.params.referenceId) {
      if (this.processedReferences.has(action.params.referenceId)) {
        invariantViolations.push(SECURITY_INVARIANTS.INVARIANT_007);
        isActionPermitted = false;
      }
    }

    // 4. Financial Confirmation Validation (INVARIANT_004, INVARIANT_005, INVARIANT_006)
    if (action.riskLevel === "HIGH" || action.riskLevel === "CRITICAL") {
      if (action.type === "EXECUTE_TRANSFER" || action.tool === "momo_execute_transfer") {
        if (!draft) {
          invariantViolations.push(SECURITY_INVARIANTS.INVARIANT_004);
          isActionPermitted = false;
        } else {
          // Check expiration (INVARIANT_005)
          if (Date.now() > draft.expiresAt) {
            invariantViolations.push(SECURITY_INVARIANTS.INVARIANT_005);
            isActionPermitted = false;
          }
          // Check confirmation state (INVARIANT_004)
          if (draft.confirmationState !== "CONFIRMED") {
            invariantViolations.push(SECURITY_INVARIANTS.INVARIANT_004);
            isActionPermitted = false;
          }
          // Check amount alignment (INVARIANT_006)
          if (action.params.amount && draft.amount && action.params.amount !== draft.amount) {
            invariantViolations.push(SECURITY_INVARIANTS.INVARIANT_006);
            isActionPermitted = false;
          }
        }
      }
    }

    // 5. Social Engineering & Urgency Coercion Detection
    const socialEng = this.detectSocialEngineering(rawUtterance, slots);

    // Compute effective risk level
    let finalRiskLevel: RiskLevel = action.riskLevel;
    let blockedReason: string | undefined = undefined;

    if (rateLimitExceeded) {
      finalRiskLevel = "CRITICAL";
      blockedReason = "SESSION LOCKED: Maximum safety verification attempts exceeded. Please try again later.";
    } else if (pinDetectedInVoice) {
      finalRiskLevel = "CRITICAL";
      blockedReason = "ZERO-PIN ALERT: Spoken PIN intercepted. For your security, Mobile Money PINs must never be spoken.";
    } else if (!isActionPermitted) {
      blockedReason = `ACTION BLOCKED: Safety check failed (${invariantViolations[0] || "Policy violation"}).`;
    }

    return {
      riskLevel: finalRiskLevel,
      requiresConfirmation: finalRiskLevel === "HIGH" || finalRiskLevel === "CRITICAL",
      pinDetectedInVoice,
      blockedReason,
      sanitized,
      piiMaskedInput,
      rateLimitExceeded,
      failedAttemptsCount: failureCount,
      socialEngineeringAlert: socialEng,
      invariantViolations,
      isActionPermitted,
    };
  }

  /**
   * Detects spoken PINs in digits (1234), spoken numbers ("one two three four", "baako mmienu"), or PIN context phrases.
   */
  public detectSpokenPin(text: string): boolean {
    const lower = text.toLowerCase();

    // 1. Literal PIN keyword paired with 4-6 digits
    const pinRegex = /\b(?:pin|p\.i\.n|password|secret|kokoam|koodi)\b.{0,25}\b\d{4,6}\b/i;
    if (pinRegex.test(lower)) return true;

    // 2. Phrases stating PIN
    if (/\b(?:my\s+(?:secret\s+)?pin\s+is|the\s+pin\s+is|pin\s+no\s+yɛ|me\s+pin\s+yɛ|code\s+is)\s+\d{4,6}\b/i.test(lower)) return true;

    // 3. Spoken word digits when preceded by PIN indicator:
    // e.g. "my pin is one two three four" or "pin baako mmienu mmiɛnsa anan"
    const wordDigitPinPattern = /\b(?:my\s+(?:secret\s+)?pin\s+is|pin\s+is|pin\s+no\s+yɛ|code\s+is)\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|baako|mmienu|mmiɛnsa|mmiensa|anan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|\d)(?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|baako|mmienu|mmiɛnsa|mmiensa|anan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|\d)){3,5}\b/i;
    if (wordDigitPinPattern.test(lower)) return true;

    // 4. Standalone 4-5 digit number when text contains "pin" or "secret"
    if ((lower.includes("pin") || lower.includes("secret")) && /\b\d{4,5}\b/.test(lower)) return true;

    return false;
  }

  public maskCredentials(text: string): string {
    let masked = text
      .replace(/\b(?:pin|password)\s*[:=]?\s*(\d{4,6})\b/gi, "[REDACTED_PIN]")
      .replace(/\b(my\s+(?:secret\s+)?pin\s+is\s+)\d{4,6}\b/gi, "$1[REDACTED_PIN]")
      .replace(/\b(?:secret\s+pin\s+is\s+)\d{4,6}\b/gi, "secret PIN is [REDACTED_PIN]")
      .replace(/\b(\d{4,6})\s*(?:is my pin)\b/gi, "[REDACTED_PIN] is my pin")
      .replace(/\b(my\s+(?:secret\s+)?pin\s+is\s+)(?:zero|one|two|three|four|five|six|seven|eight|nine|\w+)(?:\s+\w+){3,5}\b/gi, "$1[REDACTED_PIN]");

    // Safety fallback: if PIN is detected, ensure any 4-6 digit sequence is securely masked
    if (this.detectSpokenPin(text) && !masked.includes("[REDACTED_PIN]")) {
      masked = masked.replace(/\b\d{4,6}\b/g, "[REDACTED_PIN]");
    }
    return masked;
  }

  public detectSocialEngineering(text: string, slots: EntitySlotMap): { detected: boolean; reasons: string[]; riskScore: number } {
    const lower = text.toLowerCase();
    const reasons: string[] = [];
    let riskScore = 0.0;

    if (
      lower.includes("immediately") ||
      lower.includes("ntɛm pa ara") ||
      lower.includes("before she dies") ||
      lower.includes("police are holding") ||
      lower.includes("emergency") ||
      lower.includes("arrested")
    ) {
      reasons.push("Emergency/high-urgency emotional trigger detected");
      riskScore += 0.50;
    }

    if (
      (lower.includes("someone told me to") || lower.includes("he called me to") || lower.includes("won a prize"))
    ) {
      reasons.push("Third-party caller coaching or prize scam pattern detected");
      riskScore += 0.60;
    }

    return {
      detected: reasons.length > 0,
      reasons,
      riskScore: Math.min(1.0, riskScore),
    };
  }

  public markReferenceProcessed(referenceId: string): void {
    this.processedReferences.add(referenceId);
  }

  private containsPinParameter(params: Record<string, any>): boolean {
    for (const key of Object.keys(params)) {
      if (key.toLowerCase().includes("pin") || key.toLowerCase().includes("password")) return true;
    }
    return false;
  }

  private incrementFailureCount(sessionId: string): void {
    const curr = this.failedAttempts.get(sessionId) || 0;
    this.failedAttempts.set(sessionId, curr + 1);
  }

  public resetFailureCount(sessionId: string): void {
    this.failedAttempts.delete(sessionId);
  }
}

export const unifiedSafetyEngine = new UnifiedSafetyEngine();
