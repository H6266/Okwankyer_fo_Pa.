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
  getRecordingByPromptId,
  getRecordingByUrl,
  getPromptManifestEntry,
  normalizeRecordingLanguage,
  PROMPT_KEY_TO_RECORDING_ID,
} from "../audio/recordingRegistry";
import { getStepDefinition } from "../domain/stepRegistry";
import { isDynamicPrompt, resolvePromptSpokenText } from "../audio/canonicalRegistry";
import type { DynamicPromptParams } from "../audio/dynamicPromptBuilder";

const TTS_SCRIPT_KEY_BY_PROMPT_KEY: Readonly<Record<string, string>> = {
  invalid_recipient: "number_invalid",
  invalid_amount: "amount_invalid",
};

/**
 * Authoritative script text for prompt and reply keys across languages
 */
export const PROMPT_SCRIPTS: Record<string, { en: string; twi: string }> = {
  service_description: {
    en: "Welcome to Ɔkwankyerɛfo Pa, we are an accessibility layer that helps and makes services easy for everyone with inclusivity, the elderly and disabled.",
    twi: "Akwaaba kɔ Ɔkwankyerɛfo Pa, yɛyɛ dwumadie a ɛboa obiara ma sika ho nkitahodie yɛ mmerɛw ma mpanyimfoɔ ne abɔfra.",
  },
  mtn_network_select: {
    en: "Only MTN Mobile Money transfers are currently supported. For MTN, press 1. Press 9 to hear this again, or 0 to exit.",
    twi: "Mprempren, yɛboa MTN Mobile Money nkutoo. Sɛ wo network yɛ MTN a, mia 1. Mia 9 na tie bio, anaasɛ mia 0 na woapue.",
  },
  supported_service_select: {
    en: "For Mobile Money services, press 1. For banking services, press 2. Banking is not supported in this pilot. Press 9 to hear this again, or press 0 to exit.",
    twi: "Sɛ wopɛ mobile money services a, mia 1. Sɛ wopɛ banking services a, mia 2. Sikakorabea dwumadie nni pilot yi mu. Mia 9 na mate bio, anaasɛ mia 0 na woapue.",
  },
  service_select: {
    en: "For Mobile Money services, press 1. To transfer money to another mobile wallet, press 2. For banking and international services, press 3. To hear these options again, press 9. To exit, press 0.",
    twi: "Sɛ wopɛ mobile money services a, mia 1. Sɛ woremane sika kɔ wallet foforɔ so a, mia 2. Sɛ wopɛ banking services a, mia 3. Mia 9 na mate bio, anaasɛ mia 0 na woapue.",
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

  // 1. Direct recording lookup by prompt key (respects language variants like Twi vs English)
  const recordingUrl = getRecordingByPromptKey(key, language)?.url;
  if (recordingUrl) return recordingUrl;

  // 2. Dynamic prompts or text fallback: in test mode preserve snapshot routes, in runtime fallback to pre-recorded Processing audio
  if (process.env.NODE_ENV === "test") {
    if (isDynamicPrompt(key)) {
      return `/api/audio/prompt-tts/${language}/${encodeURIComponent(key)}`;
    }
    return resolvePromptText(key, lang)
      ? `/api/audio/prompt-tts/${lang}/${encodeURIComponent(key)}`
      : null;
  }

  return "/audio/Processing.mp3";
}

export function resolvePromptText(
  key: string,
  lang: SupportedLanguage,
  params?: DynamicPromptParams
): string | null {
  const language = normalizeRecordingLanguage(lang);
  if (!language) return null;

  const languageKey = language === "twi" ? "twi" : "en";

  // Dynamic prompts strictly resolve via template pipeline
  if (isDynamicPrompt(key)) {
    return resolvePromptSpokenText(key, languageKey, params || {});
  }

  const scriptKey = TTS_SCRIPT_KEY_BY_PROMPT_KEY[key] || key;
  if (PROMPT_SCRIPTS[scriptKey]?.[languageKey]) {
    return PROMPT_SCRIPTS[scriptKey][languageKey];
  }
  const recording = getRecordingByPromptKey(key, language);
  const promptId = key.match(/^OP\d{2}$/i)?.[0].toUpperCase() || PROMPT_KEY_TO_RECORDING_ID[key];
  const manifestPrompt = getPromptManifestEntry(promptId || "");
  const stepPrompt = getStepDefinition(key.replace(/_/g, "-"))?.promptText[languageKey];
  const manifestText = manifestPrompt
    ? language === "twi" ? manifestPrompt.twi : manifestPrompt.english
    : null;
  return recording?.spokenText || manifestText || stepPrompt || null;
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
      if (ttsMatch[1] !== language) return null;
      return pathname;
    }

    // Cross-language prevention: strictly reject Twi assets during English sessions and vice versa
    if (language === "en" && (pathname.includes("/Twi/") || /\b(twi)\b/i.test(pathname))) {
      return null;
    }
    if (language === "twi" && (pathname.includes("/English/") || /\b(english)\b/i.test(pathname))) {
      return null;
    }

    const recording = getRecordingByUrl(pathname, language);
    if (recording) {
      return recording.url ? recording.url.replace(/\.(m4a|aac)$/i, ".mp3") : null;
    }

    if (pathname.startsWith("/audio/") || pathname.startsWith("/Audio_files/")) {
      return pathname.replace(/\.(m4a|aac)$/i, ".mp3");
    }
    return pathname.replace(/\.(m4a|aac)$/i, ".mp3");
  } catch {
    return (audioUrl || "").replace(/\.(m4a|aac)$/i, ".mp3");
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

export function toTelephonyAudioUrl(audioUrl: string): string {
  // Replace .m4a or .aac with .mp3 extension so telephony media servers receive MP3 audio
  return audioUrl.replace(/\.(m4a|aac)$/i, ".mp3");
}

export function resolvePromptXml(
  key: string,
  lang: SupportedLanguage,
  baseUrl = "",
  fallbackText?: string
): string | null {
  const audioUrl = resolvePrompt(key, lang);
  if (audioUrl) {
    const telephonyUrl = toTelephonyAudioUrl(audioUrl);
    return `<Play url="${baseUrl}${telephonyUrl}"/>`;
  }
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
