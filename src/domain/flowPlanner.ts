/**
 * Ɔkwankyerɛfo Pa - Conversational Flow Planner (flowPlanner.ts)
 * 
 * Pure deterministic function that inspects current session state + understood inputs
 * and decides the NEXT PROCESS (not next prompt):
 * - collect_slot (asks for missing slots one at a time)
 * - verify_recipient (queries recipient lookup directory)
 * - confirm_transaction (presents safe confirmation details for explicit approval)
 * - initiate_payment (dispatches zero-PIN payment saga)
 * - go_back (handles navigation back)
 * - cancel (handles cancellation)
 * - select_language, select_service, select_provider, select_action (numbered menu steps)
 */

export type FlowProcess =
  | "collect_slot"
  | "verify_recipient"
  | "confirm_transaction"
  | "initiate_payment"
  | "go_back"
  | "cancel"
  | "select_language"
  | "select_service"
  | "select_provider"
  | "select_action";

export interface FlowPlannerSession {
  intent?: string;
  recipientPhone?: string;
  recipientName?: string | null;
  recipientVerified?: boolean;
  recipientLookupFailed?: boolean;
  amount?: number | null;
  confirmed?: boolean;
  pendingConfirmation?: boolean;
  language?: string;
  currentStep?: string;
  service?: string;
  network?: string;
  action?: string;
  stepRetries?: Record<string, number>;
  retryCount?: number;
  [key: string]: any;
}

export interface FlowUnderstood {
  intent?: string;
  slots?: {
    recipient?: { phone?: string; name?: string } | string;
    recipientPhone?: string;
    recipientName?: string;
    amount?: number | string | null;
    network?: string;
    service?: string;
    language?: string;
    [key: string]: any;
  };
  confirmed?: boolean;
  declined?: boolean;
  navigation?: "back" | "repeat" | "cancel";
  correction?: boolean;
  transcript?: string;
  recipientLookupFailed?: boolean;
  [key: string]: any;
}

export interface FlowPlanInput {
  session?: FlowPlannerSession;
  understood?: FlowUnderstood;
}

export interface FlowPlanResult {
  process: FlowProcess;
  reason: string;
  missingSlots: string[];
  targetSlot?: string;
  updatedSlots?: Record<string, any>;
}

export const MAX_TRANSACTION_AMOUNT = 5000;

function normalizePhoneNumber(raw?: string | null): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length === 12) {
    digits = "0" + digits.slice(3);
  }
  return digits;
}

function parseAmount(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const num = typeof val === "number" ? val : Number(String(val).replace(/[^0-9.]/g, ""));
  if (Number.isNaN(num) || !Number.isFinite(num)) return null;
  return num;
}

export function planNext(input: FlowPlanInput): FlowPlanResult {
  const session: FlowPlannerSession = input.session ? { ...input.session } : {};
  const understood: FlowUnderstood = input.understood || {};
  const slots = understood.slots || {};

  // 1. Navigation overrides: caller says "go back"
  if (
    understood.navigation === "back" ||
    understood.intent === "back" ||
    (understood.transcript && /\b(go back|back|san w'akyi|san akye)\b/i.test(understood.transcript))
  ) {
    return {
      process: "go_back",
      reason: "caller requested navigation back",
      missingSlots: [],
    };
  }

  // 2. Caller says "cancel" or explicit decline outside or inside confirmation
  if (
    understood.navigation === "cancel" ||
    understood.intent === "cancel" ||
    (understood.transcript && /\b(cancel|gyae|stop|exit)\b/i.test(understood.transcript))
  ) {
    return {
      process: "cancel",
      reason: "caller cancelled transaction",
      missingSlots: [],
    };
  }

  // 3. Numbered menu step compatibility (if current step is one of the numbered menus)
  if (session.currentStep === "language-selection" && !session.language && !slots.language) {
    return {
      process: "select_language",
      reason: "language selection required",
      missingSlots: ["language"],
      targetSlot: "language",
    };
  }
  if (session.currentStep === "service-select" && !session.service && !slots.service) {
    return {
      process: "select_service",
      reason: "service selection required",
      missingSlots: ["service"],
      targetSlot: "service",
    };
  }
  if (session.currentStep === "provider-select" && !session.network && !slots.network) {
    return {
      process: "select_provider",
      reason: "network provider selection required",
      missingSlots: ["network"],
      targetSlot: "network",
    };
  }
  if (session.currentStep === "action-select" && !session.action && !slots.action) {
    return {
      process: "select_action",
      reason: "action selection required",
      missingSlots: ["action"],
      targetSlot: "action",
    };
  }

  // 4. Merge understood slots into effective working state
  const effectiveIntent = understood.intent || session.intent || (session.action === "send_money" ? "send_money" : undefined);
  
  // Recipient resolution
  let incomingPhone = slots.recipientPhone;
  if (!incomingPhone && slots.recipient) {
    if (typeof slots.recipient === "string") {
      incomingPhone = slots.recipient;
    } else if (slots.recipient.phone) {
      incomingPhone = slots.recipient.phone;
    }
  }
  const effectivePhone = normalizePhoneNumber(incomingPhone || session.recipientPhone);
  
  // Amount resolution
  let incomingAmount = parseAmount(slots.amount);
  const isAmountChanged = incomingAmount !== null && incomingAmount !== undefined && session.amount !== undefined && incomingAmount !== session.amount;
  const effectiveAmount = incomingAmount !== null && incomingAmount !== undefined ? incomingAmount : session.amount;

  // Recipient lookup failure handling
  if (understood.recipientLookupFailed || session.recipientLookupFailed) {
    return {
      process: "collect_slot",
      reason: "recipient lookup failed",
      missingSlots: ["recipient"],
      targetSlot: "recipient",
      updatedSlots: { recipientLookupFailed: true },
    };
  }

  // 5. Caller confirmation check
  // If we were at confirmation and the caller declined (said no / dabi)
  if (
    (session.pendingConfirmation || session.currentStep === "safe-confirmation") &&
    (understood.declined === true || understood.confirmed === false || (understood.transcript && /\b(no|dabi|don't|stop)\b/i.test(understood.transcript)))
  ) {
    return {
      process: "cancel",
      reason: "caller declined confirmation",
      missingSlots: [],
      updatedSlots: { pendingConfirmation: false, confirmed: false },
    };
  }

  // If we were at confirmation and the caller confirmed (said yes / aane / 1)
  if (
    (session.pendingConfirmation || session.currentStep === "safe-confirmation") &&
    (understood.confirmed === true || (understood.transcript && /\b(yes|aane|confirm|pene so|sure)\b/i.test(understood.transcript)))
  ) {
    return {
      process: "initiate_payment",
      reason: "caller confirmed transaction",
      missingSlots: [],
      updatedSlots: { confirmed: true, pendingConfirmation: false },
    };
  }

  // 6. Intent check
  if (!effectiveIntent) {
    return {
      process: "collect_slot",
      reason: "intent missing",
      missingSlots: ["intent", "recipient", "amount"],
      targetSlot: "intent",
    };
  }

  // 7. Missing slot calculation for send_money / momo.transfer
  const missingSlots: string[] = [];

  // Check recipient
  const hasValidPhoneFormat = effectivePhone.length === 10;
  if (!effectivePhone || !hasValidPhoneFormat) {
    missingSlots.push("recipient");
  }

  // Check amount
  const hasAmount = effectiveAmount !== null && effectiveAmount !== undefined && !Number.isNaN(effectiveAmount);
  const isAmountValid = hasAmount && effectiveAmount > 0 && effectiveAmount <= MAX_TRANSACTION_AMOUNT;

  if (!hasAmount || !isAmountValid) {
    missingSlots.push("amount");
  }

  // If amount is invalid specifically (e.g. <= 0 or > MAX)
  if (hasAmount && !isAmountValid) {
    const reason = effectiveAmount <= 0
      ? "amount invalid: must be greater than zero"
      : `amount invalid: exceeds maximum limit of GHS ${MAX_TRANSACTION_AMOUNT}`;
    return {
      process: "collect_slot",
      reason,
      missingSlots: ["amount"],
      targetSlot: "amount",
      updatedSlots: { amount: null },
    };
  }

  // If missing slots exist, collect next missing slot
  if (missingSlots.length > 0) {
    const target = missingSlots[0];
    const reason = missingSlots.length === 2
      ? "recipient and amount required"
      : target === "recipient"
      ? "recipient required"
      : "amount required";

    return {
      process: "collect_slot",
      reason,
      missingSlots,
      targetSlot: target,
      updatedSlots: {
        intent: effectiveIntent,
        recipientPhone: effectivePhone || undefined,
        amount: isAmountValid ? effectiveAmount : undefined,
      },
    };
  }

  // 8. Both recipient and amount are known and valid!
  // If amount changed mid-flow and recipient was already verified:
  if (isAmountChanged && session.recipientVerified) {
    return {
      process: "confirm_transaction",
      reason: "amount updated, ready for confirmation",
      missingSlots: [],
      updatedSlots: {
        amount: effectiveAmount,
        pendingConfirmation: true,
        confirmed: false,
      },
    };
  }

  // If recipient is NOT yet verified:
  if (!session.recipientVerified || session.recipientPhone !== effectivePhone) {
    return {
      process: "verify_recipient",
      reason: "recipient and amount known",
      missingSlots: [],
      updatedSlots: {
        intent: effectiveIntent,
        recipientPhone: effectivePhone,
        amount: effectiveAmount,
      },
    };
  }

  // Recipient is verified, amount is valid, not yet confirmed:
  return {
    process: "confirm_transaction",
    reason: "recipient verified and amount valid",
    missingSlots: [],
    updatedSlots: {
      pendingConfirmation: true,
    },
  };
}
