/**
 * Ɔkwankyerɛfo Pa - Authoritative Turn Resolution Engine (resolveTurn.ts)
 * 
 * Shared canonical module called by BOTH:
 * 1. Africa's Talking IVR routes (voiceRoutes.ts)
 * 2. Web Phone Simulator routes (aiRoutes.ts)
 * 
 * Order of Evaluation:
 * 1. DTMF -> map directly against step contract.
 * 2. VOICE -> resolveExpected; if matched, treat exactly like equivalent keypad input.
 * 3. Otherwise -> invoke the Central Reasoning Brain (IvrDecisionEngine) with step optionsDescription.
 * 
 * Invariants:
 * - Tracks retries per session and step.
 * - After maxRetries, replays once offering the press-a-key fallback instead of infinite looping.
 * - Caps subsequent failures with a clean hangup.
 */

import { getStepDefinition, validateKeypadInput, StepDefinition } from "./stepRegistry";
import { resolveExpected } from "./resolveExpected";
import { ivrDecisionEngine, IvrDecision } from "../ai_system/brain/ivrDecisionEngine";
import { auditLogger } from "../services/auditLogger";

export interface ResolveTurnParams {
  step: string | StepDefinition;
  input: string;
  source: "DTMF" | "VOICE" | "INIT" | "TEXT" | "SIMULATOR";
  language: "en" | "twi" | string;
  session: any; // TransactionSession or session state object
  sessionId?: string;
  callerPhone?: string;
}

export interface TurnResolution {
  matched: boolean;
  value?: string;
  targetStep?: string;
  isNavigation?: boolean;
  navAction?: "back" | "repeat" | "cancel";
  action: "advance" | "replay" | "back" | "repeat" | "hangup";
  replyText?: string;
  replyKey?: string;
  decision?: IvrDecision;
  retryCount: number;
  offeredKeypadFallback?: boolean;
  promptReplayKey?: string;
  updatedSlots?: Record<string, any>;
}

export function resolveTurn(params: ResolveTurnParams): TurnResolution {
  const { step, input, source, language, session } = params;
  const lang = (language === "twi" || language?.startsWith("tw") || language?.startsWith("ak")) ? "twi" : "en";

  const stepDef: StepDefinition | null =
    typeof step === "string" ? getStepDefinition(step) : step;

  const stepId = stepDef ? stepDef.id : (typeof step === "string" ? step : "voice-menu");
  const fallbackStepDef = stepDef || getStepDefinition("voice-menu")!;

  // 0. Ensure session step retry tracking
  if (!session.stepRetries) {
    session.stepRetries = {};
  }
  const maxRetries = fallbackStepDef.maxRetries ?? 2;
  const currentRetries = session.stepRetries[stepId] || 0;

  // ──────────────────────────────────────────────────────────────────────────
  // 1. DTMF Input Processing
  // ──────────────────────────────────────────────────────────────────────────
  if (source === "DTMF") {
    const keypadRes = validateKeypadInput(fallbackStepDef, input, lang);

    if (keypadRes.valid) {
      // Valid input matches contract: reset step retries
      session.stepRetries[stepId] = 0;

      if (keypadRes.isNavigation) {
        if (keypadRes.navAction === "cancel") {
          return {
            matched: true,
            isNavigation: true,
            navAction: "cancel",
            action: "hangup",
            targetStep: undefined,
            retryCount: currentRetries,
            replyText: lang === "twi" ? "Yɛretwa kɔɔlo no mu. Yɛda wo ase." : "Call cancelled. Thank you.",
            replyKey: "call_cancelled",
          };
        }
        if (keypadRes.navAction === "back") {
          return {
            matched: true,
            isNavigation: true,
            navAction: "back",
            action: "back",
            targetStep: keypadRes.targetStep,
            retryCount: currentRetries,
          };
        }
        if (keypadRes.navAction === "repeat") {
          return {
            matched: true,
            isNavigation: true,
            navAction: "repeat",
            action: "repeat",
            targetStep: fallbackStepDef.id,
            retryCount: currentRetries,
          };
        }
      }

      // Valid slot / advancement
      const normalizedStr = String(keypadRes.normalizedValue);

      // Record collected slots on session
      if (fallbackStepDef.collects) {
        if (fallbackStepDef.collects === "language") {
          session.language = normalizedStr === "2" ? "twi" : "en";
        } else if (fallbackStepDef.collects === "service") {
          session.service = normalizedStr === "1" ? "telecom" : "banking";
        } else if (fallbackStepDef.collects === "network") {
          session.network = normalizedStr === "1" ? "MTN" : normalizedStr === "2" ? "Telecel" : "AT";
        } else if (fallbackStepDef.collects === "action") {
          session.action = normalizedStr === "1" ? "send_money" : "check_balance";
        } else if (fallbackStepDef.collects === "recipientPhone") {
          session.recipientPhone = normalizedStr;
        } else if (fallbackStepDef.collects === "amount") {
          session.amount = Number(normalizedStr);
        } else if (fallbackStepDef.collects === "confirm") {
          session.confirm = normalizedStr;
        }
      }

      return {
        matched: true,
        value: normalizedStr,
        targetStep: keypadRes.targetStep,
        action: "advance",
        retryCount: 0,
      };
    }

    // Invalid DTMF digit -> fall through to Brain reasoning
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. VOICE Input Processing -> Expected Answer Grammar
  // ──────────────────────────────────────────────────────────────────────────
  if (source === "VOICE") {
    const expected = resolveExpected(fallbackStepDef, input, lang);
    if (expected.matched) {
      // Voice answer matched the grammar: treat exactly like the equivalent keypad input!
      auditLogger.log("info", "NLU", `[resolveTurn] Expected voice matched to DTMF '${expected.value}' for step '${stepId}'`);
      return resolveTurn({
        step: fallbackStepDef,
        input: expected.value,
        source: "DTMF",
        language: lang,
        session,
        sessionId: params.sessionId,
        callerPhone: params.callerPhone,
      });
    }

    // Unmatched voice -> fall through to Brain reasoning
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Fallback to Brain (IvrDecisionEngine) with Step Context
  // ──────────────────────────────────────────────────────────────────────────
  const nextRetryCount = currentRetries + 1;
  session.stepRetries[stepId] = nextRetryCount;
  session.retryCount = (session.retryCount || 0) + 1;

  // Retry limit handling: offer keypad fallback once, then hang up
  if (nextRetryCount === maxRetries + 1) {
    const fallbackText = lang === "twi"
      ? "Yɛsrɛ wo, fa keypad no so mia bɔtɔn no, anaa mia 0 ma yɛntwa mu."
      : "Please use your phone keypad to select an option, or press 0 to exit.";
    auditLogger.log("warn", "TELEPHONY", `[resolveTurn] Max retries (${maxRetries}) reached for step ${stepId}. Offering keypad fallback.`);
    return {
      matched: false,
      action: "replay",
      replyText: fallbackText,
      replyKey: "press_key_fallback",
      promptReplayKey: fallbackStepDef.promptKey,
      retryCount: nextRetryCount,
      offeredKeypadFallback: true,
    };
  }

  if (nextRetryCount > maxRetries + 1) {
    const hangupText = lang === "twi"
      ? "Nsunsuansoɔ pii aba. Yɛretwa kɔɔlo no mu. Yɛda wo ase."
      : "Maximum attempts reached. Hanging up the call. Thank you.";
    auditLogger.log("error", "TELEPHONY", `[resolveTurn] Exceeded max retries for step ${stepId}. Terminating call.`);
    return {
      matched: false,
      action: "hangup",
      replyText: hangupText,
      replyKey: "max_retries_hangup",
      retryCount: nextRetryCount,
    };
  }

  // Call the Brain with full turn context and step optionsDescription
  const decision = ivrDecisionEngine.decide({
    stepId,
    language: lang,
    input,
    inputMethod: source === "DTMF" ? "keypad" : "speech",
    retryCount: nextRetryCount,
    sessionId: params.sessionId || session.sessionId,
    slots: {
      service: session.service,
      network: session.network,
      action: session.action,
      recipientPhone: session.recipientPhone,
      recipientName: session.recipientName,
      amount: session.amount,
    },
  });

  if (decision.action === "advance") {
    // Reset retries if the brain understood intent and is advancing
    session.stepRetries[stepId] = 0;
    if (decision.updatedSlots) {
      Object.assign(session, decision.updatedSlots);
    }
  }

  return {
    matched: false,
    action: decision.action,
    replyText: decision.replyText,
    replyKey: decision.replyKey,
    targetStep: decision.nextStep,
    decision,
    retryCount: nextRetryCount,
    promptReplayKey: decision.promptReplayKey || fallbackStepDef.promptKey,
    updatedSlots: decision.updatedSlots,
  };
}
