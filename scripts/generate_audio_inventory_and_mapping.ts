import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import {
  AUDIO_RECORDINGS,
  AudioRecording,
  getPromptManifestEntries,
  getRecordingsByPromptId,
} from "../src/audio/recordingRegistry";

interface AudioEntry {
  assetId: string;
  filename: string;
  relativePath: string;
  extension: string;
  language: string;
  probablePromptId: string;
  durationSeconds: string;
  audioFormat: string;
  fileSizeBytes: number;
  transcription: string;
  mappedPromptId: string;
  mappingStatus: string;
  playbackTestStatus: string;
  notes: string;
  sha256: string;
}

function getDuration(filePath: string): string {
  try {
    const out = execFileSync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { encoding: "utf8" });
    const val = parseFloat(out.trim());
    return isNaN(val) ? "" : val.toFixed(2);
  } catch {
    return "";
  }
}

function getSha(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

const entries: AudioEntry[] = [];
let idCounter = 1;

const audioExtensions = new Set([".mp3", ".m4a", ".wav", ".ogg", ".aac", ".flac"]);

function languageForPath(relativePath: string): string {
  const normalized = relativePath.toLowerCase();
  if (normalized.includes("/twi/") || normalized.startsWith("audio_files/twi/")) return "twi";
  if (normalized.includes("/english/")) return "en";
  return "unresolved";
}

function recordingForPath(relativePath: string): AudioRecording | undefined {
  return AUDIO_RECORDINGS.find((recording) => {
    if (recording.assetRoot === "public") return `public/audio/${recording.relativePath}` === relativePath;
    if (recording.assetRoot === "supplied" || recording.assetRoot === "additional") {
      return `Audio_files/${recording.relativePath}` === relativePath;
    }
    return false;
  });
}

function scanDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      scanDir(full);
    } else if (item.isFile() && audioExtensions.has(path.extname(item.name).toLowerCase())) {
      const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
      const ext = path.extname(item.name).toLowerCase();
      const size = fs.statSync(full).size;
      const dur = getDuration(full);
      const sha = getSha(full);
      const formatByExtension: Record<string, string> = {
        ".aac": "audio/aac",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".wav": "audio/wav",
      };
      const recording = recordingForPath(rel);
      const lang = recording?.language === "unresolved" ? languageForPath(rel) : recording?.language || languageForPath(rel);
      const promptId = recording?.promptId || "";
      const status = recording?.mappingStatus || "UNMAPPED_CANDIDATE";
      const notes = recording
        ? `Exact registry mapping; role=${recording.recordingRole}; playback requires VERIFIED status.`
        : "No exact canonical registry mapping; requires human review.";

      entries.push({
        assetId: `AST-${String(idCounter++).padStart(4, "0")}`,
        filename: item.name,
        relativePath: rel,
        extension: ext,
        language: lang,
        probablePromptId: promptId,
        durationSeconds: dur,
        audioFormat: formatByExtension[ext] || "unknown",
        fileSizeBytes: size,
        transcription: "NOT_AUDIO_VERIFIED",
        mappedPromptId: promptId,
        mappingStatus: status,
        playbackTestStatus: "UNTESTED",
        notes,
        sha256: sha,
      });
    }
  }
}

scanDir(path.resolve("Audio_files"));
scanDir(path.resolve("public/audio"));
scanDir(path.resolve("audio"));
const rootTestAudio = path.resolve("test_render_welcome.mp3");
if (fs.existsSync(rootTestAudio)) {
  entries.push({
    assetId: `AST-${String(idCounter++).padStart(4, "0")}`,
    filename: path.basename(rootTestAudio),
    relativePath: path.relative(process.cwd(), rootTestAudio).replace(/\\/g, "/"),
    extension: path.extname(rootTestAudio).toLowerCase(),
    language: "unresolved",
    probablePromptId: "",
    durationSeconds: getDuration(rootTestAudio),
    audioFormat: "audio/mpeg",
    fileSizeBytes: fs.statSync(rootTestAudio).size,
    transcription: "NOT_AUDIO_VERIFIED",
    mappedPromptId: "",
    mappingStatus: "UNMAPPED_CANDIDATE",
    playbackTestStatus: "UNTESTED",
    notes: "Root-level test audio; not mapped to a production prompt.",
    sha256: getSha(rootTestAudio),
  });
}

// Generate CSV
const csvRows = [
  "asset_id,filename,relative_path,extension,language,probable_prompt_id,duration_seconds,audio_format,file_size_bytes,transcription,mapped_prompt_id,mapping_status,playback_test_status,notes,sha256",
  ...entries.map((e) =>
    `"${e.assetId}","${e.filename}","${e.relativePath}","${e.extension}","${e.language}","${e.probablePromptId}","${e.durationSeconds}","${e.audioFormat}",${e.fileSizeBytes},"${e.transcription}","${e.mappedPromptId}","${e.mappingStatus}","${e.playbackTestStatus}","${e.notes.replace(/"/g, '""')}","${e.sha256}"`
  ),
];

fs.writeFileSync("docs/IVR_AUDIO_INVENTORY.csv", csvRows.join("\n"), "utf8");
console.log(`✓ Wrote docs/IVR_AUDIO_INVENTORY.csv (${entries.length} items)`);

const promptEntries = getPromptManifestEntries();
const coverageStatuses = ["VERIFIED_FIXED_ASSET", "CANDIDATE_NOT_AUDIO_VERIFIED", "AMBIGUOUS_REVIEW_REQUIRED", "DYNAMIC_TTS_REQUIRED", "SAFE_FALLBACK_ONLY", "MISSING_ASSET"] as const;

function coverage(promptId: string, language: "en" | "twi", type: string, script: string): { status: string; paths: string } {
  if (type.toUpperCase() === "DYNAMIC") return { status: "DYNAMIC_TTS_REQUIRED", paths: "" };
  const recordings = getRecordingsByPromptId(promptId, language);
  const eligible = recordings.filter((recording) => recording.mappingStatus === "VERIFIED" && recording.recordingRole === "fixed");
  const paths = recordings.map((recording) => recording.assetRoot === "public"
    ? `public/audio/${recording.relativePath}`
    : `Audio_files/${recording.relativePath}`
  ).join("<br>");

  if (eligible.length === 1 && recordings.length === 1) return { status: "VERIFIED_FIXED_ASSET", paths };
  if (recordings.some((recording) => recording.mappingStatus.startsWith("AMBIGUOUS")) || recordings.length > 1) {
    return { status: "AMBIGUOUS_REVIEW_REQUIRED", paths };
  }
  if (recordings.length > 0) return { status: "CANDIDATE_NOT_AUDIO_VERIFIED", paths };
  return { status: script.trim() ? "SAFE_FALLBACK_ONLY" : "MISSING_ASSET", paths: "" };
}

const coverageRows = promptEntries.map((prompt) => {
  const en = coverage(prompt.id, "en", prompt.type, prompt.english);
  const twi = coverage(prompt.id, "twi", prompt.type, prompt.twi);
  return `| ${prompt.id} | ${prompt.state} | ${prompt.type} | ${en.status} | ${en.paths || "—"} | ${twi.status} | ${twi.paths || "—"} |`;
});
const coverageCounts = Object.fromEntries(coverageStatuses.map((status) => [status, 0]));
for (const prompt of promptEntries) {
  for (const language of ["en", "twi"] as const) {
    const result = coverage(prompt.id, language, prompt.type, language === "en" ? prompt.english : prompt.twi);
    coverageCounts[result.status] = (coverageCounts[result.status] || 0) + 1;
  }
}

const mappingMarkdown = [
  "# Canonical IVR Audio Mapping",
  "",
  "Generated from the prompt manifest, runtime registry, and current checkout by `scripts/generate_audio_inventory_and_mapping.ts`.",
  "",
  `The inventory contains ${entries.length} physical audio files. No recording is marked audio-verified in the current checkout. Candidate and ambiguous files are not eligible for automatic playback. Dynamic prompts must use validated live values and approved TTS; no static sample audio is eligible for them.`,
  "",
  `Coverage totals (English and Twi combined): ${coverageStatuses.map((status) => `${status} ${coverageCounts[status] || 0}`).join(", ")}.`,
  "",
  "| Prompt ID | State | Type | English status | English asset path(s) | Twi status | Twi asset path(s) |",
  "|---|---|---|---|---|---|---|",
  ...coverageRows,
  "",
  "## Review Rules",
  "",
  "Promote a recording only after it has been decoded and listened to, checked against the canonical script, checked for combined prompts or sample transaction values, and approved by a qualified language reviewer where needed. Update the manifest status and regenerate this file and the inventory after approval.",
].join("\n");

fs.writeFileSync("docs/IVR_AUDIO_MAPPING.md", mappingMarkdown, "utf8");
console.log(`✓ Wrote docs/IVR_AUDIO_MAPPING.md (${promptEntries.length} prompts)`);

const rootCounts = {
  audioFilesTwi: entries.filter((entry) => entry.relativePath.startsWith("Audio_files/Twi/")).length,
  audioFilesLegacyTree: entries.filter((entry) => entry.relativePath.startsWith("Audio_files/audio/")).length,
  audioFilesFlat: entries.filter((entry) => entry.relativePath.startsWith("Audio_files/") && !entry.relativePath.startsWith("Audio_files/Twi/") && !entry.relativePath.startsWith("Audio_files/audio/")).length,
  publicAudio: entries.filter((entry) => entry.relativePath.startsWith("public/audio/")).length,
  audioDirectory: entries.filter((entry) => entry.relativePath.startsWith("audio/")).length,
  repositoryRoot: entries.filter((entry) => !entry.relativePath.includes("/")).length,
};
const extensionCounts = Object.fromEntries(
  [...new Set(entries.map((entry) => entry.extension))].sort().map((extension) => [
    extension,
    entries.filter((entry) => entry.extension === extension).length,
  ])
);
const verifiedRegistryCount = AUDIO_RECORDINGS.filter((recording) =>
  recording.mappingStatus === "VERIFIED" && recording.recordingRole === "fixed"
).length;
const auditMarkdown = [
  "# IVR Audio Asset Audit",
  "",
  "Generated from the checked-out repository by `scripts/generate_audio_inventory_and_mapping.ts`.",
  "",
  `The current checkout contains **${entries.length} audio files**. Extension counts: ${Object.entries(extensionCounts).map(([extension, count]) => `${extension} ${count}`).join(", ")}.`,
  "",
  "| Current root | Audio files |\n|---|---:|\n| `Audio_files/Twi/` | " + rootCounts.audioFilesTwi + " |\n| `Audio_files/audio/` | " + rootCounts.audioFilesLegacyTree + " |\n| Other files under `Audio_files/` | " + rootCounts.audioFilesFlat + " |\n| `public/audio/` | " + rootCounts.publicAudio + " |\n| `audio/` | " + rootCounts.audioDirectory + " |\n| Repository root | " + rootCounts.repositoryRoot + " |",
  "",
  "There is no `Audio_files_2/` directory in this checkout. The 54 flat terminal/recovery recordings are under `Audio_files/`. The runtime registry contains " + AUDIO_RECORDINGS.length + " selected entries, and " + verifiedRegistryCount + " are approved fixed recordings.",
  "",
  "No recording is marked audio-verified. The current registry returns safe text/TTS fallback for candidate, ambiguous, missing, and dynamic recordings. A filename, transcript, hash, or successful HTTP response is not audio verification.",
  "",
  "The per-prompt English/Twi statuses and exact registered candidate paths are in `docs/IVR_AUDIO_MAPPING.md`. The complete physical inventory, including exact paths, sizes, durations when `ffprobe` is installed, and SHA-256 hashes, is in `docs/IVR_AUDIO_INVENTORY.csv`.",
  "",
  "Before promoting any asset, listen to it, compare its content with the canonical script, check for combined prompts and sample transaction values, and obtain a qualified Twi review where needed.",
].join("\n");

fs.writeFileSync("docs/IVR_AUDIO_AUDIT.md", auditMarkdown, "utf8");
console.log("✓ Wrote docs/IVR_AUDIO_AUDIT.md");

const flowMapMarkdown = [
  "# Audio Asset and Call Flow Map",
  "",
  "Generated from the current runtime audio policy and IVR integration.",
  "",
  "## Current inventory",
  "",
  "The checkout contains " + entries.length + " audio files across `Audio_files/Twi/` (" + rootCounts.audioFilesTwi + "), `Audio_files/audio/` (" + rootCounts.audioFilesLegacyTree + "), flat `Audio_files/` (" + rootCounts.audioFilesFlat + "), `public/audio/` (" + rootCounts.publicAudio + "), `audio/` (" + rootCounts.audioDirectory + "), and the repository root (" + rootCounts.repositoryRoot + "). `Audio_files_2/` is absent.",
  "",
  `The runtime registry contains ${AUDIO_RECORDINGS.length} selected assets. None is approved for automatic playback. The resolver accepts only one exact, language-matched, VERIFIED fixed asset; candidates, ambiguous mappings, and dynamic recordings use a safe text/TTS path instead.`,
  "",
  "Full path-by-path inventory: `docs/IVR_AUDIO_INVENTORY.csv`. Per-prompt language coverage: `docs/IVR_AUDIO_MAPPING.md`.",
  "",
  "## Call narrative",
  "",
  "1. Inbound call requests OP01 in English, then redirects to the language-selection route.",
  "2. The language-selection route requests OP02 separately. A selection locks the session language and proceeds to service selection.",
  "3. Service and network menus advertise only the currently supported service paths. The Twi service menu does not replay the welcome.",
  "4. Recipient digits and amount keys are collected until the caller presses #. The server validates only the completed value. Invalid recipient lengths do not trigger lookup.",
  "5. A valid recipient lookup is deduplicated per session and submitted number. The caller must explicitly confirm before continuing.",
  "6. Amount entry is validated and stored before the review. OP20 uses the live recipient name; OP21 reads all ten validated phone digits in order; OP29 reads the normalized amount.",
  "7. Payment submission requires the AMOUNT_ENTERED state and explicit confirmation. Duplicate confirmation is rejected while a submission is pending.",
  "8. Live provider requests hand off authorization to the official handset prompt. Pending or unknown status is not announced as success. OP52 receipt text uses the provider reference only after confirmed completion.",
  "",
  "## Zero-PIN boundary",
  "",
  "The simulator shows an external handset handoff, mutes its microphone, ignores keypad input in that state, and drops PIN-like speech before adding it to the transcript or logs. The simulator does not fabricate provider approval. Live VoiceXML directs callers to the official secure handset prompt; the application does not collect a PIN.",
  "",
  "## Review and release limits",
  "",
  "No recording was listened to or approved during this audit. Twi pronunciation and exact spoken contents remain unverified. Dynamic speech and real provider callbacks require their approved provider configuration. Run `npx tsx scripts/generate_audio_inventory_and_mapping.ts` after asset changes; only a human review may promote an asset to VERIFIED.",
].join("\n");

fs.writeFileSync("docs/AUDIO_ASSET_AND_FLOW_MAP.md", flowMapMarkdown, "utf8");
console.log("✓ Wrote docs/AUDIO_ASSET_AND_FLOW_MAP.md");
