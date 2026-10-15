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
  "1_welcome_session_start": "1.Welcome & Session Start",
  "1.welcome_session_start": "1.Welcome & Session Start",
  "welcome_session_start": "1.Welcome & Session Start",
  "02_main_service_navigation": "2.Main Service Navigation",
  "2_main_service_navigation": "2.Main Service Navigation",
  "2.main_service_navigation": "2.Main Service Navigation",
  "main_service_navigation": "2.Main Service Navigation",
  "03_recipient_entry_verification": "3.Recipient Entry & Verification",
  "3_recipient_entry_verification": "3.Recipient Entry & Verification",
  "3.recipient_entry_verification": "3.Recipient Entry & Verification",
  "recipient_entry_verification": "3.Recipient Entry & Verification",
  "04_amount_entry_verification": "4.Amount Entry & Verification",
  "4_amount_entry_verification": "4.Amount Entry & Verification",
  "4.amount_entry_verification": "4.Amount Entry & Verification",
  "amount_entry_verification": "4.Amount Entry & Verification",
  "05_transaction_confirmation": "5.Transaction Confirmation",
  "5_transaction_confirmation": "5.Transaction Confirmation",
  "5.transaction_confirmation": "5.Transaction Confirmation",
  "transaction_confirmation": "5.Transaction Confirmation",
  "06_pin_security": "6.PIN & Security",
  "6_pin_security": "6.PIN & Security",
  "6.pin_security": "6.PIN & Security",
  "pin_security": "6.PIN & Security",
  "07_transaction_processing": "7.Transaction Processing",
  "7_transaction_processing": "7.Transaction Processing",
  "7.transaction_processing": "7.Transaction Processing",
  "transaction_processing": "7.Transaction Processing",
  "08_success_completion": "8.Success & Completion",
  "8_success_completion": "8.Success & Completion",
  "8.success_completion": "8.Success & Completion",
  "success_completion": "8.Success & Completion",
  "09_failure_decline_timeout": "9.Failure, Decline & Timeout",
  "9_failure_decline_timeout": "9.Failure, Decline & Timeout",
  "9.failure_decline_timeout": "9.Failure, Decline & Timeout",
  "failure_decline_timeout": "9.Failure, Decline & Timeout",
  "10_voice_understanding_verification": "10.Voice Understanding & Verification",
  "10.voice_understanding_verification": "10.Voice Understanding & Verification",
  "voice_understanding_verification": "10.Voice Understanding & Verification",
  "11_navigation_recovery": "11.Navigation & Recovery",
  "11.navigation_recovery": "11.Navigation & Recovery",
  "navigation_recovery": "11.Navigation & Recovery",
  "12_accessibility_help": "12.Accessibility & Help",
  "12.accessibility_help": "12.Accessibility & Help",
  "accessibility_help": "12.Accessibility & Help",
  "13_balance_unsupported_services": "13.Balance  Unsupported Services",
  "13.balance_unsupported_services": "13.Balance  Unsupported Services",
  "balance_unsupported_services": "13.Balance  Unsupported Services",
  "14_post_transaction_conversation": "14.Post-Transaction Conversation",
  "14.post_transaction_conversation": "14.Post-Transaction Conversation",
  "post_transaction_conversation": "14.Post-Transaction Conversation"
};

const ALLOWED_ROOTS = [
  path.resolve(process.cwd(), "Audio_files"),
  path.resolve(process.cwd(), "public", "audio"),
  path.resolve(process.cwd(), "audio")
];

// In-Memory Index of All Existing Audio Assets on Disk
let diskAudioFilesCache: string[] | null = null;

function getDiskAudioFiles(): string[] {
  if (diskAudioFilesCache) return diskAudioFilesCache;
  const list: string[] = [];
  function scan(dir: string) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            scan(full);
          } else if (/\.(m4a|aac|mp3|wav|ogg)$/i.test(entry)) {
            list.push(full);
          }
        } catch {}
      }
    } catch {}
  }
  for (const root of ALLOWED_ROOTS) {
    scan(root);
  }
  diskAudioFilesCache = list;
  return list;
}

function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[\s\-_(),]+/g, "");
}

// Special alias mappings for canonical prompts whose recorded filename has semantic variations
const PROMPT_FILE_ALIASES: Record<string, string[]> = {
  "what do you want to do": ["Choose instead.m4a", "Service selection.m4a", "Send money selected.m4a"],
  "recipient last 4": ["Recipient verify.m4a", "Recipient confirm speech.m4a"],
  "recipient name": ["Recipient verify.m4a", "Recipient found.m4a"],
  "recipient verification": ["Recipient verify.m4a", "Recipient found.m4a"],
  "recipient confirm": ["Recipient confirm speech.m4a", "Use recipient 1.m4a"],
  "use recipient": ["Use recipient 1.m4a", "Recipient confirm speech.m4a"],
  "invalid recipient": ["Invalid recipient 1.m4a"],
  "amount read back": ["Amount readback 2.m4a", "Amount prompt.m4a"],
  "amount readback": ["Amount readback 2.m4a", "Amount prompt.m4a"],
  "amount too high": ["Amount too high 3.m4a"],
  "enter amount": ["Enter amount 4.m4a", "Amount prompt.m4a"],
  "welcome 1": ["Welcome 1 (2).m4a", "Welcome_prompt_01.mp3"],
  "network selection": ["Network selection.m4a", "Network selection 2.m4a", "Network selection.mp3"],
  "service selection": ["Service selection.m4a", "Service selection 2.m4a"],
  "ready submit": ["Ready submit.m4a", "Ready submit 2.m4a"],
  "confirm continue": ["Confirm continue.m4a", "Confirm continue 1.m4a"]
};

export function resolveSafeAudioPath(requestedSubpath: string, depth = 0): string | null {
  const decoded = decodeURIComponent(requestedSubpath || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/^audio\//i, "");
  if (!decoded || decoded.includes("..")) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  const stripped = decoded.replace(/^(supplied|additional)\//i, "");

  // 1. Check direct candidate paths
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
    if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) {
      return verifyPathSafety(c, requestedSubpath);
    }
    for (const ext of extensions) {
      const alt = c.replace(/\.[a-zA-Z0-9]+$/, ext);
      if (fs.existsSync(alt) && !fs.statSync(alt).isDirectory()) {
        return verifyPathSafety(alt, requestedSubpath);
      }
      for (const suffix of [" 1", " 2", " 3", " 4", " (2)", " 1 (2)", " 2 (2)"]) {
        const withSuff = c.replace(/\.[a-zA-Z0-9]+$/, `${suffix}${ext}`);
        if (fs.existsSync(withSuff) && !fs.statSync(withSuff).isDirectory()) {
          return verifyPathSafety(withSuff, requestedSubpath);
        }
      }
    }
  }

  // 2. Check Aliases (bounded to single level)
  if (depth === 0) {
    const reqBaseName = path.basename(stripped).replace(/\.[a-z0-9]+$/i, "").toLowerCase();
    for (const [aliasKey, targetFiles] of Object.entries(PROMPT_FILE_ALIASES)) {
      if (reqBaseName === aliasKey || reqBaseName.includes(aliasKey) || aliasKey.includes(reqBaseName)) {
        for (const targetFile of targetFiles) {
          const resolved = resolveSafeAudioPath(targetFile, 1);
          if (resolved) return resolved;
        }
      }
    }
  }

  // 3. Fallback to Disk Audio Index
  const diskFiles = getDiskAudioFiles();
  const reqBase = path.basename(stripped);
  const normReq = normalizeKey(reqBase);

  // Exact basename match (case-insensitive)
  for (const f of diskFiles) {
    if (path.basename(f).toLowerCase() === reqBase.toLowerCase()) {
      return verifyPathSafety(f, requestedSubpath);
    }
  }

  // Normalized key match
  for (const f of diskFiles) {
    if (normalizeKey(path.basename(f)) === normReq) {
      return verifyPathSafety(f, requestedSubpath);
    }
  }

  // Normalized match without numbers
  const reqNoNum = normReq.replace(/\d+/g, "");
  if (reqNoNum.length >= 4) {
    for (const f of diskFiles) {
      const fnNoNum = normalizeKey(path.basename(f)).replace(/\d+/g, "");
      if (fnNoNum === reqNoNum) {
        return verifyPathSafety(f, requestedSubpath);
      }
    }
  }

  // Prefix match
  if (normReq.length >= 5) {
    for (const f of diskFiles) {
      const fnNorm = normalizeKey(path.basename(f));
      if (fnNorm.startsWith(normReq) || normReq.startsWith(fnNorm)) {
        return verifyPathSafety(f, requestedSubpath);
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
      : ext === ".aac" || reqPath.endsWith(".aac")
      ? "audio/aac"
      : ext === ".m4a" || reqPath.endsWith(".m4a")
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
