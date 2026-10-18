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
import { FINANCIAL_LIMITS, financialPolicy } from "../ai_system/core/financialPolicy";
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
import { matchReplyToAudio } from "../audio/replyAudioMatcher";

export const voiceRouter = Router();
export const ivrRouter = Router();
export const simulatorRouter = Router();
const CALLER_RESPONSE_TIMEOUT_SECONDS = 90;

export function getCollectionStagePromptId(slot: "recipient" | "amount" | string, fallbackPromptId: string): string {
  if (slot === "recipient") return "OP16";
  if (slot === "amount") return "OP28";
  return fallbackPromptId;
}

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
  "/amount-readback-choice",
  "/safe-confirmation",
  "/safe-outcome",
  "/check-status",
  "/post-success-choice",
  "/pin-handoff",
  "/confirm-speech",
  "/enter-pin",
  "/verify-pin",
  "/speech-fallback",
]);

// Apply rate limiting & Africa's Talking webhook verification strictly to telephony routes
voiceRouter.use((req: Request, res: Response, next) => {
  if (TELEPHONY_ROUTES.has(req.path)) {
    return telephonyRateLimiter(req, res, () => verifyAtWebhook(req, res, () => {
      if (String(req.body?.isActive ?? req.query?.isActive ?? "") === "0") {
        return xmlResponse(res, "");
      }

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

function normalizeGetDigitsPrompts(xml: string, fallbackText: string): string {
  return xml.replace(/<GetDigits\b([^>]*)>([\s\S]*?)<\/GetDigits>/gi, (_match, attributes, body) => {
    const actions = [...body.matchAll(/<(Say|Play)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1\s*>)/gi)];
    const sayAction = actions.find((action) => action[1].toLowerCase() === "say" && action[3]?.trim());
    const playAction = actions.find((action) =>
      action[1].toLowerCase() === "play" && Boolean(action[2].match(/\burl=["']([^"']+)["']/i)?.[1]?.trim())
    );
    const promptAction = sayAction?.[0] || playAction?.[0]
      || `<Say voice="woman">${escapeVoiceXml(fallbackText || "Please respond using your keypad.")}</Say>`;

    return `<GetDigits${attributes}>${promptAction}</GetDigits>`;
  });
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
  if (promptId) {
    const promptPath = resolvePrompt(promptId, language);
    if (promptPath) {
      return `<Play url="${escapeVoiceXml(`${baseUrl}${promptPath}`)}"/>`;
    }
    const promptText = resolvePromptText(promptId, language);
    if (promptText) {
      return `<Say voice="female">${escapeVoiceXml(promptText)}</Say>`;
    }
    return `<Say voice="female">${escapeVoiceXml(replyText)}</Say>`;
  }

  const match = matchReplyToAudio(replyText, language);
  if (match.match && match.audioUrl) {
    return `<Play url="${escapeVoiceXml(`${baseUrl}${match.audioUrl}`)}"/>`;
  }
  return `<Say voice="female">${escapeVoiceXml(replyText)}</Say>`;
}

function canonicalPromptElement(
  promptKey: string,
  language: "en" | "twi",
  baseUrl: string,
  fallbackText: string
): string {
  const element = resolvePromptXml(promptKey, language, baseUrl, fallbackText);
  if (element) return element;
  return language === "twi"
    ? `<Say voice="female">Twi audio is unavailable. Press 1 for English, or try again later.</Say>`
    : `<Say voice="female">${escapeVoiceXml(fallbackText)}</Say>`;
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
    return `    <GetDigits timeout="90" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?${query}">\n        ${prompt}\n    </GetDigits>\n    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="12" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-recipient&amp;${query}"/>`;
  }
  if (slot === "safe-confirmation") {
    return `    <GetDigits timeout="25" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/safe-outcome?${query}">\n        ${prompt}\n    </GetDigits>\n    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=safe-confirmation&amp;${query}"/>`;
  }
  if (slot === "conversational") {
    return `    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="10" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=conversational&amp;${query}">\n        ${prompt}\n    </Record>`;
  }
  return `    <GetDigits timeout="25" finishOnKey="#" callbackUrl="${baseUrl}/verify-amount?${query}">\n        ${prompt}\n    </GetDigits>\n    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="8" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-amount&amp;${query}"/>`;
}

ivrRouter.use((req: Request, res: Response, next: NextFunction) => {
  const hasDtmf = Object.prototype.hasOwnProperty.call(req.body || {}, "dtmfDigits")
    || Object.prototype.hasOwnProperty.call(req.query || {}, "dtmfDigits");
  const dtmf = String(req.body?.dtmfDigits ?? req.query?.dtmfDigits ?? "").trim();
  const speechStep = String(req.query?.step || req.body?.step || "").toLowerCase();
  const emptySpeechCallback = req.path === "/speech-fallback"
    && Boolean(speechStep)
    && !req.body?.speechText
    && !req.query?.speechText
    && !req.body?.RecordingUrl
    && !req.body?.recordingURL
    && !req.query?.RecordingUrl;

  if ((!hasDtmf || dtmf) && !emptySpeechCallback) return next();
  if (["/enter-pin", "/verify-pin", "/pin-handoff", "/confirm-speech"].includes(req.path)
    || ["enter-pin", "verify-pin", "pin-handoff", "confirm-speech"].includes(speechStep)) {
    return next();
  }

  const sessionId = String(req.body?.sessionId || req.query?.sessionId || "");
  const lang = (req.body?.lang === "twi" || req.query?.lang === "twi" ? "twi" : "en") as "en" | "twi";
  const recoveryStep = req.path === "/speech-fallback" ? speechStep : req.path;
  const recoveryPathByStep: Record<string, string> = {
    "/language-selection": "/language-selection",
    "/service-choice": "/service-select",
    "/provider-choice": "/provider-select",
    "/action-choice": "/action-select",
    "/verify-recipient": "/enter-recipient",
    "/verify-amount": "/enter-amount",
    "/safe-outcome": "/safe-confirmation",
    "language-selection": "/language-selection",
    "service-select": "/service-select",
    "provider-select": "/provider-select",
    "provider-choice": "/provider-select",
    "action-select": "/action-select",
    "enter-recipient": "/enter-recipient",
    "enter-amount": "/enter-amount",
    "recipient-verify-choice": "/recipient-verify-choice",
    "safe-confirmation": "/safe-confirmation",
    "confirm-speech": "/safe-confirmation",
  };
  let recoveryPath = recoveryPathByStep[recoveryStep];

  if (recoveryStep === "/recipient-verify-choice" || recoveryStep === "recipient-verify-choice") {
    const session = transactionStateMachine.getSession(sessionId);
    recoveryPath = session?.recipientPhone ? "/verify-recipient" : "/enter-recipient";
  }
  if (!recoveryPath || !sessionId) return next();

  const query = new URLSearchParams({ sessionId, lang });
  const session = transactionStateMachine.getSession(sessionId);
  if (recoveryPath === "/verify-recipient" && session?.recipientPhone) {
    query.set("dtmfDigits", session.recipientPhone);
  }
  const target = `${getBaseUrl(req)}${recoveryPath}?${query.toString()}`;
  const reminderText = lang === "twi"
    ? "Yɛsrɛ wo, ma yɛn mmuaeɛ anaa fa wo keypad no mia nɔmba bi."
    : "Please respond or press a key on your phone keypad.";

  return xmlResponse(
    res,
    `    ${canonicalPromptElement("please_respond", lang, getBaseUrl(req), reminderText)}\n    <Redirect>${escapeVoiceXml(target)}</Redirect>`,
    {
      type: "clarify",
      reason: "No input after the 90-second response window; reminder played and the current step is retained.",
      replyText: reminderText,
      replyKey: "OP67",
      action: "repeat",
      nextStep: recoveryPath,
    }
  );
});

function xmlResponse(res: Response, content: string, decision?: (Partial<IvrDecision> & Record<string, any>) | any): void {
  const fallbackPrompt = typeof decision?.replyText === "string" && decision.replyText.trim()
    ? decision.replyText
    : content.match(/<Say\b[^>]*>([\s\S]*?)<\/Say>/i)?.[1]?.replace(/&(?:amp|lt|gt|quot|apos);/g, " ").trim()
      || "Please respond using your keypad.";
  let xml = normalizeGetDigitsPrompts(content, fallbackPrompt);
  if (decision) {
    if (decision.type) res.set("X-AI-Decision-Type", toSafeHeaderValue(decision.type));
    if (decision.outcome) res.set("X-Transaction-Outcome", toSafeHeaderValue(decision.outcome));
    res.set("X-AI-Decision-Reason", toSafeHeaderValue(decision.reason));
    res.set("X-AI-Reply-Text", toSafeHeaderValue(decision.replyText));
    res.set("X-AI-Reply-Key", toSafeHeaderValue(decision.replyKey));
    const promptId = decision.replyKey?.match(/^OP\d{2}$/i)?.[0]?.toUpperCase()
      || STATE_TO_CANONICAL_PROMPT_ID[decision.replyKey?.toUpperCase()]
      || decision.replyKey;
    if (promptId) {
      res.set("X-Canonical-Prompt-Id", toSafeHeaderValue(promptId));
    }
    if ((decision as any)?.recipientName) {
      res.set("X-Recipient-Name", toSafeHeaderValue((decision as any).recipientName));
    }
    if ((decision as any)?.recipientPhone) {
      res.set("X-Recipient-Phone", toSafeHeaderValue((decision as any).recipientPhone));
    }
  }
  const req = (res.req || (res as any).socket?._httpMessage?.req) as Request | undefined;
  const responseSessionId = req?.body?.sessionId || req?.query?.sessionId;
  if (typeof responseSessionId === "string") {
    const session = transactionStateMachine.getSession(responseSessionId);
    res.set("X-Interaction-Mode", session?.interactionMode || "UNSELECTED");
    res.set("X-Conversation-State", session?.state || "INITIATED");
    if (session?.recipientName && !res.getHeader("X-Recipient-Name")) {
      res.set("X-Recipient-Name", toSafeHeaderValue(session.recipientName));
    }
    if (session?.recipientPhone && !res.getHeader("X-Recipient-Phone")) {
      res.set("X-Recipient-Phone", toSafeHeaderValue(session.recipientPhone));
    }
    if (!res.getHeader("X-Canonical-Prompt-Id") && session?.state && STATE_TO_CANONICAL_PROMPT_ID[session.state]) {
      res.set("X-Canonical-Prompt-Id", STATE_TO_CANONICAL_PROMPT_ID[session.state]);
    }
  }
  res.set(
    "Access-Control-Expose-Headers",
    "X-AI-Decision-Type, X-AI-Decision-Reason, X-AI-Reply-Text, X-AI-Reply-Key, X-Canonical-Prompt-Id, X-Conversation-State, X-Interaction-Mode, x-telephony-guard-reason, X-Recipient-Name, X-Recipient-Phone"
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

  xml = xml.replace(/(<GetDigits\b[^>]*\btimeout=["'])\d+(["'])/gi, `$1${CALLER_RESPONSE_TIMEOUT_SECONDS}$2`);
  if (!/<GetDigits\b/i.test(xml)) {
    xml = xml.replace(/(<Record\b[^>]*\btimeout=["'])\d+(["'])/gi, `$1${CALLER_RESPONSE_TIMEOUT_SECONDS}$2`);
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

  const welcomePrompt = "Welcome to Ɔkwankyerɛfo Pa. For English, press 1. For Twi, press 2.";
  const languagePrompt = canonicalPromptElement(
    "language_selection",
    "en",
    baseUrl,
    "For English, press 1. For Twi, press 2."
  );
  const xml = `    ${canonicalPromptElement("opening_voice_welcome_to_okwankyerefopa", "twi", baseUrl, welcomePrompt)}
    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/language-selection?sessionId=${sessionId}">
        ${languagePrompt}
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=language-selection&amp;sessionId=${sessionId}&amp;retry=0"/>`;

  xmlResponse(res, xml, {
    type: "understood_intent",
    reason: "Call connected - playing OP01 Welcome & Language Selection Gate",
    replyText: "Welcome to Ɔkwankyerɛfo Pa. For English, press 1. For Twi, press 2.",
    replyKey: "OP01",
    action: "advance",
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

    const decision: IvrDecision = {
      type: "understood_intent",
      reason: `Language chosen: ${lang === "twi" ? "Twi" : "English"} (${dtmf}). Playing service selection.`,
      replyText: resolvePromptText("supported_service_select", lang)
        || (lang === "twi"
          ? "Sɛ wopɛ mobile money a, mia 1. Sikakorabea dwumadie nni pilot yi mu."
          : "For Mobile Money services, press 1. Banking is not supported in this pilot."),
      replyKey: "supported_service_select",
      action: "advance",
      nextStep: "service-select",
    };

    const xml = `    <GetDigits timeout="15" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">
      ${canonicalPromptElement("supported_service_select", lang, baseUrl, decision.replyText)}
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=service-select&amp;sessionId=${sessionId}&amp;lang=${lang}&amp;retry=0"/>`;

    return xmlResponse(res, xml, decision);
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

  const promptElement = canonicalPromptElement(
    "supported_service_select",
    lang,
    baseUrl,
    resolvePromptText("supported_service_select", lang)
      || "For a supported Mobile Money transfer, press 1. Press 9 to repeat, or 0 to exit."
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
      const unsupportedText = lang === "twi"
        ? "Sikakorabea dwumadie yi nni pilot yi mu. Mobile Money transfer nkutoo na yɛboa."
        : "Banking is not supported in this pilot. Only supported Mobile Money transfers are available.";
      const serviceText = lang === "twi"
        ? "Sɛ wopɛ Mobile Money transfer a, mia 1. Mia 9 na tie bio, anaasɛ mia 0 na woapue."
        : "For a supported Mobile Money transfer, press 1. Press 9 to repeat, or 0 to exit.";
      const decision: IvrDecision = {
        type: "unsupported",
        reason: "The requested service is not available in this pilot.",
        replyText: `${unsupportedText} ${serviceText}`,
        replyKey: "service_unsupported",
        action: "replay",
        nextStep: "service-select",
        promptReplayKey: "supported_service_select",
      };
      return xmlResponse(
        res,
        `    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">
        ${canonicalPromptElement("unsupported_service", lang, baseUrl, unsupportedText)}
        ${canonicalPromptElement("supported_service_select", lang, baseUrl, serviceText)}
    </GetDigits>`,
        decision
      );
    }
  }

  if (dtmf === "3" && !session.serviceSelected) {
    const unsupportedText = lang === "twi"
      ? "Saa service no nni dwumadie a yɛboa mu. Mobile Money transfer nkutoo na yɛboa."
      : "That service is not supported in this pilot. Only supported Mobile Money transfers are available.";
    const serviceText = lang === "twi"
      ? "Sɛ wopɛ Mobile Money transfer a, mia 1. Mia 9 na tie bio, anaasɛ mia 0 na woapue."
      : "For a supported Mobile Money transfer, press 1. Press 9 to repeat, or 0 to exit.";
    const decision: IvrDecision = {
      type: "unsupported",
      reason: "The requested service is not available in this pilot.",
      replyText: `${unsupportedText} ${serviceText}`,
      replyKey: "unsupported_service",
      action: "replay",
      nextStep: "service-select",
    };
    return xmlResponse(res, `    ${canonicalPromptElement("unsupported_service", lang, baseUrl, unsupportedText)}
    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">
        ${canonicalPromptElement("supported_service_select", lang, baseUrl, serviceText)}
    </GetDigits>`, decision);
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
      const prev = "service-select";
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
        ? "Sɛ wopɛ sɛ womane sika a, mia 1."
        : "To send money, press 1.",
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

ivrRouter.all("/action-select", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const actionPrompt = resolvePromptText("send_money_menu", lang)
    || (lang === "twi"
      ? "Sɛ wopɛ sɛ womane sika a, mia 1. Mia 8 na san kɔ akyi, mia 9 na tie bio, anaasɛ mia 0 na woapue."
      : "To send money, press 1. To go back, press 8. To hear this again, press 9. To exit, press 0.");
  const xml = `    <GetDigits timeout="15" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/action-choice?sessionId=${sessionId}&amp;lang=${lang}">
      ${canonicalPromptElement("send_money_menu", lang, baseUrl, actionPrompt)}
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=action-select&amp;sessionId=${sessionId}&amp;lang=${lang}&amp;retry=0"/>`;

  xmlResponse(res, xml, {
    type: "understood_intent",
    reason: "Playing selected network menu (MTN menu)",
    replyText: lang === "twi" ? "MTN Mobile Money. Sɛ wopɛ sɛ womane sika a, mia 1." : "MTN Mobile Money. To send money, press 1.",
    replyKey: "OP09",
    action: "advance",
    nextStep: "action-choice",
  });
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

  const promptElement = canonicalPromptElement(
    "OP16",
    lang,
    baseUrl,
    "Please enter the recipient's ten-digit phone number, followed by hash."
  );

  const xml = `    <GetDigits timeout="35" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">
      ${promptElement}
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="12" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-recipient&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  xmlResponse(res, xml, {
    type: "understood_intent",
    reason: "Enter Recipient Phone Number",
    replyText: "Yɛsrɛ wo, bɔ obi a woremane no no fon nɔmba a ɛyɛ du na fa hash ka ho.",
    replyKey: "OP16",
    action: "advance",
    nextStep: "enter-recipient",
  });
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
    const invalidRecipientPrompt = canonicalPromptElement("invalid_recipient", lang, baseUrl, decision.replyText);
    return xmlResponse(
      res,
      `    ${invalidRecipientPrompt}\n    <GetDigits timeout="90" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("enter_recipient", lang, baseUrl, "Please enter the recipient's ten-digit phone number.")}\n    </GetDigits>`,
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

  if (!resolution.verified || !resolution.name) {
    const message = lang === "twi"
      ? "Yɛantumi ankyerɛ recipient no din yie. Yɛsrɛ wo, fa nɔmba foforɔ bɔ mmɔden."
      : "We could not verify the recipient's name. Please enter a different number.";
    return xmlResponse(res, `    <Say voice="female">${escapeVoiceXml(message)}</Say>\n    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

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

  let verifyPrompt = "";
  const isCrossNetwork = session.network && resolution.network && session.network.toUpperCase() !== resolution.network.toUpperCase();
  const recipientFoundText = lang === "twi" ? "Yɛahu recipient no." : "We found the recipient.";
  const recipientVerifyText = lang === "twi"
    ? "Tie ne din ne fon nɔmba no yie."
    : "Please listen carefully to the name and full phone number.";
  const networkWarningText = isCrossNetwork
    ? (lang === "twi"
        ? `Saa nɔmba yi yɛ ${resolution.network}. Wopawoo ${session.network} mfitiaseɛ no. Yɛsrɛ wo, hwɛ nsɛm a ɛdidi so yi yie.`
        : `This number is on ${resolution.network}, while you selected ${session.network}. Please review the details that follow.`)
    : "";
  const choiceText = lang === "twi"
    ? "Sɛ nsɛm no yɛ nokware a, mia 1. Sɛ wopɛ sɛ wosesa recipient no a, mia 2. Sɛ wogyae a, mia 0."
    : "If these details are correct, press 1. To change the recipient, press 2. To cancel, press 0.";

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

  const xml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/recipient-verify-choice?sessionId=${sessionId}&amp;lang=${lang}">
        <Say voice="female">${escapeVoiceXml(verifyPrompt)}</Say>
    </GetDigits>
    `;

  xmlResponse(res, xml, {
    type: "understood_intent",
    reason: "Dynamic recipient readback and confirmation",
    stepId: "recipient-verify-choice",
    stepName: "recipient-verify-choice",
    replyKey: "OP23",
    replyText: verifyPrompt,
    recipientName: resolution.name || undefined,
    recipientPhone: phoneValidation.normalized,
  } as any);
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
    const cancelledText = lang === "twi" ? "Yɛatwa mu." : "Transaction cancelled.";
    return xmlResponse(res, `    ${canonicalPromptElement("cancel", lang, baseUrl, cancelledText)}\n    ${canonicalPromptElement("exit", lang, baseUrl, lang === "twi" ? "Nante yie." : "Goodbye.")}\n    <Reject/>`);
  }
  if (dtmf === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${session.recipientPhone || ""}</Redirect>`);
  }
  if (dtmf === "2" || dtmf === "8") {
    recipientLookups.delete(session);
    transactionStateMachine.transition(sessionId, session.state, {
      recipientPhone: null,
      recipientName: null,
      isRecipientVerified: false,
      amount: null,
    });
    session.retryCount = 0;
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  if (dtmf !== "1") {
    const choiceText = lang === "twi"
      ? "Sɛ nsɛm no yɛ nokware a, mia 1. Sɛ wopɛ sɛ wosesa recipient no a, mia 2. Sɛ wogyae a, mia 0."
      : "If these details are correct, press 1. To change the recipient, press 2. To cancel, press 0.";
    return xmlResponse(res, `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/recipient-verify-choice?sessionId=${sessionId}&amp;lang=${lang}">
        ${canonicalPromptElement("recipient_confirm_speech", lang, baseUrl, choiceText)}
    </GetDigits>`);
  }

  if (!session.recipientPhone || !session.recipientName || !session.isRecipientVerified) {
    return xmlResponse(res, `    <Say voice="female">${lang === "twi"
      ? "Yɛrentumi nnye recipient yi ntom. Yɛsrɛ wo san hyɛ nɔmba no."
      : "We cannot confirm this recipient. Please enter the number again."}</Say>
    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  // If confirmed with 1, update session network to resolved recipient network if cross-network
  const activeLookup = recipientLookups.get(session);
  if (activeLookup?.result?.network) {
    session.network = activeLookup.result.network;
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

  const amountPromptElement = canonicalPromptElement(
    "OP26",
    lang,
    baseUrl,
    "Please enter the amount you want to send, followed by hash."
  );

  // 30 second window with star for pesewas, wait strictly for finishOnKey #
  const xml = `    <GetDigits timeout="30" finishOnKey="#" callbackUrl="${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}">
        ${amountPromptElement}
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="8" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-amount&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  xmlResponse(res, xml, {
    type: "understood_intent",
    reason: "Enter Transfer Amount",
    replyText: "Sika dodoɔ sɛn na wopɛ sɛ womane? Bɔ sika no na fa hash ka ho.",
    replyKey: "OP26",
    action: "advance",
    nextStep: "enter-amount",
  });
});

// ── Step 9: Amount Verification & Routing to PIN Entry ────────────────
ivrRouter.all("/verify-amount", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const rawDigits = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim().replace(/#+$/, "");
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (rawDigits === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    const cancelledText = lang === "twi" ? "Yɛatwa mu." : "Transaction cancelled.";
    return xmlResponse(res, `    ${canonicalPromptElement("cancel", lang, baseUrl, cancelledText)}\n    ${canonicalPromptElement("exit", lang, baseUrl, lang === "twi" ? "Nante yie." : "Goodbye.")}\n    <Reject/>`);
  }
  if (!session.recipientPhone || !session.isRecipientVerified) {
    const message = lang === "twi"
      ? "Yɛsrɛ wo, di kan hwɛ recipient no ansa na woahyɛ sika dodoɔ no."
      : "Please verify the recipient before entering an amount.";
    return xmlResponse(
      res,
      `    <Say voice="female">${escapeVoiceXml(message)}</Say>\n    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`
    );
  }
  if (rawDigits === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (rawDigits === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  const amountValidation = parseAndValidateAmount(rawDigits);
  const amountTooHigh = amountValidation.error?.includes("exceeds single transaction limit") === true;
  const amountTooLow = amountValidation.valid
    && amountValidation.amount !== undefined
    && amountValidation.amount < FINANCIAL_LIMITS.MIN_AMOUNT_GHS;
  if (!amountValidation.valid || amountValidation.amount === undefined || amountTooLow) {
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
    const promptKey = amountTooHigh ? "amount_too_high" : amountTooLow ? "amount_too_low" : "invalid_amount";
    decision.replyText = amountTooHigh
      ? (lang === "twi"
        ? "Sika dodow no dɔɔso sen GHS 5,000 a yɛpene so. Yɛsrɛ wo, hyɛ sika dodow a ɛba fam."
        : "That amount is above the GHS 5,000 limit. Please enter a lower amount.")
      : amountTooLow
      ? (lang === "twi"
        ? "Sika dodow no sua sen GHS 1.00. Yɛsrɛ wo, hyɛ sika dodow a ɛboro saa."
        : "That amount is below the GHS 1.00 minimum. Please enter a higher amount.")
      : (lang === "twi"
        ? "Sika dodow no nyɛ pɛpɛɛpɛ. Yɛsrɛ wo, san hyɛ sika dodow no."
        : decision.replyText);
    const invalidPromptXml = canonicalPromptElement(promptKey, lang, baseUrl, decision.replyText);
    return xmlResponse(
      res,
      `    ${invalidPromptXml}\n    <GetDigits timeout="25" finishOnKey="#" callbackUrl="${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}&amp;ref=/enter-amount&amp;err=invalid">\n        ${canonicalPromptElement("enter_amount", lang, baseUrl, "Please enter the amount in Ghana Cedis.")}\n    </GetDigits>`,
      decision
    );
  }

  session.retryCount = 0;
  // Transition only after recipient verification has passed.
  transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", {
    amount: amountValidation.amount,
  });

  // Every valid amount must be read back and explicitly confirmed before authorization.
  xmlResponse(res, `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
});

// ── Step 10: Safe Confirmation (DYNAMIC READBACK) ─────────────────────
// CRITICAL: NEVER plays static 500 GHS audio. Generates dynamic VoiceXML for caller's exact inputs!
ivrRouter.all("/safe-confirmation", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (
    !session.amount ||
    !session.recipientPhone ||
    !session.recipientName ||
    !session.isRecipientVerified ||
    !SUPPORTED_TRANSFER_NETWORKS.includes(session.network)
  ) {
    const promptText = lang === "twi"
      ? "Sika no ano anaa nipa no fon nɔma nni hɔ yie. Mepa wo kyɛw, san hyɛ aseɛ bio."
      : "Transfer amount or recipient number is missing. Please restart.";
    return xmlResponse(res, `<Say>${promptText}</Say><Redirect>${baseUrl}/voice-menu?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  const amount = session.amount;
  const recipientPhone = session.recipientPhone;
  const recipientName = session.recipientName;
  const isVerified = session.isRecipientVerified;

  const readbackFingerprint = financialPolicy.fingerprint({
    operation: "TRANSFER",
    sessionId,
    senderPhone: session.callerPhone,
    recipientPhone,
    amount,
    currency: "GHS",
    network: session.network,
  });
  transactionStateMachine.recordConfirmationReadback(sessionId, readbackFingerprint);

  const callbackUrl = `${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}`;

  const { spokenText } = buildSafeConfirmationPrompt({
    language: lang,
    amount,
    recipientPhone,
    recipientName,
    network: session.network,
    isVerified,
    callbackUrl,
  });
  const confirmationChoices = lang === "twi"
    ? "Sɛ nsɛm no yɛ nokware a, mia 1. Sɛ wopɛ sɛ wosesa sika no a, mia 2. Sɛ wopɛ sɛ wosesa recipient no a, mia 3. Sɛ wopɛ sɛ wogyae a, mia 0."
    : "Press 1 to confirm. To change the amount, press 2. To change the recipient, press 3. To cancel, press 0.";
  const voiceXml = `    <GetDigits timeout="90" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">
        <Say voice="female">${escapeVoiceXml(spokenText)}</Say>
        ${canonicalPromptElement("confirm_continue", lang, baseUrl, confirmationChoices)}
    </GetDigits>`;

  auditLogger.log("info", "TELEPHONY", "Dynamic safe confirmation generated from validated session values.", sessionId);
  xmlResponse(res, voiceXml);
});

// ── Step 11b: Secure handset authorization instructions ────────────────
ivrRouter.all("/pin-handoff", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const pinPrompt = lang === "twi"
    ? "Hwɛ wo fon screen so na di wo Mobile Money provider no private akwankyerɛ so. Mma nka wo PIN wɔ fon frɛ yi so da."
    : "Check your handset and follow your Mobile Money provider's private authorization prompt. Never say or enter your PIN in this service.";
  const pinPromptAction = canonicalPromptElement("OP40", lang, baseUrl, pinPrompt);

  xmlResponse(res, `    ${pinPromptAction}\n    <Reject/>`, {
    type: "understood_intent",
    reason: "Secure provider handset authorization handoff",
    replyText: pinPrompt,
    replyKey: "OP40",
    action: "advance",
  });
});

// ── Step 12: Confirm Speech (After PIN Entered) ────────────────────────
ivrRouter.all("/confirm-speech", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const confirmPrompt = lang === "twi"
    ? "Sɛ wopene so a, mia baako (1) anaasɛ ka aane. Sɛ wopɛ sɛ wotwa mu a, mia mmienu (2) anaasɛ ka dabi."
    : "To confirm and submit, press 1 or say yes. To cancel, press 2 or say no.";

  const xml = `    <GetDigits timeout="15" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/safe-outcome?sessionId=${sessionId}&amp;lang=${lang}">
        ${canonicalPromptElement("OP37", lang, baseUrl, confirmPrompt)}
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

  if (dtmf === "1" && !SUPPORTED_TRANSFER_NETWORKS.includes(session.network)) {
    transactionStateMachine.transition(sessionId, "FAILED", {
      failureReason: "The selected transfer route is not verified and supported.",
    });
    res.set("X-Payment-Status", "FAILED");
    const unsupportedRouteText = lang === "twi"
      ? "Yɛrentumi mfa network yi so nyɛ transfer yi seesei. Yɛboa MTN ne Telecel nkutoo."
      : "This transfer route is not currently supported. The service currently supports MTN and Telecel numbers only. No payment was submitted.";
    return xmlResponse(res, `    ${canonicalPromptElement("unsupported_service", lang, baseUrl, unsupportedRouteText)}
    <Reject/>`);
  }

  if (dtmf === "1") {
    const currentFingerprint = financialPolicy.fingerprint({
      operation: "TRANSFER",
      sessionId,
      senderPhone: session.callerPhone,
      recipientPhone: session.recipientPhone || undefined,
      amount: session.amount || undefined,
      currency: "GHS",
      network: session.network,
    });
    const readbackMatches =
      Boolean(session.confirmationReadbackFingerprint) &&
      session.confirmationReadbackFingerprint === currentFingerprint &&
      typeof session.confirmationReadbackAt === "number" &&
      Date.now() - session.confirmationReadbackAt <= FINANCIAL_LIMITS.CONFIRMATION_TTL_MS;
    if (!readbackMatches) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}</Redirect>`);
    }
  }

  if (dtmf === "2") {
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", { amount: null });
    session.retryCount = 0;
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  if (dtmf === "3") {
    recipientLookups.delete(session);
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: null,
      recipientName: null,
      isRecipientVerified: false,
      amount: null,
    });
    session.retryCount = 0;
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  if (dtmf === "8") {
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", { amount: null });
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

    if (!session.isRecipientVerified) {
      transactionStateMachine.transition(sessionId, "FAILED", {
        failureReason: "The selected transfer route is not verified and supported.",
      });
      return xmlResponse(res, `    <Say voice="female">${lang === "twi"
        ? "Yɛrentumi mfa network yi so nyɛ transfer yi seesei."
        : "The recipient is not verified. No payment was submitted."}</Say>\n    <Reject/>`);
    }

    transactionStateMachine.transition(sessionId, "CONFIRMED");
    transactionStateMachine.transition(sessionId, "PIN_PENDING", {
      momoReferenceId: session.referenceId,
    });

    auditLogger.log(
      "info",
      "MOMO",
      `Confirmed transfer submitted for provider handset authorization (Session: ${sessionId}, Ref: ${session.referenceId})`,
      sessionId
    );

    const sagaResult = await paymentSaga.executeConfirmedTransferSaga({
      sessionId,
      senderPhone: session.callerPhone,
      recipientPhone: session.recipientPhone,
      recipientName: session.recipientName || undefined,
      amount: session.amount,
      network: session.network,
      confirmedDraftHash: session.idempotencyKey,
    });

    const authoritativeSuccess = financialPolicy.isAuthoritativeCompletion({
      status: sagaResult.status,
      source: sagaResult.mode === "MOCK_PROVIDER" ? "mock_sandbox" : "real_provider",
      financialTransactionId: sagaResult.saga.providerFinancialTransactionId,
    });

    if (authoritativeSuccess) {
      transactionStateMachine.transition(sessionId, "COMPLETED");
      const receipt = buildReceiptPrompt({
        language: lang,
        amount: session.amount,
        recipientPhone: session.recipientPhone,
        recipientName: session.recipientName,
        referenceId: sagaResult.saga.collectionReference || session.referenceId,
        timestamp: new Date(),
        status: "SUCCESSFUL",
      });
      const successPrompt = canonicalPromptElement(
        "success_sent",
        lang,
        baseUrl,
        lang === "twi" ? "Wo transfer no ayɛ yie." : "Your transfer is complete."
      );
      return xmlResponse(res, `    ${successPrompt}\n    <Say voice="female">${escapeVoiceXml(receipt.spokenText)}</Say>\n    <Reject/>`, {
        type: "transaction_success",
        stepId: "transfer-success",
        stepName: "transfer-success",
        replyText: receipt.spokenText,
        outcome: "SUCCESSFUL",
        amount: session.amount,
      });
    }

    if (sagaResult.status === "FAILED") {
      transactionStateMachine.transition(sessionId, "FAILED", {
        failureReason: sagaResult.saga.failureReason || "Provider declined or failed the transaction.",
      });
      const failedText = lang === "twi"
        ? "Provider no antumi ammene wo transfer no. Hwɛ wo Mobile Money tebea ansa na wosan bɔ mmɔden."
        : "Your provider could not complete the transfer. Check your Mobile Money status before trying again.";
      const failurePrompt = canonicalPromptElement("OP58", lang, baseUrl, failedText);
      return xmlResponse(res, `    ${failurePrompt}\n    <Reject/>`, {
        type: "transaction_failed",
        stepId: "transfer-failed",
        outcome: "FAILED",
        replyText: failedText,
        replyKey: "OP58",
      });
    }

    const isAwaitingAuthorization = sagaResult.status === "PENDING";
    const pendingText = isAwaitingAuthorization
      ? lang === "twi"
        ? "Wo adesrɛ no akɔma provider no. Hwɛ wo fon so na pene so wɔ wo Mobile Money provider no private akwankyerɛ so. Mfa wo PIN nka anaa nhyɛ wɔ assistant yi mu da. Yɛrentumi nka sɛ transfer no ayɛ yie kosi sɛ provider no bɛsi so dua."
        : "Your request was sent to your Mobile Money provider. Check your handset and follow its private authorization prompt. Never speak or enter your PIN in this assistant. This transfer is not successful until your provider confirms it."
      : lang === "twi"
        ? "Yɛretwɛn sɛ yɛbɛgye transaction no tebea a ɛyɛ nokware afi provider no hɔ. Yɛrentumi nsi so dua sɛ transfer no ayɛ yie seesei."
        : "We are still verifying the transaction with your provider. We cannot confirm that the transfer succeeded yet.";
    const pendingPrompt = canonicalPromptElement(
      isAwaitingAuthorization ? "OP40" : "waiting_confirmation",
      lang,
      baseUrl,
      pendingText
    );
    return xmlResponse(res, `    ${pendingPrompt}\n    <Reject/>`, {
      type: "transaction_pending",
      stepId: isAwaitingAuthorization ? "provider-authorization-pending" : "provider-status-pending",
      outcome: sagaResult.status,
      providerMode: sagaResult.mode,
      referenceId: sagaResult.saga.collectionReference,
      replyText: pendingText,
      replyKey: isAwaitingAuthorization ? "OP40" : "OP46",
    });
  } catch (err: any) {
    auditLogger.log("error", "MOMO", `Handoff execution failed: ${err.message}`, sessionId);
    transactionStateMachine.transition(sessionId, "FAILED", {
      failureReason: err.message,
    });

    const errorMsg = lang === "twi"
      ? "Fakyɛ yɛn, sika no antumi ankɔ. Yɛsrɛ wo, bɔ mmɔden biom akyire yi."
      : "We are sorry, your transfer could not be initiated at this time. Please try again later.";
    return xmlResponse(res, `    ${canonicalPromptElement("system_error", lang, baseUrl, errorMsg)}
    <Reject/>`);
  } finally {
    paymentInitiations.delete(session);
  }
});

ivrRouter.all("/check-status", (req: Request, res: Response) => {
  const sessionId = String(req.query?.sessionId || req.body?.sessionId || "");
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = String(req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim();
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getSession(sessionId);

  if (!session || !["PIN_PENDING", "COMPLETED", "FAILED"].includes(session.state)) {
    res.set("X-Payment-Status", "UNKNOWN");
    const unknownText = lang === "twi"
      ? "Yɛrentumi nnhwɛ transaction yi tebea. Yɛrentumi nka sɛ edi nkonim."
      : "We cannot verify this transaction status. No completion is confirmed.";
    return xmlResponse(res, `    ${canonicalPromptElement("system_error", lang, baseUrl, unknownText)}
    <Reject/>`);
  }

  const saga = paymentSaga.getLatestSagaForSession(sessionId);
  if (saga?.state === "COMPLETED" && saga.providerFinancialTransactionId) {
    if (session.state === "PIN_PENDING") transactionStateMachine.transition(sessionId, "COMPLETED");
    res.set("X-Payment-Status", "SUCCESSFUL");
    const receipt = resolvePromptSpokenText("OP52", lang, {
      amount: session.amount ?? undefined,
      recipientName: session.recipientName || undefined,
      referenceId: session.referenceId,
    });
    const anotherPrompt = lang === "twi"
      ? "Wopɛ transfer foforɔ a ɛwɔ hɔ a? Mia 1. Sɛ wowie a, mia 0."
      : "Would you like another supported transfer? Press 1. To finish, press 0.";
    const successXml = `    <Say voice="female">${escapeVoiceXml(receipt)}</Say>
    <GetDigits timeout="90" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/post-success-choice?sessionId=${sessionId}&amp;lang=${lang}">
      ${canonicalPromptElement("anything_else", lang, baseUrl, anotherPrompt)}
    </GetDigits>`;
    return xmlResponse(res, successXml, {
      type: "transaction_success",
      replyKey: "OP52",
      replyText: receipt,
      outcome: "SUCCESSFUL",
    });
  }

  if (saga && ["COLLECTION_FAILED", "DISBURSEMENT_FAILED", "CUSTOMER_DECLINED"].includes(saga.state)) {
    if (session.state === "PIN_PENDING") {
      transactionStateMachine.transition(sessionId, "FAILED", {
        failureReason: saga.failureReason || "Provider reported transaction failure.",
      });
    }
    res.set("X-Payment-Status", "FAILED");
    const failureText = lang === "twi"
      ? "Provider no ampa sɛ transfer no antumi ankɔ. Yɛrenka sɛ edi nkonim."
      : "The provider reported that the transfer failed. It has not completed.";
    return xmlResponse(res, `    ${canonicalPromptElement("transaction_failed", lang, baseUrl, failureText)}
    <Reject/>`, {
      type: "transaction_failed",
      replyKey: "OP58",
      outcome: "FAILED",
    });
  }

  if (dtmf === "0") {
    res.set("X-Payment-Status", "PENDING");
    const pendingExitText = lang === "twi"
      ? "Transaction no da so retwɛn. Yɛsrɛ wo, hwɛ wo phone status ansa na wobɔ transfer foforɔ. Nante yie."
      : "The transaction is still pending. Check your handset status before starting another transfer. Goodbye.";
    return xmlResponse(res, `    ${canonicalPromptElement("waiting_confirmation", lang, baseUrl, pendingExitText)}
        ${canonicalPromptElement("exit", lang, baseUrl, lang === "twi" ? "Meda wo ase. Nante yie." : "Thank you. Goodbye.")}
    <Reject/>`);
  }

  res.set("X-Payment-Status", "PENDING");
  const waitingText = lang === "twi"
    ? "Transaction no da so retwɛn provider no mmuae. Mfa transfer foforɔ mmɔ mmɔden."
    : "Your transaction is still pending provider confirmation. Do not start another transfer.";
  const waitingChoices = lang === "twi"
    ? "Mia 0 sɛ wopɛ sɛ wope frɛ no, anaa twɛn na yɛbɛsan ahwɛ tebea no."
    : "Press 0 to end this call, or stay on the line while we check again.";
  const waitingPrompt = `${waitingText} ${waitingChoices}`;
  const waitingXml = `    <GetDigits timeout="90" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/check-status?sessionId=${sessionId}&amp;lang=${lang}">
        ${canonicalPromptElement("waiting_confirmation", lang, baseUrl, waitingText)}
        <Say voice="female">${escapeVoiceXml(waitingChoices)}</Say>
    </GetDigits>`;
  return xmlResponse(res, waitingXml, {
    type: "transaction_pending",
    stepId: "waiting-confirmation",
    replyKey: "OP46",
    replyText: waitingPrompt,
    outcome: "PENDING",
  });
});

ivrRouter.all("/post-success-choice", (req: Request, res: Response) => {
  const sessionId = String(req.query?.sessionId || req.body?.sessionId || "");
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = String(req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim();
  const baseUrl = getBaseUrl(req);
  const current = transactionStateMachine.getSession(sessionId);

  if (dtmf === "0") {
    return xmlResponse(res, `    ${canonicalPromptElement("exit", lang, baseUrl, lang === "twi" ? "Meda wo ase. Nante yie." : "Thank you. Goodbye.")}
    <Reject/>`);
  }
  if (dtmf === "1" && current?.state === "COMPLETED") {
    const nextSessionId = `${sessionId}_NEXT_${Date.now()}`;
    transactionStateMachine.getOrCreateSession(nextSessionId, lang, "VOICE");
    transactionStateMachine.transition(nextSessionId, "INITIATED", {
      callerPhone: current.callerPhone,
      network: current.network,
      interactionMode: "GUIDED_IVR",
    });
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${nextSessionId}&amp;lang=${lang}</Redirect>`);
  }

  const prompt = lang === "twi"
    ? "Mia 1 sɛ wopɛ transfer foforɔ, anaa mia 0 sɛ wowie."
    : "Press 1 for another supported transfer, or press 0 to finish.";
  return xmlResponse(res, `    <GetDigits timeout="90" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/post-success-choice?sessionId=${sessionId}&amp;lang=${lang}">
        ${canonicalPromptElement("anything_else", lang, baseUrl, prompt)}
    </GetDigits>`);
});

function refuseVoicePin(res: Response, sessionId: string, lang: "en" | "twi"): void {
  const current = transactionStateMachine.getSession(sessionId);
  const paymentStatus = current?.state === "COMPLETED" ? "SUCCESSFUL" : "PENDING";
  const message = lang === "twi"
    ? "Mfa wo Mobile Money PIN nka wɔ frɛ yi mu. Fa wo handset so pene so. Yɛrentumi nnye saa frɛ yi mu PIN sɛ transfer ho adanse."
    : "Do not enter or say your Mobile Money PIN here. Approve the request on your handset. A PIN entered on this call is not proof of payment.";
  res.set("X-Payment-Status", paymentStatus);
  return xmlResponse(res, `    <Say voice="female">${escapeVoiceXml(message)}</Say>\n    <Reject/>`);
}

// PIN entry is exclusively handled by the provider's secure handset prompt.
ivrRouter.all("/enter-pin", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "twi") as "en" | "twi";
  return refuseVoicePin(res, sessionId, lang);
});

ivrRouter.all("/verify-pin", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "twi") as "en" | "twi";
  return refuseVoicePin(res, sessionId, lang);
});

// ── Speech Recognition Fallback Handler ───────────────────────────────
ivrRouter.all("/speech-fallback", async (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || `call_${Date.now()}`) as string;
  const step = (req.query?.step || req.body?.step || "language-selection") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const provider = (req.query?.provider || req.body?.provider || "") as string;
  const phone = (req.query?.phone || req.body?.phone || "") as string;
  const name = (req.query?.name || req.body?.name || "") as string;
  const recordingUrl = (
    req.body?.recordingUrl ||
    req.body?.RecordingUrl ||
    req.body?.recordingURL ||
    req.query?.recordingUrl ||
    req.query?.RecordingUrl ||
    req.query?.recordingURL ||
    ""
  ) as string;
  const directDtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const speechText = (req.body?.speechText || req.query?.speechText || "").trim() as string;
  const retry = parseInt((req.query?.retry || req.body?.retry || "0") as string, 10) || 0;
  const baseUrl = getBaseUrl(req);

  if (["enter-pin", "verify-pin", "pin-handoff"].includes(step)) {
    auditLogger.log(
      "warn",
      "SECURITY",
      "Speech callback ignored during provider PIN authorization.",
      sessionId,
    );
    return refuseVoicePin(res, sessionId, lang);
  }

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
      asrProvider = stt.provider || "unknown";
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
    const phoneValidation = validateGhanaPhoneNumber(digits);
    if (phoneValidation.valid && phoneValidation.normalized) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${encodeURIComponent(phoneValidation.normalized)}</Redirect>`);
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
        telephonyContext: {
          currentStep: step,
          recipientVerified: session.isRecipientVerified,
          transactionState: session.state,
        },
        draft: {
          intent: transferInProgress ? "momo.transfer" : undefined,
          slots,
        },
        callerNumber: session.callerPhone,
        sessionId,
      });

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
              promptId: "OP16",
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
              promptId: "OP16",
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
        const audioMatch = matchReplyToAudio(brainOutput.reply.text, lang);
        const playElement = audioMatch.audioUrl
          ? `<Play url="${escapeVoiceXml(`${baseUrl}${audioMatch.audioUrl}`)}"/>`
          : "";
        return xmlResponse(res, `    ${playElement}\n    <Say voice="female">${escapeVoiceXml(brainOutput.reply.text)}</Say>\n    <Reject/>`);
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

    if (retry < 2 || !transcript || transcript === "empty") {
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
        // Canonical OP67 — Please Respond: play pre-recorded audio / spoken text, stay on current step without skipping
        const retryPrompt = lang === "twi"
          ? "Mante deɛ wofiri wo hɔ bae, yɛsrɛ wo ma yɛn mmuaeɛ!"
          : "I did not get any response from you, please give us a response!";
        return xmlResponse(
          res,
          `    ${canonicalPromptElement("OP67", lang, baseUrl, retryPrompt)}\n    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="10" timeout="60" callbackUrl="${baseUrl}/speech-fallback?step=${encodeURIComponent(step)}&amp;sessionId=${encodeURIComponent(sessionId)}&amp;lang=${lang}&amp;retry=${retry + 1}"/>`,
          {
            type: "clarify",
            reason: "Caller silence timeout: playing OP67 (Please Respond). Step retained.",
            replyText: retryPrompt,
            replyKey: "OP67",
            action: "repeat",
            nextStep: step,
          }
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
          `    <GetDigits timeout="90" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("OP16", lang, baseUrl, "Please enter the recipient's ten-digit phone number, followed by hash.")}\n    </GetDigits>`,
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
      `    <Say voice="female">${escapeVoiceXml(ivrDecision.replyText)}</Say>\n    <GetDigits timeout="90" finishOnKey="#" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">\n        ${canonicalPromptElement("enter_recipient", lang, baseUrl, "Please enter the recipient's ten-digit phone number.")}\n    </GetDigits>`,
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
simulatorRouter.get("/transaction-status", (req: Request, res: Response) => {
  const sessionId = String(req.query?.sessionId || "");
  if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
  const session = transactionStateMachine.getSession(sessionId);
  if (!session) return res.status(404).json({ error: "Transaction session not found" });
  return res.json({ status: session.state, paymentStatus: session.state });
});
simulatorRouter.use(ivrRouter);
