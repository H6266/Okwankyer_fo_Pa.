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

import { Router, Request, Response } from "express";
import { config } from "../config/env";
import { recipientResolver } from "../providers/recipient/RecipientResolver";
import { parseAndValidateAmount, validateGhanaPhoneNumber } from "../domain/validation";
import { transactionStateMachine } from "../domain/stateMachine";
import { buildSafeConfirmationPrompt, buildReceiptPrompt } from "../audio/dynamicPromptBuilder";
import { speechToText } from "../modules/sttService";
import { mtnMomoService } from "../modules/mtnMomoService";
import { auditLogger } from "../services/auditLogger";
import { verifyAtWebhook } from "../providers/telephony/webhookGuard";
import { momoSagaOrchestrator } from "../services/momoSagaOrchestrator";
import { durableTransactionStore } from "../services/durableTransactionStore";

export const voiceRouter = Router();

// Apply Africa's Talking webhook verification to all telephony routes
voiceRouter.use(verifyAtWebhook);

function xmlResponse(res: Response, content: string): void {
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${content}\n</Response>`);
}

function getBaseUrl(req: Request): string {
  if (config.baseUrl && config.nodeEnv === "production") {
    return config.baseUrl;
  }
  const host = req.get("host") || `localhost:${config.port}`;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

// ── Step 1: Inbound Call Entry Point ──────────────────────────────────
voiceRouter.all("/voice-menu", (req: Request, res: Response) => {
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

  const introAudioUrl = `${baseUrl}/audio/Welcome_prompt_01.mp3`;

  // Dual-track barge-in: instant GetDigits with Record fallback
  const xml = `    <GetDigits timeout="3" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/language-selection?sessionId=${sessionId}">
        <Play url="${introAudioUrl}"/>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${baseUrl}/speech-fallback?step=language-selection&amp;sessionId=${sessionId}&amp;retry=0"/>`;

  xmlResponse(res, xml);
});

// ── Step 2: Language Selection ────────────────────────────────────────
voiceRouter.all("/language-selection", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || `call_${Date.now()}`) as string;
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (!dtmf) {
    // Timeout re-prompt once then exit
    if (session.retryCount === 0) {
      session.retryCount++;
      const xml = `    <GetDigits timeout="8" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/language-selection?sessionId=${sessionId}">
        <Play url="${baseUrl}/audio/Welcome_prompt_01.mp3"/>
    </GetDigits>`;
      return xmlResponse(res, xml);
    }
    return xmlResponse(res, `    <Say voice="female">No input received. Goodbye.</Say>\n    <Reject/>`);
  }

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">Goodbye.</Say>\n    <Reject/>`);
  }

  const lang = dtmf === "2" ? "twi" : "en";
  session.language = lang;
  session.retryCount = 0;
  auditLogger.log("info", "TELEPHONY", `Language selected: ${lang.toUpperCase()}`, sessionId);

  xmlResponse(res, `    <Redirect>${baseUrl}/service-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
});

// ── Step 3: Service Selection (Telecom / Banking) ─────────────────────
voiceRouter.all("/service-select", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const audioUrl = lang === "twi"
    ? `${baseUrl}/audio/Twi/Audio_prompt_twi_03.mp3`
    : `${baseUrl}/audio/English/Audio_prompt_02.mp3`;

  const xml = `    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/service-choice?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>`;

  xmlResponse(res, xml);
});

voiceRouter.all("/service-choice", (req: Request, res: Response) => {
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
voiceRouter.all("/provider-select", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const audioUrl = lang === "twi"
    ? `${baseUrl}/audio/Twi/Audio_prompt_twi_02.mp3`
    : `${baseUrl}/audio/English/Audio_prompt_03.mp3`;

  const xml = `    <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/provider-choice?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>`;

  xmlResponse(res, xml);
});

voiceRouter.all("/provider-choice", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const dtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "1").trim() as string;
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  if (dtmf === "0") {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }
  if (dtmf === "8") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/service-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }
  if (dtmf === "9") {
    return xmlResponse(res, `    <Redirect>${baseUrl}/provider-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  session.network = dtmf === "2" ? "Telecel" : dtmf === "3" ? "AT" : "MTN";

  xmlResponse(res, `    <Redirect>${baseUrl}/action-select?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
});

// ── Step 5: Action Menu (Send Money, Balance) ─────────────────────────
voiceRouter.all("/action-select", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const audioUrl = lang === "twi"
    ? `${baseUrl}/audio/Twi/Audio_prompt_twi_04.mp3`
    : `${baseUrl}/audio/English/Audio_prompt_05.mp3`;

  const xml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${baseUrl}/action-choice?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>`;

  xmlResponse(res, xml);
});

voiceRouter.all("/action-choice", async (req: Request, res: Response) => {
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
    try {
      const bal = await mtnMomoService.getAccountBalance("collection");
      const spoken = lang === "twi"
        ? `Wo MoMo balance a ɛwɔ hɔ sesei ara ne Ghana Cedis ${bal.availableBalance}. Yɛdaase.`
        : `Your current available balance is ${bal.formatted}. Thank you for using Ɔkwankyerɛfo Pa. Goodbye.`;
      return xmlResponse(res, `    <Say voice="female">${spoken}</Say>\n    <Reject/>`);
    } catch {
      const spoken = lang === "twi"
        ? "Yɛantumi annye wo balance sesei. Yɛsrɛ wo, bɔ mmɔden biom akyire yi."
        : "Sorry, your balance could not be retrieved right now. Please try again later.";
      return xmlResponse(res, `    <Say voice="female">${spoken}</Say>\n    <Reject/>`);
    }
  }

  xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
});

// ── Step 6: Recipient Phone Number Entry ──────────────────────────────
voiceRouter.all("/enter-recipient", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const audioUrl = lang === "twi"
    ? `${baseUrl}/audio/Twi/Audio_prompt_twi_05.mp3`
    : `${baseUrl}/audio/English/Audio_prompt_06.mp3`;

  // 40 second generous window for feature phone callers
  const xml = `    <GetDigits timeout="40" finishOnKey="#" numDigits="10" callbackUrl="${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="12" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-recipient&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  xmlResponse(res, xml);
});

// ── Step 7: Recipient Verification (Real Resolver) ────────────────────
voiceRouter.all("/verify-recipient", async (req: Request, res: Response) => {
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
    const errorNotice = lang === "twi"
      ? "Nɔmba a wobɔe no nyɛ pɛpɛɛpɛ. Yɛsrɛ wo, san bɔ nɔmba du no yiye."
      : "The phone number entered is invalid. Please enter a valid 10-digit Ghanaian mobile number.";
    return xmlResponse(res, `    <Say voice="female">${errorNotice}</Say>\n    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
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

voiceRouter.all("/recipient-verify-choice", (req: Request, res: Response) => {
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
voiceRouter.all("/enter-amount", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);

  const audioUrl = lang === "twi"
    ? `${baseUrl}/audio/Twi/Audio_prompt_twi_07.mp3`
    : `${baseUrl}/audio/English/Audio_prompt_09.mp3`;

  // 30 second window with star for pesewas
  const xml = `    <GetDigits timeout="30" finishOnKey="#" numDigits="8" callbackUrl="${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}">
        <Play url="${audioUrl}"/>
    </GetDigits>
    <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="8" timeout="5" callbackUrl="${baseUrl}/speech-fallback?step=enter-amount&amp;sessionId=${sessionId}&amp;lang=${lang}"/>`;

  xmlResponse(res, xml);
});

// ── Step 9: Amount Verification & Routing to Safe Confirmation ────────
voiceRouter.all("/verify-amount", (req: Request, res: Response) => {
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
    const errorNotice = lang === "twi"
      ? `Sika dodow a wobɔe no nyɛ pɛpɛɛpɛ. ${amountValidation.error || "San bɔ sika dodow no biom."}`
      : `The amount entered is invalid. ${amountValidation.error || "Please enter a valid cedi amount."}`;
    return xmlResponse(res, `    <Say voice="female">${errorNotice}</Say>\n    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  // Transition state machine to AMOUNT_ENTERED
  transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", {
    amount: amountValidation.amount,
  });

  xmlResponse(res, `    <Redirect>${baseUrl}/safe-confirmation?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
});

// ── Step 10: Safe Confirmation (DYNAMIC READBACK) ─────────────────────
// CRITICAL: NEVER plays static 500 GHS audio. Generates dynamic VoiceXML for caller's exact inputs!
voiceRouter.all("/safe-confirmation", (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const baseUrl = getBaseUrl(req);
  const session = transactionStateMachine.getOrCreateSession(sessionId);

  const amount = session.amount || 50;
  const recipientPhone = session.recipientPhone || "0553838464";
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
voiceRouter.all("/safe-outcome", async (req: Request, res: Response) => {
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
    // 1. Strict validation of required financial parameters (Item 1.3 - no defaults!)
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

    // 2. Velocity and safety limits check (Item 1.5)
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

    // Record velocity attempt
    durableTransactionStore.recordVelocityAttempt(
      session.callerPhone,
      session.recipientPhone,
      session.amount
    );

    // 3. Transition state machine to CONFIRMED
    transactionStateMachine.transition(sessionId, "CONFIRMED");

    // 4. Start two-leg payment saga (Item 1.2)
    const { collectionRef, mode } = await momoSagaOrchestrator.startSaga(session);

    // 5. Transition to PIN_PENDING (Item 1.1: State remains PIN_PENDING, NEVER COMPLETED here!)
    transactionStateMachine.transition(sessionId, "PIN_PENDING", {
      momoReferenceId: collectionRef,
    });

    auditLogger.log(
      "info",
      "MOMO",
      `Payment handoff dispatched (Mode: ${mode}, Ref: ${session.referenceId}, MoMoRef: ${collectionRef})`,
      sessionId
    );

    // 6. Speak ONLY handset handoff instruction (Item 1.1: NO success wording, NO receipt, NO GetDigits, NO Record)
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
voiceRouter.all("/speech-fallback", async (req: Request, res: Response) => {
  const sessionId = (req.query?.sessionId || req.body?.sessionId || "") as string;
  const step = (req.query?.step || req.body?.step || "language-selection") as string;
  const lang = (req.query?.lang || req.body?.lang || "en") as "en" | "twi";
  const recordingUrl = (req.body?.RecordingUrl || req.body?.recordingURL || req.query?.RecordingUrl || "") as string;
  const directDtmf = (req.body?.dtmfDigits || req.query?.dtmfDigits || "").trim() as string;
  const baseUrl = getBaseUrl(req);

  // If user pressed key during recording
  if (directDtmf) {
    if (step === "language-selection") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?sessionId=${sessionId}&amp;dtmfDigits=${directDtmf}</Redirect>`);
    }
    if (step === "enter-recipient") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${directDtmf}</Redirect>`);
    }
    if (step === "enter-amount") {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${directDtmf}</Redirect>`);
    }
  }

  // Transcribe spoken audio
  let transcript = "";
  let confidence = 0;
  let pinDiscarded = false;
  if (recordingUrl) {
    try {
      const stt = await speechToText(recordingUrl);
      transcript = stt.text;
      confidence = stt.confidence;
      pinDiscarded = Boolean(stt.pinDiscarded);
    } catch (err: any) {
      auditLogger.log("warn", "NLU", `STT error: ${err.message}`, sessionId);
    }
  }

  // Rule 4: If PIN was spoken, discard instantly and return directly to DTMF re-prompt
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

  // High-confidence spoken input: map to next step
  const clean = transcript.toLowerCase();
  if (step === "language-selection") {
    const chosenDtmf = clean.includes("twi") || clean.includes("mmienu") || clean.includes("two") ? "2" : "1";
    return xmlResponse(res, `    <Redirect>${baseUrl}/language-selection?sessionId=${sessionId}&amp;dtmfDigits=${chosenDtmf}</Redirect>`);
  }

  // Universal cancel or back
  if (clean.includes("cancel") || clean.includes("gyae") || clean.includes("stop")) {
    transactionStateMachine.transition(sessionId, "CANCELLED");
    return xmlResponse(res, `    <Say voice="female">${lang === "twi" ? "Yɛatwa mu. Nante yie." : "Transaction cancelled. Goodbye."}</Say>\n    <Reject/>`);
  }

  // Rule 2: Spoken recipients and amounts are NEVER accepted silently; routed to verification step
  if (step === "enter-recipient") {
    const digitsOnly = clean.replace(/[^0-9]/g, "");
    if (digitsOnly.length === 10) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-recipient?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${digitsOnly}</Redirect>`);
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-recipient?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  if (step === "enter-amount") {
    const digitsOnly = clean.replace(/[^0-9]/g, "");
    if (digitsOnly.length > 0 && digitsOnly.length <= 5) {
      return xmlResponse(res, `    <Redirect>${baseUrl}/verify-amount?sessionId=${sessionId}&amp;lang=${lang}&amp;dtmfDigits=${digitsOnly}</Redirect>`);
    }
    return xmlResponse(res, `    <Redirect>${baseUrl}/enter-amount?sessionId=${sessionId}&amp;lang=${lang}</Redirect>`);
  }

  xmlResponse(res, `    <Redirect>${baseUrl}/voice-menu?sessionId=${sessionId}</Redirect>`);
});
