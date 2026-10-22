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

import { resolveSafeAudioPath } from "./streaming";

export function getAudioFilePath(filename: string, assetRoot?: AudioAssetRoot): string | null {
  const recording = AUDIO_RECORDINGS.find((item) =>
    item.relativePath === filename && (assetRoot === undefined || item.assetRoot === assetRoot)
  );
  if (recording) {
    const root = recording.assetRoot === "supplied"
      ? path.resolve(process.cwd(), "Audio_files")
      : recording.assetRoot === "public"
        ? path.resolve(process.cwd(), "public", "audio")
        : path.resolve(process.cwd(), "Audio_files");
    const resolved = path.resolve(root, recording.relativePath);
    if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
      return resolved;
    }
  }

  // Resolve extension and case differences through the same guarded audio path used by streaming.
  try {
    const safe = resolveSafeAudioPath(filename);
    if (safe && fs.existsSync(safe) && !fs.statSync(safe).isDirectory()) {
      return safe;
    }
  } catch {}

  return null;
}

export function audioFileExists(filename: string, assetRoot?: AudioAssetRoot): boolean {
  return getAudioFilePath(filename, assetRoot) !== null;
}

export function getAudioFileSize(filename: string, assetRoot?: AudioAssetRoot): number {
  const filePath = getAudioFilePath(filename, assetRoot);
  if (filePath) {
    try {
      return fs.statSync(filePath).size;
    } catch {}
  }
  return 0;
}

