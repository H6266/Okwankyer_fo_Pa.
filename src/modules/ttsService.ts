/**
 * Ɔkwankyerɛfo Pa - TTS Adapter Seam (ttsService.ts)
 * 
 * Central registry mapping fixed prompts to approved recordings and dynamic text to real TTS.
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
import { getCanonicalPrompt, isDynamicPrompt, resolvePromptSpokenText } from "../audio/canonicalRegistry";
import type { DynamicPromptParams } from "../audio/dynamicPromptBuilder";
import { audioFlowStore } from "../audio/audioFlowStore";

const TTS_SCRIPT_KEY_BY_PROMPT_KEY: Readonly<Record<string, string>> = {
  invalid_recipient: "number_invalid",
  invalid_amount: "amount_invalid",
  opening_voice_welcome_to_okwankyerefopa: "welcome",
  language_selection: "language_selection",
  service_selection: "supported_service_select",
  service_select: "supported_service_select",
  network_selection: "mtn_network_select",
  mtn_menu: "send_money_menu",
};

/**
 * Authoritative script text for prompt and reply keys across languages
 */
export const PROMPT_SCRIPTS: Record<string, { en: string; twi: string }> = {
  welcome: {
    en: "Welcome to Ɔkwankyerɛfo Pa. For English, press 1. For Twi, press 2.",
    twi: "Akwaaba kɔ Ɔkwankyerɛfo Pa. Sɛ wopɛ Borɔfo a, mia 1. Sɛ wopɛ Twi a, mia 2.",
  },
  service_description: {
    en: "Welcome to Ɔkwankyerɛfo Pa, we are an accessibility layer that helps and makes services easy for everyone with inclusivity, the elderly and disabled.",
    twi: "Akwaaba kɔ Ɔkwankyerɛfo Pa, yɛyɛ dwumadie a ɛboa obiara ma sika ho nkitahodie yɛ mmerɛw ma mpanyimfoɔ ne abɔfra.",
  },
  mtn_network_select: {
    en: "For MTN Mobile Money, press 1. For Telecel Cash, press 2. Press 9 to repeat, or 0 to exit.",
    twi: "Sɛ wo network yɛ MTN a, mia 1. Sɛ ɛyɛ Telecel Cash a, mia 2. Mia 9 na tie bio, anaasɛ mia 0 na woapue.",
  },
  supported_service_select: {
    en: "For a supported Mobile Money transfer, press 1. Press 9 to repeat, or 0 to exit.",
    twi: "Sɛ wopɛ Mobile Money transfer a yɛboa a, mia 1. Mia 9 na tie bio, anaasɛ mia 0 na woapue.",
  },
  service_select: {
    en: "For a supported Mobile Money transfer, press 1. Press 9 to repeat, or 0 to exit.",
    twi: "Sɛ wopɛ Mobile Money transfer a yɛboa a, mia 1. Mia 9 na tie bio, anaasɛ mia 0 na woapue.",
  },
  send_money_menu: {
    en: "To send money, press 1. To go back, press 8. To hear this again, press 9. To exit, press 0.",
    twi: "Sɛ wopɛ sɛ womane sika a, mia 1. Mia 8 na san kɔ akyi, mia 9 na tie bio, anaasɛ mia 0 na woapue.",
  },
  send_money_selected: {
    en: "You selected send money.",
    twi: "Woapaw sɛ womane sika.",
  },
  recipient_verify: {
    en: "We found the recipient. Listen carefully to the name and full phone number.",
    twi: "Yɛahu recipient no. Tie ne din ne fon nɔmba no yie.",
  },
  recipient_confirm_speech: {
    en: "If these details are correct, press 1. To change the recipient, press 2. To cancel, press 0.",
    twi: "Sɛ nsɛm no yɛ nokware a, mia 1. Sɛ wopɛ sɛ wosesa recipient no a, mia 2. Sɛ wogyae a, mia 0.",
  },
  amount_prompt: {
    en: "How much would you like to send?",
    twi: "Sika dodow sɛn na wopɛ sɛ womane?",
  },
  enter_amount: {
    en: "Please enter the amount in Ghana Cedis. Use star for pesewas, then press hash.",
    twi: "Yɛsrɛ wo, bɔ sika dodow no wɔ Ghana Cedi mu. Fa nsoroma bɔ pesewas, na wie a mia hash.",
  },
  amount_too_high: {
    en: "That amount is above the permitted limit. Please enter a lower amount.",
    twi: "Sika dodow no dɔɔso sen limit a wɔahyɛ. Yɛsrɛ wo bɔ sika dodow a ɛsua.",
  },
  amount_too_low: {
    en: "That amount is below the minimum. Please enter a higher amount.",
    twi: "Sika dodow no sua sen nea ɛsɛ. Yɛsrɛ wo bɔ sika dodow a ɛsõ kakra.",
  },
  recipient_found: {
    en: "We found a recipient record. Listen carefully to the details.",
    twi: "Yɛahu recipient record. Yɛsrɛ wo tie nsɛm no yie.",
  },
  please_respond: {
    en: "Please respond or press a key on your phone keypad.",
    twi: "Yɛsrɛ wo, bua anaa mia nɔmba bi wɔ wo keypad so.",
  },
  waiting_confirmation: {
    en: "Your transfer is waiting for provider confirmation. Do not start another transfer yet.",
    twi: "Wo transfer no da so retwɛn provider no mmuae. Mfa transfer foforɔ mmɔ mmɔden seesei.",
  },
  check_phone: {
    en: "Please check your handset for the provider authorization request.",
    twi: "Yɛsrɛ wo hwɛ wo handset no so na pene provider request no so.",
  },
  security_warning: {
    en: "Never share or say your Mobile Money PIN on this call. Enter it only on the official secure provider handset prompt.",
    twi: "Mfa wo Mobile Money PIN nka anaa nkyerɛ obi wɔ fon frɛ yi mu. Bɔ wo PIN wɔ provider no official secure handset prompt no so nko ara.",
  },
  check_final_status: {
    en: "We are checking the final status with your provider. No success is confirmed yet.",
    twi: "Yɛrehwɛ provider no final status. Yɛnnye nkonimdie ntoo mu seesei.",
  },
  unsupported_service: {
    en: "That service is not supported. This pilot supports Mobile Money transfers.",
    twi: "Saa service no nni dwumadie a yɛboa mu. Mprempren yɛboa Mobile Money transfer.",
  },
  transaction_success: {
    en: "Your provider has confirmed that the transfer is complete.",
    twi: "Provider no asi transfer no so dua sɛ awie.",
  },
  transaction_failed: {
    en: "Your provider reported that the transfer failed. It has not completed.",
    twi: "Provider no aka sɛ transfer no antumi ankɔ. Ɛnwieeɛ.",
  },
  anything_else: {
    en: "Would you like another supported transfer? Press 1 for another, or 0 to finish.",
    twi: "Wopɛ transfer foforɔ a yɛboa a? Mia 1. Sɛ wowie a, mia 0.",
  },
  goodbye: {
    en: "Thank you for using Ɔkwankyerɛfo Pa. Goodbye.",
    twi: "Meda wo ase sɛ wode Ɔkwankyerɛfo Pa dii dwuma. Nante yie.",
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

  // 1. Check custom audio assignment from Audio Flow Studio first
  const customOverride = audioFlowStore.resolvePromptOverride(key, language);
  if (customOverride) return customOverride;

  const recording = getRecordingByPromptKey(key, language);
  if (recording?.audioVerified && recording.url) return recording.url;

  const canonicalId = PROMPT_KEY_TO_RECORDING_ID[key.toLowerCase()]
    || (/^OP\d{2}(?:B)?$/i.test(key) ? key.toUpperCase() : key);
  if (!isDynamicPrompt(canonicalId)) return null;
  return resolvePromptText(canonicalId, lang)
    ? `/api/audio/prompt-tts/${lang}/${encodeURIComponent(canonicalId)}`
    : null;
}

export function resolvePromptText(
  key: string,
  lang: SupportedLanguage,
  params?: DynamicPromptParams
): string | null {
  const language = normalizeRecordingLanguage(lang);
  if (!language) return null;

  const languageKey = language === "twi" ? "twi" : "en";
  const canonicalKey = /^OP\d{2}(?:B)?$/i.test(key)
    ? Object.entries(PROMPT_KEY_TO_RECORDING_ID).find(([, id]) => id.toUpperCase() === key.toUpperCase())?.[0] || key
    : key;

  // Dynamic prompts strictly resolve via template pipeline
  if (isDynamicPrompt(key)) {
    return resolvePromptSpokenText(key, languageKey, params || {});
  }

  const scriptKey = TTS_SCRIPT_KEY_BY_PROMPT_KEY[key] || TTS_SCRIPT_KEY_BY_PROMPT_KEY[canonicalKey] || canonicalKey;
  if (PROMPT_SCRIPTS[scriptKey]?.[languageKey]) {
    return PROMPT_SCRIPTS[scriptKey][languageKey];
  }
  const recording = getRecordingByPromptKey(key, language) || getRecordingByPromptKey(canonicalKey, language);
  const stepPrompt = getStepDefinition(canonicalKey.replace(/_/g, "-"))?.promptText[languageKey];
  return (recording?.audioVerified ? recording.spokenText : null)
    || stepPrompt
    || getCanonicalPrompt(key)?.[languageKey]
    || null;
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
      const parsedUrl = new URL(audioUrl, "http://localhost");
      return `${pathname}${parsedUrl.search}`;
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
      if (recording.audioVerified) return recording.url;
      return null;
    }

    return null;
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

export function toTelephonyAudioUrl(audioUrl: string): string {
  const url = new URL(audioUrl, "http://localhost");
  url.searchParams.set("format", "mp3");
  return `${url.pathname}${url.search}`;
}

export function resolvePromptXml(
  key: string,
  lang: SupportedLanguage,
  baseUrl = "",
  fallbackText?: string
): string | null {
  const recording = getRecordingByPromptKey(key, lang);
  if (recording?.audioVerified && recording.url) {
    const telephonyUrl = toTelephonyAudioUrl(recording.url);
    return `<Play url="${baseUrl}${telephonyUrl}"/>`;
  }
  if (fallbackText) {
    return lang === "en" ? `<Say voice="female">${escapeXmlText(fallbackText)}</Say>` : null;
  }
  const audioUrl = resolvePrompt(key, lang);
  if (audioUrl) {
    const telephonyUrl = toTelephonyAudioUrl(audioUrl);
    return `<Play url="${baseUrl}${telephonyUrl}"/>`;
  }
  const text = resolvePromptText(key, lang);
  if (lang === "en" && text) return `<Say voice="female">${escapeXmlText(text)}</Say>`;
  if (lang === "twi") {
    const recovery = /^(?:welcome|language_selection|OP01|OP02)$/i.test(key)
      ? "Twi audio is unavailable. Press 1 for English, or try again later."
      : "Twi audio is unavailable right now. Please use the keypad or try again later.";
    return `<Say voice="female">${escapeXmlText(recovery)}</Say>`;
  }
  return null;
}

/**
 * Resolves prompt key and language into the canonical audio URL.
 */
export async function speak(text: string, lang: SupportedLanguage = "en"): Promise<Buffer> {
  const normalizedLanguage = normalizeRecordingLanguage(lang);
  if (!normalizedLanguage) throw new Error(`TTS_LANGUAGE_UNSUPPORTED: ${lang}`);
  const { ttsRouter } = await import("../ai_system/speech/tts/ttsRouter");
  const result = await ttsRouter.synthesize({
    text,
    language: normalizedLanguage === "twi" ? "tw" : "en",
  });
  if (!result.audioBuffer) throw new Error("TTS_AUDIO_MISSING: speech provider returned no audio.");
  return result.audioBuffer;
}
