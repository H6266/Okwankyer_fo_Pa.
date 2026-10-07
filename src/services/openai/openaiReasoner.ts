/**
 * Ɔkwankyerɛfo Pa - OpenAI Cloud Reasoner (openaiReasoner.ts)
 * 
 * Provides structured reasoning for Ghanaian Mobile Financial interactions:
 * - Understands English, Akan/Twi, Ghanaian Pidgin, and code-switching
 * - Intent detection, financial entity extraction (amounts, 10-digit phone numbers, networks)
 * - Ghanaian name and contact recognition
 * - Mid-turn correction detection ("make it 50 instead", "no, Kofi")
 * - Coreference resolution ("to him", "same amount")
 * - Zero-PIN compliance: flags spoken PINs immediately
 */

import { openaiClient } from "./openaiClient";
import {
  AiLanguage,
  EntitySlotMap,
  IntentName,
  StructuredReasoningResponse,
} from "../../ai_system/core/aiTypes";
import { parseAndValidateAmount, validateGhanaPhoneNumber } from "../../domain/validation";

export interface OpenAiReasoningParams {
  utterance: string;
  languageHint?: AiLanguage;
  currentScreen?: string;
  currentStep?: string;
  existingSlots?: EntitySlotMap;
  recentTurns?: Array<{ role: string; text: string }>;
  semanticMemoryContext?: Array<{ text: string }>;
  frequentContacts?: Array<{ name: string; phone: string; network?: string }>;
}

export class OpenAIReasoner {
  private getModel(): string {
    return process.env.OPENAI_REASONING_MODEL || "gpt-4o-mini";
  }

  private getTimeoutMs(): number {
    const val = process.env.OPENAI_REASONING_TIMEOUT_MS;
    return val ? parseInt(val, 10) : 2500;
  }

  public isAvailable(): boolean {
    return openaiClient.isAvailable();
  }

  public async reason(params: OpenAiReasoningParams): Promise<StructuredReasoningResponse> {
    const cleanUtterance = params.utterance.trim();
    const sanitizedUtterance = cleanUtterance.slice(0, 500).replace(/<{3,}|>{3,}/g, "");

    const prompt = `You are the natural language reasoning layer for Ɔkwankyerɛfo Pa (Ghana Voice Mobile Money accessibility assistant).
Analyze this caller's utterance in English, Akan/Twi, Ghanaian Pidgin, or code-switched speech.

Caller utterance: <<<${sanitizedUtterance}>>>
Language hint: "${params.languageHint || "tw"}"
Current screen: "${params.currentScreen || "HOME"}"
Current step: "${params.currentStep || "welcome"}"
Existing transaction slots: ${JSON.stringify(params.existingSlots || {})}
Recent conversation context: ${JSON.stringify(params.recentTurns || [])}
Relevant remembered memories: ${JSON.stringify(params.semanticMemoryContext || [])}
Frequent contacts from memory: ${JSON.stringify(params.frequentContacts || [])}

Rules:
1. Identify the caller's intent from:
   ["SEND_MONEY", "PAY_BILL", "BUY_AIRTIME", "BUY_DATA", "CASH_OUT", "CHECK_BALANCE", "CHECK_ACCOUNT", "HELP", "GO_BACK", "GO_HOME", "CANCEL", "REPEAT", "CHANGE_INFORMATION", "CONFIRM", "DENY", "UNKNOWN"].
2. Extract financial entities:
   - amount: numeric value in GHS (e.g. 50, 20.5). Do NOT treat phone numbers as amounts.
   - recipientPhone: 10-digit Ghanaian mobile number starting with 0 (e.g. "0244123456").
   - recipientName: person or business name (e.g. "Ama", "Kofi", "ECG").
   - network: "MTN" | "Telecel" | "AT" | "G-Money".
3. Mid-turn corrections: detect changes to amount or recipient (e.g. "make it 70 instead", "not Ama, send to Kwame").
4. Coreferences: resolve pronouns/anaphora using memory & context (e.g. "send 20 to my sister", "same person", "send it").
5. Safety: If the user spoke a PIN or passcode, set safetyFlags: ["SPOKEN_PIN"].
6. Return ONLY a single valid JSON object strictly matching this schema:
{
  "intent": "SEND_MONEY",
  "confidence": 0.95,
  "language": "tw" | "en" | "ak",
  "entities": {
    "amount": 50,
    "recipientPhone": "0244123456",
    "recipientName": "Ama",
    "network": "MTN"
  },
  "conversationAct": "REQUEST" | "INFORM" | "CONFIRM" | "DENY" | "CORRECT" | "INTERRUPT" | "CHITCHAT" | "UNKNOWN",
  "correction": {
    "isCorrection": false,
    "field": "amount",
    "oldValue": "50",
    "newValue": "70",
    "reason": "user correction"
  } | null,
  "referenceResolution": {
    "hasReference": false,
    "referenceType": "SAME_RECIPIENT",
    "resolvedField": "recipientPhone",
    "resolvedValue": "0244123456"
  } | null,
  "ambiguity": {
    "isAmbiguous": false,
    "candidates": []
  },
  "requestedAction": {
    "type": "NONE",
    "tool": null,
    "arguments": {}
  },
  "requiresConfirmation": false,
  "safetyFlags": []
}`;

    const rawJson = await openaiClient.executeWithTimeout(
      "REASONING",
      async (client, signal) => {
        const response = await client.chat.completions.create(
          {
            model: this.getModel(),
            messages: [
              {
                role: "system",
                content:
                  "You are an expert Ghanaian mobile financial voice cognitive reasoning engine. Always respond with raw valid JSON only.",
              },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
          },
          { signal }
        );

        return response.choices[0]?.message?.content || "{}";
      },
      this.getTimeoutMs()
    );

    let cleanJson = (rawJson || "").trim();
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    }

    const parsed = JSON.parse(cleanJson);
    return this.normalizeParsedResponse(parsed, cleanUtterance, params.existingSlots);
  }

  private normalizeParsedResponse(
    data: any,
    rawText: string,
    existingSlots?: EntitySlotMap
  ): StructuredReasoningResponse {
    const rawIntent = String(data.intent || "UNKNOWN").toUpperCase();
    const validIntents: IntentName[] = [
      "SEND_MONEY", "PAY_BILL", "BUY_AIRTIME", "BUY_DATA", "CASH_OUT",
      "CHECK_BALANCE", "CHECK_ACCOUNT", "HELP", "GO_BACK", "GO_HOME",
      "CANCEL", "REPEAT", "CHANGE_INFORMATION", "CONFIRM", "DENY", "UNKNOWN"
    ];
    const intent: IntentName = (validIntents.includes(rawIntent as any) ? rawIntent : "UNKNOWN") as IntentName;

    const entities: EntitySlotMap = {
      ...(existingSlots || {}),
    };

    if (data.entities && typeof data.entities === "object") {
      if (data.entities.amount !== undefined && data.entities.amount !== null) {
        const amtVal = parseAndValidateAmount(String(data.entities.amount));
        if (amtVal.valid && amtVal.amount !== undefined) {
          entities.amount = amtVal.amount;
        }
      }
      if (data.entities.recipientPhone) {
        const phoneVal = validateGhanaPhoneNumber(String(data.entities.recipientPhone));
        if (phoneVal.valid && phoneVal.normalized) {
          entities.recipientPhone = phoneVal.normalized;
        }
      }
      if (data.entities.recipientName && typeof data.entities.recipientName === "string") {
        entities.recipientName = data.entities.recipientName.trim();
      }
      if (data.entities.network) {
        entities.network = data.entities.network;
      }
    }

    const confidence = typeof data.confidence === "number" ? Math.max(0.1, Math.min(0.99, data.confidence)) : 0.88;

    return {
      intent,
      confidence,
      language: (data.language || "tw") as AiLanguage,
      entities,
      conversationAct: data.conversationAct || "REQUEST",
      correction: data.correction?.isCorrection ? data.correction : null,
      referenceResolution: data.referenceResolution?.hasReference ? data.referenceResolution : null,
      ambiguity: {
        isAmbiguous: Boolean(data.ambiguity?.isAmbiguous),
        candidates: Array.isArray(data.ambiguity?.candidates) ? data.ambiguity.candidates : [],
      },
      requestedAction: {
        type: data.requestedAction?.type || "PLAN",
        tool: data.requestedAction?.tool || null,
        arguments: data.requestedAction?.arguments || {},
      },
      requiresConfirmation: Boolean(data.requiresConfirmation || intent === "SEND_MONEY"),
      safetyFlags: Array.isArray(data.safetyFlags) ? data.safetyFlags : [],
    };
  }
}

export const openAiReasoner = new OpenAIReasoner();
