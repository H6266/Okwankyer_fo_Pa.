/**
 * Ɔkwankyerɛfo Pa - Clarification Engine
 * Generates natural clarification questions when requests are vague or confidence is low.
 */

import { AiLanguage, IntentName } from "../core/aiTypes";

export class ClarificationEngine {
  public generate(
    intent: IntentName,
    language: AiLanguage = "tw",
    options?: string[]
  ): string {
    const isTwi = language === "tw" || language === "ak" || language === "en-ak";

    if (options && options.length > 0) {
      return isTwi
        ? `Mepa wo kyɛw, wopɛ sɛ woyɛ: ${options.join(", ")}?`
        : `Did you mean you want to: ${options.join(", ")}?`;
    }

    if (intent === "UNKNOWN") {
      return isTwi
        ? "Yɛante wei ase yie. Mepa wo kyɛw, ka sika dwuma a wopɛ sɛ woyɛ no bio."
        : "I didn't quite catch that. Could you tell me what you'd like to do, like send money or check balance?";
    }

    return isTwi
      ? `Wopɛ sɛ womane sika anaa wocheck balance?`
      : `Would you like to send money or check your balance?`;
  }
}

export const clarificationEngine = new ClarificationEngine();
