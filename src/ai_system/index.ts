/**
 * Ɔkwankyerɛfo Pa - AI System Master Package Entry
 *
 * Unified architecture:
 * - core/        -> aiEngine, aiTypes, aiConfig, aiErrors
 * - perception/  -> inputProcessor, languageDetector, inputNormalizer, speechContext
 * - understanding/ -> intentEngine, entityEngine, correctionEngine, ambiguityEngine, confidenceEngine
 * - memory/      -> sessionMemory, conversationMemory, contextManager, userProfile
 * - dialogue/    -> dialogueManager, slotManager, clarificationEngine, responsePlanner
 * - navigation/  -> navigationGraph, navigationPlanner, routeResolver
 * - actions/     -> actionTypes, toolRegistry, actionValidator, actionPlanner
 * - safety/      -> transactionGuard, confirmationGuard, piiGuard, riskEngine
 * - speech/      -> speechNormalizer, pronunciation, tts, voiceProfiles
 * - providers/   -> aiProvider, modelAdapter
 */

// Core
export * from "./core/aiTypes";
export * from "./core/aiConfig";
export * from "./core/aiErrors";
export * from "./core/aiEngine";

// Perception
export * from "./perception/languageDetector";
export * from "./perception/inputNormalizer";
export * from "./perception/speechContext";
export * from "./perception/inputProcessor";

// Understanding
export * from "./understanding/intentEngine";
export * from "./understanding/entityEngine";
export * from "./understanding/correctionEngine";
export * from "./understanding/ambiguityEngine";
export * from "./understanding/confidenceEngine";

// Memory
export * from "./memory/sessionMemory";
export * from "./memory/conversationMemory";
export * from "./memory/contextManager";
export * from "./memory/userProfile";

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

// Providers
export * from "./providers/aiProvider";
export * from "./providers/modelAdapter";

import { aiEngine } from "./core/aiEngine";
export default aiEngine;
