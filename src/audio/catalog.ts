import fs from "fs";
import path from "path";
import { AUDIO_RECORDINGS, AudioRecording } from "./recordingRegistry";

export interface AudioPromptMetadata {
  id: string;
  stepNumber: number;
  filename: string;
  language: "twi";
  title: string;
  spokenText: string;
  description: string;
  promptId: string | null;
  context: string;
  url: string;
}

export const AUDIO_CATALOG: AudioPromptMetadata[] = AUDIO_RECORDINGS.map((recording) => ({
  id: recording.id,
  stepNumber: recording.promptId ? Number(recording.promptId.slice(2)) : 0,
  filename: recording.relativePath,
  language: "twi",
  title: recording.title,
  spokenText: recording.spokenText || "",
  description: recording.context,
  promptId: recording.promptId,
  context: recording.context,
  url: recording.url,
}));

export const AUDIO_CATALOG_ALTERNATES: AudioPromptMetadata[] = [];
export const ALL_AUDIO_CATALOG = AUDIO_CATALOG;

export function audioFileExists(filename: string): boolean {
  const normalized = filename.replace(/^Twi\//, "");
  const relativePath = normalized.startsWith("Twi/") ? normalized : `Twi/${normalized}`;
  const recording: AudioRecording | undefined = AUDIO_RECORDINGS.find(
    (item) => item.relativePath === relativePath
  );
  if (!recording) return false;

  const audioRoot = path.resolve(process.cwd(), "Audio_files", "audio");
  const resolved = path.resolve(audioRoot, recording.relativePath);
  return resolved.startsWith(`${audioRoot}${path.sep}`) &&
    fs.existsSync(resolved) &&
    !fs.statSync(resolved).isDirectory();
}
