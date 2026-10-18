import audioTranscripts from "../../audio_transcripts.json";
import { TWI_AUDIO_LIBRARY_ITEMS, TwiLibraryItem } from "./twiLibraryManifest";

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
  assetRoot: AudioAssetRoot;
  url: string | null;
  mimeType: string;
  isAlternate: boolean;
  recordingRole: RecordingRole;
  mappingStatus: string;
}

const transcriptLookup = audioTranscripts as Record<string, { verbatim?: string; language?: string; step?: string; options?: unknown }>;

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
  provider_select: "OP08",
  provider_choice: "OP08",
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
  recipient_full_number: "OP21",
  recipient_last4: "OP21",
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

const DYNAMIC_PROMPT_TEXT: Readonly<Record<string, { category: string; english: string; twi: string }>> = {
  OP20: {
    category: "recipient",
    english: "The recipient's name is [DYNAMIC NAME].",
    twi: "Obi a woremane no sika no din ne [DYNAMIC NAME].",
  },
  OP21: {
    category: "recipient",
    english: "The recipient's full phone number is [ALL TEN DIGITS].",
    twi: "Ne phone nɔmba a ɛdi mũ ne [ALL TEN DIGITS].",
  },
  OP29: {
    category: "amount",
    english: "I heard [DYNAMIC AMOUNT] Ghana cedis. Is that amount correct?",
    twi: "Mate sɛ ɛyɛ Ghana cedis [DYNAMIC AMOUNT]. Saa sika dodow yi yɛ nokware anaa?",
  },
  OP52: {
    category: "completion",
    english: "Your transaction reference is [DYNAMIC REFERENCE].",
    twi: "Wo transaction reference ne [DYNAMIC REFERENCE].",
  },
  OP52B: {
    category: "completion",
    english: "Your complete transaction reference is [DYNAMIC REFERENCE].",
    twi: "Wo transaction reference a ɛdi mũ ne [DYNAMIC REFERENCE].",
  },
  OP70: {
    category: "clarification",
    english: "I heard [DYNAMIC RESPONSE]. Is that correct?",
    twi: "Mate sɛ [DYNAMIC RESPONSE]. Ɛyɛ nokware anaa?",
  },
};

const PROMPT_ID_TO_KEY: Record<string, string> = {};
for (const [key, id] of Object.entries(PROMPT_KEY_TO_RECORDING_ID)) {
  const normalizedId = id.toUpperCase();
  if (!PROMPT_ID_TO_KEY[normalizedId]) PROMPT_ID_TO_KEY[normalizedId] = key;
}

// ── Build AUDIO_RECORDINGS from reviewed manifests and current asset roots ───
const recordings: AudioRecording[] = [];

// 1. Twi Library Items
for (const item of TWI_AUDIO_LIBRARY_ITEMS) {
  const promptId = PROMPT_KEY_TO_RECORDING_ID[item.key] || null;
  const mimeType = item.filename.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4";
  recordings.push({
    id: `supplied:Twi_library/${item.filename}`,
    promptId,
    state: ((promptId && PROMPT_ID_TO_KEY[promptId]) || item.category).toUpperCase(),
    category: item.category,
    context: item.transcript,
    language: "twi",
    title: item.filename.replace(/\.[a-z0-9]+$/i, ""),
    spokenText: item.transcript,
    relativePath: `Twi_library/${item.filename}`,
    assetRoot: "supplied",
    url: item.audioUrl,
    mimeType,
    isAlternate: false,
    recordingRole: "fixed",
    mappingStatus: "VERIFIED",
  });
}

// 2. Public assets without reviewed transcripts remain unmapped and cannot be
// selected as fixed prompts.
const unmappedAudioAssets: Array<{
  relativePath: string;
  assetRoot: AudioAssetRoot;
  language: RecordingLanguage;
}> = [
  { relativePath: "English_Library/2.m4a", assetRoot: "supplied", language: "en" },
  { relativePath: "English_Library/3.m4a", assetRoot: "supplied", language: "en" },
  { relativePath: "English_Library/4.m4a", assetRoot: "supplied", language: "en" },
  { relativePath: "welcome_en.mp3", assetRoot: "public", language: "en" },
  { relativePath: "welcome_twi.mp3", assetRoot: "public", language: "twi" },
];

for (const asset of unmappedAudioAssets) {
  const title = asset.relativePath.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || asset.relativePath;
  const extension = asset.relativePath.split(".").pop()?.toLowerCase();
  recordings.push({
    id: `${asset.assetRoot}:${asset.relativePath}`,
    promptId: null,
    state: null,
    category: "unmapped",
    context: "",
    language: asset.language,
    title,
    spokenText: null,
    relativePath: asset.relativePath,
    assetRoot: asset.assetRoot,
    url: asset.assetRoot === "public" ? `/audio/${asset.relativePath}` : `/audio/supplied/${asset.relativePath}`,
    mimeType: extension === "mp3" ? "audio/mpeg" : "audio/mp4",
    isAlternate: false,
    recordingRole: "unmapped",
    mappingStatus: "UNMAPPED_CANDIDATE",
  });
}

// 3. Transcript metadata may describe assets that are not present in this
// checkout. Do not expose those paths as playable recordings.
const availablePublicAssets = new Set(unmappedAudioAssets
  .filter((asset) => asset.assetRoot === "public")
  .map((asset) => asset.relativePath));

for (const [pathKey, data] of Object.entries(transcriptLookup)) {
  const relative = pathKey.replace(/^audio\//i, "");
  if (!availablePublicAssets.has(relative)) continue;
  const mimeType = relative.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4";
  const baseName = relative.split("/").pop() || relative;
  let promptId: string | null = null;
  if (/welcome_prompt_01/i.test(baseName)) promptId = "OP01";
  else if (/prompt_02/i.test(baseName)) promptId = "OP06";
  else if (/prompt_03|prompt_04/i.test(baseName)) promptId = "OP07";
  else if (/prompt_05/i.test(baseName)) promptId = "OP08";
  else if (/prompt_06/i.test(baseName)) promptId = "OP18";
  else if (/prompt_07/i.test(baseName)) promptId = "OP25";
  else if (/prompt_08/i.test(baseName)) promptId = "OP34";
  else if (/prompt_09/i.test(baseName)) promptId = "OP48";
  else if (/prompt_10/i.test(baseName)) promptId = "OP53";

  recordings.push({
    id: `public:${relative}`,
    promptId,
    state: (data.step || "GENERAL").toUpperCase(),
    category: data.step || "general",
    context: data.verbatim || "",
    language: "en",
    title: baseName.replace(/\.[a-z0-9]+$/i, ""),
    spokenText: data.verbatim || null,
    relativePath: relative,
    assetRoot: "public",
    url: `/audio/${relative}`,
    mimeType,
    isAlternate: false,
    recordingRole: "fixed",
    mappingStatus: "VERIFIED",
  });
}

export const AUDIO_RECORDINGS: AudioRecording[] = recordings;

// ── Lookups and Accessors ─────────────────────────────────────────────
export function recordingFileExists(recording: AudioRecording): boolean {
  if (typeof window !== "undefined") return true;

  try {
    const fs = typeof require !== "undefined" ? require("fs") : null;
    const path = typeof require !== "undefined" ? require("path") : null;
    if (!fs || !path) return false;

    const root = recording.assetRoot === "public"
      ? path.resolve(process.cwd(), "public", "audio")
      : path.resolve(process.cwd(), "Audio_files");
    const resolved = path.resolve(root, recording.relativePath);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return false;
    return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  } catch {
    return false;
  }
}

export function getRecordingByPromptId(
  promptId: string,
  language: "en" | "twi" = "twi"
): AudioRecording | null {
  const normalizedId = promptId.trim().toUpperCase();
  return AUDIO_RECORDINGS.find(
    (recording) =>
      recording.promptId?.toUpperCase() === normalizedId &&
      recording.language === language &&
      recording.recordingRole === "fixed" &&
      recording.url &&
      recordingFileExists(recording)
  ) || null;
}

export function getRecordingsByPromptId(
  promptId: string,
  language?: "en" | "twi"
): AudioRecording[] {
  const normalizedId = promptId.trim().toUpperCase();
  return AUDIO_RECORDINGS.filter(
    (recording) =>
      recording.promptId?.toUpperCase() === normalizedId &&
      recording.recordingRole === "fixed" &&
      recording.url &&
      recordingFileExists(recording) &&
      (!language || recording.language === language)
  );
}

export function getRecordingByPromptKey(
  key: string,
  language: "en" | "twi" = "twi"
): AudioRecording | null {
  const normalizedKey = key.trim().toLowerCase();
  const promptId = PROMPT_KEY_TO_RECORDING_ID[normalizedKey]
    || (/^OP\d{2}b?$/i.test(key.trim()) ? key.trim().toUpperCase() : undefined);
  if (promptId) {
    const rec = getRecordingByPromptId(promptId, language);
    if (rec) return rec;
  }
  if (language !== "twi") return null;

  // Try direct filename or item key match in Twi items.
  const directItem = TWI_AUDIO_LIBRARY_ITEMS.find(
    (item) =>
      item.key.toLowerCase() === normalizedKey ||
      item.filename.toLowerCase().includes(normalizedKey)
  );
  if (directItem) {
    return AUDIO_RECORDINGS.find(
      (recording) => recording.url === directItem.audioUrl && recordingFileExists(recording)
    ) || null;
  }
  return null;
}

export function getRecordingByPath(relativePath: string): AudioRecording | null {
  const norm = relativePath.replace(/^audio\//i, "").toLowerCase();
  return AUDIO_RECORDINGS.find(
    (recording) => recording.relativePath.toLowerCase() === norm && recordingFileExists(recording)
  ) || null;
}

export function getRecordingByUrl(url: string, preferredLang?: "en" | "twi"): AudioRecording | null {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].trim().toLowerCase();
  const baseName = cleanUrl.split("/").pop() || "";

  const exact = AUDIO_RECORDINGS.filter((r) => {
    if (!r.url || !recordingFileExists(r)) return false;
    const rClean = r.url.split("?")[0].toLowerCase();
    return rClean === cleanUrl || rClean.endsWith(`/${baseName}`);
  });

  if (exact.length > 0) {
    if (preferredLang) {
      const match = exact.find((r) => r.language === preferredLang);
      if (match) return match;
    }
    return exact[0];
  }
  return null;
}

export function getRecordingFilePath(relativePath: string): string | null {
  const norm = relativePath.replace(/^audio\//i, "");
  if (norm.startsWith("Twi_library/")) {
    return `Audio_files/${norm}`;
  }
  if (norm.startsWith("supplied/")) {
    return `Audio_files/${norm.replace(/^supplied\//i, "")}`;
  }
  return `public/audio/${norm}`;
}

export function getAudioAssetInventory(): AudioRecording[] {
  return [...AUDIO_RECORDINGS];
}

export function getPromptManifestEntry(promptId: string): PromptManifestEntry | null {
  const normalizedId = promptId.trim().toUpperCase();
  const dynamic = DYNAMIC_PROMPT_TEXT[normalizedId];
  const rec = getRecordingByPromptId(normalizedId, "twi");
  const enRec = getRecordingByPromptId(normalizedId, "en");
  if (dynamic) {
    return {
      id: normalizedId,
      category: dynamic.category,
      state: (PROMPT_ID_TO_KEY[normalizedId] || "GENERAL").toUpperCase(),
      type: "DYNAMIC",
      english: dynamic.english,
      twi: dynamic.twi,
      audio: {
        english: `/api/audio/prompt-tts/en/${normalizedId}`,
        twi: `/api/audio/prompt-tts/twi/${normalizedId}`,
      },
      mappingStatus: "VERIFIED",
    };
  }
  if (!rec && !enRec) return null;
  return {
    id: normalizedId,
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
  };
}

export function getPromptManifestEntries(): PromptManifestEntry[] {
  const ids = new Set(AUDIO_RECORDINGS.map((recording) => recording.promptId).filter(Boolean) as string[]);
  for (const id of Object.keys(DYNAMIC_PROMPT_TEXT)) {
    ids.add(id);
  }
  return Array.from(ids).map((id) => getPromptManifestEntry(id)).filter(Boolean) as PromptManifestEntry[];
}

export function normalizeRecordingLanguage(language: string): "en" | "twi" | null {
  const normalized = (language || "").trim().toLowerCase();
  if (["en", "eng", "english", "en-us", "en-gh"].includes(normalized)) return "en";
  if (["twi", "tw", "ak", "akan", "ak-gh"].includes(normalized)) return "twi";
  return null;
}
