/**
 * Ɔkwankyerɛfo Pa - Spoken Text Builder for Voice Telephony
 * 
 * Strict Voice Rules:
 * 1. Error decisions evaluated BEFORE step dispatch.
 * 2. Only MTN 400 on VERIFY_NUMBER blames the number.
 * 3. 401/403: "The payment service is not available right now. This is not a problem with your number."
 * 4. Network: "I cannot reach the telecom network right now. Please try again in a moment."
 * 5. 5xx with reason code uses reason map; unknown says code. Never "internal processing error" unless MTN returned it.
 * 6. Timeout computed strictly from appOutcome.elapsedMs (never a constant).
 * 7. Amounts spoken without trailing zeros ("10 euros", not "10.00 euros").
 * 8. Sandbox success appends: "This is the MTN sandbox. No real money moved."
 * 9. Speaks ONLY data fields returned by MTN gateway.
 */

import { NormalizedVoicePaymentResult } from "./voicePaymentService";

/**
 * Maps numbers and identifiers into space-separated individual digits for clear TTS
 */
export function formatDigitsForSpeech(digits: string | number | undefined | null): string {
  if (digits === undefined || digits === null) return "";
  const cleaned = String(digits).replace(/[^0-9]/g, "");
  return cleaned.split("").join(" ");
}

/**
 * Verbalizes currency code into natural spoken terms
 */
export function verbalizeCurrency(code: string | undefined | null): string {
  const upper = (code || "").toUpperCase().trim();
  if (upper === "EUR") return "euros";
  if (upper === "GHS") return "Ghana cedis";
  return upper;
}

/**
 * Formats an amount string or number to speak without trailing zeroes ("10 euros", not "10.00 euros")
 */
export function formatAmountForSpeech(amount: string | number | undefined | null): string {
  if (amount === undefined || amount === null || amount === "") return "";
  const num = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (isNaN(num)) return String(amount).trim();
  return String(Number(num.toFixed(2)));
}

/**
 * Official MTN MoMo Developer Portal Reason Code Mappings
 */
export const MTN_REASON_CODE_MAP: Record<string, string> = {
  APPROVAL_REJECTED: "approval was rejected by the customer",
  INTERNAL_PROCESSING_ERROR: "internal processing error",
  EXPIRED: "the request expired",
  NOT_ENOUGH_FUNDS: "insufficient funds in the account",
  PAYER_NOT_FOUND: "payer account not found",
  PAYEE_NOT_FOUND: "recipient account not found",
  PAYER_LIMIT_REACHED: "payer account limit reached",
  PAYEE_NOT_ALLOWED_TO_RECEIVE: "recipient is not allowed to receive funds",
  COULD_NOT_PERFORM_TRANSACTION: "the transaction could not be performed",
  RESOURCE_NOT_FOUND: "transaction resource was not found",
  INVALID_CURRENCY: "currency not supported",
};

/**
 * Translates a normalized MTN result into natural, honest spoken text
 */
export function buildSpokenText(result: NormalizedVoicePaymentResult): string {
  const env = result.momoEnv;

  // ── PRIORITY 1: GLOBAL ERRORS & APP OUTCOMES (Decided BEFORE looking at step) ──

  // 1a. Timeout: computed dynamically from elapsedMs (rounded to seconds)
  if (result.appOutcome?.type === "POLL_TIMEOUT") {
    const elapsedMs = result.appOutcome.elapsedMs ?? 0;
    const seconds = Math.max(1, Math.round(elapsedMs / 1000));
    return `MTN did not give a final answer in ${seconds} seconds. The payment may still go through. Please do not send it again. Check your MoMo messages.`;
  }

  // 1b. Network error (cannot reach telecom network)
  if (
    result.error?.source === "NETWORK" ||
    result.appOutcome?.type === "NETWORK_ERROR" ||
    result.mtnHttpStatus === 0
  ) {
    return "I cannot reach the telecom network right now. Please try again in a moment.";
  }

  // 1c. 401 or 403 Authentication / Authorization error
  if (
    result.mtnHttpStatus === 401 ||
    result.mtnHttpStatus === 403 ||
    result.appOutcome?.type === "AUTH_FAILURE"
  ) {
    return "The payment service is not available right now. This is not a problem with your number.";
  }

  // 1d. Inactive MoMo account on VERIFY_NUMBER (active check returned result: false)
  if (result.step === "VERIFY_NUMBER" && result.fields.result === false) {
    const phoneDigits = formatDigitsForSpeech(result.fields.msisdn);
    return phoneDigits
      ? `The number ${phoneDigits} has no active MoMo account.`
      : "The number has no active MoMo account.";
  }

  // 1e. MTN 400 on VERIFY_NUMBER (only case that blames the number)
  if (result.step === "VERIFY_NUMBER" && (result.mtnHttpStatus === 400 || !result.ok)) {
    const phoneDigits = formatDigitsForSpeech(result.fields.msisdn);
    return phoneDigits
      ? `The account lookup for ${phoneDigits} failed. Please check the number.`
      : "The account lookup failed. Please check the number.";
  }

  // 1f. MTN 5xx with a code
  if (result.mtnHttpStatus >= 500 && result.mtnHttpStatus < 600) {
    const code =
      result.mtnReason ||
      result.error?.mtnBody?.code ||
      (typeof result.error?.mtnBody === "object" ? result.error?.mtnBody?.code : undefined);

    if (code) {
      const mapped = MTN_REASON_CODE_MAP[code];
      if (mapped) {
        return `Payment failed. Reason: ${mapped}.`;
      }
      return `Payment failed. Reason code ${code}.`;
    }
    return "Payment failed due to a server error on the telecom network.";
  }

  // ── PRIORITY 2: STEP-SPECIFIC DISPATCH ──

  // 2. STEP: VERIFY_NUMBER
  if (result.step === "VERIFY_NUMBER") {
    if (result.ok) {
      if (env === "sandbox") {
        return "The account is active on the network. Notice: Sandbox environment does not return real identity.";
      }
      if (result.fields.name) {
        return `The account is active under the name ${result.fields.name}.`;
      }
      return "The account is active on the network.";
    }

    const phoneDigits = formatDigitsForSpeech(result.fields.msisdn);
    return `The account lookup for ${phoneDigits} failed. Please check the number.`;
  }

  // 3. STEP: INITIATE_PAYMENT
  if (result.step === "INITIATE_PAYMENT") {
    if (!result.ok) {
      const code = result.mtnReason || result.error?.mtnBody?.code;
      if (code) {
        const mapped = MTN_REASON_CODE_MAP[code];
        if (mapped) {
          return `Payment request failed. Reason: ${mapped}.`;
        }
        return `Payment request failed. Reason code ${code}.`;
      }
      return "Payment request failed on the telecom network.";
    }

    const amt = formatAmountForSpeech(result.fields.amount);
    const cur = verbalizeCurrency(result.fields.currency);

    if (env === "sandbox") {
      return `MTN's sandbox accepted the request for ${amt} ${cur}. No phone prompt is sent in the sandbox.`;
    }
    return `Payment request for ${amt} ${cur} has been sent. Please approve the prompt on your phone screen.`;
  }

  // 4. STEP: CHECK_STATUS
  if (result.step === "CHECK_STATUS") {
    const amt = formatAmountForSpeech(result.fields.amount);
    const cur = verbalizeCurrency(result.fields.currency);

    // Final SUCCESSFUL
    if (result.mtnStatus === "SUCCESSFUL") {
      const txIdDigits = formatDigitsForSpeech(result.fields.financialTransactionId);
      const base = txIdDigits
        ? `Payment of ${amt} ${cur} was successful. Transaction ID ${txIdDigits}.`
        : `Payment of ${amt} ${cur} was successful.`;
      if (env === "sandbox") {
        return `${base} This is the MTN sandbox. No real money moved.`;
      }
      return base;
    }

    // Final FAILED
    if (result.mtnStatus === "FAILED") {
      if (result.mtnReason) {
        const mapped = MTN_REASON_CODE_MAP[result.mtnReason];
        if (mapped) {
          if (result.mtnReason === "APPROVAL_REJECTED") {
            return `Payment of ${amt} ${cur} was rejected by the customer.`;
          }
          return `Payment of ${amt} ${cur} failed. Network reason: ${mapped}.`;
        }
        return `Payment of ${amt} ${cur} failed. The network declined the payment, reason code ${result.mtnReason}.`;
      }
      return `Payment of ${amt} ${cur} failed on the network.`;
    }

    // Ongoing / Pending / Created
    if (result.mtnStatus === "CREATED" || result.mtnStatus === "PENDING" || result.mtnStatus === "ONGOING") {
      if (env === "sandbox") {
        return `Payment of ${amt} ${cur} is in state ${result.mtnStatus}.`;
      }
      return `Payment of ${amt} ${cur} is waiting for customer approval.`;
    }
  }

  return "Transaction status update received.";
}
