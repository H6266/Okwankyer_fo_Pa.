/**
 * Ɔkwankyerɛfo Pa - Exact, registry-backed audio streaming with path traversal protection,
 * on-the-fly MP3 transcoding for telephony gateways (Africa's Talking), and byte ranges.
 */

import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFile } from "child_process";
import util from "util";

const execFileAsync = util.promisify(execFile);

export class PathTraversalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathTraversalError";
  }
}

// ── Persistent MP3 Disk & Memory Cache for Telephony ─────────────────
const MP3_CACHE_DIR = path.resolve(process.cwd(), ".cache", "audio_mp3");
if (!fs.existsSync(MP3_CACHE_DIR)) {
  try {
    fs.mkdirSync(MP3_CACHE_DIR, { recursive: true });
  } catch {}
}

const AUDIO_BUFFER_CACHE = new Map<string, Buffer>();
const activeTranscodePromises = new Map<string, Promise<string>>();

/**
 * Transcodes an M4A or AAC file into standard 16kHz mono MP3 for Africa's Talking telephony gateways.
 * Results are cached persistently on disk and in memory.
 */
export async function getOrTranscodeMp3(sourceFilePath: string): Promise<string> {
  const ext = path.extname(sourceFilePath).toLowerCase();
  if (ext === ".mp3") {
    return sourceFilePath;
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(sourceFilePath);
  } catch (error) {
    throw new Error(`AUDIO_SOURCE_NOT_FOUND: ${sourceFilePath}`, { cause: error });
  }

  const hash = crypto
    .createHash("sha256")
    .update(`audio-transcode-v2-loudnorm-limiter:${sourceFilePath}:${stat.size}:${stat.mtimeMs}`)
    .digest("hex")
    .slice(0, 20);

  const safeBase = path.basename(sourceFilePath, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
  const cachedMp3Path = path.join(MP3_CACHE_DIR, `${safeBase}_${hash}.mp3`);

  if (fs.existsSync(cachedMp3Path) && fs.statSync(cachedMp3Path).size > 0) {
    return cachedMp3Path;
  }

  // Deduplicate active concurrent transcode requests for the same audio asset
  if (activeTranscodePromises.has(cachedMp3Path)) {
    return activeTranscodePromises.get(cachedMp3Path)!;
  }

  const transcodePromise = (async () => {
    const tempPath = `${cachedMp3Path}.tmp.${Date.now()}`;
    try {
      // Cache versioning above prevents previously clipped transcodes from being reused.
      await execFileAsync("ffmpeg", [
        "-y",
        "-i", sourceFilePath,
        "-af", "loudnorm=I=-20:TP=-2:LRA=7:linear=true,alimiter=limit=0.95:level=disabled",
        "-codec:a", "libmp3lame",
        "-b:a", "64k",
        "-ar", "16000",
        "-ac", "1",
        "-f", "mp3",
        tempPath,
      ]);
      const transcoded = fs.readFileSync(tempPath);
      if (!isMp3Buffer(transcoded)) {
        throw new Error("Transcoder output did not contain MP3 frames.");
      }
      fs.renameSync(tempPath, cachedMp3Path);
      return cachedMp3Path;
    } catch (err) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
      console.error(`[Streaming] MP3 transcoding failed for ${path.basename(sourceFilePath)}:`, err);
      throw new Error(`AUDIO_TRANSCODE_FAILED: ${path.basename(sourceFilePath)}`, { cause: err });
    } finally {
      activeTranscodePromises.delete(cachedMp3Path);
    }
  })();

  activeTranscodePromises.set(cachedMp3Path, transcodePromise);
  return transcodePromise;
}

/**
 * Preheats the MP3 transcode cache in background so incoming telephony calls experience 0ms transcode latency.
 */
export async function warmupTelephonyMp3Cache(): Promise<void> {
  const dirsToScan = [
    path.resolve(process.cwd(), "Audio_files"),
    path.resolve(process.cwd(), "public", "audio"),
  ];

  const filesToTranscode: string[] = [];

  function collectAudioFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectAudioFiles(fullPath);
        } else if (/\.(m4a|aac)$/i.test(entry.name)) {
          filesToTranscode.push(fullPath);
        }
      }
    } catch {}
  }

  for (const d of dirsToScan) {
    collectAudioFiles(d);
  }

  // Process in small batches to avoid CPU spikes
  for (let i = 0; i < filesToTranscode.length; i += 4) {
    const batch = filesToTranscode.slice(i, i + 4);
    await Promise.all(batch.map((f) => getOrTranscodeMp3(f).catch(() => {})));
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
  if (!normalized || normalized.includes("\0") || normalized.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  let rootDir: string;
  let relativePath: string;

  if (/^(?:supplied\/)?Twi_library\//i.test(normalized)) {
    rootDir = path.resolve(process.cwd(), "Audio_files", "Twi_library");
    relativePath = normalized.replace(/^(?:supplied\/)?Twi_library\//i, "");
  } else if (/^(?:supplied\/)?Twi\//i.test(normalized)) {
    rootDir = path.resolve(process.cwd(), "Audio_files", "Twi_library");
    relativePath = normalized.replace(/^(?:supplied\/)?Twi\//i, "");
  } else if (/^(?:supplied\/)?English_Library\//i.test(normalized)) {
    rootDir = path.resolve(process.cwd(), "Audio_files", "English_Library");
    relativePath = normalized.replace(/^(?:supplied\/)?English_Library\//i, "");
  } else if (/^additional\//i.test(normalized)) {
    rootDir = path.resolve(process.cwd(), "Audio_files", "additional");
    relativePath = normalized.slice("additional/".length);
  } else {
    rootDir = path.resolve(process.cwd(), "public", "audio");
    relativePath = normalized.replace(/^public\//i, "");
  }

  const resolved = path.resolve(rootDir, relativePath);
  if (resolved === rootDir || !resolved.startsWith(`${rootDir}${path.sep}`)) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  const resolveInsideRoot = (candidate: string): string | null => {
    if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
      const realPath = fs.realpathSync(candidate);
      const realRoot = fs.realpathSync(rootDir);
      return realPath.startsWith(`${realRoot}${path.sep}`) ? realPath : null;
    }

    // Try finding matching filename in same directory (case-insensitive, space/underscore agnostic)
    const targetDir = path.dirname(candidate);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) return null;

    const targetExt = path.extname(candidate).toLowerCase();
    const targetStem = path.basename(candidate, targetExt).toLowerCase().replace(/[-_]/g, " ").trim();

    try {
      const files = fs.readdirSync(targetDir);
      // First try matching stem with any audio extension (.mp3, .m4a, .wav)
      for (const file of files) {
        const fileExt = path.extname(file).toLowerCase();
        const fileStem = path.basename(file, fileExt).toLowerCase().replace(/[-_]/g, " ").trim();
        if (fileStem === targetStem && [".mp3", ".m4a", ".aac", ".wav"].includes(fileExt)) {
          const fullPath = path.join(targetDir, file);
          const realPath = fs.realpathSync(fullPath);
          const realRoot = fs.realpathSync(rootDir);
          if (realPath.startsWith(`${realRoot}${path.sep}`)) return realPath;
        }
      }
    } catch {}

    return null;
  };

  const exact = resolveInsideRoot(resolved);
  if (exact) return exact;

  // If candidate had .m4a/.aac, look for .mp3 alternative
  const ext = path.extname(resolved).toLowerCase();
  const stem = resolved.slice(0, -ext.length);
  if (ext === ".m4a" || ext === ".aac") {
    const mp3Candidate = resolveInsideRoot(`${stem}.mp3`);
    if (mp3Candidate) return mp3Candidate;
  } else if (ext === ".mp3") {
    const m4aCandidate = resolveInsideRoot(`${stem}.m4a`) || resolveInsideRoot(`${stem}.aac`);
    if (m4aCandidate) return m4aCandidate;
  }

  return null;
}

function isMp3Buffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer.toString("ascii", 0, 3) === "ID3") return true;
  for (let offset = 0; offset < Math.min(buffer.length - 1, 4096); offset++) {
    if (buffer[offset] === 0xff && (buffer[offset + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

function getAudioContentType(buffer: Buffer, extension: string): string | null {
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") {
    return extension === ".wav" ? "audio/wav" : null;
  }
  if (isMp3Buffer(buffer)) return extension === ".mp3" ? "audio/mpeg" : null;
  if (buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp") {
    return extension === ".m4a" ? "audio/mp4" : null;
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) {
    return extension === ".aac" ? "audio/aac" : null;
  }
  if (buffer.toString("ascii", 0, 4) === "OggS") return extension === ".ogg" ? "audio/ogg" : null;
  return null;
}

/**
 * Streams audio to HTTP clients with automatic MP3 transcoding for telephony,
 * full Content-Length support, and RFC 7233 byte-range handling.
 */
export async function streamAudioFile(req: Request, res: Response, filePath: string): Promise<void> {
  const reqPath = req.path || "";
  const formatQuery = String(req.query?.format || "").toLowerCase();
  const userAgent = String(req.headers["user-agent"] || "").toLowerCase();

  const isTelephonyClient =
    reqPath.endsWith(".mp3") ||
    formatQuery === "mp3" ||
    userAgent.includes("africastalking") ||
    userAgent.includes("asterisk") ||
    userAgent.includes("freeswitch") ||
    userAgent.includes("dialogic") ||
    userAgent.includes("telephony");

  let activePath = filePath;
  if (isTelephonyClient && path.extname(filePath).toLowerCase() !== ".mp3") {
    try {
      activePath = await getOrTranscodeMp3(filePath);
    } catch (error) {
      console.error("[Streaming] Requested MP3 could not be produced:", error);
      res.status(502).json({ error: "MP3 audio transcoding is unavailable." });
      return;
    }
  }

  let buffer = AUDIO_BUFFER_CACHE.get(activePath);
  if (!buffer) {
    try {
      buffer = fs.readFileSync(activePath);
      // Cache files up to 10MB in memory for instant responses
      if (buffer.length < 10 * 1024 * 1024) {
        AUDIO_BUFFER_CACHE.set(activePath, buffer);
      }
    } catch {
      res.status(404).send("Audio file not found.");
      return;
    }
  }

  const size = buffer.length;
  const extension = path.extname(activePath).toLowerCase();
  const contentType = getAudioContentType(buffer, extension);
  if (!contentType) {
    res.status(415).json({ error: "Audio file content does not match a supported audio format." });
    return;
  }

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