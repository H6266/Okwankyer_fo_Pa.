/**
 * Ɔkwankyerɛfo Pa - Dynamic Prompt Builder
 * 
 * Replaces static pre-recorded MP3 confirmation and receipt prompts
 * with dynamic readback reflecting EXACT caller input:
 * - Real caller amount (Cedis & Pesewas)
 * - Verified recipient name OR explicit unverified warning with extra confirmation
 * - Full recipient phone number, spoken digit by digit
 * - Unique per-transaction reference ID
 * - Real timestamp (date & time)
 */

import { parseAndValidateAmount, validateGhanaPhoneNumber } from "../domain/validation";
import { speechNormalizer } from "../ai_system/speech/speechNormalizer";

export interface SafeConfirmationOptions {
  language: "en" | "twi";
  amount: number;
  recipientPhone: string;
  recipientName: string | null;
  network?: string;
  isVerified: boolean;
  callbackUrl: string;
}

export interface DynamicReceiptOptions {
  language: "en" | "twi";
  amount: number;
  recipientPhone: string;
  recipientName: string | null;
  referenceId: string;
  timestamp: Date;
  status?: "SUCCESSFUL" | "PENDING" | "FAILED";
}

/**
 * Generates unique per-transaction reference ID (e.g. OKP-782914)
 */
export function generateTransactionReference(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `OKP-${digits}`;
}

export function formatRefForSpeech(ref: string): string {
  // Spaced out for natural cadence: "O K P - 7 8 2 9 1 4"
  return ref.split("").join(" ");
}

export interface DynamicPromptParams {
  name?: string;
  recipientName?: string;
  phone?: string;
  recipientPhone?: string;
  amount?: number | string;
  network?: string;
  referenceId?: string;
  ref?: string;
  response?: string;
  utterance?: string;
}

export const DYNAMIC_PROMPT_IDS = new Set(["OP20", "OP21", "OP29", "OP35", "OP52", "OP52B", "OP70"]);

export function isDynamicPromptId(promptId: string): boolean {
  return DYNAMIC_PROMPT_IDS.has(promptId.toUpperCase().trim());
}

/**
 * Formats a transaction reference for slow, deliberate digit-by-digit spoken readback (OP52b)
 * e.g. "OKP-272" -> "O ... K ... P ... two ... seven ... two"
 */
export function formatSlowReferenceForSpeech(ref: string, language: "en" | "twi" = "en"): string {
  if (!ref || !ref.trim()) {
    return language === "twi"
      ? "Reference nɔmba no nni hɔ seesei."
      : "The transaction reference is not currently available.";
  }
  const twiDigits: Record<string, string> = {
    "0": "hwee", "1": "baako", "2": "mmienu", "3": "mmiɛnsa", "4": "nnan",
    "5": "nnum", "6": "nsia", "7": "nson", "8": "nwɔtwe", "9": "nkron"
  };
  const enDigits: Record<string, string> = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine"
  };

  const parts = ref.trim().split("-");
  const spokenParts = parts.map((part) =>
    part
      .split("")
      .map((ch) => {
        if (/\d/.test(ch)) {
          return language === "twi" ? (twiDigits[ch] || ch) : (enDigits[ch] || ch);
        }
        return ch.toUpperCase();
      })
      .join(" ... ")
  );
  return spokenParts.join(" ... , ... ");
}

/**
 * Renders canonical dynamic prompt templates (OP20, OP21, OP29, OP35, OP52, OP52B, OP70)
 * with real variable values rather than placeholder strings.
 */
export function renderDynamicPromptTemplate(
  promptId: string,
  language: "en" | "twi",
  params: DynamicPromptParams = {}
): string | null {
  const normId = promptId.toUpperCase().trim();
  const isTwi = language === "twi";

  switch (normId) {
    case "OP20": {
      const name = params.name?.trim() || params.recipientName?.trim();
      if (!name) return null;
      return isTwi
        ? `Recipient no din ne ${name}.`
        : `The recipient's name is ${name}.`;
    }
    case "OP21": {
      const rawPhone = params.phone || params.recipientPhone;
      if (!rawPhone || !validateGhanaPhoneNumber(rawPhone).valid) return null;
      const fullDigits = formatFullPhoneNumberForSpeech(rawPhone, language);
      return isTwi
        ? `Ne phone nɔmba a ɛdi mũ no ne ${fullDigits}.`
        : `The full recipient phone number is ${fullDigits}.`;
    }
    case "OP29": {
      if (params.amount === undefined || params.amount === "") return null;
      const rawAmount = String(params.amount);
      const parsed = parseAndValidateAmount(rawAmount);
      if (!parsed.valid || parsed.amount === undefined) return null;
      const amountStr = parsed.formatted || `${rawAmount} Cedis`;
      return isTwi
        ? `Mate sɛ ɛyɛ Ghana cedis ${amountStr}. Sɛ ɛyɛ nokware a, mia 1. Sɛ wopɛ sɛ wosesa a, mia 2. Sɛ wogyae a, mia 0.`
        : `I heard ${amountStr} Ghana cedis. Press 1 to accept, 2 to change the amount, or 0 to cancel.`;
    }
    case "OP35": {
      const name = params.name?.trim() || params.recipientName?.trim();
      const phone = params.phone || params.recipientPhone;
      const network = params.network?.trim();
      if (!name || !phone || !network || params.amount === undefined || params.amount === "") return null;
      const phoneValidation = validateGhanaPhoneNumber(phone);
      const parsed = parseAndValidateAmount(String(params.amount));
      if (!phoneValidation.valid || !parsed.valid || parsed.amount === undefined) return null;
      const lastFour = phone.replace(/\D/g, "").slice(-4).split("").join(" ");
      const amount = parsed.formatted || String(params.amount);
      return isTwi
        ? `Wopɛ sɛ womane ${amount} kɔma ${name} wɔ ${network} so. Recipient phone nɔmba no awiei ne ${lastFour}.`
        : `You are about to send ${amount} to ${name} on ${network}. The recipient phone number ends in ${lastFour}.`;
    }
    case "OP52": {
      const name = params.name?.trim() || params.recipientName?.trim();
      const reference = params.referenceId || params.ref;
      if (!name || !reference || params.amount === undefined || params.amount === "") return null;
      const parsed = parseAndValidateAmount(String(params.amount));
      if (!parsed.valid || parsed.amount === undefined) return null;
      const spokenRef = formatRefForSpeech(reference);
      return isTwi
        ? `Wo transfer a ɛyɛ ${parsed.formatted || params.amount} kɔma ${name} no adi nkonim. Application reference no ne ${spokenRef}. Fa sie yie.`
        : `Your transfer of ${parsed.formatted || params.amount} to ${name} is complete. Your application reference is ${spokenRef}. Please keep it for your records.`;
    }
    case "OP52B": {
      const reference = params.referenceId || params.ref;
      if (!reference) return null;
      const slowRef = formatSlowReferenceForSpeech(reference, language);
      return isTwi
        ? `Wo transaction reference nɔmba a ɛdi mũ no ne: ${slowRef}.`
        : `Your complete transaction reference is: ${slowRef}.`;
    }
    case "OP70": {
      const utterance = params.response?.trim() || params.utterance?.trim();
      if (!utterance) return null;
      return isTwi
        ? `Mate sɛ wokae ${utterance}. Ɛyɛ nokware anaa?`
        : `I heard you say ${utterance}. Is that correct?`;
    }
    default:
      return null;
  }
}

/**
 * Builds dynamic safe confirmation spoken text and VoiceXML
 */
/**
 * Formats a 10-digit phone number as individually spoken digits
 * (e.g., "0 2 4 1 2 3 4 5 6 7" in English; "hwee mmienu nnan baako mmienu mmiɛnsa nnan nnum nsia nson" in Twi)
 */
export function formatFullPhoneNumberForSpeech(phone: string, _language: "en" | "twi" = "en"): string {
  const clean = phone.replace(/\D/g, "");
  const normalized = clean.length === 9 ? "0" + clean : clean.length === 12 && clean.startsWith("233") ? "0" + clean.slice(3) : clean.slice(-10);
  return normalized.split("").join(" ");
}

/**
 * Builds dynamic recipient verification spoken text and VoiceXML (OP19 + OP20 + OP21 + OP22)
 */
export function buildRecipientVerificationPrompt(options: {
  language: "en" | "twi";
  recipientPhone: string;
  recipientName: string | null;
  isVerified: boolean;
  callbackUrl?: string;
}): {
  spokenText: string;
  namePrompt: string;
  phonePrompt: string;
  voiceXml: string;
} {
  const { language, recipientPhone, recipientName, isVerified, callbackUrl = "/recipient-verify-choice" } = options;
  const fullPhoneSpoken = formatFullPhoneNumberForSpeech(recipientPhone, language);
  const name = recipientName || (language === "twi" ? "onipa a ne din nkae" : "unregistered subscriber");

  let spokenText = "";
  let namePrompt = "";
  let phonePrompt = "";

  if (language === "twi") {
    namePrompt = `Obi a woremane no no din ne ${name}.`;
    phonePrompt = `Ne phone nɔmba a ɛdi mũ ne ${fullPhoneSpoken}.`;
    spokenText = `Yɛahu obi a woremane no sika no. Tie ne din ne ne nɔmba a ɛdi mũ no yiye. ${namePrompt} ${phonePrompt} Sɛ wopene so a, mia baako (1). Sɛ wopɛ sɛ wosesa nɔmba no a, mia mmienu (2). Sɛ wopɛ sɛ wogyae a, mia hwee (0).`;
  } else {
    namePrompt = `The recipient's name is ${name}.`;
    phonePrompt = `The full recipient phone number is ${fullPhoneSpoken}.`;
    spokenText = `We found the recipient. Please listen carefully to the name and the full phone number. ${namePrompt} ${phonePrompt} To confirm this recipient, press 1. To change the recipient, press 2. To exit, press 0.`;
  }

  const voiceXml = language === "twi"
    ? `    <Say voice="female">Twi speech is unavailable, so we cannot safely verify this recipient. Please try again later.</Say>\n    <Reject/>`
    : `    <GetDigits timeout="15" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">
        <Say voice="female">${escapeXml(spokenText)}</Say>
    </GetDigits>`;

  return { spokenText, namePrompt, phonePrompt, voiceXml };
}

/**
 * Builds dynamic safe confirmation spoken text and VoiceXML (Section 6 & 9)
 */
export function buildSafeConfirmationPrompt(options: SafeConfirmationOptions): {
  spokenText: string;
  voiceXml: string;
} {
  const { language, amount, recipientPhone, recipientName, isVerified, callbackUrl } = options;
  const review = isVerified && recipientName
    ? renderDynamicPromptTemplate("OP35", language, {
        amount,
        recipientName,
        recipientPhone,
        network: options.network,
      })
    : null;
  const spokenText = review || (language === "twi"
    ? "Kɔkɔbɔ: Yɛantumi anhu edin ne transaction nsɛm no. Yɛrentumi nkɔ so."
    : "Warning: The recipient name and transaction details could not be verified. We cannot continue.");
  const voiceXml = language === "twi"
    ? `    <Say voice="female">Twi speech is unavailable, so we cannot safely confirm this transfer. Please try again later.</Say>\n    <Reject/>`
    : review
    ? `    <GetDigits timeout="90" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">\n        <Say voice="female">${escapeXml(spokenText)}</Say>\n    </GetDigits>`
    : `    <Say voice="female">${escapeXml(spokenText)}</Say>\n    <Reject/>`;
  return { spokenText, voiceXml };
}

/**
 * Builds dynamic transaction receipt spoken text and VoiceXML
 */
export function buildReceiptPrompt(options: DynamicReceiptOptions): {
  spokenText: string;
  voiceXml: string;
} {
  const { language, amount, recipientPhone, recipientName, referenceId, timestamp, status = "SUCCESSFUL" } = options;
  const phoneValidation = validateGhanaPhoneNumber(recipientPhone);
  const last4Spaced = phoneValidation.last4Spaced || recipientPhone.slice(-4).split("").join(" ");
  const displayName = recipientName || `subscriber ending in ${last4Spaced}`;
  const amountValidation = parseAndValidateAmount(String(amount));
  const amountFormatted = amountValidation.formatted || `${amount} Cedis`;
  const spacedRef = referenceId ? formatRefForSpeech(referenceId) : "";

  let spokenText = "";
  const referenceLabel = /^OKP-/i.test(referenceId) ? "application reference" : "provider transaction reference";

  if (status === "FAILED") {
    if (language === "twi") {
      spokenText = `Wo transfer a ɛyɛ ${amountFormatted} akɔma ${displayName} no antumi ankɔ. ${referenceLabel} no ne ${spacedRef}.`;
    } else {
      spokenText = `Your transfer of ${amountFormatted} to ${displayName} has failed. Your ${referenceLabel} is ${spacedRef}. Please check the status before trying again.`;
    }
    const voiceXml = language === "twi"
      ? `    <Say voice="female">Twi speech is unavailable. The transfer was not completed. Please check your provider messages.</Say>\n    <Reject/>`
      : `    <Say voice="female">${escapeXml(spokenText)}</Say>\n    <Reject/>`;
    return { spokenText, voiceXml };
  } else if (status === "PENDING") {
    if (language === "twi") {
      spokenText = `Wo transfer a ɛyɛ ${amountFormatted} akɔma ${displayName} no da so retwɛn provider no mmuae. ${referenceLabel} no ne ${spacedRef}.`;
    } else {
      spokenText = `Your transfer of ${amountFormatted} to ${displayName} is still pending provider confirmation. Your ${referenceLabel} is ${spacedRef}. Do not start another transfer until the status is checked.`;
    }
    const voiceXml = language === "twi"
      ? `    <Say voice="female">Twi speech is unavailable. This transfer is still awaiting provider confirmation. Please check your phone.</Say>\n    <Reject/>`
      : `    <Say voice="female">${escapeXml(spokenText)}</Say>\n    <Reject/>`;
    return { spokenText, voiceXml };
  } else {
    spokenText = renderDynamicPromptTemplate("OP52", language, {
      amount,
      recipientName: recipientName || undefined,
      referenceId,
    }) || (language === "twi"
      ? "Yɛrentumi nnhwɛ transaction nsɛm yi mu, enti yɛrentumi nka sɛ edi nkonim."
      : "We cannot verify the transaction details, so we cannot confirm completion.");
    const voiceXml = language === "twi"
      ? `    <Say voice="female">Twi speech is unavailable. Please check your provider messages for the confirmed transaction status.</Say>\n    <Reject/>`
      : `    <Say voice="female">${escapeXml(spokenText)}</Say>`;

    return { spokenText, voiceXml };
  }
}

export function buildPendingAuthorizationPrompt(options: DynamicReceiptOptions): {
  spokenText: string;
  voiceXml: string;
} {
  return buildReceiptPrompt({ ...options, status: "PENDING" });
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
