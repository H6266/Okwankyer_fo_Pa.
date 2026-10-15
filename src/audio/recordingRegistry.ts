import promptManifest from "../../Audio_files/prompts.json";
import canonicalManifestData from "../../Audio_files/TWI_AUDIO_LINK_MANIFEST.json";
import audioTranscripts from "../../audio_transcripts.json";

export type RecordingLanguage = "en" | "twi" | "unresolved";
export type AudioAssetRoot = "supplied" | "public" | "additional";
export type RecordingRole = "fixed" | "dynamic" | "alternative" | "unmapped";

interface PromptManifestEntry {
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

interface PromptManifest {
  prompts: PromptManifestEntry[];
}

interface CanonicalManifestPrompt {
  promptId: string;
  state: string;
  englishScript?: string;
  twiWorkingScript?: string;
  type?: string;
  mappingStatus?: string;
  usePolicy?: string;
}

interface CanonicalManifest {
  canonicalPrompts?: CanonicalManifestPrompt[];
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

const manifest = promptManifest as PromptManifest;
const canonicalManifest = canonicalManifestData as unknown as CanonicalManifest;
const transcriptLookup = audioTranscripts as Record<string, { verbatim?: string; language?: string; step?: string; options?: unknown }>;

const canonicalPromptEntries: PromptManifestEntry[] = (canonicalManifest?.canonicalPrompts ?? []).map((prompt) => ({
  id: prompt.promptId,
  category: prompt.state,
  state: prompt.state,
  type: prompt.type || "FIXED",
  english: prompt.englishScript || "",
  twi: prompt.twiWorkingScript || "",
  audio: {
    english: null,
    twi: null,
    english_other_takes: [],
    twi_other_takes: [],
  },
  mappingStatus: prompt.mappingStatus || "MISSING_OR_UNVERIFIED",
  usePolicy: prompt.usePolicy || "",
}));

const mergedPromptEntries = [...canonicalPromptEntries, ...(manifest.prompts ?? [])];
const promptManifestLookup = new Map<string, PromptManifestEntry>();
for (const prompt of mergedPromptEntries) {
  const existing = promptManifestLookup.get(prompt.id);
  if (!existing) {
    promptManifestLookup.set(prompt.id, prompt);
    continue;
  }
  promptManifestLookup.set(prompt.id, {
    ...existing,
    ...prompt,
    english: prompt.english || existing.english || "",
    twi: prompt.twi || existing.twi || "",
    audio: {
      english: prompt.audio?.english ?? existing.audio?.english ?? null,
      twi: prompt.audio?.twi ?? existing.audio?.twi ?? null,
      english_other_takes: prompt.audio?.english_other_takes?.length ? prompt.audio.english_other_takes : existing.audio?.english_other_takes ?? [],
      twi_other_takes: prompt.audio?.twi_other_takes?.length ? prompt.audio.twi_other_takes : existing.audio?.twi_other_takes ?? [],
    },
  });
}

const suppliedRecordingPaths = [
  "Twi/1.Welcome & Session Start/Acknowledge.m4a",
  "Twi/1.Welcome & Session Start/Language selection.m4a",
  "Twi/1.Welcome & Session Start/Processing.m4a",
  "Twi/1.Welcome & Session Start/Welcome 1 (2).m4a",
  "Twi/1.Welcome & Session Start/Welcome back.m4a",
  "Twi/2.Main Service Navigation/Choose instead.m4a",
  "Twi/2.Main Service Navigation/Main service Unavailable.m4a",
  "Twi/2.Main Service Navigation/MTN menu.m4a",
  "Twi/2.Main Service Navigation/Network selection.m4a",
  "Twi/2.Main Service Navigation/Send money selected.m4a",
  "Twi/2.Main Service Navigation/Service alternative.m4a",
  "Twi/2.Main Service Navigation/Service not ready.m4a",
  "Twi/2.Main Service Navigation/Service selection.m4a",
  "Twi/2.Main Service Navigation/Service unavailable.m4a",
  "Twi/2.Main Service Navigation/Try another service.m4a",
  "Twi/3.Recipient Entry & Verification/Change recipient.m4a",
  "Twi/3.Recipient Entry & Verification/Enter recipient 2.m4a",
  "Twi/3.Recipient Entry & Verification/Invalid recipient 1.m4a",
  "Twi/3.Recipient Entry & Verification/Recipient confirm speech.m4a",
  "Twi/3.Recipient Entry & Verification/Recipient found.m4a",
  "Twi/3.Recipient Entry & Verification/Recipient verify.m4a",
  "Twi/3.Recipient Entry & Verification/Use recipient 1.m4a",
  "Twi/4.Amount Entry & Verification/Amount prompt.m4a",
  "Twi/4.Amount Entry & Verification/Amount readback 2.m4a",
  "Twi/4.Amount Entry & Verification/Amount too high 3.m4a",
  "Twi/4.Amount Entry & Verification/Amount too low.m4a",
  "Twi/4.Amount Entry & Verification/Change amount 2.m4a",
  "Twi/4.Amount Entry & Verification/Enter amount 4.m4a",
  "Twi/4.Amount Entry & Verification/Invalid amount.m4a",
  "Twi/4.Amount Entry & Verification/Repeat amount.m4a",
  "Twi/5.Transaction Confirmation/Confirm continue.m4a",
  "Twi/5.Transaction Confirmation/Confirm speech.m4a",
  "Twi/5.Transaction Confirmation/Confirmation intro.m4a",
  "Twi/5.Transaction Confirmation/Ready submit.m4a",
  "Twi/5.Transaction Confirmation/Reject speech.m4a",
  "Twi/5.Transaction Confirmation/Review transaction.m4a",
] as const;

const suppliedPromptIdByPath: Readonly<Record<string, string>> = {
  "Twi/1.Welcome & Session Start/Acknowledge.m4a": "OP05",
  "Twi/1.Welcome & Session Start/Language selection.m4a": "OP02",
  "Twi/1.Welcome & Session Start/Processing.m4a": "OP06",
  "Twi/1.Welcome & Session Start/Welcome 1 (2).m4a": "OP01",
  "Twi/1.Welcome & Session Start/Welcome back.m4a": "OP04",
  "Twi/2.Main Service Navigation/Choose instead.m4a": "OP15",
  "Twi/2.Main Service Navigation/Main service Unavailable.m4a": "OP11",
  "Twi/2.Main Service Navigation/MTN menu.m4a": "OP09",
  "Twi/2.Main Service Navigation/Network selection.m4a": "OP08",
  "Twi/2.Main Service Navigation/Send money selected.m4a": "OP10",
  "Twi/2.Main Service Navigation/Service alternative.m4a": "OP12",
  "Twi/2.Main Service Navigation/Service not ready.m4a": "OP13",
  "Twi/2.Main Service Navigation/Service selection.m4a": "OP07",
  "Twi/2.Main Service Navigation/Service unavailable.m4a": "OP11",
  "Twi/2.Main Service Navigation/Try another service.m4a": "OP14",
  "Twi/3.Recipient Entry & Verification/Change recipient.m4a": "OP25",
  "Twi/3.Recipient Entry & Verification/Enter recipient 2.m4a": "OP16",
  "Twi/3.Recipient Entry & Verification/Invalid recipient 1.m4a": "OP17",
  "Twi/3.Recipient Entry & Verification/Recipient confirm speech.m4a": "OP23",
  "Twi/3.Recipient Entry & Verification/Recipient found.m4a": "OP18",
  "Twi/3.Recipient Entry & Verification/Recipient verify.m4a": "OP19",
  "Twi/3.Recipient Entry & Verification/Use recipient 1.m4a": "OP24",
  "Twi/4.Amount Entry & Verification/Amount prompt.m4a": "OP28",
  "Twi/4.Amount Entry & Verification/Amount readback 2.m4a": "OP29",
  "Twi/4.Amount Entry & Verification/Amount too high 3.m4a": "OP31",
  "Twi/4.Amount Entry & Verification/Amount too low.m4a": "OP32",
  "Twi/4.Amount Entry & Verification/Change amount 2.m4a": "OP33",
  "Twi/4.Amount Entry & Verification/Enter amount 4.m4a": "OP26",
  "Twi/4.Amount Entry & Verification/Invalid amount.m4a": "OP27",
  "Twi/4.Amount Entry & Verification/Repeat amount.m4a": "OP30",
  "Twi/5.Transaction Confirmation/Confirm continue.m4a": "OP36",
  "Twi/5.Transaction Confirmation/Confirm speech.m4a": "OP37",
  "Twi/5.Transaction Confirmation/Confirmation intro.m4a": "OP34",
  "Twi/5.Transaction Confirmation/Ready submit.m4a": "OP39",
  "Twi/5.Transaction Confirmation/Reject speech.m4a": "OP38",
  "Twi/5.Transaction Confirmation/Review transaction.m4a": "OP35",
};

const additionalUnresolvedFiles = [
  "Another recipient.m4a",
  "Another transaction.m4a",
  "Anything else.m4a",
  "Auth received.m4a",
  "Authorize phone.m4a",
  "Back.m4a",
  "Balance Unavailable.m4a",
  "Cancel.m4a",
  "Check final status.m4a",
  "Check messages.m4a",
  "Check phone.m4a",
  "Confirm understanding.m4a",
  "Continue.m4a",
  "Correct prompt.m4a",
  "Customer Declined.m4a",
  "Did not get.m4a",
  "Exit.m4a",
  "Failed.m4a",
  "Failure Retry.m4a",
  "Finish.m4a",
  "Help command.m4a",
  "Help.m4a",
  "Input not recognized.m4a",
  "Keep reference.m4a",
  "Keypad option.m4a",
  "Main menu.m4a",
  "No transfer confirmed.m4a",
  "Not understood.m4a",
  "Pin Block.m4a",
  "Pin Handoff.m4a",
  "Please respond.m4a",
  "Post success Help.m4a",
  "Processing.m4a",
  "Repeat Option.m4a",
  "Repeat.m4a",
  "Restart.m4a",
  "Secure pin.m4a",
  "Security warning.m4a",
  "Sensitive Block.m4a",
  "Session End.m4a",
  "Session timeout.m4a",
  "Start Again.m4a",
  "Submitted.m4a",
  "Success close.m4a",
  "Success sent.m4a",
  "Success.m4a",
  "System Error.m4a",
  "Take your time.m4a",
  "Timeout.m4a",
  "Unsupported service.m4a",
  "Voice or keypad.m4a",
  "Waiting confirmation.m4a",
  "Yes -No.m4a",
  "Yes -no- keypad.m4a",
] as const;

function encodePath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function createRecording(
  relativePath: string,
  assetRoot: AudioAssetRoot,
  language: RecordingLanguage,
  prompt?: PromptManifestEntry,
  isAlternate = false
): AudioRecording {
  const fileName = relativePath.split("/").pop() || relativePath;
  const promptId = prompt?.id || null;
  const languageText = language === "en" ? prompt?.english : language === "twi" ? prompt?.twi : null;
  const transcriptText = transcriptLookup[`audio/${relativePath}`]?.verbatim || transcriptLookup[relativePath]?.verbatim || null;
  const publicUrl = language === "unresolved"
    ? null
    : assetRoot === "public"
      ? `/audio/${encodePath(relativePath)}`
      : assetRoot === "supplied"
        ? `/audio/supplied/${encodePath(relativePath)}`
        : assetRoot === "additional"
          ? `/audio/additional/${encodePath(relativePath)}`
          : null;

  return {
    id: `${assetRoot}:${relativePath}`,
    promptId,
    state: prompt?.state || null,
    category: prompt?.category || relativePath.split("/")[0] || "Uncategorized",
    context: prompt ? `${prompt.category}:${prompt.state}` : "Audio asset",
    language,
    title: prompt?.state.replaceAll("_", " ") || fileName.replace(/\.(m4a|mp3)$/i, ""),
    spokenText: languageText || transcriptText || null,
    relativePath,
    assetRoot,
    url: publicUrl,
    mimeType: /\.m4a$/i.test(relativePath)
      ? "audio/mp4"
      : /\.aac$/i.test(relativePath)
        ? "audio/aac"
        : "audio/mpeg",
    isAlternate,
    mappingStatus: prompt?.mappingStatus || "CANDIDATE_NOT_AUDIO_VERIFIED",
    recordingRole: isAlternate
      ? "alternative"
      : prompt?.type?.toUpperCase() === "DYNAMIC"
        ? "dynamic"
        : prompt
          ? "fixed"
          : "unmapped",
  };
}

const suppliedRecordings = suppliedRecordingPaths.map((relativePath) => {
  const promptId = suppliedPromptIdByPath[relativePath];
  const prompt = promptId ? promptManifestLookup.get(promptId) || undefined : undefined;
  return createRecording(relativePath, "supplied", "twi", prompt);
});

// Strictly use only the general welcome from the other source (public/audio)
const publicWelcomeRecordings: AudioRecording[] = [
  {
    id: "public:Welcome_prompt_01.mp3",
    promptId: "OP01",
    state: "WELCOME",
    category: "01_Welcome_Session_Start",
    context: "01_Welcome_Session_Start:WELCOME",
    language: "en",
    title: "General Welcome & Language Selection",
    spokenText: "Welcome to Okwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.",
    relativePath: "Welcome_prompt_01.mp3",
    assetRoot: "public",
    url: "/audio/Welcome_prompt_01.mp3",
    mimeType: "audio/mpeg",
    isAlternate: false,
    recordingRole: "fixed",
    mappingStatus: "AMBIGUOUS_COMBINED_WELCOME_LANGUAGE_PROMPT",
  },
  {
    id: "public:welcome_prompt_01.mp3",
    promptId: "OP01",
    state: "WELCOME",
    category: "01_Welcome_Session_Start",
    context: "01_Welcome_Session_Start:WELCOME",
    language: "en",
    title: "General Welcome & Language Selection (Lowercase)",
    spokenText: "Welcome to Okwankyerɛfo Pa, an easy financial transaction service. For English, press 1. For Twi, press 2.",
    relativePath: "welcome_prompt_01.mp3",
    assetRoot: "public",
    url: "/audio/welcome_prompt_01.mp3",
    mimeType: "audio/mpeg",
    isAlternate: true,
    recordingRole: "alternative",
    mappingStatus: "AMBIGUOUS_COMBINED_WELCOME_LANGUAGE_PROMPT",
  },
];

export const ADDITIONAL_FILE_TO_PROMPT_MAP: Record<string, { promptId: string; language: "twi" | "en"; state: string }> = {
  "Cancel.m4a": { promptId: "OP76", language: "twi", state: "CANCEL" },
  "Exit.m4a": { promptId: "OP77", language: "twi", state: "EXIT" },
  "Pin Handoff.m4a": { promptId: "OP40", language: "twi", state: "PIN_HANDOFF" },
  "Security warning.m4a": { promptId: "OP41", language: "twi", state: "SECURITY_WARNING" },
  "Secure pin.m4a": { promptId: "OP42", language: "twi", state: "SECURE_PIN" },
  "Pin Block.m4a": { promptId: "OP43", language: "twi", state: "PIN_BLOCK" },
  "Sensitive Block.m4a": { promptId: "OP44", language: "twi", state: "SENSITIVE_BLOCK" },
  "Submitted.m4a": { promptId: "OP45", language: "twi", state: "SUBMITTED" },
  "Waiting confirmation.m4a": { promptId: "OP46", language: "twi", state: "WAITING_CONFIRMATION" },
  "Check phone.m4a": { promptId: "OP47", language: "twi", state: "CHECK_PHONE" },
  "Authorize phone.m4a": { promptId: "OP48", language: "twi", state: "AUTHORIZE_PHONE" },
  "Auth received.m4a": { promptId: "OP49", language: "twi", state: "AUTH_RECEIVED" },
  "Check final status.m4a": { promptId: "OP50", language: "twi", state: "CHECK_FINAL_STATUS" },
  "Processing.m4a": { promptId: "OP51", language: "twi", state: "PROCESSING" },
  "Success sent.m4a": { promptId: "OP53", language: "twi", state: "SUCCESS_SENT" },
  "Success.m4a": { promptId: "OP53", language: "twi", state: "SUCCESS_SENT" },
  "Keep reference.m4a": { promptId: "OP54", language: "twi", state: "KEEP_REFERENCE" },
  "Success close.m4a": { promptId: "OP55", language: "twi", state: "SUCCESS_CLOSE" },
  "Anything else.m4a": { promptId: "OP56", language: "twi", state: "ANYTHING_ELSE" },
  "Customer Declined.m4a": { promptId: "OP57", language: "twi", state: "CUSTOMER_DECLINED" },
  "Failed.m4a": { promptId: "OP58", language: "twi", state: "FAILED" },
  "Timeout.m4a": { promptId: "OP59", language: "twi", state: "TIMEOUT" },
  "Failure Retry.m4a": { promptId: "OP60", language: "twi", state: "FAILURE_RETRY" },
  "No transfer confirmed.m4a": { promptId: "OP61", language: "twi", state: "NO_TRANSFER_CONFIRMED" },
  "Check messages.m4a": { promptId: "OP62", language: "twi", state: "CHECK_MESSAGES" },
  "Start Again.m4a": { promptId: "OP63", language: "twi", state: "START_AGAIN" },
  "Not understood.m4a": { promptId: "OP64", language: "twi", state: "NOT_UNDERSTOOD" },
  "Did not get.m4a": { promptId: "OP65", language: "twi", state: "DID_NOT_GET" },
  "Please respond.m4a": { promptId: "OP67", language: "twi", state: "PLEASE_RESPOND" },
  "Input not recognized.m4a": { promptId: "OP68", language: "twi", state: "INPUT_NOT_RECOGNIZED" },
  "Repeat.m4a": { promptId: "OP69", language: "twi", state: "REPEAT" },
  "Confirm understanding.m4a": { promptId: "OP70", language: "twi", state: "CONFIRM_UNDERSTANDING" },
  "Correct prompt.m4a": { promptId: "OP71", language: "twi", state: "CORRECT_PROMPT" },
  "Yes -No.m4a": { promptId: "OP72", language: "twi", state: "YES_NO" },
  "Back.m4a": { promptId: "OP73", language: "twi", state: "BACK" },
  "Main menu.m4a": { promptId: "OP74", language: "twi", state: "MAIN_MENU" },
  "Restart.m4a": { promptId: "OP75", language: "twi", state: "RESTART" },
  "Session End.m4a": { promptId: "OP78", language: "twi", state: "SESSION_END" },
  "Continue.m4a": { promptId: "OP79", language: "twi", state: "CONTINUE" },
  "Session timeout.m4a": { promptId: "OP80", language: "twi", state: "SESSION_TIMEOUT" },
  "Repeat Option.m4a": { promptId: "OP81", language: "twi", state: "REPEAT_OPTIONS" },
  "Keypad option.m4a": { promptId: "OP82", language: "twi", state: "KEYPAD_OPTION" },
  "Voice or keypad.m4a": { promptId: "OP83", language: "twi", state: "VOICE_OR_KEYPAD" },
  "Take your time.m4a": { promptId: "OP84", language: "twi", state: "TAKE_YOUR_TIME" },
  "Yes -no- keypad.m4a": { promptId: "OP85", language: "twi", state: "YES_NO_KEYPAD" },
  "Help.m4a": { promptId: "OP86", language: "twi", state: "HELP" },
  "Help command.m4a": { promptId: "OP87", language: "twi", state: "HELP_COMMANDS" },
  "Balance Unavailable.m4a": { promptId: "OP88", language: "twi", state: "BALANCE_UNAVAILABLE" },
  "Unsupported service.m4a": { promptId: "OP89", language: "twi", state: "UNSUPPORTED_SERVICE" },
  "System Error.m4a": { promptId: "OP90", language: "twi", state: "SYSTEM_ERROR" },
  "Post success Help.m4a": { promptId: "OP91", language: "twi", state: "POST_SUCCESS_HELP" },
  "Another transaction.m4a": { promptId: "OP92", language: "twi", state: "ANOTHER_TRANSACTION" },
  "Another recipient.m4a": { promptId: "OP93", language: "twi", state: "ANOTHER_RECIPIENT" },
  "Finish.m4a": { promptId: "OP94", language: "twi", state: "FINISH" },
};

const additionalRecordings = additionalUnresolvedFiles.map((relativePath) => {
  const mapping = ADDITIONAL_FILE_TO_PROMPT_MAP[relativePath];
  const prompt = mapping ? promptManifestLookup.get(mapping.promptId) : undefined;
  const isAlternate = mapping ? Boolean(prompt && prompt.audio?.twi && !prompt.audio.twi.includes(relativePath)) : false;
  return createRecording(
    relativePath,
    "additional",
    mapping ? mapping.language : "twi",
    prompt,
    isAlternate
  );
});

export const AUDIO_RECORDINGS: AudioRecording[] = [
  ...suppliedRecordings,
  ...additionalRecordings,
  ...publicWelcomeRecordings,
];

export const PROMPT_KEY_TO_RECORDING_ID: Readonly<Record<string, string>> = {
  welcome: "OP01",
  language_selection: "OP02",
  service_select: "OP07",
  supported_service_select: "OP07",
  provider_select: "OP08",
  provider_select_alt: "OP08",
  mtn_network_select: "OP08",
  action_select: "OP09",
  send_money_menu: "OP09",
  send_money_selected: "OP10",
  service_unavailable: "OP11",
  service_alternative: "OP12",
  service_not_ready: "OP13",
  try_another_service: "OP14",
  choose_instead: "OP15",
  enter_recipient: "OP16",
  intent_understood_ask_number: "OP16",
  invalid_recipient: "OP17",
  recipient_found: "OP18",
  recipient_verify: "OP19",
  recipient_name: "OP20",
  recipient_full_number: "OP21",
  recipient_last4: "OP21", // Backward-compatibility alias, redirects to full-number semantics
  recipient_confirm: "OP22",
  recipient_confirm_speech: "OP23",
  use_recipient: "OP24",
  change_recipient: "OP25",
  enter_amount: "OP26",
  intent_understood_ask_amount: "OP26",
  intent_understood_proceed: "OP34",
  invalid_amount: "OP27",
  amount_prompt: "OP28",
  amount_readback: "OP29",
  repeat_amount: "OP30",
  amount_too_high: "OP31",
  amount_too_low: "OP32",
  change_amount: "OP33",
  confirmation_intro: "OP34",
  review_transaction: "OP35",
  confirm_continue: "OP36",
  confirm_speech: "OP37",
  reject_speech: "OP38",
  ready_submit: "OP39",
  pin_handoff: "OP40",
  security_warning: "OP41",
  secure_pin: "OP42",
  pin_block: "OP43",
  sensitive_block: "OP44",
  submitted: "OP45",
  waiting_confirmation: "OP46",
  check_phone: "OP47",
  authorize_phone: "OP48",
  authorization_received: "OP49",
  check_final_status: "OP50",
  processing: "OP51",
  success_reference: "OP52",
  success: "OP53",
  keep_reference: "OP54",
  success_close: "OP55",
  anything_else: "OP56",
  customer_declined: "OP57",
  failed: "OP58",
  timeout: "OP59",
  failure_retry: "OP60",
  no_transfer_confirmed: "OP61",
  check_messages: "OP62",
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
  keypad_option: "OP82",
  voice_or_keypad: "OP83",
  take_your_time: "OP84",
  yes_no_keypad: "OP85",
  help: "OP86",
  help_commands: "OP87",
  balance_unavailable: "OP88",
  unsupported_service: "OP89",
  system_error: "OP90",
  post_success_help: "OP91",
  another_transaction: "OP92",
  another_recipient: "OP93",
  finish: "OP94",
};

export function getRecordingByPromptId(
  promptId: string,
  language: "en" | "twi" = "twi"
): AudioRecording | null {
  const prompt = promptManifestLookup.get(promptId);
  if (prompt?.type.toUpperCase() === "DYNAMIC") return null;
  const matches = AUDIO_RECORDINGS.filter((recording) =>
    recording.promptId === promptId &&
    recording.language === language &&
    recording.url &&
    recording.mappingStatus === "VERIFIED" &&
    recording.recordingRole === "fixed"
  );
  return matches.length === 1 ? matches[0] : null;
}

export function getRecordingsByPromptId(promptId: string, language?: "en" | "twi"): AudioRecording[] {
  return AUDIO_RECORDINGS.filter((recording) =>
    recording.promptId === promptId &&
    recording.url !== null &&
    (language === undefined || recording.language === language)
  );
}

export function getRecordingByPromptKey(
  key: string,
  language: "en" | "twi" = "twi"
): AudioRecording | null {
  const promptId = PROMPT_KEY_TO_RECORDING_ID[key] || (/^OP\d{2}$/i.test(key) ? key.toUpperCase() : undefined);
  return promptId ? getRecordingByPromptId(promptId, language) : null;
}

export function getRecordingByPath(relativePath: string): AudioRecording | null {
  return AUDIO_RECORDINGS.find((recording) => recording.relativePath === relativePath) || null;
}

export function getRecordingByUrl(url: string): AudioRecording | null {
  if (!url) return null;
  const decodedTarget = decodeURIComponent(url).replace(/^\/+/, "").replace(/^audio\//i, "").toLowerCase();
  return (
    AUDIO_RECORDINGS.find((recording) => {
      if (!recording.url) return false;
      if (recording.url === url) return true;
      const decodedRec = decodeURIComponent(recording.url).replace(/^\/+/, "").replace(/^audio\//i, "").toLowerCase();
      if (decodedRec === decodedTarget) return true;
      const baseRec = decodedRec.split("/").pop() || "";
      const baseTarget = decodedTarget.split("/").pop() || "";
      return baseRec.length > 0 && baseRec === baseTarget;
    }) || null
  );
}

export function getRecordingFilePath(relativePath: string): string | null {
  const recording = getRecordingByPath(relativePath);
  if (!recording) {
    if (/welcome_prompt_01\.mp3$/i.test(relativePath)) {
      return `public/audio/Welcome_prompt_01.mp3`;
    }
    return null;
  }
  if (recording.assetRoot === "supplied") {
    return `Audio_files/${recording.relativePath}`;
  }
  if (recording.assetRoot === "additional") {
    return `Audio_files/${recording.relativePath}`;
  }
  if (recording.assetRoot === "public") {
    return `public/audio/${recording.relativePath}`;
  }
  return null;
}

export function getAudioAssetInventory(): AudioRecording[] {
  return [...AUDIO_RECORDINGS];
}

export function getPromptManifestEntry(promptId: string): PromptManifestEntry | null {
  return promptManifestLookup.get(promptId) || null;
}

export function getPromptManifestEntries(): PromptManifestEntry[] {
  return Array.from(promptManifestLookup.values());
}

export function normalizeRecordingLanguage(language: string): "en" | "twi" | null {
  const normalized = language.trim().toLowerCase();
  if (["en", "eng", "english", "en-us", "en-gh"].includes(normalized)) return "en";
  if (["twi", "tw", "ak", "akan", "ak-gh"].includes(normalized)) return "twi";
  return null;
}
