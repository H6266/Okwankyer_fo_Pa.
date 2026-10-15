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
  const normalized = decoded.replace(/\\/g, "/").replace(/^\/+/, "").replace(/^audio\//i, "");

  let rootDir: string;
  let relativePath: string;

  if (normalized.startsWith("supplied/")) {
    rootDir = path.resolve(process.cwd(), "Audio_files");
    relativePath = normalized.slice("supplied/".length);
    if (!fs.existsSync(path.resolve(rootDir, relativePath)) && fs.existsSync(path.resolve(process.cwd(), "Audio_files", "audio", relativePath))) {
      rootDir = path.resolve(process.cwd(), "Audio_files", "audio");
    }
  } else if (normalized.startsWith("additional/")) {
    rootDir = path.resolve(process.cwd(), "Audio_files");
    relativePath = normalized.slice("additional/".length);
  } else if (/^twi\//i.test(normalized)) {
    relativePath = "Twi/" + normalized.slice(4);
    const audioDir = path.resolve(process.cwd(), "Audio_files", "audio");
    const testCandidate = path.resolve(audioDir, relativePath);
    const testDir = path.resolve(audioDir, path.dirname(relativePath));
    if (
      fs.existsSync(testCandidate) ||
      fs.existsSync(testCandidate.replace(/\.mp3$/i, ".m4a")) ||
      fs.existsSync(testCandidate.replace(/\.m4a$/i, ".mp3")) ||
      fs.existsSync(testCandidate.replace(/\.(mp3|m4a)$/i, ".aac")) ||
      fs.existsSync(testDir)
    ) {
      rootDir = audioDir;
    } else {
      rootDir = path.resolve(process.cwd(), "Audio_files");
    }
  } else {
    const audioFilesCandidate = path.resolve(process.cwd(), "Audio_files", normalized);
    if (fs.existsSync(audioFilesCandidate) || fs.existsSync(audioFilesCandidate.replace(/\.m4a$/i, ".mp3"))) {
      rootDir = path.resolve(process.cwd(), "Audio_files");
      relativePath = normalized;
    } else {
      rootDir = path.resolve(process.cwd(), "public", "audio");
      relativePath = normalized;
    }
  }

  let resolved = path.resolve(rootDir, relativePath);
  if (normalized.includes("..") || requestedSubpath.includes("..") || requestedSubpath.includes("%2e%2e")) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    const ext = path.extname(resolved).toLowerCase();
    let found: string | null = null;
    for (const altExt of [".mp3", ".m4a", ".aac", ".wav"]) {
      if (altExt === ext) continue;
      const altCandidate = (ext ? resolved.slice(0, -ext.length) : resolved) + altExt;
      if (fs.existsSync(altCandidate) && !fs.statSync(altCandidate).isDirectory()) {
        found = altCandidate;
        break;
      }
    }
    if (!found) {
      const dirName = path.dirname(resolved);
      const baseName = path.basename(resolved, ext).toLowerCase().trim();
      if (fs.existsSync(dirName)) {
        try {
          const files = fs.readdirSync(dirName);
          const candidate = files.find((f) => {
            const fExt = path.extname(f);
            const fBase = path.basename(f, fExt).toLowerCase().trim();
            return (
              fBase === baseName ||
              fBase.startsWith(baseName) ||
              baseName.startsWith(fBase) ||
              fBase.replace(/\s+\d+$/, "") === baseName.replace(/\s+\d+$/, "") ||
              (baseName.startsWith("enter recipient") && fBase.startsWith("enter recipient")) ||
              (baseName.startsWith("amount") && fBase.startsWith("amount")) ||
              (baseName.startsWith("ready submit") && fBase.startsWith("ready submit"))
            );
          });
          if (candidate) {
            const candidatePath = path.resolve(dirName, candidate);
            if (fs.existsSync(candidatePath) && !fs.statSync(candidatePath).isDirectory()) {
              found = candidatePath;
            }
          }
        } catch {}
      }
    }
    if (found) {
      resolved = found;
    } else {
      return null;
    }
  }

  const realPath = fs.realpathSync(resolved);
  const allowedRoots = [
    fs.realpathSync(path.resolve(process.cwd(), "Audio_files")),
    fs.realpathSync(path.resolve(process.cwd(), "public", "audio")),
    fs.existsSync(path.resolve(process.cwd(), "audio")) ? fs.realpathSync(path.resolve(process.cwd(), "audio")) : null,
  ].filter(Boolean) as string[];

  const isWithinAllowed = allowedRoots.some((allowed) =>
    realPath === allowed || realPath.startsWith(`${allowed}${path.sep}`)
  );

  if (!isWithinAllowed || fs.statSync(realPath).isDirectory()) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  return resolved;
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

  const reqPath = (req.originalUrl || req.url || "").split("?")[0].toLowerCase();
  const mimeType =
    ext === ".wav" || reqPath.endsWith(".wav")
      ? "audio/wav"
      : ext === ".ogg" || reqPath.endsWith(".ogg")
      ? "audio/ogg"
      : ext === ".m4a" || ext === ".aac" || reqPath.endsWith(".m4a") || reqPath.endsWith(".aac")
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
