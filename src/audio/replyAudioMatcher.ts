import fs from "fs";
import path from "path";
import { AUDIO_RECORDINGS, AudioRecording, normalizeRecordingLanguage } from "./recordingRegistry";

export interface RecordedReplyAudio {
  recording: AudioRecording;
  audioBuffer: Buffer;
}

const audioBufferCache = new Map<string, Buffer>();

function normalizeReplyText(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function recordingPath(recording: AudioRecording): string | null {
  const root = recording.assetRoot === "supplied"
    ? path.resolve(process.cwd(), "Audio_files", "audio")
    : recording.assetRoot === "public"
      ? path.resolve(process.cwd(), "public", "audio")
      : null;
  if (!root) return null;

  const resolved = path.resolve(root, recording.relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    return null;
  }
  return resolved;
}

/**
 * Match only a complete, known transcript in the requested language.
 * Fuzzy matching could play a recording whose meaning differs from the AI reply.
 */
export function findRecordedReplyAudio(text: string, language: string): RecordedReplyAudio | null {
  const wantedLanguage = normalizeRecordingLanguage(language);
  const normalizedText = normalizeReplyText(text);
  if (!wantedLanguage || !normalizedText) return null;

  const candidates = AUDIO_RECORDINGS
    .filter((recording) =>
      recording.language === wantedLanguage &&
      recording.spokenText &&
      recording.recordingRole === "fixed" &&
      !recording.isAlternate &&
      recording.url
    )
    .sort((a, b) => {
      const rootPriority = (recording: AudioRecording) => recording.assetRoot === "supplied" ? 0 : 1;
      return rootPriority(a) - rootPriority(b);
    });

  const recording = candidates.find((candidate) =>
    normalizeReplyText(candidate.spokenText || "") === normalizedText
  );
  if (!recording) return null;

  const filePath = recordingPath(recording);
  if (!filePath) return null;

  let audioBuffer = audioBufferCache.get(filePath);
  if (!audioBuffer) {
    audioBuffer = fs.readFileSync(filePath);
    audioBufferCache.set(filePath, audioBuffer);
  }

  return { recording, audioBuffer };
}
