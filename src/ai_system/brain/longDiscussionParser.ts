/**
 * Ɔkwankyerɛfo Pa - Long Conversation & Discussion Parser
 * 
 * Supports complex, multi-sentence spoken Ghanaian English and Akan/Twi dialogues:
 * - Extracts multiple conversational intents and slots in a single turn
 * - Preserves conversational context across extended discussions
 * - Normalizes Ghanaian spoken numbers, currencies, phone numbers, and networks
 * - Produces streamlined transaction shortcuts when callers supply full parameters
 */

import { repairNoisyAcousticTranscript } from "../speech/acousticModels/ghanaAcousticDataset";
import { formatSpokenNumbersAsDigits } from "../../domain/numberFormatter";
import { MOCK_CONTACTS } from "../../modules/mockContacts";

export interface ParsedDiscussionState {
  rawTranscript: string;
  cleanedTranscript: string;
  detectedDialect: string;
  isLongDiscussion: boolean;
  intents: Array<"send_money" | "check_balance" | "confirm" | "cancel" | "go_back" | "repeat" | "help">;
  primaryIntent: "send_money" | "check_balance" | "confirm" | "cancel" | "go_back" | "repeat" | "help" | "unknown";
  slots: {
    amount?: number;
    amountFormatted?: string;
    recipientName?: string;
    recipientPhone?: string;
    provider?: "mtn" | "telecel" | "at";
    purposeOrNote?: string;
  };
  completeness: {
    isFullySpecifiedTransfer: boolean;
    missingSlots: string[];
  };
  shortcutSuggestedStep?: "safe-confirmation" | "enter-amount" | "enter-recipient" | "action-select" | "provider-select";
  summaryForReadback?: string;
}

/**
 * Extracts all slots and semantic intent from an extended speech turn.
 */
export function parseLongDiscussion(
  utterance: string,
  currentStep: string = "idle",
  existingDraft: Partial<ParsedDiscussionState["slots"]> = {}
): ParsedDiscussionState {
  if (!utterance || !utterance.trim()) {
    return {
      rawTranscript: "",
      cleanedTranscript: "",
      detectedDialect: "en-gh",
      isLongDiscussion: false,
      intents: [],
      primaryIntent: "unknown",
      slots: { ...existingDraft },
      completeness: {
        isFullySpecifiedTransfer: false,
        missingSlots: ["amount", "recipient"],
      },
    };
  }

  // 1. Acoustic and Phonetic Normalization
  const acousticResult = repairNoisyAcousticTranscript(utterance, currentStep);
  const normalizedDigits = formatSpokenNumbersAsDigits(acousticResult.repairedText);
  const lower = normalizedDigits.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;
  const isLongDiscussion = wordCount >= 5;

  const intents: ParsedDiscussionState["intents"] = [];

  // 2. Intent Detection
  if (/(?:send|transfer|mane|soma|sendi|wire|pay)\s*(?:money|sika|cash)?/i.test(lower)) {
    intents.push("send_money");
  }
  if (/(?:balance|check\s*balance|how\s*much|hwɛ\s*sika|me\s*balance)/i.test(lower)) {
    intents.push("check_balance");
  }
  if (/(?:confirm|proceed|okay|yoo|aane|pene\s*so|ampa|yes|sure)/i.test(lower)) {
    intents.push("confirm");
  }
  if (/(?:cancel|stop|abort|gyae|firi\s*mu|no|dabi)/i.test(lower)) {
    intents.push("cancel");
  }
  if (/(?:back|previous|san\s*akyi|kɔ\s*back)/i.test(lower)) {
    intents.push("go_back");
  }
  if (/(?:repeat|again|say\s*again|tie\s*bio)/i.test(lower)) {
    intents.push("repeat");
  }

  const primaryIntent = intents.length > 0 ? intents[0] : "unknown";

  // 3. Slot Extraction: Amount
  let extractedAmount: number | undefined = existingDraft.amount;

  // Patterns like "50 cedis", "50 ghana cedis", "cedis 50", "send 50", "aduonum cedis"
  const amountMatch = lower.match(/(?:send|transfer|mane)?\s*(?:cedis?|sidi|ghs)?\s*(\d+(?:\.\d{1,2})?)\s*(?:cedis?|sidi|pesewas)?/i);
  if (amountMatch && amountMatch[1]) {
    const parsedNum = parseFloat(amountMatch[1]);
    if (!isNaN(parsedNum) && parsedNum > 0 && parsedNum <= 5000) {
      extractedAmount = parsedNum;
    }
  }

  // 4. Slot Extraction: Phone Number (10 digits starting with Ghanaian prefix 02 or 05)
  let extractedPhone: string | undefined = existingDraft.recipientPhone;
  const phoneMatch = lower.match(/\b(0[235][0-9]{8})\b/);
  if (phoneMatch && phoneMatch[1]) {
    extractedPhone = phoneMatch[1];
  } else {
    // Search for spaced digits e.g. "0 5 5 3 8 3 8 4 6 4"
    const spacedDigitsMatch = lower.match(/(?:0\s*[235](?:\s*\d){8})/);
    if (spacedDigitsMatch) {
      const cleanDigits = spacedDigitsMatch[0].replace(/\s+/g, "");
      if (cleanDigits.length === 10) {
        extractedPhone = cleanDigits;
      }
    }
  }

  // 5. Slot Extraction: Recipient Name from Mock Directory & Common Names
  let extractedName: string | undefined = existingDraft.recipientName;
  const contactList = Object.values(MOCK_CONTACTS);
  for (const contact of contactList) {
    const contactLower = contact.name.toLowerCase();
    const firstName = contactLower.split(" ")[0];
    if (lower.includes(contactLower) || lower.includes(firstName)) {
      extractedName = contact.name;
      if (!extractedPhone) {
        extractedPhone = contact.phoneNumber;
      }
      break;
    }
  }

  // Common Ghanaian standalone names if contact list didn't hit
  if (!extractedName) {
    const nameKeywords = ["kwame", "ama", "kofi", "kojo", "yaw", "akua", "abena", "boateng", "mensah", "owusu"];
    for (const n of nameKeywords) {
      if (lower.includes(n)) {
        // Find matching contact or format capitalized
        const match = contactList.find((c) => c.name.toLowerCase().includes(n));
        if (match) {
          extractedName = match.name;
          if (!extractedPhone) extractedPhone = match.phoneNumber;
        } else {
          extractedName = n.charAt(0).toUpperCase() + n.slice(1);
        }
        break;
      }
    }
  }

  // If phone is provided, resolve name from contacts
  if (extractedPhone && !extractedName) {
    const match = contactList.find((c) => c.phoneNumber === extractedPhone);
    if (match) {
      extractedName = match.name;
    }
  }

  // 6. Slot Extraction: Network Provider
  let extractedProvider: ParsedDiscussionState["slots"]["provider"] = existingDraft.provider;
  if (/\b(?:mtn|momo|yellow)\b/i.test(lower)) {
    extractedProvider = "mtn";
  } else if (/\b(?:telecel|vodafone|voda|red)\b/i.test(lower)) {
    extractedProvider = "telecel";
  } else if (/\b(?:airteltigo|at|etigo|tigo|airtel|blue)\b/i.test(lower)) {
    extractedProvider = "at";
  } else if (extractedPhone) {
    // Derive provider from phone prefix
    const pfx = extractedPhone.slice(0, 3);
    if (["024", "054", "055", "059", "053"].includes(pfx)) extractedProvider = "mtn";
    else if (["020", "050"].includes(pfx)) extractedProvider = "telecel";
    else if (["027", "057", "026", "056"].includes(pfx)) extractedProvider = "at";
  }

  // 7. Context / Purpose of Transfer
  let purposeOrNote: string | undefined = undefined;
  const purposeMatch = lower.match(/(?:for|because|reason|sɛ|ne)\s+(?:his|her|my|to|buy|school|fees|hospital|food|medicine|light|water|rent)\s+([a-z\s]+)/i);
  if (purposeMatch) {
    purposeOrNote = purposeMatch[0].trim();
  }

  // 8. Completeness Assessment
  const missingSlots: string[] = [];
  if (!extractedAmount) missingSlots.push("amount");
  if (!extractedPhone) missingSlots.push("recipient");

  const isFullySpecifiedTransfer =
    Boolean(extractedAmount) &&
    Boolean(extractedPhone) &&
    (primaryIntent === "send_money" || intents.includes("send_money"));

  let shortcutSuggestedStep: ParsedDiscussionState["shortcutSuggestedStep"] = undefined;
  let summaryForReadback: string | undefined = undefined;

  if (isFullySpecifiedTransfer && extractedAmount && extractedPhone) {
    shortcutSuggestedStep = "safe-confirmation";
    const displayName = extractedName || `number ${extractedPhone}`;
    const providerLabel = extractedProvider ? extractedProvider.toUpperCase() : "mobile money";
    summaryForReadback = `You want to send ${extractedAmount} Cedis to ${displayName} on ${providerLabel}. To confirm and authorize, press 1 or say confirm.`;
  } else if (extractedPhone && !extractedAmount) {
    shortcutSuggestedStep = "enter-amount";
    summaryForReadback = `Recipient set to ${extractedName || extractedPhone}. Please say or enter the amount in Cedis.`;
  } else if (extractedAmount && !extractedPhone) {
    shortcutSuggestedStep = "enter-recipient";
    summaryForReadback = `Amount set to ${extractedAmount} Cedis. Please say or enter the recipient's 10-digit number.`;
  }

  return {
    rawTranscript: utterance,
    cleanedTranscript: normalizedDigits,
    detectedDialect: acousticResult.detectedDialect,
    isLongDiscussion,
    intents,
    primaryIntent,
    slots: {
      amount: extractedAmount,
      amountFormatted: extractedAmount ? `${extractedAmount} GHS` : undefined,
      recipientName: extractedName,
      recipientPhone: extractedPhone,
      provider: extractedProvider,
      purposeOrNote,
    },
    completeness: {
      isFullySpecifiedTransfer,
      missingSlots,
    },
    shortcutSuggestedStep,
    summaryForReadback,
  };
}
