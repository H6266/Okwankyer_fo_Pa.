import audioTranscripts from "../../audio_transcripts.json";
import { CANONICAL_IVR_CATEGORIES } from "./twiSequentialAudioFlow";

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

const transcriptLookup: Record<string, { verbatim?: string; language?: string; step?: string; options?: unknown }> = {
  ...(audioTranscripts as Record<string, { verbatim?: string; language?: string; step?: string; options?: unknown }>),
};

// Enrich transcript lookup with local transcriped_twi_audio_library.txt entries
try {
  const fs = require("node:fs");
  const path = require("node:path");
  const localTranscriptPath = path.resolve(process.cwd(), "Audio_files", "Twi_library", "transcriped_twi_audio_library.txt");
  if (fs.existsSync(localTranscriptPath)) {
    const rawContent = fs.readFileSync(localTranscriptPath, "utf8");
    for (const line of rawContent.split("\n")) {
      const match = line.match(/^\s*([^:\r\n]+?)\s*:\s*["'](.*?)["'],?\s*$/);
      if (match) {
        const key = match[1].trim();
        const text = match[2].trim();
        const base = key.replace(/\.(m4a|mp3|aac|wav|pm3)$/i, "").toLowerCase();
        transcriptLookup[key] = { verbatim: text, language: "twi" };
        transcriptLookup[`audio/${key}`] = { verbatim: text, language: "twi" };
        transcriptLookup[`audio/supplied/${key}`] = { verbatim: text, language: "twi" };
        transcriptLookup[`audio/Twi_library/${key}`] = { verbatim: text, language: "twi" };
        transcriptLookup[base] = { verbatim: text, language: "twi" };
      }
    }
  }
} catch {}

// Build authoritative prompt manifest lookup directly from canonical categories (no external prompts.json needed)
const promptManifestLookup = new Map<string, PromptManifestEntry>();
for (const cat of CANONICAL_IVR_CATEGORIES) {
  for (const item of cat.prompts) {
    promptManifestLookup.set(item.promptId, {
      id: item.promptId,
      category: item.categoryName,
      state: item.state,
      type: item.isDynamic ? "DYNAMIC" : "FIXED",
      english: item.spokenTextEn || "",
      twi: item.spokenTextTwi || "",
      audio: {
        english: null,
        twi: item.audioUrl || null,
        english_other_takes: [],
        twi_other_takes: item.fallbackAudioUrl ? [item.fallbackAudioUrl] : [],
      },
      mappingStatus: "VERIFIED",
      usePolicy: "CANONICAL",
    });
  }
}

const suppliedRecordingPaths = [
  // 1. Welcome & Session Start
  "Twi/1.Welcome & Session Start/Welcome 1 (2).mp3",
  "Twi/1.Welcome & Session Start/Language selection.mp3",
  "Twi/1.Welcome & Session Start/Greetings 2.mp3",
  "Twi/1.Welcome & Session Start/Welcome back.mp3",
  "Twi/1.Welcome & Session Start/Acknowledge.mp3",
  "Twi/1.Welcome & Session Start/Processing.mp3",

  // 2. Main Service Navigation
  "Twi/2.Main Service Navigation/Service selection.mp3",
  "Twi/2.Main Service Navigation/Service selection 2.mp3",
  "Twi/2.Main Service Navigation/Service selection 2 (2).mp3",
  "Twi/2.Main Service Navigation/Network selection.mp3",
  "Twi/2.Main Service Navigation/Network selection 2.mp3",
  "Twi/2.Main Service Navigation/MTN menu.mp3",
  "Twi/2.Main Service Navigation/MTN menu 1.mp3",
  "Twi/2.Main Service Navigation/Send money selected.mp3",
  "Twi/2.Main Service Navigation/Service unavailable.mp3",
  "Twi/2.Main Service Navigation/Service unavailable 1.mp3",
  "Twi/2.Main Service Navigation/Main service Unavailable.mp3",
  "Twi/2.Main Service Navigation/Service alternative.mp3",
  "Twi/2.Main Service Navigation/Service not ready.mp3",
  "Twi/2.Main Service Navigation/Try another service.mp3",
  "Twi/2.Main Service Navigation/Choose instead.mp3",
  "Twi/service_description.mp3",

  // 3. Recipient Entry & Verification
  "Twi/3.Recipient Entry & Verification/Enter recipient 2.mp3",
  "Twi/3.Recipient Entry & Verification/Invalid recipient 1.mp3",
  "Twi/3.Recipient Entry & Verification/Recipient found.mp3",
  "Twi/3.Recipient Entry & Verification/Recipient verify.mp3",
  "Twi/3.Recipient Entry & Verification/Recipient confirm speech.mp3",
  "Twi/3.Recipient Entry & Verification/Use recipient 1.mp3",
  "Twi/3.Recipient Entry & Verification/Change recipient.mp3",

  // 4. Amount Entry & Verification
  "Twi/4.Amount Entry & Verification/Enter amount 4.mp3",
  "Twi/4.Amount Entry & Verification/Invalid amount.mp3",
  "Twi/4.Amount Entry & Verification/Amount prompt.mp3",
  "Twi/4.Amount Entry & Verification/Amount readback 2.mp3",
  "Twi/4.Amount Entry & Verification/Repeat amount.mp3",
  "Twi/4.Amount Entry & Verification/Amount too high 3.mp3",
  "Twi/4.Amount Entry & Verification/Amount too low.mp3",
  "Twi/4.Amount Entry & Verification/Change amount 2.mp3",

  // 5. Transaction Confirmation
  "Twi/5.Transaction Confirmation/Confirmation intro.mp3",
  "Twi/5.Transaction Confirmation/Review transaction.mp3",
  "Twi/5.Transaction Confirmation/Confirm continue.mp3",
  "Twi/5.Transaction Confirmation/Confirm continue 1.mp3",
  "Twi/5.Transaction Confirmation/Confirm speech.mp3",
  "Twi/5.Transaction Confirmation/Reject speech.mp3",
  "Twi/5.Transaction Confirmation/Ready submit.mp3",
  "Twi/5.Transaction Confirmation/Ready submit 2.mp3",

  // 6. PIN & Security
  "Twi/6.PIN & Security/Pin block.aac",
  "Twi/6.PIN & Security/Sensitive block.aac",

  // 7. Transaction Processing
  "Twi/7.Transaction Processing/Submitted.aac",
  "Twi/7.Transaction Processing/Waiting confirmation.aac",
  "Twi/7.Transaction Processing/Check phone.aac",
  "Twi/7.Transaction Processing/Authorize phone.aac",
  "Twi/7.Transaction Processing/Auth received.aac",
  "Twi/7.Transaction Processing/Auth_received.aac",
  "Twi/7.Transaction Processing/Check final status.aac",
  "Twi/7.Transaction Processing/Check Final Status.aac",
  "Twi/7.Transaction Processing/Processing.aac",

  // 8. Success & Completion
  "Twi/8.Success & Completion/SUCCESS.aac",
  "Twi/8.Success & Completion/SUCCESS SENT.aac",
  "Twi/8.Success & Completion/Keep reference.aac",
  "Twi/8.Success & Completion/SUCCESS CLOSE.aac",
  "Twi/8.Success & Completion/ANYTHING ELSE.aac",

  // 9. Failure, Decline & Timeout
  "Twi/9.Failure, Decline & Timeout/Customer declined.aac",
  "Twi/9.Failure, Decline & Timeout/Failed.aac",
  "Twi/9.Failure, Decline & Timeout/Timeout.aac",
  "Twi/9.Failure, Decline & Timeout/Failure retry.aac",
  "Twi/9.Failure, Decline & Timeout/No transfer confirmed.aac",
  "Twi/9.Failure, Decline & Timeout/Check messages.aac",
  "Twi/9.Failure, Decline & Timeout/Start again.aac",

  // 10. Voice Understanding & Verification
  "Twi/10.Voice Understanding & Verification/Not understood.aac",
  "Twi/10.Voice Understanding & Verification/Do not get.aac",
  "Twi/10.Voice Understanding & Verification/No response.aac",
  "Twi/10.Voice Understanding & Verification/Please respond.aac",
  "Twi/10.Voice Understanding & Verification/input not recognized.aac",
  "Twi/10.Voice Understanding & Verification/Repeat.aac",
  "Twi/10.Voice Understanding & Verification/Confirm understanding.aac",
  "Twi/10.Voice Understanding & Verification/Yes_No.aac",

  // 11. Navigation & Recovery
  "Twi/11.Navigation & Recovery/Back.aac",
  "Twi/11.Navigation & Recovery/Main menu.aac",
  "Twi/11.Navigation & Recovery/Restart.aac",
  "Twi/11.Navigation & Recovery/Cancel.aac",
  "Twi/11.Navigation & Recovery/Exit.aac",
  "Twi/11.Navigation & Recovery/Session end.aac",
  "Twi/11.Navigation & Recovery/Continue.aac",
  "Twi/11.Navigation & Recovery/Session timeout.aac",

  // 12. Accessibility & Help
  "Twi/12.Accessibility & Help/REPEAT OPTIONS.aac",
  "Twi/12.Accessibility & Help/KEYPAD OPTION.aac",
  "Twi/12.Accessibility & Help/VOICE OR KEYPAD.aac",
  "Twi/12.Accessibility & Help/TAKE YOUR TIME.aac",
  "Twi/12.Accessibility & Help/YES OR NO KEYPAD.aac",
  "Twi/12.Accessibility & Help/HELP.aac",
  "Twi/12.Accessibility & Help/Help Commands.aac",

  // 13. Balance & Unsupported Services
  "Twi/13.Balance  Unsupported Services/Balance unavailable.aac",
  "Twi/13.Balance  Unsupported Services/Unsupported service.aac",
  "Twi/13.Balance  Unsupported Services/System error.aac",

  // 14. Post-Transaction Conversation
  "Twi/14.Post-Transaction Conversation/Post success help.aac",
  "Twi/14.Post-Transaction Conversation/Another transaction.aac",
  "Twi/14.Post-Transaction Conversation/Another recipient.aac",
  "Twi/14.Post-Transaction Conversation/Finish.aac",
] as const;

const suppliedPromptIdByPath: Readonly<Record<string, string>> = {
  // Category 1: Welcome & Session Start
  "Twi/1.Welcome & Session Start/Welcome 1 (2).mp3": "OP01",
  "Twi/1.Welcome & Session Start/Language selection.mp3": "OP02",
  "Twi/1.Welcome & Session Start/Greetings 2.mp3": "OP03",
  "Twi/1.Welcome & Session Start/Welcome back.mp3": "OP04",
  "Twi/1.Welcome & Session Start/Acknowledge.mp3": "OP05",
  "Twi/1.Welcome & Session Start/Processing.mp3": "OP06",

  // Category 2: Main Service Navigation
  "Twi/2.Main Service Navigation/Service selection.mp3": "OP07",
  "Twi/2.Main Service Navigation/Service selection 2.mp3": "OP07",
  "Twi/2.Main Service Navigation/Service selection 2 (2).mp3": "OP07",
  "Twi/2.Main Service Navigation/Network selection.mp3": "OP08",
  "Twi/2.Main Service Navigation/Network selection 2.mp3": "OP08",
  "Twi/2.Main Service Navigation/MTN menu.mp3": "OP09",
  "Twi/2.Main Service Navigation/MTN menu 1.mp3": "OP09",
  "Twi/2.Main Service Navigation/Send money selected.mp3": "OP10",
  "Twi/2.Main Service Navigation/Service unavailable.mp3": "OP11",
  "Twi/2.Main Service Navigation/Service unavailable 1.mp3": "OP11",
  "Twi/2.Main Service Navigation/Main service Unavailable.mp3": "OP11",
  "Twi/2.Main Service Navigation/Service alternative.mp3": "OP12",
  "Twi/2.Main Service Navigation/Service not ready.mp3": "OP13",
  "Twi/2.Main Service Navigation/Try another service.mp3": "OP14",
  "Twi/service_description.mp3": "OP01B",
  "service_description.mp3": "OP01B",

  // Category 3: Recipient Entry & Verification
  "Twi/3.Recipient Entry & Verification/Enter recipient 2.mp3": "OP16",
  "Twi/3.Recipient Entry & Verification/Invalid recipient 1.mp3": "OP17",
  "Twi/3.Recipient Entry & Verification/Recipient found.mp3": "OP18",
  "Twi/3.Recipient Entry & Verification/Recipient verify.mp3": "OP19",
  "Twi/3.Recipient Entry & Verification/Recipient confirm speech.mp3": "OP23",
  "Twi/3.Recipient Entry & Verification/Use recipient 1.mp3": "OP24",
  "Twi/3.Recipient Entry & Verification/Change recipient.mp3": "OP25",

  // Category 4: Amount Entry & Verification
  "Twi/4.Amount Entry & Verification/Enter amount 4.mp3": "OP26",
  "Twi/4.Amount Entry & Verification/Invalid amount.mp3": "OP27",
  "Twi/4.Amount Entry & Verification/Amount prompt.mp3": "OP28",
  "Twi/4.Amount Entry & Verification/Amount readback 2.mp3": "OP29",
  "Twi/4.Amount Entry & Verification/Repeat amount.mp3": "OP30",
  "Twi/4.Amount Entry & Verification/Amount too high 3.mp3": "OP31",
  "Twi/4.Amount Entry & Verification/Amount too low.mp3": "OP32",
  "Twi/4.Amount Entry & Verification/Change amount 2.mp3": "OP33",

  // Category 5: Transaction Confirmation
  "Twi/5.Transaction Confirmation/Confirmation intro.mp3": "OP34",
  "Twi/5.Transaction Confirmation/Review transaction.mp3": "OP35",
  "Twi/5.Transaction Confirmation/Confirm continue.mp3": "OP36",
  "Twi/5.Transaction Confirmation/Confirm continue 1.mp3": "OP36",
  "Twi/5.Transaction Confirmation/Confirm speech.mp3": "OP37",
  "Twi/5.Transaction Confirmation/Reject speech.mp3": "OP38",
  "Twi/5.Transaction Confirmation/Ready submit.mp3": "OP39",
  "Twi/5.Transaction Confirmation/Ready submit 2.mp3": "OP39",

  // Category 6: PIN & Security
  "Twi/6.PIN & Security/Pin block.aac": "OP43",
  "Twi/6.PIN & Security/Sensitive block.aac": "OP44",

  // Category 7: Transaction Processing
  "Twi/7.Transaction Processing/Submitted.aac": "OP45",
  "Twi/7.Transaction Processing/Waiting confirmation.aac": "OP46",
  "Twi/7.Transaction Processing/Check phone.aac": "OP47",
  "Twi/7.Transaction Processing/Authorize phone.aac": "OP48",
  "Twi/7.Transaction Processing/Auth received.aac": "OP49",
  "Twi/7.Transaction Processing/Auth_received.aac": "OP49",
  "Twi/7.Transaction Processing/Check final status.aac": "OP50",
  "Twi/7.Transaction Processing/Check Final Status.aac": "OP50",
  "Twi/7.Transaction Processing/Processing.aac": "OP51",

  // Category 8: Success & Completion
  "Twi/8.Success & Completion/SUCCESS.aac": "OP52",
  "Twi/8.Success & Completion/SUCCESS SENT.aac": "OP53",
  "Twi/8.Success & Completion/Keep reference.aac": "OP54",
  "Twi/8.Success & Completion/SUCCESS CLOSE.aac": "OP55",
  "Twi/8.Success & Completion/ANYTHING ELSE.aac": "OP56",

  // Category 9: Failure, Decline & Timeout
  "Twi/9.Failure, Decline & Timeout/Customer declined.aac": "OP57",
  "Twi/9.Failure, Decline & Timeout/Failed.aac": "OP58",
  "Twi/9.Failure, Decline & Timeout/Timeout.aac": "OP59",
  "Twi/9.Failure, Decline & Timeout/Failure retry.aac": "OP60",
  "Twi/9.Failure, Decline & Timeout/No transfer confirmed.aac": "OP61",
  "Twi/9.Failure, Decline & Timeout/Check messages.aac": "OP62",
  "Twi/9.Failure, Decline & Timeout/Start again.aac": "OP63",

  // Category 10: Voice Understanding & Verification
  "Twi/10.Voice Understanding & Verification/Not understood.aac": "OP64",
  "Twi/10.Voice Understanding & Verification/Do not get.aac": "OP65",
  "Twi/10.Voice Understanding & Verification/No response.aac": "OP66",
  "Twi/10.Voice Understanding & Verification/Please respond.aac": "OP67",
  "Twi/10.Voice Understanding & Verification/input not recognized.aac": "OP68",
  "Twi/10.Voice Understanding & Verification/Repeat.aac": "OP69",
  "Twi/10.Voice Understanding & Verification/Confirm understanding.aac": "OP70",
  "Twi/10.Voice Understanding & Verification/Yes_No.aac": "OP72",

  // Category 11: Navigation & Recovery
  "Twi/11.Navigation & Recovery/Back.aac": "OP73",
  "Twi/11.Navigation & Recovery/Main menu.aac": "OP74",
  "Twi/11.Navigation & Recovery/Restart.aac": "OP75",
  "Twi/11.Navigation & Recovery/Cancel.aac": "OP76",
  "Twi/11.Navigation & Recovery/Exit.aac": "OP77",
  "Twi/11.Navigation & Recovery/Session end.aac": "OP78",
  "Twi/11.Navigation & Recovery/Continue.aac": "OP79",
  "Twi/11.Navigation & Recovery/Session timeout.aac": "OP80",

  // Category 12: Accessibility & Help
  "Twi/12.Accessibility & Help/REPEAT OPTIONS.aac": "OP81",
  "Twi/12.Accessibility & Help/KEYPAD OPTION.aac": "OP82",
  "Twi/12.Accessibility & Help/VOICE OR KEYPAD.aac": "OP83",
  "Twi/12.Accessibility & Help/TAKE YOUR TIME.aac": "OP84",
  "Twi/12.Accessibility & Help/YES OR NO KEYPAD.aac": "OP85",
  "Twi/12.Accessibility & Help/HELP.aac": "OP86",
  "Twi/12.Accessibility & Help/Help Commands.aac": "OP87",

  // Category 13: Balance & Unsupported Services
  "Twi/13.Balance  Unsupported Services/Balance unavailable.aac": "OP88",
  "Twi/13.Balance  Unsupported Services/Unsupported service.aac": "OP89",
  "Twi/13.Balance  Unsupported Services/System error.aac": "OP90",

  // Category 14: Post-Transaction Conversation
  "Twi/14.Post-Transaction Conversation/Post success help.aac": "OP91",
  "Twi/14.Post-Transaction Conversation/Another transaction.aac": "OP92",
  "Twi/14.Post-Transaction Conversation/Another recipient.aac": "OP93",
  "Twi/14.Post-Transaction Conversation/Finish.aac": "OP94",
};

const additionalUnresolvedFiles = [
  "Another recipient.mp3",
  "Another transaction.mp3",
  "Anything else.mp3",
  "Auth received.mp3",
  "Authorize phone.mp3",
  "Back.mp3",
  "Balance Unavailable.mp3",
  "Cancel.mp3",
  "Check final status.mp3",
  "Check messages.mp3",
  "Check phone.mp3",
  "Confirm understanding.mp3",
  "Continue.mp3",
  "Correct prompt.mp3",
  "Customer Declined.mp3",
  "Did not get.mp3",
  "Exit.mp3",
  "Failed.mp3",
  "Failure Retry.mp3",
  "Finish.mp3",
  "Help command.mp3",
  "Help.mp3",
  "Input not recognized.mp3",
  "Keep reference.mp3",
  "Keypad option.mp3",
  "Main menu.mp3",
  "No transfer confirmed.mp3",
  "Not understood.mp3",
  "Pin Block.mp3",
  "Pin Handoff.mp3",
  "Please respond.mp3",
  "Post success Help.mp3",
  "Processing.mp3",
  "Repeat Option.mp3",
  "Repeat.mp3",
  "Restart.mp3",
  "Secure pin.mp3",
  "Security warning.mp3",
  "Sensitive Block.mp3",
  "Session End.mp3",
  "Session timeout.mp3",
  "Start Again.mp3",
  "Submitted.mp3",
  "Success close.mp3",
  "Success sent.mp3",
  "Success.mp3",
  "System Error.mp3",
  "Take your time.mp3",
  "Timeout.mp3",
  "Unsupported service.mp3",
  "Voice or keypad.mp3",
  "Waiting confirmation.mp3",
  "Yes -No.mp3",
  "Yes -no- keypad.mp3",
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
          ? `/audio/${encodePath(relativePath)}`
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
    mappingStatus: promptId ? "VERIFIED" : (prompt?.mappingStatus || "CANDIDATE_NOT_AUDIO_VERIFIED"),
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
  {
    id: "public:welcome_en.mp3",
    promptId: "OP01",
    state: "WELCOME",
    category: "01_Welcome_Session_Start",
    context: "01_Welcome_Session_Start:WELCOME",
    language: "en",
    title: "English Welcome Audio",
    spokenText: "Welcome to Ɔkwankyerɛfo Pa, your accessible voice guide for mobile services. For English, press 1. For Twi, press 2.",
    relativePath: "welcome_en.mp3",
    assetRoot: "public",
    url: "/audio/welcome_en.mp3",
    mimeType: "audio/mpeg",
    isAlternate: false,
    recordingRole: "fixed",
    mappingStatus: "MAPPED_EXACT",
  },
  {
    id: "public:welcome_twi.mp3",
    promptId: "OP01",
    state: "WELCOME",
    category: "01_Welcome_Session_Start",
    context: "01_Welcome_Session_Start:WELCOME",
    language: "twi",
    title: "Akan Twi Welcome Audio",
    spokenText: "Akwaaba wɔ Ɔkwankyerɛfo Pa mu, wo nne akwankyerɛ a ɛma mobile services yɛ mmerɛw ma obiara.",
    relativePath: "welcome_twi.mp3",
    assetRoot: "public",
    url: "/audio/welcome_twi.mp3",
    mimeType: "audio/mpeg",
    isAlternate: false,
    recordingRole: "fixed",
    mappingStatus: "MAPPED_EXACT",
  },
  {
    id: "supplied:service_description.mp3",
    promptId: "OP01B",
    state: "SERVICE_DESCRIPTION",
    category: "01_Welcome_Session_Start",
    context: "01_Welcome_Session_Start:SERVICE_DESCRIPTION",
    language: "twi",
    title: "System Service Description",
    spokenText: "Welcome to Okwankyerɛfo Pa, we are an accessibility layer that helps and makes services easy for everyone with inclusivity, the elderly and disabled.",
    relativePath: "service_description.mp3",
    assetRoot: "supplied",
    url: "/audio/service_description.mp3",
    mimeType: "audio/mpeg",
    isAlternate: false,
    recordingRole: "fixed",
    mappingStatus: "MAPPED_EXACT",
  },
];

export const ADDITIONAL_FILE_TO_PROMPT_MAP: Record<string, { promptId: string; language: "twi" | "en"; state: string }> = {
  "service_description.mp3": { promptId: "OP01B", language: "twi", state: "SERVICE_DESCRIPTION" },
  "Cancel.mp3": { promptId: "OP76", language: "twi", state: "CANCEL" },
  "Exit.mp3": { promptId: "OP77", language: "twi", state: "EXIT" },
  "Pin Handoff.mp3": { promptId: "OP40", language: "twi", state: "PIN_HANDOFF" },
  "Security warning.mp3": { promptId: "OP41", language: "twi", state: "SECURITY_WARNING" },
  "Secure pin.mp3": { promptId: "OP42", language: "twi", state: "SECURE_PIN" },
  "Pin Block.mp3": { promptId: "OP43", language: "twi", state: "PIN_BLOCK" },
  "Sensitive Block.mp3": { promptId: "OP44", language: "twi", state: "SENSITIVE_BLOCK" },
  "Submitted.mp3": { promptId: "OP45", language: "twi", state: "SUBMITTED" },
  "Waiting confirmation.mp3": { promptId: "OP46", language: "twi", state: "WAITING_CONFIRMATION" },
  "Check phone.mp3": { promptId: "OP47", language: "twi", state: "CHECK_PHONE" },
  "Authorize phone.mp3": { promptId: "OP48", language: "twi", state: "AUTHORIZE_PHONE" },
  "Auth received.mp3": { promptId: "OP49", language: "twi", state: "AUTH_RECEIVED" },
  "Check final status.mp3": { promptId: "OP50", language: "twi", state: "CHECK_FINAL_STATUS" },
  "Processing.mp3": { promptId: "OP51", language: "twi", state: "PROCESSING" },
  "Success sent.mp3": { promptId: "OP53", language: "twi", state: "SUCCESS_SENT" },
  "Success.mp3": { promptId: "OP53", language: "twi", state: "SUCCESS_SENT" },
  "Keep reference.mp3": { promptId: "OP54", language: "twi", state: "KEEP_REFERENCE" },
  "Success close.mp3": { promptId: "OP55", language: "twi", state: "SUCCESS_CLOSE" },
  "Anything else.mp3": { promptId: "OP56", language: "twi", state: "ANYTHING_ELSE" },
  "Customer Declined.mp3": { promptId: "OP57", language: "twi", state: "CUSTOMER_DECLINED" },
  "Failed.mp3": { promptId: "OP58", language: "twi", state: "FAILED" },
  "Timeout.mp3": { promptId: "OP59", language: "twi", state: "TIMEOUT" },
  "Failure Retry.mp3": { promptId: "OP60", language: "twi", state: "FAILURE_RETRY" },
  "No transfer confirmed.mp3": { promptId: "OP61", language: "twi", state: "NO_TRANSFER_CONFIRMED" },
  "Check messages.mp3": { promptId: "OP62", language: "twi", state: "CHECK_MESSAGES" },
  "Start Again.mp3": { promptId: "OP63", language: "twi", state: "START_AGAIN" },
  "Not understood.mp3": { promptId: "OP64", language: "twi", state: "NOT_UNDERSTOOD" },
  "Did not get.mp3": { promptId: "OP65", language: "twi", state: "DID_NOT_GET" },
  "Please respond.mp3": { promptId: "OP67", language: "twi", state: "PLEASE_RESPOND" },
  "Input not recognized.mp3": { promptId: "OP68", language: "twi", state: "INPUT_NOT_RECOGNIZED" },
  "Repeat.mp3": { promptId: "OP69", language: "twi", state: "REPEAT" },
  "Confirm understanding.mp3": { promptId: "OP70", language: "twi", state: "CONFIRM_UNDERSTANDING" },
  "Correct prompt.mp3": { promptId: "OP71", language: "twi", state: "CORRECT_PROMPT" },
  "Yes -No.mp3": { promptId: "OP72", language: "twi", state: "YES_NO" },
  "Back.mp3": { promptId: "OP73", language: "twi", state: "BACK" },
  "Main menu.mp3": { promptId: "OP74", language: "twi", state: "MAIN_MENU" },
  "Restart.mp3": { promptId: "OP75", language: "twi", state: "RESTART" },
  "Session End.mp3": { promptId: "OP78", language: "twi", state: "SESSION_END" },
  "Continue.mp3": { promptId: "OP79", language: "twi", state: "CONTINUE" },
  "Session timeout.mp3": { promptId: "OP80", language: "twi", state: "SESSION_TIMEOUT" },
  "Repeat Option.mp3": { promptId: "OP81", language: "twi", state: "REPEAT_OPTIONS" },
  "Keypad option.mp3": { promptId: "OP82", language: "twi", state: "KEYPAD_OPTION" },
  "Voice or keypad.mp3": { promptId: "OP83", language: "twi", state: "VOICE_OR_KEYPAD" },
  "Take your time.mp3": { promptId: "OP84", language: "twi", state: "TAKE_YOUR_TIME" },
  "Yes -no- keypad.mp3": { promptId: "OP85", language: "twi", state: "YES_NO_KEYPAD" },
  "Help.mp3": { promptId: "OP86", language: "twi", state: "HELP" },
  "Help command.mp3": { promptId: "OP87", language: "twi", state: "HELP_COMMANDS" },
  "Balance Unavailable.mp3": { promptId: "OP88", language: "twi", state: "BALANCE_UNAVAILABLE" },
  "Unsupported service.mp3": { promptId: "OP89", language: "twi", state: "UNSUPPORTED_SERVICE" },
  "System Error.mp3": { promptId: "OP90", language: "twi", state: "SYSTEM_ERROR" },
  "Post success Help.mp3": { promptId: "OP91", language: "twi", state: "POST_SUCCESS_HELP" },
  "Another transaction.mp3": { promptId: "OP92", language: "twi", state: "ANOTHER_TRANSACTION" },
  "Another recipient.mp3": { promptId: "OP93", language: "twi", state: "ANOTHER_RECIPIENT" },
  "Finish.mp3": { promptId: "OP94", language: "twi", state: "FINISH" },
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
  service_description: "OP01B",
  system_description: "OP01B",
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
  const matches = AUDIO_RECORDINGS.filter((recording) =>
    recording.promptId === promptId &&
    recording.language === language &&
    recording.url &&
    (recording.mappingStatus === "VERIFIED" || recording.assetRoot === "supplied" || recording.assetRoot === "additional")
  );
  if (matches.length > 0) return matches[0];
  if (promptId === "OP22" && language === "twi") {
    return getRecordingByPromptId("OP23", "twi");
  }
  return null;
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
  const promptId = PROMPT_KEY_TO_RECORDING_ID[key] || (/^OP\d{2}[A-Z]?$/i.test(key) ? key.toUpperCase() : undefined);
  return promptId ? getRecordingByPromptId(promptId, language) : null;
}

export function getRecordingByPath(relativePath: string): AudioRecording | null {
  return AUDIO_RECORDINGS.find((recording) => recording.relativePath === relativePath) || null;
}

export function getRecordingByUrl(url: string, preferredLang?: "en" | "twi"): AudioRecording | null {
  if (!url) return null;
  const cleanUrl = url.split("?")[0].trim();
  const decodedTarget = decodeURIComponent(cleanUrl)
    .replace(/^\/+/, "")
    .replace(/^(?:api\/)?audio\/(?:supplied\/|additional\/)?/i, "")
    .toLowerCase();
  const stemTarget = decodedTarget.replace(/\.[a-z0-9]+$/i, "");
  const baseTarget = stemTarget.split("/").pop() || "";

  // 1. Direct match with language preference
  const directMatches = AUDIO_RECORDINGS.filter((recording) => {
    if (!recording.url) return false;
    if (recording.url === cleanUrl) return true;
    const decodedRec = decodeURIComponent(recording.url)
      .replace(/^\/+/, "")
      .replace(/^(?:api\/)?audio\/(?:supplied\/|additional\/)?/i, "")
      .toLowerCase();
    if (decodedRec === decodedTarget) return true;
    const stemRec = decodedRec.replace(/\.[a-z0-9]+$/i, "");
    if (stemRec === stemTarget) return true;
    const baseRec = stemRec.split("/").pop() || "";
    return Boolean(baseRec && baseTarget && baseRec === baseTarget);
  });

  if (directMatches.length > 0) {
    if (preferredLang) {
      const langMatch = directMatches.find((r) => r.language === preferredLang);
      if (langMatch) return langMatch;
    }
    // Prefer supplied recordings over fallback
    const suppliedMatch = directMatches.find((r) => r.assetRoot === "supplied" && !r.isAlternate);
    if (suppliedMatch) return suppliedMatch;
    return directMatches[0];
  }

  // 2. Special handling for general welcome prompts
  if (/welcome_prompt_01/i.test(cleanUrl) || /welcome/i.test(baseTarget)) {
    if (preferredLang === "twi") {
      const twiWelcome = getRecordingByPromptId("OP01", "twi");
      if (twiWelcome) return twiWelcome;
    }
    const enWelcome = getRecordingByPromptId("OP01", "en");
    if (enWelcome) return enWelcome;
  }

  return null;
}

export function getRecordingFilePath(relativePath: string): string | null {
  const recording = getRecordingByPath(relativePath);
  if (!recording) {
    if (/welcome_prompt_01\.mp3$/i.test(relativePath)) {
      return `public/audio/Welcome_prompt_01.mp3`;
    }
    if (/welcome_(?:en|twi)\.mp3$/i.test(relativePath)) {
      return `public/audio/${relativePath}`;
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
