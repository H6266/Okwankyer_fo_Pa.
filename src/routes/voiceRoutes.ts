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

function xmlResponse(res: Response, content: string): void {
  let xml = content;
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

  if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  const envBase = (process.env.BASE_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").trim().replace(/\/+$/, "");
  if (envBase && !envBase.includes("localhost") && !envBase.includes("127.0.0.1")) {
    return envBase;
  }

  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, "");
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

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">Goodbye.</Say>\n    <Reject/>`);
  }

  const lang = dtmf === "2" ? "twi" : "en";
  session.language = lang;
  session.retryCount = 0;
  auditLogger.log("info", "TELEPHONY", `Language selected: ${lang.toUpperCase()}`, sessionId);

  // Twi flows directly to provider-select (Audio_prompt_twi_02.mp3); English goes to service-select (Audio_prompt_02.mp3)
  const nextRoute = lang === "twi" ? "provider-select" : "service-select";
  xmlResponse(res, `    <Redirect>${baseUrl}/${nextRoute}?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
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

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Transaction cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (dtmf === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?sessionId=${sessionId}</Redirect>`);
  }
  if (dtmf === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/service-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  // 1 = Mobile Money / Telecom
  xmlResponse(res, `    <Redirect>${baseUrl}/provider-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
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

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (dtmf === "8") {
    const prev = lang === "twi" ? "language-selection" : "service-select";
    return xmlResponse(res, `    <Redirect>${baseUrl}/${prev}?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (dtmf === "9" || (lang === "twi" && dtmf === "4")) {
    return xmlResponse(res, `    <Redirect>${baseUrl}/provider-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  session.network = dtmf === "2" ? "Telecel" : dtmf === "3" ? "AT" : "MTN";

  xmlResponse(res, `    <Redirect>${baseUrl}/action-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
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

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (dtmf === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/provider-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (dtmf === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/action-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  // 1 = Send Money
  if (dtmf === "1") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  // Balance query option
  if (dtmf === "5" || dtmf === "2") {
    const spoken = lang === "twi"
      ? "Mentumi nhwɛ wo wallet balance. Sɛ wopɛ sɛ wohwɛ wo deɛ a, bɔ star baako nson hwee hash wɔ wo fon so."
      : "I can't check wallet balances. To check yours, dial star one seven zero hash on your handset.";
    return xmlResponse(res, `    <Say voice="female">${spoken}</Say>\n    <Reject/>`);
  }

  xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
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
  const rawDigits = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (rawDigits === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (rawDigits === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/action-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  // Validate phone number format and prefix
  const phoneValidation = validateGhanaPhoneNumber(rawDigits);
  if (!phoneValidation.valid || !phoneValidation.normalized) {
    auditLogger.log("warn", "TELEPHONY", `Invalid recipient phone entered: ${rawDigits} (${phoneValidation.error})`, sessionId);
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;err=invalid</Redirect>`);
  }

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

  // TODO(ug-hci-tts): Replace dynamic readback prompt with UG HCI Lab TTS when connected
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

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (dtmf === "2") {
    // Re-enter recipient number
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (dtmf === "1") {
    // Confirmed recipient -> proceed to amount input
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
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
  const rawDigits = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);

  if (rawDigits === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (rawDigits === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  const amountValidation = parseAndValidateAmount(rawDigits);
  if (!amountValidation.valid || amountValidation.amount === undefined) {
    auditLogger.log("warn", "TELEPHONY", `Invalid amount entered: "${rawDigits}" (${amountValidation.error})`, sessionId);
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}&amp;err=invalid</Redirect>`);
  }

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

  // TODO(ug-hci-tts): Replace dynamic readback prompt with UG HCI Lab TTS when connected
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

  auditLogger.log("info", "TELEPHONY", `Dynamic safe confirmation generated: "${spokenText}"`, sessionId);
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
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    const exitMsg = lang === "twi"
      ? "Yɛatwa mu. Sika biara mfirii wo account mu. Nante yie."
      : "Transaction cancelled. No money has been deducted from your account. Goodbye.";
    return xmlResponse(res, `    <Say voice="female">${exitMsg}</Say>\n    <Reject/>`);
  }

  if (dtmf !== "1") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
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

    const paymentResult = await voicePaymentService.initiatePayment(session.callerPhone, session.amount);
    const collectionRef = paymentResult.fields.referenceId || session.referenceId;
    const mode = paymentResult.momoEnv === "production" ? "LIVE" : "SANDBOX";

    transactionStateMachine.transition(sessionId, "PIN_PENDING", {
      momoReferenceId: collectionRef,
    });

    auditLogger.log(
      "info",
      "MOMO",
      `Payment handoff dispatched (Mode: ${mode}, Ref: ${session.referenceId}, MoMoRef: ${collectionRef})`,
      sessionId
    );

    // TODO(ug-hci-tts): Replace handoff notice with UG HCI Lab TTS when connected
    const handoffNotice = lang === "twi"
      ? "Yɛsrɛ wo, hwɛ wo fon screen so na fa wo MoMo PIN bɔ mu ahobammbɔ mu. Sɛ ɛwie pɛ a, yɛbɛmane wo SMS asɔ so. Nante yie."
      : "Please check your phone screen and enter your Mobile Money PIN securely to authorize this transfer. We will send you an SMS confirmation once completed. Goodbye.";

    const xml = `    <Say voice="female">${handoffNotice}</Say>\n    <Reject/>`;

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

  // Spoken recipients and amounts
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

// ── Step 12: New Cognitive IVR Understand Endpoint ───────────────────
ivrRouter.post("/api/ivr/understand", async (req: Request, res: Response) => {
  const { utterance, currentStep, callState } = req.body || {};
  const text = typeof utterance === "string" ? utterance.trim() : "";
  const step = typeof currentStep === "string" ? currentStep : "welcome";
  const lang = (callState?.lang || "en") as "en" | "twi";
  const cleanLower = text.toLowerCase().replace(/[.,!?;:]/g, "").trim();

  if (!text) {
    return res.json({
      type: "unknown",
      promptKey: "wrong_figure",
      promptAudio: resolvePrompt("wrong_figure", lang),
      promptText: lang === "twi"
        ? "Wobɔɔ nɔmba a ɛnyɛ pɛpɛɛpɛ."
        : "You have entered an incorrect figure.",
    });
  }

  // 1. Clarification & Navigation commands:
  // "what is this", "i don't understand", "repeat", "go back", "pardon", "what do i do"
  if (/\b(back|go back|previous|san|akyiri)\b/i.test(cleanLower)) {
    return res.json({
      type: "clarify",
      action: "back",
      replyKey: "going_back",
      replyText: lang === "twi" ? "Yɛresan akɔ akyi." : "Going back to previous menu.",
      promptKey: "going_back",
      promptAudio: resolvePrompt("going_back", lang),
    });
  }

  if (/\b(repeat|again|say again|what did you say|what\?|what did u say|tie wei bio)\b/i.test(cleanLower)) {
    return res.json({
      type: "clarify",
      action: "repeat",
      replyKey: "let_me_repeat",
      replyText: lang === "twi" ? "Mema woate bio." : "Let me repeat the options.",
      promptKey: "let_me_repeat",
      promptAudio: resolvePrompt("let_me_repeat", lang),
    });
  }

  if (/\b(what is this|i don't understand|i dont understand|help|what do i do|muntumi nte ase)\b/i.test(cleanLower)) {
    return res.json({
      type: "clarify",
      action: "help",
      replyKey: "sorry_did_not_catch",
      replyText: lang === "twi"
        ? "Mepa wo kyɛw, tie wei na fa wo fon keypad bɔ nɔmba a wopɛ."
        : "Sorry, I did not catch that. Please listen and press a number on your keypad.",
      promptKey: "sorry_did_not_catch",
      promptAudio: resolvePrompt("sorry_did_not_catch", lang),
    });
  }

  if (/\b(cancel|exit|stop|abort|quit|gyae)\b/i.test(cleanLower)) {
    return res.json({
      type: "dtmf",
      dtmf: "0",
      reason: "cancel",
    });
  }

  // 2. Multi-slot extraction (Menu skipping e.g. "send 500 to Kwame", "transfer 50 cedis to 0553838464")
  const amt = extractAmount(text);
  const rec = extractRecipient(text);
  const net = extractNetwork(text);

  if ((amt !== null && (rec.phone || rec.name)) || (rec.phone && net) || rec.phone || (amt !== null && net)) {
    const targetStep = amt !== null && (rec.phone || rec.name) ? "safe-confirmation" : (rec.phone ? "enter-amount" : "enter-recipient");
    const sessionId = (req.body?.sessionId || callState?.sessionId) as string;
    if (sessionId) {
      const session = transactionStateMachine.getOrCreateSession(sessionId);
      if (amt !== null) session.amount = amt;
      if (rec.phone) session.recipientPhone = rec.phone;
      if (rec.name) session.recipientName = rec.name;
      if (net) session.network = net;
    }
    return res.json({
      type: "skip",
      targetStep,
      slots: {
        amount: amt || undefined,
        recipientPhone: rec.phone || undefined,
        recipientName: rec.name || undefined,
        network: net || undefined,
      },
      promptKey: targetStep === "safe-confirmation" ? "safe_confirmation" : "enter_amount",
      promptAudio: resolvePrompt(targetStep === "safe-confirmation" ? "safe_confirmation" : "enter_amount", lang),
      promptText: targetStep === "safe-confirmation"
        ? (lang === "twi" ? `Worebɛsend ${amt || 500} cedis kɔma ${rec.name || "recipient"}.` : `You are about to send ${amt || 500} cedis to ${rec.name || "recipient"}.`)
        : (lang === "twi" ? "Bɔ sika dodow a wopɛ sɛ womane no." : "Enter the amount you want to send."),
    });
  }

  // 3. Step-specific DTMF resolution:
  if (step === "welcome" || step === "language-selection") {
    if (/\b(1|one|english|baako|bako)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "1" });
    }
    if (/\b(2|two|twi|mmienu|mienu|akan)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "2" });
    }
  } else if (step === "service-select" || step === "service-choice") {
    if (/\b(1|one|momo|mobile money|telecom|baako)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "1" });
    }
    if (/\b(2|two|bank|banking|sikakorabea|mmienu)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "2" });
    }
  } else if (step === "provider-select" || step === "provider-choice") {
    if (/\b(1|one|mtn|baako)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "1" });
    }
    if (/\b(2|two|telecel|vodafone|voda|mmienu)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "2" });
    }
    if (/\b(3|three|airteltigo|at|mmiɛnsa)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "3" });
    }
  } else if (step === "action-select" || step === "action-choice") {
    if (/\b(1|one|send|send money|transfer|baako|mane)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "1" });
    }
    if (/\b(2|two|balance|check balance|my balance|mmienu)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "2" });
    }
  } else if (step === "enter-recipient" || step === "recipient") {
    const rawDigits = cleanLower.replace(/[^0-9]/g, "");
    if (rawDigits.length === 10) {
      return res.json({ type: "dtmf", dtmf: rawDigits });
    }
  } else if (step === "enter-amount" || step === "amount") {
    if (amt !== null) {
      return res.json({ type: "dtmf", dtmf: String(amt) });
    }
    const rawDigits = cleanLower.replace(/[^0-9.]/g, "");
    if (rawDigits.length > 0 && !isNaN(Number(rawDigits))) {
      return res.json({ type: "dtmf", dtmf: rawDigits });
    }
  } else if (step === "recipient-verify" || step === "recipient-verify-choice" || step === "safe-confirmation") {
    if (/\b(1|one|yes|confirm|aane|pene so|yie|ampa|proceed|baako)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "1" });
    }
    if (/\b(2|two|no|dabi|sesa|change|cancel|mmienu)\b/i.test(cleanLower)) {
      return res.json({ type: "dtmf", dtmf: "2" });
    }
  }

  // 4. Default: fallback to unknown with prompt 11 audio
  return res.json({
    type: "unknown",
    promptKey: "wrong_figure",
    replyKey: "sorry_did_not_catch",
    promptAudio: resolvePrompt("wrong_figure", lang),
    promptText: lang === "twi"
      ? "Wobɔɔ nɔmba a ɛnyɛ pɛpɛɛpɛ."
      : "You have entered an incorrect figure.",
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
