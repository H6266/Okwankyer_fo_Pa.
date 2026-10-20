import { TWI_AUDIO_LIBRARY_ITEMS, TwiLibraryItem } from "./twiLibraryManifest";
import { DYNAMIC_PROMPT_IDS } from "./dynamicPromptBuilder";

export type RecordingLanguage = "en" | "twi" | "unresolved";
export type AudioAssetRoot = "supplied" | "public" | "additional";
export type RecordingRole = "fixed" | "dynamic" | "alternative" | "unmapped";

export interface PromptManifestEntry {
  id: string;
  category: string;
  state: string;
  type: string;
  english: string;
  twi: string;
  audio: {
    english?: string | null;
    twi?: string | null;
    english_other_takes?: string[];
    twi_other_takes?: string[];
  };
  mappingStatus?: string;
  usePolicy?: string;
}

export interface AudioRecording {
  id: string;
  promptId: string | null;
  state: string | null;
  category: string;
  context: string;
  language: RecordingLanguage;
  title: string;
  spokenText: string | null;
  relativePath: string;
  legacyRelativePath?: string;
  assetRoot: AudioAssetRoot;
  url: string | null;
  mimeType: string;
  isAlternate: boolean;
  recordingRole: RecordingRole;
  mappingStatus: string;
  audioVerified: boolean;
}


// ── Canonical Prompt Definitions (OP01-OP94 & OP52b) ─────────────────────────
export const PROMPT_KEY_TO_RECORDING_ID: Readonly<Record<string, string>> = {
  welcome: "OP01",
  opening_voice_welcome_to_okwankyerefopa: "OP01",
  service_description: "OP01B",
  system_description: "OP01B",
  language_selection: "OP02",
  greetings: "OP03",
  welcome_back: "OP04",
  acknowledge: "OP05",
  processing: "OP06",
  service_selection: "OP07",
  supported_service_select: "OP07",
  service_select: "OP07",
  network_selection: "OP08",
  mtn_menu: "OP09",
  send_money_selected: "OP10",
  service_unavailable: "OP11",
  service_alternative: "OP12",
  service_not_ready: "OP13",
  service_notready: "OP13",
  try_another_service: "OP14",
  choose_instead: "OP15",
  enter_recipient: "OP16",
  invalid_recipient: "OP17",
  recipient_found: "OP18",
  recipient_verify: "OP19",
  recipient_name: "OP20",
  recipient_last4: "OP21",
  recipient_full_number: "OP21",
  recipient_confirm_speech: "OP23",
  use_recipient: "OP24",
  use_recipient_1: "OP24",
  change_recipient: "OP25",
  enter_amount: "OP26",
  invalid_amount: "OP27",
  amount_prompt: "OP28",
  amount_readback: "OP29",
  repeat_amount: "OP30",
  amount_too_high: "OP31",
  amount_too_low: "OP32",
  change_amount: "OP33",
  review_transaction: "OP34",
  confirm_continue: "OP36",
  confirm_speech: "OP37",
  reject_speech: "OP38",
  ready_submit: "OP39",
  pin_handoff: "OP40",
  authorize_phone: "OP40",
  security_warning: "OP41",
  secure_pin: "OP42",
  pin_block: "OP43",
  sensitive_block: "OP44",
  submitted: "OP45",
  waiting_confirmation: "OP46",
  check_phone: "OP47",
  check_messages: "OP62",
  auth_received: "OP49",
  check_final_status: "OP50",
  check_final_tatus: "OP50",
  success: "OP52",
  transaction_success: "OP52",
  reference_readback: "OP52b",
  success_sent: "OP53",
  keep_reference: "OP54",
  success_close: "OP55",
  anything_else: "OP56",
  customer_declined: "OP57",
  failed: "OP58",
  transaction_failed: "OP58",
  timeout: "OP59",
  failure_retry: "OP60",
  no_transfer_confirmed: "OP61",
  start_again: "OP63",
  not_understood: "OP64",
  did_not_get: "OP65",
  no_response: "OP66",
  please_respond: "OP67",
  input_not_recognized: "OP68",
  repeat: "OP69",
  confirm_understanding: "OP70",
  correct_prompt: "OP71",
  yes_no: "OP72",
  back: "OP73",
  main_menu: "OP74",
  restart: "OP75",
  cancel: "OP76",
  exit: "OP77",
  session_end: "OP78",
  continue: "OP79",
  session_timeout: "OP80",
  repeat_options: "OP81",
  repeat_option: "OP81",
  keypad_option: "OP82",
  voice_or_keypad: "OP83",
  take_your_time: "OP84",
  yes_no_keypad: "OP85",
  help: "OP86",
  help_commands: "OP87",
  help_command: "OP87",
  balance_unavailable: "OP88",
  unsupported_service: "OP89",
  system_error: "OP90",
  post_success_help: "OP91",
  another_transaction: "OP92",
  do_you_want_another_transaction: "OP92",
  another_recipient: "OP93",
  do_you_want_to_send_money_to_another_person: "OP93",
  finish: "OP94",
};

const CANONICAL_PROMPT_RECORDING_ALIASES: Readonly<Record<string, string>> = {
  OP22: "OP23",
  OP44: "OP41",
  OP48: "OP40",
  OP51: "OP06",
  OP66: "OP67",
};

const PROMPT_ID_TO_KEY: Record<string, string> = {};
for (const [key, id] of Object.entries(PROMPT_KEY_TO_RECORDING_ID)) {
  if (!PROMPT_ID_TO_KEY[id]) PROMPT_ID_TO_KEY[id] = key;
}

// ── Build AUDIO_RECORDINGS from twiLibraryManifest & audioTranscripts ───
const recordings: AudioRecording[] = [];
const ENGLISH_FIXED_PROMPT_TEXT: Readonly<Record<string, string>> = {
  OP07: "For a supported Mobile Money transfer, press 1. Press 9 to repeat, or 0 to exit.",
  OP08: "Select network: press 1 for MTN or 2 for Telecel. Press 9 to repeat, or 0 to exit.",
  OP41: "Never share or say your Mobile Money PIN on this call. Enter it only on the official secure provider handset prompt.",
};

for (const [filename, language] of [["welcome_en.mp3", "en"], ["welcome_twi.mp3", "twi"]] as const) {
  const isEn = language === "en";
  recordings.push({
    id: `public:${filename}`,
    promptId: isEn ? "OP01" : "OP01",
    state: "WELCOME",
    category: "session",
    context: isEn ? "Approved English welcome recording." : "Alternate Akan Twi welcome recording.",
    language,
    title: filename.replace(/\.[a-z0-9]+$/i, ""),
    spokenText: isEn
      ? "Welcome to Ɔkwankyerɛfo Pa. For English, press 1. For Twi, press 2."
      : "Akwaaba kɔ Ɔkwankyerɛfo Pa. Sɛ wopɛ Borɔfo a, mia 1. Sɛ wopɛ Twi a, mia 2.",
    relativePath: filename,
    assetRoot: "public",
    url: `/audio/${filename}`,
    mimeType: "audio/mpeg",
    isAlternate: !isEn,
    recordingRole: isEn ? "fixed" : "alternative",
    mappingStatus: isEn ? "VERIFIED" : "CANDIDATE_NOT_AUDIO_VERIFIED",
    audioVerified: isEn,
  });
}

for (const item of [
  { filename: "2.m4a", promptId: "OP07", state: "SERVICE_SELECTION", category: "navigation" },
  { filename: "3.m4a", promptId: "OP08", state: "NETWORK_SELECTION", category: "navigation" },
  { filename: "4.m4a", promptId: "OP41", state: "SECURITY_WARNING", category: "auth" },
]) {
  recordings.push({
    id: `supplied:English_Library/${item.filename}`,
    promptId: item.promptId,
    state: item.state,
    category: item.category,
    context: `Approved English recording for ${item.promptId}.`,
    language: "en",
    title: item.filename.replace(/\.[a-z0-9]+$/i, ""),
    spokenText: ENGLISH_FIXED_PROMPT_TEXT[item.promptId],
    relativePath: `English_Library/${item.filename}`,
    assetRoot: "supplied",
    url: `/audio/English_Library/${item.filename}`,
    mimeType: "audio/mp4",
    isAlternate: false,
    recordingRole: "fixed",
    mappingStatus: "VERIFIED",
    audioVerified: true,
  });
}

// 1. Twi Library Items
for (const item of TWI_AUDIO_LIBRARY_ITEMS) {
  const mappedPromptId = PROMPT_KEY_TO_RECORDING_ID[item.key] || null;
  const isDynamicRecording = mappedPromptId !== null && DYNAMIC_PROMPT_IDS.has(mappedPromptId.toUpperCase());
  const promptId = isDynamicRecording ? null : mappedPromptId;
  const audioVerified = !isDynamicRecording && item.audioVerified !== false;
  const mimeType = item.filename.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4";
  recordings.push({
    id: `supplied:Twi_library/${item.filename}`,
    promptId,
    state: item.category.toUpperCase(),
    category: item.category,
    context: item.transcript,
    language: "twi",
    title: item.filename.replace(/\.[a-z0-9]+$/i, ""),
    spokenText: item.transcript,
    relativePath: `Twi/${item.filename}`,
    legacyRelativePath: `Twi_library/${item.filename}`,
    assetRoot: "supplied",
    url: item.audioUrl,
    mimeType,
    isAlternate: false,
    recordingRole: isDynamicRecording ? "dynamic" : audioVerified ? "fixed" : "unmapped",
    mappingStatus: isDynamicRecording ? "DYNAMIC_SAMPLE_NOT_FOR_PLAYBACK" : audioVerified ? "VERIFIED" : "MISSING_ASSET",
    audioVerified,
  });
}

export const AUDIO_RECORDINGS: AudioRecording[] = recordings;

// ── Lookups and Accessors ─────────────────────────────────────────────
export function getRecordingByPromptId(
  promptId: string,
  language: "en" | "twi" = "twi"
): AudioRecording | null {
  const normalizedPromptId = promptId.toUpperCase();
  const lookupPromptId = CANONICAL_PROMPT_RECORDING_ALIASES[normalizedPromptId] || normalizedPromptId;
  const matches = AUDIO_RECORDINGS.filter(
    (r) => r.promptId?.toUpperCase() === lookupPromptId && r.language === language && r.url
  );
  return matches.find((recording) => recording.audioVerified) || null;
}

export function getRecordingsByPromptId(
  promptId: string,
  language?: "en" | "twi"
): AudioRecording[] {
  const normalizedPromptId = promptId.toUpperCase();
  const lookupPromptId = CANONICAL_PROMPT_RECORDING_ALIASES[normalizedPromptId] || normalizedPromptId;
  return AUDIO_RECORDINGS.filter(
    (r) => r.promptId?.toUpperCase() === lookupPromptId && r.url && (!language || r.language === language)
  );
}

export function getRecordingByPromptKey(
  key: string,
  language: "en" | "twi" = "twi"
): AudioRecording | null {
  const normalizedKey = key.toLowerCase();
  const directItem = TWI_AUDIO_LIBRARY_ITEMS.find(
    (item) => item.key.toLowerCase() === normalizedKey || item.filename.toLowerCase() === normalizedKey
  );
  if (directItem && language === "twi") {
    const recording = AUDIO_RECORDINGS.find((r) => r.url === directItem.audioUrl);
    if (recording?.audioVerified && recording.recordingRole === "fixed") return recording;
  }

  const promptId = PROMPT_KEY_TO_RECORDING_ID[key]
    || PROMPT_KEY_TO_RECORDING_ID[normalizedKey]
    || (/^OP\d{2}(?:B)?$/i.test(key) ? key.toUpperCase() : undefined);
  if (promptId) {
    if (DYNAMIC_PROMPT_IDS.has(promptId.toUpperCase())) return null;
    const rec = getRecordingByPromptId(promptId, language);
    if (rec) return rec;
  }
  return null;
}

export function getRecordingByPath(relativePath: string): AudioRecording | null {
  const norm = relativePath.replace(/^audio\//i, "").replace(/\\/g, "/");
  return AUDIO_RECORDINGS.find((r) => r.relativePath === norm) || null;
}

export function getRecordingByUrl(url: string, preferredLang?: "en" | "twi"): AudioRecording | null {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].trim();
  const decodedUrl = decodeURIComponent(cleanUrl);

  const exact = AUDIO_RECORDINGS.filter((r) => {
    if (!r.url) return false;
    const recordingUrl = decodeURIComponent(r.url.split("?")[0]);
    return recordingUrl === decodedUrl;
  });

  if (exact.length > 0) {
    if (preferredLang) {
      const match = exact.find((r) => r.language === preferredLang);
      return match || null;
    }
    return exact[0];
  }
  return null;
}

export function getRecordingFilePath(relativePath: string): string | null {
  const norm = relativePath.replace(/^audio\//i, "").replace(/\\/g, "/");
  if (/^(?:audio\/)?Twi\//i.test(norm)) {
    const filename = norm.replace(/^(?:audio\/)?Twi\//i, "");
    return `Audio_files/Twi_library/${filename}`;
  }
  if (/^Twi_library\//i.test(norm)) return `Audio_files/${norm}`;
  if (/^English_Library\//i.test(norm)) return `Audio_files/${norm}`;
  if (/^additional\//i.test(norm)) return `Audio_files/${norm}`;
  if (/^[^/]+\.(?:mp3|m4a|aac|wav|ogg)$/i.test(norm)) return `public/audio/${norm}`;
  return null;
}

export function getVerifiedRecordingBySpokenText(
  text: string,
  language: "en" | "twi"
): AudioRecording | null {
  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const normalizedText = normalize(text);
  if (!normalizedText) return null;
  return AUDIO_RECORDINGS.find((recording) =>
    recording.audioVerified
      && recording.recordingRole === "fixed"
      && recording.language === language
      && Boolean(recording.url)
      && Boolean(recording.spokenText)
      && normalize(recording.spokenText!) === normalizedText
  ) || null;
}

export function getAudioAssetInventory(): AudioRecording[] {
  return [...AUDIO_RECORDINGS];
}

const DYNAMIC_PROMPT_COPY: Readonly<Record<string, Omit<PromptManifestEntry, "id" | "audio" | "type" | "mappingStatus">>> = {
  OP20: {
    category: "recipient",
    state: "RECIPIENT_NAME",
    english: "The recipient's name is {recipient_name}.",
    twi: "Recipient no din ne {recipient_name}.",
  },
  OP21: {
    category: "recipient",
    state: "RECIPIENT_FULL_NUMBER",
    english: "The full recipient phone number is {recipient_phone_spaced}.",
    twi: "Ne phone nɔmba a ɛdi mũ no ne {recipient_phone_spaced}.",
  },
  OP29: {
    category: "amount",
    state: "AMOUNT_READBACK",
    english: "I heard {amount}. Is that amount correct?",
    twi: "Mate sɛ ɛyɛ {amount}. Saa sika dodow yi yɛ nokware anaa?",
  },
  OP35: {
    category: "confirmation",
    state: "REVIEW_TRANSACTION",
    english: "You are about to send {amount} to {recipient_name} on {network}. The recipient phone number ends in {last_four}.",
    twi: "Wopɛ sɛ womane {amount} kɔma {recipient_name} wɔ {network} so. Recipient phone nɔmba no awiei ne {last_four}.",
  },
  OP52: {
    category: "outcome",
    state: "SUCCESS",
    english: "Your transfer of {amount} to {recipient_name} is complete. Your application reference is {reference_id}.",
    twi: "Wo transfer a ɛyɛ {amount} kɔma {recipient_name} no awie. Application reference no ne {reference_id}.",
  },
  OP52B: {
    category: "outcome",
    state: "REFERENCE_READBACK",
    english: "Your complete transaction reference is {slow_reference}.",
    twi: "Wo transaction reference nɔmba a ɛdi mũ no ne {slow_reference}.",
  },
  OP70: {
    category: "recovery",
    state: "CONFIRM_UNDERSTANDING",
    english: "I heard you say {response}. Is that correct?",
    twi: "Mate sɛ wokae {response}. Ɛyɛ nokware anaa?",
  },
};

export function getPromptManifestEntry(promptId: string): PromptManifestEntry | null {
  const normalizedPromptId = promptId.toUpperCase();
  if (DYNAMIC_PROMPT_IDS.has(normalizedPromptId)) {
    const copy = DYNAMIC_PROMPT_COPY[normalizedPromptId];
    if (!copy) return null;
    return {
      id: normalizedPromptId,
      ...copy,
      type: "DYNAMIC",
      audio: { english: null, twi: null },
      mappingStatus: "DYNAMIC_TTS_REQUIRED",
      usePolicy: "Render with current transaction values; never use sample audio.",
    };
  }

  const rec = getRecordingByPromptId(normalizedPromptId, "twi");
  const enRec = getRecordingByPromptId(normalizedPromptId, "en");
  if (!rec && !enRec) return null;
  return {
    id: normalizedPromptId,
    category: rec?.category || enRec?.category || "general",
    state: rec?.state || enRec?.state || "GENERAL",
    type: "FIXED",
    english: enRec?.spokenText || "",
    twi: rec?.spokenText || "",
    audio: {
      english: enRec?.url || null,
      twi: rec?.url || null,
    },
    mappingStatus: "VERIFIED",
    usePolicy: rec?.audioVerified || enRec?.audioVerified
      ? "Approved audio may play for this prompt."
      : "Candidate audio is not approved for live playback; use the canonical text fallback.",
  };
}

export function getPromptManifestEntries(): PromptManifestEntry[] {
  const ids = new Set([
    ...AUDIO_RECORDINGS.map((recording) => recording.promptId).filter(Boolean) as string[],
    ...DYNAMIC_PROMPT_IDS,
  ]);
  return Array.from(ids).map((id) => getPromptManifestEntry(id)).filter(Boolean) as PromptManifestEntry[];
}

export function normalizeRecordingLanguage(language: string): "en" | "twi" | null {
  const normalized = (language || "").trim().toLowerCase();
  if (["en", "eng", "english", "en-us", "en-gh"].includes(normalized)) return "en";
  if (["twi", "tw", "ak", "akan", "ak-gh"].includes(normalized)) return "twi";
  return null;
}
