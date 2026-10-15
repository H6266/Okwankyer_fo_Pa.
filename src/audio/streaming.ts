/**
 * Exact, registry-backed audio streaming with path traversal protection and byte ranges.
 */

import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { AudioAssetRoot, getRecordingByPath } from "./recordingRegistry";

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathTraversalError";
  }
}

export function resolveSafeAudioPath(requestedSubpath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestedSubpath || "");
  } catch {
    throw new PathTraversalError("Malformed encoded audio path.");
  }

  const normalized = decoded
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^audio\//i, "");
  if (!normalized || normalized.split("/").some((segment) => segment === "..")) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  let assetRoot: AudioAssetRoot;
  let relativePath: string;
  let rootDir: string;
  if (normalized.startsWith("supplied/")) {
    assetRoot = "supplied";
    relativePath = normalized.slice("supplied/".length);
    rootDir = path.resolve(process.cwd(), "Audio_files");
  } else if (normalized.startsWith("additional/")) {
    assetRoot = "additional";
    relativePath = normalized.slice("additional/".length);
    rootDir = path.resolve(process.cwd(), "Audio_files");
  } else if (/^twi\//i.test(normalized)) {
    assetRoot = "supplied";
    relativePath = normalized;
    rootDir = path.resolve(process.cwd(), "Audio_files");
  } else {
    assetRoot = "public";
    relativePath = normalized;
    rootDir = path.resolve(process.cwd(), "public", "audio");
  }

  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== rootDir && !resolved.startsWith(`${rootDir}${path.sep}`)) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  // 1. Direct check for exact resolved path under rootDir
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
    const realPath = fs.realpathSync(resolved);
    const realRoot = fs.realpathSync(rootDir);
    if (realPath.startsWith(`${realRoot}${path.sep}`)) {
      return realPath;
    }
  }

  // 2. Extension swap check on the resolved path (.m4a, .aac, .mp3, .wav)
  const candidateDir = path.dirname(resolved);
  const baseNameWithoutExt = path.basename(resolved, path.extname(resolved));
  const audioExtensions = [".m4a", ".aac", ".mp3", ".wav"];

  for (const ext of audioExtensions) {
    const candidate = path.join(candidateDir, `${baseNameWithoutExt}${ext}`);
    if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
      return fs.realpathSync(candidate);
    }
  }

  // 3. Fallback: check flat Audio_files directory for matching filename with any audio extension
  const audioFilesDir = path.resolve(process.cwd(), "Audio_files");
  for (const ext of audioExtensions) {
    const flatCandidate = path.resolve(audioFilesDir, `${baseNameWithoutExt}${ext}`);
    if (fs.existsSync(flatCandidate) && !fs.statSync(flatCandidate).isDirectory()) {
      return fs.realpathSync(flatCandidate);
    }
  }

  // 4. Fallback: search Audio_files/Twi/ subdirectories recursively for the file
  const twiDir = path.resolve(process.cwd(), "Audio_files", "Twi");
  if (fs.existsSync(twiDir)) {
    const targetBaseLower = baseNameWithoutExt.toLowerCase();
    try {
      const subdirs = fs.readdirSync(twiDir, { withFileTypes: true });
      for (const entry of subdirs) {
        if (entry.isDirectory()) {
          const subDirPath = path.join(twiDir, entry.name);
          const files = fs.readdirSync(subDirPath);
          for (const f of files) {
            const fNameWithoutExt = path.basename(f, path.extname(f)).toLowerCase();
            if (fNameWithoutExt === targetBaseLower) {
              const fullPath = path.join(subDirPath, f);
              if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
                return fs.realpathSync(fullPath);
              }
            }
          }
        }
      }
    } catch {}
  }

  // 5. Fallback: check public/audio
  const publicAudioDir = path.resolve(process.cwd(), "public", "audio");
  for (const ext of audioExtensions) {
    const publicCandidate = path.resolve(publicAudioDir, `${baseNameWithoutExt}${ext}`);
    if (fs.existsSync(publicCandidate) && !fs.statSync(publicCandidate).isDirectory()) {
      return fs.realpathSync(publicCandidate);
    }
  }

  return null;
}

const AUDIO_BUFFER_CACHE = new Map<string, Buffer>();

export function streamAudioFile(req: Request, res: Response, filePath: string): void {
  let buffer = AUDIO_BUFFER_CACHE.get(filePath);
  if (!buffer) {
    try {
      buffer = fs.readFileSync(filePath);
      AUDIO_BUFFER_CACHE.set(filePath, buffer);
    } catch {
      res.status(404).send("Audio file not found.");
      return;
    }
  }

  const size = buffer.length;
  const extension = path.extname(filePath).toLowerCase();
  const contentType = extension === ".wav"
    ? "audio/wav"
    : extension === ".ogg"
      ? "audio/ogg"
      : extension === ".aac"
        ? "audio/aac"
        : extension === ".m4a"
          ? "audio/mp4"
          : "audio/mpeg";
  const range = req.headers.range;

  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) {
      res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
      return;
    }

    let start = match[1] ? Number.parseInt(match[1], 10) : 0;
    let end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
    if (!match[1]) start = Math.max(size - end, 0), end = size - 1;
    end = Math.min(end, size - 1);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || start > end) {
      res.status(416).setHeader("Content-Range", `bytes */${size}`).end();
      return;
    }

    const chunk = buffer.subarray(start, end + 1);
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunk.length,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(chunk);
    return;
  }

  res.writeHead(200, {
    "Content-Length": size,
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(buffer);
}