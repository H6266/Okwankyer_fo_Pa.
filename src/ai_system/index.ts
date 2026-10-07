/**
 * Ɔkwankyerɛfo Pa - AI System Master Package Entry
 *
 * Deterministic Central Orchestration Architecture:
 * - core/        -> aiEngine, aiMemory, aiUnderstanding, aiNavigation, aiAction, aiSafety, aiDialogue, aiSpeech, aiBootstrap, aiTypes, aiConfig, aiErrors
 * - perception/  -> inputProcessor, languageDetector, inputNormalizer, speechContext
 * - understanding/ -> intentEngine, entityEngine, correctionEngine, ambiguityEngine, confidenceEngine, coreferenceResolver, negationEngine
 * - memory/      -> sessionMemoryBridge, workingMemory, sessionMemory, conversationMemory, contextManager, userProfile, taskMemory, episodicMemory, semanticMemory, preferenceMemory, pronunciationMemory, transactionMemory, memoryRetriever, memoryConsolidator, memoryPolicy, memoryManager
 * - dialogue/    -> dialogueManager, slotManager, clarificationEngine, responsePlanner
 * - navigation/  -> navigationGraph, navigationPlanner, routeResolver
 * - actions/     -> actionTypes, toolRegistry, actionValidator, actionPlanner
 * - safety/      -> transactionGuard, confirmationGuard, piiGuard, riskEngine
 * - speech/      -> speechNormalizer, pronunciation, voiceProfiles, tts, interruptionEngine
 * - providers/   -> aiProvider, modelAdapter, aiProviderAdapter
 * - observability/ -> diagnosticsEngine, aiTrace
 */

// Core Deterministic 10-System Engine
export * from "./core/aiTypes";
export * from "./core/aiConfig";
export * from "./core/aiErrors";
export * from "./core/aiMemory";
export * from "./core/aiUnderstanding";
export * from "./core/aiNavigation";
export * from "./core/aiAction";
export * from "./core/aiSafety";
export * from "./core/aiDialogue";
export * from "./core/aiSpeech";
export * from "./core/aiBootstrap";
export * from "./core/aiEngine";
export * from "./core/truthEngine";
export * from "./core/capabilityEngine";
export * from "./core/offlineAIEngine";
export * from "./providers/modelRouter";
export * from "./understanding/contextualReasoningEngine";
export * from "./dialogue/clarificationEngine";
export * from "./speech/tts/localGhanaianTts";
export * from "./speech/asr/offlineAsrEngine";
export * from "../integrations/momo/paymentSaga";

// Perception
export * from "./perception/languageDetector";
export * from "./perception/inputNormalizer";
export * from "./perception/speechContext";
export * from "./perception/inputProcessor";

// Understanding
export * from "./understanding/intentEngine";
export * from "./understanding/entityEngine";
export * from "./understanding/correctionEngine";
export * from "./understanding/coreferenceResolver";
export * from "./understanding/negationEngine";
export * from "./understanding/ambiguityEngine";
export * from "./understanding/confidenceEngine";

// Memory & Session Persistence Bridge
export * from "./memory/sessionMemoryBridge";
export * from "./memory/memoryPolicy";
export * from "./memory/workingMemory";
export * from "./memory/sessionMemory";
export * from "./memory/conversationMemory";
export * from "./memory/contextManager";
export * from "./memory/userProfile";
export * from "./memory/taskMemory";
export * from "./memory/episodicMemory";
export * from "./memory/semanticMemory";
export * from "./memory/preferenceMemory";
export * from "./memory/pronunciationMemory";
export * from "./memory/transactionMemory";
export * from "./memory/memoryRetriever";
export * from "./memory/memoryConsolidator";
export * from "./memory/memoryManager";

// Dialogue
export * from "./dialogue/slotManager";
export * from "./dialogue/clarificationEngine";
export * from "./dialogue/responsePlanner";
export * from "./dialogue/dialogueManager";

// Navigation
export * from "./navigation/navigationGraph";
export * from "./navigation/routeResolver";
export * from "./navigation/navigationPlanner";

// Actions
export * from "./actions/actionTypes";
export * from "./actions/toolRegistry";
export * from "./actions/actionValidator";
export * from "./actions/actionPlanner";

// Safety
export * from "./safety/transactionGuard";
export * from "./safety/confirmationGuard";
export * from "./safety/piiGuard";
export * from "./safety/riskEngine";

// Speech & Pronunciation
export * from "./speech/speechNormalizer";
export * from "./speech/pronunciation/nameDictionary";
export * from "./speech/pronunciation/placeDictionary";
export * from "./speech/pronunciation/pronunciationLexicon";
export * from "./speech/pronunciation/phonemeResolver";
export * from "./speech/pronunciation/pronunciationEngine";
export * from "./speech/voiceProfiles/ghanaProfile";
export * from "./speech/tts/ttsProvider";
export * from "./speech/tts/ttsAdapter";
export * from "./speech/tts/ttsService";
export {
  InterruptionEngine,
} from "./speech/interruptionEngine";

// Providers & Compatibility Adapter
export * from "./providers/aiProvider";
export * from "./providers/modelAdapter";
export * from "./providers/aiProviderAdapter";

// Observability
export * from "./observability/diagnosticsEngine";
export * from "./observability/aiTrace";

// Services, Audio & Security
export * from "./services/financialServices";
export * from "./perception/audioIngestor";
export * from "./security/fieldEncryption";
export * from "./voice/liveVoiceGateway";

import { aiEngine } from "./core/aiEngine";
import { reasoningEngine } from "./understanding/reasoningEngine";
import { ttsService } from "./speech/tts/ttsService";
import { audioIngestor } from "./perception/audioIngestor";
import { offlineAIEngine } from "./core/offlineAIEngine";

export const aiSystem = {
  process: async (input: any) => {
    if (!process.env.GEMINI_API_KEY || process.env.OFFLINE_MODE === "true") {
      return offlineAIEngine.process(input);
    }
    try {
      return await aiEngine.process(input);
    } catch (err) {
      console.warn("[aiSystem] aiEngine failed, falling back to autonomous offline engine:", err);
      return offlineAIEngine.process(input);
    }
  },

  analyzeUtterance: async (utterance: string, languageHint: any = "bilingual") => {
    const res = await reasoningEngine.reason({
      utterance,
      languageHint,
    });
    return {
      intent: res.intent,
      confidence: res.confidence,
      amount: res.entities.amount,
      recipientPhone: res.entities.recipientPhone,
      recipientName: res.entities.recipientName,
      network: res.entities.network,
      detectedLanguage: res.language,
      isAffirmation: res.conversationAct === "CONFIRM",
      isDenial: res.conversationAct === "DENY",
      requiresConfirmation: res.requiresConfirmation,
    };
  },

  transcribe: async (params: { audioBuffer: string | Buffer; mimeType?: string; expectedLanguage?: string; step?: string }) => {
    const res = await audioIngestor.transcribe(params.audioBuffer, params.mimeType, params.step);
    return {
      text: res.text,
      confidence: res.confidence,
      languageDetected: res.language,
      provider: "gemini-3.5-transcribe",
    };
  },

  synthesizeSpeech: async (text: string, language: any = "en", style?: string) => {
    const res = await ttsService.speak(text, language, style || "ghanaian-warm");
    return {
      audioBuffer: res.audioBuffer,
      audioBase64: res.audioBase64,
      audioMimeType: res.audioMimeType,
      providerUsed: res.providerUsed,
    };
  },

  handleTurn: async (sessionId: string, input: { text?: string; audioBuffer?: string; mimeType?: string }) => {
    const result = await aiEngine.process({
      sessionId,
      channel: "VOICE",
      input: input.text || "",
      audioBuffer: input.audioBuffer,
      mimeType: input.mimeType,
    });
    return result;
  },
};

export default aiEngine;
