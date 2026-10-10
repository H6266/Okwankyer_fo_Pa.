/**
 * Ɔkwankyerɛfo Pa - Dynamic Prompt Builder
 * 
 * Replaces static pre-recorded MP3 confirmation and receipt prompts
 * with dynamic readback reflecting EXACT caller input:
 * - Real caller amount (Cedis & Pesewas)
 * - Verified recipient name OR explicit unverified warning with extra confirmation
 * - Digit-by-digit phone ending (last 4 digits)
 * - Unique per-transaction reference ID
 * - Real timestamp (date & time)
 */

import { parseAndValidateAmount, validateGhanaPhoneNumber } from "../domain/validation";

export interface SafeConfirmationOptions {
  language: "en" | "twi";
  amount: number;
  currency?: string;
  recipientPhone: string;
  recipientName: string | null;
  isVerified: boolean;
  callbackUrl: string;
}

export interface DynamicReceiptOptions {
  language: "en" | "twi";
  amount: number;
  currency?: string;
  recipientPhone: string;
  recipientName: string | null;
  referenceId: string;
  timestamp: Date;
  status?: "SUCCESSFUL" | "PENDING" | "FAILED";
}

/**
 * Generates unique per-transaction reference ID (e.g. OKP-782914)
 * Used ONLY when initializing a new transaction session that lacks a reference.
 */
export function generateTransactionReference(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `OKP-${digits}`;
}

export function formatRefForSpeech(ref: string): string {
  // Spaced out for natural cadence: "O K P - 7 8 2 9 1 4"
  return ref.split("").join(" ");
}

/**
 * Builds dynamic safe confirmation spoken text and VoiceXML
 */
export function buildSafeConfirmationPrompt(options: SafeConfirmationOptions): {
  spokenText: string;
  voiceXml: string;
} {
  const { language, amount, currency = "GHS", recipientPhone, recipientName, isVerified, callbackUrl } = options;
  const phoneValidation = validateGhanaPhoneNumber(recipientPhone);
  const last4Spaced = phoneValidation.last4Spaced || recipientPhone.slice(-4).split("").join(" ");
  const amountValidation = parseAndValidateAmount(String(amount));
  const currLabel = currency === "GHS" ? "Cedis" : currency;
  const amountFormatted = amountValidation.formatted || `${amount} ${currLabel}`;

  let spokenText = "";

  if (language === "twi") {
    if (isVerified && recipientName) {
      spokenText = `Worepɛ sɛ womane ${amountFormatted} kɔma ${recipientName} a ne nɔmba wie ${last4Spaced}. Sɛ wopene so a, mia baako (1). Sɛ woampene so a, mia mmienu (2).`;
    } else {
      // Explicit unverified warning in Akan Twi
      spokenText = `Kɔkɔbɔ: Yɛantumi anhu edin a ɛbata nɔmba a ɛwie ${last4Spaced} no ho wɔ nkyerɛwee mu. Woremane ${amountFormatted} kɔma nɔmba a yɛnhu ne din. Sɛ wopene so na womane a, mia baako (1). Sɛ woampene so a, mia mmienu (2).`;
    }
  } else {
    // English track
    if (isVerified && recipientName) {
      spokenText = `You are about to send ${amountFormatted} to ${recipientName}, whose phone number ends with ${last4Spaced}. To confirm and send, press 1. To cancel, press 2.`;
    } else {
      // Explicit unverified warning in English
      spokenText = `Warning: The recipient name for phone number ending with ${last4Spaced} could not be verified in the subscriber directory. You are sending ${amountFormatted} to an unverified recipient. To confirm and proceed anyway, press 1. To cancel, press 2.`;
    }
  }

  // Africa's Talking compliant VoiceXML with <GetDigits> and dynamic <Say>
  const voiceXml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">
        <Say voice="female">${escapeXml(spokenText)}</Say>
    </GetDigits>`;

  return { spokenText, voiceXml };
}

/**
 * Builds dynamic pending authorization / handoff spoken text and VoiceXML
 */
export function buildPendingAuthorizationPrompt(options: {
  language: "en" | "twi";
  amount: number;
  currency?: string;
  recipientPhone: string;
  recipientName: string | null;
  referenceId: string;
}): {
  spokenText: string;
  voiceXml: string;
} {
  const { language, amount, currency = "GHS", recipientPhone, recipientName, referenceId } = options;
  const phoneValidation = validateGhanaPhoneNumber(recipientPhone);
  const last4Spaced = phoneValidation.last4Spaced || recipientPhone.slice(-4).split("").join(" ");
  const displayName = recipientName || `recipient ending in ${last4Spaced}`;
  const amountValidation = parseAndValidateAmount(String(amount));
  const currLabel = currency === "GHS" ? "Cedis" : currency;
  const amountFormatted = amountValidation.formatted || `${amount} ${currLabel}`;
  const spacedRef = formatRefForSpeech(referenceId);

  let spokenText = "";
  if (language === "twi") {
    spokenText = `Yɛde wo kɔbɔ a ɛyɛ ${amountFormatted} a worekɔma ${displayName} no akɔ MoMo so. Wo reference nɔmba ne ${spacedRef}. Yɛsrɛ wo, hwɛ wo fon screen so na bɔ wo PIN ahobammbɔ mu de wie transfer no. Nante yiye.`;
  } else {
    spokenText = `Your transfer of ${amountFormatted} to ${displayName} is currently pending authorization. Reference number: ${spacedRef}. Please check your phone screen to enter your Mobile Money PIN and authorize the transfer. Goodbye.`;
  }

  const voiceXml = `    <Say voice="female">${escapeXml(spokenText)}</Say>
    <Reject/>`;

  return { spokenText, voiceXml };
}

/**
 * Builds dynamic transaction receipt spoken text and VoiceXML
 */
export function buildReceiptPrompt(options: DynamicReceiptOptions): {
  spokenText: string;
  voiceXml: string;
} {
  const { language, amount, currency = "GHS", recipientPhone, recipientName, referenceId, timestamp, status = "SUCCESSFUL" } = options;
  const phoneValidation = validateGhanaPhoneNumber(recipientPhone);
  const last4Spaced = phoneValidation.last4Spaced || recipientPhone.slice(-4).split("").join(" ");
  const displayName = recipientName || `subscriber ending in ${last4Spaced}`;
  const amountValidation = parseAndValidateAmount(String(amount));
  const currLabel = currency === "GHS" ? "Cedis" : currency;
  const amountFormatted = amountValidation.formatted || `${amount} ${currLabel}`;
  const spacedRef = formatRefForSpeech(referenceId);

  const dateStr = timestamp.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeStr = timestamp.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  let spokenText = "";

  if (status === "FAILED") {
    if (language === "twi") {
      spokenText = `Fakyɛ yɛn, sika mane a ɛyɛ ${amountFormatted} kɔma ${displayName} no antumi ankɔ. Wo reference nɔmba ne ${spacedRef}. Sika biara mfirii wo account mu. Yɛsrɛ wo, bɔ mmɔden bio akyire yi. Nante yiye.`;
    } else {
      spokenText = `We are sorry, your transfer of ${amountFormatted} to ${displayName} has failed. Reference number: ${spacedRef}. No money was deducted from your account. Please try again later. Goodbye.`;
    }
  } else if (status === "PENDING") {
    return buildPendingAuthorizationPrompt({
      language,
      amount,
      currency,
      recipientPhone,
      recipientName,
      referenceId,
    });
  } else {
    if (language === "twi") {
      spokenText = `Mo! Woatumi amane ${amountFormatted} akɔma ${displayName} wɔ da ${dateStr} berɛ ${timeStr}. Wo reference nɔmba ne ${spacedRef}. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Nante yiye.`;
    } else {
      spokenText = `Congratulations! You have successfully sent ${amountFormatted} to ${displayName} on ${dateStr} at ${timeStr}. Your reference number is ${spacedRef}. Your transaction details have been dispatched. Thank you for using Ɔkwankyerɛfo Pa. Goodbye.`;
    }
  }

  const voiceXml = `    <Say voice="female">${escapeXml(spokenText)}</Say>
    <Reject/>`;

  return { spokenText, voiceXml };
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
