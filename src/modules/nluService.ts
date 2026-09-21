/**
 * Ɔkwankyerɛfo Pa - Intent Recognition & Entity Extraction (NLU) Module
 * 
 * Complies with Section 4 & 5:
 * Intent set: SEND_MONEY, PAY_BILL, BUY_AIRTIME, BUY_DATA, CASH_OUT,
 * CHECK_BALANCE, CHECK_ACCOUNT, CANCEL, GO_BACK, HELP, EXIT, UNKNOWN.
 * 
 * Every classification includes a confidence score:
 * - confidence >= 0.75 -> proceed
 * - 0.4 - 0.75 -> confirm before proceeding
 * - < 0.4 -> treat as UNKNOWN
 */

import { GoogleGenAI } from "@google/genai";
import { isPhoneNumber, normalizePhoneNumber, findContact } from "./mockContacts";

export type IntentType =
  | "SEND_MONEY"
  | "PAY_BILL"
  | "BUY_AIRTIME"
  | "BUY_DATA"
  | "CASH_OUT"
  | "CHECK_BALANCE"
  | "CHECK_ACCOUNT"
  | "CANCEL"
  | "GO_BACK"
  | "HELP"
  | "EXIT"
  | "UNKNOWN";

export interface ExtractedEntities {
  intent: IntentType;
  confidence: number;
  amount: number | null;
  currency: "GHS";
  recipient_name: string | null;
  recipient_phone: string | null;
  network: "MTN" | "Telecel" | "AT" | null;
  rawText: string;
}

// Lazy Gemini client helper
let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!geminiClient) {
    try {
      geminiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (err) {
      console.error("[NluService] Failed to initialize GoogleGenAI client:", err);
    }
  }
  return geminiClient;
}

/**
 * Word amounts to numeric values
 */
const SPOKEN_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  thousand: 1000,
};

function parseWordNumber(text: string): number | null {
  const words = text.toLowerCase().split(/[\s-]+/);
  let total = 0;
  let current = 0;
  let found = false;

  for (const word of words) {
    if (SPOKEN_NUMBERS[word] !== undefined) {
      found = true;
      const val = SPOKEN_NUMBERS[word];
      if (val === 100) {
        current = current === 0 ? 100 : current * 100;
      } else if (val === 1000) {
        current = current === 0 ? 1000 : current * 1000;
        total += current;
        current = 0;
      } else {
        current += val;
      }
    }
  }
  total += current;
  return found && total > 0 ? total : null;
}

/**
 * Parses monetary amounts from text
 * Disambiguation rule: Never misparse a 9-10 digit phone number as an amount!
 */
export function extractAmount(text: string): number | null {
  // First test if entire string or tokens are a phone number
  const tokens = text.trim().split(/\s+/);
  for (const token of tokens) {
    if (isPhoneNumber(token)) {
      // It's a phone number, do not parse as amount
      continue;
    }
  }

  // Look for currency patterns: "500 cedis", "GH₵ 500", "500ghs", "500"
  const amountMatch = text.match(/(?:gh[¢sc]|cedis?|ghana cedis?)?\s*(\d+(?:\.\d{1,2})?)\s*(?:gh[¢sc]|cedis?|ghana cedis?)?/i);
  if (amountMatch && amountMatch[1]) {
    const parsed = parseFloat(amountMatch[1]);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 10000) {
      // Ensure this parsed string wasn't a 9-10 digit phone number
      if (amountMatch[1].length < 8) {
        return parsed;
      }
    }
  }

  // Check word numbers like "five hundred cedis" or "two hundred"
  const wordVal = parseWordNumber(text);
  if (wordVal && wordVal <= 10000) {
    return wordVal;
  }

  return null;
}

/**
 * Extracts recipient from text
 */
export function extractRecipient(text: string): { name: string | null; phone: string | null } {
  // 1. Check for raw or formatted 10-digit phone number in text (allowing spaces, dashes, dots)
  const phonePattern = /(?:(?:\+?233|0)[\s.-]?)?(?:[25]\d{1}[\s.-]?\d{3}[\s.-]?\d{4}|\d{9,10})\b/;
  const phoneMatch = text.match(phonePattern);
  if (phoneMatch) {
    const norm = normalizePhoneNumber(phoneMatch[0]);
    if (isPhoneNumber(norm)) {
      const contact = findContact(norm);
      return {
        phone: norm,
        name: contact ? contact.name : null,
      };
    }
  }

  // 2. Check for spoken digits (e.g. "zero five five three eight..." or Akan "hwee enum enum...")
  const normPhone = normalizePhoneNumber(text);
  if (isPhoneNumber(normPhone)) {
    const contact = findContact(normPhone);
    return {
      phone: normPhone,
      name: contact ? contact.name : null,
    };
  }

  // 3. Check for names specifically following recipient prepositions (e.g. "to Kwame Mensah", "send to Ama")
  const recipientMatches = text.matchAll(/\b(?:send\s+(?:money\s+)?to|give\s+to|pay\s+to|transfer\s+to|to|for|call\s+out|preferred\s+number(?:\s+for)?)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/gi);
  const stopWords = new Set(["send", "transfer", "pay", "buy", "give", "make", "someone", "anyone", "my", "the", "a", "an", "mtn", "telecel", "at", "cash", "money", "cedis", "ghs", "number", "preferred"]);

  for (const match of recipientMatches) {
    const candidateName = match[1].trim();
    if (!stopWords.has(candidateName.toLowerCase())) {
      const contact = findContact(candidateName);
      return {
        name: contact ? contact.name : candidateName,
        phone: contact ? contact.phoneNumber : null,
      };
    }
  }

  // 4. Check known contact list names if explicitly referenced in the utterance
  const knownContact = findContact(text);
  if (knownContact) {
    return {
      name: knownContact.name,
      phone: knownContact.phoneNumber,
    };
  }

  return { name: null, phone: null };
}

/**
 * Extracts network provider if stated in text
 */
export function extractNetwork(text: string): "MTN" | "Telecel" | "AT" | null {
  const lower = text.toLowerCase();
  if (lower.includes("mtn") || lower.includes("momo")) return "MTN";
  if (lower.includes("telecel") || lower.includes("vodafone")) return "Telecel";
  if (lower.includes("airteltigo") || lower.includes("at money") || /\bat\b/.test(lower)) return "AT";
  return null;
}

/**
 * Deterministic NLU classifier with precision confidence scoring
 */
export function classifyIntentLocally(text: string): ExtractedEntities {
  const lower = text.toLowerCase().trim();

  // Navigation & Control Intents
  if (
    lower === "0" ||
    lower === "exit" ||
    lower === "quit" ||
    lower === "close" ||
    lower.includes("hang up") ||
    lower.includes("goodbye")
  ) {
    return {
      intent: "EXIT",
      confidence: 0.98,
      amount: null,
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: null,
      rawText: text,
    };
  }

  if (
    lower === "cancel" ||
    lower === "stop" ||
    lower === "abort" ||
    lower === "no" ||
    lower === "2" ||
    lower.includes("cancel transaction") ||
    lower.includes("cancel this")
  ) {
    return {
      intent: "CANCEL",
      confidence: 0.95,
      amount: null,
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: null,
      rawText: text,
    };
  }

  if (
    lower === "8" ||
    lower === "back" ||
    lower === "go back" ||
    lower.includes("previous") ||
    lower.includes("return")
  ) {
    return {
      intent: "GO_BACK",
      confidence: 0.96,
      amount: null,
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: null,
      rawText: text,
    };
  }

  if (lower === "help" || lower.includes("how does this work") || lower.includes("what can i say")) {
    return {
      intent: "HELP",
      confidence: 0.92,
      amount: null,
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: null,
      rawText: text,
    };
  }

  // Account / Balance
  if (
    lower.includes("balance") ||
    lower.includes("how much do i have") ||
    lower.includes("check my balance") ||
    lower.includes("account balance")
  ) {
    return {
      intent: "CHECK_BALANCE",
      confidence: 0.96,
      amount: null,
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: extractNetwork(text),
      rawText: text,
    };
  }

  if (lower.includes("account") || lower.includes("statement")) {
    return {
      intent: "CHECK_ACCOUNT",
      confidence: 0.88,
      amount: null,
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: extractNetwork(text),
      rawText: text,
    };
  }

  // Other secondary scoped intents
  if (lower.includes("airtime") || lower.includes("top up") || lower.includes("credit")) {
    return {
      intent: "BUY_AIRTIME",
      confidence: 0.91,
      amount: extractAmount(text),
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: extractNetwork(text),
      rawText: text,
    };
  }

  if (lower.includes("data") || lower.includes("bundle") || lower.includes("internet")) {
    return {
      intent: "BUY_DATA",
      confidence: 0.90,
      amount: extractAmount(text),
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: extractNetwork(text),
      rawText: text,
    };
  }

  if (lower.includes("bill") || lower.includes("ecg") || lower.includes("water") || lower.includes("dstv")) {
    return {
      intent: "PAY_BILL",
      confidence: 0.89,
      amount: extractAmount(text),
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: extractNetwork(text),
      rawText: text,
    };
  }

  if (lower.includes("cash out") || lower.includes("withdraw")) {
    return {
      intent: "CASH_OUT",
      confidence: 0.88,
      amount: extractAmount(text),
      currency: "GHS",
      recipient_name: null,
      recipient_phone: null,
      network: extractNetwork(text),
      rawText: text,
    };
  }

  // Primary Intent: SEND_MONEY
  const isSendMoney =
    lower.includes("send") ||
    lower.includes("transfer") ||
    lower.includes("pay") ||
    lower.includes("cedis to") ||
    lower.includes("give") ||
    lower.includes("remit") ||
    lower.includes("mane");

  if (isSendMoney) {
    const amount = extractAmount(text);
    const recipient = extractRecipient(text);
    const network = extractNetwork(text);

    return {
      intent: "SEND_MONEY",
      confidence: 0.94,
      amount,
      currency: "GHS",
      recipient_name: recipient.name,
      recipient_phone: recipient.phone,
      network,
      rawText: text,
    };
  }

  // If text is a bare amount or recipient while no intent, let conversation manager handle as slot filling
  const possibleAmount = extractAmount(text);
  const possibleRecipient = extractRecipient(text);

  if (possibleAmount !== null || possibleRecipient.name !== null || possibleRecipient.phone !== null) {
    return {
      intent: "SEND_MONEY",
      confidence: 0.80,
      amount: possibleAmount,
      currency: "GHS",
      recipient_name: possibleRecipient.name,
      recipient_phone: possibleRecipient.phone,
      network: extractNetwork(text),
      rawText: text,
    };
  }

  // Unknown fallback
  return {
    intent: "UNKNOWN",
    confidence: 0.25,
    amount: null,
    currency: "GHS",
    recipient_name: null,
    recipient_phone: null,
    network: null,
    rawText: text,
  };
}

/**
 * Main NLU Engine: Uses Gemini model if available, with deterministic fallback
 */
export async function parseUserIntent(text: string): Promise<ExtractedEntities> {
  // 1. Fast deterministic check
  const localResult = classifyIntentLocally(text);

  // If high confidence local result, use immediately for low latency
  if (localResult.confidence >= 0.90) {
    return localResult;
  }

  // 2. Query Gemini API if configured with multi-model fallback cascade
  const ai = getGeminiClient();
  if (ai) {
    const candidateModels = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.1-flash-lite"];
    const prompt = `Analyze this Ghanaian voice assistant transaction phrase: "${text}"
Extract:
- intent: one of ["SEND_MONEY", "PAY_BILL", "BUY_AIRTIME", "BUY_DATA", "CASH_OUT", "CHECK_BALANCE", "CHECK_ACCOUNT", "CANCEL", "GO_BACK", "HELP", "EXIT", "UNKNOWN"]
- confidence: number between 0 and 1
- amount: number or null (e.g. 500 for "500 cedis" or "five hundred")
- currency: "GHS"
- recipient_name: string or null
- recipient_phone: string or null
- network: "MTN" or "Telecel" or "AT" or null

Rules:
- Never parse a 9 or 10-digit phone number as an amount.
- Return pure valid JSON only.`;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        });

        const rawText = response.text ? response.text.trim() : "";
        if (!rawText) continue;
        const parsedJson = JSON.parse(rawText);
        if (parsedJson && parsedJson.intent) {
          return {
            intent: parsedJson.intent,
            confidence: typeof parsedJson.confidence === "number" ? parsedJson.confidence : 0.85,
            amount: parsedJson.amount || localResult.amount,
            currency: "GHS",
            recipient_name: parsedJson.recipient_name || localResult.recipient_name,
            recipient_phone: parsedJson.recipient_phone || localResult.recipient_phone,
            network: parsedJson.network || localResult.network,
            rawText: text,
          };
        }
      } catch (err: any) {
        // If 503 high demand or transient error on this model, fall through to next candidate
        const isTransient = err?.message?.includes("503") || err?.status === 503 || err?.message?.includes("high demand");
        if (isTransient) {
          console.warn(`[NluService] Model ${modelName} unavailable (503/high demand), failing over...`);
          continue;
        }
        console.warn(`[NluService] Model ${modelName} invocation error:`, err?.message || err);
      }
    }
  }

  return localResult;
}
