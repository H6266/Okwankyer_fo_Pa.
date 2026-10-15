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
const FOLDER_MAP: Record<string, string> = {
  "01_welcome_session_start": "1.Welcome & Session Start",
  "02_main_service_navigation": "2.Main Service Navigation",
  "03_recipient_entry_verification": "3.Recipient Entry & Verification",
  "04_amount_entry_verification": "4.Amount Entry & Verification",
  "05_transaction_confirmation": "5.Transaction Confirmation",
  "06_pin_security": "6.PIN & Security",
  "07_transaction_processing": "7.Transaction Processing",
  "08_success_completion": "8.Success & Completion",
  "09_failure_decline_timeout": "9.Failure, Decline & Timeout",
  "10_voice_understanding_verification": "10.Voice Understanding & Verification",
  "11_navigation_recovery": "11.Navigation & Recovery",
  "12_accessibility_help": "12.Accessibility & Help",
  "13_balance_unsupported_services": "13.Balance  Unsupported Services",
  "14_post_transaction_conversation": "14.Post-Transaction Conversation"
};

const ALLOWED_ROOTS = [
  path.resolve(process.cwd(), "Audio_files"),
  path.resolve(process.cwd(), "public", "audio"),
  path.resolve(process.cwd(), "audio")
];

export function resolveSafeAudioPath(requestedSubpath: string): string | null {
  const decoded = decodeURIComponent(requestedSubpath || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/^audio\//i, "");
  if (!decoded || decoded.includes("..")) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  const stripped = decoded.replace(/^(supplied|additional)\//i, "");

  const candidates: string[] = [
    path.resolve(process.cwd(), "Audio_files", stripped),
    path.resolve(process.cwd(), "Audio_files", decoded),
    path.resolve(process.cwd(), "public/audio", stripped),
    path.resolve(process.cwd(), "audio", stripped),
    path.resolve(process.cwd(), "Audio_files/Twi", stripped),
    path.resolve(process.cwd(), "Audio_files", path.basename(stripped))
  ];

  const parts = stripped.split("/");
  if (parts.length >= 2) {
    const parentFolder = parts[0].toLowerCase().replace(/[\s-]+/g, "_");
    const mapped = FOLDER_MAP[parentFolder];
    if (mapped) {
      candidates.push(path.resolve(process.cwd(), "Audio_files/Twi", mapped, parts.slice(1).join("/")));
    }
    if (parts[0].toLowerCase() === "twi" && parts.length >= 3) {
      const pFolder = parts[1].toLowerCase().replace(/[\s-]+/g, "_");
      const mapped2 = FOLDER_MAP[pFolder];
      if (mapped2) {
        candidates.push(path.resolve(process.cwd(), "Audio_files/Twi", mapped2, parts.slice(2).join("/")));
      }
    }
  }

  const extensions = [".m4a", ".aac", ".mp3", ".wav"];

  for (const c of candidates) {
    // Check direct path
    if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) {
      return verifyPathSafety(c, requestedSubpath);
    }
    // Check extension & suffix variants
    for (const ext of extensions) {
      const alt = c.replace(/\.[a-zA-Z0-9]+$/, ext);
      if (fs.existsSync(alt) && !fs.statSync(alt).isDirectory()) {
        return verifyPathSafety(alt, requestedSubpath);
      }
      const withSuffix = c.replace(/\.[a-zA-Z0-9]+$/, ` 2${ext}`);
      if (fs.existsSync(withSuffix) && !fs.statSync(withSuffix).isDirectory()) {
        return verifyPathSafety(withSuffix, requestedSubpath);
      }
      const withParen = c.replace(/\.[a-zA-Z0-9]+$/, ` (2)${ext}`);
      if (fs.existsSync(withParen) && !fs.statSync(withParen).isDirectory()) {
        return verifyPathSafety(withParen, requestedSubpath);
      }
    }
  }

  return null;
}

function verifyPathSafety(targetPath: string, originalSubpath: string): string {
  const real = fs.realpathSync(targetPath);
  const isAllowed = ALLOWED_ROOTS.some(r => real.startsWith(r + path.sep) || real === r);
  if (!isAllowed) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${originalSubpath}`);
  }
  return real;
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
