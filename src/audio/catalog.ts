import fs from "fs";
import path from "path";
import { AUDIO_RECORDINGS, AudioAssetRoot, AudioRecording } from "./recordingRegistry";

export interface AudioPromptMetadata {
  id: string;
  stepNumber: number;
  filename: string;
  language: AudioRecording["language"];
  title: string;
  spokenText: string;
  description: string;
  promptId: string | null;
  context: string;
  url: string | null;
  assetRoot: AudioAssetRoot;
  mimeType: string;
  isAlternate: boolean;
  recordingRole: AudioRecording["recordingRole"];
}

export const AUDIO_ASSET_INVENTORY: AudioPromptMetadata[] = AUDIO_RECORDINGS.map((recording) => ({
  id: recording.id,
  stepNumber: recording.promptId ? Number(recording.promptId.slice(2)) : 0,
  filename: recording.relativePath,
  language: recording.language,
  title: recording.title,
  spokenText: recording.spokenText || "",
  description: recording.context,
  promptId: recording.promptId,
  context: recording.context,
  url: recording.url,
  assetRoot: recording.assetRoot,
  mimeType: recording.mimeType,
  isAlternate: recording.isAlternate,
  recordingRole: recording.recordingRole,
}));

export const AUDIO_CATALOG = AUDIO_ASSET_INVENTORY.filter(
  (recording) => recording.language !== "unresolved" && recording.url !== null
);

export const AUDIO_CATALOG_ALTERNATES: AudioPromptMetadata[] = AUDIO_CATALOG.filter(
  (recording) => recording.isAlternate
);
export const ALL_AUDIO_CATALOG = AUDIO_CATALOG;

export function audioFileExists(filename: string, assetRoot?: AudioAssetRoot): boolean {
  const recording = AUDIO_RECORDINGS.find((item) =>
    item.relativePath === filename && (assetRoot === undefined || item.assetRoot === assetRoot)
  );
  if (!recording) return false;

  const root = recording.assetRoot === "supplied"
    ? path.resolve(process.cwd(), "Audio_files", "audio")
    : recording.assetRoot === "public"
      ? path.resolve(process.cwd(), "public", "audio")
      : path.resolve(process.cwd(), "Audio_files_2");
  const resolved = path.resolve(root, recording.relativePath);
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) return true;

  // Extension variations (.mp3, .m4a, .aac)
  const ext = path.extname(resolved).toLowerCase();
  for (const altExt of [".mp3", ".m4a", ".aac"]) {
    if (altExt === ext) continue;
    const altPath = resolved.slice(0, -ext.length) + altExt;
    if (fs.existsSync(altPath) && !fs.statSync(altPath).isDirectory()) return true;
  }

  // Check category directory
  const baseName = path.basename(recording.relativePath, ext).toLowerCase();
  const dirName = path.dirname(resolved);
  if (fs.existsSync(dirName)) {
    const dirFiles = fs.readdirSync(dirName);
    const match = dirFiles.find((f) => {
      const fBase = path.basename(f, path.extname(f)).toLowerCase();
      return (
        fBase === baseName ||
        fBase.startsWith(baseName.slice(0, 6)) ||
        baseName.startsWith(fBase.slice(0, 6)) ||
        (baseName.includes("read back") && fBase.includes("amount"))
      );
    });
    if (match) return true;
  }

  // Check recursively across root
  try {
    const allRootFiles = fs.readdirSync(root, { recursive: true }) as string[];
    const matchAny = allRootFiles.find((f) => {
      const fBase = path.basename(String(f), path.extname(String(f))).toLowerCase();
      return fBase === baseName || fBase.startsWith(baseName.slice(0, 8)) || baseName.startsWith(fBase.slice(0, 8));
    });
    if (matchAny) return true;
  } catch {}

  return false;
}
