import { asrOrchestrator } from "../speech/asr/asrOrchestrator";
import { ttsRouter } from "../speech/tts/ttsRouter";
import type { TtsSynthesisResponse } from "../speech/tts/ttsProvider";

export type SpeechSynthesisResult = TtsSynthesisResponse;

export const voiceSpeech = {
  synthesize(request: { text: string; language: "en" | "twi"; promptId?: string; templateKey?: string }) {
    return ttsRouter.synthesize({
      text: request.text,
      language: request.language === "twi" ? "tw" : "en",
      promptId: request.promptId || request.templateKey,
    });
  },

  async transcribeAudio(audio: Buffer | string, language: "en" | "twi", mimeType: string) {
    const result = await asrOrchestrator.transcribe(audio, mimeType, {
      languageHint: language,
      step: "voice-interaction",
    });
    return { text: result.text, provider: result.providerUsed };
  },
};
