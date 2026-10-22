/**
 * Maps canonical prompt identifiers to the supplied recordings registry.
 */

import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import {
  AUDIO_RECORDINGS,
  getRecordingByPromptId,
  getRecordingByPromptKey,
  getRecordingFilePath,
  PROMPT_KEY_TO_RECORDING_ID,
} from "../../../audio/recordingRegistry";

export interface StudioPromptMetadata {
  key: string;
  language: "en" | "tw" | "bilingual";
  relativeUrl: string;
  absolutePath: string;
  mimeType: string;
  fileSizeBytes: number;
  sampleRateHz: number | null;
  bitrateKbps: number | null;
  durationSec: number | null;
  spokenText: string;
  stepName: string;
  promptId: string;
}

export class StudioPromptRegistry {
  private static instance: StudioPromptRegistry;
  private metadataCache = new Map<string, StudioPromptMetadata>();
  private audioBufferCache = new Map<string, Buffer>();

  private constructor() {
    this.initializeRegistry();
  }

  public static getInstance(): StudioPromptRegistry {
    if (!StudioPromptRegistry.instance) {
      StudioPromptRegistry.instance = new StudioPromptRegistry();
    }
    return StudioPromptRegistry.instance;
  }

  private normalizeText(text: string): string {
    return text.toLowerCase().replace(/[-_]/g, " ").replace(/[^\w\sɛɔƐƆ]/g, "")
      .replace(/\s+/g, " ").trim();
  }

  private initializeRegistry(): void {
    const keysByPromptId = new Map<string, string[]>();
    for (const [key, promptId] of Object.entries(PROMPT_KEY_TO_RECORDING_ID)) {
      const keys = keysByPromptId.get(promptId) || [];
      keys.push(key);
      keysByPromptId.set(promptId, keys);
    }

    // Sort so supplied recordings take precedence over legacy public recordings
    const twiRecordings = AUDIO_RECORDINGS
      .filter((rec) => rec.audioVerified && rec.promptId && rec.spokenText && rec.recordingRole === "fixed")
      .sort((a, b) => {
        const rankA = a.assetRoot === "supplied" && !a.isAlternate ? 0 : a.assetRoot === "supplied" ? 1 : 2;
        const rankB = b.assetRoot === "supplied" && !b.isAlternate ? 0 : b.assetRoot === "supplied" ? 1 : 2;
        return rankB - rankA; // ascending priority means we insert lowest priority first, highest last so highest overwrites
      });

    for (const recording of twiRecordings) {
      const sourcePath = getRecordingFilePath(recording.relativePath);
      if (!sourcePath) continue;
      const absolutePath = path.resolve(process.cwd(), sourcePath);
      if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) continue;

      const stats = fs.statSync(absolutePath);
      const key = keysByPromptId.get(recording.promptId!)?.[0] || recording.state || recording.promptId!;
      const metadata: StudioPromptMetadata = {
        key,
        language: "tw",
        relativeUrl: recording.url,
        absolutePath,
        mimeType: recording.mimeType,
        fileSizeBytes: stats.size,
        sampleRateHz: null,
        bitrateKbps: null,
        durationSec: null,
        spokenText: recording.spokenText!,
        stepName: recording.state || recording.category,
        promptId: recording.promptId!,
      };

      for (const alias of [
        recording.promptId,
        recording.state || "",
        recording.title,
        recording.spokenText,
        path.basename(recording.relativePath, path.extname(recording.relativePath)),
        ...(keysByPromptId.get(recording.promptId!) || []),
      ]) {
        if (alias) this.metadataCache.set(this.normalizeText(alias), metadata);
      }
    }
  }

  public getPrompt(keyOrText: string, language: "en" | "tw" = "en"): StudioPromptMetadata | null {
    if (language !== "tw") return null;

    const cleanKey = this.normalizeText(keyOrText);
    const directMatch = this.metadataCache.get(cleanKey);
    if (directMatch) return directMatch;

    const promptIdMatch = keyOrText.match(/\bOP\d{2}\b/i);
    if (promptIdMatch) {
      const recording = getRecordingByPromptId(promptIdMatch[0].toUpperCase());
      if (recording) return this.metadataCache.get(this.normalizeText(recording.promptId || ""));
    }

    const semanticKey =
      cleanKey.includes("welcome") || cleanKey.includes("akwaaba")
        ? "welcome"
        : cleanKey.includes("amount") || cleanKey.includes("sika dodow")
        ? "enter_amount"
        : cleanKey.includes("recipient") || cleanKey.includes("number") || cleanKey.includes("phone")
        ? "enter_recipient"
        : cleanKey.includes("service") || cleanKey.includes("dwumadie")
        ? "service_select"
        : cleanKey.includes("network") || cleanKey.includes("carrier")
        ? "provider_select"
        : cleanKey.includes("action") || cleanKey.includes("menu")
        ? "action_select"
        : null;
    if (!semanticKey) return null;

    const recording = getRecordingByPromptKey(semanticKey);
    return recording?.promptId
      ? this.metadataCache.get(this.normalizeText(recording.promptId)) || null
      : null;
  }

  public getAudioBuffer(prompt: StudioPromptMetadata): Buffer {
    let buffer = this.audioBufferCache.get(prompt.absolutePath);
    if (!buffer) {
      buffer = fs.readFileSync(prompt.absolutePath);
      this.audioBufferCache.set(prompt.absolutePath, buffer);
    }
    return buffer;
  }

  public streamPrompt(req: Request, res: Response, prompt: StudioPromptMetadata): void {
    const buffer = this.getAudioBuffer(prompt);
    const fileSize = buffer.length;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = Number.parseInt(parts[0], 10);
      const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
      if (!Number.isInteger(start) || start < 0 || start >= fileSize || end >= fileSize || start > end) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
        return;
      }

      const chunk = buffer.subarray(start, end + 1);
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunk.length,
        "Content-Type": prompt.mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "X-Studio-Prompt-Key": prompt.key,
        "X-Studio-Prompt-Language": prompt.language,
      });
      res.end(chunk);
      return;
    }

    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": prompt.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Studio-Prompt-Key": prompt.key,
      "X-Studio-Prompt-Language": prompt.language,
    });
    res.end(buffer);
  }
}

export const studioPromptRegistry = StudioPromptRegistry.getInstance();
