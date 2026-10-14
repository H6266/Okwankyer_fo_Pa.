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

/**
 * Builds dynamic safe confirmation spoken text and VoiceXML
 */
/**
 * Formats a 10-digit phone number as individually spoken digits
 * (e.g., "0 2 4 1 2 3 4 5 6 7" in English; "hwee mmienu nnan baako mmienu mmiɛnsa nnan nnum nsia nson" in Twi)
 */
export function formatFullPhoneNumberForSpeech(phone: string, language: "en" | "twi"): string {
  const validation = validateGhanaPhoneNumber(phone);
  return validation.fullPhoneSpaced || phone.replace(/\D/g, "").split("").join(" ");
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

  const voiceXml = `    <GetDigits timeout="12" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">
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
  const fullPhoneSpoken = formatFullPhoneNumberForSpeech(recipientPhone, language);
  const amountValidation = parseAndValidateAmount(String(amount));
  const amountFormatted = amountValidation.formatted || `${amount} Cedis`;

  let spokenText = "";

  if (language === "twi") {
    if (isVerified && recipientName) {
      spokenText = `Worepɛ sɛ womane ${amountFormatted} kɔma ${recipientName} a ne phone nɔmba a ɛdi mũ ne ${fullPhoneSpoken}. Sɛ wopene so a, mia baako (1). Sɛ woampene so a, mia mmienu (2). Sɛ wopɛ sɛ wogyae a, mia hwee (0).`;
    } else {
      // Explicit unverified warning in Akan Twi
      spokenText = `Kɔkɔbɔ: Yɛantumi anhu edin a ɛbata phone nɔmba ${fullPhoneSpoken} no ho wɔ nkyerɛwee mu. Woremane ${amountFormatted} kɔma nɔmba a yɛnhu ne din. Sɛ wopene so na womane a, mia baako (1). Sɛ woampene so a, mia mmienu (2). Sɛ wopɛ sɛ wogyae a, mia hwee (0).`;
    }
  } else {
    // English track
    if (isVerified && recipientName) {
      spokenText = `You are about to send ${amountFormatted} to ${recipientName}, whose full phone number is ${fullPhoneSpoken}. To confirm and continue, press 1. To cancel, press 2. To exit, press 0.`;
    } else {
      // Explicit unverified warning in English
      spokenText = `Warning: The recipient name for phone number ${fullPhoneSpoken} could not be verified in the subscriber directory. You are sending ${amountFormatted} to an unverified recipient. To confirm and continue, press 1. To cancel, press 2. To exit, press 0.`;
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
  const { language, amount, recipientPhone, recipientName, referenceId, timestamp, status = "SUCCESSFUL" } = options;
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

  if (status === "FAILED") {
    if (language === "twi") {
      spokenText = `Mpaebo! Wo transfer a ɛyɛ ${amountFormatted} akɔma ${displayName} no a-fail. Wo reference nɔmba ne ${spacedRef}.`;
    } else {
      spokenText = `Your transfer of ${amountFormatted} to ${displayName} has failed. Reference number is ${spacedRef}. Please try again later.`;
    }
  } else if (status === "PENDING") {
    if (language === "twi") {
      spokenText = `Wo transfer a ɛyɛ ${amountFormatted} akɔma ${displayName} no da so retwɛn authorization. Wo reference nɔmba ne ${spacedRef}.`;
    } else {
      spokenText = `Your transfer of ${amountFormatted} to ${displayName} is pending authorization. Please authorize the prompt on your handset. Reference number is ${spacedRef}.`;
    }
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
