import promptManifest from "../../Audio_files/prompts.json";

export type RecordingLanguage = "twi";

interface PromptManifestEntry {
  id: string;
  category: string;
  state: string;
  type: string;
  english: string;
  twi: string;
  audio: {
    twi?: string | null;
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
  url: string;
  mimeType: "audio/mp4";
}

const manifest = promptManifest as PromptManifest;

const availableRecordingPaths = [
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

const manifestEntryByPath = new Map<string, PromptManifestEntry>();
for (const prompt of manifest.prompts) {
  if (prompt.audio?.twi) manifestEntryByPath.set(prompt.audio.twi.slice("audio/".length), prompt);
  for (const alternate of prompt.audio?.twi_other_takes || []) {
    manifestEntryByPath.set(alternate.slice("audio/".length), prompt);
  }
}

function encodePath(path: string): string {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function createRecording(relativePath: string): AudioRecording {
  const prompt = manifestEntryByPath.get(relativePath);
  const category = relativePath.split("/")[1] || "Uncategorized";
  const fileName = relativePath.split("/").pop() || relativePath;
  const promptId = prompt?.id || null;
  const context = prompt ? `${prompt.category}:${prompt.state}` : category;

  return {
    id: promptId || `unmapped:${relativePath}`,
    promptId,
    state: prompt?.state || null,
    category: prompt?.category || category,
    context,
    language: "twi",
    title: prompt?.state.replaceAll("_", " ") || fileName.replace(/\.m4a$/i, ""),
    spokenText: prompt?.twi || null,
    relativePath,
    url: `/audio/supplied/${encodePath(relativePath)}`,
    mimeType: "audio/mp4",
  };
}

export const AUDIO_RECORDINGS: AudioRecording[] = availableRecordingPaths.map(createRecording);

export const PROMPT_KEY_TO_RECORDING_ID: Readonly<Record<string, string>> = {
  welcome: "OP01",
  language_selection: "OP02",
  service_select: "OP07",
  provider_select: "OP08",
  provider_select_alt: "OP08",
  action_select: "OP09",
  enter_recipient: "OP16",
  invalid_recipient: "OP17",
  recipient_found: "OP18",
  recipient_verify: "OP19",
  recipient_name: "OP20",
  recipient_last4: "OP21",
  recipient_confirm: "OP22",
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
  confirm_speech: "OP37",
  reject_speech: "OP38",
  ready_submit: "OP39",
};

const recordingByPromptId = new Map(
  AUDIO_RECORDINGS.filter((recording) => recording.promptId).map((recording) => [
    recording.promptId!,
    recording,
  ])
);

const recordingByPath = new Map(AUDIO_RECORDINGS.map((recording) => [recording.relativePath, recording]));

export function getRecordingByPromptId(promptId: string): AudioRecording | null {
  return recordingByPromptId.get(promptId) || null;
}

export function getRecordingByPromptKey(key: string): AudioRecording | null {
  const promptId = PROMPT_KEY_TO_RECORDING_ID[key];
  return promptId ? getRecordingByPromptId(promptId) : null;
}

export function getRecordingByPath(relativePath: string): AudioRecording | null {
  return recordingByPath.get(relativePath) || null;
}

export function getRecordingByUrl(url: string): AudioRecording | null {
  return AUDIO_RECORDINGS.find((recording) => recording.url === url) || null;
}

export function getRecordingFilePath(relativePath: string): string | null {
  return recordingByPath.has(relativePath) ? `Audio_files/audio/${relativePath}` : null;
}
