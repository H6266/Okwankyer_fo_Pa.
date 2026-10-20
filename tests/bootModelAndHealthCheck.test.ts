/**
 * Ɔkwankyerɛfo Pa - Boot-Time Model Verification & Comprehensive Health Check Tests
 * 
 * Tests:
 * 1. Model Verification at Boot (verifyModelsAtStartup)
 * 2. Africa's Talking API credentials verification
 * 3. MTN MoMo credentials verification (sandbox vs production enforcement)
 * 4. Audio catalog file existence and readability verification
 * 5. Disk space verification for audio streaming
 * 6. Emission of /api/ai/health endpoint with full diagnostic report
 */

import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import {
  verifyModelsAtStartup,
  modelVerificationEngine,
} from "../src/ai_system/core/modelVerification";
import {
  checkTelephonyHealth,
  checkMomoHealth,
  checkAudioFilesHealth,
  checkDiskSpaceHealth,
  getFullAiHealthReport,
} from "../src/services/healthService";
import { aiRouter } from "../src/routes/aiRoutes";
import { loadConfig } from "../src/config/env";
import { findAvailablePort } from "../src/serverApp";

describe("0. Local dev port defaults", () => {
  it("uses the non-conflicting default local port in development", () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origPort = process.env.PORT;

    try {
      process.env.NODE_ENV = "development";
      delete process.env.PORT;

      const cfg = loadConfig();
      expect(cfg.port).toBe(4174);
      expect(cfg.baseUrl).toBe("http://localhost:4174");
    } finally {
      if (origNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = origNodeEnv;

      if (origPort === undefined) delete process.env.PORT;
      else process.env.PORT = origPort;
    }
  });

  it("selects the next free port when the default dev port is occupied", async () => {
    const { createServer } = await import("node:net");
    const server = createServer();
    const port = await new Promise<number>((resolve) => {
      server.listen(0, "0.0.0.0", () => {
        resolve((server.address() as import("node:net").AddressInfo).port);
      });
    });

    try {
      const nextPort = await findAvailablePort(port, "0.0.0.0");
      expect(nextPort).toBeGreaterThan(port);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  });
});

describe("1. Model Verification at Boot (verifyModelsAtStartup)", () => {
  it("aborts production start if GEMINI_API_KEY is missing", async () => {
    const origEnv = process.env.NODE_ENV;
    const origKey = process.env.GEMINI_API_KEY;

    try {
      process.env.NODE_ENV = "production";
      delete process.env.GEMINI_API_KEY;

      await expect(verifyModelsAtStartup("")).rejects.toThrow(
        /FATAL: GEMINI_API_KEY not configured/
      );
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origKey) process.env.GEMINI_API_KEY = origKey;
    }
  });

  it("handles non-production mode gracefully when key is missing", async () => {
    const origEnv = process.env.NODE_ENV;
    const origKey = process.env.GEMINI_API_KEY;

    try {
      process.env.NODE_ENV = "development";
      delete process.env.GEMINI_API_KEY;

      const res = await verifyModelsAtStartup("");
      expect(res.verified).toBe(false);
      expect(res.discovered).toEqual([]);
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origKey) process.env.GEMINI_API_KEY = origKey;
    }
  });

  it("prohibits deprecated models in modelVerificationEngine", () => {
    const prohibitedCheck = modelVerificationEngine.validateProhibitedModels([
      "gemini-1.5-flash",
      "gemini-2.0-flash",
    ]);
    expect(prohibitedCheck.valid).toBe(false);
    expect(prohibitedCheck.prohibited).toContain("gemini-1.5-flash");

    const validCheck = modelVerificationEngine.validateProhibitedModels([
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-3.5-transcribe",
    ]);
    expect(validCheck.valid).toBe(true);
  });
});

describe("2. Comprehensive Health Checks & Diagnostics", () => {
  it("2.1. Verifies Africa's Talking credentials & gateway configuration", async () => {
    const telephony = await checkTelephonyHealth();
    expect(telephony).toBeDefined();
    expect(["configured", "unconfigured", "failed"]).toContain(telephony.status);
    expect(telephony.voiceNumber).toBeDefined();
    expect(telephony.details).toBeDefined();
  });

  it("2.2. Verifies MTN MoMo credentials (sandbox vs production fail-closed rule)", () => {
    const momo = checkMomoHealth();
    expect(momo).toBeDefined();
    expect(["healthy", "sandbox", "unconfigured", "failed"]).toContain(momo.status);
    expect(momo.currency).toBe("GHS");

    // In production, missing credentials must fail
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      const prodCheck = checkMomoHealth();
      // Should either be healthy if keys provided or failed
      expect(["healthy", "failed"]).toContain(prodCheck.status);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("2.3. Verifies audio file paths exist on disk and are readable", () => {
    const audio = checkAudioFilesHealth();
    expect(audio.totalFiles).toBeGreaterThan(0);
    expect(typeof audio.verified).toBe("boolean");
    expect(audio.reviewedFiles).toBeGreaterThanOrEqual(0);
    expect(audio.missingFiles.length).toBe(0);

    // Verify sample file metadata
    for (const sample of audio.sampleFiles) {
      expect(sample.readable).toBe(true);
      expect(sample.sizeBytes).toBeGreaterThan(100);
      expect(sample.path.startsWith("Audio_files/") || sample.path.startsWith("public/audio/")).toBe(true);
    }
  });

  it("2.4. Verifies disk space for audio streaming", () => {
    const disk = checkDiskSpaceHealth();
    expect(disk.availableMb).toBeGreaterThan(0);
    expect(disk.totalMb).toBeGreaterThan(0);
    expect(disk.sufficient).toBe(true);
  });

  it("2.5. Emits full diagnostic report via getFullAiHealthReport", async () => {
    const report = await getFullAiHealthReport();
    expect(report).toBeDefined();
    expect(["HEALTHY", "DEGRADED", "UNHEALTHY"]).toContain(report.status);
    expect(report.telephony).toBeDefined();
    expect(report.momo).toBeDefined();
    expect(typeof report.audio.verified).toBe("boolean");
    expect(report.audio.reviewedFiles).toBeGreaterThanOrEqual(0);
    expect(report.disk.sufficient).toBe(true);
    expect(report.security.zeroPinEnforced).toBe(true);
    expect(report.models.required).toContain("gemini-3.8-flash");
    expect(report.models.required).toContain("gemini-flash-latest");
    expect(report.models.required).toContain("gemini-3.5-transcribe");
    expect(report.models.required).toContain("gemini-3.8-live");
  });

  it("2.6. Emits /api/ai/health endpoint with full JSON diagnostic report", async () => {
    const app = express();
    app.use(express.json());
    app.use(aiRouter);

    const res = await request(app).get("/api/ai/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
    expect(res.body.models).toBeDefined();
    expect(res.body.telephony).toBeDefined();
    expect(res.body.momo).toBeDefined();
    expect(res.body.audio).toBeDefined();
    expect(res.body.disk).toBeDefined();
    expect(res.body.security.zeroPinEnforced).toBe(true);
  });
});
