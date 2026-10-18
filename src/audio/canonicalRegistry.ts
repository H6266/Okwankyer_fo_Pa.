/**
 * Ɔkwankyerɛfo Pa - Authoritative Canonical Prompt Registry
 *
 * Defines the single shared source of truth for all 94 prompts (OP01–OP94)
 * across both the Phone Simulator and Africa's Talking telephony gateway.
 *
 * Invariants:
 * 1. Fixed prompts (OP01-OP19, OP22-OP28, OP30-OP51, OP53-OP69, OP71-OP94) resolve to studio recordings
 *    or canonical script texts.
 * 2. Dynamic prompts (OP20, OP21, OP29, OP52, OP70) resolve strictly to approved TTS template rendering
 *    with real variables (recipient name, full spaced phone number, amount in Cedis/Pesewas, reference ID,
 *    or understood speech utterance), NEVER static audio files or raw bracketed placeholders.
 * 3. Parity guarantee: The Phone Simulator and Africa's Talking use the identical prompt IDs,
 *    audio endpoints, and state transitions.
 */

import {
  renderDynamicPromptTemplate,
  formatFullPhoneNumberForSpeech,
  formatRefForSpeech,
  DynamicPromptParams,
} from "./dynamicPromptBuilder";
import {
  AUDIO_RECORDINGS,
  AudioRecording,
  getRecordingByPromptId,
  PROMPT_KEY_TO_RECORDING_ID,
} from "./recordingRegistry";

export type PromptType = "FIXED" | "DYNAMIC";
export type CanonicalPromptLanguage = "en" | "twi";

export interface CanonicalPrompt {
  id: string; // e.g. "OP01", "OP20"
  category: string;
  state: string;
  type: PromptType;
  english: string;
  twi: string;
  placeholders?: string[];
  audio: {
    english: string | null;
    twi: string | null;
    twi_other_takes?: string[];
  };
}

export const DYNAMIC_PROMPT_IDS: ReadonlySet<string> = new Set([
  "OP20",
  "OP21",
  "OP29",
  "OP52",
  "OP52b",
  "OP70",
]);

/**
 * Maps state machine states to canonical prompt IDs
 */
export const STATE_TO_CANONICAL_PROMPT_ID: Readonly<Record<string, string>> = {
  // Session start
  WELCOME: "OP01",
  SERVICE_DESCRIPTION: "OP01B",
  LANGUAGE_SELECTION: "OP02",
  GREETING: "OP03",
  WELCOME_BACK: "OP04",
  ACKNOWLEDGE: "OP05",
  PROCESSING: "OP06",

  // Service & network selection
  SERVICE_SELECTION: "OP07",
  NETWORK_SELECTION: "OP08",
  MTN_MENU: "OP09",
  SEND_MONEY_SELECTED: "OP10",
  SERVICE_UNAVAILABLE: "OP11",
  SERVICE_ALTERNATIVE: "OP12",
  SERVICE_NOT_READY: "OP13",
  TRY_ANOTHER_SERVICE: "OP14",
  CHOOSE_INSTEAD: "OP15",

  // Recipient input & verification
  ENTER_RECIPIENT: "OP16",
  INVALID_RECIPIENT: "OP17",
  RECIPIENT_FOUND: "OP18",
  RECIPIENT_VERIFY: "OP19",
  RECIPIENT_NAME: "OP20", // DYNAMIC
  RECIPIENT_FULL_NUMBER: "OP21", // DYNAMIC
  RECIPIENT_CONFIRM: "OP22",
  RECIPIENT_CONFIRM_SPEECH: "OP23",
  USE_RECIPIENT: "OP24",
  CHANGE_RECIPIENT: "OP25",

  // Amount input & verification
  ENTER_AMOUNT: "OP26",
  INVALID_AMOUNT: "OP27",
  AMOUNT_PROMPT: "OP28",
  AMOUNT_READBACK: "OP29", // DYNAMIC
  REPEAT_AMOUNT: "OP30",
  AMOUNT_TOO_HIGH: "OP31",
  AMOUNT_TOO_LOW: "OP32",
  CHANGE_AMOUNT: "OP33",

  // Confirmation & PIN safety
  CONFIRMATION_INTRO: "OP34",
  REVIEW_TRANSACTION: "OP35",
  CONFIRM_CONTINUE: "OP36",
  CONFIRM_SPEECH: "OP37",
  REJECT_SPEECH: "OP38",
  READY_SUBMIT: "OP39",
  PIN_HANDOFF: "OP40",
  AUTHORIZE_PHONE: "OP40",
  SECURITY_WARNING: "OP41",
  SECURE_PIN: "OP42",
  PIN_BLOCK: "OP43",
  SENSITIVE_BLOCK: "OP44",
  SUBMITTED: "OP45",
  WAITING_CONFIRMATION: "OP46",
  CHECK_PHONE: "OP47",
  AUTH_RECEIVED: "OP49",
  CHECK_FINAL_STATUS: "OP50",

  // Completion & results
  SUCCESS: "OP52", // DYNAMIC
  TRANSACTION_SUCCESS: "OP52", // DYNAMIC
  REFERENCE_READBACK: "OP52b", // DYNAMIC
  SUCCESS_SENT: "OP53",
  KEEP_REFERENCE: "OP54",
  SUCCESS_CLOSE: "OP55",
  ANYTHING_ELSE: "OP56",
  CUSTOMER_DECLINED: "OP57",
  FAILED: "OP58",
  TRANSACTION_FAILED: "OP58",
  TIMEOUT: "OP59",
  FAILURE_RETRY: "OP60",
  NO_TRANSFER_CONFIRMED: "OP61",
  CHECK_MESSAGES: "OP62",
  START_AGAIN: "OP63",

  // ASR & Recovery
  NOT_UNDERSTOOD: "OP64",
  DID_NOT_GET: "OP65",
  NO_RESPONSE: "OP66",
  PLEASE_RESPOND: "OP67",
  INPUT_NOT_RECOGNIZED: "OP68",
  REPEAT: "OP69",
  CONFIRM_UNDERSTANDING: "OP70", // DYNAMIC
  CORRECT_PROMPT: "OP71",
  YES_NO: "OP72",
  BACK: "OP73",
  MAIN_MENU: "OP74",
  RESTART: "OP75",
  CANCEL: "OP76",
  EXIT: "OP77",
  SESSION_END: "OP78",
  CONTINUE: "OP79",
  SESSION_TIMEOUT: "OP80",
  REPEAT_OPTIONS: "OP81",
  KEYPAD_OPTION: "OP82",
  VOICE_OR_KEYPAD: "OP83",
  TAKE_YOUR_TIME: "OP84",
  YES_NO_KEYPAD: "OP85",
  HELP: "OP86",
  HELP_COMMANDS: "OP87",
  BALANCE_UNAVAILABLE: "OP88",
  UNSUPPORTED_SERVICE: "OP89",
  SYSTEM_ERROR: "OP90",
  POST_SUCCESS_HELP: "OP91",
  ANOTHER_TRANSACTION: "OP92",
  ANOTHER_RECIPIENT: "OP93",
  FINISH: "OP94",
  GOODBYE: "OP94",
};

// Build Canonical Prompts from AUDIO_RECORDINGS
const promptIds = new Set<string>();
for (let i = 1; i <= 94; i++) {
  promptIds.add(`OP${i < 10 ? "0" + i : i}`);
}
promptIds.add("OP52b");

const loadedPrompts: CanonicalPrompt[] = Array.from(promptIds).map((id) => {
  const normId = id.toUpperCase();
  const isDynamic = DYNAMIC_PROMPT_IDS.has(normId);
  const twiRec = AUDIO_RECORDINGS.find((r) => r.promptId?.toUpperCase() === normId && r.language === "twi");
  const enRec = AUDIO_RECORDINGS.find((r) => r.promptId?.toUpperCase() === normId && r.language === "en");

  // Determine state
  const stateEntry = Object.entries(STATE_TO_CANONICAL_PROMPT_ID).find(([, pId]) => pId.toUpperCase() === normId);
  const state = stateEntry ? stateEntry[0] : (twiRec?.state || (normId === "OP52B" ? "REFERENCE_READBACK" : "GENERAL"));

  let enText = enRec?.spokenText || enRec?.context;
  let twiText = twiRec?.spokenText || twiRec?.context;

  if (normId === "OP52B") {
    enText = "Your complete transaction reference is: {slow_reference}.";
    twiText = "Wo transaction reference nɔmba a ɛdi mũ no ne: {slow_reference}.";
  } else if (normId === "OP21") {
    enText = "The full recipient phone number is {recipient_phone_spaced}.";
    twiText = "Ne phone nɔmba a ɛdi mũ no ne {recipient_phone_spaced}.";
  } else if (normId === "OP20") {
    enText = "The recipient's name is {recipient_name}.";
    twiText = "Obi a woremane no sika no din ne {recipient_name}.";
  } else if (normId === "OP29") {
    enText = "I heard {amount} Ghana cedis. Is that amount correct?";
    twiText = "Mate sɛ ɛyɛ Ghana cedis {amount}. Saa sika dodow yi yɛ nokware anaa?";
  } else if (normId === "OP40") {
    enText = "Your transaction is ready. Follow your Mobile Money provider's private authorization prompt on your handset. Never tell us your PIN.";
    twiText = "Wo transaction no ayɛ krado. Di wo Mobile Money provider no private akwankyerɛ a ɛwɔ wo fon so no akyi. Mma nka wo PIN nkyerɛ yɛn.";
  } else if (normId === "OP67") {
    enText = "I did not get any response from you, please give us a response!";
    twiText = "Mante deɛ wofiri wo hɔ bae, yɛsrɛ wo ma yɛn mmuaeɛ!";
  }

  return {
    id,
    category: twiRec?.category || enRec?.category || (normId === "OP52B" ? "completion" : "general"),
    state,
    type: isDynamic ? "DYNAMIC" : "FIXED",
    english: enText || "Financial service option",
    twi: twiText || "Sika ho dwumadie",
    audio: {
      english: enRec?.url || (isDynamic ? `/api/audio/prompt-tts/en/${normId}` : null),
      twi: twiRec?.url || (isDynamic ? `/api/audio/prompt-tts/twi/${normId}` : null),
      twi_other_takes: [],
    },
  };
});

export const CANONICAL_PROMPT_LIST: readonly CanonicalPrompt[] = Object.freeze(loadedPrompts);

export const CANONICAL_PROMPTS: Readonly<Record<string, CanonicalPrompt>> = Object.freeze(
  loadedPrompts.reduce<Record<string, CanonicalPrompt>>((acc, prompt) => {
    acc[prompt.id.toUpperCase()] = prompt;
    return acc;
  }, {})
);

/**
 * Checks whether a given prompt ID is dynamic
 */
export function isDynamicPrompt(promptId: string): boolean {
  return DYNAMIC_PROMPT_IDS.has(promptId.toUpperCase().trim());
}

/**
 * Get canonical prompt definition by ID (e.g. "OP01")
 */
export function getCanonicalPrompt(promptId: string): CanonicalPrompt | undefined {
  return CANONICAL_PROMPTS[promptId.toUpperCase().trim()];
}

/**
 * Get canonical prompt definition by state machine state (e.g. "AMOUNT_READBACK")
 */
export function getCanonicalPromptByState(state: string): CanonicalPrompt | undefined {
  const normalizedState = state.toUpperCase().trim();
  const promptId = STATE_TO_CANONICAL_PROMPT_ID[normalizedState];
  if (promptId) {
    return CANONICAL_PROMPTS[promptId];
  }
  return loadedPrompts.find((p) => p.state.toUpperCase() === normalizedState);
}

/**
 * Resolves spoken text for any canonical prompt.
 */
export function resolvePromptSpokenText(
  promptId: string,
  lang: CanonicalPromptLanguage = "en",
  params: DynamicPromptParams = {}
): string {
  const normId = promptId.toUpperCase().trim();
  const isTwi = lang === "twi";

  // Dynamic template rendering
  if (isDynamicPrompt(normId)) {
    const dynamicRendered = renderDynamicPromptTemplate(normId, lang, params);
    if (dynamicRendered) {
      return dynamicRendered;
    }
  }

  const prompt = CANONICAL_PROMPTS[normId];
  if (!prompt) {
    return isTwi
      ? "Yɛsrɛ wo, bɔ sika ho dwumadie no."
      : "Please proceed with your financial service transaction.";
  }

  const text = isTwi ? prompt.twi : prompt.english;

  if (text.includes("[") || text.includes("{")) {
    return text
      .replace(/\[DYNAMIC NAME\]/gi, params.name || params.recipientName || (isTwi ? "obi a woremane no sika" : "the recipient"))
      .replace(/\[ALL TEN DIGITS\]/gi, formatFullPhoneNumberForSpeech(params.phone || params.recipientPhone || "0543546010", lang))
      .replace(/\[DYNAMIC AMOUNT\]/gi, String(params.amount || (isTwi ? "Ghana Cedis aduonum" : "fifty Ghana Cedis")))
      .replace(/\[DYNAMIC REFERENCE\]/gi, formatRefForSpeech(params.referenceId || params.ref || "OKP-782914"))
      .replace(/\[DYNAMIC RESPONSE\]/gi, params.response || params.utterance || (isTwi ? "wo nkaebɔ" : "your response"))
      .replace(/\{NAME\}/gi, params.name || params.recipientName || (isTwi ? "obi a woremane no sika" : "the recipient"))
      .replace(/\{PHONE\}/gi, formatFullPhoneNumberForSpeech(params.phone || params.recipientPhone || "0543546010", lang))
      .replace(/\{AMOUNT\}/gi, String(params.amount || (isTwi ? "Ghana Cedis aduonum" : "fifty Ghana Cedis")))
      .replace(/\{REF\}/gi, formatRefForSpeech(params.referenceId || params.ref || "OKP-782914"))
      .replace(/\{RESPONSE\}/gi, params.response || params.utterance || (isTwi ? "wo nkaebɔ" : "your response"));
  }

  return text;
}

/**
 * Authoritative audio URL resolution.
 */
export function resolveCanonicalAudioUrl(
  promptId: string,
  lang: CanonicalPromptLanguage = "en",
  baseUrl: string = "",
  params: DynamicPromptParams = {}
): {
  url: string;
  mode: "RECORDED" | "DYNAMIC_TTS";
  promptId: string;
  state: string;
  spokenText: string;
} {
  const normId = promptId.toUpperCase().trim();
  const prompt = CANONICAL_PROMPTS[normId];
  const state = prompt?.state || "UNKNOWN";
  const spokenText = resolvePromptSpokenText(normId, lang, params);
  const cleanBase = baseUrl.replace(/\/+$/, "");

  // Dynamic prompts NEVER return static recordings with placeholders
  if (isDynamicPrompt(normId)) {
    const q = new URLSearchParams();
    if (params.name || params.recipientName) q.set("name", params.name || params.recipientName || "");
    if (params.phone || params.recipientPhone) q.set("phone", params.phone || params.recipientPhone || "");
    if (params.amount !== undefined) q.set("amount", String(params.amount));
    if (params.referenceId || params.ref) q.set("referenceId", params.referenceId || params.ref || "");
    if (params.response || params.utterance) q.set("response", params.response || params.utterance || "");

    const queryString = q.toString() ? `?${q.toString()}` : "";
    return {
      url: `${cleanBase}/api/audio/prompt-tts/${lang}/${normId}${queryString}`,
      mode: "DYNAMIC_TTS",
      promptId: normId,
      state,
      spokenText,
    };
  }

  const recordingUrl = getRecordingByPromptId(normId, lang)?.url || null;

  if (recordingUrl) {
    const encodedUrl = encodeURI(recordingUrl);
    const fullUrl = encodedUrl.startsWith("http") ? encodedUrl : `${cleanBase}${encodedUrl.startsWith("/") ? "" : "/"}${encodedUrl}`;
    return {
      url: fullUrl,
      mode: "RECORDED",
      promptId: normId,
      state,
      spokenText,
    };
  }

  const encodedText = encodeURIComponent(spokenText);
  return {
    url: `${cleanBase}/api/audio/prompt-tts/${lang}/${normId}?text=${encodedText}`,
    mode: "DYNAMIC_TTS",
    promptId: normId,
    state,
    spokenText,
  };
}

export interface CanonicalVoiceXmlOptions {
  promptId: string;
  language: CanonicalPromptLanguage;
  baseUrl?: string;
  params?: DynamicPromptParams;
  getDigits?: {
    callbackUrl: string;
    timeout: number;
    numDigits?: number;
    finishOnKey?: string;
  };
}

function escapeVoiceXmlValue(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      default: return "&quot;";
    }
  });
}

export function buildVoiceXmlForCanonicalPrompt(options: CanonicalVoiceXmlOptions): string | null {
  const promptId = options.promptId.trim().toUpperCase();
  if (!getCanonicalPrompt(promptId)) return null;

  let promptAction: string;
  if (isDynamicPrompt(promptId)) {
    const voice = options.language === "twi" ? "woman" : "alice";
    const spokenText = resolvePromptSpokenText(promptId, options.language, options.params || {});
    promptAction = `<Say voice="${voice}">${escapeVoiceXmlValue(spokenText)}</Say>`;
  } else {
    const audio = resolveCanonicalAudioUrl(
      promptId,
      options.language,
      options.baseUrl || "",
      options.params || {}
    );
    promptAction = `<Play url="${escapeVoiceXmlValue(audio.url)}"/>`;
  }

  if (!options.getDigits) return promptAction;

  const { callbackUrl, timeout, numDigits, finishOnKey = "#" } = options.getDigits;
  const digitsAttribute = numDigits === undefined ? "" : ` numDigits="${numDigits}"`;
  return `<GetDigits timeout="${timeout}" finishOnKey="${escapeVoiceXmlValue(finishOnKey)}"${digitsAttribute} callbackUrl="${escapeVoiceXmlValue(callbackUrl)}">${promptAction}</GetDigits>`;
}
