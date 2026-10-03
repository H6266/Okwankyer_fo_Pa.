/**
 * Ɔkwankyerɛfo Pa - Protected Admin & Audio Management Routes
 * 
 * Enforces:
 * 1. Bearer token authentication via ADMIN_TOKEN.
 * 2. Strict file size limits (max 2MB, not 50MB).
 * 3. Strict MIME allowlist.
 * 4. Prohibition against overwriting core production studio prompts.
 */

import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { config } from "../config/env";
import { AUDIO_CATALOG } from "../audio/catalog";
import { auditLogger } from "../services/auditLogger";

export const adminRouter = Router();

// Middleware: Authenticate Admin Token
function requireAdminAuth(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!config.adminToken || token !== config.adminToken) {
    auditLogger.log("warn", "SECURITY", "Unauthorized attempt to access protected admin endpoint", req.ip);
    res.status(401).json({ error: "Unauthorized: Valid ADMIN_TOKEN bearer authentication required." });
    return;
  }
  next();
}

const MAX_AUDIO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB strict limit
const ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"];
const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".ogg"];

// Set of protected production filenames that CANNOT be overwritten
const PROTECTED_FILENAMES = new Set(
  AUDIO_CATALOG.flatMap((item) => [
    path.basename(item.filename).toLowerCase(),
    item.filename.toLowerCase(),
  ])
);

adminRouter.post("/api/upload-audio", requireAdminAuth, (req: Request, res: Response) => {
  const { filename, base64Data, folder } = req.body;

  if (!filename || !base64Data) {
    return res.status(400).json({ error: "Missing required fields: 'filename' and 'base64Data'." });
  }

  // Strict filename sanitization
  const cleanFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "");
  const ext = path.extname(cleanFilename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return res.status(400).json({
      error: `Invalid file extension '${ext}'. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
    });
  }

  // Prevent overwriting core production audio assets
  if (PROTECTED_FILENAMES.has(cleanFilename.toLowerCase())) {
    auditLogger.log(
      "warn",
      "SECURITY",
      `Blocked attempt to overwrite protected production audio asset: ${cleanFilename}`
    );
    return res.status(409).json({
      error: `Cannot overwrite core production prompt '${cleanFilename}'. Protected by policy.`,
    });
  }

  try {
    const rawData = base64Data.replace(/^data:audio\/[a-z0-9]+;base64,/, "");
    const buffer = Buffer.from(rawData, "base64");

    if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
      return res.status(413).json({
        error: `Audio file exceeds maximum size limit of 2MB (received ${(buffer.length / 1024 / 1024).toFixed(2)} MB).`,
      });
    }

    // Isolate into custom uploads directory inside audio
    const targetDir = path.resolve(process.cwd(), "audio", "custom_uploads");
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.resolve(targetDir, cleanFilename);
    if (fs.existsSync(targetPath)) {
      return res.status(409).json({ error: `File '${cleanFilename}' already exists.` });
    }

    fs.writeFileSync(targetPath, buffer);
    auditLogger.log("info", "SYSTEM", `New custom audio prompt uploaded: ${cleanFilename} (${buffer.length} bytes)`);

    return res.status(201).json({
      success: true,
      message: `File ${cleanFilename} uploaded successfully.`,
      sizeBytes: buffer.length,
      url: `/audio/custom_uploads/${cleanFilename}`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Upload processing failed: ${err.message}` });
  }
});
