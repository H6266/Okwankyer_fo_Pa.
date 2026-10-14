import { AUDIO_RECORDINGS, AudioRecording, normalizeRecordingLanguage } from "./recordingRegistry";
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

function resolveDiskPath(audioUrlOrRelative: string, assetRoot: "supplied" | "public" = "supplied"): string | null {
  const { fs, path } = getNodeModules();
  if (!fs || !path) return null;

  const clean = audioUrlOrRelative.replace(/^\/audio\//, "").replace(/^\/+/, "");
  const decoded = decodeURIComponent(clean);

  // 1. Direct checks
  const candidates = [
    path.resolve(process.cwd(), "Audio_files", "audio", decoded),
    path.resolve(process.cwd(), "public", "audio", decoded),
    path.resolve(process.cwd(), "Audio_files_2", decoded),
  ];

  if (/^twi\//i.test(decoded)) {
    candidates.unshift(path.resolve(process.cwd(), "Audio_files", "audio", "Twi", decoded.slice(4)));
  }

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
  welcome: [
    "welcome to mtn mobile money",
    "welcome to mobile money",
    "akwaaba kɔ mtn",
    "akwaaba kɔ mobile money",
    "how can i help you today",
    "yɛbɛtumi aboa wo dɛn",
  ],
  description: [
    "service description",
    "ɔkwankyerɛfo pa",
    "nne dwumadie",
    "voice accessibility service",
  ],
  network_selection: [
    "network selection",
    "paw network",
    "destination network",
    "sɛ ɛyɛ mtn a mia 1",
  ],
  services_selection: [
    "service selection",
    "services selection",
    "paw dwumadie",
    "sɛ wopɛ sɛ womane sika a mia 1",
  ],
  send_money_selected: [
    "send money selected",
    "woremane sika",
    "wopɛ sɛ womane sika",
    "proceeding to transfer",
  ],
  enter_recipient: [
    "enter recipient",
    "recipient phone number",
    "ten digit phone number",
    "fon nɔmba a ɛyɛ du",
    "obi a woremane no",
    "what is the phone number",
  ],
  enter_amount: [
    "enter amount",
    "how many ghana cedis",
    "how much do you want to send",
    "sika dodow a wopɛ",
    "bɔ sika dodow no",
  ],
  confirmation_intro: [
    "confirmation intro",
    "transaction confirmation",
    "yɛrekɔ confirmation",
  ],
  review_transaction: [
    "review transaction",
    "hwɛ wo transaction",
    "review your transaction details",
  ],
  ready_submit_confirm: [
    "ready submit",
    "confirm speech",
    "sɛ wopene so a mia 1",
    "to confirm and submit press 1",
    "say yes or press 1",
  ],
  reject_error: [
    "reject speech",
    "transaction cancelled",
    "wotwaa transaction no mu",
    "transfer was not executed",
  ],
  success_sent: [
    "success sent",
    "transfer sent successfully",
    "sika no akɔ pɛpɛɛpɛ",
    "momo transaction no agye atom",
  ],
  success_close: [
    "success close",
    "thank you for using",
    "meda wo ase",
    "nante yie",
    "goodbye",
  ],
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

  // 1. Check Sequential Flow Steps (strictly for Twi language)
  if (isTwi) {
    for (const step of TWI_SEQUENTIAL_FLOW_STEPS) {
      if (!step.audioUrl) continue;
      const targetScript = step.spokenTextTwi;
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
  }

  // 2. Check full AUDIO_RECORDINGS library
  const catalogCandidates = AUDIO_RECORDINGS.filter((r) => {
    if (wantedLanguage && r.language !== wantedLanguage) return false;
    return Boolean(r.spokenText && r.url);
  });

  for (const recording of catalogCandidates) {
    if (!recording.spokenText || !recording.url) continue;
    const { confidence, reason } = calculateMatchConfidence(text, recording.spokenText, []);
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
