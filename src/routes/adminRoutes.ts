import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";

import { config } from "../config/env";
import { AUDIO_CATALOG } from "../audio/catalog";
import { auditLogger } from "../services/auditLogger";
import { adminRateLimiter } from "../middleware/rateLimiter";

import {
  requireAdminAuth,
  isAdminAuthenticated,
  isValidAdminToken,
  createAdminSessionCookie,
  clearAdminSessionCookie,
} from "../middleware/adminAuth";

export const adminRouter = Router();

adminRouter.post(
  "/api/admin/login",
  adminRateLimiter,
  (req: Request, res: Response) => {
    if (!config.adminToken) {
      return res.status(500).json({
        success: false,
        error: "ADMIN_TOKEN is not configured on the server.",
      });
    }

    const token = String(req.body?.token || "").trim();

    if (!isValidAdminToken(token)) {
      auditLogger.log(
        "warn",
        "SECURITY",
        `Failed admin login from IP ${req.ip}`
      );

      return res.status(401).json({
        success: false,
        error: "Invalid administrator credential.",
      });
    }

    try {
      res.setHeader(
        "Set-Cookie",
        createAdminSessionCookie()
      );

      auditLogger.log(
        "info",
        "SECURITY",
        `Admin browser session established from IP ${req.ip}`
      );

      const sessionToken = config.adminToken || token;

      return res.json({
        success: true,
        authenticated: true,
        token: sessionToken,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || "Unable to establish admin session.",
      });
    }
  }
);

adminRouter.get(
  "/api/admin/session",
  (req: Request, res: Response) => {
    const isDev = config.nodeEnv !== "production" || config.demoMode;
    const defaultHint = config.adminToken || (isDev ? "dev_admin_secret_token_12345" : undefined);
    return res.json({
      success: true,
      authenticated: isAdminAuthenticated(req),
      isDev,
      enableSimulator: config.enableSimulator,
      hint: isDev ? defaultHint : undefined,
    });
  }
);

adminRouter.post(
  "/api/admin/logout",
  (_req: Request, res: Response) => {
    res.setHeader(
      "Set-Cookie",
      clearAdminSessionCookie()
    );

    return res.json({
      success: true,
      authenticated: false,
    });
  }
);

const MAX_AUDIO_SIZE_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
];

const ALLOWED_EXTENSIONS = [
  ".mp3",
  ".wav",
  ".ogg",
];

const PROTECTED_FILENAMES = new Set(
  AUDIO_CATALOG.flatMap((item) => [
    path.basename(item.filename).toLowerCase(),
    item.filename.toLowerCase(),
  ])
);

adminRouter.post(
  "/api/upload-audio",
  requireAdminAuth,
  (req: Request, res: Response) => {
    const { filename, base64Data, folder } = req.body;

    if (!filename || !base64Data) {
      return res.status(400).json({
        error:
          "Missing required fields: 'filename' and 'base64Data'.",
      });
    }

    const cleanFilename = path
      .basename(filename)
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const ext = path
      .extname(cleanFilename)
      .toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({
        error:
          `Invalid file extension '${ext}'. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
      });
    }

    if (PROTECTED_FILENAMES.has(cleanFilename.toLowerCase())) {
      auditLogger.log(
        "warn",
        "SECURITY",
        `Blocked attempt to overwrite protected audio asset: ${cleanFilename}`
      );

      return res.status(409).json({
        error:
          `Cannot overwrite protected production prompt '${cleanFilename}'.`,
      });
    }

    try {
      const rawData = base64Data.replace(
        /^data:audio\/[a-z0-9]+;base64,/,
        ""
      );

      const buffer = Buffer.from(
        rawData,
        "base64"
      );

      if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
        return res.status(413).json({
          error:
            `Audio exceeds the 2MB limit.`,
        });
      }

      const targetDir = path.resolve(
        process.cwd(),
        "audio",
        "custom_uploads"
      );

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {
          recursive: true,
        });
      }

      const targetPath = path.resolve(
        targetDir,
        cleanFilename
      );

      if (fs.existsSync(targetPath)) {
        return res.status(409).json({
          error:
            `File '${cleanFilename}' already exists.`,
        });
      }

      fs.writeFileSync(targetPath, buffer);

      return res.status(201).json({
        success: true,
        message:
          `File ${cleanFilename} uploaded successfully.`,
        sizeBytes: buffer.length,
        url:
          `/audio/custom_uploads/${cleanFilename}`,
      });
    } catch (err: any) {
      return res.status(500).json({
        error:
          `Upload processing failed: ${err.message}`,
      });
    }
  }
);
