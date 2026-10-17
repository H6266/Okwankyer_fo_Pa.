import { AUDIO_RECORDINGS, AudioRecording, normalizeRecordingLanguage, getPromptManifestEntry } from "./recordingRegistry";
import { TWI_SEQUENTIAL_FLOW_STEPS, FlowStepDefinition } from "./twiSequentialAudioFlow";

function getNodeModules() {
  if (typeof window !== "undefined") return { fs: null, path: null };
  try {
    // Dynamic node imports so Vite browser bundler ignores them
    const nodeFs = typeof require !== "undefined" ? require("fs") : null;
    const nodePath = typeof require !== "undefined" ? require("path") : null;
    return { fs: nodeFs, path: nodePath };
  } catch {
    return { fs: null, path: null };
  }
}

export interface AudioMatchResult {
  match: boolean;
  confidence: number; // 0.00 to 1.00 (e.g. 0.85 = 85%)
  audioUrl?: string;
  title?: string;
  spokenText?: string;
  filePath?: string;
  audioBuffer?: Buffer;
  recording?: AudioRecording;
  flowStep?: FlowStepDefinition;
  isFallbackToTts: boolean;
  matchReason?: string;
}

export interface RecordedReplyAudio {
  recording: AudioRecording;
  audioBuffer: Buffer;
  confidence?: number;
}

const audioBufferCache = new Map<string, Buffer>();
export const DEFAULT_MATCH_CONFIDENCE_THRESHOLD = 0.50; // 50% confidence gate

function normalizeReplyText(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveDiskPath(audioUrlOrRelative: string, _assetRoot: "supplied" | "public" = "supplied"): string | null {
  const { fs, path } = getNodeModules();
  if (!fs || !path) return null;

  try {
    const { resolveSafeAudioPath } = require("./streaming");
    const safe = resolveSafeAudioPath(audioUrlOrRelative);
    if (safe && fs.existsSync(safe) && !fs.statSync(safe).isDirectory()) {
      return safe;
    }
  } catch {}

  const clean = audioUrlOrRelative.replace(/^\/audio\//, "").replace(/^\/+/, "");
  const decoded = decodeURIComponent(clean);

  const candidates = [
    path.resolve(process.cwd(), "Audio_files", decoded),
    path.resolve(process.cwd(), "Audio_files", "Twi", decoded),
    path.resolve(process.cwd(), "Audio_files", "Twi_library", decoded),
    path.resolve(process.cwd(), "Audio_files", "Twi_library", path.basename(decoded)),
    path.resolve(process.cwd(), "public", "audio", decoded),
    path.resolve(process.cwd(), "audio", decoded),
    path.resolve(process.cwd(), "Audio_files", path.basename(decoded)),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  return null;
}

/**
 * Calculates match confidence (0.0 to 1.0) between an AI reply and a catalog target phrase
 */
export function calculateMatchConfidence(
  utterance: string,
  targetText: string,
  aliases: string[] = []
): { confidence: number; reason: string } {
  const normUtt = normalizeReplyText(utterance);
  const normTarget = normalizeReplyText(targetText);

  if (!normUtt || !normTarget) {
    return { confidence: 0, reason: "empty" };
  }

  // Exact match
  if (normUtt === normTarget) {
    return { confidence: 1.0, reason: "exact_match" };
  }

  // Direct substring containment
  if (normUtt.includes(normTarget) || normTarget.includes(normUtt)) {
    const ratio = Math.min(normUtt.length, normTarget.length) / Math.max(normUtt.length, normTarget.length);
    const score = Math.max(0.70, ratio);
    return { confidence: Math.round(score * 100) / 100, reason: "substring_containment" };
  }

  // Known trigger aliases
  for (const alias of aliases) {
    const normAlias = normalizeReplyText(alias);
    if (normAlias && (normUtt.includes(normAlias) || normAlias.includes(normUtt))) {
      return { confidence: 0.85, reason: `alias_match:${alias}` };
    }
  }

  // Token recall & overlap
  const uttWords = new Set(normUtt.split(" ").filter(Boolean));
  const targetWords = normTarget.split(" ").filter(Boolean);

  if (targetWords.length > 0) {
    let matched = 0;
    for (const tw of targetWords) {
      if (uttWords.has(tw)) matched++;
    }
    const recall = matched / targetWords.length;
    if (recall >= 0.75) {
      return { confidence: Math.round(Math.min(0.90, recall * 0.95) * 100) / 100, reason: "high_token_recall" };
    }
    if (recall >= 0.50) {
      return { confidence: Math.round(Math.min(0.75, recall * 0.85) * 100) / 100, reason: "moderate_token_recall" };
    }
  }

  return { confidence: 0, reason: "no_match" };
}

/**
 * Pre-compiled alias catalog for key Ghanaian MoMo IVR steps
 */
const STEP_ALIASES: Record<string, string[]> = {
  default_welcome: [
    "welcome to okwankyerɛfo pa",
    "welcome prompt",
    "easy financial transaction service",
    "for english press 1 for twi press 2",
    "akwaaba kɔ okwankyerɛfo pa",
  ],
  welcome_1: [
    "welcome to mtn mobile money",
    "welcome to mobile money",
    "akwaaba wɔ ɔkwankyerɛfo pa mu",
    "wo nne akwankyerɛ",
    "akwaaba kɔ mtn",
    "akwaaba kɔ mobile money",
  ],
  language_selection: [
    "language selection",
    "sɛ wopɛ borɔfo",
    "sɛ wopɛ twi",
    "english or twi",
    "choose english or twi",
  ],
  service_selection_2: [
    "service selection 2",
    "service selection",
    "services selection",
    "paw dwumadie",
    "sɛ wopɛ sɛ womane sika a mia 1",
  ],
  mtn_menu_1: [
    "mtn menu 1",
    "mtn menu",
    "mtn mobile money",
    "to transfer money press 1",
    "sɛ wopɛ sɛ womane sika a mia 1",
  ],
  enter_recipient_2: [
    "enter recipient 2",
    "enter recipient",
    "recipient phone number",
    "ten digit phone number",
    "fon nɔmba a ɛyɛ du",
    "obi a woremane no",
    "what is the phone number",
  ],
  recipient_confirm_speech: [
    "recipient confirm speech",
    "recipient 5",
    "recipient identified",
    "yɛahu obi a woremane no",
    "tie ne din ne ne nɔmba",
  ],
  use_recipient_1: [
    "use recipient 1",
    "recipient 1",
    "recipient name",
    "recipient full number",
    "wopene so a mia 1",
    "wosesa a mia 2",
  ],
  amount_prompt_3: [
    "enter amount 3",
    "amount prompt",
    "sika ahe na wopɛ",
    "how much money would you like to send",
  ],
  enter_amount_4: [
    "enter amount 4",
    "enter amount",
    "how many ghana cedis",
    "sika dodow a wopɛ",
    "bɔ sika dodow no",
  ],
  amount_readback_2: [
    "amount readback 2",
    "amount readback",
    "sika dodow a wobɔe no",
    "you entered this amount",
  ],
  confirm_speech: [
    "confirm speech",
    "sɛ wopene so a mia 1",
    "to confirm and submit press 1",
    "say yes or press 1",
    "ready submit",
  ],
  payment_audio: [
    "authorize phone",
    "payment audio",
    "pene so wɔ wo fon so",
    "authorize the transfer prompt",
    "zero-pin",
  ],
  submitted: [
    "submitted",
    "transaction submitted",
    "yɛade transaction no akɔ network no so",
    "awaiting confirmation",
  ],
  transaction_status: [
    "transaction status",
    "check final status",
    "yɛrehwehwɛ awieeɛ gyinabea",
    "verifying final transaction status",
  ],
  success_audio: [
    "success",
    "success audio",
    "success sent",
    "transfer sent successfully",
    "sika no akɔ pɛpɛɛpɛ",
  ],
  dynamic_tts_reference: [
    "transaction reference",
    "reference number",
    "wo transaction reference",
  ],
  completion_exit: [
    "keep reference",
    "anything else",
    "success close",
    "thank you for using",
    "meda wo ase",
    "nante yie",
    "goodbye",
  ],
  // Legacy alias fallbacks
  welcome: ["welcome to mobile money", "akwaaba kɔ mtn"],
  description: ["service description", "ɔkwankyerɛfo pa"],
  network_selection: ["network selection", "paw network"],
  services_selection: ["services selection", "paw dwumadie"],
  send_money_selected: ["send money selected", "woremane sika"],
  enter_recipient: ["enter recipient", "recipient phone number"],
  enter_amount: ["enter amount", "how many ghana cedis"],
  confirmation_intro: ["confirmation intro", "transaction confirmation"],
  review_transaction: ["review transaction", "hwɛ wo transaction"],
  ready_submit_confirm: ["ready submit", "confirm speech"],
  reject_error: ["reject speech", "transaction cancelled"],
  success_sent: ["success sent", "sika no akɔ pɛpɛɛpɛ"],
  success_close: ["success close", "meda wo ase", "nante yie"],
};

/**
 * Matches an AI reply to available recorded studio audios with a confidence threshold.
 * If confidence is >= minConfidence (default 50%), returns studio audio.
 * If confidence is < minConfidence, signals fallback to TTS.
 */
export function matchReplyToAudio(
  text: string,
  language: string,
  options?: { minConfidence?: number }
): AudioMatchResult {
  const minConfidence = options?.minConfidence ?? DEFAULT_MATCH_CONFIDENCE_THRESHOLD;
  const isTwi = language.startsWith("tw") || language === "twi" || language === "mixed-twi-en";
  const wantedLanguage = normalizeRecordingLanguage(language);

  let bestResult: AudioMatchResult = {
    match: false,
    confidence: 0,
    isFallbackToTts: true,
  };

  // 1. Check Sequential Flow Steps
  for (const step of TWI_SEQUENTIAL_FLOW_STEPS) {
    if (!step.audioUrl) continue;
    const targetScript = isTwi ? step.spokenTextTwi : step.spokenTextEn;
    const aliases = STEP_ALIASES[step.id] || [];

    const { confidence, reason } = calculateMatchConfidence(text, targetScript, aliases);
    if (confidence > bestResult.confidence) {
      const diskPath = resolveDiskPath(step.audioUrl);
      bestResult = {
        match: confidence >= minConfidence,
        confidence,
        audioUrl: step.audioUrl,
        title: step.name,
        spokenText: targetScript,
        filePath: diskPath || undefined,
        flowStep: step,
        isFallbackToTts: confidence < minConfidence,
        matchReason: `flow_step:${step.id} (${reason})`,
      };
    }
  }

  // 2. Check full AUDIO_RECORDINGS library (with fallback to Twi recordings for English requests)
  let catalogCandidates = AUDIO_RECORDINGS.filter((r) => {
    if (wantedLanguage && r.language !== wantedLanguage) return false;
    return Boolean(
      r.spokenText &&
      r.url &&
      (r.mappingStatus === "VERIFIED" || r.assetRoot === "supplied" || r.assetRoot === "additional") &&
      r.recordingRole === "fixed"
    );
  });

  if (catalogCandidates.length === 0 && wantedLanguage === "en") {
    catalogCandidates = AUDIO_RECORDINGS.filter((r) =>
      r.language === "twi" &&
      Boolean(r.spokenText && r.url && r.recordingRole === "fixed")
    );
  }

  for (const recording of catalogCandidates) {
    if (!recording.spokenText || !recording.url) continue;
    let { confidence, reason } = calculateMatchConfidence(text, recording.spokenText, []);

    // Also check if prompt manifest has an English script matching the text
    if (confidence < minConfidence && recording.promptId) {
      const manifestEntry = getPromptManifestEntry(recording.promptId);
      if (manifestEntry?.english) {
        const engMatch = calculateMatchConfidence(text, manifestEntry.english, []);
        if (engMatch.confidence > confidence) {
          confidence = engMatch.confidence;
          reason = `manifest_english_crossmatch:${manifestEntry.id}`;
        }
      }
    }

    if (confidence > bestResult.confidence) {
      const diskPath = resolveDiskPath(recording.url);
      bestResult = {
        match: confidence >= minConfidence,
        confidence,
        audioUrl: recording.url,
        title: recording.title,
        spokenText: recording.spokenText,
        filePath: diskPath || undefined,
        recording,
        isFallbackToTts: confidence < minConfidence,
        matchReason: `catalog:${recording.id} (${reason})`,
      };
    }
  }

  // 3. Load audioBuffer if matched and file exists
  if (bestResult.match && bestResult.filePath) {
    const { fs } = getNodeModules();
    if (fs) {
      let buf = audioBufferCache.get(bestResult.filePath);
      if (!buf && fs.existsSync(bestResult.filePath)) {
        buf = fs.readFileSync(bestResult.filePath);
        audioBufferCache.set(bestResult.filePath, buf);
      }
      bestResult.audioBuffer = buf;
    }
  }

  // 4. Safe Fallback: When no audio matched and TTS is unavailable, fallback to pre-recorded Processing audio
  if (!bestResult.match) {
    const processingUrl = "/audio/Processing.mp3";
    const diskPath = resolveDiskPath(processingUrl);
    const { fs } = getNodeModules();
    let buf: Buffer | undefined;
    if (fs && diskPath && fs.existsSync(diskPath)) {
      buf = audioBufferCache.get(diskPath);
      if (!buf) {
        buf = fs.readFileSync(diskPath);
        audioBufferCache.set(diskPath, buf);
      }
    }
    return {
      match: true,
      confidence: 0.5,
      audioUrl: processingUrl,
      title: "Processing",
      spokenText: "Yɛretwɛn... Yɛrebɔ mmɔden ahwɛ wo dwumadie no. Please wait as we process your request.",
      filePath: diskPath || undefined,
      audioBuffer: buf,
      isFallbackToTts: false,
      matchReason: "processing_audio_fallback",
    };
  }

  return bestResult;
}

/**
 * Backward-compatible helper for legacy callers
 */
export function findRecordedReplyAudio(text: string, language: string): RecordedReplyAudio | null {
  const result = matchReplyToAudio(text, language, { minConfidence: 0.50 });
  if (result.match && result.audioBuffer && result.recording) {
    return {
      recording: result.recording,
      audioBuffer: result.audioBuffer,
      confidence: result.confidence,
    };
  }
  return null;
}
