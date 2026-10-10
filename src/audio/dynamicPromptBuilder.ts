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
  recipientPhone: string;
  recipientName: string | null;
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

/**
 * Builds dynamic safe confirmation spoken text and VoiceXML
 */
export function buildSafeConfirmationPrompt(options: SafeConfirmationOptions): {
  spokenText: string;
  voiceXml: string;
} {
  const { language, amount, recipientPhone, recipientName, isVerified, callbackUrl } = options;
  const phoneValidation = validateGhanaPhoneNumber(recipientPhone);
  const last4Spaced = phoneValidation.last4Spaced || recipientPhone.slice(-4).split("").join(" ");
  const amountValidation = parseAndValidateAmount(String(amount));
  const amountFormatted = amountValidation.formatted || `${amount} Cedis`;

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
 * Builds dynamic transaction receipt spoken text and VoiceXML
 */
export function buildReceiptPrompt(options: DynamicReceiptOptions): {
  spokenText: string;
  voiceXml: string;
} {
  const { language, amount, recipientPhone, recipientName, referenceId, timestamp } = options;
  const phoneValidation = validateGhanaPhoneNumber(recipientPhone);
  const last4Spaced = phoneValidation.last4Spaced || recipientPhone.slice(-4).split("").join(" ");
  const displayName = recipientName || `subscriber ending in ${last4Spaced}`;
  const amountValidation = parseAndValidateAmount(String(amount));
  const amountFormatted = amountValidation.formatted || `${amount} Cedis`;
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

  if (language === "twi") {
    spokenText = `Mo! Woatumi amane ${amountFormatted} akɔma ${displayName} wɔ da ${dateStr} berɛ ${timeStr}. Wo reference nɔmba ne ${spacedRef}. Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Nante yiye.`;
  } else {
    spokenText = `Congratulations! You have successfully sent ${amountFormatted} to ${displayName} on ${dateStr} at ${timeStr}. Your reference number is ${spacedRef}. Your transaction details have been dispatched. Thank you for using Ɔkwankyerɛfo Pa. Goodbye.`;
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
