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
  referenceId?: string;
  ref?: string;
  response?: string;
  utterance?: string;
}

export const DYNAMIC_PROMPT_IDS = new Set(["OP20", "OP21", "OP29", "OP52", "OP70"]);

export function isDynamicPromptId(promptId: string): boolean {
  return DYNAMIC_PROMPT_IDS.has(promptId.toUpperCase().trim());
}

/**
 * Renders canonical dynamic prompt templates (OP20, OP21, OP29, OP52, OP70)
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
      const name = params.name || params.recipientName || (isTwi ? "obi a woremane no sika no" : "the recipient");
      return isTwi
        ? `Recipient no din ne ${name}.`
        : `The recipient's name is ${name}.`;
    }
    case "OP21": {
      const rawPhone = params.phone || params.recipientPhone || "0543546010";
      const fullDigits = formatFullPhoneNumberForSpeech(rawPhone, language);
      return isTwi
        ? `Ne phone nɔmba a ɛdi mũ no ne ${fullDigits}.`
        : `The full recipient phone number is ${fullDigits}.`;
    }
    case "OP29": {
      const rawAmount = params.amount !== undefined ? String(params.amount) : "50";
      const parsed = parseAndValidateAmount(rawAmount);
      const amountStr = parsed.formatted || `${rawAmount} Cedis`;
      return isTwi
        ? `Mate sɛ ɛyɛ Ghana cedis ${amountStr}. Saa sika dodow yi yɛ nokware anaa?`
        : `I heard ${amountStr} Ghana cedis. Is that amount correct?`;
    }
    case "OP52": {
      const reference = params.referenceId || params.ref || "OKP-782914";
      const spokenRef = formatRefForSpeech(reference);
      return isTwi
        ? `Wo transaction no dii nkonim. Transaction reference no ne ${spokenRef}.`
        : `Your transaction was successful. The transaction reference is ${spokenRef}.`;
    }
    case "OP70": {
      const utterance = params.response || params.utterance || (isTwi ? "wo nkaebɔ" : "your response");
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
export function formatFullPhoneNumberForSpeech(phone: string, language: "en" | "twi"): string {
  const clean = phone.replace(/\D/g, "");
  const normalized = clean.length === 9 ? "0" + clean : clean.length === 12 && clean.startsWith("233") ? "0" + clean.slice(3) : clean.slice(-10);
  if (language === "twi") {
    const TWI_DIGIT_WORDS: Record<string, string> = {
      "0": "hwee", "1": "baako", "2": "mmienu", "3": "mmiɛnsa", "4": "nnan",
      "5": "nnum", "6": "nsia", "7": "nson", "8": "nwɔtwe", "9": "nkron",
    };
    return normalized.split("").map((d) => TWI_DIGIT_WORDS[d] || d).join(" ");
  }
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

  const recipientConfirmSpeechUrl = language === "twi"
    ? `/audio/supplied/Twi/3.Recipient%20Entry%20%26%20Verification/Recipient%20confirm%20speech.m4a`
    : `/audio/Confirm%20understanding.m4a`;
  const useRecipient1Url = language === "twi"
    ? `/audio/supplied/Twi/3.Recipient%20Entry%20%26%20Verification/Use%20recipient%201.m4a`
    : `/audio/Continue.m4a`;

  // Audio 8 (Use Recipient 1) plays BEFORE Audio 7 (Recipient Confirm Speech)
  const voiceXml = `    <GetDigits timeout="15" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">
        <Play url="${useRecipient1Url}"/>
        <Play url="${recipientConfirmSpeechUrl}"/>
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

  const amountReadback2Url = language === "twi"
    ? `/audio/supplied/Twi/4.Amount%20Entry%20%26%20Verification/Amount%20readback%202.m4a`
    : `/audio/Confirm%20understanding.m4a`;
  const confirmSpeechUrl = language === "twi"
    ? `/audio/supplied/Twi/5.Transaction%20Confirmation/Confirm%20speech.m4a`
    : `/audio/Continue.m4a`;

  // Africa's Talking compliant VoiceXML with studio audio & dynamic readback for Step 11
  const voiceXml = `    <GetDigits timeout="15" finishOnKey="#" numDigits="1" callbackUrl="${callbackUrl}">
        <Play url="${amountReadback2Url}"/>
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
  const spacedRef = referenceId ? formatRefForSpeech(referenceId) : "";

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
    const voiceXml = `    <Say voice="female">${escapeXml(spokenText)}</Say>\n    <Reject/>`;
    return { spokenText, voiceXml };
  } else if (status === "PENDING") {
    if (language === "twi") {
      spokenText = `Wo transfer a ɛyɛ ${amountFormatted} akɔma ${displayName} no da so retwɛn authorization. Wo reference nɔmba ne ${spacedRef}.`;
    } else {
      spokenText = `Your transfer of ${amountFormatted} to ${displayName} is pending authorization. Please authorize the prompt on your handset. Reference number is ${spacedRef}.`;
    }
    const voiceXml = `    <Say voice="female">${escapeXml(spokenText)}</Say>\n    <Reject/>`;
    return { spokenText, voiceXml };
  } else {
    // 15. Success Audio (SUCCESS SENT) -> 16. Keep Reference -> 17. Dynamic TTS Reference -> Anything Else -> Exit
    const successAudioUrl = language === "twi"
      ? `/audio/supplied/Twi/8.Success%20%26%20Completion/SUCCESS%20SENT.aac`
      : `/audio/Success%20sent.m4a`;
    const keepRefAudioUrl = language === "twi"
      ? `/audio/supplied/Twi/8.Success%20%26%20Completion/Keep%20reference.aac`
      : `/audio/Keep%20reference.m4a`;
    const anythingElseAudioUrl = language === "twi"
      ? `/audio/supplied/Twi/8.Success%20%26%20Completion/ANYTHING%20ELSE.aac`
      : `/audio/Anything%20else.m4a`;
    const exitAudioUrl = language === "twi"
      ? `/audio/supplied/Twi/11.Navigation%20%26%20Recovery/Exit.aac`
      : `/audio/Exit.m4a`;

    const refText = referenceId && referenceId.trim()
      ? (language === "twi"
          ? `Wo transaction reference nɔmba ne ${spacedRef}. Fa sie yie.`
          : `Your transaction reference number is ${spacedRef}. Please keep it for your records.`)
      : (language === "twi"
          ? `Wo transaction reference nɔmba no nni hɔ seesei.`
          : `Your transaction reference number is currently unavailable.`);

    if (language === "twi") {
      spokenText = `Mo! Woatumi amane ${amountFormatted} akɔma ${displayName} wɔ da ${dateStr} berɛ ${timeStr}. ${refText} Yɛdaase sɛ woayɛ use wɔ Ɔkwankyerɛfo Pa. Nante yiye.`;
    } else {
      spokenText = `Congratulations! You have successfully sent ${amountFormatted} to ${displayName} on ${dateStr} at ${timeStr}. ${refText} Thank you for using Ɔkwankyerɛfo Pa. Goodbye.`;
    }

    // Audio 16 (Success) -> Audio 18 (Keep reference) -> Dynamic TTS (Reference) -> Anything else -> Exit
    const voiceXml = `    <Play url="${successAudioUrl}"/>
    <Play url="${keepRefAudioUrl}"/>
    <Say voice="female">${escapeXml(refText)}</Say>
    <Play url="${anythingElseAudioUrl}"/>
    <Play url="${exitAudioUrl}"/>
    <Reject/>`;

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
