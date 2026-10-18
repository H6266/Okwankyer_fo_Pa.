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
  review_transaction: "OP35",
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
  check_messages: "OP47",
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

const PROMPT_ID_TO_KEY: Record<string, string> = {};
for (const [key, id] of Object.entries(PROMPT_KEY_TO_RECORDING_ID)) {
  if (!PROMPT_ID_TO_KEY[id]) PROMPT_ID_TO_KEY[id] = key;
}

// ── Build AUDIO_RECORDINGS from twiLibraryManifest & audioTranscripts ───
const recordings: AudioRecording[] = [];

for (const [filename, language] of [["welcome_en.mp3", "en"], ["welcome_twi.mp3", "twi"]] as const) {
  recordings.push({
    id: `public:${filename}`,
    promptId: "OP01",
    state: "WELCOME",
    category: "session",
    context: "Audio candidate; transcript and recording require human review.",
    language,
    title: filename.replace(/\.[a-z0-9]+$/i, ""),
    spokenText: null,
    relativePath: filename,
    assetRoot: "public",
    url: `/audio/${filename}`,
    mimeType: "audio/mpeg",
    isAlternate: false,
    recordingRole: "fixed",
    mappingStatus: "CANDIDATE_NOT_AUDIO_VERIFIED",
    audioVerified: false,
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
    context: `English audio candidate for ${item.promptId}; recording requires human review.`,
    language: "en",
    title: item.filename.replace(/\.[a-z0-9]+$/i, ""),
    spokenText: null,
    relativePath: `English_Library/${item.filename}`,
    assetRoot: "supplied",
    url: `/audio/English_Library/${item.filename}`,
    mimeType: "audio/mp4",
    isAlternate: false,
    recordingRole: "fixed",
    mappingStatus: "CANDIDATE_NOT_AUDIO_VERIFIED",
    audioVerified: false,
  });
}

// 1. Twi Library Items
for (const item of TWI_AUDIO_LIBRARY_ITEMS) {
  const promptId = PROMPT_KEY_TO_RECORDING_ID[item.key] || null;
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
    recordingRole: "fixed",
    mappingStatus: "CANDIDATE_NOT_AUDIO_VERIFIED",
    audioVerified: false,
  });
}

export const AUDIO_RECORDINGS: AudioRecording[] = recordings;

// ── Lookups and Accessors ─────────────────────────────────────────────
export function getRecordingByPromptId(
  promptId: string,
  language: "en" | "twi" = "twi"
): AudioRecording | null {
  const normalizedPromptId = promptId.toUpperCase();
  const matches = AUDIO_RECORDINGS.filter(
    (r) => r.promptId?.toUpperCase() === normalizedPromptId && r.language === language && r.url
  );
  return matches.find((recording) => recording.audioVerified) || null;
}

export function getRecordingsByPromptId(
  promptId: string,
  language?: "en" | "twi"
): AudioRecording[] {
  return AUDIO_RECORDINGS.filter(
    (r) => r.promptId === promptId && r.url && (!language || r.language === language)
  );
}

export function getRecordingByPromptKey(
  key: string,
  language: "en" | "twi" = "twi"
): AudioRecording | null {
  const promptId = PROMPT_KEY_TO_RECORDING_ID[key] || (/^OP\d{2}$/i.test(key) ? key.toUpperCase() : undefined);
  if (promptId) {
    const rec = getRecordingByPromptId(promptId, language);
    if (rec) return rec;
  }
  // Try direct filename or item key match in Twi items
  const directItem = TWI_AUDIO_LIBRARY_ITEMS.find(
    (item) => item.key === key || item.filename.toLowerCase() === key.toLowerCase()
  );
  if (directItem && language === "twi") {
    return AUDIO_RECORDINGS.find((r) => r.url === directItem.audioUrl) || null;
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
  if (/^Twi\//i.test(norm)) return `Audio_files/audio/${norm}`;
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
