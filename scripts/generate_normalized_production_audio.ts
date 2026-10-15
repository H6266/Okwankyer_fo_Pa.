import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import promptsData from "../Audio_files/prompts.json";

function findAudio(dir: string): Record<string, string> {
  const results: Record<string, string> = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(results, findAudio(full));
    } else if (/\.(m4a|aac|mp3|wav)$/i.test(entry.name)) {
      const base = path.basename(entry.name, path.extname(entry.name)).toLowerCase().trim();
      results[base] = full;
    }
  }
  return results;
}

const audioMap = findAudio(path.resolve(process.cwd(), "Audio_files"));

const manualAliases: Record<string, string> = {
  OP01: "welcome 1 (2)",
  OP03: "greetings 2",
  OP16: "enter recipient 2",
  OP17: "invalid recipient 1",
  OP20: "recipient verify",
  OP21: "recipient found",
  OP22: "recipient confirm speech",
  OP23: "recipient confirm speech",
  OP24: "use recipient 1",
  OP26: "enter amount 4",
  OP29: "amount readback 2",
  OP31: "amount too high 3",
  OP33: "change amount 2",
  OP36: "confirm continue",
  OP52: "success",
  OP66: "no response",
};

const outputDir = path.resolve(process.cwd(), "public", "audio", "canonical");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const cacheDir = path.resolve(process.cwd(), ".cache", "audio_mp3");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

console.log("🔊 Generating loud, crystal-clear, broadcast-normalized MP3s for all prompts...");

let processed = 0;
for (const p of promptsData.prompts) {
  let base = manualAliases[p.id];
  if (!base) {
    const orig = p.audio?.twi || "";
    base = path.basename(orig, path.extname(orig)).toLowerCase().trim();
  }

  const sourceFile = audioMap[base];
  if (!sourceFile) {
    console.warn(`⚠️ Warning: No source file for ${p.id} (${p.state})`);
    continue;
  }

  const targetMp3 = path.join(outputDir, `${p.id}.mp3`);

  try {
    // Convert to loud, crystal-clear, EBU R128 broadcast normalized MP3 (-14 LUFS, peak -0.5 dB)
    execFileSync("ffmpeg", [
      "-y",
      "-i", sourceFile,
      "-af", "loudnorm=I=-14:TP=-0.5:LRA=9",
      "-codec:a", "libmp3lame",
      "-b:a", "128k",
      "-ar", "44100",
      targetMp3,
    ], { stdio: "ignore" });

    processed++;
  } catch (err: any) {
    console.error(`Error processing ${p.id} (${sourceFile}):`, err?.message || err);
  }
}

console.log(`✅ Successfully generated ${processed} normalized MP3 audio assets in ${outputDir}!`);
