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

  const recording = getRecordingByPath(relativePath);
  if (
    !recording ||
    recording.assetRoot !== assetRoot ||
    recording.mappingStatus !== "VERIFIED" ||
    recording.recordingRole !== "fixed"
  ) {
    return null;
  }

  const resolved = path.resolve(rootDir, relativePath);
  if (resolved !== rootDir && !resolved.startsWith(`${rootDir}${path.sep}`)) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) return null;

  const realPath = fs.realpathSync(resolved);
  const realRoot = fs.realpathSync(rootDir);
  if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${path.sep}`)) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }
  return realPath;
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