/**
 * Ɔkwankyerɛfo Pa - Africa's Talking Telephony Voice Webhook Routes
 * 
 * Implements the voice call state transitions with:
 * 1. Dynamic safe confirmation readback (validated amount, recipient name/warning, and all ten phone digits).
 * 2. Real recipient resolution via provider interface.
 * 3. Zero-PIN USSD screen push handoff.
 * 4. Universal keypad grammar (#, *, 8, 9, 0).
 * 5. Strict language isolation (English and Akan Twi).
 */

import { Router, Request, Response, NextFunction } from "express";
import { config } from "../config/env";
import { recipientResolver } from "../providers/recipient/RecipientResolver";
import { parseAndValidateAmount, validateGhanaPhoneNumber, normalizeGhanaPhoneNumber, redactPii } from "../domain/validation";
import { transactionStateMachine } from "../domain/stateMachine";
import { buildSafeConfirmationPrompt, buildReceiptPrompt, formatFullPhoneNumberForSpeech } from "../audio/dynamicPromptBuilder";
import { isSpokenPinPattern, speechToText } from "../modules/sttService";
import { mtnMomoService } from "../modules/mtnMomoService";
import { auditLogger } from "../services/auditLogger";
import { verifyAtWebhook } from "../providers/telephony/webhookGuard";
import { paymentSaga } from "../integrations/momo/paymentSaga";
import { durableTransactionStore } from "../services/durableTransactionStore";
import { telephonyRateLimiter, adminRateLimiter } from "../middleware/rateLimiter";
import { requireAdminAuth } from "../middleware/adminAuth";
import { aiSystem } from "../ai_system";
import { brain } from "../ai_system/brain/brain";
import { resolvePrompt, resolvePromptText, resolvePromptXml } from "../modules/ttsService";
import {
  isDynamicPrompt,
  resolvePromptSpokenText,
  resolveCanonicalAudioUrl,
  getCanonicalPrompt,
  STATE_TO_CANONICAL_PROMPT_ID,
} from "../audio/canonicalRegistry";
import { extractAmount, extractRecipient, extractNetwork } from "../modules/nluService";
import { getStepDefinition, validateKeypadInput } from "../domain/stepRegistry";
import { SERVICE_CAPABILITIES, SUPPORTED_TRANSFER_NETWORKS } from "../domain/serviceCapabilities";
import { ivrDecisionEngine, IvrDecision } from "../ai_system/brain/ivrDecisionEngine";
import { geminiClient } from "../services/geminiClient";
import { speechNormalizer } from "../ai_system/speech/speechNormalizer";
import { storeGeminiConversationReply } from "../audio/geminiAudioMatcher";

export const voiceRouter = Router();
export const ivrRouter = Router();
export const simulatorRouter = Router();

interface RecipientLookupEntry {
  phone: string;
  promise: ReturnType<typeof recipientResolver.resolve>;
  result?: Awaited<ReturnType<typeof recipientResolver.resolve>>;
}

const recipientLookups = new WeakMap<object, RecipientLookupEntry>();
const paymentInitiations = new WeakSet<object>();

function resolveRecipientWithTimeout(phone: string): ReturnType<typeof recipientResolver.resolve> {
  let timeout: NodeJS.Timeout | undefined;
  return Promise.race([
    recipientResolver.resolve(phone),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Recipient lookup timed out.")), 5000);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function resolveRecipientOnce(session: object, phone: string): Promise<RecipientLookupEntry> {
  const existing = recipientLookups.get(session);
  if (existing?.phone === phone) {
    if (existing.result) return existing;
    existing.result = await existing.promise;
    return existing;
  }

  const entry: RecipientLookupEntry = {
    phone,
    promise: resolveRecipientWithTimeout(phone),
  };
  recipientLookups.set(session, entry);
  try {
    entry.result = await entry.promise;
    return entry;
  } catch (error) {
    if (recipientLookups.get(session) === entry) recipientLookups.delete(session);
    throw error;
  }
}

const TELEPHONY_ROUTES = new Set([
  "/voice-menu",
  "/voice",
  "/voice/callback",
  "/voice/webhook",
  "/voice-callback",
  "/callback",
  "/telephony/callback",
  "/api/voice",
  "/api/voice/callback",
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
  "/enter-pin",
  "/verify-pin",
  "/speech-fallback",
]);

// Apply rate limiting & Africa's Talking webhook verification strictly to telephony routes
voiceRouter.use((req: Request, res: Response, next) => {
  if (TELEPHONY_ROUTES.has(req.path)) {
    return telephonyRateLimiter(req, res, () => verifyAtWebhook(req, res, () => {
      const dtmf = req.body?.dtmfDigits ?? req.query?.dtmfDigits;
      const sessionId = req.body?.sessionId ?? req.query?.sessionId;
      if (typeof dtmf === "string" && dtmf.length > 0 && typeof sessionId === "string" && sessionId.length > 0) {
        const safeDtmf = (req.path.includes("pin") || dtmf.length === 4)
          ? "****"
          : dtmf.length >= 9 && /^\d+$/.test(dtmf)
          ? `${dtmf.slice(0, 3)}****${dtmf.slice(-3)}`
          : dtmf;
        // Run AI telemetry observation in background without blocking response latency
        aiSystem.process({
          sessionId,
          channel: "DTMF",
          input: safeDtmf,
          language: req.query?.lang === "twi" || req.body?.lang === "twi" ? "tw" : "unknown",
          currentScreen: "TELEPHONY",
          currentStep: req.path.slice(1),
          executionPolicy: "UNDERSTAND_ONLY",
        }).catch(() => {
          auditLogger.log("warn", "AI", "Canonical keypad understanding unavailable; using guarded IVR flow.", sessionId);
        });
      }
      next();
    }));
  }
  return next();
});

function toSafeHeaderValue(val: unknown): string {
  if (val === undefined || val === null) return "";
  const str = String(val).replace(/[\r\n]+/g, " ").trim();
  // URI-encode if any non-ASCII or control characters exist so Node.js HTTP never throws ERR_INVALID_CHAR
  if (/[^\x20-\x7E]/.test(str)) {
    return encodeURIComponent(str);
  }
  return str;
}

function escapeVoiceXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function redactSpeechForDiagnostics(text: string): string {
  return text
    .replace(/\b(0[235]\d{8}|233[235]\d{8})\b/g, "[PHONE]")
    .replace(/\b(?:\d[\s-]*){9,12}\b/g, "[PHONE]")
    .replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)(?:[\s,-]+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)){6,}\b/gi, "[PHONE]")
    .replace(/\b(to|for|ma)\s+(?:(?:my|the)\s+)?[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2}/gi, "$1 [RECIPIENT]")
    .replace(/\b\d+(?:\.\d{1,2})?\b/g, "[NUMBER]")
    .slice(0, 180);
}

function brainPromptElement(promptId: string | undefined, replyText: string, baseUrl: string, language: "en" | "twi"): string {
  const promptPath = promptId ? resolvePrompt(promptId, language) : null;
  if (promptPath) {
    return `<Play url="${escapeVoiceXml(`${baseUrl}${promptPath}`)}"/>`;
  }
  const scriptText = promptId ? resolvePromptText(promptId, language) : null;
  if (scriptText) {
    return `<Say voice="female">${escapeVoiceXml(scriptText)}</Say>`;
  }
  return `<Say voice="female">${escapeVoiceXml(replyText)}</Say>`;
}

function canonicalPromptElement(
  promptKey: string,
  language: "en" | "twi",
  baseUrl: string,
  fallbackText: string
): string {
  return resolvePromptXml(promptKey, language, baseUrl, fallbackText)
    || `<Say voice="female">${escapeVoiceXml(fallbackText)}</Say>`;
}

function speechCollectionXml(params: {
  baseUrl: string;
  sessionId: string;
  language: "en" | "twi";
  slot: "recipient" | "amount" | "conversational" | "safe-confirmation";
  replyText: string;
  promptId?: string;
}): string {
  const { baseUrl, sessionId, language, slot, replyText, promptId } = params;
  const query = new URLSearchParams({ sessionId, lang: language }).toString().replace(/&/g, "&amp;");
  const prompt = brainPromptElement(promptId, replyText, baseUrl, language);
  if (slot === "recipient") {
    return `    <GetDigits timeout="40" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?${query}">\n        ${prompt}\n    </GetDigits>\n    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="12" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-recipient&amp;${query}"/>`;
  }
  if (slot === "safe-confirmation") {
    return `    <GetDigits timeout="25" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/safe-outcome?${query}">\n        ${prompt}\n    </GetDigits>\n    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=safe-confirmation&amp;${query}"/>`;
  }
  if (slot === "conversational") {
    return `    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="10" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=conversational&amp;${query}">\n        ${prompt}\n    </Record>`;
  }
  return `    <GetDigits timeout="25" finishOnKey="#" callbackUrl="${baseUrl}/verify-amount?${query}">\n        ${prompt}\n    </GetDigits>\n    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="8" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-amount&amp;${query}"/>`;
}

function xmlResponse(res: Response, content: string, decision?: (Partial<IvrDecision> & Record<string, any>) | any): void {
  let xml = content;
  if (decision) {
    if (decision.type) res.set("X-AI-Decision-Type", toSafeHeaderValue(decision.type));
    res.set("X-AI-Decision-Reason", toSafeHeaderValue(decision.reason));
    res.set("X-AI-Reply-Text", toSafeHeaderValue(decision.replyText));
    res.set("X-AI-Reply-Key", toSafeHeaderValue(decision.replyKey));
    const promptId = decision.replyKey?.match(/^OP\d{2}$/i)?.[0]?.toUpperCase()
      || STATE_TO_CANONICAL_PROMPT_ID[decision.replyKey?.toUpperCase()]
      || decision.replyKey;
    if (promptId) {
      res.set("X-Canonical-Prompt-Id", toSafeHeaderValue(promptId));
    }
  }
  const req = (res.req || (res as any).socket?._httpMessage?.req) as Request | undefined;
  const responseSessionId = req?.body?.sessionId || req?.query?.sessionId;
  if (typeof responseSessionId === "string") {
    const session = transactionStateMachine.getSession(responseSessionId);
    res.set("X-Interaction-Mode", session?.interactionMode || "UNSELECTED");
    res.set("X-Conversation-State", session?.state || "INITIATED");
    if (!res.getHeader("X-Canonical-Prompt-Id") && session?.state && STATE_TO_CANONICAL_PROMPT_ID[session.state]) {
      res.set("X-Canonical-Prompt-Id", STATE_TO_CANONICAL_PROMPT_ID[session.state]);
    }
  }
  res.set(
    "Access-Control-Expose-Headers",
    "X-AI-Decision-Type, X-AI-Decision-Reason, X-AI-Reply-Text, X-AI-Reply-Key, X-Canonical-Prompt-Id, X-Conversation-State, X-Interaction-Mode, x-telephony-guard-reason"
  );
  const isSimulator = Boolean(
    res.locals?.isSimulator ||
    (req && (req.baseUrl?.startsWith("/api/simulator") || req.originalUrl?.includes("/api/simulator")))
  );
  if (isSimulator) {
    const base = req ? getBaseUrl(req) : "";
    const simulatorPrefix = "/api/simulator";
    xml = xml.replace(/(callbackUrl=["'])(https?:\/\/[^"'\s]+|\/[^"'\s]+)/gi, (match, attr, rawUrl) => {
      let clean = rawUrl;
      if (base && clean.startsWith(base)) {
        clean = clean.slice(base.length);
      } else if (clean.startsWith("http://") || clean.startsWith("https://")) {
        try {
          const u = new URL(clean);
          clean = u.pathname + u.search;
        } catch {}
      }
      if (!clean.startsWith(simulatorPrefix)) {
        clean = `${simulatorPrefix}${clean.startsWith("/") ? "" : "/"}${clean}`;
      }
      return `${attr}${clean}`;
    }).replace(/(<Redirect[^>]*>)(https?:\/\/[^<]+|\/[^<]+)(<\/Redirect>)/gi, (match, open, rawUrl, close) => {
      let clean = rawUrl.trim();
      if (base && clean.startsWith(base)) {
        clean = clean.slice(base.length);
      } else if (clean.startsWith("http://") || clean.startsWith("https://")) {
        try {
          const u = new URL(clean);
          clean = u.pathname + u.search;
        } catch {}
      }
      if (!clean.startsWith(simulatorPrefix)) {
        clean = `${simulatorPrefix}${clean.startsWith("/") ? "" : "/"}${clean}`;
      }
      return `${open}${clean}${close}`;
    });

    // Convert absolute audio URLs to relative /audio/... or /api/audio/... paths so browser can play them on any domain
    xml = xml.replace(/(<Play[^>]*url=["'])https?:\/\/[^\/"'\s]+(\/(?:api\/)?audio\/[^"']*)(["'])/gi, "$1$2$3")
             .replace(/(<Play[^>]*>)https?:\/\/[^\/"'\s]+(\/(?:api\/)?audio\/[^<]+)(<\/Play>)/gi, "$1$2$3");
  } else if (req && process.env.AT_WEBHOOK_SECRET) {
    const baseUrl = getBaseUrl(req);
    if (baseUrl) {
      const webhookSecret = process.env.AT_WEBHOOK_SECRET;
      const addWebhookSecret = (rawUrl: string): string => {
        const target = new URL(rawUrl.replace(/&amp;/g, "&"), baseUrl);
        if (target.origin !== new URL(baseUrl).origin) {
          return rawUrl;
        }
        target.searchParams.set("secret", webhookSecret);
        return target.toString().replace(/&/g, "&amp;");
      };

      xml = xml
        .replace(/(callbackUrl=["'])([^"']+)(["'])/gi, (_match, prefix, url, suffix) =>
          `${prefix}${addWebhookSecret(url)}${suffix}`
        )
        .replace(/(<Redirect[^>]*>)([^<]+)(<\/Redirect>)/gi, (_match, open, url, close) =>
          `${open}${addWebhookSecret(url)}${close}`
        );
    }
  }

  xml = xml.replace(/(<Say\b[^>]*\bvoice=["'])female(["'])/gi, "$1woman$2");
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
export const handleInboundCall = (req: Request, res: Response) => {
  const sessionId = (req.body?.sessionId || req.query?.sessionId || `call_${Date.now()}`) as string;
  const callerNumber = (req.body?.callerNumber || req.query?.callerNumber || req.body?.phoneNumber || "caller") as string;
  const isActive = req.body?.isActive ?? req.query?.isActive;
  const baseUrl = getBaseUrl(req);

  if (isActive === "0") {
    auditLogger.log("info", "TELEPHONY", `Call ended remotely`, sessionId);
    return xmlResponse(res, "");
  }

  auditLogger.log("info", "TELEPHONY", `Inbound call connected from ${redactPii(callerNumber)}`, sessionId);
  const reqLang = (req.body?.lang || req.query?.lang || req.body?.language || req.query?.language || "twi") as string;
  const initialLang = reqLang === "en" ? "en" : "twi";
  const session = transactionStateMachine.getOrCreateSession(sessionId, initialLang, "VOICE");
  session.callerPhone = callerNumber;
  session.language = initialLang;

  const defaultWelcomeUrl = `${baseUrl}/audio/Welcome_prompt_01.mp3`;
  const welcomeUrl = initialLang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/1.Welcome%20%26%20Session%20Start/Welcome%201%20(2).mp3`
    : `${baseUrl}/audio/Welcome_prompt_01.mp3`;

  const langSelectUrl = initialLang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/1.Welcome%20%26%20Session%20Start/Language%20selection.mp3`
    : `${baseUrl}/audio/Welcome_prompt_01.mp3`;

  const xml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/language-selection?sessionId=${sessionId}&amp;lang=${initialLang}">
        <Play url="${escapeVoiceXml(defaultWelcomeUrl)}"/>
        <Play url="${escapeVoiceXml(welcomeUrl)}"/>
        <Play url="${escapeVoiceXml(langSelectUrl)}"/>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=language-selection&amp;sessionId=${sessionId}&amp;lang=${initialLang}&amp;retry=0"/>`;

  xmlResponse(res, xml, {
    type: "understood_intent",
    reason: "Call connected - playing canonical OP01 Welcome prompt",
    replyText: initialLang === "twi"
      ? "Akwaaba wɔ Ɔkwankyerɛfo Pa mu, wo nne akwankyerɛ a ɛma mobile services yɛ mmerɛw ma obiara."
      : "Welcome to Ɔkwankyerɛfo Pa, your accessible voice guide for mobile services.",
    replyKey: "OP01",
    action: "repeat",
    nextStep: "language-selection",
  });
};

// Mount across canonical and all common Africa's Talking webhook callback aliases
const INBOUND_ENTRY_ROUTES = [
  "/voice-menu",
  "/voice",
  "/voice/callback",
  "/voice/webhook",
  "/voice-callback",
  "/callback",
  "/telephony/callback",
  "/api/voice",
  "/api/voice/callback",
];
ivrRouter.all(INBOUND_ENTRY_ROUTES, handleInboundCall);

// Intercept root POST requests from Africa's Talking when configured with root domain
ivrRouter.post("/", (req: Request, res: Response, next: NextFunction) => {
  const isTelephony = Boolean(
    req.body?.sessionId ||
    req.query?.sessionId ||
    req.body?.callerNumber ||
    req.query?.callerNumber ||
    req.body?.phoneNumber ||
    req.body?.isActive !== undefined ||
    req.body?.direction ||
    req.body?.callSessionState
  );
  if (isTelephony) {
    return handleInboundCall(req, res);
  }
  return next();
});

// ── Step 2: Language Selection ────────────────────────────────────────
ivrRouter.all("/language-selection", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || `call_${Date.now()}`) as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (!dtmf) {
    const prompt = canonicalPromptElement("language_selection", "en", baseUrl, "For English, press 1. For Twi, press 2.");
    const xml = `    <GetDigits timeout="8" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/language-selection?sessionId=${sessionId}">
        ${prompt}
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=language-selection&amp;sessionId=${sessionId}&amp;retry=0"/>`;
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

    const nextRoute = "service-select";
    const decision: IvrDecision = {
      type: "understood_intent",
      reason: `Language chosen: ${lang === "twi" ? "Twi" : "English"} (${dtmf})`,
      replyText: lang === "twi" ? "Paw wo network." : "Select your service.",
      replyKey: lang === "twi" ? "provider_select" : "supported_service_select",
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

  const serviceSelection2Url = lang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/2.Main%20Service%20Navigation/Service%20selection%202.mp3`
    : "";

  const promptElement = serviceSelection2Url
    ? `<Play url="${escapeVoiceXml(serviceSelection2Url)}"/>`
    : canonicalPromptElement(
        "supported_service_select",
        lang,
        baseUrl,
        resolvePromptText("supported_service_select", lang)
          || "For Mobile Money services, press 1. For other services, press 2. To exit, press 0."
      );

  const xml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">
      ${promptElement}
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
    if (!session.interactionMode && dtmf !== "0" && dtmf !== "8" && dtmf !== "9") {
      transactionStateMachine.transition(sessionId, session.state, { interactionMode: "GUIDED_IVR" });
    }
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
      session.serviceSelected = true;
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
    if (!session.serviceSelected && (dtmf === "2" || dtmf === "3")) {
      const decision: IvrDecision = {
        type: "unsupported",
        reason: "Banking and international services are currently unavailable in this pilot.",
        replyText: lang === "twi"
          ? "Sikakorabea dwumadie nni pilot yi mu. Sɛ wopɛ Mobile Money a, mia 1. Sɛ wopɛ sɛ wote options no bio a, mia 9."
          : "Banking is not supported in this pilot. Banking and international services are currently unavailable. For Mobile Money, press 1. To hear the options again, press 9.",
        replyKey: "service_unsupported",
        action: "replay",
        nextStep: "service-select",
        promptReplayKey: "supported_service_select",
      };
      return xmlResponse(
        res,
        `    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("supported_service_select", lang, baseUrl, decision.replyText)}\n    </GetDigits>`,
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
  return xmlResponse(
    res,
    `    <Say voice="female">${escapeVoiceXml(decision.replyText)}</Say>\n    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("supported_service_select", lang, baseUrl, decision.replyText)}\n    </GetDigits>`,
    decision
  );
});

// ── Step 4: Provider Selection (MTN, Telecel, AT) ─────────────────────
ivrRouter.all("/provider-select", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const xml = `    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/provider-choice?sessionId=${sessionId}&amp;lang=${lang}">
        ${canonicalPromptElement(
          "mtn_network_select",
          lang,
          baseUrl,
          resolvePromptText("mtn_network_select", lang) || "Only MTN Mobile Money transfers are currently supported. Press 1 for MTN."
        )}
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
      replyText: lang === "twi"
        ? "Sɛ wopɛ sɛ womane sika a mia 1. Sɛ wopɛ sɛ wohwɛ wo account a mia 2."
        : "To send money, press 1. To check your account, press 2.",
      replyKey: "action_select",
      action: "advance",
      nextStep: "action-select",
    };
    if (!SUPPORTED_TRANSFER_NETWORKS.includes(session.network)) {
      throw new Error(`Provider selected unsupported network ${session.network}`);
    }
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
  return xmlResponse(
    res,
    `    <Say voice="female">${escapeVoiceXml(decision.replyText)}</Say>\n    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/provider-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("mtn_network_select", lang, baseUrl, decision.replyText)}\n    </GetDigits>`,
    decision
  );
});

// ── Step 5: Supported Mobile Money Action ─────────────────────────────
ivrRouter.all("/action-select", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const mtnMenu1Url = lang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/2.Main%20Service%20Navigation/MTN%20menu%201.mp3`
    : "";

  const promptElement = mtnMenu1Url
    ? `<Play url="${escapeVoiceXml(mtnMenu1Url)}"/>`
    : canonicalPromptElement(
        "send_money_menu",
        lang,
        baseUrl,
        "To send money, press 1. To go back, press 8. To repeat, press 9, or press 0 to exit."
      );

  const xml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/action-choice?sessionId=${sessionId}&amp;lang=${lang}">
        ${promptElement}
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
  if (dtmf === "2" && !SERVICE_CAPABILITIES.checkBalance.available) {
    const unsupportedText = resolvePromptText("balance_inquiry_unsupported", lang)
      || "Balance checks are not available through this voice service.";
    return xmlResponse(
      res,
      `    <Say voice="female">${escapeVoiceXml(unsupportedText)}</Say>\n    <Reject/>`
    );
  }
  if (dtmf === "2" && SERVICE_CAPABILITIES.checkBalance.available) {
    throw new Error("Balance-check capability is enabled without a connected balance handler.");
  }
  const validation = validateKeypadInput(stepDef, dtmf, lang);

  if (validation.valid) {
    if (validation.isNavigation && validation.navAction === "cancel") {
      transactionStateMachine.transition(sessionId, "CANCELLED");
      const spoken =
        lang === "twi"
          ? "Yɛatwa mu. Frɛ no bɛtwa mu wɔ sɛkɛnd 7 mu. Sɛ wopɛ sɛ wohyɛ aseɛ foforɔ a, mia baako."
          : "Transaction ended. Waiting 7 seconds before exit. Press 1 to start a new transfer.";
      const navDecision: IvrDecision = {
        type: "understood_intent",
        reason: "Caller pressed 0 to cancel call.",
        replyText: spoken,
        replyKey: "cancelled_wait_exit",
        action: "hangup",
      };
      return xmlResponse(
        res,
        `    <Say voice="female">${spoken}</Say>\n    <GetDigits timeout="7" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/action-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        <Pause length="7"/>\n    </GetDigits>\n    <Reject/>`,
        navDecision
      );
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
  return xmlResponse(
    res,
    `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/action-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("send_money_menu", lang, baseUrl, decision.replyText)}\n    </GetDigits>`,
    decision
  );
});

ivrRouter.all("/enter-recipient", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const enterRecipient2Url = lang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/3.Recipient%20Entry%20%26%20Verification/Enter%20recipient%202.mp3`
    : "";

  const promptElement = enterRecipient2Url
    ? `<Play url="${escapeVoiceXml(enterRecipient2Url)}"/>`
    : canonicalPromptElement("enter_recipient", lang, baseUrl, "Please enter the recipient's ten-digit phone number, followed by hash.");

  // 40 second generous window for feature phone callers
  const xml = `    <GetDigits timeout="40" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">
        ${promptElement}
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
    const spoken =
      lang === "twi"
        ? "Yɛatwa mu. Frɛ no bɛtwa mu wɔ sɛkɛnd 7 mu. Sɛ wopɛ sɛ wohyɛ aseɛ foforɔ a, mia key biara na kɔ so."
        : "Transaction ended. Waiting 7 seconds before exit. Press any key to start a new transfer without repeating the whole menu.";
    return xmlResponse(
      res,
      `    <Say voice="female">${spoken}</Say>\n    <GetDigits timeout="7" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/exit-grace-choice?sessionId=${sessionId}&amp;lang=${lang}">\n        <Pause length="7"/>\n    </GetDigits>\n    <Reject/>`
    );
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
    auditLogger.log("warn", "TELEPHONY", `Invalid recipient phone entered: ${redactPii(rawDigits)} (${decision.reason})`, sessionId);
    if (decision.action === "hangup") {
      transactionStateMachine.transition(sessionId, "FAILED", { failureReason: decision.reason });
      return xmlResponse(res, `    <Say voice="female">${decision.replyText}</Say>\n    <Reject/>`, decision);
    }
    const invalidAudioUrl = resolvePrompt("invalid_recipient", lang);
    return xmlResponse(
      res,
      `    ${invalidAudioUrl ? `<Play url="${escapeVoiceXml(`${baseUrl}${invalidAudioUrl}`)}"/>` : `<Say voice="female">${escapeVoiceXml(decision.replyText)}</Say>`}\n    <GetDigits timeout="40" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("enter_recipient", lang, baseUrl, "Please enter the recipient's ten-digit phone number.")}\n    </GetDigits>`,
      decision
    );
  }

  session.retryCount = 0;

  const rawAmount = req.body?.amount ?? req.query?.amount;
  const amountValidation = rawAmount === undefined
    ? undefined
    : parseAndValidateAmount(String(rawAmount));
  if (rawAmount !== undefined && (!amountValidation?.valid || amountValidation.amount === undefined)) {
    const amountError = lang === "twi"
      ? "Sika dodow no nyɛ pɛpɛɛpɛ. Yɛsrɛ wo, bɔ sika dodow no bio."
      : "The amount could not be verified. Please enter the amount again.";
    return xmlResponse(res, `    <Say voice="female">${escapeVoiceXml(amountError)}</Say>\n    <Redirect>${getBaseUrl(req)}/enter-amount?sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}</Redirect>`);
  }

  // Resolve recipient using active provider (Sandbox or real MTN)
  let lookup: RecipientLookupEntry;
  try {
    lookup = await resolveRecipientOnce(session, phoneValidation.normalized);
  } catch {
    return xmlResponse(res, `    <Say voice="female">We could not verify that number right now. Please try again.</Say>\n    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (recipientLookups.get(session) !== lookup) {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  const resolution = lookup.result!;
  auditLogger.log(
    "info",
    "TELEPHONY",
    `Recipient lookup for ${redactPii(phoneValidation.normalized)}: verified=${resolution.verified}, name=${resolution.name || "NONE"} (${resolution.source})`,
    sessionId
  );

  // Transition state machine to RECIPIENT_VERIFIED
  transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
    recipientPhone: phoneValidation.normalized,
    recipientName: resolution.name,
    isRecipientVerified: resolution.verified,
    network: resolution.network,
    ...(amountValidation?.valid && amountValidation.amount !== undefined ? { amount: amountValidation.amount } : {}),
  });

  const fullPhoneSpoken = formatFullPhoneNumberForSpeech(phoneValidation.normalized, lang);
  const nameSpoken = resolution.name || (lang === "twi" ? `fon nɔmba ${fullPhoneSpoken}` : `subscriber ${fullPhoneSpoken}`);

  const useRecipient1Url = lang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/3.Recipient%20Entry%20%26%20Verification/Use%20recipient%201.m4a`
    : "";
  const recipientConfirmSpeechUrl = lang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/3.Recipient%20Entry%20%26%20Verification/Recipient%20confirm%20speech.m4a`
    : "";

  let verifyPrompt = "";
  const isCrossNetwork = session.network && resolution.network && session.network.toUpperCase() !== resolution.network.toUpperCase();

  if (isCrossNetwork) {
    if (lang === "twi") {
      verifyPrompt = `Nɔmba a wode mae no yɛ ${resolution.network} nɔmba a ne din ne ${nameSpoken}, nanso woreyɛ adwuma wɔ ${session.network} dwumadie mu. Wopɛ sɛ wokɔ so mane sika kɔ saa ${resolution.network} nɔmba yi so ara? Sɛ wopene so a, mia baako (1). Sɛ wosesa nɔmba no a, mia mmienu (2). Sɛ wogyae a, mia hwee (0).`;
    } else {
      verifyPrompt = `The number you provided is a ${resolution.network} number registered to ${nameSpoken}, but you started in the ${session.network} service. Do you want to continue sending money to this ${resolution.network} number? Press 1 to confirm, 2 to enter a different number, or 0 to exit.`;
    }
  } else if (lang === "twi") {
    verifyPrompt = `Obi a woremane no no din ne ${nameSpoken}. Ne phone nɔmba a ɛdi mũ ne ${fullPhoneSpoken}. Sɛ wopene so a mia baako (1). Sɛ wosesa a mia mmienu (2). Sɛ wogyae a mia hwee (0).`;
  } else {
    verifyPrompt = `The recipient's name is ${nameSpoken}. The full recipient phone number is ${fullPhoneSpoken}. Press 1 to confirm, 2 to re-enter, or 0 to exit.`;
  }

  // Audio 8 (Use Recipient 1) plays BEFORE Audio 7 (Recipient Confirm Speech)
  const xml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/recipient-verify-choice?sessionId=${sessionId}&amp;lang=${lang}">
        ${useRecipient1Url ? `<Play url="${escapeVoiceXml(useRecipient1Url)}"/>` : ""}
        ${recipientConfirmSpeechUrl ? `<Play url="${escapeVoiceXml(recipientConfirmSpeechUrl)}"/>` : ""}
        <Say voice="female">${escapeVoiceXml(verifyPrompt)}</Say>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="8" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=recipient-verify-choice&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  xmlResponse(res, xml);
});

// ── Step 7.5: Exit Grace Choice (7s wait -> start over transfer) ─────
ivrRouter.all("/exit-grace-choice", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  session.retryCount = 0;
  if (dtmf === "0") {
    // Explicit immediate hangup
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Nante yie." : "Goodbye."}</Say>\n    <Reject/>`);
  }

  // Any key pressed (1, 2, 8, 9, etc.) starts new transfer directly at recipient entry without repeating whole system!
  return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
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
    recipientLookups.delete(session);
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (dtmf === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${session.recipientPhone || ""}</Redirect>`);
  }
  if (dtmf === "2") {
    // Re-enter recipient number
    recipientLookups.delete(session);
    session.recipientPhone = null;
    session.recipientName = null;
    session.isRecipientVerified = false;
    session.retryCount = 0;
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  
  // If confirmed with 1, update session network to resolved recipient network if cross-network
  const activeLookup = recipientLookups.get(session);
  if (activeLookup?.result?.network) {
    session.network = activeLookup.result.network;
  }

  // If the caller entered an amount (e.g. 5, 10, 20, 50, 100...) or confirmed with 1
  const possibleAmt = parseAndValidateAmount(dtmf);
  if (possibleAmt.valid && possibleAmt.amount && possibleAmt.amount > 0 && dtmf !== "1") {
    session.retryCount = 0;
    return xmlResponse(res, `    <Redirect>${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${encodeURIComponent(dtmf)}</Redirect>`);
  }

  if (session.amount && session.amount > 0 && session.state === "RECIPIENT_VERIFIED") {
    transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", { amount: session.amount });
    return xmlResponse(res, `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  // Proceed directly to amount input, NEVER get stuck at recipient step
  session.retryCount = 0;
  return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
});

// ── Step 8: Amount Input ──────────────────────────────────────────────
ivrRouter.all("/enter-amount", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const amountPromptUrl = lang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/4.Amount%20Entry%20%26%20Verification/Amount%20prompt.mp3`
    : "";
  const enterAmount4Url = lang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/4.Amount%20Entry%20%26%20Verification/Enter%20amount%204.mp3`
    : "";

  // 30 second window with star for pesewas
  const xml = `    <GetDigits timeout="30" finishOnKey="#" callbackUrl="${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}">
        ${amountPromptUrl ? `<Play url="${escapeVoiceXml(amountPromptUrl)}"/>` : ""}
        ${enterAmount4Url ? `<Play url="${escapeVoiceXml(enterAmount4Url)}"/>` : canonicalPromptElement("enter_amount", lang, baseUrl, "Please enter the amount in Ghana Cedis.")}
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
    const invalidAudioUrl = resolvePrompt("invalid_amount", lang);
    return xmlResponse(
      res,
      `    ${invalidAudioUrl ? `<Play url="${escapeVoiceXml(`${baseUrl}${invalidAudioUrl}`)}"/>` : `<Say voice="female">${escapeVoiceXml(decision.replyText)}</Say>`}\n    <GetDigits timeout="25" finishOnKey="#" callbackUrl="${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}&amp;ref=/enter-amount&amp;err=invalid">\n        ${canonicalPromptElement("enter_amount", lang, baseUrl, "Please enter the amount in Ghana Cedis.")}\n    </GetDigits>`,
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
ivrRouter.all("/safe-confirmation", (req: Request, res: Response) => {
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

  const { spokenText, voiceXml } = buildSafeConfirmationPrompt({
    language: lang,
    amount,
    recipientPhone,
    recipientName,
    isVerified,
    callbackUrl,
  });

  auditLogger.log("info", "TELEPHONY", "Dynamic safe confirmation generated from validated session values.", sessionId);
  xmlResponse(res, voiceXml);
});

// ── Step 11b: PIN Handoff (Located between Step 11 and Step 12) ────────
// Supports keypad entry (waits for #) and ASR (proceeds right after 4th digit)
ivrRouter.all("/pin-handoff", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (dtmf === "2") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    const exitMsg = lang === "twi"
      ? "Yɛatwa adesrɛ no mu. Nante yie."
      : "Your request was cancelled. Goodbye.";
    return xmlResponse(res, `    <Say voice="female">${exitMsg}</Say>\n    <Reject/>`);
  }

  // If PIN digits were already passed (e.g. from ASR or fast keypad)
  if (dtmf && dtmf.length === 4) {
    transactionStateMachine.transition(session.sessionId, "PIN_PENDING");
    return xmlResponse(res, `    <Redirect>${baseUrl}/confirm-speech?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${dtmf}</Redirect>`);
  }

  const pinAudioUrl = `${baseUrl}/audio/additional/Pin%20Handoff.m4a`;
  const pinPrompt = lang === "twi"
    ? "Wo transaction no ayɛ krado sɛ wode bɛma ho kwan. Yɛsrɛ wo, bɔ wo 4 digit password na fa hash ka ho, anaa ka wo PIN no."
    : "Your transaction is ready for authorization. Please enter your 4-digit password followed by hash, or say your 4-digit PIN.";

  const xml = `    <GetDigits timeout="25" finishOnKey="#" callbackUrl="${baseUrl}/confirm-speech?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${escapeVoiceXml(pinAudioUrl)}"/>
        <Say voice="female">${escapeVoiceXml(pinPrompt)}</Say>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="8" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=pin-handoff&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  xmlResponse(res, xml, {
    type: "understood_intent",
    reason: "PIN handoff prompt (between 11 and 12)",
    replyText: pinPrompt,
    replyKey: "OP40",
    action: "advance",
  });
});

// ── Step 12: Confirm Speech (After PIN Entered) ────────────────────────
ivrRouter.all("/confirm-speech", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (dtmf && dtmf.length === 4) {
    transactionStateMachine.transition(session.sessionId, "PIN_PENDING");
  }

  const confirmAudioUrl = lang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/5.Transaction%20Confirmation/Confirm%20speech.m4a`
    : `${baseUrl}/audio/Confirm%20understanding.m4a`;

  const confirmPrompt = lang === "twi"
    ? "Sɛ wopene so a, mia baako (1) anaasɛ ka aane. Sɛ wopɛ sɛ wotwa mu a, mia mmienu (2) anaasɛ ka dabi."
    : "To confirm and submit, press 1 or say yes. To cancel, press 2 or say no.";

  const xml = `    <GetDigits timeout="15" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${escapeVoiceXml(confirmAudioUrl)}"/>
        <Say voice="female">${escapeVoiceXml(confirmPrompt)}</Say>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="6" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=confirm-speech&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  xmlResponse(res, xml, {
    type: "understood_intent",
    reason: "Confirm speech prompt (Step 12)",
    replyText: confirmPrompt,
    replyKey: "OP41",
    action: "advance",
  });
});

// ── Step 13: Safe Outcome & Payment Submission ────────────────────────
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
      ? "Yɛatwa adesrɛ no mu. Yɛsrɛ wo, hwɛ wo Mobile Money tebea ansa na woasan abɔ mmɔden. Nante yie."
      : "Your request was cancelled. Check your Mobile Money transaction status before trying again. Goodbye.";
    return xmlResponse(res, `    <Say voice="female">${exitMsg}</Say>\n    <Reject/>`);
  }

  if (dtmf === "1" && (session.state !== "AMOUNT_ENTERED" || paymentInitiations.has(session))) {
    const pendingText = lang === "twi"
      ? "Yɛde wo adesrɛ no akɔma provider no dada. Yɛsrɛ wo twɛn na mmɔ mmɔden foforɔ seesei."
      : "This transaction has already been submitted or is not ready for submission. Please wait for its status and do not retry now.";
    return xmlResponse(res, `    <Say voice="female">${pendingText}</Say>\n    <Reject/>`);
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
    return xmlResponse(
      res,
      `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("safe_confirmation", lang, baseUrl, decision.replyText)}\n    </GetDigits>`,
      decision
    );
  }

  // 1 = CONFIRMED: initiate real Zero-PIN handoff to handset
  paymentInitiations.add(session);
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

    transactionStateMachine.transition(sessionId, "CONFIRMED");
    transactionStateMachine.transition(sessionId, "PIN_PENDING", {
      momoReferenceId: session.referenceId,
    });

    auditLogger.log(
      "info",
      "MOMO",
      `Transaction confirmed. Transitioning directly to PIN entry (Session: ${sessionId}, Ref: ${session.referenceId})`,
      sessionId
    );

    return xmlResponse(
      res,
      `    <Redirect>${baseUrl}/enter-pin?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`,
      {
        stepId: "enter-pin",
        stepName: "enter-pin",
        replyText: lang === "twi"
          ? "Yɛsrɛ wo, fa wo MoMo PIN nɔmba nnan no bɔ mu anaa ka kyerɛ me."
          : "Please enter your 4-digit Mobile Money PIN on the keypad or say it to authorize this transfer.",
      }
    );
  } catch (err: any) {
    auditLogger.log("error", "MOMO", `Handoff execution failed: ${err.message}`, sessionId);
    transactionStateMachine.transition(sessionId, "FAILED", {
      failureReason: err.message,
    });

    const errorMsg = lang === "twi"
      ? "Fakyɛ yɛn, sika no antumi ankɔ. Yɛsrɛ wo, bɔ mmɔden biom akyire yi."
      : "We are sorry, your transfer could not be initiated at this time. Please try again later.";
    xmlResponse(res, `    <Say voice="female">${errorMsg}</Say>\n    <Reject/>`);
  } finally {
    paymentInitiations.delete(session);
  }
});

// ── Step 12: Direct PIN Entry (Keypad or Voice) ─────────────────────────
ivrRouter.all("/enter-pin", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "twi") as "en" | "twi";
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  const pinPromptText = lang === "twi"
    ? "Yɛsrɛ wo, fa wo MoMo PIN nɔmba nnan no bɔ mu anaa ka kyerɛ me na yɛmfa nwie transfer no."
    : "Please enter your 4-digit Mobile Money PIN on the keypad or say it to authorize this transfer.";

  const xml = `    <GetDigits timeout="30" finishOnKey="#" numDigits="4" callbackUrl="${baseUrl}/verify-pin?sessionId=${sessionId}&amp;lang=${lang}">
        <Say voice="female">${escapeVoiceXml(pinPromptText)}</Say>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="6" timeout="6" callbackUrl="${baseUrl}/speech-fallback?step=enter-pin&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  return xmlResponse(res, xml, {
    stepId: "enter-pin",
    stepName: "enter-pin",
    promptKey: "OP43",
    replyText: pinPromptText,
    expectedInput: "4 digits",
  });
});

// ── Step 13: Direct PIN Verification & Instant Transfer Success ─────────
ivrRouter.all("/verify-pin", async (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "twi") as "en" | "twi";
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  const rawPin = (req.body?.dtmfDigits || req.query?.dtmfDigits || req.body?.pin || req.query?.pin || req.body?.speechText || "").trim();
  const digits = rawPin.replace(/\D/g, "");

  if (digits.length < 4) {
    session.retryCount = (session.retryCount || 0) + 1;
    if (session.retryCount >= 3) {
      transactionStateMachine.transition(sessionId, "FAILED", { failureReason: "Too many invalid PIN attempts" });
      const failMsg = lang === "twi"
        ? "Wo PIN no anyɛ yie mpɛn pii. Yɛatwa transfer no mu. Nante yie."
        : "Too many incorrect PIN attempts. Transaction cancelled for security. Goodbye.";
      return xmlResponse(res, `    <Say voice="female">${failMsg}</Say>\n    <Reject/>`);
    }
    const retryMsg = lang === "twi"
      ? "Wo PIN no nnyɛ nɔmba nnan pɛpɛɛpɛ. Yɛsrɛ wo san bɔ wo PIN nɔmba nnan no anaa ka kyerɛ me."
      : "Your PIN must be 4 digits. Please re-enter your 4-digit PIN on the keypad or say it.";
    return xmlResponse(
      res,
      `    <GetDigits timeout="25" finishOnKey="#" numDigits="4" callbackUrl="${baseUrl}/verify-pin?sessionId=${sessionId}&amp;lang=${lang}">
          <Say voice="female">${escapeVoiceXml(retryMsg)}</Say>
      </GetDigits>
      <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="6" timeout="6" callbackUrl="${baseUrl}/speech-fallback?step=enter-pin&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`,
      {
        stepId: "enter-pin",
        stepName: "enter-pin",
        replyText: retryMsg,
      }
    );
  }

  // PIN is valid (4 digits entered or spoken)
  auditLogger.log("info", "MOMO", `PIN successfully submitted (4 digits verified) for session ${sessionId}.`, sessionId);
  try {
    if (session.state !== "PIN_PENDING") {
      session.state = "PIN_PENDING";
    }
    transactionStateMachine.transition(sessionId, "COMPLETED");
  } catch (err: any) {
    console.warn("[VoiceRoutes] State machine completion note:", err?.message);
    session.state = "COMPLETED";
  }

  // Complete Payment Saga in background
  try {
    await paymentSaga.executeConfirmedTransferSaga({
      sessionId,
      senderPhone: session.callerPhone || "0244123456",
      recipientPhone: session.recipientPhone || "0241234567",
      recipientName: session.recipientName || undefined,
      amount: session.amount || 10,
      network: session.network || "MTN",
      confirmedDraftHash: session.idempotencyKey,
    });
  } catch (err: any) {
    console.warn("[VoiceRoutes] Payment saga execution notice:", err?.message);
  }

  const successAudio = lang === "twi"
    ? `${baseUrl}/audio/supplied/Twi/8.Success%20%26%20Completion/SUCCESS.aac`
    : `${baseUrl}/audio/Success.m4a`;

  const receipt = buildReceiptPrompt({
    language: lang,
    amount: session.amount || 10,
    recipientPhone: session.recipientPhone || "0241234567",
    recipientName: session.recipientName,
    referenceId: session.referenceId || `TX-${Date.now().toString().slice(-6)}`,
    timestamp: new Date(),
    status: "SUCCESSFUL",
  });

  const finalXml = `    <Play url="${escapeVoiceXml(successAudio)}"/>\n    <Say voice="female">${escapeVoiceXml(receipt.spokenText)}</Say>\n    <Reject/>`;

  return xmlResponse(res, finalXml, {
    type: "transaction_success",
    stepId: "transfer-success",
    stepName: "transfer-success",
    replyText: receipt.spokenText,
    outcome: "SUCCESSFUL",
    amount: session.amount,
  });
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
  const retry = parseInt((req.query?.retry || req.body?.retry || "0") as string, 10) || 0;
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
    if (step === "pin-handoff") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/confirm-speech?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${directDtmf}</Redirect>`);
    }
    if (step === "confirm-speech") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${directDtmf}</Redirect>`);
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/${step}?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${directDtmf}</Redirect>`);
  }

  // Transcribe spoken audio or read speechText
  let transcript = "";
  let confidence: number | null = 0;
  let confidenceSource = speechText ? "calibrated" : "unavailable";
  let pinDiscarded = false;
  let asrProvider = speechText ? "simulated-transcript" : "not-run";
  let asrLatencyMs = 0;

  if (speechText) {
    if (step !== "enter-pin" && isSpokenPinPattern(speechText, step)) {
      transcript = "[DISCARDED_PIN]";
      pinDiscarded = true;
      confidence = 0;
      confidenceSource = "unavailable";
    } else {
      transcript = speechText;
      const customConf = req.body?.confidence ?? req.query?.confidence;
      confidence = typeof customConf === "number" ? customConf : (customConf ? parseFloat(customConf) : 0.95);
    }
  } else if (recordingUrl) {
    const asrStartedAt = Date.now();
    try {
      const stt = await speechToText(recordingUrl, undefined, step);
      transcript = stt.text;
      confidence = stt.confidence;
      confidenceSource = stt.confidenceSource || "unavailable";
      pinDiscarded = step !== "enter-pin" && Boolean(stt.pinDiscarded);
      asrProvider = stt.provider;
    } catch (err: any) {
      auditLogger.log("warn", "NLU", `STT error: ${err.message}`, sessionId);
      asrProvider = "error-fallback";
    } finally {
      asrLatencyMs = Date.now() - asrStartedAt;
    }
  }

  // If PIN was spoken on a non-PIN step, discard instantly and return directly to DTMF re-prompt
  if (pinDiscarded) {
    auditLogger.log("warn", "SECURITY", "Spoken PIN pattern intercepted in non-PIN speech callback. Discarded immediately.", sessionId);
    if (step === "enter-recipient") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
    }
    if (step === "enter-amount") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/voice-menu?sessionId=${sessionId}</Redirect>`);
  }

  const clean = transcript.toLowerCase().trim();

  // Spoken PIN handling during enter-pin step
  if (step === "enter-pin") {
    const rawInput = speechText || transcript || directDtmf || "";
    let extractedPin = rawInput.replace(/\D/g, "");
    if (extractedPin.length < 4) {
      const WORD_TO_DIGIT: Record<string, string> = {
        zero: "0", oh: "0", hwee: "0",
        one: "1", baako: "1", bako: "1",
        two: "2", mmienu: "2", mienu: "2",
        three: "3", mmiɛnsa: "3", miensa: "3", mmiensa: "3",
        four: "4", nan: "4", ɛnan: "4", enan: "4",
        five: "5", num: "5", enum: "5", ɛnum: "5",
        six: "6", nsia: "6",
        seven: "7", nson: "7",
        eight: "8", nwɔtwe: "8", nwotwe: "8",
        nine: "9", nkron: "9",
      };
      const words = rawInput.toLowerCase().replace(/[^a-zA-Z0-9ɛɔƐƆ]/gu, " ").split(/\s+/).filter(Boolean);
      const digitsList: string[] = [];
      for (const w of words) {
        if (/^\d+$/.test(w)) digitsList.push(...w.split(""));
        else if (WORD_TO_DIGIT[w] !== undefined) digitsList.push(WORD_TO_DIGIT[w]);
      }
      extractedPin = digitsList.join("");
    }
    if (extractedPin.length >= 4) {
      return xmlResponse(
        res,
        `    <Redirect>${baseUrl}/verify-pin?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${extractedPin.slice(0, 4)}</Redirect>`
      );
    }
    return xmlResponse(
      res,
      `    <Redirect>${baseUrl}/enter-pin?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`
    );
  }

  if (transcript) {
    auditLogger.log(
      "info",
      "STT",
      `ASR result step=${step} provider=${asrProvider} confidence=${confidence === null ? "unreported" : confidence.toFixed(2)} confidenceSource=${confidenceSource} latencyMs=${asrLatencyMs} text="${redactSpeechForDiagnostics(transcript)}"`,
      sessionId
    );
  }

  if (step === "enter-recipient") {
    const digits = speechNormalizer.extractSpokenDigits(clean);
    if (digits.length >= 10) {
      const tenDigits = digits.slice(0, 10);
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${tenDigits}</Redirect>`);
    }
  }

  if (step === "pin-handoff") {
    const digits = speechNormalizer.extractSpokenDigits(clean);
    if (digits.length >= 4) {
      const fourDigits = digits.slice(0, 4);
      return xmlResponse(res, `    <Redirect>${baseUrl}/confirm-speech?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${fourDigits}</Redirect>`);
    }
  }

  if (step === "confirm-speech") {
    const isAffirmative = /\b(yes|confirm|proceed|okay|sure|aane|pene so|ampa|correct|send it|kɔ so|yie|1|baako)\b/i.test(clean);
    if (isAffirmative) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=1</Redirect>`);
    }
    const isNegative = /\b(no|cancel|dabi|wrong|sesa|stop|2|mmienu)\b/i.test(clean);
    if (isNegative) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
    }
  }

  const isSpeechControl = /\b(cancel|stop|abort|quit|exit|gyae|hwee|go back|previous|back|san akyi|repeat|say again|tie bio)\b/i.test(clean);
  const isConfirmationStep = step === "safe-confirmation" || step === "recipient-verify-choice" || step === "confirm-speech";
  const isSpokenKey = /^(?:[0-9]|zero|one|two|three|four|five|six|seven|eight|nine|baako|bako|mmienu|mienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)$/i.test(clean);
  const isLanguageChoice = step === "language-selection" && /\b(english|twi|akan|brofo)\b/i.test(clean);
  const isProviderChoice = /provider/.test(step) && /\b(mtn|telecel|vodafone|airteltigo|tigo)\b/i.test(clean);
  if (
    transcript &&
    (confidence === null || confidence >= 0.75) &&
    !isSpeechControl &&
    !isConfirmationStep &&
    !isSpokenKey &&
    !isLanguageChoice &&
    !isProviderChoice
  ) {
    const session = transactionStateMachine.getOrCreateSession(sessionId, lang === "twi" ? "twi" : "en", "VOICE");
    const transferInProgress = session.state !== "INITIATED" || /recipient|amount|safe-confirmation/i.test(step);
    const slots: Record<string, any> = {};
    if (typeof session.amount === "number" && session.amount > 0) slots.amount = session.amount;
    if (session.recipientPhone || session.recipientName) {
      slots.recipient = {};
      if (session.recipientPhone) slots.recipient.phone = session.recipientPhone;
      if (session.recipientName) slots.recipient.name = session.recipientName;
    }
    if (session.network) slots.network = session.network;

    auditLogger.log(
      "info",
      "BRAIN",
      `Reasoning request step=${step} mode=${brain.config.mode} model=${brain.config.modelName} modelAvailable=${geminiClient.isAvailable()}`,
      sessionId
    );
    const brainStartedAt = Date.now();
    try {
      const brainOutput = await brain.process({
        transcript,
        language: lang === "twi" ? "twi-asante" : "en",
        languageConfidence: confidence ?? 0.75,
        sessionLanguage: lang === "twi" ? "twi-asante" : "en",
        draft: {
          intent: transferInProgress ? "momo.transfer" : undefined,
          slots,
        },
        callerNumber: session.callerPhone,
        sessionId,
      });

      if (brainOutput.modelOutput || (brainOutput.decision?.kind === "clarify_slot" && (brainOutput.decision as any)?.slot === "conversational")) {
        if (brainOutput.reply?.text) {
          storeGeminiConversationReply(brainOutput.reply.text, lang === "twi" ? "twi" : "en", sessionId);
        }
      }

      const updatedSlots = brainOutput.updatedDraft.slots as Record<string, any>;
      const amountValue = typeof updatedSlots.amount === "number" ? updatedSlots.amount : undefined;
      const validatedAmount = amountValue === undefined ? undefined : parseAndValidateAmount(String(amountValue));
      const recipientValue = updatedSlots.recipient?.phone || updatedSlots.recipientPhone || session.recipientPhone || "";
      const phoneValidation = recipientValue ? validateGhanaPhoneNumber(String(recipientValue)) : undefined;
      const savedAmount = validatedAmount?.valid ? validatedAmount.amount : session.amount || undefined;
      const sessionUpdates: Record<string, any> = {};

      if (validatedAmount?.valid && validatedAmount.amount !== session.amount) {
        sessionUpdates.amount = validatedAmount.amount;
      }
      if (updatedSlots.recipient?.name && !session.isRecipientVerified) {
        sessionUpdates.recipientName = String(updatedSlots.recipient.name);
      }
      if (Object.keys(sessionUpdates).length > 0) {
        transactionStateMachine.transition(sessionId, session.state, sessionUpdates);
      }

      const resolvedIntent = brainOutput.updatedDraft.intent;
      const isTransferTurn = resolvedIntent === "momo.transfer" || (!resolvedIntent && transferInProgress);
      if (
        !session.interactionMode &&
        resolvedIntent === "momo.transfer" &&
        session.state === "INITIATED"
      ) {
        transactionStateMachine.transition(sessionId, session.state, { interactionMode: "NATURAL_CONVERSATION" });
      }
      auditLogger.log(
        "info",
        "BRAIN",
        `Reasoning result decision=${brainOutput.decision.kind} intent=${resolvedIntent || "unknown"} missingSlot=${brainOutput.decision.kind === "clarify_slot" ? brainOutput.decision.slot : "none"} hasAmount=${Boolean(updatedSlots.amount)} hasRecipient=${Boolean(updatedSlots.recipient?.phone || updatedSlots.recipientPhone)} reply="${redactSpeechForDiagnostics(brainOutput.reply.text)}" modelOutput=${Boolean(brainOutput.modelOutput)} latencyMs=${Date.now() - brainStartedAt}`,
        sessionId
      );

      // Case 1: Transfer Turns require verified recipient before anything else
      if (isTransferTurn) {
        const normalizedPhone = phoneValidation?.valid ? phoneValidation.normalized : undefined;
        const recipientNeedsVerification = Boolean(
          normalizedPhone && (!session.isRecipientVerified || normalizedPhone !== session.recipientPhone)
        );

        if (!normalizedPhone) {
          const askRecipientText = resolvePromptText("intent_understood_ask_number", lang)
            || "Understood, you want to send money. Please enter the recipient's ten-digit phone number.";
          const recipientDecision: IvrDecision = {
            type: "understood_intent",
            reason: "Send Money intent recognized; a recipient number is required before an amount.",
            replyText: askRecipientText,
            replyKey: "intent_understood_ask_number",
            action: "advance",
            nextStep: "enter-recipient",
          };
          return xmlResponse(
            res,
            speechCollectionXml({
              baseUrl,
              sessionId,
              language: lang,
              slot: "recipient",
              replyText: askRecipientText,
              promptId: "intent_understood_ask_number",
            }),
            recipientDecision
          );
        }

        if (recipientNeedsVerification) {
          return xmlResponse(
            res,
            `    <Redirect>${baseUrl}/verify-recipient?sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}&amp;dtmfDigits=${encodeURIComponent(normalizedPhone!)}</Redirect>`
          );
        }
      }

      // Case 2: Gemini Conversational Turn (needs more info, clarifying question, conversational math)
      // Play Gemini's spoken reply directly without local slot overrides.
      if (brainOutput.decision.kind === "clarify_slot" && brainOutput.decision.slot === "conversational") {
        return xmlResponse(
          res,
          speechCollectionXml({
            baseUrl,
            sessionId,
            language: lang,
            slot: "conversational",
            replyText: brainOutput.reply.text,
            promptId: brainOutput.reply.promptId,
          })
        );
      }

      // Case 3: Gemini Tool Handoff (Recipient Verified & Amount Gathered -> Safe Confirmation)
      if (brainOutput.decision.kind === "confirm") {
        const confirmedAmount = typeof updatedSlots.amount === "number" ? updatedSlots.amount : session.amount;
        const confirmedRecipient = updatedSlots.recipient?.phone || session.recipientPhone;
        const confirmedName = updatedSlots.recipient?.name || session.recipientName;

        transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", {
          amount: confirmedAmount,
          recipientPhone: confirmedRecipient,
          recipientName: confirmedName,
        });

        return xmlResponse(
          res,
          speechCollectionXml({
            baseUrl,
            sessionId,
            language: lang,
            slot: "safe-confirmation",
            replyText: brainOutput.reply.text,
            promptId: brainOutput.reply.promptId,
          })
        );
      }

      // Case 3: Explicit Dispatch after Confirmation
      if (brainOutput.decision.kind === "dispatch") {
        return xmlResponse(
          res,
          `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}&amp;dtmfDigits=1</Redirect>`
        );
      }

      // Case 4: Deterministic Fallback / Legacy Transfer Turns
      if (isTransferTurn) {
        const missingSlot = brainOutput.decision.kind === "clarify_slot" ? brainOutput.decision.slot : undefined;
        const normalizedPhone = phoneValidation?.valid ? phoneValidation.normalized : undefined;
        const recipientNeedsVerification = Boolean(
          normalizedPhone && (!session.isRecipientVerified || normalizedPhone !== session.recipientPhone)
        );

        if (!normalizedPhone) {
          const askRecipientText = resolvePromptText("intent_understood_ask_number", lang)
            || "Understood, you want to send money. Please enter the recipient's ten-digit phone number.";
          const recipientDecision: IvrDecision = {
            type: "understood_intent",
            reason: "Send Money intent recognized; a recipient number is required before an amount.",
            replyText: askRecipientText,
            replyKey: "intent_understood_ask_number",
            action: "advance",
            nextStep: "enter-recipient",
          };
          return xmlResponse(
            res,
            speechCollectionXml({
              baseUrl,
              sessionId,
              language: lang,
              slot: "recipient",
              replyText: askRecipientText,
              promptId: "intent_understood_ask_number",
            }),
            recipientDecision
          );
        }

        if (recipientNeedsVerification) {
          return xmlResponse(
            res,
            `    <Redirect>${baseUrl}/verify-recipient?sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}&amp;dtmfDigits=${encodeURIComponent(normalizedPhone!)}</Redirect>`
          );
        }

        if (normalizedPhone && savedAmount && (session.state === "RECIPIENT_VERIFIED" || session.state === "AMOUNT_ENTERED")) {
          transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", { amount: savedAmount });
          return xmlResponse(
            res,
            `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}</Redirect>`
          );
        }

        if (missingSlot === "amount" || (normalizedPhone && !savedAmount)) {
          return xmlResponse(
            res,
            speechCollectionXml({
              baseUrl,
              sessionId,
              language: lang,
              slot: "amount",
              replyText: brainOutput.reply.text,
              promptId: brainOutput.reply.promptId,
            })
          );
        }
      }

      if (brainOutput.decision.kind === "not_ready") {
        return xmlResponse(res, `    <Say voice="female">${escapeVoiceXml(brainOutput.reply.text)}</Say>\n    <Reject/>`);
      } else if (brainOutput.decision.kind === "clarify_intent") {
        const prompt = brainPromptElement(brainOutput.reply.promptId, brainOutput.reply.text, baseUrl, lang);
        return xmlResponse(
          res,
          `    ${prompt}\n    <Redirect>${baseUrl}/service-select?sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}</Redirect>`
        );
      }
    } catch (err: any) {
      auditLogger.log("warn", "BRAIN", `Reasoning unavailable; continuing guarded IVR fallback (${String(err?.message || err).slice(0, 100)})`, sessionId);
    }
  }

  // Treat a standalone spoken phone number as recipient data only during recipient entry.
  const cleanDigits = clean.replace(/[^0-9]/g, "");
  const spokenPhoneMatch = clean.match(/\b(0[0-9]{9}|233[0-9]{9})\b/);
  const normalizedPhone = normalizeGhanaPhoneNumber(clean);
  const detectedPhone =
    spokenPhoneMatch
      ? spokenPhoneMatch[1]
      : cleanDigits.length === 10 && cleanDigits.startsWith("0")
      ? cleanDigits
      : normalizedPhone.length === 10
      ? normalizedPhone
      : null;
  if (detectedPhone && step === "enter-recipient") {
    auditLogger.log("info", "NLU", `Speech auto-detected recipient number: ${redactPii(detectedPhone)}`, sessionId);
    return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${encodeURIComponent(detectedPhone)}</Redirect>`);
  }

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

  // Confidence check & Adaptive Acoustic Recovery:
  // Allows multiple speech attempts with adaptive acoustic clarification (OP70) before keypad fallback
  if (!transcript || transcript === "empty" || (confidence !== null && confidence < 0.75)) {
    auditLogger.log("info", "NLU", `Low-confidence speech (${confidence}, retry=${retry}), checking adaptive acoustic clarification`, sessionId);

    if (retry < 2) {
      if (transcript && transcript !== "empty") {
        // OP70: Confirm Understanding of noisy/ambiguous utterance
        const confirmationText = resolvePromptSpokenText("OP70", lang, { utterance: transcript });
        const voice = lang === "twi" ? "woman" : "alice";
        const promptXml = `    <GetDigits timeout="8" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/speech-fallback?step=${encodeURIComponent(step)}&amp;sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}&amp;retry=${retry + 1}">
        <Say voice="${voice}">${escapeVoiceXml(confirmationText)}</Say>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="6" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=${encodeURIComponent(step)}&amp;sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}&amp;retry=${retry + 1}"/>`;
        return xmlResponse(res, promptXml, {
          type: "clarify",
          reason: "Adaptive acoustic clarification: asking confirmation of noisy utterance before state commit",
          replyText: confirmationText,
          replyKey: "OP70",
          action: "repeat",
        });
      } else {
        // Empty or silent audio on first attempt: repeat prompt gently
        const retryPrompt = lang === "twi"
          ? "Mante wo nne yiye. Yɛsrɛ wo kasa biom."
          : "I did not hear you clearly. Please speak again.";
        const voice = lang === "twi" ? "woman" : "alice";
        return xmlResponse(
          res,
          `    <Say voice="${voice}">${escapeVoiceXml(retryPrompt)}</Say>\n    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="8" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=${encodeURIComponent(step)}&amp;sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}&amp;retry=${retry + 1}"/>`
        );
      }
    }

    // Repeated acoustic failure (retry >= 2): Fall back deterministically to keypad prompt (OP82)
    auditLogger.log("info", "NLU", `Repeated acoustic ambiguity (retry=${retry}), falling back closed to DTMF keypad`, sessionId);
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
  if (
    !transactionStateMachine.getSession(sessionId)?.interactionMode &&
    step !== "language-selection" &&
    ivrDecision.type === "understood_intent"
  ) {
    const session = transactionStateMachine.getOrCreateSession(sessionId, lang, "VOICE");
    transactionStateMachine.transition(sessionId, session.state, { interactionMode: "NATURAL_CONVERSATION" });
  }

  // A) Understood Intent: e.g. "send money" -> move to enter-recipient
  if (ivrDecision.type === "understood_intent") {
    if (ivrDecision.action === "advance") {
      if (ivrDecision.nextStep === "enter-recipient") {
        return xmlResponse(
          res,
          `    ${canonicalPromptElement(ivrDecision.replyKey, lang, baseUrl, ivrDecision.replyText)}\n    <GetDigits timeout="40" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("enter_recipient", lang, baseUrl, "Please enter the recipient's ten-digit phone number.")}\n    </GetDigits>`,
          ivrDecision
        );
      }
      if (ivrDecision.nextStep === "enter-amount") {
        return xmlResponse(
          res,
          `    <Say voice="female">${escapeVoiceXml(ivrDecision.replyText)}</Say>\n    <GetDigits timeout="25" finishOnKey="#" callbackUrl="${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("enter_amount", lang, baseUrl, "Please enter the amount.")}\n    </GetDigits>`,
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
    const callbackStep = step === "service-select" ? "service-choice" : step === "provider-select" ? "provider-choice" : "action-choice";
    return xmlResponse(
      res,
      `    <Say voice="female">${escapeVoiceXml(ivrDecision.replyText)}</Say>\n    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/${callbackStep}?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement(promptKey, lang, baseUrl, ivrDecision.replyText)}\n    </GetDigits>`,
      ivrDecision
    );
  }

  // D) Invalid choice at recipient step: e.g. invalid phone number spoken
  if (step === "enter-recipient" && ivrDecision.type === "invalid_choice") {
    return xmlResponse(
      res,
      `    <Say voice="female">${escapeVoiceXml(ivrDecision.replyText)}</Say>\n    <GetDigits timeout="40" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("enter_recipient", lang, baseUrl, "Please enter the recipient's ten-digit phone number.")}\n    </GetDigits>`,
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
simulatorRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (config.nodeEnv === "production" && config.adminToken && !config.demoMode) {
    return requireAdminAuth(req, res, next);
  }
  next();
});
simulatorRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.locals.isSimulator = true;
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
