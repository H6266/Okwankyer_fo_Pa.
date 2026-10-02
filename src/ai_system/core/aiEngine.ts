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
import { ambiguityEngine } from "../understanding/ambiguityEngine";
import { confidenceEngine } from "../understanding/confidenceEngine";
import { contextManager } from "../memory/contextManager";
import { dialogueManager } from "../dialogue/dialogueManager";
import { navigationPlanner } from "../navigation/navigationPlanner";
import { actionPlanner } from "../actions/actionPlanner";
import { transactionGuard } from "../safety/transactionGuard";
import { speechNormalizer } from "../speech/speechNormalizer";

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

    // 3. Ambiguity Check
    const ambiguity = ambiguityEngine.check(activeUtterance);

    // 4. Intent & Entity Understanding (Model reasoning with deterministic fast-path)
    let intent: IntentName = "UNKNOWN";
    let confidence = 0.5;
    let entities: EntitySlotMap = { ...session.slots };
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
      }
    } else {
      // Model-based reasoning
      const modelResult = await geminiModelAdapter.reason({
        utterance: activeUtterance,
        languageHint: activeLanguage,
        currentScreen: input.currentScreen,
        currentStep: input.currentStep,
        existingSlots: session.slots,
      });

      intent = modelResult.intent;
      confidence = modelResult.confidence;
      entities = { ...entities, ...modelResult.entities };
      isCorrection = modelResult.isCorrection;
    }

    // 5. Confidence Policy Assessment
    const confidenceAssessment = confidenceEngine.assess(confidence);

    // 6. Navigation Planning
    const navigation = navigationPlanner.plan(
      intent,
      activeUtterance,
      input.currentStep || session.currentStep
    );

    // 7. Action Planning (Controlled tools only)
    const action = actionPlanner.plan(intent, entities, input.currentStep || session.currentStep);

    // 8. Safety & Zero-PIN Gate
    const safety = transactionGuard.evaluate(activeUtterance, action);

    // If a PIN is spoken, block action execution and guide caller to phone screen
    if (safety.pinDetectedInVoice) {
      action.type = "BLOCK_ZERO_PIN";
      action.requiresClientConfirmation = true;
    }

    // 9. Dialogue & Response Planning
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

    // 10. Speech Planning (Voice profile & pronunciation hints)
    const normalizedSpeech = speechNormalizer.normalizeForSpeech(dialogue.response, activeLanguage);
    const speech = {
      language: activeLanguage,
      voiceProfile: "ghanaian-warm" as const,
      spokenText: normalizedSpeech,
      speedMultiplier: 1.0,
      pitch: 0.0,
    };

    const endTime = performance.now();
    const totalLatencyMs = Math.round(endTime - startTime);

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
