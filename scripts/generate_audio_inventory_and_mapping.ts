import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import {
  AUDIO_RECORDINGS,
  AudioRecording,
  getRecordingsByPromptId,
} from "../src/audio/recordingRegistry";
import { CANONICAL_PROMPT_LIST } from "../src/audio/canonicalRegistry";

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
  if (normalized.includes("/twi/") || normalized.startsWith("audio_files/twi_library/") || normalized.startsWith("audio_files/twi/")) return "twi";
  if (normalized.includes("/english/") || normalized.startsWith("audio_files/english_library/")) return "en";
  return "unresolved";
}

function normalizedAudioPath(value: string): string {
  return value.toLowerCase().replace(/\.(?:mp3|m4a|wav|ogg|aac|flac)$/i, "");
}

function recordingForPath(relativePath: string): AudioRecording | undefined {
  return AUDIO_RECORDINGS.find((recording) => {
    if (recording.assetRoot === "public") {
      return normalizedAudioPath(`public/audio/${recording.relativePath}`) === normalizedAudioPath(relativePath);
    }
    if (recording.assetRoot === "supplied" || recording.assetRoot === "additional") {
      const canonicalPath = normalizedAudioPath(`Audio_files/${recording.relativePath}`);
      const legacyPath = recording.legacyRelativePath
        ? normalizedAudioPath(`Audio_files/${recording.legacyRelativePath}`)
        : null;
      return canonicalPath === normalizedAudioPath(relativePath)
        || legacyPath === normalizedAudioPath(relativePath);
    }
    return false;
  });
}

function physicalPathForRecording(recording: AudioRecording): string {
  const relativePath = recording.assetRoot === "public"
    ? `public/audio/${recording.relativePath}`
    : `Audio_files/${recording.relativePath}`;
  if (fs.existsSync(relativePath)) return relativePath;
  if (recording.legacyRelativePath) {
    const legacyPath = `Audio_files/${recording.legacyRelativePath}`;
    if (fs.existsSync(legacyPath)) return legacyPath;
  }
  return `MISSING: ${relativePath}`;
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
      const header = fs.readFileSync(full).subarray(0, 12);
      const actualFormat = header.length >= 8 && header.toString("ascii", 4, 8) === "ftyp"
        ? "audio/mp4"
        : formatByExtension[ext] || "unknown";
      const recording = recordingForPath(rel);
      const lang = recording?.language === "unresolved" ? languageForPath(rel) : recording?.language || languageForPath(rel);
      const promptId = recording?.promptId || "";
      const status = recording
        ? recording.audioVerified ? "AUDIO_VERIFIED" : "CANDIDATE_NOT_AUDIO_VERIFIED"
        : "UNMAPPED_CANDIDATE";
      const notes = recording
        ? `Registry mapping; role=${recording.recordingRole}; audioVerified=${recording.audioVerified}.${actualFormat !== formatByExtension[ext] ? ` Detected container=${actualFormat}; filename extension=${ext}.` : ""}`
        : "No exact canonical registry mapping; requires human review.";

      entries.push({
        assetId: `AST-${String(idCounter++).padStart(4, "0")}`,
        filename: item.name,
        relativePath: rel,
        extension: ext,
        language: lang,
        probablePromptId: promptId,
        durationSeconds: dur,
        audioFormat: actualFormat,
        fileSizeBytes: size,
        transcription: recording?.spokenText
          ? `UNVERIFIED SCRIPT: ${recording.spokenText}`
          : "NOT_AUDIO_VERIFIED",
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

const promptEntries = CANONICAL_PROMPT_LIST;
const coverageStatuses = ["VERIFIED_FIXED_ASSET", "CANDIDATE_NOT_AUDIO_VERIFIED", "AMBIGUOUS_REVIEW_REQUIRED", "DYNAMIC_TTS_REQUIRED", "SAFE_FALLBACK_ONLY", "MISSING_ASSET"] as const;

function coverage(promptId: string, language: "en" | "twi", type: string, script: string): { status: string; paths: string } {
  if (type.toUpperCase() === "DYNAMIC") return { status: "DYNAMIC_TTS_REQUIRED", paths: "" };
  const recordings = getRecordingsByPromptId(promptId, language);
  const eligible = recordings.filter((recording) =>
    recording.audioVerified
    && recording.recordingRole === "fixed"
    && !physicalPathForRecording(recording).startsWith("MISSING:")
  );
  const paths = (eligible.length > 0 ? eligible : recordings).map(physicalPathForRecording).join("<br>");

  if (eligible.length === 1) return { status: "VERIFIED_FIXED_ASSET", paths };
  if (recordings.some((recording) => recording.mappingStatus.startsWith("AMBIGUOUS")) || recordings.length > 1) {
    return { status: "AMBIGUOUS_REVIEW_REQUIRED", paths };
  }
  if (recordings.length > 0) {
    return {
      status: paths.includes("MISSING:") ? "MISSING_ASSET" : "CANDIDATE_NOT_AUDIO_VERIFIED",
      paths,
    };
  }
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

const verifiedRegistryCount = AUDIO_RECORDINGS.filter((recording) =>
  recording.audioVerified && recording.recordingRole === "fixed" && !physicalPathForRecording(recording).startsWith("MISSING:")
).length;
const verifiedTwiRecordingCount = AUDIO_RECORDINGS.filter((recording) =>
  recording.audioVerified && recording.recordingRole === "fixed" && recording.language === "twi"
    && !physicalPathForRecording(recording).startsWith("MISSING:")
).length;
const verifiedEnglishRecordingCount = AUDIO_RECORDINGS.filter((recording) =>
  recording.audioVerified && recording.recordingRole === "fixed" && recording.language === "en"
    && !physicalPathForRecording(recording).startsWith("MISSING:")
).length;

const mappingMarkdown = [
  "# Canonical IVR Audio Mapping",
  "",
  "Generated from the prompt manifest, runtime registry, and current checkout by `scripts/generate_audio_inventory_and_mapping.ts`.",
  "",
  `The inventory contains ${entries.length} physical audio files. The approved library contains ${verifiedTwiRecordingCount} Twi and ${verifiedEnglishRecordingCount} English fixed recordings. Canonical audio URLs are served from their registered asset roots. Other candidate and ambiguous files remain blocked from automatic playback. Dynamic prompts must use validated live values and approved TTS; no static sample audio is eligible for them.`,
  "",
  `Coverage totals (English and Twi combined): ${coverageStatuses.map((status) => `${status} ${coverageCounts[status] || 0}`).join(", ")}.`,
  "",
  "| Prompt ID | State | Type | English status | English asset path(s) | Twi status | Twi asset path(s) |",
  "|---|---|---|---|---|---|---|",
  ...coverageRows,
  "",
  "## Review Rules",
  "",
  "For any new or changed recording, decode and listen to it, check it against the canonical script, check for combined prompts or sample transaction values, and obtain qualified language review where needed. Keep `audioVerified=true` only for recordings approved for runtime playback, then regenerate this file and the inventory.",
].join("\n");

fs.writeFileSync("docs/IVR_AUDIO_MAPPING.md", mappingMarkdown, "utf8");
console.log(`✓ Wrote docs/IVR_AUDIO_MAPPING.md (${promptEntries.length} prompts)`);

const rootCounts = {
  canonicalTwi: entries.filter((entry) => entry.relativePath.startsWith("Audio_files/audio/Twi/")).length,
  legacyTwi: entries.filter((entry) => entry.relativePath.startsWith("Audio_files/Twi_library/")).length,
  audioFilesOther: entries.filter((entry) =>
    entry.relativePath.startsWith("Audio_files/")
    && !entry.relativePath.startsWith("Audio_files/audio/Twi/")
    && !entry.relativePath.startsWith("Audio_files/Twi_library/")
  ).length,
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
const mislabeledMp4Count = entries.filter((entry) => entry.extension === ".mp3" && entry.audioFormat === "audio/mp4").length;
const auditMarkdown = [
  "# IVR Audio Asset Audit",
  "",
  "Generated from the checked-out repository by `scripts/generate_audio_inventory_and_mapping.ts`.",
  "",
  `The current checkout contains **${entries.length} audio files**. Extension counts: ${Object.entries(extensionCounts).map(([extension, count]) => `${extension} ${count}`).join(", ")}.`,
  "",
  `${mislabeledMp4Count} Twi recordings contain M4A/MP4 data despite their .mp3 filenames. Browser streaming serves the detected audio/mp4 type; telephony requests transcode them to MP3 with the bundled FFmpeg binary.`,
  "",
  "| Current root | Audio files |\n|---|---:|\n| Canonical `Audio_files/audio/Twi/` | " + rootCounts.canonicalTwi + " |\n| Legacy `Audio_files/Twi_library/` | " + rootCounts.legacyTwi + " |\n| Other files under `Audio_files/` | " + rootCounts.audioFilesOther + " |\n| `public/audio/` | " + rootCounts.publicAudio + " |\n| `audio/` | " + rootCounts.audioDirectory + " |\n| Repository root | " + rootCounts.repositoryRoot + " |",
  "",
  "The runtime registry contains " + AUDIO_RECORDINGS.length + " selected entries, and " + verifiedRegistryCount + " are approved fixed recordings. Physical files without an exact registry path remain unmapped candidates.",
  "",
  `${verifiedRegistryCount} approved fixed recordings are enabled for runtime playback. Unapproved candidate and ambiguous recordings stay blocked; dynamic prompts use validated live values and the dynamic speech path.`,
  "",
  "The per-prompt English/Twi statuses and exact registered asset paths are in `docs/IVR_AUDIO_MAPPING.md`. The complete physical inventory, including exact paths, sizes, durations when `ffprobe` is installed, and SHA-256 hashes, is in `docs/IVR_AUDIO_INVENTORY.csv`.",
  "",
  `The approved library contains ${verifiedTwiRecordingCount} Twi and ${verifiedEnglishRecordingCount} English fixed recordings. Review new or changed assets against the canonical script and obtain qualified language review where needed before enabling them.`,
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
  "The checkout contains " + entries.length + " audio files across canonical `Audio_files/audio/Twi/` (" + rootCounts.canonicalTwi + "), legacy `Audio_files/Twi_library/` (" + rootCounts.legacyTwi + "), other `Audio_files/` paths (" + rootCounts.audioFilesOther + "), `public/audio/` (" + rootCounts.publicAudio + "), `audio/` (" + rootCounts.audioDirectory + "), and the repository root (" + rootCounts.repositoryRoot + ").",
  "",
  `${mislabeledMp4Count} Twi files have M4A/MP4 bytes behind .mp3 names. Browser playback uses the detected media type; telephony URLs are converted to MP3 with the bundled FFmpeg binary.`,
  "",
  `The runtime registry contains ${AUDIO_RECORDINGS.length} selected assets. The resolver accepts only approved, language-matched recordings with audioVerified=true. Fixed prompts without an approved recording use text recovery; only dynamic prompts may request language-matched TTS.`,
  "",
  "Full path-by-path inventory: `docs/IVR_AUDIO_INVENTORY.csv`. Per-prompt language coverage: `docs/IVR_AUDIO_MAPPING.md`.",
  "",
  "## Call narrative",
  "",
  "1. OP01 plays once with language choices. OP02 is reserved for replay and recovery so the choices are not duplicated.",
  "2. Language selection locks the session language, then routes through service, network, and send-money menus in order.",
  "3. Recipient verification reads the OP19 introduction, live OP20 name, live OP21 full phone digits, then OP23 keypad confirmation.",
  "4. Amount entry uses OP28/OP26, validates the completed # input, and asks OP29 accept/change/cancel before final review.",
  "5. OP35 reviews the live amount, recipient, network, and last four phone digits. Editing recipient or amount clears stale fields and requires new read-back.",
  "6. Final confirmation submits through the payment saga and hands authorization to the provider's secure handset prompt. Pending or unknown status remains in a repeated status-check branch; only trusted completion receives OP52.",
  "7. OP52 uses the current transaction record and labels an OKP reference as an application reference. Post-success navigation offers another supported transfer or exit.",
  "",
  "## Zero-PIN boundary",
  "",
  "All legacy PIN URLs refuse keypad and speech input. Authorization belongs on the provider's secure handset prompt. Pending remains pending; no PIN, sample transaction, or locally generated reference can substitute for provider evidence.",
  "",
  "## Review and release limits",
  "",
  `The approved library contains ${verifiedTwiRecordingCount} Twi and ${verifiedEnglishRecordingCount} English fixed recordings. Review Twi pronunciation and scripts for any newly added assets before enabling them. Dynamic speech and real provider callbacks require their approved provider configuration. Run \`npx tsx scripts/generate_audio_inventory_and_mapping.ts\` after asset changes; only approved assets should have \`audioVerified=true\`.`,
].join("\n");

fs.writeFileSync("docs/AUDIO_ASSET_AND_FLOW_MAP.md", flowMapMarkdown, "utf8");
console.log("✓ Wrote docs/AUDIO_ASSET_AND_FLOW_MAP.md");
