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
import { AudioAssetRoot, getRecordingByPath } from "./recordingRegistry";

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
  } catch {
    return sourceFilePath;
  }

  const hash = crypto
    .createHash("sha256")
    .update(`${sourceFilePath}:${stat.size}:${stat.mtimeMs}`)
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
      // 16kHz mono 64kbps MP3 is universally compatible with Africa's Talking / telco gateways (AMR-WB / G.711)
      await execFileAsync("ffmpeg", [
        "-y",
        "-i", sourceFilePath,
        "-codec:a", "libmp3lame",
        "-b:a", "64k",
        "-ar", "16000",
        "-ac", "1",
        "-f", "mp3",
        tempPath,
      ]);
      fs.renameSync(tempPath, cachedMp3Path);
      return cachedMp3Path;
    } catch (err: any) {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch {}
      }
      console.warn(`[Streaming] On-the-fly MP3 transcode notice for ${path.basename(sourceFilePath)}:`, err?.message || err);
      return sourceFilePath;
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
  if (!normalized || normalized.split("/").some((segment) => segment === "..")) {
    throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
  }

  const unverifiedCandidates = [
    /network selection/i,
    /welcome 1 \(\d+\)/i,
    /01_welcome_session_start/i,
  ];
  if (unverifiedCandidates.some((re) => re.test(normalized))) {
    return null;
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
  const audioExtensions = [".mp3", ".wav", ".m4a", ".aac"];

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
  if (isTelephonyClient && !filePath.endsWith(".mp3")) {
    activePath = await getOrTranscodeMp3(filePath);
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