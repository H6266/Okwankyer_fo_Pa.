/**
 * Ɔkwankyerɛfo Pa - Dialogue Manager
 * Orchestrates multi-turn dialogue progression, slots, and response planning.
 */

import {
  AiProcessInput,
  DialogueOutput,
  EntitySlotMap,
  IntentName,
  AiLanguage,
} from "../core/aiTypes";
import { sessionMemory, EphemeralSessionState } from "../memory/sessionMemory";
import { conversationMemory } from "../memory/conversationMemory";
import { responsePlanner } from "./responsePlanner";
import { slotManager } from "./slotManager";
import { clarificationEngine } from "./clarificationEngine";

export class DialogueManager {
  public manageTurn(
    sessionId: string,
    intent: IntentName,
    slots: EntitySlotMap,
    language: AiLanguage = "tw",
    confidence: number = 1.0,
    isCorrection: boolean = false
  ): { session: EphemeralSessionState; dialogue: DialogueOutput } {
    const session = sessionMemory.getOrCreate(sessionId, language);
    session.intent = intent;
    session.slots = { ...session.slots, ...slots };
    session.language = language;
    session.lastUpdated = Date.now();

    // Check if ambiguity / low confidence requires clarification
    if (confidence < 0.60 && intent !== "CANCEL" && intent !== "CONFIRM") {
      const clarifyText = clarificationEngine.generate(intent, language);
      const dialogue: DialogueOutput = {
        type: "ASK_SLOT",
        response: clarifyText,
        promptLanguage: language,
        needsClarification: true,
      };

      conversationMemory.addTurn(sessionId, {
        role: "assistant",
        text: clarifyText,
        language,
        intent,
      });

      return { session, dialogue };
    }

    // Plan standard voice response
    const dialogue = responsePlanner.plan(intent, session.slots, language, confidence, isCorrection);

    conversationMemory.addTurn(sessionId, {
      role: "assistant",
      text: dialogue.response,
      language,
      intent,
    });

    return { session, dialogue };
  }
}

export const dialogueManager = new DialogueManager();
