/**
 * Ɔkwankyerɛfo Pa - Safe Audio Streaming Service
 * 
 * Implements HTTP 206 Partial Content byte-range streaming for telecom carrier audio compatibility.
 * Strictly guards against path traversal using path.resolve and boundary validation.
 */

import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { getRecordingFilePath } from "./recordingRegistry";

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
  const normalized = decoded.replace(/\\/g, "/").replace(/^\/+/, "");

  let rootDir: string;
  let relativePath: string;

  if (normalized.startsWith("supplied/")) {
    rootDir = path.resolve(process.cwd(), "Audio_files", "audio");
    relativePath = normalized.slice("supplied/".length);
  } else if (normalized.startsWith("additional/")) {
    rootDir = path.resolve(process.cwd(), "Audio_files_2");
    relativePath = normalized.slice("additional/".length);
  } else {
    return null;
  }

  const resolved = path.resolve(rootDir, relativePath);
  if (!resolved.startsWith(`${rootDir}${path.sep}`) && resolved !== rootDir) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  if (!fs.existsSync(resolved)) {
    return null;
  }

  const realPath = fs.realpathSync(resolved);
  const realRoot = fs.realpathSync(rootDir);
  if (!realPath.startsWith(`${realRoot}${path.sep}`) || fs.statSync(realPath).isDirectory()) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  return realPath;
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
