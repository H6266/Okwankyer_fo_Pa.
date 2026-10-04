/**
 * Ɔkwankyerɛfo Pa - Targeted Clarification & Ambiguity Engine (clarificationEngine.ts)
 * 
 * Formulates exactly ONE concise, helpful clarification question when intent or slots
 * are ambiguous, instead of generic failure prompts ("I didn't understand").
 */

import { AiLanguage, EntitySlotMap, IntentName } from "../core/aiTypes";

export interface ClarificationPrompt {
  isAmbiguous: boolean;
  missingSlot?: string;
  spokenPromptEn: string;
  spokenPromptTw: string;
  prompt: string;
}

export class ClarificationEngine {
  public generate(intent: IntentName, language: AiLanguage = "tw"): string {
    return this.generateClarification(intent, {}, language).prompt;
  }

  /**
   * Generates a targeted, single-slot clarification prompt.
   */
  public generateClarification(
    intent: IntentName,
    slots: EntitySlotMap,
    language: AiLanguage = "tw"
  ): ClarificationPrompt {
    const isTwi = language === "tw" || language === "ak";

    switch (intent) {
      case "SEND_MONEY": {
        if (!slots.recipientPhone && !slots.recipientName) {
          return {
            isAmbiguous: true,
            missingSlot: "recipient",
            spokenPromptEn: "I understood that you want to send money, but I did not catch who you want to send it to. Who would you like to send it to?",
            spokenPromptTw: "Mete aseɛ sɛ wopɛ sɛ womane sika, nanso mante deɛ wopɛ sɛ womane no no yie. Hwan na wopɛ sɛ womane no sika no?",
            prompt: isTwi
              ? "Mete aseɛ sɛ wopɛ sɛ womane sika, nanso mante deɛ wopɛ sɛ womane no no yie. Hwan na wopɛ sɛ womane no sika no?"
              : "I understood that you want to send money, but I did not catch who you want to send it to. Who would you like to send it to?",
          };
        }

        if (!slots.amount) {
          const recDesc = slots.recipientName || (slots.recipientPhone ? `ending in ${String(slots.recipientPhone).slice(-4)}` : "the recipient");
          return {
            isAmbiguous: true,
            missingSlot: "amount",
            spokenPromptEn: `I understood that you want to send money to ${recDesc}, but how much would you like to send?`,
            spokenPromptTw: `Mete aseɛ sɛ wopɛ sɛ womane ${slots.recipientName || "nipa no"} sika, nanso cedis sɛn pɔtee na wopɛ sɛ womane?`,
            prompt: isTwi
              ? `Mete aseɛ sɛ wopɛ sɛ womane ${slots.recipientName || "nipa no"} sika, nanso cedis sɛn pɔtee na wopɛ sɛ womane?`
              : `I understood that you want to send money to ${recDesc}, but how much would you like to send?`,
          };
        }

        if (slots.recipientName && !slots.recipientPhone) {
          return {
            isAmbiguous: true,
            missingSlot: "recipientPhone",
            spokenPromptEn: `What is the mobile phone number for ${slots.recipientName}?`,
            spokenPromptTw: `Mepa wo kyɛw, ${slots.recipientName} fon nɔma ne sɛn?`,
            prompt: isTwi
              ? `Mepa wo kyɛw, ${slots.recipientName} fon nɔma ne sɛn?`
              : `What is the mobile phone number for ${slots.recipientName}?`,
          };
        }
        break;
      }

      case "BUY_AIRTIME": {
        if (!slots.amount) {
          return {
            isAmbiguous: true,
            missingSlot: "amount",
            spokenPromptEn: "How much airtime would you like to buy?",
            spokenPromptTw: "Mepa wo kyɛw, airtime cedis sɛn na wopɛ sɛ wobɔ?",
            prompt: isTwi ? "Mepa wo kyɛw, airtime cedis sɛn na wopɛ sɛ wobɔ?" : "How much airtime would you like to buy?",
          };
        }
        break;
      }

      case "PAY_BILL": {
        if (!slots.biller) {
          return {
            isAmbiguous: true,
            missingSlot: "biller",
            spokenPromptEn: "Which service bill would you like to pay? For example ECG or Ghana Water?",
            spokenPromptTw: "Mepa wo kyɛw, gyae anaa nsuo ka bɛn na wopɛ sɛ wotua? Sɛ ebia ECG anaa Ghana Water?",
            prompt: isTwi
              ? "Mepa wo kyɛw, gyae anaa nsuo ka bɛn na wopɛ sɛ wotua? Sɛ ebia ECG anaa Ghana Water?"
              : "Which service bill would you like to pay? For example ECG or Ghana Water?",
          };
        }
        break;
      }

      default:
        break;
    }

    return {
      isAmbiguous: false,
      spokenPromptEn: "How can I help you with your Mobile Money today?",
      spokenPromptTw: "Mɛtumi aboa wo dɛn wɔ wo MoMo dwumadie ho nnɛ?",
      prompt: isTwi ? "Mɛtumi aboa wo dɛn wɔ wo MoMo dwumadie ho nnɛ?" : "How can I help you with your Mobile Money today?",
    };
  }
}

export const clarificationEngine = new ClarificationEngine();
