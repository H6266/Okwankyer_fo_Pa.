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
  // Cognitive IVR Decision reply keys (Awaiting studio audio recording / UG HCI Lab TTS synthesis)
  invalid_choice: {
    // English: "Option is not a valid choice. Please choose from the available options."
    // Twi: "Deɛ wobɔe no nyɛ pɛpɛɛpɛ. Yɛsrɛ wo paw deɛ ɛwɔ menyu no so."
  },
  intent_understood_ask_number: {
    // English: "Understood, you want to send money. Please enter the recipient's ten-digit phone number, followed by the hash key."
    // Twi: "Mate aseɛ, wopɛ sɛ womane sika. Yɛsrɛ wo, bɔ obi a woremane no no fon nɔmba a ɛyɛ du na fa hash ka ho."
  },
  intent_understood_ask_amount: {
    // English: "Understood. Please enter the amount in Cedis followed by hash."
    // Twi: "Mate aseɛ. Afei bɔ sika dodow no na fa hash ka ho."
  },
  intent_understood_proceed: {
    // English: "Understood. Proceeding to confirmation."
    // Twi: "Mate aseɛ. Yɛrekɔ bammbɔ nkaebɔ no so."
  },
  number_invalid: {
    // English: "The phone number entered is invalid. Ghana mobile numbers must be ten digits with a recognized prefix. Please try again followed by hash."
    // Twi: "Fon nɔmba no nyɛ pɛpɛɛpɛ. Ghana nɔmba yɛ du a ahyɛase firi MTN, Telecel, anaa AT. Yɛsrɛ wo san bɔ biom."
  },
  network_unsupported: {
    // English: "The network operator is not supported for this action. Please enter an MTN, Telecel, or AT number."
    // Twi: "Network yi nnya nnye tumi wɔ ha. Yɛsrɛ wo fa MTN, Telecel, anaa AT nɔmba bɔ mu."
  },
  service_unsupported: {
    // English: "This service is currently not supported. This pilot supports Mobile Money transfers on MTN, Telecel, and AT."
    // Twi: "Saa dwumadie yi nnya nkɔ so. Mprempren yi yɛboa Mobile Money sika mane wɔ MTN, Telecel ne AT so."
  },
  amount_invalid: {
    // English: "The amount entered is invalid. Please enter a valid amount in Cedis followed by hash."
    // Twi: "Sika dodow a wobɔe no nyɛ pɛpɛɛpɛ. Yɛsrɛ wo bɔ sika dodow no wɔ Cedi mu na fa hash ka ho."
  },
  balance_inquiry_unsupported: {
    // English: "I cannot check wallet balances over this voice service. To check your balance, please dial star one seven zero hash directly on your phone keypad."
    // Twi: "Mentumi nhwɛ wo wallet balance wɔ fon frɛ yi so. Sɛ wopɛ sɛ wohwɛ wo sika dodow a, bɔ star baako nson hwee hash wɔ wo fon so."
  },
  unknown_input: {
    // English: "I did not understand your input. Please listen carefully and select from the available options."
    // Twi: "Mante deɛ wobɔe no ase. Yɛsrɛ wo tie nkyerɛkyerɛmu no yie na paw deɛ wopɛ."
  },
  max_retries_exceeded: {
    // English: "Too many unrecognized attempts. For your security, this call will now end. Goodbye."
    // Twi: "Wobɔɔ mmɔden pii a yɛante ase. Ahobammbɔ nti, yɛtwa frɛ yi mu seesei. Nante yie."
  },
};

/**
 * Authoritative script text for prompt and reply keys across languages
 */
export const PROMPT_SCRIPTS: Record<string, { en: string; twi: string }> = {
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
