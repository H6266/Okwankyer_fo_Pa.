/**
 * Ɔkwankyerɛfo Pa - Conversational AI Reasoning Engine (reasoningEngine.ts)
 *
 * Implements Google Gemini Native Function Calling (Tools) and the Chat Session API
 * using @google/genai, with conversational dialogue and strict deterministic fallback
 * when offline or unavailable.
 */

import { FunctionDeclaration, GoogleGenAI, Type } from "@google/genai";
import {
  AiLanguage,
  EntitySlotMap,
  IntentName,
  StructuredReasoningResponse,
} from "../core/aiTypes";
import { AI_CONFIG } from "../core/aiConfig";
import { languageDetector } from "../perception/languageDetector";
import { aiUnderstanding } from "../core/aiUnderstanding";
import { geminiClient } from "../../services/geminiClient";
import { openAiReasoner } from "../../services/openai/openaiReasoner";

export const MOMO_SYSTEM_INSTRUCTION = `You are a voice-optimized accessibility assistant for MTN Mobile Money (MoMo) in Ghana. Your job is to help users initiate financial transactions by extracting required parameters from their natural, conversational speech.

Required Transaction Parameters:
- Transaction Type (Send Money, Cash Out, Buy Airtime, etc.)
- Amount (in GHS)
- Recipient Number (10-digit Ghanaian mobile number)
- Reference (Brief note)

Core Instructions:
1. Extract Dynamically: Users may provide information out of order or all at once (e.g., "Send 50 cedis to Kwame for food"). Extract what you can and only ask for the missing parameters.
2. Do Not Hallucinate or Assume Data: If a user does not provide a phone number in their message, do not attempt to validate a missing number or throw formatting errors. Simply reply: "I understand you want to [action]. Please tell me the phone number."
3. Handle Messy Input Gracefully: Users are using voice-to-text. Ignore gibberish, filler words, or background noise (e.g., "um", "ahjsb"). Extract only the actionable numbers and intent.
4. Keep It Conversational & Short: Limit your responses to 1-3 short sentences. This is for a voice interface, so avoid lists, markdown formatting, or overly robotic technical jargon.
5. One Step at a Time: If multiple things are missing, ask for just the most important missing piece next (e.g., ask for the number before asking for the reference).
6. Security: Never ask for the user's MoMo PIN. Always conclude a ready transaction by summarizing the details (Amount, Number) and instructing the user to check their phone screen to enter their PIN securely.

Tools / Native Function Calling:
- When all required parameters for sending money (recipient_number, amount, reference) are known, call the tool 'process_send_money'.
- When all required parameters for cash out (agent_number, amount) are known, call the tool 'process_cash_out'.
- If any required parameter is still missing, do NOT invoke a tool. Instead, respond with a short conversational sentence asking for the single most important missing piece.`;

export const SEND_MONEY_TOOL: FunctionDeclaration = {
  name: "process_send_money",
  description: "Process a Mobile Money transfer once the recipient number, amount, and reference have all been gathered.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      recipient_number: {
        type: Type.STRING,
        description: "10-digit Ghanaian mobile money phone number (e.g. 0244123456 or 0551234567).",
      },
      amount: {
        type: Type.NUMBER,
        description: "The transaction amount in Ghana Cedis (GHS).",
      },
      reference: {
        type: Type.STRING,
        description: "A brief note or reference for the transfer (e.g. school fees, food, transport).",
      },
    },
    required: ["recipient_number", "amount", "reference"],
  },
};

export const CASH_OUT_TOOL: FunctionDeclaration = {
  name: "process_cash_out",
  description: "Process a Mobile Money Cash Out at an agent once the agent number and amount have been gathered.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      agent_number: {
        type: Type.STRING,
        description: "The 6-digit agent code or phone number.",
      },
      amount: {
        type: Type.NUMBER,
        description: "The amount in Ghana Cedis (GHS) to cash out.",
      },
    },
    required: ["agent_number", "amount"],
  },
};

interface ActiveChatSession {
  chat: any;
  lastUsedAt: number;
}

export class ReasoningEngine {
  private ai: GoogleGenAI | null = null;
  private client = geminiClient;
  private activeChatSessions = new Map<string, ActiveChatSession>();
  private readonly SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
            "User-Agent": AI_CONFIG.userAgentHeader,
          },
        },
      });
    }
  }

  public setClient(customClient: any): void {
    this.client = customClient;
  }

  /**
   * Cleans up expired chat sessions to avoid memory leaks.
   */
  private cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [key, session] of this.activeChatSessions.entries()) {
      if (now - session.lastUsedAt > this.SESSION_TTL_MS) {
        this.activeChatSessions.delete(key);
      }
    }
  }

  /**
   * Retrieves an existing stateful chat session or creates a new one.
   */
  public getOrCreateChatSession(sessionId: string, ai: GoogleGenAI, modelName: string = "gemini-3.8-flash"): any {
    this.cleanExpiredSessions();
    const existing = this.activeChatSessions.get(sessionId);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.chat;
    }

    const chat = ai.chats.create({
      model: modelName,
      config: {
        systemInstruction: MOMO_SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: [SEND_MONEY_TOOL, CASH_OUT_TOOL] }],
        temperature: 0.2,
      },
    });

    this.activeChatSessions.set(sessionId, {
      chat,
      lastUsedAt: Date.now(),
    });

    return chat;
  }

  public resetChatSession(sessionId: string): void {
    this.activeChatSessions.delete(sessionId);
  }

  /**
   * Main entry: interprets utterance using Gemini Native Function Calling and Chat Session API,
   * or falls back seamlessly to deterministic reasoning when offline.
   */
  public async reason(params: {
    utterance: string;
    sessionId?: string;
    languageHint?: AiLanguage;
    currentScreen?: string;
    currentStep?: string;
    existingSlots?: EntitySlotMap;
    recentTurns?: Array<{ role: string; text: string }>;
    semanticMemoryContext?: Array<{ text: string }>;
    frequentContacts?: Array<{ name: string; phone: string; network?: string }>;
  }): Promise<StructuredReasoningResponse> {
    const cleanUtterance = params.utterance.trim();

    // Fast-path: simple confirmations and cancellations (e.g. "yes", "aane", "cancel")
    if (this.isSimpleAffirmationOrDenial(cleanUtterance)) {
      return this.deterministicReasoning(params);
    }

    if (this.client && typeof (this.client as any).isAvailable === "function" && !(this.client as any).isAvailable()) {
      if (openAiReasoner.isAvailable()) {
        try {
          return await openAiReasoner.reason({
            utterance: cleanUtterance,
            languageHint: params.languageHint,
            currentScreen: params.currentScreen,
            currentStep: params.currentStep,
            existingSlots: params.existingSlots,
            recentTurns: params.recentTurns,
            semanticMemoryContext: params.semanticMemoryContext,
            frequentContacts: params.frequentContacts,
          });
        } catch (err: any) {
          console.warn("[ReasoningEngine] OpenAI reasoner attempt notice:", err?.message || err);
        }
      }
      return this.deterministicReasoning(params);
    }

    const candidateModels = [
      AI_CONFIG.model || "gemini-3.8-flash",
      "gemini-flash-latest",
    ];

    const availableCandidates = candidateModels.filter((m) => {
      if (typeof (this.client as any)?.isModelAvailable === "function") {
        return (this.client as any).isModelAvailable(m);
      }
      return true;
    });

    if (availableCandidates.length === 0) {
      return this.deterministicReasoning(params);
    }

    const sessionKey = params.sessionId || `adhoc_${Date.now()}`;
    const sanitizedUtterance = cleanUtterance.slice(0, 500).replace(/<{3,}|>{3,}/g, "");

    for (const modelName of availableCandidates) {
      try {
        const result = await geminiClient.executeWithTimeout(
          "REASONING_CHAT",
          async (ai, signal) => {
            const chat = this.getOrCreateChatSession(sessionKey, ai, modelName);
            const response = await chat.sendMessage({
              message: sanitizedUtterance,
            });
            return response;
          },
          3000,
          0
        );

        return this.routeModelResponse(result, cleanUtterance, params.existingSlots);
      } catch (err: any) {
        const msg = String(err?.message || "");
        const isForbidden =
          msg.includes("403") ||
          msg.includes("PERMISSION_DENIED") ||
          msg.includes("denied access");
        const isQuota = msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota exceeded") || msg.includes("429");
        const is503HighDemand =
          msg.includes("503") ||
          msg.includes("high demand") ||
          msg.includes("Spikes in demand") ||
          msg.includes("UNAVAILABLE") ||
          msg.includes("Overloaded");

        if (isForbidden) {
          if (typeof (this.client as any)?.recordAccessDenied === "function") {
            (this.client as any).recordAccessDenied(msg);
          }
          console.info(`[ReasoningEngine] Gemini API access not permitted on current project (403). Operating with resilient Ghanaian deterministic reasoning.`);
          break;
        } else if (is503HighDemand) {
          const cooldownMs = 3 * 60 * 1000;
          this.client.recordModelQuotaExhausted(modelName, cooldownMs);
          console.info(`[ReasoningEngine] Model '${modelName}' temporarily at high demand (503). Cooled down for 3m.`);
        } else if (isQuota) {
          let cooldownMs = 15 * 60 * 1000;
          const retrySecMatch = msg.match(/retryDelay['":\s]+([0-9]+)/i);
          if (retrySecMatch && retrySecMatch[1]) {
            cooldownMs = Math.max(60 * 1000, parseInt(retrySecMatch[1], 10) * 1000);
          }
          this.client.recordModelQuotaExhausted(modelName, cooldownMs);
          console.info(`[ReasoningEngine] Model '${modelName}' quota reached. Cooldown until ${new Date(Date.now() + cooldownMs).toLocaleTimeString()}.`);
        } else {
          console.warn(`[ReasoningEngine] Model '${modelName}' notice:`, msg.slice(0, 100));
        }
        continue;
      }
    }

    // If Gemini calls failed, try OpenAI Reasoner
    if (openAiReasoner.isAvailable()) {
      try {
        return await openAiReasoner.reason({
          utterance: cleanUtterance,
          languageHint: params.languageHint,
          currentScreen: params.currentScreen,
          currentStep: params.currentStep,
          existingSlots: params.existingSlots,
          recentTurns: params.recentTurns,
          semanticMemoryContext: params.semanticMemoryContext,
          frequentContacts: params.frequentContacts,
        });
      } catch (err: any) {
        console.warn("[ReasoningEngine] OpenAI reasoner candidate attempt notice:", err?.message || err);
      }
    }

    return this.deterministicReasoning(params);
  }

  /**
   * Evaluates the Gemini response object:
   * 1. If functionCalls exists, extract arguments (slots are filled -> ready for confirmation).
   * 2. If no functionCalls, extract response.text (conversational question -> TTS playback).
   */
  private routeModelResponse(
    response: any,
    rawUtterance: string,
    existingSlots: EntitySlotMap = {}
  ): StructuredReasoningResponse {
    const functionCalls = response?.functionCalls;
    const detectedLang = languageDetector.detect(rawUtterance);

    // CASE 1: Model invoked a Function Call (all required parameters gathered)
    if (functionCalls && Array.isArray(functionCalls) && functionCalls.length > 0) {
      const call = functionCalls[0];
      const fnName = call.name;
      const args = call.args || {};

      if (fnName === "process_send_money") {
        const recipientPhone = String(args.recipient_number || "").replace(/[^0-9]/g, "");
        const amount = Number(args.amount) || 0;
        const reference = String(args.reference || "Transfer");

        const entities: EntitySlotMap = {
          ...existingSlots,
          amount,
          currency: "GHS",
          recipientPhone,
          reference,
        };

        const confirmationText = `You are about to send ${amount} Cedis to ${recipientPhone} for ${reference}. Please say confirm or press 1 to proceed, or say cancel or press 2 to stop.`;

        return {
          intent: "SEND_MONEY",
          confidence: 0.98,
          language: detectedLang,
          entities,
          conversationAct: "REQUEST",
          correction: null,
          referenceResolution: null,
          ambiguity: { isAmbiguous: false, candidates: [] },
          requestedAction: {
            type: "SEND_MONEY",
            tool: "process_send_money",
            arguments: { recipient_number: recipientPhone, amount, reference },
          },
          requiresConfirmation: true,
          safetyFlags: [],
          conversationalResponse: confirmationText,
          functionCall: {
            name: "process_send_money",
            args: { recipient_number: recipientPhone, amount, reference },
          },
        };
      }

      if (fnName === "process_cash_out") {
        const agentNumber = String(args.agent_number || "").replace(/[^0-9]/g, "");
        const amount = Number(args.amount) || 0;

        const entities: EntitySlotMap = {
          ...existingSlots,
          amount,
          currency: "GHS",
          agentNumber,
        };

        const confirmationText = `You are cashing out ${amount} Cedis from agent ${agentNumber}. Please say confirm or press 1 to proceed, or press 2 to stop.`;

        return {
          intent: "CASH_OUT",
          confidence: 0.98,
          language: detectedLang,
          entities,
          conversationAct: "REQUEST",
          correction: null,
          referenceResolution: null,
          ambiguity: { isAmbiguous: false, candidates: [] },
          requestedAction: {
            type: "CASH_OUT",
            tool: "process_cash_out",
            arguments: { agent_number: agentNumber, amount },
          },
          requiresConfirmation: true,
          safetyFlags: [],
          conversationalResponse: confirmationText,
          functionCall: {
            name: "process_cash_out",
            args: { agent_number: agentNumber, amount },
          },
        };
      }
    }

    // CASE 2: No Function Call -> Model needs more information; return conversational follow-up
    const rawText = typeof response?.text === "string" ? response.text : (response?.text ? String(response.text) : "");
    const conversationalText = rawText.trim() || "What would you like to do with Mobile Money today?";

    // Extract any partial numbers or intent present in the utterance
    const deterministicUnderstood = aiUnderstanding.understand(rawUtterance, "welcome", existingSlots);

    return {
      intent: deterministicUnderstood.intent !== "UNKNOWN" ? deterministicUnderstood.intent : "SEND_MONEY",
      confidence: 0.88,
      language: detectedLang,
      entities: { ...existingSlots, ...deterministicUnderstood.entities },
      conversationAct: "INFORM",
      correction: null,
      referenceResolution: null,
      ambiguity: { isAmbiguous: false, candidates: [] },
      requestedAction: {
        type: "CLARIFY",
        tool: null,
        arguments: deterministicUnderstood.entities,
      },
      requiresConfirmation: false,
      safetyFlags: [],
      conversationalResponse: conversationalText,
      functionCall: null,
    };
  }

  /**
   * Deterministic resilient reasoning fallback ensuring 100% safety and uptime without LLM.
   */
  public deterministicReasoning(params: {
    utterance: string;
    languageHint?: AiLanguage;
    currentScreen?: string;
    currentStep?: string;
    existingSlots?: EntitySlotMap;
  }): StructuredReasoningResponse {
    const understood = aiUnderstanding.understand(
      params.utterance,
      params.currentStep || "welcome",
      params.existingSlots || {}
    );

    const detectedLang = params.languageHint || languageDetector.detect(params.utterance);

    return {
      intent: understood.intent,
      confidence: understood.confidence,
      language: detectedLang,
      entities: understood.entities,
      conversationAct: understood.isConfirmation
        ? "CONFIRM"
        : understood.isDenial
        ? "DENY"
        : understood.isCorrection
        ? "CORRECT"
        : understood.isInterruption
        ? "INTERRUPT"
        : "INFORM",
      correction: understood.isCorrection && understood.correctionDetail
        ? {
            isCorrection: true,
            field: understood.correctionDetail.field,
            oldValue: understood.correctionDetail.oldValue,
            newValue: understood.correctionDetail.newValue,
            reason: understood.correctionDetail.reason,
          }
        : null,
      referenceResolution: null,
      ambiguity: {
        isAmbiguous: understood.isAmbiguous,
        candidates: understood.ambiguityCandidates || [],
      },
      requestedAction: {
        type: understood.intent,
        tool: null,
        arguments: understood.entities,
      },
      requiresConfirmation: understood.intent === "SEND_MONEY" || understood.intent === "CONFIRM",
      safetyFlags: [],
      conversationalResponse: undefined,
      functionCall: null,
    };
  }

  private isSimpleAffirmationOrDenial(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return /^(yes|yeah|yep|aane|ɛyɛ|eye|yoo|no|nope|dabi|cancel|gyae|stop|repeat|ka bio)$/i.test(lower);
  }
}

export const reasoningEngine = new ReasoningEngine();
