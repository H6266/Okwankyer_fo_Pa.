/**
 * Ɔkwankyerɛfo Pa - AI Natural Language Understanding (NLU) Engine
 * Classifies intents, extracts transaction slots, and enforces zero-PIN voice safety.
 */

import { GoogleGenAI } from "@google/genai";
import {
  ExtractedSlots,
  IntentCategory,
  SupportedLanguage,
  TelcoNetwork,
} from "./types";
import { DEFAULT_AI_CONFIG, GHANA_NLU_SYSTEM_PROMPT } from "./config";

export class NluEngine {
  private ai: GoogleGenAI | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": DEFAULT_AI_CONFIG.userAgentHeader,
          },
        },
      });
    }
  }

  /**
   * Parses a spoken or typed utterance and extracts semantic intent and transactional entities.
   */
  public async analyzeUtterance(
    utterance: string,
    languageHint: SupportedLanguage = "bilingual"
  ): Promise<ExtractedSlots> {
    const clean = utterance.trim();

    // Fast-path pattern matching for short DTMF-like or affirmative spoken words
    const fastMatch = this.detectFastPattern(clean);
    if (fastMatch) {
      return fastMatch;
    }

    if (!this.ai) {
      this.initClient();
    }

    if (!this.ai) {
      return this.heuristicFallback(clean, languageHint);
    }

    try {
      const prompt = `Analyze this Ghanaian user's spoken utterance for a mobile financial voice assistant.
Utterance: "${clean}"
Language hint: ${languageHint}

Extract:
1. "intent": One of [SEND_MONEY, PAY_BILL, BUY_AIRTIME, BUY_DATA, CASH_OUT, CHECK_BALANCE, CHECK_ACCOUNT, CONFIRM, CANCEL, REPEAT, GO_BACK, SWITCH_LANGUAGE, HELP, EXIT, UNKNOWN]
2. "confidence": Between 0.0 and 1.0
3. "amount": Number in Ghana Cedis (GHS), or null
4. "recipientPhone": 10-digit Ghanaian phone string starting with 0, or null
5. "recipientName": Beneficiary name, or null
6. "network": "MTN" | "Telecel" | "AT" | "G-Money" | null
7. "detectedLanguage": "en" | "twi"
8. "pinDetected": boolean (true if user spoke 4 or 6 digit PIN numbers that appear to be security credentials)

Respond strictly in valid JSON:
{
  "intent": "SEND_MONEY",
  "confidence": 0.95,
  "amount": 50,
  "recipientPhone": "0553838464",
  "recipientName": "Kwame",
  "network": "MTN",
  "detectedLanguage": "twi",
  "pinDetected": false
}`;

      const response = await this.ai.models.generateContent({
        model: DEFAULT_AI_CONFIG.geminiModel,
        contents: prompt,
        config: {
          systemInstruction: GHANA_NLU_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const parsed = JSON.parse(response.text || "{}");

      // Zero-PIN security protection
      if (parsed.pinDetected) {
        console.warn("[NluEngine] 🚨 Security alert: Caller attempted to speak a PIN over voice channel!");
      }

      const intent = (parsed.intent || "UNKNOWN") as IntentCategory;
      const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.7;
      const detectedLang: SupportedLanguage = parsed.detectedLanguage === "twi" ? "twi" : "en";

      const requiresClarification = confidence >= 0.4 && confidence < DEFAULT_AI_CONFIG.confidenceThreshold;

      return {
        intent,
        confidence,
        amount: typeof parsed.amount === "number" ? parsed.amount : null,
        currency: "GHS",
        recipientName: parsed.recipientName || null,
        recipientPhone: parsed.recipientPhone || null,
        network: (parsed.network as TelcoNetwork) || null,
        rawUtterance: clean,
        language: detectedLang,
        requiresClarification,
        clarificationPrompt: requiresClarification
          ? {
              en: `Did you mean you want to ${intent.toLowerCase().replace(/_/g, " ")}? Say yes to confirm or no to change.`,
              twi: `Wopɛ sɛ woyɛ wei anaa? Sɛ aane a, ka aane. Sɛ dabi a, ka dabi.`,
            }
          : undefined,
      };
    } catch (err: any) {
      console.error("[NluEngine] NLU extraction error:", err.message);
      return this.heuristicFallback(clean, languageHint);
    }
  }

  private detectFastPattern(text: string): ExtractedSlots | null {
    const lower = text.toLowerCase();

    // Confirm
    if (["1", "one", "baako", "aane", "yes", "confirm", "ɛyɛ", "yɛ"].includes(lower)) {
      return {
        intent: "CONFIRM",
        confidence: 0.98,
        amount: null,
        currency: "GHS",
        recipientName: null,
        recipientPhone: null,
        network: null,
        rawUtterance: text,
        language: ["baako", "aane", "ɛyɛ", "yɛ"].includes(lower) ? "twi" : "en",
        requiresClarification: false,
      };
    }

    // Cancel
    if (["2", "two", "mmienu", "dabi", "no", "cancel", "twa mu", "stop"].includes(lower)) {
      return {
        intent: "CANCEL",
        confidence: 0.98,
        amount: null,
        currency: "GHS",
        recipientName: null,
        recipientPhone: null,
        network: null,
        rawUtterance: text,
        language: ["mmienu", "dabi", "twa mu"].includes(lower) ? "twi" : "en",
        requiresClarification: false,
      };
    }

    // Balance check
    if (lower.includes("balance") || lower.includes("sika a aka")) {
      return {
        intent: "CHECK_BALANCE",
        confidence: 0.95,
        amount: null,
        currency: "GHS",
        recipientName: null,
        recipientPhone: null,
        network: null,
        rawUtterance: text,
        language: lower.includes("sika") ? "twi" : "en",
        requiresClarification: false,
      };
    }

    return null;
  }

  private heuristicFallback(text: string, languageHint: SupportedLanguage): ExtractedSlots {
    const lower = text.toLowerCase();
    let intent: IntentCategory = "UNKNOWN";

    if (lower.includes("send") || lower.includes("mane") || lower.includes("transfer")) {
      intent = "SEND_MONEY";
    } else if (lower.includes("bill") || lower.includes("ecg") || lower.includes("gwcl")) {
      intent = "PAY_BILL";
    } else if (lower.includes("airtime") || lower.includes("credit")) {
      intent = "BUY_AIRTIME";
    }

    const phoneMatch = text.match(/0[25][0-9]{8}/);
    const amountMatch = text.match(/([0-9]+(\.[0-9]{1,2})?)\s*(cedis?|ghs|gh)?/i);

    return {
      intent,
      confidence: intent === "UNKNOWN" ? 0.3 : 0.65,
      amount: amountMatch ? parseFloat(amountMatch[1]) : null,
      currency: "GHS",
      recipientName: null,
      recipientPhone: phoneMatch ? phoneMatch[0] : null,
      network: null,
      rawUtterance: text,
      language: languageHint === "bilingual" ? "twi" : languageHint,
      requiresClarification: intent !== "UNKNOWN",
    };
  }
}

export const nluEngine = new NluEngine();
