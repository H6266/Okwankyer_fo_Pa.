/**
 * Ɔkwankyerɛfo Pa - Groq AI Reasoner (groqReasoner.ts)
 * 
 * Provides ultra-fast LLM reasoning via Groq LPU:
 * 1. Sanitizes untrusted caller transcript & masks phone numbers
 * 2. Produces structured ModelOutputContract for the Central Brain
 * 3. Fallback reasoner for CognitiveRouter and ReasoningEngine
 */

import { groqClient } from "./groqClient";
import { ModelOutputContract } from "../../ai_system/brain/types";
import { COMPACT_MOMO_SYSTEM_INSTRUCTION } from "../../ai_system/understanding/reasoningEngine";
import {
  buildTelephonyBrainKnowledge,
  maskDraftForModel,
  TelephonyBrainContext,
} from "../../ai_system/brain/telephonyBrainKnowledge";
import { auditLogger } from "../auditLogger";
import {
  AiLanguage,
  EntitySlotMap,
  IntentName,
  StructuredReasoningResponse,
} from "../../ai_system/core/aiTypes";
import { parseAndValidateAmount, validateGhanaPhoneNumber } from "../../domain/validation";
import type { ReasoningParams } from "../modelContracts";

const BRAIN_INTENTS = new Set([
  "momo.transfer",
  "momo.cash_out",
  "momo.check_balance",
  "momo.buy_airtime",
  "momo.buy_data",
  "momo.reverse_transaction",
  "momo.customer_care",
  "momo.loan",
  "momo.pay_bill",
  "smalltalk",
  "unknown",
]);

const BRAIN_REPLY_KINDS = new Set([
  "clarify_slot",
  "clarify_intent",
  "not_ready",
  "confirm",
  "dispatch",
  "smalltalk",
  "cancel",
  "error",
]);

export function buildGroqBrainPrompt(
  maskedUtterance: string,
  draftSlots: Record<string, unknown>,
  context: TelephonyBrainContext
): string {
  const safeDraftSlots = maskDraftForModel(draftSlots);

  return `Caller utterance (untrusted transcript; phone numbers are masked): ${JSON.stringify(maskedUtterance)}
Current intent: ${context.intent || "unknown"}
Current draft state: ${JSON.stringify(safeDraftSlots)}
${buildTelephonyBrainKnowledge(context)}

Return ONLY a valid JSON object matching the application's ModelOutputContract:
{
  "intent": {
    "id": "momo.transfer" | "momo.cash_out" | "momo.check_balance" | "momo.buy_airtime" | "momo.buy_data" | "momo.reverse_transaction" | "momo.customer_care" | "momo.loan" | "momo.pay_bill" | "smalltalk" | "unknown",
    "confidence": number
  },
  "slots": {
    "amount": number | null,
    "recipient": { "phone": null, "name": string | null } | null,
    "network": string | null,
    "reference": string | null
  },
  "signals": {
    "correction": boolean,
    "interruption": boolean,
    "user_confirmed": boolean
  },
  "reply": {
    "text_en": string,
    "text_localized": string,
    "target_language": "${context.targetLanguage}",
    "reply_kind": "clarify_slot" | "clarify_intent" | "not_ready" | "confirm" | "dispatch" | "smalltalk" | "cancel" | "error"
  }
}
The reply.text_en field must be concise English for internal processing. The reply.text_localized field must be a natural, concise spoken response in ${context.targetLanguage} for the caller. Keep it faithful to the application's safety and transaction state; do not invent amounts, recipients, verification results, or transaction outcomes. Never speak digits for clarify_slot or confirm replies. Use "unknown" only when intent is unclear. Never return fields outside this schema.`;
}

export function isGroqBrainContract(data: unknown): data is ModelOutputContract {
  if (!data || typeof data !== "object") return false;
  const candidate = data as Partial<ModelOutputContract>;
  const onlyKeys = (value: object, allowed: string[]) =>
    Object.keys(value).every((key) => allowed.includes(key));
  if (
    !onlyKeys(candidate, ["intent", "slots", "signals", "reply", "provider"]) ||
    !candidate.intent ||
    !onlyKeys(candidate.intent, ["id", "confidence", "alternatives"]) ||
    !BRAIN_INTENTS.has(candidate.intent.id) ||
    !Number.isFinite(candidate.intent.confidence) ||
    candidate.intent.confidence < 0 ||
    candidate.intent.confidence > 1 ||
    !candidate.slots ||
    !onlyKeys(candidate.slots, ["amount", "recipient", "network", "reference"]) ||
    !candidate.signals ||
    !onlyKeys(candidate.signals, ["correction", "interruption", "user_confirmed"]) ||
    typeof candidate.signals.correction !== "boolean" ||
    typeof candidate.signals.interruption !== "boolean" ||
    typeof candidate.signals.user_confirmed !== "boolean" ||
    !candidate.reply ||
    !onlyKeys(candidate.reply, ["text_en", "text_localized", "target_language", "reply_kind", "template_key"]) ||
    typeof candidate.reply.text_en !== "string" ||
    candidate.reply.text_en.length > 250 ||
    typeof candidate.reply.text_localized !== "string" ||
    candidate.reply.text_localized.length > 250 ||
    (candidate.reply.template_key !== undefined && typeof candidate.reply.template_key !== "string") ||
    !["twi-asante", "twi-akuapem", "en"].includes(candidate.reply.target_language) ||
    !BRAIN_REPLY_KINDS.has(candidate.reply.reply_kind)
  ) {
    return false;
  }

  if (candidate.slots.amount !== undefined && candidate.slots.amount !== null) {
    const amount = parseAndValidateAmount(String(candidate.slots.amount));
    if (!amount.valid || amount.amount === undefined) return false;
  }
  if (candidate.slots.network !== undefined && candidate.slots.network !== null && typeof candidate.slots.network !== "string") {
    return false;
  }
  if (candidate.slots.reference !== undefined && candidate.slots.reference !== null && typeof candidate.slots.reference !== "string") {
    return false;
  }
  if (candidate.slots.recipient !== undefined && candidate.slots.recipient !== null) {
    if (!onlyKeys(candidate.slots.recipient, ["phone", "name"])) return false;
    const phoneValue = candidate.slots.recipient.phone;
    if (phoneValue !== undefined) {
      if (typeof phoneValue !== "string") return false;
      const phone = validateGhanaPhoneNumber(phoneValue);
      if (!phone.valid || !phone.normalized) return false;
    }
    if (candidate.slots.recipient.name !== undefined && typeof candidate.slots.recipient.name !== "string") {
      return false;
    }
  }
  return true;
}

export class GroqReasoner {
  public getModel(): string {
    return groqClient.getModel();
  }

  public isAvailable(): boolean {
    return groqClient.isAvailable();
  }

  public getTimeoutMs(): number {
    return groqClient.getTimeoutMs();
  }

  /**
   * Evaluates caller utterance and current draft state for the Central Brain,
   * returning the standardized ModelOutputContract.
   */
  public async reasonForBrain(
    maskedUtterance: string,
    draftSlots: Record<string, unknown> = {},
    timeoutMs: number = this.getTimeoutMs(),
    context: TelephonyBrainContext = { targetLanguage: "en" }
  ): Promise<ModelOutputContract | null> {
    if (!this.isAvailable()) {
      return null;
    }

    const prompt = buildGroqBrainPrompt(maskedUtterance, draftSlots, context);

    try {
      const rawJson = await groqClient.executeWithTimeout(
        "GROQ_BRAIN_REASONING",
        async (client, signal) => {
          const request = {
            model: this.getModel(),
            messages: [
              {
                role: "system" as const,
                content: `${COMPACT_MOMO_SYSTEM_INSTRUCTION}
For this central-brain task, never reconstruct or generate a masked phone number. Preserve the selected target language and return only the requested ModelOutputContract JSON. The application exclusively determines transaction stages and audio prompts.`,
              },
              {
                role: "user" as const,
                content: prompt,
              },
            ],
            response_format: { type: "json_object" as const },
            temperature: 0,
            max_tokens: 300,
          };
          const response = await client.chat.completions.create(
            request,
            { signal }
          );

          return response.choices[0]?.message?.content || "{}";
        },
        timeoutMs
      );

      let cleanJson = (rawJson || "").trim();
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      }

      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (!match) return null;

      const parsed = JSON.parse(match[0]);
      if (parsed?.slots?.recipient && typeof parsed.slots.recipient === "object") {
        delete parsed.slots.recipient.phone;
      }
      if (parsed?.reply?.target_language !== context.targetLanguage) return null;
      if (isGroqBrainContract(parsed)) {
        auditLogger.log(
          "info",
          "GROQ_REASONING",
          `Groq evaluated intent=${parsed.intent.id} confidence=${parsed.intent.confidence ?? 0.9}`
        );
        parsed.provider = "groq";
        return parsed;
      }
      return null;
    } catch (err: any) {
      console.warn("[GroqReasoner] Groq reasoning error:", err?.message || err);
      return null;
    }
  }

  /**
   * Structured cognitive reasoning for the central ReasoningEngine and CognitiveRouter.
   * Fallback in the cascade: Gemini -> Groq AI -> Local Inbuilt Brain.
   */
  public async reason(params: ReasoningParams): Promise<StructuredReasoningResponse> {
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

    const rawJson = await groqClient.executeWithTimeout(
      "GROQ_COGNITIVE_REASONING",
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
    _rawText: string,
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

export const groqReasoner = new GroqReasoner();
