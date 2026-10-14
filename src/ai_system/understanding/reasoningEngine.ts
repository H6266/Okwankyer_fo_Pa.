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

export const MOMO_SYSTEM_INSTRUCTION = `You are a voice-optimized accessibility assistant for MTN Mobile Money (MoMo) in Ghana ("Ɔkwankyerɛfo Pa" - The Good Guide). Your job is to converse naturally with callers in Ghanaian English or Akan Twi to help them execute Mobile Money transactions.

Available MoMo Services & Capabilities:
- Send Money / Transfer (momo.transfer) to any mobile network (MTN, Telecel, AT)
- Cash Out / Withdraw (momo.cash_out) at a registered agent
- Check Balance: unavailable through this assistant; direct callers to MTN's official handset channel
- Buy Airtime (momo.buy_airtime)
- Buy Internet Data (momo.buy_data)

Core Principles:
1. You Own the Conversation: Converse naturally, be warm, clear, and concise. Speak in 1-2 short conversational sentences suitable for a phone call.
2. Bilingual Fluency (English & Akan Twi):
   - If the caller speaks Akan Twi (or asks to speak Twi), reply naturally in Akan Twi.
   - If the caller speaks English, reply in English.
   - Understand local Ghanaian terms and numbering: "cedis", "sika", "hwee", "baako", "mmienu", "aduonum", "ɔha", "apem".
3. Distinguish Between Sending Money, Withdrawing Money, and Checking Balance:
   - When a caller asks about their balance, how much they have, or asks to check their account ("how much is in my account", "check balance", "hwɛ me balance ma me", "sika a aka", "what is my balance"), recognize this as a BALANCE INQUIRY (momo.check_balance). Balance checks through this assistant are currently unavailable; tell the caller to dial *170# on their handset. Never ask for or accept a PIN, never invoke a balance tool, and never ask for a transfer amount or recipient number for a balance inquiry.
   - When a caller says they want to "withdraw money", "cash out", "allow cash out", or in Twi "meyi sika", this is a WITHDRAWAL (momo.cash_out), NOT a transfer!
   - In Ghana, cashing out at an agent works by enabling 'Allow Cash-Out' on the caller's wallet.
   - For a withdrawal or cash-out, the caller DOES NOT need to provide a recipient phone number! NEVER ask them "Who are you sending the money to?" when they said they want to withdraw or cash out.
   - When the caller asks to withdraw money or cash out, invoke the 'allow_cash_out' or 'process_cash_out' tool with the amount mentioned.
4. Conversational Context & Mental Math:
   - Perform mental math seamlessly: e.g. "the bill is 100cedis but i have 90 send so send half of my money to him" means the caller wants to send half of 90 = 45 cedis!
   - "a tenth of 100 cedis" is 10 cedis; "half of 50" is 25 cedis; "20 plus 30" is 50 cedis.
   - Retain details across multiple turns. If the caller gave the amount in turn 1 and gives the phone number in turn 2, remember both!
   - Handle revisions and corrections gracefully: e.g. "Actually send 20 instead of 50" updates the amount without losing the recipient.
5. Messy Speech & Voice Robustness: Ignore background noise, voice-to-text filler words ("uh", "um", "ah"). Focus on the caller's true intent.
6. Recipient Verification & Discrepancy Awareness:
   - When the system validates a recipient against the telco registry and returns the registered name and network, explain the details to the caller.
   - If there is any discrepancy between what the caller said (e.g. caller said "ECG man" or "Telecel") and what the telco registry returned (e.g. "Kwame Mensah" on "MTN"), clarify this discrepancy clearly with the caller and ask for their confirmation before proceeding.
7. The Clean Handoff:
   - When both the recipient phone number and transaction amount (in GHS) are clearly gathered for sending money, invoke 'process_send_money'.
   - When the caller wants to withdraw or cash out, invoke 'allow_cash_out' or 'process_cash_out'.
   - When the caller asks to check their balance or account funds, explain that balance checking through this assistant is currently unavailable and direct them to *170# on their handset.
   - If any required parameter is still missing or ambiguous, reply with a short conversational sentence asking for the missing piece.`;

export const SEND_MONEY_TOOL: FunctionDeclaration = {
  name: "process_send_money",
  description: "Hand over the gathered Mobile Money transfer details once the recipient number and amount are known.",
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
        description: "A brief note or reference for the transfer (e.g. school fees, food, transport, or default 'Transfer').",
      },
      recipient_name: {
        type: Type.STRING,
        description: "Optional recipient name if provided by user (e.g. Kwame, Mother, Ama, ECG man).",
      },
      network: {
        type: Type.STRING,
        description: "Optional Ghanaian telecom network (MTN, Telecel, AT).",
      },
    },
    required: ["recipient_number", "amount"],
  },
};

export const ALLOW_CASH_OUT_TOOL: FunctionDeclaration = {
  name: "allow_cash_out",
  description: "Initiates Allow Cash-Out / Withdrawal on the caller's wallet when they request to withdraw money or enable cash out.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      amount: {
        type: Type.NUMBER,
        description: "The amount in Ghana Cedis (GHS) the caller wishes to withdraw, if mentioned.",
      },
    },
  },
};

export const CASH_OUT_TOOL: FunctionDeclaration = {
  name: "process_cash_out",
  description: "Process a Mobile Money Cash Out / Withdrawal at an agent.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      amount: {
        type: Type.NUMBER,
        description: "The amount in Ghana Cedis (GHS) to cash out or withdraw.",
      },
      agent_number: {
        type: Type.STRING,
        description: "Optional 6-digit agent code or phone number if mentioned.",
      },
    },
  },
};

export const CHECK_BALANCE_TOOL: FunctionDeclaration = {
  name: "check_balance",
  description: "Deprecated. Personal balance inquiries are unavailable through this assistant. Do not call this tool.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
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
    const cacheKey = `${sessionId}_${modelName}`;
    const existing = this.activeChatSessions.get(cacheKey);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.chat;
    }

    const chat = ai.chats.create({
      model: modelName,
      config: {
        systemInstruction: MOMO_SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: [SEND_MONEY_TOOL, CASH_OUT_TOOL, ALLOW_CASH_OUT_TOOL] }],
        temperature: 0.2,
      },
    });

    this.activeChatSessions.set(cacheKey, {
      chat,
      lastUsedAt: Date.now(),
    });

    return chat;
  }

  public resetChatSession(sessionId: string): void {
    for (const key of this.activeChatSessions.keys()) {
      if (key.startsWith(sessionId)) {
        this.activeChatSessions.delete(key);
      }
    }
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
      "gemini-3.8-flash",
      "gemini-3.1-flash-lite",
    ].filter((m, idx, arr) => m && arr.indexOf(m) === idx);

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
          4000,
          0,
          undefined,
          3000,
          modelName
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

      if (fnName === "allow_cash_out") {
        const amount = typeof args.amount === "number" ? args.amount : parseFloat(args.amount) || undefined;
        const entities: EntitySlotMap = {
          ...existingSlots,
          ...(amount !== undefined ? { amount } : {}),
          currency: "GHS",
        };
        const isTwi = detectedLang.startsWith("tw") || detectedLang.startsWith("ak");
        const respText = isTwi
          ? "Yɛabue Allow Cash-Out ama wo mfifii 15 mu wɔ wo wallet so. Yɛrentumi nhwɛ wo balance wɔ assistant yi so; fa wo fon bɔ star, baako, nson, hwee, hash."
          : "Cash-Out has been enabled on your wallet for the next 15 minutes. Balance checking through this assistant is unavailable; dial star, one, seven, zero, hash on your handset.";

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
            tool: "allow_cash_out",
            arguments: { amount },
          },
          requiresConfirmation: false,
          safetyFlags: [],
          conversationalResponse: respText,
          functionCall: {
            name: "allow_cash_out",
            args: { amount },
          },
        };
      }

      if (fnName === "check_balance") {
        const isTwi = detectedLang.startsWith("tw") || detectedLang.startsWith("ak");
        const unavailableMessage = isTwi
          ? "Seesei, yɛrentumi nhwɛ wo balance wɔ assistant yi so. Fa wo fon bɔ star, baako, nson, hwee, hash na hwɛ wo balance."
          : "Balance checking through this assistant is currently unavailable. Please dial star, one, seven, zero, hash on your handset.";

        return {
          intent: "CHECK_BALANCE",
          confidence: 0.99,
          language: detectedLang,
          entities: existingSlots,
          conversationAct: "REQUEST",
          correction: null,
          referenceResolution: null,
          ambiguity: { isAmbiguous: false, candidates: [] },
          requestedAction: {
            type: "REJECT",
            tool: null,
            arguments: { reason: "BALANCE_CHECK_UNAVAILABLE", prompt: unavailableMessage },
          },
          requiresConfirmation: false,
          safetyFlags: [],
          conversationalResponse: unavailableMessage,
          functionCall: null,
        };
      }
    }

    let rawText = "";
    if (typeof response?.text === "function") {
      try { rawText = response.text() || ""; } catch {}
    } else if (typeof response?.text === "string") {
      rawText = response.text;
    } else if (Array.isArray(response?.candidates?.[0]?.content?.parts)) {
      for (const part of response.candidates[0].content.parts) {
        if (typeof part.text === "string") {
          rawText += part.text;
        }
      }
    }
    const isTwi = detectedLang.startsWith("tw") || detectedLang.startsWith("ak");
    const conversationalText = rawText.trim() || (isTwi ? "Dɛn na wopɛ sɛ woyɛ wɔ Mobile Money so nnɛ?" : "What would you like to do with Mobile Money today?");
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
      conversationalResponse: (() => {
        const isTwi = detectedLang.startsWith("tw") || detectedLang.startsWith("ak");
        if (understood.intent === "SEND_MONEY") {
          const amt = understood.entities?.amount;
          const rec = understood.entities?.recipientPhone;
          if (amt && rec) {
            return isTwi
              ? `Worebɛmane ${amt} cedis akɔma ${rec}. Sɛ wopene so a ka confirm anaa mia 1, sɛ wogyae a ka cancel anaa mia 2.`
              : `You are about to send ${amt} Cedis to ${rec}. Please say confirm or press 1 to proceed, or say cancel or press 2 to stop.`;
          } else if (amt && !rec) {
            return isTwi
              ? "Yɛsrɛ wo bɔ obi a woremane no no fon nɔmba a ɛyɛ du."
              : "Please enter or say the 10-digit mobile phone number of the recipient.";
          } else if (!amt && rec) {
            return isTwi
              ? "Ghana cedis dodoɔ sɛn na wopɛ sɛ womane?"
              : "How many Ghana cedis do you want to send?";
          }
        } else if (understood.intent === "CASH_OUT") {
          return isTwi
            ? "Yɛabue Allow Cash-Out ama wo mfifii 15 mu wɔ wo wallet so."
            : "Cash-Out has been enabled on your wallet for the next 15 minutes. Dial *170# on your handset to complete your withdrawal at an agent.";
        } else if (understood.intent === "CHECK_BALANCE") {
          return isTwi
            ? "Seesei, yɛrentumi nhwɛ wo balance wɔ assistant yi so. Fa wo fon bɔ star, baako, nson, hwee, hash na hwɛ wo balance."
            : "Balance checking through this assistant is currently unavailable. Please dial star, one, seven, zero, hash on your handset.";
        }
        return isTwi
          ? "Akwaaba kɔ Ɔkwankyerɛfo Pa so. Dɛn na wopɛ sɛ woyɛ wɔ Mobile Money so nnɛ?"
          : "Welcome to Ɔkwankyerɛfo Pa. What would you like to do with Mobile Money today?";
      })(),
      functionCall: null,
    };
  }

  private isSimpleAffirmationOrDenial(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return /^(yes|yeah|yep|aane|ɛyɛ|eye|yoo|no|nope|dabi|cancel|gyae|stop|repeat|ka bio)$/i.test(lower);
  }
}

export const reasoningEngine = new ReasoningEngine();
