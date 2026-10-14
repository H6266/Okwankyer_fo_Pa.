/**
 * Ɔkwankyerɛfo Pa - TTS Adapter Seam (ttsService.ts)
 * 
 * Central registry mapping prompt keys and languages to pre-recorded audio assets.
 * When the UG HCI Lab TTS API is integrated, speak() will synthesize dynamic speech,
 * replacing the stub without changing server routes.
 */

export type SupportedLanguage = "en" | "twi";

import {
  getRecordingByPromptKey,
  getRecordingByUrl,
  getPromptManifestEntry,
  normalizeRecordingLanguage,
  PROMPT_KEY_TO_RECORDING_ID,
} from "../audio/recordingRegistry";
import { getStepDefinition } from "../domain/stepRegistry";

const TTS_SCRIPT_KEY_BY_PROMPT_KEY: Readonly<Record<string, string>> = {
  invalid_recipient: "number_invalid",
  invalid_amount: "amount_invalid",
};

/**
 * Authoritative script text for prompt and reply keys across languages
 */
export const PROMPT_SCRIPTS: Record<string, { en: string; twi: string }> = {
  mtn_network_select: {
    en: "Only MTN Mobile Money transfers are currently supported. For MTN, press 1. Press 9 to hear this again, or 0 to exit.",
    twi: "Mprempren, yɛboa MTN Mobile Money nkutoo. Sɛ wo network yɛ MTN a, mia 1. Mia 9 na tie bio, anaasɛ mia 0 na woapue.",
  },
  supported_service_select: {
    en: "MTN Mobile Money transfers are currently supported. Press 1 for Mobile Money. Banking is not supported in this pilot; press 2 to hear available alternatives. Press 9 to repeat or 0 to exit.",
    twi: "Mprempren yɛboa MTN Mobile Money sika mane. Mia 1 ma Mobile Money. Banking nni pilot yi mu; mia 2 na wote dwumadie a yɛboa. Mia 9 na tie bio, anaa mia 0 na woapue.",
  },
  send_money_menu: {
    en: "To send money, press 1. To go back, press 8. To hear this again, press 9. To exit, press 0.",
    twi: "Sɛ wopɛ sɛ womane sika a, mia 1. Mia 8 na san kɔ akyi, mia 9 na tie bio, anaasɛ mia 0 na woapue.",
  },
  invalid_choice: {
    en: "Option is not a valid choice. Please choose from the available options.",
    twi: "Deɛ wobɔe no nyɛ pɛpɛɛpɛ. Yɛsrɛ wo paw deɛ ɛwɔ menyu no so.",
  },
  intent_understood_ask_number: {
    en: "Understood, you want to send money. Please enter the recipient's ten-digit phone number, followed by the hash key.",
    twi: "Mate aseɛ, wopɛ sɛ womane sika. Yɛsrɛ wo, bɔ obi a woremane no no fon nɔmba a ɛyɛ du na fa hash ka ho.",
  },
  intent_understood_ask_amount: {
    en: "Understood. Please enter the amount in Cedis followed by hash.",
    twi: "Mate aseɛ. Afei bɔ sika dodow no na fa hash ka ho.",
  },
  intent_understood_proceed: {
    en: "Understood. Proceeding to confirmation.",
    twi: "Mate aseɛ. Yɛrekɔ bammbɔ nkaebɔ no so.",
  },
  number_invalid: {
    en: "The phone number entered is invalid. Ghana mobile numbers must be ten digits with a recognized prefix. Please try again followed by hash.",
    twi: "Fon nɔmba no nyɛ pɛpɛɛpɛ. Ghana nɔmba yɛ du a ahyɛase firi MTN, Telecel, anaa AT. Yɛsrɛ wo san bɔ biom.",
  },
  network_unsupported: {
    en: "The network operator is not supported for this action. Please enter an MTN, Telecel, or AT number.",
    twi: "Network yi nnya nnye tumi wɔ ha. Yɛsrɛ wo fa MTN, Telecel, anaa AT nɔmba bɔ mu.",
  },
  service_unsupported: {
    en: "This service is currently not supported. This pilot supports Mobile Money transfers on MTN, Telecel, and AT.",
    twi: "Saa dwumadie yi nnya nkɔ so. Mprempren yi yɛboa Mobile Money sika mane wɔ MTN, Telecel ne AT so.",
  },
  amount_invalid: {
    en: "The amount entered is invalid. Please enter a valid amount in Cedis followed by hash.",
    twi: "Sika dodow a wobɔe no nyɛ pɛpɛɛpɛ. Yɛsrɛ wo bɔ sika dodow no wɔ Cedi mu na fa hash ka ho.",
  },
  balance_inquiry_unsupported: {
    en: "I cannot check wallet balances over this voice service. To check your balance, please dial star one seven zero hash directly on your phone keypad.",
    twi: "Mentumi nhwɛ wo wallet balance wɔ fon frɛ yi so. Sɛ wopɛ sɛ wohwɛ wo sika dodow a, bɔ star baako nson hwee hash wɔ wo fon so.",
  },
  unknown_input: {
    en: "I did not understand your input. Please listen carefully and select from the available options.",
    twi: "Mante deɛ wobɔe no ase. Yɛsrɛ wo tie nkyerɛkyerɛmu no yie na paw deɛ wopɛ.",
  },
  max_retries_exceeded: {
    en: "Too many unrecognized attempts. For your security, this call will now end. Goodbye.",
    twi: "Wobɔɔ mmɔden pii a yɛante ase. Ahobammbɔ nti, yɛtwa frɛ yi mu seesei. Nante yie.",
  },
};

export function resolvePrompt(key: string, lang: SupportedLanguage = "en"): string | null {
  const language = normalizeRecordingLanguage(lang);
  if (!language) return null;
  const recordingUrl = getRecordingByPromptKey(key, language)?.url;
  if (recordingUrl) return recordingUrl;
  return resolvePromptText(key, lang)
    ? `/api/audio/prompt-tts/${lang}/${encodeURIComponent(key)}`
    : null;
}

export function resolvePromptText(key: string, lang: SupportedLanguage): string | null {
  const language = normalizeRecordingLanguage(lang);
  if (!language) return null;
  const recording = getRecordingByPromptKey(key, language);
  const scriptKey = TTS_SCRIPT_KEY_BY_PROMPT_KEY[key] || key;
  const languageKey = language === "twi" ? "twi" : "en";
  const promptId = key.match(/^OP\d{2}$/i)?.[0].toUpperCase() || PROMPT_KEY_TO_RECORDING_ID[key];
  const manifestPrompt = getPromptManifestEntry(promptId || "");
  const stepPrompt = getStepDefinition(key.replace(/_/g, "-"))?.promptText[languageKey];
  const manifestText = manifestPrompt
    ? language === "twi" ? manifestPrompt.twi : manifestPrompt.english
    : null;
  return recording?.spokenText || manifestText || PROMPT_SCRIPTS[scriptKey]?.[languageKey] || stepPrompt || null;
}

export function resolveSimulatorPrompt(key: string, lang: SupportedLanguage): string | null {
  return resolvePrompt(key, lang);
}

export function resolveSimulatorAudioUrl(
  audioUrl: string | null | undefined,
  lang: SupportedLanguage
): string | null {
  if (!audioUrl) return null;
  const language = normalizeRecordingLanguage(lang);
  if (!language) return null;
  try {
    const pathname = new URL(audioUrl, "http://localhost").pathname;
    const ttsMatch = pathname.match(/^\/(?:api\/)?audio\/prompt-tts\/(en|twi)\//);
    if (ttsMatch) {
      return ttsMatch[1] === language ? pathname : null;
    }
    const recording = getRecordingByUrl(pathname);
    return recording?.language === language ? recording.url : null;
  } catch {
    return null;
  }
}

function escapeXmlText(text: string): string {
  return text.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      default: return "&quot;";
    }
  });
}

export function resolvePromptXml(
  key: string,
  lang: SupportedLanguage,
  baseUrl = "",
  fallbackText?: string
): string | null {
  const audioUrl = resolvePrompt(key, lang);
  if (audioUrl) return `<Play url="${baseUrl}${audioUrl}"/>`;
  const text = fallbackText || resolvePromptText(key, lang);
  return text ? `<Say voice="female">${escapeXmlText(text)}</Say>` : null;
}

/**
 * Resolves prompt key and language into the canonical audio URL.
 */
export async function speak(_text: string, _lang: SupportedLanguage = "en"): Promise<Buffer> {
  // TODO(ug-hci-tts): Replace stub with UG HCI Lab TTS API when credentials are provided
  throw new Error("UG HCI Lab TTS not connected");
}
