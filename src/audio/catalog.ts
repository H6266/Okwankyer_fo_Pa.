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

export function getAudioFilePath(filename: string, _assetRoot?: AudioAssetRoot): string | null {
  try {
    const safe = resolveSafeAudioPath(filename);
    if (safe && fs.existsSync(safe) && !fs.statSync(safe).isDirectory()) {
      return safe;
    }
  } catch {}

  // Direct candidate checks
  const candidates = [
    path.resolve(process.cwd(), "Audio_files", filename),
    path.resolve(process.cwd(), "Audio_files", "Twi", filename),
    path.resolve(process.cwd(), "public", "audio", filename),
    path.resolve(process.cwd(), "audio", filename),
    path.resolve(process.cwd(), "Audio_files", path.basename(filename)),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) {
      return c;
    }
  }

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

