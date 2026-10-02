/**
 * Ɔkwankyerɛfo Pa - Central AI Interaction & Navigation Engine
 * Single, unified entry point: aiEngine.process(input)
 *
 * Implements strict separation:
 * - AI REASONING -> understands and plans
 * - DIALOGUE ENGINE -> manages conversation & slots
 * - NAVIGATION ENGINE -> determines where user should go
 * - ACTION SYSTEM -> creates controlled, validated action requests
 * - SAFETY ENGINE -> verifies Zero-PIN & risk boundaries
 * - SPEECH ENGINE -> determines how the response sounds
 * - COGNITIVE MEMORY -> working, episodic, semantic, preference, task memory
 */

import {
  AiProcessInput,
  AiProcessResult,
  IntentName,
  EntitySlotMap,
} from "./aiTypes";
import { inputProcessor } from "../perception/inputProcessor";
import { geminiModelAdapter } from "../providers/modelAdapter";
import { intentEngine } from "../understanding/intentEngine";
import { entityEngine } from "../understanding/entityEngine";
import { correctionEngine } from "../understanding/correctionEngine";
import { coreferenceResolver } from "../understanding/coreferenceResolver";
import { negationEngine } from "../understanding/negationEngine";
import { ambiguityEngine } from "../understanding/ambiguityEngine";
import { confidenceEngine } from "../understanding/confidenceEngine";
import { contextManager } from "../memory/contextManager";
import { workingMemory } from "../memory/workingMemory";
import { memoryRetriever } from "../memory/memoryRetriever";
import { taskMemory } from "../memory/taskMemory";
import { episodicMemory } from "../memory/episodicMemory";
import { dialogueManager } from "../dialogue/dialogueManager";
import { navigationPlanner } from "../navigation/navigationPlanner";
import { actionPlanner } from "../actions/actionPlanner";
import { transactionGuard } from "../safety/transactionGuard";
import { speechNormalizer } from "../speech/speechNormalizer";
import { pronunciationEngine } from "../speech/pronunciation/pronunciationEngine";
import { aiTrace } from "../observability/aiTrace";

export class AiEngine {
  /**
   * Central entry point for all conversational and IVR interactions.
   */
  public async process(input: AiProcessInput): Promise<AiProcessResult> {
    const startTime = performance.now();

    // 1. Context & Session Hydration
    const session = contextManager.hydrateContext(input);

    // 2. Perception: Audio transcription, DTMF normalization, language detection
    const perception = await inputProcessor.process(input);
    const activeUtterance = perception.normalizedText || perception.rawText;
    const activeLanguage = perception.detectedLanguage !== "unknown"
      ? perception.detectedLanguage
      : (input.language || session.language || "tw");

    // 3. Cognitive Memory Retrieval
    const retrieved = memoryRetriever.retrieve(input.sessionId, input.userProfile?.userId, activeUtterance);
    let entities: EntitySlotMap = { ...session.slots, ...retrieved.activeSlots };

    // 4. Negation & Pause Assessment
    const negation = negationEngine.assess(activeUtterance);

    // 5. Coreference Resolution (resolving "him", "her", "same person", "same amount")
    const coref = coreferenceResolver.resolve(activeUtterance, entities);
    if (coref.hasReference) {
      entities = { ...entities, ...coref.resolvedSlots };
    }

    // 6. Ambiguity Check
    const ambiguity = ambiguityEngine.check(activeUtterance);

    // 7. Intent & Entity Understanding (Model reasoning with deterministic fast-path)
    let intent: IntentName = "UNKNOWN";
    let confidence = 0.5;
    let isCorrection = false;

    // Fast path: DTMF / direct keywords
    const fastMatch = intentEngine.classify(activeUtterance, input.currentStep);
    if (fastMatch.confidence >= 0.90) {
      intent = fastMatch.intent;
      confidence = fastMatch.confidence;

      // Extract entities
      const extracted = entityEngine.extract(activeUtterance);
      entities = { ...entities, ...extracted };

      // Check if mid-flow correction
      const correction = correctionEngine.applyCorrection(activeUtterance, entities);
      if (correction.isCorrection) {
        isCorrection = true;
        entities = correction.updatedSlots;
        intent = "CHANGE_INFORMATION";
        episodicMemory.record(input.sessionId, "AMOUNT_CORRECTED", `Updated ${correction.fieldModified}`, input.currentStep || "flow");
      }
    } else {
      // Model-based reasoning
      const modelResult = await geminiModelAdapter.reason({
        utterance: activeUtterance,
        languageHint: activeLanguage,
        currentScreen: input.currentScreen,
        currentStep: input.currentStep,
        existingSlots: entities,
      });

      intent = modelResult.intent;
      confidence = modelResult.confidence;
      entities = { ...entities, ...modelResult.entities };
      isCorrection = modelResult.isCorrection;
    }

    // 8. Task Memory & Interruptions (e.g. user in Send Money asks to Check Balance)
    if (intent === "CHECK_BALANCE" && (session.slots.amount || session.slots.recipientPhone)) {
      taskMemory.interruptWithTask(input.sessionId, "CHECK_BALANCE");
    } else if (intent === "SEND_MONEY") {
      taskMemory.setPrimaryTask(input.sessionId, "SEND_MONEY", entities, input.currentStep || "welcome");
    }

    // 9. Update Working Memory
    workingMemory.update(input.sessionId, {
      currentUtterance: activeUtterance,
      currentIntent: intent,
      currentStep: input.currentStep || session.currentStep,
      currentScreen: input.currentScreen || session.currentScreen,
      knownSlots: entities,
      currentLanguage: activeLanguage,
      currentConfidence: confidence,
    });

    // 10. Navigation Planning
    const navigation = navigationPlanner.plan(
      intent,
      activeUtterance,
      input.currentStep || session.currentStep
    );

    // 11. Action Planning (Controlled tools only)
    const action = actionPlanner.plan(intent, entities, input.currentStep || session.currentStep);

    // 12. Safety & Zero-PIN Gate
    const safety = transactionGuard.evaluate(activeUtterance, action);

    // If a PIN is spoken, block action execution and guide caller to phone screen
    if (safety.pinDetectedInVoice) {
      action.type = "BLOCK_ZERO_PIN";
      action.requiresClientConfirmation = true;
      episodicMemory.record(input.sessionId, "ZERO_PIN_BLOCKED", "Spoken PIN blocked", input.currentStep || "auth");
    }

    // 13. Dialogue & Response Planning
    const { dialogue } = dialogueManager.manageTurn(
      input.sessionId,
      intent,
      entities,
      activeLanguage,
      confidence,
      isCorrection
    );

    // If Zero-PIN alert triggered, override spoken dialogue to remind caller safely
    if (safety.pinDetectedInVoice) {
      dialogue.response = activeLanguage === "tw"
        ? "Yɛmfa wo MoMo PIN wɔ fon ano. Mepa wo kyɛw, hwɛ wo fon screen na bɔ wo PIN wɔ hɔ pɛpɛɛpɛ."
        : "Never speak your MoMo PIN on a call. Please check your phone screen to enter your PIN securely.";
    }

    // Check if task continuity resumption prompt is appropriate
    const activeTask = taskMemory.getActiveTask(input.sessionId);
    if (intent === "CHECK_BALANCE" && activeTask?.resumptionPrompt) {
      const prompt = activeLanguage === "tw" ? activeTask.resumptionPrompt.twi : activeTask.resumptionPrompt.en;
      dialogue.response = `${dialogue.response} ${prompt}`;
    }

    // 14. Speech Planning (Voice profile & pronunciation hints)
    const normalizedSpeech = speechNormalizer.normalizeForSpeech(dialogue.response, activeLanguage);
    const { hints } = pronunciationEngine.prepareTextForTts(normalizedSpeech, input.userProfile?.userId);

    const speech = {
      language: activeLanguage,
      voiceProfile: "ghanaian-warm" as const,
      spokenText: normalizedSpeech,
      phoneticHints: hints,
      speedMultiplier: 1.0,
      pitch: 0.0,
    };

    const endTime = performance.now();
    const totalLatencyMs = Math.round(endTime - startTime);

    // 15. Record Structured Telemetry Trace
    aiTrace.log({
      traceId: `tr_${Date.now()}`,
      sessionId: input.sessionId,
      timestamp: Date.now(),
      input: activeUtterance,
      normalizedInput: activeUtterance,
      detectedLanguage: activeLanguage,
      intent,
      confidence,
      slots: entities,
      navigationDecision: navigation.action,
      actionRequested: action.tool,
      riskLevel: action.riskLevel,
      safetyFlag: safety.pinDetectedInVoice,
      response: dialogue.response,
      speechVoiceProfile: speech.voiceProfile,
      latencies: {
        totalMs: totalLatencyMs,
      },
    });

    return {
      sessionId: input.sessionId,
      intent,
      confidence,
      language: activeLanguage,
      entities,
      dialogue,
      navigation,
      action,
      safety,
      speech,
      performance: {
        totalLatencyMs,
      },
    };
  }
}

export const aiEngine = new AiEngine();
