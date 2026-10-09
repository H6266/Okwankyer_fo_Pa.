/**
 * Ɔkwankyerɛfo Pa - TTS Adapter Seam (ttsService.ts)
 * 
 * Central registry mapping prompt keys and languages to pre-recorded audio assets.
 * When the UG HCI Lab TTS API is integrated, speak() will synthesize dynamic speech,
 * replacing the stub without changing server routes.
 */

export type SupportedLanguage = "en" | "twi";

export interface PromptEntry {
  en?: string;
  twi?: string;
}

export const PROMPT_TABLE: Record<string, PromptEntry> = {
  welcome: {
    en: "/audio/Welcome_prompt_01.mp3",
    twi: "/audio/Welcome_prompt_01.mp3",
  },
  service_select: {
    en: "/audio/English/Audio_prompt_02.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_03.mp3",
  },
  provider_select: {
    en: "/audio/English/Audio_prompt_03.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_02.mp3",
  },
  provider_select_alt: {
    en: "/audio/English/Audio_prompt_04.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_02.mp3",
  },
  action_select: {
    en: "/audio/English/Audio_prompt_05.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_04.mp3",
  },
  enter_recipient: {
    en: "/audio/English/Audio_prompt_06.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_05.mp3",
  },
  recipient_sample_digits: {
    en: "/audio/English/Audio_prompt_07.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_05.mp3",
  },
  recipient_verify: {
    en: "/audio/English/Audio_prompt_08.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_06.mp3",
  },
  enter_amount: {
    en: "/audio/English/Audio_prompt_09.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_07.mp3",
  },
  safe_confirmation: {
    en: "/audio/English/Audio_prompt_10.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_08.mp3",
  },
  pin_handoff: {
    en: "/audio/English/Audio_prompt_11.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_09.mp3",
  },
  receipt: {
    en: "/audio/English/Audio_prompt_12.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_10.mp3",
  },
  wrong_figure: {
    en: "/audio/English/Audio_prompt_11.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_11.mp3",
  },
  exit: {
    en: "/audio/English/Audio_prompt_11.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_12.mp3",
  },
  cancelled: {
    en: "/audio/English/Audio_prompt_11.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_12.mp3",
  },
  // Agent conversational clarification keys
  sorry_did_not_catch: {
    en: "/audio/English/Audio_prompt_11.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_11.mp3",
  },
  let_me_repeat: {
    en: "/audio/English/Audio_prompt_02.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_03.mp3",
  },
  going_back: {
    en: "/audio/English/Audio_prompt_05.mp3",
    twi: "/audio/Twi/Audio_prompt_twi_04.mp3",
  },
};

/**
 * Resolves prompt key and language into the canonical audio URL.
 */
export function resolvePrompt(key: string, lang: SupportedLanguage = "en"): string | null {
  const entry = PROMPT_TABLE[key];
  if (!entry) return null;
  return entry[lang] || entry["en"] || null;
}

/**
 * Synthesizes dynamic speech text into an audio buffer.
 * Stub until the UG HCI Lab TTS API is connected.
 */
export async function speak(_text: string, _lang: SupportedLanguage = "en"): Promise<Buffer> {
  // TODO(ug-hci-tts): Replace stub with UG HCI Lab TTS API when credentials are provided
  throw new Error("UG HCI Lab TTS not connected");
}
