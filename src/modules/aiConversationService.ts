/**
 * Ɔkwankyerɛfo Pa - AI Conversational Reasoning Engine
 * 
 * Powered by Gemini 3.8 Flash via @google/genai SDK.
 * 
 * Strict architectural boundaries:
 * 1. The AI is the conversational brain, NOT the payment processor.
 * 2. The AI NEVER directly executes financial transactions or calls MoMo APIs.
 * 3. The AI returns strictly structured JSON containing intent, extracted entities,
 *    missing information, proposed nextAction, and natural voice response.
 * 4. The application deterministically validates all actions and entities before execution.
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import {
  extractAmount,
  extractRecipient,
  classifyIntentLocally,
  IntentType,
} from "./nluService";
import { normalizeGhanaianPhoneNumber } from "./networkDetectionService";
import { findContact } from "./mockContacts";

export type SupportedIntent =
  | "SEND_MONEY"
  | "CHECK_BALANCE"
  | "TRANSACTION_STATUS"
  | "CANCEL_TRANSACTION"
  | "CONFIRM_TRANSACTION"
  | "REJECT_TRANSACTION"
  | "REPEAT"
  | "GO_BACK"
  | "HELP"
  | "UNKNOWN";

export type NextActionType =
  | "ASK_AMOUNT"
  | "ASK_RECIPIENT_NAME"
  | "ASK_RECIPIENT_PHONE"
  | "ASK_CONFIRMATION"
  | "EXECUTE_TRANSFER"
  | "CANCEL_FLOW"
  | "CHECK_BALANCE"
  | "PROVIDE_HELP"
  | "CLARIFY"
  | "TERMINATE";

export interface AIEntities {
  amount: number | null;
  currency: "GHS";
  recipientName: string | null;
  recipientPhone: string | null;
  network?: string | null;
}

export interface AIResponse {
  intent: SupportedIntent;
  confidence: number;
  entities: AIEntities;
  missingInformation: string[];
  nextAction: NextActionType;
  response: string;
}

export interface ConversationContext {
  sessionId: string;
  callerNumber?: string;
  language: "en" | "twi";
  intent: SupportedIntent | null;
  amount: number | null;
  currency: "GHS";
  recipientName: string | null;
  recipientPhone: string | null;
  recipientNetwork: string | null;
  status: string;
  awaiting: string | null;
  historySummary?: string;
}

const AI_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: [
        "SEND_MONEY",
        "CHECK_BALANCE",
        "TRANSACTION_STATUS",
        "CANCEL_TRANSACTION",
        "CONFIRM_TRANSACTION",
        "REJECT_TRANSACTION",
        "REPEAT",
        "GO_BACK",
        "HELP",
        "UNKNOWN",
      ],
      description: "Classified primary intent of the caller.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence score between 0.0 and 1.0.",
    },
    entities: {
      type: Type.OBJECT,
      properties: {
        amount: {
          type: Type.NUMBER,
          nullable: true,
          description: "Monetary amount in Ghana Cedis, or null if not mentioned.",
        },
        currency: {
          type: Type.STRING,
          enum: ["GHS"],
        },
        recipientName: {
          type: Type.STRING,
          nullable: true,
          description: "Name of the recipient if mentioned.",
        },
        recipientPhone: {
          type: Type.STRING,
          nullable: true,
          description: "Phone number of recipient if mentioned.",
        },
        network: {
          type: Type.STRING,
          nullable: true,
        },
      },
      required: ["currency"],
    },
    missingInformation: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of missing fields needed to complete the action (e.g. 'amount', 'recipientPhone').",
    },
    nextAction: {
      type: Type.STRING,
      enum: [
        "ASK_AMOUNT",
        "ASK_RECIPIENT_NAME",
        "ASK_RECIPIENT_PHONE",
        "ASK_CONFIRMATION",
        "EXECUTE_TRANSFER",
        "CANCEL_FLOW",
        "CHECK_BALANCE",
        "PROVIDE_HELP",
        "CLARIFY",
        "TERMINATE",
      ],
      description: "The next conversational step to take.",
    },
    response: {
      type: Type.STRING,
      description: "A short, natural, respectful spoken response to the caller in their selected language.",
    },
  },
  required: ["intent", "confidence", "entities", "missingInformation", "nextAction", "response"],
};

const SYSTEM_INSTRUCTION = `You are the intelligent conversational reasoning brain for Ɔkwankyerɛfo Pa, an African voice banking assistant in Ghana.
Your role is to understand the caller's spoken words, identify financial intent, extract transaction details, and maintain natural conversational dialogue.

IMPORTANT SECURITY AND OPERATIONAL BOUNDARIES:
1. You are NOT the payment processor and you must NEVER execute financial transactions directly.
2. Produce structured JSON output matching the requested schema.
3. Never invent transaction details, names, or phone numbers.
4. Never assume a recipient's network.
5. Never claim that money was sent unless the application confirms it.
6. Ask only for information that is actually missing.
7. Support both English and Akan Twi. Always reply in the user's active language.
8. Keep voice responses short, warm, and natural (1 to 2 spoken sentences maximum).
9. Do not use UI markdown (no asterisks, bullet points, or emoji).

HANDLING NATURAL CONVERSATIONS:
- Single-turn multi-entity: "Send 500 cedis to Kwame on 0244 123 4567" extracts amount=500, recipientName=Kwame, recipientPhone=02441234567.
- Sequential slot-filling: If the caller previously said "Send 500 to Kwame" and you asked for a phone number, when the caller says "0244 123 4567", recognize this as Kwame's phone number!
- Mid-flow corrections:
  - "Actually make it 700" -> update amount to 700.
  - "No, send to Ama instead" -> change recipientName to Ama and clear recipientPhone.
- Confirmation:
  - "yes", "confirm", "go ahead", "do it", "aane", "ɛyɛ" -> CONFIRM_TRANSACTION.
  - "no", "cancel", "don't do it", "dabi", "gyae" -> REJECT_TRANSACTION or CANCEL_TRANSACTION.`;

export class AIConversationService {
  private aiClient: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI | null {
    if (!this.aiClient && process.env.GEMINI_API_KEY) {
      try {
        this.aiClient = new GoogleGenAI({
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });
      } catch (err) {
        console.error("[AIConversationService] Failed to init GoogleGenAI:", err);
      }
    }
    return this.aiClient;
  }

  /**
   * Main conversational reasoning method
   */
  public async process(
    transcript: string,
    context: ConversationContext
  ): Promise<AIResponse> {
    const cleanText = transcript.trim();
    console.log(`[AIConversationService] Processing transcript: "${cleanText}" for session ${context.sessionId}`);

    // Attempt Gemini 3.8 Flash
    const ai = this.getClient();
    if (ai) {
      try {
        const modelName = process.env.AI_MODEL || "gemini-3.8-flash";
        const promptContent = `Current Conversation Context:
Session ID: ${context.sessionId}
Language: ${context.language}
Current Intent: ${context.intent || "None"}
Current Status: ${context.status}
Currently Awaiting: ${context.awaiting || "None"}
Stored Amount: ${context.amount ? `${context.amount} GHS` : "None"}
Stored Recipient Name: ${context.recipientName || "None"}
Stored Recipient Phone: ${context.recipientPhone || "None"}
Stored Recipient Network: ${context.recipientNetwork || "None"}

User Spoke: "${cleanText}"

Analyze the utterance against the conversation context. Produce the structured JSON response.`;

        const geminiPromise = ai.models.generateContent({
          model: modelName,
          contents: promptContent,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: "application/json",
            responseSchema: AI_RESPONSE_SCHEMA,
            temperature: 0.2,
          },
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini AI request timed out after 5000ms")), 5000)
        );

        const response: any = await Promise.race([geminiPromise, timeoutPromise]);

        if (response.text) {
          const parsed = JSON.parse(response.text) as AIResponse;
          console.log(`[AIConversationService] Gemini structured output:`, JSON.stringify(parsed));
          return this.sanitizeAIResponse(parsed, context);
        }
      } catch (err: any) {
        console.warn(`[AIConversationService] Gemini model execution notice: ${err.message}. Using deterministic fallback.`);
      }
    }

    // Deterministic Rule-Based Fallback Engine
    return this.deterministicFallback(cleanText, context);
  }

  /**
   * Sanitizes and bounds the AI response
   */
  private sanitizeAIResponse(aiResp: AIResponse, context: ConversationContext): AIResponse {
    // Ensure entities are not hallucinated
    const clean: AIResponse = {
      intent: aiResp.intent || "UNKNOWN",
      confidence: typeof aiResp.confidence === "number" ? Math.min(Math.max(aiResp.confidence, 0), 1) : 0.85,
      entities: {
        amount: aiResp.entities?.amount || context.amount || null,
        currency: "GHS",
        recipientName: aiResp.entities?.recipientName || context.recipientName || null,
        recipientPhone: aiResp.entities?.recipientPhone
          ? normalizeGhanaianPhoneNumber(aiResp.entities.recipientPhone)
          : context.recipientPhone || null,
        network: aiResp.entities?.network || context.recipientNetwork || null,
      },
      missingInformation: Array.isArray(aiResp.missingInformation) ? aiResp.missingInformation : [],
      nextAction: aiResp.nextAction || "CLARIFY",
      response: aiResp.response || "How can I help you today?",
    };

    return clean;
  }

  /**
   * High-accuracy deterministic fallback for offline, testing, or API failover
   */
  public deterministicFallback(text: string, context: ConversationContext): AIResponse {
    const isTwi = context.language === "twi";
    const lower = text.toLowerCase().trim();

    // 1. Confirmations & Rejections
    const confirmWords = ["yes", "confirm", "proceed", "go ahead", "do it", "sure", "aane", "ɛyɛ", "pene so"];
    const isConfirm = confirmWords.some((w) => lower === w || lower.startsWith(w + " ") || lower.includes(" " + w));

    const cancelWords = ["no", "cancel", "stop", "don't do it", "dabi", "gyae", "firi ha"];
    const isCancel = cancelWords.some((w) => lower === w || lower.startsWith(w + " ") || lower.includes(" " + w));

    if (isCancel) {
      return {
        intent: "CANCEL_TRANSACTION",
        confidence: 0.98,
        entities: {
          amount: null,
          currency: "GHS",
          recipientName: null,
          recipientPhone: null,
        },
        missingInformation: [],
        nextAction: "CANCEL_FLOW",
        response: isTwi
          ? "Matwa dwumadi no mu. Yɛbɛtumi ayɛ biribi foforɔ ama wo anaa?"
          : "I have cancelled this transaction. Is there anything else I can help you with?",
      };
    }

    if (context.status === "AWAITING_CONFIRMATION" || context.awaiting === "CONFIRMATION") {
      if (isConfirm) {
        return {
          intent: "CONFIRM_TRANSACTION",
          confidence: 0.99,
          entities: {
            amount: context.amount,
            currency: "GHS",
            recipientName: context.recipientName,
            recipientPhone: context.recipientPhone,
            network: context.recipientNetwork,
          },
          missingInformation: [],
          nextAction: "EXECUTE_TRANSFER",
          response: isTwi
            ? "Yoo, mereka wo dwumadi no akyerɛ MTN Mobile Money seisei ara."
            : "Understood. Submitting your transfer to MTN Mobile Money now.",
        };
      }
      if (lower.includes("no") || lower.includes("dabi") || lower.includes("change") || lower.includes("sesa")) {
        return {
          intent: "REJECT_TRANSACTION",
          confidence: 0.95,
          entities: {
            amount: context.amount,
            currency: "GHS",
            recipientName: context.recipientName,
            recipientPhone: context.recipientPhone,
          },
          missingInformation: [],
          nextAction: "ASK_RECIPIENT_PHONE",
          response: isTwi
            ? "Yoo, yɛbɛsesa nɔma no. Me pa wo kyɛw, bɔ nɔma foforɔ a wopɛ sɛ womane sika no kɔ so."
            : "No problem. Please give me the updated phone number or name.",
        };
      }
    }

    // 2. Navigation (Repeat, Back, Help)
    if (lower.includes("repeat") || lower.includes("say again") || lower.includes("tie biom")) {
      return {
        intent: "REPEAT",
        confidence: 0.95,
        entities: { amount: context.amount, currency: "GHS", recipientName: context.recipientName, recipientPhone: context.recipientPhone },
        missingInformation: [],
        nextAction: "CLARIFY",
        response: isTwi ? "Yoo, metie wo biom." : "I am repeating the previous information.",
      };
    }

    if (lower === "8" || lower === "back" || lower === "go back" || lower.includes("san kɔ")) {
      return {
        intent: "GO_BACK",
        confidence: 0.95,
        entities: { amount: context.amount, currency: "GHS", recipientName: context.recipientName, recipientPhone: context.recipientPhone },
        missingInformation: [],
        nextAction: "CLARIFY",
        response: isTwi ? "Yɛasan akɔ akyi baako." : "Going back to the previous step.",
      };
    }

    if (lower.includes("balance") || lower.includes("sika a ɛwɔ mu")) {
      return {
        intent: "CHECK_BALANCE",
        confidence: 0.96,
        entities: { amount: null, currency: "GHS", recipientName: null, recipientPhone: null },
        missingInformation: [],
        nextAction: "CHECK_BALANCE",
        response: isTwi
          ? "Wopɛ sɛ wohwɛ sika a ɛwɔ wo MoMo akawnt mu. Yɛrebisa wo balance."
          : "You want to check your Mobile Money balance. Checking your account now.",
      };
    }

    // 3. Sequential slot filling if awaiting recipient phone
    const normalizedDirectPhone = normalizeGhanaianPhoneNumber(text);
    if (
      (context.awaiting === "RECIPIENT_PHONE" || context.status === "AWAITING_RECIPIENT") &&
      normalizedDirectPhone.length === 10
    ) {
      return {
        intent: "SEND_MONEY",
        confidence: 0.98,
        entities: {
          amount: context.amount,
          currency: "GHS",
          recipientName: context.recipientName || "Recipient",
          recipientPhone: normalizedDirectPhone,
        },
        missingInformation: context.amount ? [] : ["amount"],
        nextAction: context.amount ? "ASK_CONFIRMATION" : "ASK_AMOUNT",
        response: isTwi
          ? `Yɛahu nɔma ${normalizedDirectPhone}. Wopɛ sɛ womane ${context.amount || "sika"} kɔ nɔma yi so?`
          : `I have received number ${normalizedDirectPhone}. You want to send ${context.amount ? `${context.amount} Ghana cedis` : "money"} to this number. Should I proceed?`,
      };
    }

    // 4. Extraction of entities for SEND_MONEY
    const extractedAmt = extractAmount(text);
    const amount = extractedAmt !== null ? extractedAmt : context.amount;

    let recName = context.recipientName;
    let recPhone = context.recipientPhone;

    // Check if phone number was explicitly provided in the utterance
    const phonePattern = /(?:(?:\+?233|0)[\s.-]?)?(?:[25]\d{1}[\s.-]?\d{3}[\s.-]?\d{4}|\d{9,10})\b/;
    const phoneMatch = text.match(phonePattern);
    if (phoneMatch) {
      const norm = normalizeGhanaianPhoneNumber(phoneMatch[0]);
      if (norm.length === 10) recPhone = norm;
    } else if (normalizedDirectPhone.length === 10) {
      recPhone = normalizedDirectPhone;
    }

    // Name extraction: only extract recipient name from text if present
    const nameMatch = text.match(/\b(?:send\s+(?:money\s+)?to|transfer\s+to|pay\s+to|to|for|ma)\s+([A-Za-z]+)\b/i);
    const stopWords = new Set(["someone", "the", "a", "mtn", "telecel", "at", "cedis", "ghs", "money", "cash"]);
    if (nameMatch && !stopWords.has(nameMatch[1].toLowerCase())) {
      recName = nameMatch[1];
    } else if (!recName && !recPhone) {
      const extractedRec = extractRecipient(text);
      if (extractedRec.name) recName = extractedRec.name;
    }

    const missing: string[] = [];
    if (!amount) missing.push("amount");
    if (!recName && !recPhone) missing.push("recipient");
    if (!recPhone) missing.push("recipientPhone");

    let nextAction: NextActionType = "ASK_CONFIRMATION";
    let response = "";

    if (!recName && !recPhone) {
      nextAction = "ASK_RECIPIENT_NAME";
      response = isTwi
        ? "Me pa wo kyɛw, hwan na worepɛ sɛ womane sika no kɔ ne nkyɛn?"
        : "Who would you like to send money to?";
    } else if (!recPhone) {
      nextAction = "ASK_RECIPIENT_PHONE";
      response = isTwi
        ? `Me pa wo kyɛw, bɔ ${recName} telefon nɔma a ɛwɔ nɔma du.`
        : `I understand you want to send ${amount ? `${amount} Ghana cedis ` : ""}to ${recName}. Can I get ${recName}'s phone number?`;
    } else if (!amount) {
      nextAction = "ASK_AMOUNT";
      response = isTwi
        ? `Sika dodoɔ sɛn na wopɛ sɛ womane kɔ ma ${recName || recPhone}?`
        : `How much Ghana cedis would you like to send to ${recName || recPhone}?`;
    } else {
      nextAction = "ASK_CONFIRMATION";
      response = isTwi
        ? `Wo transfer ne: ${amount} Ghana cedis kɔ ma ${recName} wɔ nɔma ${recPhone} so. Wopene so sɛ memane seisei ara?`
        : `I have the following transfer: ${amount} Ghana cedis to ${recName} on number ${recPhone}. Would you like me to proceed?`;
    }

    return {
      intent: "SEND_MONEY",
      confidence: 0.92,
      entities: {
        amount,
        currency: "GHS",
        recipientName: recName,
        recipientPhone: recPhone,
        network: "MTN",
      },
      missingInformation: missing,
      nextAction,
      response,
    };
  }

  /**
   * Generates a conversational follow-up response after application transaction execution
   */
  public generateTransactionResultResponse(
    success: boolean,
    amount: number,
    recipientName: string,
    reference: string,
    language: "en" | "twi" = "en",
    errorMessage?: string
  ): string {
    const isTwi = language === "twi";
    if (success) {
      return isTwi
        ? `Yɛda wo ase pii. Wo transfer a ɛyɛ ${amount} Ghana Cedis a wokɔmaa ${recipientName} no akɔ yiye. Wo reference nɔma ne ${reference}. Yɛbɛtumi ayɛ biribi foforɔ ama wo anaa?`
        : `Thank you very much. Your transfer of ${amount} Ghana cedis to ${recipientName} was successful. Your transaction reference is ${reference}. Is there anything else I can help you with?`;
    }

    return isTwi
      ? `Me pa wo kyɛw, yɛantumi anwie dwumadi no. Wo sika da so wɔ wo akawnt mu. ${errorMessage || "Bɔ mmɔden biom akyire yi."}`
      : `I couldn't complete the transfer. Your money has not been confirmed as sent. ${errorMessage || "Please try again later."}`;
  }
}

export const aiConversationService = new AIConversationService();
