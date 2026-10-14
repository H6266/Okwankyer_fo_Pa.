/**
 * Ɔkwankyerɛfo Pa - Safe Audio Streaming Service
 * 
 * Implements HTTP 206 Partial Content byte-range streaming for telecom carrier audio compatibility.
 * Strictly guards against path traversal using path.resolve and boundary validation.
 */

import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { LEGACY_AUDIO_MAP } from "./catalog";

export const AUDIO_ROOT_DIR = path.resolve(process.cwd(), "audio");

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathTraversalError";
  }
}

/**
 * Resolves requested subpath securely, preventing any breakout of the audio root directory.
 * Throws PathTraversalError if traversal is attempted.
 */
export function resolveSafeAudioPath(requestedSubpath: string): string | null {
  const decoded = decodeURIComponent(requestedSubpath || "");
  const normalized = decoded.replace(/\\/g, "/");
  const resolved = path.resolve(AUDIO_ROOT_DIR, normalized);

  // Strict boundary check: resolved path MUST start with AUDIO_ROOT_DIR + separator
  if (resolved !== AUDIO_ROOT_DIR && !resolved.startsWith(AUDIO_ROOT_DIR + path.sep)) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  // Direct file match
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
    return resolved;
  }

  // Check English subdirectory
  const inEnglish = path.resolve(AUDIO_ROOT_DIR, "English", decoded);
  if (inEnglish.startsWith(AUDIO_ROOT_DIR + path.sep) && fs.existsSync(inEnglish) && !fs.statSync(inEnglish).isDirectory()) {
    return inEnglish;
  }

  // Check Twi subdirectory
  const inTwi = path.resolve(AUDIO_ROOT_DIR, "Twi", decoded);
  if (inTwi.startsWith(AUDIO_ROOT_DIR + path.sep) && fs.existsSync(inTwi) && !fs.statSync(inTwi).isDirectory()) {
    return inTwi;
  }

  // Check legacy mappings
  const baseName = path.basename(decoded);
  if (LEGACY_AUDIO_MAP[baseName]) {
    const mapped = path.resolve(AUDIO_ROOT_DIR, LEGACY_AUDIO_MAP[baseName]);
    if (mapped.startsWith(AUDIO_ROOT_DIR + path.sep) && fs.existsSync(mapped) && !fs.statSync(mapped).isDirectory()) {
      return mapped;
    }
  }

  // Special case: Welcome prompt
  if (baseName.toLowerCase() === "welcome_prompt_01.mp3") {
    const welcome = path.resolve(AUDIO_ROOT_DIR, "Welcome_prompt_01.mp3");
    if (fs.existsSync(welcome)) return welcome;
  }

  return null;
}

// High-Performance In-Memory Audio Buffer Cache
const AUDIO_BUFFER_CACHE = new Map<string, { buffer: Buffer; size: number }>();

/**
 * Streams audio file with HTTP 206 Byte Ranges, In-Memory RAM Caching, and Immutable HTTP Headers
 */
export function streamAudioFile(req: Request, res: Response, filePath: string): void {
  let cached = AUDIO_BUFFER_CACHE.get(filePath);
  if (!cached) {
    try {
      const buffer = fs.readFileSync(filePath);
      cached = { buffer, size: buffer.length };
      AUDIO_BUFFER_CACHE.set(filePath, cached);
    } catch {
      // Fallback if read fails
      res.status(404).send("Audio file not found.");
      return;
    }
  }

  const fileSize = cached.size;
  const ext = path.extname(filePath).toLowerCase();

  const mimeType =
    ext === ".wav"
      ? "audio/wav"
      : ext === ".ogg"
      ? "audio/ogg"
      : ext === ".m4a" || ext === ".aac"
      ? "audio/mp4"
      : "audio/mpeg";

  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    const chunk = cached.buffer.subarray(start, end + 1);

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    });

    res.end(chunk);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    });

    res.end(cached.buffer);
  }
}
