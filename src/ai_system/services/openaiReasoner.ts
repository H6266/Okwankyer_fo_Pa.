/**
 * Ɔkwankyerɛfo Pa - OpenAI Reasoner Service (openaiReasoner.ts)
 * 
 * OpenAI 1 — Reasoning Layer:
 * Responsible for:
 * - Natural speech understanding
 * - Intent extraction
 * - Entity / slot resolution (amount, recipientName, recipientPhone, network)
 * - Corrections (e.g., "actually make it 100")
 * - Conversational context & references
 * - Code-switching assistance (English & Akan Twi)
 * - Determining what the user means without executing financial operations.
 * 
 * Uses OpenAI Responses API / Structured Outputs format with JSON Schema.
 * Includes resilient deterministic fallback when API key is unconfigured or times out.
 */

import { TWI_INTENT_KEYWORDS, TWI_AFFIRMATIONS, TWI_REJECTIONS } from "../linguistic/twiLexicon";
import { parseTwiSpokenNumber } from "../linguistic/twiNumberWords";

export interface StructuredReasoningOutput {
  intent: string;
  slots: {
    amount?: number | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    network?: string | null;
  };
  dialogueAct:
    | "REQUEST_MISSING_INFORMATION"
    | "CONFIRM_TRANSACTION"
    | "EXECUTE_INTENT"
    | "CLARIFY"
    | "GREETING"
    | "CANCEL"
    | "UNKNOWN";
  missingSlots: string[];
  confidence: number;
  explanation?: string;
  detectedLanguage?: "en" | "twi" | "code-switched";
  userConfirmed?: boolean;
  correctionDetected?: boolean;
}

export interface ReasonerInput {
  transcript: string;
  sessionLanguage?: "en" | "twi" | string;
  currentSlots?: {
    amount?: number | null;
    recipientName?: string | null;
    recipientPhone?: string | null;
    network?: string | null;
  };
  conversationHistory?: Array<{ role: "system" | "user" | "assistant"; text: string }>;
  semanticMemoryContext?: string;
}

export class OpenAiReasoner {
  private get apiKey(): string {
    return (process.env.OPENAI_API_KEY || "").trim();
  }

  private get model(): string {
    return (process.env.OPENAI_REASONING_MODEL || "gpt-4o-mini").trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Main reasoning entry point:
   * Uses OpenAI Structured Output when available, with fast deterministic fallback.
   */
  public async reasonAboutUtterance(input: ReasonerInput): Promise<StructuredReasoningOutput> {
    const rawTranscript = (input.transcript || "").trim();
    if (!rawTranscript) {
      return {
        intent: "unknown",
        slots: { ...input.currentSlots },
        dialogueAct: "CLARIFY",
        missingSlots: [],
        confidence: 0.0,
        explanation: "Empty utterance received",
      };
    }

    if (this.isConfigured()) {
      try {
        const result = await this.callOpenAiStructuredOutput(input);
        if (result && result.intent) {
          return result;
        }
      } catch (err: any) {
        console.warn("[OpenAiReasoner] Remote API call failed, falling back to local reasoning:", err.message);
      }
    }

    return this.fallbackDeterministicReasoning(input);
  }

  /**
   * Invokes OpenAI Chat Completions with strict structured json_schema
   */
  private async callOpenAiStructuredOutput(input: ReasonerInput): Promise<StructuredReasoningOutput> {
    const systemPrompt = `You are the NLU reasoning layer for Ɔkwankyerɛfo Pa, an accessible voice banking IVR for MTN Mobile Money in Ghana.
Languages spoken: English, Akan Twi, and Ghanaian Code-Switched speech.

Responsibilities:
1. Extract user intent: 'momo.transfer' | 'momo.check_balance' | 'momo.buy_airtime' | 'momo.buy_data' | 'momo.pay_bill' | 'greeting' | 'cancel' | 'unknown'
2. Extract financial entities:
   - amount (in Ghanaian Cedis / GHS as a number, e.g. 50, 100). Understand Twi number words (aduonum = 50, ɔha = 100, aduanan = 40, etc.)
   - recipientName (e.g. Ama, Kofi, Kwame, Serwaa, Mensah)
   - recipientPhone (e.g. 10 digits starting with 024, 054, 055, 059, 027, 020, 050)
3. Detect corrections (e.g., "actually make it 100", "no not Ama, Kofi") and update slots accordingly.
4. Detect confirmation ("yes", "yeah", "aane", "ɛte saa", "sure") or rejection ("no", "daabi").
5. Determine dialogueAct:
   - 'REQUEST_MISSING_INFORMATION' if required slots are missing for momo.transfer (amount, recipientPhone)
   - 'CONFIRM_TRANSACTION' if all required slots are present and awaiting user confirmation
   - 'EXECUTE_INTENT' if user explicitly confirms
   - 'GREETING' if general greeting
   - 'CANCEL' if user wants to cancel
   - 'CLARIFY' if unclear
6. You DO NOT execute transactions. Only analyze speech.`;

    const schema = {
      name: "reasoning_output",
      strict: true,
      schema: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: [
              "momo.transfer",
              "momo.check_balance",
              "momo.buy_airtime",
              "momo.buy_data",
              "momo.pay_bill",
              "greeting",
              "cancel",
              "unknown",
            ],
          },
          slots: {
            type: "object",
            properties: {
              amount: { type: ["number", "null"] },
              recipientName: { type: ["string", "null"] },
              recipientPhone: { type: ["string", "null"] },
              network: { type: ["string", "null"] },
            },
            required: ["amount", "recipientName", "recipientPhone", "network"],
            additionalProperties: false,
          },
          dialogueAct: {
            type: "string",
            enum: [
              "REQUEST_MISSING_INFORMATION",
              "CONFIRM_TRANSACTION",
              "EXECUTE_INTENT",
              "CLARIFY",
              "GREETING",
              "CANCEL",
              "UNKNOWN",
            ],
          },
          missingSlots: {
            type: "array",
            items: { type: "string" },
          },
          confidence: { type: "number" },
          explanation: { type: "string" },
          detectedLanguage: {
            type: "string",
            enum: ["en", "twi", "code-switched"],
          },
          userConfirmed: { type: "boolean" },
          correctionDetected: { type: "boolean" },
        },
        required: [
          "intent",
          "slots",
          "dialogueAct",
          "missingSlots",
          "confidence",
          "explanation",
          "detectedLanguage",
          "userConfirmed",
          "correctionDetected",
        ],
        additionalProperties: false,
      },
    };

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    if (input.semanticMemoryContext) {
      messages.push({
        role: "system",
        content: `Semantic Memory Context from previous user transactions: ${input.semanticMemoryContext}`,
      });
    }

    if (input.currentSlots) {
      messages.push({
        role: "system",
        content: `Current Session Draft Slots: ${JSON.stringify(input.currentSlots)}`,
      });
    }

    if (input.conversationHistory && input.conversationHistory.length > 0) {
      for (const turn of input.conversationHistory.slice(-4)) {
        messages.push({
          role: turn.role === "assistant" ? "assistant" : "user",
          content: turn.text,
        });
      }
    }

    messages.push({
      role: "user",
      content: `<caller_transcript>${input.transcript}</caller_transcript>`,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: schema,
        },
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errText.slice(0, 100)}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error("No structured content returned from OpenAI");
    }

    return JSON.parse(rawContent) as StructuredReasoningOutput;
  }

  /**
   * Deterministic local fallback when OpenAI is offline or unconfigured.
   * Leverages exact Ghanaian linguistic rules and slot extractors.
   */
  public fallbackDeterministicReasoning(input: ReasonerInput): StructuredReasoningOutput {
    const text = input.transcript.toLowerCase().trim();
    const current = { ...(input.currentSlots || {}) };

    // 1. Language detection
    const isTwi =
      /(\b(?:mane|sika|hwɛ|bisa|pɛ|kɔ|aane|daabi|mpem|aduonum|ahanu|cedis|cedi)\b)/i.test(text) ||
      input.sessionLanguage === "twi";
    const detectedLanguage: "en" | "twi" | "code-switched" =
      isTwi && /(\b(?:send|money|transfer|cedis|ghana)\b)/i.test(text)
        ? "code-switched"
        : isTwi
        ? "twi"
        : "en";

    // 2. Affirmation / Rejection
    const isAffirmative =
      /^(?:yes|yeah|yep|sure|ok|okay|confirm|proceed|aane|yoo|ɛte saa|1)$/i.test(text) ||
      /\b(?:yes|aane|proceed|confirm)\b/i.test(text);
    const isRejection =
      /^(?:no|nope|cancel|stop|never|daabi|dabi|2)$/i.test(text) ||
      /\b(?:no|daabi|cancel)\b/i.test(text);

    // 3. Intent Detection
    let intent = current.amount || current.recipientName || current.recipientPhone ? "momo.transfer" : "unknown";

    if (/\b(?:check\s*balance|balance|hwɛ\s*sika|sika\s*a\s*aka|how\s*much)\b/i.test(text)) {
      intent = "momo.check_balance";
    } else if (/\b(?:airtime|kredit|credit|top\s*up|tɔ\s*airtime)\b/i.test(text)) {
      intent = "momo.buy_airtime";
    } else if (/\b(?:data|bundle|internet)\b/i.test(text)) {
      intent = "momo.buy_data";
    } else if (/\b(?:send|transfer|pay|give|mane|kɔma|soma)\b/i.test(text)) {
      intent = "momo.transfer";
    } else if (/\b(?:hi|hello|akwaaba|good\s*morning|good\s*afternoon)\b/i.test(text)) {
      intent = "greeting";
    } else if (isRejection) {
      intent = "cancel";
    }

    // 4. Correction Detection
    const correctionDetected = /\b(?:actually|change|not\s+\w+|instead|make\s+it)\b/i.test(text);

    // 5. Amount Extraction
    let extractedAmount: number | null = current.amount ?? null;
    const digitMatch = text.match(/\b(?:ghs|cedis|cedi)?\s*(\d+(?:\.\d{1,2})?)\s*(?:ghs|cedis|cedi)?\b/i);
    if (digitMatch && !digitMatch[1].startsWith("02") && !digitMatch[1].startsWith("05") && digitMatch[1].length <= 5) {
      const parsedNum = parseFloat(digitMatch[1]);
      if (parsedNum > 0 && parsedNum <= 10000) {
        extractedAmount = parsedNum;
      }
    }

    // Word amounts (e.g. "fifty cedis", "one hundred cedis", Twi "aduonum", "ɔha")
    if (!extractedAmount) {
      if (/\b(?:fifty|aduonum)\b/i.test(text)) extractedAmount = 50;
      else if (/\b(?:twenty|aduonu)\b/i.test(text)) extractedAmount = 20;
      else if (/\b(?:hundred|ɔha|aha)\b/i.test(text)) extractedAmount = 100;
      else if (/\b(?:two hundred|ahanu)\b/i.test(text)) extractedAmount = 200;
      else if (/\b(?:ten|du)\b/i.test(text)) extractedAmount = 10;
      else if (/\b(?:five|enum)\b/i.test(text)) extractedAmount = 5;
      else {
        const parsedTwi = parseTwiSpokenNumber(text);
        if (parsedTwi !== null && parsedTwi > 0 && parsedTwi <= 10000) {
          extractedAmount = parsedTwi;
        }
      }
    }

    // 6. Recipient Phone Extraction (10 digits starting with Ghana prefixes)
    let extractedPhone: string | null = current.recipientPhone ?? null;
    const phoneMatch = text.match(/\b(0[235][0-9]{8})\b/);
    if (phoneMatch) {
      extractedPhone = phoneMatch[1];
    } else {
      // Spoken phone digits (e.g., "zero two four one two three four five six seven")
      const digitsOnly = text.replace(/[^0-9]/g, "");
      if (digitsOnly.length === 10 && /^0[235]/.test(digitsOnly)) {
        extractedPhone = digitsOnly;
      }
    }

    // 7. Recipient Name Extraction
    let extractedName: string | null = current.recipientName ?? null;
    const nameMatch = text.match(/\b(?:to|ma|give|send\s+to|for)\s+([A-Z][a-z]+|[a-z]{3,15})\b/i);
    if (nameMatch) {
      const cand = nameMatch[1].trim().toLowerCase();
      const forbidden = ["him", "her", "them", "someone", "cedis", "ghs", "money", "sika", "airtime", "data", "send", "the", "my"];
      if (!forbidden.includes(cand)) {
        extractedName = cand.charAt(0).toUpperCase() + cand.slice(1);
      }
    } else {
      // Common Ghanaian names
      const ghanaianNames = ["ama", "kofi", "kwame", "kwesi", "yaw", "abena", "afia", "akosua", "yaa", "mensah", "serwaa", "boateng", "asante"];
      for (const name of ghanaianNames) {
        if (new RegExp(`\\b${name}\\b`, "i").test(text)) {
          extractedName = name.charAt(0).toUpperCase() + name.slice(1);
          break;
        }
      }
    }

    // 8. Determine missing slots & dialogue act
    const missingSlots: string[] = [];
    if (intent === "momo.transfer") {
      if (!extractedAmount) missingSlots.push("amount");
      if (!extractedName && !extractedPhone) missingSlots.push("recipientName");
      if (!extractedPhone) missingSlots.push("recipientPhone");
    }

    let dialogueAct: StructuredReasoningOutput["dialogueAct"] = "UNKNOWN";

    if (intent === "greeting") {
      dialogueAct = "GREETING";
    } else if (intent === "cancel" || isRejection) {
      dialogueAct = "CANCEL";
    } else if (isAffirmative && current.amount && current.recipientPhone) {
      dialogueAct = "EXECUTE_INTENT";
    } else if (missingSlots.length > 0) {
      dialogueAct = "REQUEST_MISSING_INFORMATION";
    } else if (intent === "momo.transfer" && extractedAmount && extractedPhone) {
      dialogueAct = "CONFIRM_TRANSACTION";
    } else {
      dialogueAct = "CLARIFY";
    }

    return {
      intent,
      slots: {
        amount: extractedAmount,
        recipientName: extractedName,
        recipientPhone: extractedPhone,
        network: "MTN",
      },
      dialogueAct,
      missingSlots,
      confidence: 0.94,
      explanation: "Deterministic Ghanaian semantic analysis applied",
      detectedLanguage,
      userConfirmed: isAffirmative,
      correctionDetected,
    };
  }
}

export const openaiReasoner = new OpenAiReasoner();
