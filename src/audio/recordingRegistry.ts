import promptManifest from "../../Audio_files/prompts.json";

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
}

interface PromptManifest {
  prompts: PromptManifestEntry[];
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
}

const manifest = promptManifest as PromptManifest;

const suppliedRecordingPaths = [
  "Twi/01_Welcome_Session_Start/Acknowledge.m4a",
  "Twi/01_Welcome_Session_Start/Language selection.m4a",
  "Twi/01_Welcome_Session_Start/Processing.m4a",
  "Twi/01_Welcome_Session_Start/Welcome 1.m4a",
  "Twi/01_Welcome_Session_Start/Welcome back.m4a",
  "Twi/01_Welcome_Session_Start/what do you want to do.m4a",
  "Twi/02_Main_Service_Navigation/Choose instead.m4a",
  "Twi/02_Main_Service_Navigation/Main service Unavailable.m4a",
  "Twi/02_Main_Service_Navigation/MTN menu.m4a",
  "Twi/02_Main_Service_Navigation/Network selection.m4a",
  "Twi/02_Main_Service_Navigation/Send money selected.m4a",
  "Twi/02_Main_Service_Navigation/Service alternative.m4a",
  "Twi/02_Main_Service_Navigation/Service not ready.m4a",
  "Twi/02_Main_Service_Navigation/Service selection.m4a",
  "Twi/02_Main_Service_Navigation/Service unavailable.m4a",
  "Twi/02_Main_Service_Navigation/Try another service.m4a",
  "Twi/03_Recipient_Entry_Verification/Change recipient.m4a",
  "Twi/03_Recipient_Entry_Verification/Enter recipient.m4a",
  "Twi/03_Recipient_Entry_Verification/Invalid recipient.m4a",
  "Twi/03_Recipient_Entry_Verification/Recipient confirm.m4a",
  "Twi/03_Recipient_Entry_Verification/Recipient found.m4a",
  "Twi/03_Recipient_Entry_Verification/Recipient last 4.m4a",
  "Twi/03_Recipient_Entry_Verification/Recipient name.m4a",
  "Twi/03_Recipient_Entry_Verification/Recipient verification.m4a",
  "Twi/03_Recipient_Entry_Verification/Recipient verify.m4a",
  "Twi/03_Recipient_Entry_Verification/Use recipient.m4a",
  "Twi/04_Amount_Entry_Verification/Amount prompt.m4a",
  "Twi/04_Amount_Entry_Verification/Amount read back.m4a",
  "Twi/04_Amount_Entry_Verification/Amount readback.m4a",
  "Twi/04_Amount_Entry_Verification/Amount too high.m4a",
  "Twi/04_Amount_Entry_Verification/Amount too low.m4a",
  "Twi/04_Amount_Entry_Verification/Change amount.m4a",
  "Twi/04_Amount_Entry_Verification/Enter amount.m4a",
  "Twi/04_Amount_Entry_Verification/Invalid amount.m4a",
  "Twi/04_Amount_Entry_Verification/Repeat amount.m4a",
  "Twi/05_Transaction_Confirmation/Confirm speech.m4a",
  "Twi/05_Transaction_Confirmation/Confirmation intro.m4a",
  "Twi/05_Transaction_Confirmation/Ready submit.m4a",
  "Twi/05_Transaction_Confirmation/Reject speech.m4a",
  "Twi/05_Transaction_Confirmation/Review transaction.m4a",
] as const;

const legacyLanguageRecordingPaths = [
  "English/Welcome_prompt_01.mp3",
  "English/welcome_prompt_01.mp3",
  ...Array.from({ length: 12 }, (_, index) => `English/Audio_prompt_${String(index + 2).padStart(2, "0")}.mp3`),
  "Twi/Welcome_prompt_01.mp3",
  "Twi/welcome_prompt_01.mp3",
  ...Array.from({ length: 11 }, (_, index) => `Twi/Audio_prompt_twi_${String(index + 2).padStart(2, "0")}.mp3`),
] as const;

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

const manifestEntryByPath = new Map<string, PromptManifestEntry>();
for (const prompt of manifest.prompts) {
  for (const lang of ["english", "twi"] as const) {
    const primary = prompt.audio?.[lang];
    if (primary) manifestEntryByPath.set(primary.replace(/^audio\//, ""), prompt);
    for (const alternate of prompt.audio?.[`${lang}_other_takes`] || []) {
      manifestEntryByPath.set(alternate.replace(/^audio\//, ""), prompt);
    }
  }
}

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
  const legacyPromptId = assetRoot === "public" && language !== "unresolved"
    ? fileName.match(/(?:Welcome_prompt_|Audio_prompt_(?:twi_)?)(\d{2})/i)?.[1]
    : undefined;
  const promptId = prompt?.id || (legacyPromptId ? `OP${legacyPromptId}` : null);
  const languageText = language === "en" ? prompt?.english : language === "twi" ? prompt?.twi : null;
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
    context: prompt ? `${prompt.category}:${prompt.state}` : "Unresolved asset identity",
    language,
    title: prompt?.state.replaceAll("_", " ") || fileName.replace(/\.(m4a|mp3)$/i, ""),
    spokenText: languageText || null,
    relativePath,
    assetRoot,
    url: publicUrl,
    mimeType: /\.m4a$/i.test(relativePath) ? "audio/mp4" : "audio/mpeg",
    isAlternate,
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
  const prompt = manifestEntryByPath.get(relativePath);
  const isAlternate = Boolean(prompt && prompt.audio.twi !== `audio/${relativePath}`);
  return createRecording(relativePath, "supplied", "twi", prompt, isAlternate);
});

const legacyRecordings = legacyLanguageRecordingPaths.map((relativePath) => {
  const language = relativePath.startsWith("English/") ? "en" : "twi";
  const prompt = manifest.prompts.find((entry) => entry.id === `OP${relativePath.match(/\d{2}/)?.[0]}`);
  const isAlternate = relativePath.endsWith("welcome_prompt_01.mp3") ||
    (language === "twi" && suppliedRecordings.some((recording) =>
      recording.promptId === prompt?.id && !recording.isAlternate
    ));
  return createRecording(relativePath, "public", language, prompt, isAlternate);
});

const unresolvedPublicRecordings = [
  createRecording("Welcome_prompt_01.mp3", "public", "unresolved"),
  createRecording("welcome_prompt_01.mp3", "public", "unresolved", undefined, true),
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

const resolvedAdditionalRecordings = additionalUnresolvedFiles.map((relativePath) => {
  return createRecording(relativePath, "additional", "unresolved");
});

export const AUDIO_RECORDINGS: AudioRecording[] = [
  ...suppliedRecordings,
  ...legacyRecordings,
  ...unresolvedPublicRecordings,
  ...resolvedAdditionalRecordings,
];

export const PROMPT_KEY_TO_RECORDING_ID: Readonly<Record<string, string>> = {
  welcome: "OP01",
  language_selection: "OP02",
  service_select: "OP07",
  provider_select: "OP08",
  provider_select_alt: "OP08",
  action_select: "OP09",
  send_money_selected: "OP10",
  service_unavailable: "OP11",
  service_alternative: "OP12",
  service_not_ready: "OP13",
  try_another_service: "OP14",
  choose_instead: "OP15",
  enter_recipient: "OP16",
  invalid_recipient: "OP17",
  recipient_found: "OP18",
  recipient_verify: "OP19",
  recipient_name: "OP20",
  recipient_last4: "OP21",
  recipient_confirm: "OP22",
  recipient_confirm_speech: "OP23",
  use_recipient: "OP24",
  change_recipient: "OP25",
  enter_amount: "OP26",
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

function recordingRank(recording: AudioRecording): number {
  if (recording.assetRoot === "supplied" && !recording.isAlternate) return 0;
  if (recording.assetRoot === "public" && !recording.isAlternate) return 1;
  if (recording.assetRoot === "supplied") return 2;
  return 3;
}

export function getRecordingByPromptId(
  promptId: string,
  language: "en" | "twi" = "twi"
): AudioRecording | null {
  return AUDIO_RECORDINGS
    .filter((recording) => recording.promptId === promptId && recording.language === language && recording.url)
    .sort((a, b) => recordingRank(a) - recordingRank(b))[0] || null;
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
  return AUDIO_RECORDINGS.find((recording) => recording.url === url) || null;
}

export function getRecordingFilePath(relativePath: string): string | null {
  const recording = getRecordingByPath(relativePath);
  if (!recording) return null;
  if (recording.assetRoot === "supplied") {
    return `Audio_files/audio/${recording.relativePath}`;
  }
  if (recording.assetRoot === "additional") {
    return `Audio_files_2/${recording.relativePath}`;
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
  return manifest.prompts.find((prompt) => prompt.id === promptId) || null;
}

export function getPromptManifestEntries(): PromptManifestEntry[] {
  return [...manifest.prompts];
}

export function normalizeRecordingLanguage(language: string): "en" | "twi" | null {
  const normalized = language.trim().toLowerCase();
  if (["en", "eng", "english", "en-us", "en-gh"].includes(normalized)) return "en";
  if (["twi", "tw", "ak", "akan", "ak-gh"].includes(normalized)) return "twi";
  return null;
}
