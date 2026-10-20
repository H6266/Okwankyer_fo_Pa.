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
    const source = fs.readFileSync(sourceFilePath);
    if (isMp3Buffer(source)) return sourceFilePath;
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
      const ffmpegPkg = "ffmpeg-static";
      const ffmpegModule: any = await import(/* @vite-ignore */ ffmpegPkg).catch(() => null);
      const ffmpegPath = ffmpegModule?.default || ffmpegModule;
      // Cache versioning above prevents previously clipped transcodes from being reused.
      await execFileAsync(ffmpegPath || "ffmpeg", [
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

export async function transcodeAudioBufferToMp3(audioBuffer: Buffer, mimeType: string): Promise<Buffer> {
  if (isMp3Buffer(audioBuffer)) return audioBuffer;

  const extensionByMimeType: Record<string, string> = {
    "audio/aac": ".aac",
    "audio/mp4": ".m4a",
    "audio/m4a": ".m4a",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
  };
  const sourcePath = path.join(MP3_CACHE_DIR, `tts_${crypto.randomUUID()}${extensionByMimeType[mimeType.toLowerCase()] || ".wav"}`);
  let transcodedPath: string | undefined;

  try {
    fs.writeFileSync(sourcePath, audioBuffer);
    transcodedPath = await getOrTranscodeMp3(sourcePath);
    return fs.readFileSync(transcodedPath);
  } finally {
    for (const filePath of [sourcePath, transcodedPath]) {
      if (filePath && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  }
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
        } else if (/\.mp3$/i.test(entry.name)) {
          try {
            const head = Buffer.alloc(16);
            const fd = fs.openSync(fullPath, "r");
            fs.readSync(fd, head, 0, 16, 0);
            fs.closeSync(fd);
            if (!isMp3Buffer(head)) {
              filesToTranscode.push(fullPath);
            }
          } catch {}
        }
      }
    } catch {}
  }

  for (const d of dirsToScan) {
    collectAudioFiles(d);
  }

  // Process in small batches with breathing room to avoid CPU/memory spikes
  for (let i = 0; i < filesToTranscode.length; i += 2) {
    const batch = filesToTranscode.slice(i, i + 2);
    await Promise.all(batch.map((f) => getOrTranscodeMp3(f).catch(() => {})));
    await new Promise((r) => setTimeout(r, 60));
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

  let rootDirs: string[];
  let relativePath: string;

  if (/^Twi\//i.test(normalized)) {
    rootDirs = [
      path.resolve(process.cwd(), "Audio_files", "audio", "Twi"),
      path.resolve(process.cwd(), "Audio_files", "Twi_library"),
    ];
    relativePath = normalized.slice("Twi/".length);
  } else if (/^supplied\/Twi\//i.test(normalized)) {
    rootDirs = [
      path.resolve(process.cwd(), "Audio_files", "audio", "Twi"),
      path.resolve(process.cwd(), "Audio_files", "Twi_library"),
    ];
    relativePath = normalized.replace(/^supplied\/Twi\//i, "");
  } else if (/^(?:supplied\/)?Twi_library(?:\/|$)/i.test(normalized)) {
    rootDirs = [path.resolve(process.cwd(), "Audio_files", "Twi_library")];
    relativePath = normalized.replace(/^(?:supplied\/)?Twi_library\//i, "");
  } else if (/^English_Library\//i.test(normalized)) {
    rootDirs = [path.resolve(process.cwd(), "Audio_files", "English_Library")];
    relativePath = normalized.slice("English_Library/".length);
  } else if (/^supplied\/English_Library\//i.test(normalized)) {
    rootDirs = [path.resolve(process.cwd(), "Audio_files", "English_Library")];
    relativePath = normalized.replace(/^supplied\/English_Library\//i, "");
  } else if (/^additional\//i.test(normalized)) {
    rootDirs = [path.resolve(process.cwd(), "Audio_files", "additional")];
    relativePath = normalized.slice("additional/".length);
  } else {
    rootDirs = [path.resolve(process.cwd(), "public", "audio")];
    relativePath = normalized.replace(/^public\//i, "");
  }

  const resolveInsideRoot = (rootDir: string, candidate: string): string | null => {
    const resolved = path.resolve(rootDir, candidate);
    if (resolved === rootDir || !resolved.startsWith(`${rootDir}${path.sep}`)) {
      throw new PathTraversalError(`Path traversal attempt blocked: ${requestedSubpath}`);
    }
    const realRoot = fs.realpathSync(rootDir);
    const safeRealPath = (fullPath: string): string | null => {
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) return null;
      const realPath = fs.realpathSync(fullPath);
      return realPath.startsWith(`${realRoot}${path.sep}`) ? realPath : null;
    };
    const exact = safeRealPath(resolved);
    if (exact) return exact;

    const targetDir = path.dirname(resolved);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) return null;
    const targetExt = path.extname(resolved).toLowerCase();
    const targetStem = path.basename(resolved, targetExt).toLowerCase().replace(/[-_]/g, " ").trim();
    for (const file of fs.readdirSync(targetDir)) {
      const fileExt = path.extname(file).toLowerCase();
      const fileStem = path.basename(file, fileExt).toLowerCase().replace(/[-_]/g, " ").trim();
      if (fileStem === targetStem && [".mp3", ".m4a", ".aac", ".wav"].includes(fileExt)) {
        const matched = safeRealPath(path.join(targetDir, file));
        if (matched) return matched;
      }
    }
    return null;
  };

  for (const rootDir of rootDirs) {
    if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) continue;
    const exact = resolveInsideRoot(rootDir, path.resolve(rootDir, relativePath));
    if (exact) return exact;

    const resolved = path.resolve(rootDir, relativePath);
    const extension = path.extname(resolved).toLowerCase();
    const stem = resolved.slice(0, -extension.length);
    if (extension === ".mp3") {
      const m4a = resolveInsideRoot(rootDir, `${stem}.m4a`);
      if (m4a) return m4a;
      const aac = resolveInsideRoot(rootDir, `${stem}.aac`);
      if (aac) return aac;
    } else if (extension === ".m4a" || extension === ".aac") {
      const mp3 = resolveInsideRoot(rootDir, `${stem}.mp3`);
      if (mp3) return mp3;
    }
  }

  return null;
}

export function isMp3Buffer(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  if (buffer.toString("ascii", 0, 3) === "ID3") return true;
  if (buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp") return false;
  for (let offset = 0; offset < Math.min(buffer.length - 1, 4096); offset++) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) continue;
    const version = (buffer[offset + 1] >> 3) & 0x03;
    const layer = (buffer[offset + 1] >> 1) & 0x03;
    const bitrate = (buffer[offset + 2] >> 4) & 0x0f;
    const sampleRate = (buffer[offset + 2] >> 2) & 0x03;
    if (version !== 0x01 && layer !== 0 && bitrate !== 0 && bitrate !== 0x0f && sampleRate !== 0x03) {
      return true;
    }
  }
  return false;
}

function getAudioContentType(buffer: Buffer): string | null {
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") {
    return "audio/wav";
  }
  if (buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  if (buffer.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) {
    return "audio/aac";
  }
  if (isMp3Buffer(buffer)) return "audio/mpeg";
  return null;
}

/**
 * Streams audio to HTTP clients with automatic MP3 transcoding for telephony,
 * full Content-Length support, and RFC 7233 byte-range handling.
 */
export async function streamAudioFile(req: Request, res: Response, filePath: string): Promise<void> {
  const formatQuery = String(req.query?.format || "").toLowerCase();
  const userAgent = String(req.headers["user-agent"] || "").toLowerCase();

  const isTelephonyClient =
    formatQuery === "mp3" ||
    userAgent.includes("africastalking") ||
    userAgent.includes("asterisk") ||
    userAgent.includes("freeswitch") ||
    userAgent.includes("dialogic") ||
    userAgent.includes("telephony");

  const wantsMp3 =
    isTelephonyClient ||
    formatQuery === "mp3" ||
    req.path.toLowerCase().endsWith(".mp3") ||
    filePath.toLowerCase().endsWith(".mp3");

  let activePath = filePath;
  if (wantsMp3) {
    try {
      let isTrueMp3 = false;
      try {
        const head = Buffer.alloc(16);
        const fd = fs.openSync(filePath, "r");
        fs.readSync(fd, head, 0, 16, 0);
        fs.closeSync(fd);
        isTrueMp3 = isMp3Buffer(head);
      } catch {}

      if (!isTrueMp3 || isTelephonyClient) {
        activePath = await getOrTranscodeMp3(filePath);
      }
    } catch (error) {
      if (isTelephonyClient) {
        console.error("[Streaming] Requested MP3 could not be produced:", error);
        res.status(502).json({ error: "MP3 audio transcoding is unavailable." });
        return;
      }
      console.warn("[Streaming] Audio transcode notice:", error);
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
  const contentType = getAudioContentType(buffer);
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