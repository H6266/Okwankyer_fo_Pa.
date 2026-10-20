/**
 * Ɔkwankyerɛfo Pa - Voice PIN Safety & Zero-PIN Protocol Guards (pinSafety.ts)
 * 
 * Strict safety rules to prevent PIN blurting and acoustic PIN leakage:
 * 1. Step-aware PIN Safety Gate: Discards PINs at menus, permits 1-5000 GHS amounts.
 * 2. Blocks voice capture completely during pin-authorization steps.
 * 3. Safe to import in both client-side React UI and server-side services.
 */

import { formatSpokenNumbersAsDigits } from "./numberFormatter";

let _accessiblePinModeEnabled = false;

export function setAccessiblePinMode(enabled: boolean): void {
  _accessiblePinModeEnabled = enabled;
}

export function getAccessiblePinMode(): boolean {
  return _accessiblePinModeEnabled;
}

/**
 * Masks any potential PIN numbers or digits as **** for privacy.
 */
export function maskPinCredentials(text: string): string {
  if (!text) return "";
  return text
    .replace(/\b\d{4,6}\b/g, "****")
    .replace(/(?:pin|password|secret|passcode)\s*(?:is\s*)?(\d{4,6})/gi, "PIN: ****");
}

export function isVoiceCaptureBlockedForStep(step?: string, accessibleMode: boolean = getAccessiblePinMode()): boolean {
  const norm = (step || "").toLowerCase().replace(/_/g, "-");
  const isAuthStep = /(?:enter-pin|verify-pin|pin-handoff|pin-authorization)/.test(norm);
  if (accessibleMode && isAuthStep) {
    // In Accessible PIN Mode (for blind & elderly users), we allow keypad/spoken PIN entry at this step
    return false;
  }
  return isAuthStep;
}

export function shouldDiscardSensitiveSpeech(text: string, step?: string, accessibleMode: boolean = getAccessiblePinMode()): boolean {
  if (accessibleMode && isVoiceCaptureBlockedForStep(step, false)) {
    // In accessible mode during authentication step, do NOT discard spoken PIN
    return false;
  }
  if (isVoiceCaptureBlockedForStep(step, accessibleMode)) return true;
  return (
    isVoiceCaptureBlockedForStep(step, accessibleMode) ||
    isSpokenPinPattern(text, step) ||
    isSpokenPinPattern(formatSpokenNumbersAsDigits(text), step)
  );
}

/**
 * Step-Aware PIN Safety Gate
 * Decides whether an utterance is a potential leaked PIN based on the dialogue step.
 */
export function isSpokenPinPattern(text: string, step?: string): boolean {
  if (!text) return false;

  const lower = text.toLowerCase().trim();
  const normalizedStep = (step || "").toLowerCase();

  // PIN steps never accept voice; if a transcript leaks through, treat it as sensitive.
  if (isVoiceCaptureBlockedForStep(normalizedStep)) {
    const digitsOnly = text.replace(/[^0-9]/g, "");
    return digitsOnly.length >= 4 && digitsOnly.length <= 6 ||
      /\b(pin|momo\s*pin|password|secret|passcode|kokoam|ahintasɛm)\b/i.test(lower);
  }

  if (/\b(pin|momo\s*pin|password|secret|passcode|kokoam|ahintasɛm)\b/i.test(lower)) {
    return true;
  }

  if (/(secret|password|pin)/i.test(lower) && /(one|two|three|four|five|six|seven|eight|nine|zero)/i.test(lower)) {
    return true;
  }

  const digitsOnly = text.replace(/[^0-9]/g, "");
  const hasAmountLanguage =
    /(cedis?|ghs|pesewas?|ghana|amount|send\s*\d+|transfer|sika|mane|money)/i.test(lower);

  const hasPhoneLanguage =
    /(phone|number|recipient|contact|mobile|nɔmba|fon)/i.test(lower);

  const isMenu =
    normalizedStep.includes("menu") ||
    normalizedStep.includes("selection") ||
    normalizedStep.includes("choice") ||
    normalizedStep.includes("service");

  const isAmountStep =
    normalizedStep.includes("amount") ||
    normalizedStep.includes("enter-amount") ||
    normalizedStep.includes("cedi");

  const isRecipientStep =
    normalizedStep.includes("recipient") ||
    normalizedStep.includes("phone") ||
    normalizedStep.includes("enter-recipient");

  if (isAmountStep) {
    if (digitsOnly.length === 0) return false;
    if (digitsOnly.length <= 4) return false; // 1000, 2500, 5000 are valid amounts
    if (digitsOnly.length <= 6 && !hasAmountLanguage) {
      return true; // probable PIN, not an amount
    }
    return false;
  }

  if (isRecipientStep) {
    if (digitsOnly.length >= 4 && digitsOnly.length <= 6 && !hasPhoneLanguage) {
      return true;
    }
    return false;
  }

  if (isMenu) {
    if (digitsOnly.length >= 4 && digitsOnly.length <= 6 && !hasAmountLanguage && !hasPhoneLanguage) {
      return true;
    }
    return false;
  }

  // Default: only reject strongly suspicious 4-6 digit PIN-like utterances.
  if (digitsOnly.length >= 4 && digitsOnly.length <= 6) {
    if (hasAmountLanguage || hasPhoneLanguage) return false;
    return true;
  }

  return false;
}
