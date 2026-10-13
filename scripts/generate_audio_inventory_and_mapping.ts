import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

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
    const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: "utf8" });
    const val = parseFloat(out.trim());
    return isNaN(val) ? "0.00" : val.toFixed(2);
  } catch {
    return "0.00";
  }
}

function getSha(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

// Load manifest
const twiManifest = JSON.parse(fs.readFileSync("Audio_files/TWI_AUDIO_LINK_MANIFEST.json", "utf8"));
const promptsManifest = JSON.parse(fs.readFileSync("Audio_files/prompts.json", "utf8"));

// Canonical prompt definitions OP01 - OP94
const canonicalPrompts = twiManifest.canonicalPrompts as Array<{
  promptId: string;
  state: string;
  englishScript: string;
  twiWorkingScript: string;
  type: string;
  mappingStatus: string;
  usePolicy: string;
}>;

const entries: AudioEntry[] = [];
let idCounter = 1;

function scanDir(dir: string, defaultLang: string) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) {
      scanDir(full, defaultLang);
    } else if (/\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(item)) {
      const rel = path.relative(process.cwd(), full).replace(/\\/g, "/");
      const ext = path.extname(item).toLowerCase();
      const size = fs.statSync(full).size;
      const dur = getDuration(full);
      const sha = getSha(full);
      const isM4a = ext === ".m4a";
      const format = isM4a ? "audio/mp4 (AAC)" : "audio/mpeg (MP3)";

      let lang = defaultLang;
      let promptId = "";
      let status = "CANDIDATE";
      let notes = "";
      let transcription = "NOT_VERIFIED";

      if (rel.includes("Audio_files/audio/Twi")) {
        lang = "twi";
        notes = "Supplied studio Twi take";
        // Check prompts.json mapping
        for (const p of promptsManifest.prompts) {
          if (p.audio?.twi && p.audio.twi.endsWith(item)) {
            promptId = p.id;
            break;
          }
          if (p.audio?.twi_other_takes?.some((t: string) => t.endsWith(item))) {
            promptId = p.id;
            notes = "Alternate Twi take in Audio_files";
            break;
          }
        }
      } else if (rel.includes("public/audio/English")) {
        lang = "en";
        const m = item.match(/\d{2}/);
        if (m) promptId = "OP" + m[0];
        else if (item.toLowerCase().includes("welcome")) promptId = "OP01";
        notes = "Legacy English take in public/audio";
      } else if (rel.includes("public/audio/Twi")) {
        lang = "twi";
        const m = item.match(/\d{2}/);
        if (m) promptId = "OP" + m[0];
        else if (item.toLowerCase().includes("welcome")) {
          promptId = "OP01";
          status = "AMBIGUOUS_COMBINED_WELCOME_LANGUAGE_PROMPT";
          notes = "Combined welcome and language prompt (shared bytes with English welcome)";
        }
        if (item === "Audio_prompt_twi_02.mp3") {
          status = "TRANSCRIPT_CANDIDATE_NOT_AUDIO_VERIFIED";
          notes = "Transcript indicates Network Selection (OP08), legacy mapped to 02";
        }
      } else if (rel.includes("Audio_files_2")) {
        lang = "twi";
        notes = "Audio_files_2 recovery/terminal audio take";
        // Match by title
        const titleClean = item.replace(/\.m4a$/i, "").toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const cp of canonicalPrompts) {
          const stateClean = cp.state.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (titleClean === stateClean || titleClean.includes(stateClean) || stateClean.includes(titleClean)) {
            promptId = cp.promptId;
            break;
          }
        }
      } else if (rel === "test_render_welcome.mp3") {
        lang = "en";
        promptId = "OP01";
        notes = "Render test audio asset in repo root";
      }

      entries.push({
        assetId: `AST-${String(idCounter++).padStart(3, "0")}`,
        filename: item,
        relativePath: rel,
        extension: ext,
        language: lang,
        probablePromptId: promptId,
        durationSeconds: dur,
        audioFormat: format,
        fileSizeBytes: size,
        transcription,
        mappedPromptId: promptId,
        mappingStatus: status,
        playbackTestStatus: "UNTESTED",
        notes,
        sha256: sha,
      });
    }
  }
}

scanDir(path.resolve("Audio_files/audio"), "twi");
scanDir(path.resolve("Audio_files_2"), "twi");
scanDir(path.resolve("public/audio"), "unresolved");
if (fs.existsSync("test_render_welcome.mp3")) {
  scanDir(path.resolve("."), "en"); // Will only catch test_render_welcome.mp3 at root
}

// Generate CSV
const csvRows = [
  "asset_id,filename,relative_path,extension,language,probable_prompt_id,duration_seconds,audio_format,file_size_bytes,transcription,mapped_prompt_id,mapping_status,playback_test_status,notes",
  ...entries.map((e) =>
    `"${e.assetId}","${e.filename}","${e.relativePath}","${e.extension}","${e.language}","${e.probablePromptId}","${e.durationSeconds}","${e.audioFormat}",${e.fileSizeBytes},"${e.transcription}","${e.mappedPromptId}","${e.mappingStatus}","${e.playbackTestStatus}","${e.notes.replace(/"/g, '""')}"`
  ),
];

fs.writeFileSync("docs/IVR_AUDIO_INVENTORY.csv", csvRows.join("\n"), "utf8");
console.log(`✓ Wrote docs/IVR_AUDIO_INVENTORY.csv (${entries.length} items)`);
