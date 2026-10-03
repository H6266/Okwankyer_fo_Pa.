/**
 * Ɔkwankyerɛfo Pa - AI System Root Facade
 * Connects root imports directly to the authoritative canonical architecture in src/ai_system/
 *
 * @deprecated Use imports from "@/src/ai_system" directly.
 */

export * from "../src/ai_system/index";

import { aiEngine } from "../src/ai_system/core/aiEngine";
import { reasoningEngine } from "../src/ai_system/understanding/reasoningEngine";
import { ttsService } from "../src/ai_system/speech/tts/ttsService";
import { unifiedMemory } from "../src/ai_system/memory/unifiedMemory";
import { speechToText } from "../src/modules/sttService";

export const aiSystem = {
  process: aiEngine.process.bind(aiEngine),

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

  transcribe: async (params: { audioBuffer: string | Buffer; mimeType?: string; expectedLanguage?: string }) => {
    const buf = typeof params.audioBuffer === "string"
      ? Buffer.from(params.audioBuffer.replace(/^data:audio\/[a-z0-9]+;base64,/, ""), "base64")
      : params.audioBuffer;
    return speechToText(buf, params.mimeType || "audio/webm");
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

    return {
      response: result.dialogue.response,
      action: result.action.type,
      slots: result.entities,
      status: result.state,
      safety: result.safety,
      result,
    };
  },

  getSession: async (sessionId: string) => {
    return unifiedMemory.getSession(sessionId);
  },

  clearSession: async (sessionId: string) => {
    unifiedMemory.clearSession(sessionId);
  },
};

export default aiSystem;
