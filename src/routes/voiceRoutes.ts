/**
 * Ɔkwankyerɛfo Pa - Africa's Talking Telephony Voice Webhook Routes
 * 
 * Implements the voice call state transitions with:
 * 1. Dynamic Safe Confirmation readback (real amount, real recipient name/warning, real last 4 digits).
 * 2. Real recipient resolution via provider interface.
 * 3. Zero-PIN USSD screen push handoff.
 * 4. Universal keypad grammar (#, *, 8, 9, 0).
 * 5. Strict language isolation (English and Akan Twi).
 */

import { Router, Request, Response, NextFunction } from "express";
import { config } from "../config/env";
import { recipientResolver } from "../providers/recipient/RecipientResolver";
import { parseAndValidateAmount, validateGhanaPhoneNumber } from "../domain/validation";
import { transactionStateMachine } from "../domain/stateMachine";
import { buildSafeConfirmationPrompt, buildReceiptPrompt } from "../audio/dynamicPromptBuilder";
import { speechToText } from "../modules/sttService";
import { mtnMomoService } from "../modules/mtnMomoService";
import { auditLogger } from "../services/auditLogger";
import { verifyAtWebhook } from "../providers/telephony/webhookGuard";
import { voicePaymentService } from "../integrations/momo/voicePaymentService";
import { durableTransactionStore } from "../services/durableTransactionStore";
import { telephonyRateLimiter, adminRateLimiter } from "../middleware/rateLimiter";
import { requireAdminAuth } from "../middleware/adminAuth";
import { aiSystem } from "../ai_system";
import { brain } from "../ai_system/brain/brain";
import { resolvePrompt } from "../modules/ttsService";
import { extractAmount, extractRecipient, extractNetwork } from "../modules/nluService";
import { getStepDefinition, validateKeypadInput } from "../domain/stepRegistry";
import { ivrDecisionEngine, IvrDecision } from "../ai_system/brain/ivrDecisionEngine";

export const voiceRouter = Router();
export const ivrRouter = Router();
export const simulatorRouter = Router();

const TELEPHONY_ROUTES = new Set([
  "/voice-menu",
  "/language-selection",
  "/service-select",
  "/service-choice",
  "/provider-select",
  "/provider-choice",
  "/action-select",
  "/action-choice",
  "/enter-recipient",
  "/verify-recipient",
  "/recipient-verify-choice",
  "/enter-amount",
  "/verify-amount",
  "/safe-confirmation",
  "/safe-outcome",
  "/speech-fallback",
]);

// Apply rate limiting & Africa's Talking webhook verification strictly to telephony routes
voiceRouter.use((req: Request, res: Response, next) => {
  if (TELEPHONY_ROUTES.has(req.path)) {
    return telephonyRateLimiter(req, res, () => verifyAtWebhook(req, res, async () => {
      const dtmf = req.body?.dtmfDigits ?? req.query?.dtmfDigits;
      const sessionId = req.body?.sessionId ?? req.query?.sessionId;
      if (typeof dtmf === "string" && dtmf.length > 0 && typeof sessionId === "string" && sessionId.length > 0) {
        const safeDtmf = dtmf.length >= 9 && /^\d+$/.test(dtmf)
          ? `${dtmf.slice(0, 3)}****${dtmf.slice(-3)}`
          : dtmf;
        try {
          await aiSystem.process({
            sessionId,
            channel: "DTMF",
            input: safeDtmf,
            language: req.query?.lang === "twi" || req.body?.lang === "twi" ? "tw" : "unknown",
            currentScreen: "TELEPHONY",
            currentStep: req.path.slice(1),
            executionPolicy: "UNDERSTAND_ONLY",
          });
        } catch {
          auditLogger.log("warn", "AI", "Canonical keypad understanding unavailable; using guarded IVR flow.", sessionId);
        }
      }
      next();
    }));
  }
  return next();
});

function safeHeaderValue(val: unknown): string {
  if (val === undefined || val === null) return "";
  const str = String(val).replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7E]*$/.test(str)) {
    return str;
  }
  try {
    return encodeURIComponent(str);
  } catch {
    return str.replace(/[^\x20-\x7E]/g, "");
  }
}

function xmlResponse(res: Response, content: string, decision?: IvrDecision): void {
  let xml = content;
  if (decision) {
    if (decision.type) res.set("X-AI-Decision-Type", safeHeaderValue(decision.type));
    if (decision.reason) res.set("X-AI-Decision-Reason", safeHeaderValue(decision.reason));
    if (decision.replyText) res.set("X-AI-Reply-Text", safeHeaderValue(decision.replyText));
    if (decision.replyKey) res.set("X-AI-Reply-Key", safeHeaderValue(decision.replyKey));
    res.set("Access-Control-Expose-Headers", "X-AI-Decision-Type, X-AI-Decision-Reason, X-AI-Reply-Text, X-AI-Reply-Key, x-telephony-guard-reason");
  }
  const req = res.req as Request | undefined;
  if (req && req.baseUrl && req.baseUrl.startsWith("/api/simulator")) {
    const base = getBaseUrl(req);
    xml = xml.replace(/(callbackUrl=["'])(https?:\/\/[^"'\s]+|\/[^"'\s]+)/gi, (match, attr, url) => {
      if (url.includes("/api/simulator")) return match;
      if (base && url.startsWith(base)) {
        return `${attr}${url.replace(base, `${base}${req.baseUrl}`)}`;
      }
      if (url.startsWith("/")) {
        return `${attr}${req.baseUrl}${url}`;
      }
      return match;
    }).replace(/(<Redirect[^>]*>)(https?:\/\/[^<]+|\/[^<]+)(<\/Redirect>)/gi, (match, open, url, close) => {
      if (url.includes("/api/simulator")) return match;
      if (base && url.startsWith(base)) {
        return `${open}${url.replace(base, `${base}${req.baseUrl}`)}${close}`;
      }
      if (url.startsWith("/")) {
        return `${open}${req.baseUrl}${url}${close}`;
      }
      return match;
    });
  }
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${xml}\n</Response>`);
}

export function getBaseUrl(req: Request): string {
  const forwardedHost = ((req.headers["x-forwarded-host"] as string) || "").split(",")[0]?.trim();
  const reqHost = req.get("host") || "";
  const host = forwardedHost || reqHost;

  const forwardedProto = ((req.headers["x-forwarded-proto"] as string) || "").split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || "http";

  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  const envBase = (process.env.BASE_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  if (envBase) {
    return envBase;
  }

  return "";
}

// ── Step 1: Inbound Call Entry Point ──────────────────────────────────
ivrRouter.all("/voice-menu", (req: Request, res: Response) => {
  const sessionId = (req.body?.sessionId || req.query?.sessionId || `call_${Date.now()}`) as string;
  const callerNumber = (req.body?.callerNumber || req.query?.callerNumber || req.body?.phoneNumber || "caller") as string;
  const isActive = req.body?.isActive ?? req.query?.isActive;
  const baseUrl = getBaseUrl(req);

  if (isActive === "0") {
    auditLogger.log("info", "TELEPHONY", `Call ended remotely`, sessionId);
    return xmlResponse(res, "");
  }

  auditLogger.log("info", "TELEPHONY", `Inbound call connected from ${callerNumber}`, sessionId);
  const session = transactionStateMachine.getOrCreateSession(sessionId, "en", "VOICE");
  session.callerPhone = callerNumber;

  const introAudioUrl = `${baseUrl}${resolvePrompt("welcome", "en")}`;

  // Dual-track barge-in: instant GetDigits with Record fallback
  const xml = `    <GetDigits timeout="3" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/language-selection?sessionId=${sessionId}">
        <Play url="${introAudioUrl}"/>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=language-selection&amp;sessionId=${sessionId}&amp;retry=0"/>`;

  xmlResponse(res, xml);
});

// ── Step 2: Language Selection ────────────────────────────────────────
ivrRouter.all("/language-selection", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || `call_${Date.now()}`) as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (!dtmf) {
    const xml = `    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=language-selection&amp;sessionId=${sessionId}&amp;retry=0"/>`;
    return xmlResponse(res, xml);
  }

  const stepDef = getStepDefinition("language-selection")!;
  const validation = validateKeypadInput(stepDef, dtmf, "en");

  if (validation.valid) {
    if (validation.isNavigation && validation.navAction === "cancel") {
      transactionStateMachine.transition(sessionId, "CANCELLED");
      return xmlResponse(res, `    <Say voice="female">Goodbye.</Say>\n    <Reject/>`);
    }
    if (validation.isNavigation && validation.navAction === "repeat") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/voice-menu?sessionId=${sessionId}</Redirect>`);
    }
    const lang = dtmf === "2" ? "twi" : "en";
    session.language = lang;
    session.retryCount = 0;
    auditLogger.log("info", "TELEPHONY", `Language selected: ${lang.toUpperCase()}`, sessionId);

    // Twi flows directly to provider-select (Audio_prompt_twi_02.mp3); English goes to service-select (Audio_prompt_02.mp3)
    const nextRoute = lang === "twi" ? "provider-select" : "service-select";
    const decision: IvrDecision = {
      type: "understood_intent",
      reason: `Language chosen: ${lang === "twi" ? "Twi" : "English"} (${dtmf})`,
      replyText: lang === "twi" ? "Paw wo network." : "Select your service.",
      replyKey: lang === "twi" ? "provider_select" : "service_select",
      action: "advance",
      nextStep: nextRoute,
    };
    return xmlResponse(res, `    <Redirect>${baseUrl}/${nextRoute}?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`, decision);
  }

  // Invalid keypad input at language selection (e.g. 3, 4, 5, 6)
  session.retryCount = (session.retryCount || 0) + 1;
  const decision = ivrDecisionEngine.decide({
    stepId: "language-selection",
    language: "en",
    input: dtmf,
    inputMethod: "keypad",
    retryCount: session.retryCount,
    sessionId,
  });
  if (decision.action === "hangup") {
    transactionStateMachine.transition(sessionId, "FAILED", { failureReason: decision.reason });
    return xmlResponse(res, `    <Say voice="female">${decision.replyText}</Say>\n    <Reject/>`, decision);
  }
  return xmlResponse(
    res,
    `    <Say voice="female">${decision.replyText}</Say>\n    <Redirect>${baseUrl}/voice-menu?sessionId=${sessionId}&amp;err=invalid</Redirect>`,
    decision
  );
});

// ── Step 3: Service Selection (Telecom / Banking) ─────────────────────
ivrRouter.all("/service-select", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const audioUrl = `${baseUrl}${resolvePrompt("service_select", lang)}`;

  const xml = `    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>`;

  xmlResponse(res, xml);
});

ivrRouter.all("/service-choice", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  const stepDef = getStepDefinition("service-select")!;
  const validation = validateKeypadInput(stepDef, dtmf, lang);

  if (validation.valid) {
    if (validation.isNavigation && validation.navAction === "cancel") {
      transactionStateMachine.transition(sessionId, "CANCELLED");
      const navDecision: IvrDecision = {
        type: "understood_intent",
        reason: "Caller pressed 0 to cancel transaction.",
        replyText: lang === "twi" ? "Yɛatwa mu. Nante yie." : "Transaction cancelled. Goodbye.",
        replyKey: "cancelled",
        action: "hangup",
      };
      return xmlResponse(res, `    <Say voice="female">${navDecision.replyText}</Say>\n    <Reject/>`, navDecision);
    }
    if (validation.isNavigation && validation.navAction === "back") {
      const navDecision: IvrDecision = {
        type: "clarify",
        reason: "Caller pressed 8 to return to language selection.",
        replyText: lang === "twi" ? "Yɛresan akɔ akyi." : "Going back to previous menu.",
        replyKey: "going_back",
        action: "back",
        nextStep: "language-selection",
      };
      return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?sessionId=${sessionId}</Redirect>`, navDecision);
    }
    if (validation.isNavigation && validation.navAction === "repeat") {
      const navDecision: IvrDecision = {
        type: "clarify",
        reason: "Caller pressed 9 to replay service options.",
        replyText: lang === "twi" ? "Mema woate nkyerɛkyerɛmu no bio." : "Let me repeat the options for you.",
        replyKey: "let_me_repeat",
        action: "repeat",
        nextStep: "service-select",
      };
      return xmlResponse(res, `    <Redirect>${baseUrl}/service-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`, navDecision);
    }
    if (dtmf === "1") {
      session.retryCount = 0;
      const validDecision: IvrDecision = {
        type: "understood_intent",
        reason: "Selected Mobile Money service (1).",
        replyText: lang === "twi" ? "Paw wo network." : "Select your network provider.",
        replyKey: "provider_select",
        action: "advance",
        nextStep: "provider-select",
      };
      return xmlResponse(res, `    <Redirect>${baseUrl}/provider-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`, validDecision);
    }
    if (dtmf === "2") {
      // Banking is not supported in this pilot
      session.retryCount = (session.retryCount || 0) + 1;
      const decision = ivrDecisionEngine.decide({
        stepId: "service-select",
        language: lang,
        input: "banking",
        inputMethod: "keypad",
        retryCount: session.retryCount,
        sessionId,
      });
      const audioUrl = `${baseUrl}${resolvePrompt("service_select", lang)}`;
      return xmlResponse(
        res,
        `    <Say voice="female">${decision.replyText}</Say>\n    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
        decision
      );
    }
  }

  // Invalid key at service selection (e.g. 5, 6, 7)
  session.retryCount = (session.retryCount || 0) + 1;
  const decision = ivrDecisionEngine.decide({
    stepId: "service-select",
    language: lang,
    input: dtmf,
    inputMethod: "keypad",
    retryCount: session.retryCount,
    sessionId,
  });
  if (decision.action === "hangup") {
    transactionStateMachine.transition(sessionId, "FAILED", { failureReason: decision.reason });
    return xmlResponse(res, `    <Say voice="female">${decision.replyText}</Say>\n    <Reject/>`, decision);
  }
  const audioUrl = `${baseUrl}${resolvePrompt("service_select", lang)}`;
  return xmlResponse(
    res,
    `    <Say voice="female">${decision.replyText}</Say>\n    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
    decision
  );
});

// ── Step 4: Provider Selection (MTN, Telecel, AT) ─────────────────────
ivrRouter.all("/provider-select", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const audioUrl = `${baseUrl}${resolvePrompt("provider_select", lang)}`;

  const xml = `    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/provider-choice?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>`;

  xmlResponse(res, xml);
});

ivrRouter.all("/provider-choice", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (!dtmf) {
    const xml = `    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=provider-select&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;
    return xmlResponse(res, xml);
  }

  const stepDef = getStepDefinition("provider-select")!;
  const validation = validateKeypadInput(stepDef, dtmf, lang);

  if (validation.valid) {
    if (validation.isNavigation && validation.navAction === "cancel") {
      transactionStateMachine.transition(sessionId, "CANCELLED");
      const navDecision: IvrDecision = {
        type: "understood_intent",
        reason: "Caller pressed 0 to cancel call.",
        replyText: lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye.",
        replyKey: "cancelled",
        action: "hangup",
      };
      return xmlResponse(res, `    <Say voice="female">${navDecision.replyText}</Say>\n    <Reject/>`, navDecision);
    }
    if (validation.isNavigation && validation.navAction === "back") {
      const prev = lang === "twi" ? "language-selection" : "service-select";
      const navDecision: IvrDecision = {
        type: "clarify",
        reason: `Caller pressed 8 to return to ${prev}.`,
        replyText: lang === "twi" ? "Yɛresan akɔ akyi." : "Going back to previous menu.",
        replyKey: "going_back",
        action: "back",
        nextStep: prev,
      };
      return xmlResponse(res, `    <Redirect>${baseUrl}/${prev}?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`, navDecision);
    }
    if (validation.isNavigation && (validation.navAction === "repeat" || (lang === "twi" && dtmf === "4"))) {
      const navDecision: IvrDecision = {
        type: "clarify",
        reason: "Caller pressed 9 to replay network provider options.",
        replyText: lang === "twi" ? "Mema woate nkyerɛkyerɛmu no bio." : "Replaying network provider options.",
        replyKey: "provider_select",
        action: "repeat",
        nextStep: "provider-select",
      };
      return xmlResponse(res, `    <Redirect>${baseUrl}/provider-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`, navDecision);
    }

    session.network = dtmf === "2" ? "Telecel" : dtmf === "3" ? "AT" : "MTN";
    session.retryCount = 0;
    const validDecision: IvrDecision = {
      type: "understood_intent",
      reason: `Selected network provider: ${session.network} (${dtmf}).`,
      replyText: lang === "twi" ? "Sɛ wopɛ sɛ womane sika a mia 1. Sɛ wopɛ sɛ wohwɛ wo sika dodow a mia 2." : "To send money, press 1. To check balance, press 2.",
      replyKey: "action_select",
      action: "advance",
      nextStep: "action-select",
    };
    return xmlResponse(res, `    <Redirect>${baseUrl}/action-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`, validDecision);
  }

  // Invalid key at provider selection (e.g. 4, 5, 6, 7)
  session.retryCount = (session.retryCount || 0) + 1;
  const decision = ivrDecisionEngine.decide({
    stepId: "provider-select",
    language: lang,
    input: dtmf,
    inputMethod: "keypad",
    retryCount: session.retryCount,
    sessionId,
  });
  if (decision.action === "hangup") {
    transactionStateMachine.transition(sessionId, "FAILED", { failureReason: decision.reason });
    return xmlResponse(res, `    <Say voice="female">${decision.replyText}</Say>\n    <Reject/>`, decision);
  }
  const audioUrl = `${baseUrl}${resolvePrompt("provider_select", lang)}`;
  return xmlResponse(
    res,
    `    <Say voice="female">${decision.replyText}</Say>\n    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/provider-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
    decision
  );
});

// ── Step 5: Action Menu (Send Money, Balance) ─────────────────────────
ivrRouter.all("/action-select", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const audioUrl = `${baseUrl}${resolvePrompt("action_select", lang)}`;

  const xml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/action-choice?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>`;

  xmlResponse(res, xml);
});

ivrRouter.all("/action-choice", async (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "1").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  const stepDef = getStepDefinition("action-select")!;
  const validation = validateKeypadInput(stepDef, dtmf, lang);

  if (validation.valid) {
    if (validation.isNavigation && validation.navAction === "cancel") {
      transactionStateMachine.transition(sessionId, "CANCELLED");
      const navDecision: IvrDecision = {
        type: "understood_intent",
        reason: "Caller pressed 0 to cancel call.",
        replyText: lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye.",
        replyKey: "cancelled",
        action: "hangup",
      };
      return xmlResponse(res, `    <Say voice="female">${navDecision.replyText}</Say>\n    <Reject/>`, navDecision);
    }
    if (validation.isNavigation && validation.navAction === "back") {
      const navDecision: IvrDecision = {
        type: "clarify",
        reason: "Caller pressed 8 to return to network provider menu.",
        replyText: lang === "twi" ? "Yɛresan akɔ akyi." : "Going back to provider menu.",
        replyKey: "going_back",
        action: "back",
        nextStep: "provider-select",
      };
      return xmlResponse(res, `    <Redirect>${baseUrl}/provider-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`, navDecision);
    }
    if (validation.isNavigation && validation.navAction === "repeat") {
      const navDecision: IvrDecision = {
        type: "clarify",
        reason: "Caller pressed 9 to replay action options.",
        replyText: lang === "twi" ? "Mema woate nkyerɛkyerɛmu no bio." : "Replaying action menu.",
        replyKey: "action_select",
        action: "repeat",
        nextStep: "action-select",
      };
      return xmlResponse(res, `    <Redirect>${baseUrl}/action-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`, navDecision);
    }

    // 1 = Send Money
    if (dtmf === "1") {
      session.retryCount = 0;
      const validDecision: IvrDecision = {
        type: "understood_intent",
        reason: "Selected Send Money (1).",
        replyText: lang === "twi" ? "Yɛsrɛ wo, bɔ obi a woremane no sika no fon nɔmba a ɛyɛ du na fa hash ka ho." : "Please enter the recipient's ten-digit phone number, followed by the hash key.",
        replyKey: "enter_recipient",
        action: "advance",
        nextStep: "enter-recipient",
      };
      return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`, validDecision);
    }

    // Balance query option
    if (dtmf === "5" || dtmf === "2") {
      const spoken = lang === "twi"
        ? "Mentumi nhwɛ wo wallet balance. Sɛ wopɛ sɛ wohwɛ wo deɛ a, bɔ star baako nson hwee hash wɔ wo fon so."
        : "I can't check wallet balances. To check yours, dial star one seven zero hash on your handset.";
      const unsuppDecision: IvrDecision = {
        type: "unsupported",
        reason: "Direct wallet balance check over voice is not supported due to telco PIN security policies.",
        replyText: spoken,
        replyKey: "balance_inquiry_unsupported",
        action: "hangup",
      };
      return xmlResponse(res, `    <Say voice="female">${spoken}</Say>\n    <Reject/>`, unsuppDecision);
    }
  }

  // Invalid key at action-choice (e.g. 3, 4, 6, 7)
  session.retryCount = (session.retryCount || 0) + 1;
  const decision = ivrDecisionEngine.decide({
    stepId: "action-select",
    language: lang,
    input: dtmf,
    inputMethod: "keypad",
    retryCount: session.retryCount,
    sessionId,
  });
  if (decision.action === "hangup") {
    transactionStateMachine.transition(sessionId, "FAILED", { failureReason: decision.reason });
    return xmlResponse(res, `    <Say voice="female">${decision.replyText}</Say>\n    <Reject/>`, decision);
  }
  const audioUrl = `${baseUrl}${resolvePrompt("action_select", lang)}`;
  return xmlResponse(
    res,
    `    <Say voice="female">${decision.replyText}</Say>\n    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/action-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
    decision
  );
});

// ── Step 6: Recipient Phone Number Entry ──────────────────────────────
ivrRouter.all("/enter-recipient", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);
  const audioUrl = `${baseUrl}${resolvePrompt("enter_recipient", lang)}`;

  // 40 second generous window for feature phone callers
  const xml = `    <GetDigits timeout="40" finishOnKey="#" numDigits="10" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="12" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-recipient&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  xmlResponse(res, xml);
});

// ── Step 7: Recipient Verification (Real Resolver) ────────────────────
ivrRouter.all("/verify-recipient", async (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const rawDigits = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim().replace(/#+$/, "");
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (rawDigits === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (rawDigits === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/action-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (rawDigits === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  // Validate phone number format and prefix
  const phoneValidation = validateGhanaPhoneNumber(rawDigits);
  if (!phoneValidation.valid || !phoneValidation.normalized) {
    session.retryCount = (session.retryCount || 0) + 1;
    const decision = ivrDecisionEngine.decide({
      stepId: "enter-recipient",
      language: lang,
      input: rawDigits,
      inputMethod: "keypad",
      retryCount: session.retryCount,
      sessionId,
    });
    auditLogger.log("warn", "TELEPHONY", `Invalid recipient phone entered: ${rawDigits} (${decision.reason})`, sessionId);
    if (decision.action === "hangup") {
      transactionStateMachine.transition(sessionId, "FAILED", { failureReason: decision.reason });
      return xmlResponse(res, `    <Say voice="female">${decision.replyText}</Say>\n    <Reject/>`, decision);
    }
    const audioUrl = `${baseUrl}${resolvePrompt("enter_recipient", lang)}`;
    return xmlResponse(
      res,
      `    <Say voice="female">${decision.replyText}</Say>\n    <GetDigits timeout="40" finishOnKey="#" numDigits="10" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
      decision
    );
  }

  session.retryCount = 0;

  // Resolve recipient using active provider (Sandbox or real MTN)
  const resolution = await recipientResolver.resolve(phoneValidation.normalized);
  auditLogger.log(
    "info",
    "TELEPHONY",
    `Recipient lookup for ${phoneValidation.normalized}: verified=${resolution.verified}, name=${resolution.name || 'NONE'} (${resolution.source})`,
    sessionId
  );

  // Transition state machine to RECIPIENT_VERIFIED
  transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
    recipientPhone: phoneValidation.normalized,
    recipientName: resolution.name,
    isRecipientVerified: resolution.verified,
    network: resolution.network,
  });

  const last4Spaced = phoneValidation.last4Spaced;
  const nameSpoken = resolution.name || (lang === "twi" ? `nɔmba a ɛwie ${last4Spaced}` : `subscriber ending in ${last4Spaced}`);

  let readbackPrompt = "";
  if (lang === "twi") {
    readbackPrompt = resolution.verified
      ? `Worepɛ sɛ womane sika kɔma ${nameSpoken} a ne nɔmba wie ${last4Spaced}. Sɛ ɛyɛ ampa a, mia baako (1). Sɛ ɛnyɛ no a, mia mmienu (2).`
      : `Kɔkɔbɔ: Yɛantumi anhu edin a ɛbata nɔmba a ɛwie ${last4Spaced} no ho. Sɛ wopɛ sɛ wokɔ so a, mia baako (1). Sɛ wopɛ sɛ wosesa nɔmba no a, mia mmienu (2).`;
  } else {
    readbackPrompt = resolution.verified
      ? `You are about to send money to ${nameSpoken}, whose phone number ends with ${last4Spaced}. To confirm this recipient, press 1. To re-enter, press 2.`
      : `Warning: The recipient name for phone number ending with ${last4Spaced} could not be verified in the subscriber directory. To proceed with this number, press 1. To re-enter, press 2.`;
  }

  const xml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/recipient-verify-choice?sessionId=${sessionId}&amp;lang=${lang}">
        <Say voice="female">${readbackPrompt}</Say>
    </GetDigits>`;

  xmlResponse(res, xml);
});

ivrRouter.all("/recipient-verify-choice", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (dtmf === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (dtmf === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${session.recipientPhone || ""}</Redirect>`);
  }
  if (dtmf === "2") {
    // Re-enter recipient number
    session.retryCount = 0;
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (dtmf === "1") {
    // Confirmed recipient -> proceed to amount input
    session.retryCount = 0;
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  // Invalid key at recipient confirmation
  session.retryCount = (session.retryCount || 0) + 1;
  const decision = ivrDecisionEngine.decide({
    stepId: "recipient-verify-choice",
    language: lang,
    input: dtmf,
    inputMethod: "keypad",
    retryCount: session.retryCount,
    sessionId,
  });
  if (decision.action === "hangup") {
    transactionStateMachine.transition(sessionId, "FAILED", { failureReason: decision.reason });
    return xmlResponse(res, `    <Say voice="female">${decision.replyText}</Say>\n    <Reject/>`, decision);
  }
  return xmlResponse(
    res,
    `    <Say voice="female">${decision.replyText}</Say>\n    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;err=invalid</Redirect>`,
    decision
  );
});

// ── Step 8: Amount Input ──────────────────────────────────────────────
ivrRouter.all("/enter-amount", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);
  const audioUrl = `${baseUrl}${resolvePrompt("enter_amount", lang)}`;

  // 30 second window with star for pesewas
  const xml = `    <GetDigits timeout="30" finishOnKey="#" numDigits="8" callbackUrl="${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="8" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-amount&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  xmlResponse(res, xml);
});

// ── Step 9: Amount Verification & Routing to Safe Confirmation ────────
ivrRouter.all("/verify-amount", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const rawDigits = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim().replace(/#+$/, "");
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (rawDigits === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (rawDigits === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (rawDigits === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  const amountValidation = parseAndValidateAmount(rawDigits);
  if (!amountValidation.valid || amountValidation.amount === undefined) {
    session.retryCount = (session.retryCount || 0) + 1;
    const decision = ivrDecisionEngine.decide({
      stepId: "enter-amount",
      language: lang,
      input: rawDigits,
      inputMethod: "keypad",
      retryCount: session.retryCount,
      sessionId,
    });
    auditLogger.log("warn", "TELEPHONY", `Invalid amount entered: "${rawDigits}" (${decision.reason})`, sessionId);
    if (decision.action === "hangup") {
      transactionStateMachine.transition(sessionId, "FAILED", { failureReason: decision.reason });
      return xmlResponse(res, `    <Say voice="female">${decision.replyText}</Say>\n    <Reject/>`, decision);
    }
    const audioUrl = `${baseUrl}${resolvePrompt("enter_amount", lang)}`;
    return xmlResponse(
      res,
      `    <Say voice="female">${decision.replyText}</Say>\n    <GetDigits timeout="25" finishOnKey="#" numDigits="6" callbackUrl="${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}&amp;ref=/enter-amount&amp;err=invalid">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
      decision
    );
  }

  session.retryCount = 0;
  // Transition state machine to AMOUNT_ENTERED
  transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", {
    amount: amountValidation.amount,
  });

  xmlResponse(res, `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
});

// ── Step 10: Safe Confirmation (DYNAMIC READBACK) ─────────────────────
// CRITICAL: NEVER plays static 500 GHS audio. Generates dynamic VoiceXML for caller's exact inputs!
ivrRouter.all("/safe-confirmation", async (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (!session.amount || !session.recipientPhone) {
    const promptText = lang === "twi"
      ? "Sika no ano anaa nipa no fon nɔma nni hɔ yie. Mepa wo kyɛw, san hyɛ aseɛ bio."
      : "Transfer amount or recipient number is missing. Please restart.";
    return xmlResponse(res, `<Say>${promptText}</Say><Redirect>${baseUrl}/voice-menu?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  const amount = session.amount;
  const recipientPhone = session.recipientPhone;
  const recipientName = session.recipientName;
  const isVerified = session.isRecipientVerified;

  const callbackUrl = `${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}`;

  const { spokenText } = buildSafeConfirmationPrompt({
    language: lang,
    amount,
    currency: session.currency || "GHS",
    recipientPhone,
    recipientName,
    isVerified,
    callbackUrl,
  });

  auditLogger.log("info", "TELEPHONY", `Dynamic safe confirmation generated: "${spokenText}"`, sessionId);

  // Attempt server-side neural TTS for high-fidelity speech on telephony trunk
  let audioPlaySnippet = `<Say voice="female">${spokenText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Say>`;
  try {
    const { variableSpeechService } = await import("../audio/variableSpeechService");
    const { dynamicAudioStore } = await import("../audio/dynamicAudioStore");
    const speechRes = await variableSpeechService.generateSpeech({
      mode: "SYNTHESIZE",
      language: lang,
      text: spokenText,
      purpose: "AMOUNT_READBACK",
      metadata: {
        amount,
        currency: session.currency || "GHS",
        recipientPhone,
        recipientName,
        isVerified,
        referenceId: session.referenceId,
        isDemoFixture: session.isRecipientVerified && !recipientResolver.isLiveConfigured?.(),
      },
    });

    if (speechRes.audioBuffer && speechRes.audioBuffer.length > 64) {
      const audioId = dynamicAudioStore.store(
        speechRes.audioBuffer,
        speechRes.audioMimeType || "audio/wav",
        spokenText,
        lang
      );
      audioPlaySnippet = `<Play url="${baseUrl}/audio/dynamic/${audioId}"/>`;
    }
  } catch (err: any) {
    auditLogger.log("warn", "TELEPHONY", `Telephony dynamic TTS synthesis fallback to <Say>: ${err?.message || err}`, sessionId);
  }

  const voiceXml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">
        ${audioPlaySnippet}
    </GetDigits>`;

  xmlResponse(res, voiceXml);
});

// ── Step 11: Safe Outcome & Zero-PIN Handset Handoff ───────────────────
// CRITICAL: Never records or transmits PINs. Dispatches RequestToPay to handset and speaks dynamic receipt.
ivrRouter.all("/safe-outcome", async (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (dtmf === "2") {
    // Re-enter recipient number and amount
    session.retryCount = 0;
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  if (dtmf === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  if (dtmf === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    const exitMsg = lang === "twi"
      ? "Yɛatwa mu. Sika biara mfirii wo account mu. Nante yie."
      : "Transaction cancelled. No money has been deducted from your account. Goodbye.";
    return xmlResponse(res, `    <Say voice="female">${exitMsg}</Say>\n    <Reject/>`);
  }

  if (dtmf !== "1") {
    session.retryCount = (session.retryCount || 0) + 1;
    const decision = ivrDecisionEngine.decide({
      stepId: "safe-confirmation",
      language: lang,
      input: dtmf,
      inputMethod: "keypad",
      retryCount: session.retryCount,
      sessionId,
    });
    const audioUrl = `${baseUrl}${resolvePrompt("safe_confirmation", lang)}`;
    return xmlResponse(
      res,
      `    <Say voice="female">${decision.replyText}</Say>\n    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
      decision
    );
  }

  // 1 = CONFIRMED: initiate real Zero-PIN handoff to handset
  try {
    if (!session.amount || session.amount <= 0) {
      transactionStateMachine.transition(sessionId, "FAILED", {
        failureReason: "Missing or invalid amount entered.",
      });
      const errorMsg = lang === "twi"
        ? "Yɛantumi anhu sika dodow a wobɔe no. Yɛtwa mu. Nante yie."
        : "Missing transaction amount. The transaction has been cancelled. Goodbye.";
      return xmlResponse(res, `    <Say voice="female">${errorMsg}</Say>\n    <Reject/>`);
    }

    if (!session.callerPhone || !session.callerPhone.trim()) {
      transactionStateMachine.transition(sessionId, "FAILED", {
        failureReason: "Missing verified caller phone number from telephony webhook.",
      });
      const errorMsg = lang === "twi"
        ? "Yɛantumi anhu wo fon nɔmba a wode frɛe no. Yɛtwa mu. Nante yie."
        : "Unverified caller phone number. The transaction has been cancelled for security. Goodbye.";
      return xmlResponse(res, `    <Say voice="female">${errorMsg}</Say>\n    <Reject/>`);
    }

    if (!session.recipientPhone || !session.recipientPhone.trim()) {
      transactionStateMachine.transition(sessionId, "FAILED", {
        failureReason: "Missing recipient phone number.",
      });
      const errorMsg = lang === "twi"
        ? "Yɛantumi anhu obi a woremane no sika no fon nɔmba. Yɛtwa mu. Nante yie."
        : "Missing recipient phone number. The transaction has been cancelled. Goodbye.";
      return xmlResponse(res, `    <Say voice="female">${errorMsg}</Say>\n    <Reject/>`);
    }

    const velocityCheck = durableTransactionStore.checkVelocityLimits(
      session.callerPhone,
      session.recipientPhone,
      session.amount
    );
    if (!velocityCheck.allowed) {
      transactionStateMachine.transition(sessionId, "FAILED", {
        failureReason: velocityCheck.reason,
      });
      const errorMsg = lang === "twi"
        ? `Ntotoe ahobammbɔ kɔkɔbɔ: ${velocityCheck.reason || "Woaboro sika ano hyeɛ so."} Nante yie.`
        : `Security limit reached: ${velocityCheck.reason || "Transaction limit exceeded."} Goodbye.`;
      return xmlResponse(res, `    <Say voice="female">${errorMsg}</Say>\n    <Reject/>`);
    }

    durableTransactionStore.recordVelocityAttempt(
      session.callerPhone,
      session.recipientPhone,
      session.amount
    );

    transactionStateMachine.transition(sessionId, "CONFIRMED");

    const isSimulated = sessionId.startsWith("SIM_CALL_") || (req.baseUrl && req.baseUrl.startsWith("/api/simulator"));
    let collectionRef = session.referenceId;
    let mode = "SIMULATOR";

    if (!isSimulated) {
      const paymentResult = await voicePaymentService.initiatePayment(session.callerPhone, session.amount);
      collectionRef = paymentResult.fields.referenceId || session.referenceId;
      mode = paymentResult.momoEnv === "production" ? "LIVE" : "SANDBOX";
    }

    transactionStateMachine.transition(sessionId, "PIN_PENDING", {
      momoReferenceId: collectionRef,
    });

    auditLogger.log(
      "info",
      "MOMO",
      `Payment handoff dispatched (Mode: ${mode}, Ref: ${session.referenceId}, MoMoRef: ${collectionRef})`,
      sessionId
    );

    // Build pending authorization message with canonical reference
    const { spokenText: handoffNotice } = buildReceiptPrompt({
      language: lang,
      amount: session.amount,
      currency: session.currency || "GHS",
      recipientPhone: session.recipientPhone,
      recipientName: session.recipientName,
      referenceId: session.referenceId,
      timestamp: new Date(),
      status: "PENDING",
    });

    let handoffAudioSnippet = `<Say voice="female">${handoffNotice.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Say>`;
    try {
      const { variableSpeechService } = await import("../audio/variableSpeechService");
      const { dynamicAudioStore } = await import("../audio/dynamicAudioStore");
      const speechRes = await variableSpeechService.generateSpeech({
        mode: "SYNTHESIZE",
        language: lang,
        text: handoffNotice,
        purpose: "TRANSACTION_STATUS",
        metadata: {
          amount: session.amount,
          currency: session.currency || "GHS",
          recipientPhone: session.recipientPhone,
          recipientName: session.recipientName,
          referenceId: session.referenceId,
          status: "PENDING",
        },
      });

      if (speechRes.audioBuffer && speechRes.audioBuffer.length > 64) {
        const audioId = dynamicAudioStore.store(
          speechRes.audioBuffer,
          speechRes.audioMimeType || "audio/wav",
          handoffNotice,
          lang
        );
        handoffAudioSnippet = `<Play url="${baseUrl}/audio/dynamic/${audioId}"/>`;
      }
    } catch {
      // Graceful fallback to VoiceXML <Say>
    }

    const xml = `    ${handoffAudioSnippet}\n    <Reject/>`;

    xmlResponse(res, xml);
  } catch (err: any) {
    auditLogger.log("error", "MOMO", `Handoff execution failed: ${err.message}`, sessionId);
    transactionStateMachine.transition(sessionId, "FAILED", {
      failureReason: err.message,
    });

    const errorMsg = lang === "twi"
      ? "Fakyɛ yɛn, sika no antumi ankɔ. Yɛsrɛ wo, bɔ mmɔden biom akyire yi."
      : "We are sorry, your transfer could not be initiated at this time. Please try again later.";
    xmlResponse(res, `    <Say voice="female">${errorMsg}</Say>\n    <Reject/>`);
  }
});

// ── Speech Recognition Fallback Handler ───────────────────────────────
ivrRouter.all("/speech-fallback", async (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || `call_${Date.now()}`) as string;
  const step = (req.query?.step || req.body?.step || "language-selection") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const provider = (req.query?.provider || req.body?.provider || "") as string;
  const phone = (req.query?.phone || req.body?.phone || "") as string;
  const name = (req.query?.name || req.body?.name || "") as string;
  const recordingUrl = (req.body?.RecordingUrl || req.body?.recordingURL || req.query?.RecordingUrl || "") as string;
  const directDtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const speechText = (req.body?.speechText || req.query?.speechText || "").trim() as string;
  const baseUrl = getBaseUrl(req);

  // If user pressed key during recording
  if (directDtmf) {
    if (step === "language-selection") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?sessionId=${sessionId}&amp;dtmfDigits=${directDtmf}</Redirect>`);
    }
    if (step === "provider-select" || step === "provider-choice") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/provider-choice?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${directDtmf}</Redirect>`);
    }
    if (step === "enter-recipient") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${directDtmf}</Redirect>`);
    }
    if (step === "enter-amount") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${directDtmf}</Redirect>`);
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/${step}?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${directDtmf}</Redirect>`);
  }

  // Transcribe spoken audio or read speechText
  let transcript = "";
  let confidence = 0;
  let pinDiscarded = false;

  if (speechText) {
    transcript = speechText;
    confidence = 0.95;
  } else if (recordingUrl) {
    try {
      const stt = await speechToText(recordingUrl, undefined, step);
      transcript = stt.text;
      confidence = stt.confidence;
      pinDiscarded = Boolean(stt.pinDiscarded);
    } catch (err: any) {
      auditLogger.log("warn", "NLU", `STT error: ${err.message}`, sessionId);
    }
  }

  // If PIN was spoken, discard instantly and return directly to DTMF re-prompt
  if (pinDiscarded) {
    auditLogger.log("warn", "SECURITY", "Spoken PIN pattern intercepted in speech callback. Discarded immediately.", sessionId);
    if (step === "enter-recipient") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
    }
    if (step === "enter-amount") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/voice-menu?sessionId=${sessionId}</Redirect>`);
  }

  const clean = transcript.toLowerCase().trim();

  // Navigation commands in speech
  if (/\b(go back|previous|back|san akyi|san)\b/i.test(clean)) {
    if (step === "enter-recipient") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/action-select?sessionId=${sessionId}&amp;lang=${lang}${provider ? `&amp;provider=${provider}` : ""}</Redirect>`);
    }
    if (step === "safe-confirmation") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}${provider ? `&amp;provider=${provider}` : ""}${phone ? `&amp;phone=${encodeURIComponent(phone)}` : ""}${name ? `&amp;name=${encodeURIComponent(name)}` : ""}</Redirect>`);
    }
    if (step === "service-select") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?sessionId=${sessionId}</Redirect>`);
    }
    if (step === "action-select") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/provider-select?sessionId=${sessionId}&amp;lang=${lang}${provider ? `&amp;provider=${provider}` : ""}</Redirect>`);
    }
    if (step === "provider-select" || step === "provider-choice") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/service-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
    }
  }

  // Precedence: balance inquiry at action-select
  if (step === "action-select" && /\b(balance|check balance|what's my balance|whats my balance|my balance)\b/i.test(clean)) {
    return xmlResponse(res, `    <Redirect>${baseUrl}/action-choice?sessionId=${sessionId}&amp;lang=${lang}${provider ? `&amp;provider=${provider}` : ""}&amp;dtmfDigits=2</Redirect>`);
  }

  // Colloquial language selection mappings
  if (step === "language-selection") {
    if (/\b(one and a bar|p one|p 1|one|baako|bako|english|1)\b/i.test(clean)) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?sessionId=${sessionId}&amp;dtmfDigits=1</Redirect>`);
    }
    if (/\b(two and a bar|p two|p 2|two|mmienu|mienu|twi|2)\b/i.test(clean)) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?sessionId=${sessionId}&amp;dtmfDigits=2</Redirect>`);
    }
  }

  // Colloquial provider selection mappings
  if (step === "provider-select" || step === "provider-choice") {
    if (/\b(p 2|p two|telecel|vodafone|voda|2)\b/i.test(clean)) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/provider-choice?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=2</Redirect>`);
    }
    if (/\b(p 1|p one|mtn|1)\b/i.test(clean)) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/provider-choice?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=1</Redirect>`);
    }
    if (/\b(p 3|p three|airteltigo|at|3)\b/i.test(clean)) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/provider-choice?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=3</Redirect>`);
    }
  }

  // Confidence check: Low confidence speech (<0.75) falls back closed to DTMF re-prompt, never guesses
  if (!transcript || transcript === "empty" || confidence < 0.75) {
    auditLogger.log("info", "NLU", `Low-confidence speech (${confidence}), falling back closed to DTMF keypad`, sessionId);
    if (step === "language-selection") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?sessionId=${sessionId}</Redirect>`);
    }
    if (step === "enter-recipient") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
    }
    if (step === "enter-amount") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
    }
  }

  // Universal cancel or exit
  if (/\b(cancel|stop|abort|quit|exit|gyae|hwee)\b/i.test(clean)) {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Transaction cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }

  // Confirmation steps (safe-confirmation or recipient-verify-choice)
  if (step === "safe-confirmation" || step === "recipient-verify-choice") {
    const isAffirmative = /\b(yes|confirm|aane|ampa|yie|ɛyɛ|proceed|kɔ so|okay|one|baako|1)\b/i.test(clean);
    const isNegative = /\b(no|dabi|sesa|change|repeat|san|back|two|mmienu|2)\b/i.test(clean);

    if (isAffirmative) {
      const targetUrl = step === "safe-confirmation"
        ? `${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=1`
        : `${baseUrl}/recipient-verify-choice?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=1`;
      return xmlResponse(res, `    <Redirect>${targetUrl}</Redirect>`);
    }
    if (isNegative) {
      const targetUrl = step === "safe-confirmation"
        ? `${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=2`
        : `${baseUrl}/recipient-verify-choice?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=2`;
      return xmlResponse(res, `    <Redirect>${targetUrl}</Redirect>`);
    }
  }

  // ── Cognitive IVR Decision Engine for Spoken Input ──
  const ivrDecision = ivrDecisionEngine.decide({
    stepId: step,
    language: lang,
    input: transcript,
    inputMethod: "speech",
    retryCount: 0,
    sessionId,
  });

  // A) Understood Intent: e.g. "send money" -> move to enter-recipient
  if (ivrDecision.type === "understood_intent") {
    if (ivrDecision.action === "advance") {
      if (ivrDecision.nextStep === "enter-recipient") {
        const audioUrl = `${baseUrl}${resolvePrompt("enter_recipient", lang)}`;
        return xmlResponse(
          res,
          `    <Say voice="female">${ivrDecision.replyText}</Say>\n    <GetDigits timeout="40" finishOnKey="#" numDigits="10" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
          ivrDecision
        );
      }
      if (ivrDecision.nextStep === "enter-amount") {
        const audioUrl = `${baseUrl}${resolvePrompt("enter_amount", lang)}`;
        return xmlResponse(
          res,
          `    <Say voice="female">${ivrDecision.replyText}</Say>\n    <GetDigits timeout="25" finishOnKey="#" numDigits="6" callbackUrl="${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
          ivrDecision
        );
      }
      if (ivrDecision.nextStep === "safe-confirmation") {
        return xmlResponse(
          res,
          `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`,
          ivrDecision
        );
      }
      if (ivrDecision.nextStep === "recipient-verify-choice" && ivrDecision.updatedSlots?.recipientPhone) {
        return xmlResponse(
          res,
          `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${ivrDecision.updatedSlots.recipientPhone}</Redirect>`,
          ivrDecision
        );
      }
    }
  }

  // B) Unsupported: e.g. banking, crypto, loans, or balance inquiry
  if (ivrDecision.type === "unsupported") {
    return xmlResponse(
      res,
      `    <Say voice="female">${ivrDecision.replyText}</Say>\n    <Reject/>`,
      ivrDecision
    );
  }

  // C) Clarify: e.g. "repeat", "what did you say"
  if (ivrDecision.type === "clarify") {
    const promptKey = ivrDecision.promptReplayKey || "service_select";
    const audioUrl = `${baseUrl}${resolvePrompt(promptKey, lang)}`;
    const callbackStep = step === "service-select" ? "service-choice" : step === "provider-select" ? "provider-choice" : "action-choice";
    return xmlResponse(
      res,
      `    <Say voice="female">${ivrDecision.replyText}</Say>\n    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/${callbackStep}?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
      ivrDecision
    );
  }

  // D) Invalid choice at recipient step: e.g. invalid phone number spoken
  if (step === "enter-recipient" && ivrDecision.type === "invalid_choice") {
    const audioUrl = `${baseUrl}${resolvePrompt("enter_recipient", lang)}`;
    return xmlResponse(
      res,
      `    <Say voice="female">${ivrDecision.replyText}</Say>\n    <GetDigits timeout="40" finishOnKey="#" numDigits="10" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">\n        <Play url="${audioUrl}"/>\n    </GetDigits>`,
      ivrDecision
    );
  }

  // Spoken recipients and amounts fallback
  if (step === "enter-recipient") {
    const cleanDigits = clean.replace(/[^0-9]/g, "");
    if (cleanDigits.length === 10) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${cleanDigits}</Redirect>`);
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  if (step === "enter-amount") {
    const amt = extractAmount(clean);
    const digitsOnly = amt !== null ? String(amt) : clean.replace(/[^0-9]/g, "");
    if (digitsOnly.length > 0 && digitsOnly.length <= 5) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${digitsOnly}</Redirect>`);
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  xmlResponse(res, `    <Redirect>${baseUrl}/${step || "voice-menu"}?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
});

// ── Step 12: Cognitive IVR Understand Endpoint ───────────────────────
ivrRouter.post("/api/ivr/understand", async (req: Request, res: Response) => {
  const { utterance, currentStep, callState, sessionId } = req.body || {};
  const text = typeof utterance === "string" ? utterance.trim() : "";
  const step = typeof currentStep === "string" ? currentStep : "welcome";
  const lang = (callState?.lang || req.body?.language || "en") as "en" | "twi";
  const sid = (sessionId || req.body?.sessionId || callState?.sessionId) as string;

  const decision = ivrDecisionEngine.decide({
    stepId: step,
    language: lang,
    input: text,
    inputMethod: "speech",
    sessionId: sid,
  });

  auditLogger.log("info", "IVR_BRAIN", `Cognitive decision: ${decision.type} (${decision.reason})`, sid);

  // If slots were gathered, persist them to session
  if (sid && decision.updatedSlots) {
    const session = transactionStateMachine.getOrCreateSession(sid);
    if (decision.updatedSlots.amount !== undefined) session.amount = decision.updatedSlots.amount;
    if (decision.updatedSlots.recipientPhone) session.recipientPhone = decision.updatedSlots.recipientPhone;
    if (decision.updatedSlots.recipientName) session.recipientName = decision.updatedSlots.recipientName;
    if (decision.updatedSlots.network) session.network = decision.updatedSlots.network;
  }

  const promptAudioUrl = decision.promptReplayKey ? resolvePrompt(decision.promptReplayKey, lang) : null;

  return res.json({
    type: decision.type,
    reason: decision.reason,
    replyText: decision.replyText,
    replyKey: decision.replyKey,
    nextStep: decision.nextStep,
    action: decision.action,
    slots: decision.updatedSlots,
    promptKey: decision.promptReplayKey,
    promptAudio: promptAudioUrl,
    promptText: decision.replyText,
    // Backwards-compatible mappings for client simulator interpreter
    targetStep: decision.nextStep,
  });
});

// Telephony voice routes with Africa's Talking webhook verification
voiceRouter.use(ivrRouter);

// Simulator router behind dashboard adminAuth with simulated session
simulatorRouter.use(adminRateLimiter);
simulatorRouter.use(requireAdminAuth);
simulatorRouter.use((req: Request, _res: Response, next: NextFunction) => {
  if (!req.body || typeof req.body !== "object") {
    req.body = {};
  }
  if (!req.body.sessionId && !req.query?.sessionId) {
    req.body.sessionId = `SIM_CALL_${Date.now()}`;
  }
  if (!req.body.callerNumber && !req.query?.callerNumber) {
    req.body.callerNumber = "+233244123456";
  }
  if (!req.body.phoneNumber && !req.query?.phoneNumber) {
    req.body.phoneNumber = req.body.callerNumber;
  }
  if (req.body.isActive === undefined && req.query?.isActive === undefined) {
    req.body.isActive = "1";
  }
  if (!req.body.direction && !req.query?.direction) {
    req.body.direction = "Inbound";
  }
  next();
});
simulatorRouter.use(ivrRouter);
