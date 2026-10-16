/**
 * Ɔkwankyerɛfo Pa - University of Ghana HCI Lab Speech Service (ASR & TTS)
 * 
 * Production-hardened service for Akan Twi speech recognition and neural synthesis.
 * Features:
 * 1. Strict Zero-Waste Quota Defense & circuit breakers.
 * 2. Persistent local disk cache for synthesized audio (SHA-256 content addressing).
 * 3. Durable quota persistence across container/server restarts (.cache/hci_quota_state.json).
 * 4. Hardware-concurrency limiter (strict 2 concurrent request limit enforced).
 * 5. In-memory circular diagnostic audit log (last 100 requests) with PII & PIN redaction.
 * 6. Path traversal guards and strict MIME/payload size verification.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "../config/env";
import { auditLogger } from "./auditLogger";
import { speechFlowLogger } from "./speechFlowLogger";

export interface HciLabUsageReport {
  dailyAsrCount: number;
  dailyAsrLimit: number;
  dailyTtsCount: number;
  dailyTtsLimit: number;
  weeklyAsrCount: number;
  weeklyAsrLimit: number;
  weeklyTtsCount: number;
  weeklyTtsLimit: number;
  weeklyCharsCount: number;
  weeklyCharsLimit: number;
  activeConcurrentRequests: number;
  maxConcurrentAllowed: number;
  lastDailyResetUtc: string;
  lastWeeklyResetUtc: string;
  asrCircuitBreakerOpen: boolean;
  ttsCircuitBreakerOpen: boolean;
  configured: boolean;
  accountFingerprint?: string;
}

export interface HciSpeechLogEntry {
  id: string;
  timestamp: string;
  type: "ASR" | "TTS";
  status: "success" | "cached" | "quota_blocked" | "rate_limited" | "error";
  latencyMs: number;
  inputSummary: string; // PII & PIN redacted
  outputSummary: string; // PII & PIN redacted
  requestId?: string;
  audioSizeBytes?: number;
  charCount?: number;
  modelUsed?: string;
  speaker?: string;
  durationSec?: number;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  quotaAfter: {
    dailyAsr: number;
    dailyTts: number;
    weeklyAsr: number;
    weeklyTts: number;
  };
}

export class HciLabError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly isQuotaError: boolean;
  public readonly requestId?: string;

  constructor(message: string, code: string, statusCode?: number, isQuotaError: boolean = false, requestId?: string) {
    super(message);
    this.name = "HciLabError";
    this.code = code;
    this.statusCode = statusCode;
    this.isQuotaError = isQuotaError;
    this.requestId = requestId;
  }
}

function redactPiiForSpeechLogs(text: string): string {
  if (!text) return "";
  return text
    // Redact 4-digit PIN blurts
    .replace(/\b\d{4}\b/g, "[PIN]")
    // Redact phone numbers
    .replace(/\b(0[235]\d{8}|233[235]\d{8})\b/g, "[PHONE]")
    .replace(/\b(?:\d[\s-]*){9,12}\b/g, "[PHONE]")
    .slice(0, 160);
}

export class HciLabService {
  private static instance: HciLabService;
  
  // Rate limiting timestamps (sliding window 60s)
  private requestTimestamps: number[] = [];
  private readonly MAX_REQ_PER_MINUTE = 4; // Safely below 5 req/min

  // Concurrency tracking (strict 2 concurrent requests max per docs)
  private activeConcurrentRequests = 0;
  private readonly MAX_CONCURRENT_REQUESTS = 2;

  // Quota tracking
  private dailyAsrCount = 0;
  private dailyTtsCount = 0;
  private weeklyAsrCount = 0;
  private weeklyTtsCount = 0;
  private weeklyCharsCount = 0;

  private readonly DAILY_ASR_LIMIT = 10;
  private readonly DAILY_TTS_LIMIT = 15;
  private readonly WEEKLY_ASR_LIMIT = 50;
  private readonly WEEKLY_TTS_LIMIT = 70;
  private readonly WEEKLY_CHARS_LIMIT = 5000;

  // Circuit breaker safety buffers
  private readonly ASR_SAFETY_CEILING = 8;
  private readonly TTS_SAFETY_CEILING = 12;

  private asrCircuitBreakerOpen = false;
  private ttsCircuitBreakerOpen = false;

  private lastDailyResetDay: number;
  private lastWeeklyResetWeek: number;

  // File paths for persistence & caching
  private readonly cacheDir: string;
  private readonly stateFilePath: string;

  // In-memory circular log buffer (last 100 entries)
  private speechLogs: HciSpeechLogEntry[] = [];
  private readonly MAX_LOG_ENTRIES = 100;

  // Account switching & fingerprint tracking
  private dynamicApiKey?: string;
  private currentKeyFingerprint = "";

  private constructor() {
    const now = new Date();
    this.lastDailyResetDay = now.getUTCDate();
    this.lastWeeklyResetWeek = this.getUtcWeekNumber(now);

    this.cacheDir = path.resolve(process.cwd(), ".cache", "hci_tts");
    this.stateFilePath = path.resolve(process.cwd(), ".cache", "hci_quota_state.json");

    this.currentKeyFingerprint = this.computeKeyFingerprint(this.apiKey);

    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      this.loadDurableState();
    } catch (err: any) {
      console.warn("⚠️ [HciLabService] Cache dir setup notice:", err?.message || err);
    }
  }

  public static getInstance(): HciLabService {
    if (!HciLabService.instance) {
      HciLabService.instance = new HciLabService();
    }
    return HciLabService.instance;
  }

  private computeKeyFingerprint(key: string): string {
    if (!key || key.length < 4) return "";
    return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  }

  /**
   * Switches or tests an alternative API token at runtime with clean per-account quota.
   */
  public switchAccountToken(newToken: string): { success: boolean; accountFingerprint: string; message: string } {
    const trimmed = (newToken || "").trim();
    if (trimmed.length < 6) {
      throw new Error("Invalid API token: token must be at least 6 characters.");
    }
    const newFingerprint = this.computeKeyFingerprint(trimmed);
    const oldFingerprint = this.currentKeyFingerprint;

    this.dynamicApiKey = trimmed;
    this.currentKeyFingerprint = newFingerprint;

    if (newFingerprint !== oldFingerprint) {
      // Clean quota re-initialization for the new account
      this.dailyAsrCount = 0;
      this.dailyTtsCount = 0;
      this.weeklyAsrCount = 0;
      this.weeklyTtsCount = 0;
      this.weeklyCharsCount = 0;
      this.asrCircuitBreakerOpen = false;
      this.ttsCircuitBreakerOpen = false;
      this.saveDurableState();

      auditLogger.log(
        "info",
        "HCI_LAB",
        `Switched to new API account token (fingerprint: ${newFingerprint}). Quota counters re-initialized.`
      );
    }

    return {
      success: true,
      accountFingerprint: newFingerprint,
      message: `Account switched successfully to token fingerprint [${newFingerprint}]. Fresh quotas applied.`,
    };
  }

  /**
   * Resets quota circuit breaker and counters (manual administrative override).
   */
  public resetQuotaState(): void {
    this.dailyAsrCount = 0;
    this.dailyTtsCount = 0;
    this.weeklyAsrCount = 0;
    this.weeklyTtsCount = 0;
    this.weeklyCharsCount = 0;
    this.asrCircuitBreakerOpen = false;
    this.ttsCircuitBreakerOpen = false;
    this.saveDurableState();
    auditLogger.log("info", "HCI_LAB", "Quota counters manually reset.");
  }

  /**
   * Loads persisted quota counts to prevent reset on server restart,
   * while detecting if the developer has switched API keys in their environment.
   */
  private loadDurableState(): void {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        const raw = fs.readFileSync(this.stateFilePath, "utf8");
        const data = JSON.parse(raw);

        // Account Switch Detection: If key changed, start with fresh quotas
        const savedFingerprint = data.accountFingerprint || "";
        if (this.currentKeyFingerprint && savedFingerprint && savedFingerprint !== this.currentKeyFingerprint) {
          auditLogger.log(
            "info",
            "HCI_LAB",
            `Detected new API token (old: ${savedFingerprint}, new: ${this.currentKeyFingerprint}). Resetting quotas for new account.`
          );
          this.dailyAsrCount = 0;
          this.dailyTtsCount = 0;
          this.weeklyAsrCount = 0;
          this.weeklyTtsCount = 0;
          this.weeklyCharsCount = 0;
          this.asrCircuitBreakerOpen = false;
          this.ttsCircuitBreakerOpen = false;
          this.saveDurableState();
          return;
        }

        if (typeof data.dailyAsrCount === "number") this.dailyAsrCount = data.dailyAsrCount;
        if (typeof data.dailyTtsCount === "number") this.dailyTtsCount = data.dailyTtsCount;
        if (typeof data.weeklyAsrCount === "number") this.weeklyAsrCount = data.weeklyAsrCount;
        if (typeof data.weeklyTtsCount === "number") this.weeklyTtsCount = data.weeklyTtsCount;
        if (typeof data.weeklyCharsCount === "number") this.weeklyCharsCount = data.weeklyCharsCount;
        if (typeof data.lastDailyResetDay === "number") this.lastDailyResetDay = data.lastDailyResetDay;
        if (typeof data.lastWeeklyResetWeek === "number") this.lastWeeklyResetWeek = data.lastWeeklyResetWeek;
        if (typeof data.asrCircuitBreakerOpen === "boolean") this.asrCircuitBreakerOpen = data.asrCircuitBreakerOpen;
        if (typeof data.ttsCircuitBreakerOpen === "boolean") this.ttsCircuitBreakerOpen = data.ttsCircuitBreakerOpen;
        if (Array.isArray(data.speechLogs)) this.speechLogs = data.speechLogs.slice(-this.MAX_LOG_ENTRIES);
      } catch (err: any) {
        console.warn("⚠️ [HciLabService] Notice reading persisted quota state:", err?.message || err);
      }
    }
  }

  /**
   * Persists quota counts and key fingerprint to disk.
   */
  private saveDurableState(): void {
    try {
      const state = {
        accountFingerprint: this.currentKeyFingerprint,
        dailyAsrCount: this.dailyAsrCount,
        dailyTtsCount: this.dailyTtsCount,
        weeklyAsrCount: this.weeklyAsrCount,
        weeklyTtsCount: this.weeklyTtsCount,
        weeklyCharsCount: this.weeklyCharsCount,
        lastDailyResetDay: this.lastDailyResetDay,
        lastWeeklyResetWeek: this.lastWeeklyResetWeek,
        asrCircuitBreakerOpen: this.asrCircuitBreakerOpen,
        ttsCircuitBreakerOpen: this.ttsCircuitBreakerOpen,
        speechLogs: this.speechLogs.slice(-20), // Save top 20 logs
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), "utf8");
    } catch {}
  }

  /**
   * Records a flow entry into circular diagnostic log buffer.
   */
  private recordLog(entry: Omit<HciSpeechLogEntry, "id" | "timestamp" | "quotaAfter">): void {
    const logItem: HciSpeechLogEntry = {
      id: `hci_log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
      inputSummary: redactPiiForSpeechLogs(entry.inputSummary),
      outputSummary: redactPiiForSpeechLogs(entry.outputSummary),
      quotaAfter: {
        dailyAsr: this.dailyAsrCount,
        dailyTts: this.dailyTtsCount,
        weeklyAsr: this.weeklyAsrCount,
        weeklyTts: this.weeklyTtsCount,
      },
    };

    this.speechLogs.push(logItem);
    if (this.speechLogs.length > this.MAX_LOG_ENTRIES) {
      this.speechLogs.shift();
    }
    this.saveDurableState();
  }

  public isConfigured(): boolean {
    const key = this.apiKey;
    return Boolean(key && key.length > 5);
  }

  public get baseUrl(): string {
    return config.hciLab?.baseUrl || "https://lab-subscription-platform.vercel.app";
  }

  public get apiKey(): string {
    return this.dynamicApiKey || config.hciLab?.apiKey || "";
  }

  /**
   * Resets daily and weekly counters at 00:00 UTC.
   */
  private checkAndResetQuotas(): void {
    const now = new Date();
    const currentDay = now.getUTCDate();
    const currentWeek = this.getUtcWeekNumber(now);

    let stateChanged = false;
    if (currentDay !== this.lastDailyResetDay) {
      this.dailyAsrCount = 0;
      this.dailyTtsCount = 0;
      this.lastDailyResetDay = currentDay;
      this.asrCircuitBreakerOpen = false;
      this.ttsCircuitBreakerOpen = false;
      stateChanged = true;
      auditLogger.log("info", "HCI_LAB", "Daily quota reset at 00:00 UTC");
    }

    if (currentWeek !== this.lastWeeklyResetWeek) {
      this.weeklyAsrCount = 0;
      this.weeklyTtsCount = 0;
      this.weeklyCharsCount = 0;
      this.lastWeeklyResetWeek = currentWeek;
      stateChanged = true;
      auditLogger.log("info", "HCI_LAB", "Weekly quota reset at Monday 00:00 UTC");
    }

    if (stateChanged) {
      this.saveDurableState();
    }
  }

  private getUtcWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  /**
   * Enforces max 4 requests per 60 seconds.
   */
  private checkRateLimit(): void {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter((ts) => now - ts < 60000);
    if (this.requestTimestamps.length >= this.MAX_REQ_PER_MINUTE) {
      throw new HciLabError(
        "HCI Lab rate limit precaution engaged (max 4 req/min to protect quota). Please wait a few seconds.",
        "RATE_LIMIT_PRECAUTION",
        429,
        false
      );
    }
    this.requestTimestamps.push(now);
  }

  /**
   * Text-to-Speech (TTS) with SHA-256 persistent disk caching and 0-token replay.
   */
  public async synthesize(
    text: string,
    options: { forceLive?: boolean; timeoutMs?: number } = {}
  ): Promise<{ audioBuffer: Buffer; fromCache: boolean; durationSec?: number }> {
    const startMs = performance.now();
    this.checkAndResetQuotas();

    const sanitizedText = (text || "").trim().slice(0, 250);
    if (!sanitizedText) {
      this.recordLog({
        type: "TTS",
        status: "error",
        latencyMs: 0,
        inputSummary: text,
        outputSummary: "Empty payload error",
        errorCode: "INVALID_TEXT",
        errorMessage: "Text must not be empty",
      });
      throw new HciLabError("Text must not be empty", "INVALID_TEXT", 400);
    }

    // SHA-256 persistent disk cache check (path traversal safe hex)
    const hash = crypto.createHash("sha256").update(`ss:PT:${sanitizedText}`).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new HciLabError("Invalid hash encoding", "SECURITY_VIOLATION", 400);
    }

    const cachedFilePath = path.join(this.cacheDir, `${hash}.wav`);
    if (!cachedFilePath.startsWith(this.cacheDir)) {
      throw new HciLabError("Path traversal violation", "SECURITY_VIOLATION", 403);
    }

    if (!options.forceLive && fs.existsSync(cachedFilePath)) {
      try {
        const cachedBuffer = fs.readFileSync(cachedFilePath);
        const latencyMs = Math.round(performance.now() - startMs);
        this.recordLog({
          type: "TTS",
          status: "cached",
          latencyMs,
          inputSummary: sanitizedText,
          outputSummary: `Read ${cachedBuffer.length} bytes from disk cache`,
          audioSizeBytes: cachedBuffer.length,
          charCount: sanitizedText.length,
          modelUsed: "ss-pt (disk-cache)",
          speaker: "PT",
        });
        return { audioBuffer: cachedBuffer, fromCache: true };
      } catch (err: any) {
        console.warn("⚠️ Failed reading disk cache, proceeding to synthesis:", err?.message || err);
      }
    }

    // Safety checks before touching live API
    if (!this.isConfigured()) {
      this.recordLog({
        type: "TTS",
        status: "error",
        latencyMs: Math.round(performance.now() - startMs),
        inputSummary: sanitizedText,
        outputSummary: "API key unconfigured",
        errorCode: "NOT_CONFIGURED",
        errorMessage: "UG_HCI_LAB_API_KEY is not configured",
      });
      throw new HciLabError("UG_HCI_LAB_API_KEY is not configured", "NOT_CONFIGURED", 503);
    }

    if (this.ttsCircuitBreakerOpen || this.dailyTtsCount >= this.TTS_SAFETY_CEILING) {
      const latencyMs = Math.round(performance.now() - startMs);
      this.recordLog({
        type: "TTS",
        status: "quota_blocked",
        latencyMs,
        inputSummary: sanitizedText,
        outputSummary: `Safety ceiling reached (${this.dailyTtsCount}/${this.DAILY_TTS_LIMIT})`,
        errorCode: "DAILY_QUOTA_RESERVED",
        errorMessage: "Daily safety ceiling engaged to protect Oct 24 quota",
      });
      throw new HciLabError(
        `HCI Lab daily TTS safety limit reached (${this.dailyTtsCount}/${this.DAILY_TTS_LIMIT}). Preserving quota for presentation day.`,
        "DAILY_QUOTA_RESERVED",
        429,
        true
      );
    }

    if (this.weeklyTtsCount >= this.WEEKLY_TTS_LIMIT || this.weeklyCharsCount + sanitizedText.length > this.WEEKLY_CHARS_LIMIT) {
      this.recordLog({
        type: "TTS",
        status: "quota_blocked",
        latencyMs: Math.round(performance.now() - startMs),
        inputSummary: sanitizedText,
        outputSummary: "Weekly TTS quota exceeded",
        errorCode: "WEEKLY_QUOTA_EXCEEDED",
        errorMessage: "Weekly TTS request/char ceiling reached",
      });
      throw new HciLabError("HCI Lab weekly TTS quota limit reached.", "WEEKLY_QUOTA_EXCEEDED", 429, true);
    }

    // Concurrency lock (max 2 concurrent)
    if (this.activeConcurrentRequests >= this.MAX_CONCURRENT_REQUESTS) {
      this.recordLog({
        type: "TTS",
        status: "rate_limited",
        latencyMs: Math.round(performance.now() - startMs),
        inputSummary: sanitizedText,
        outputSummary: "Active concurrency limit reached (max 2)",
        errorCode: "CONCURRENCY_LIMIT",
        errorMessage: "Max 2 concurrent requests allowed",
      });
      throw new HciLabError("HCI Lab active concurrency limit reached (max 2 concurrent).", "CONCURRENCY_LIMIT", 429);
    }

    this.checkRateLimit();

    const timeoutMs = options.timeoutMs || 4000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    this.activeConcurrentRequests++;
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/tts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: sanitizedText,
          model_type: "ss",
          speaker: "PT",
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startMs);
      const requestId = response.headers.get("x-request-id") || undefined;
      const contentType = response.headers.get("content-type") || "";

      if (!response.ok || contentType.includes("application/json")) {
        const errorJson = (await response.json().catch(() => ({}))) as any;
        const errCode = errorJson?.error?.code || `HTTP_${response.status}`;
        const errMsg = errorJson?.error?.message || `TTS failed with status ${response.status}`;

        if (errCode.includes("quota") || response.status === 429) {
          this.ttsCircuitBreakerOpen = true;
          this.saveDurableState();
          auditLogger.log("warn", "HCI_LAB", `TTS quota reached: ${errCode} (reqId: ${requestId})`);
        }

        this.recordLog({
          type: "TTS",
          status: "error",
          latencyMs,
          inputSummary: sanitizedText,
          outputSummary: `HTTP ${response.status}: ${errMsg}`,
          requestId,
          statusCode: response.status,
          errorCode: errCode,
          errorMessage: errMsg,
        });

        throw new HciLabError(errMsg, errCode, response.status, errCode.includes("quota") || response.status === 429, requestId);
      }

      // Successful WAV binary audio returned
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      // Increment counters
      this.dailyTtsCount++;
      this.weeklyTtsCount++;
      this.weeklyCharsCount += sanitizedText.length;
      this.saveDurableState();

      const durationSec = parseFloat(response.headers.get("x-duration-sec") || "0") || undefined;
      const modelUsed = response.headers.get("x-model-used") || "ss-pt";

      // Persist to disk cache
      try {
        fs.writeFileSync(cachedFilePath, audioBuffer);
      } catch (err: any) {
        console.warn("⚠️ Failed writing to disk cache:", err?.message || err);
      }

      this.recordLog({
        type: "TTS",
        status: "success",
        latencyMs,
        inputSummary: sanitizedText,
        outputSummary: `Synthesized ${audioBuffer.length} bytes WAV`,
        requestId,
        audioSizeBytes: audioBuffer.length,
        charCount: sanitizedText.length,
        modelUsed,
        speaker: "PT",
        durationSec,
        statusCode: 200,
      });

      auditLogger.log("info", "HCI_LAB", `Synthesized ${sanitizedText.length} chars (Daily: ${this.dailyTtsCount}/${this.DAILY_TTS_LIMIT}, reqId: ${requestId})`);

      return { audioBuffer, fromCache: false, durationSec };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        const latencyMs = Math.round(performance.now() - startMs);
        this.recordLog({
          type: "TTS",
          status: "error",
          latencyMs,
          inputSummary: sanitizedText,
          outputSummary: "Request timed out",
          errorCode: "TIMEOUT",
          errorMessage: "TTS synthesis timed out",
        });
        throw new HciLabError("HCI Lab TTS request timed out", "TIMEOUT", 504);
      }
      throw err;
    } finally {
      this.activeConcurrentRequests--;
    }
  }

  /**
   * Speech-to-Text (ASR) via multipart/form-data upload.
   */
  public async transcribe(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    options: { timeoutMs?: number } = {}
  ): Promise<{ transcript: string; confidence: number | null; language: string; latencyMs: number }> {
    const startMs = performance.now();
    this.checkAndResetQuotas();

    if (!this.isConfigured()) {
      this.recordLog({
        type: "ASR",
        status: "error",
        latencyMs: 0,
        inputSummary: `MIME: ${mimeType}`,
        outputSummary: "API key unconfigured",
        errorCode: "NOT_CONFIGURED",
        errorMessage: "UG_HCI_LAB_API_KEY is not configured",
      });
      throw new HciLabError("UG_HCI_LAB_API_KEY is not configured", "NOT_CONFIGURED", 503);
    }

    if (this.asrCircuitBreakerOpen || this.dailyAsrCount >= this.ASR_SAFETY_CEILING) {
      const latencyMs = Math.round(performance.now() - startMs);
      this.recordLog({
        type: "ASR",
        status: "quota_blocked",
        latencyMs,
        inputSummary: `MIME: ${mimeType}`,
        outputSummary: `Safety ceiling reached (${this.dailyAsrCount}/${this.DAILY_ASR_LIMIT})`,
        errorCode: "DAILY_QUOTA_RESERVED",
        errorMessage: "Daily safety ceiling engaged to protect Oct 24 quota",
      });
      throw new HciLabError(
        `HCI Lab daily ASR safety limit reached (${this.dailyAsrCount}/${this.DAILY_ASR_LIMIT}). Preserving quota for presentation day.`,
        "DAILY_QUOTA_RESERVED",
        429,
        true
      );
    }

    if (this.weeklyAsrCount >= this.WEEKLY_ASR_LIMIT) {
      this.recordLog({
        type: "ASR",
        status: "quota_blocked",
        latencyMs: Math.round(performance.now() - startMs),
        inputSummary: `MIME: ${mimeType}`,
        outputSummary: "Weekly ASR quota exceeded",
        errorCode: "WEEKLY_QUOTA_EXCEEDED",
        errorMessage: "Weekly ASR request ceiling reached",
      });
      throw new HciLabError("HCI Lab weekly ASR quota limit reached.", "WEEKLY_QUOTA_EXCEEDED", 429, true);
    }

    const rawBuffer = typeof audioPayload === "string"
      ? Buffer.from(audioPayload.replace(/^data:audio\/[a-z0-9-]+;base64,/, ""), "base64")
      : audioPayload;

    if (!rawBuffer || rawBuffer.length < 100) {
      return { transcript: "", confidence: 0.0, language: "tw", latencyMs: 0 };
    }

    if (rawBuffer.length > 10 * 1024 * 1024) {
      throw new HciLabError("Audio file exceeds maximum size of 10MB", "FILE_TOO_LARGE", 400);
    }

    // Concurrency lock (max 2 concurrent)
    if (this.activeConcurrentRequests >= this.MAX_CONCURRENT_REQUESTS) {
      this.recordLog({
        type: "ASR",
        status: "rate_limited",
        latencyMs: Math.round(performance.now() - startMs),
        inputSummary: `MIME: ${mimeType}, Size: ${rawBuffer.length}`,
        outputSummary: "Active concurrency limit reached (max 2)",
        errorCode: "CONCURRENCY_LIMIT",
        errorMessage: "Max 2 concurrent requests allowed",
      });
      throw new HciLabError("HCI Lab active concurrency limit reached (max 2 concurrent).", "CONCURRENCY_LIMIT", 429);
    }

    this.checkRateLimit();

    const timeoutMs = options.timeoutMs || 2500;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    this.activeConcurrentRequests++;
    try {
      const formData = new FormData();
      const ext = mimeType.includes("mp3") ? "mp3" : mimeType.includes("m4a") ? "m4a" : mimeType.includes("aac") ? "aac" : "wav";
      const blob = new Blob([rawBuffer], { type: mimeType });
      formData.append("file", blob, `audio_input.${ext}`);

      const response = await fetch(`${this.baseUrl}/api/v1/asr`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Math.round(performance.now() - startMs);
      const requestId = response.headers.get("x-request-id") || undefined;

      if (!response.ok) {
        const errorJson = (await response.json().catch(() => ({}))) as any;
        const errCode = errorJson?.error?.code || `HTTP_${response.status}`;
        const errMsg = errorJson?.error?.message || `ASR failed with status ${response.status}`;

        if (errCode.includes("quota") || response.status === 429) {
          this.asrCircuitBreakerOpen = true;
          this.saveDurableState();
          auditLogger.log("warn", "HCI_LAB", `ASR quota reached: ${errCode} (reqId: ${requestId})`);
        }

        this.recordLog({
          type: "ASR",
          status: "error",
          latencyMs,
          inputSummary: `Audio ${rawBuffer.length} bytes (${mimeType})`,
          outputSummary: `HTTP ${response.status}: ${errMsg}`,
          requestId,
          statusCode: response.status,
          errorCode: errCode,
          errorMessage: errMsg,
        });

        throw new HciLabError(errMsg, errCode, response.status, errCode.includes("quota") || response.status === 429, requestId);
      }

      const result = (await response.json()) as any;
      const transcript = (result.transcript || result.text || "").trim();
      const confidence = typeof result.confidence === "number" ? result.confidence : (transcript ? 0.90 : null);
      const language = result.language || "tw";

      // Increment counters
      this.dailyAsrCount++;
      this.weeklyAsrCount++;
      this.saveDurableState();

      this.recordLog({
        type: "ASR",
        status: "success",
        latencyMs,
        inputSummary: `Audio ${rawBuffer.length} bytes (${mimeType})`,
        outputSummary: `"${transcript}" (conf: ${confidence})`,
        requestId,
        audioSizeBytes: rawBuffer.length,
        statusCode: 200,
      });

      auditLogger.log("info", "HCI_LAB", `Transcribed audio (${latencyMs}ms, Daily: ${this.dailyAsrCount}/${this.DAILY_ASR_LIMIT}, reqId: ${requestId}): "${redactPiiForSpeechLogs(transcript)}"`);

      return { transcript, confidence, language, latencyMs };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        const latencyMs = Math.round(performance.now() - startMs);
        this.recordLog({
          type: "ASR",
          status: "error",
          latencyMs,
          inputSummary: `Audio ${rawBuffer.length} bytes`,
          outputSummary: "Request timed out",
          errorCode: "TIMEOUT",
          errorMessage: "ASR transcription timed out",
        });
        throw new HciLabError("HCI Lab ASR request timed out", "TIMEOUT", 504);
      }
      throw err;
    } finally {
      this.activeConcurrentRequests--;
    }
  }

  /**
   * Diagnostic and health status inspection (0 tokens/quota consumed).
   */
  public getUsageReport(): HciLabUsageReport {
    this.checkAndResetQuotas();
    return {
      dailyAsrCount: this.dailyAsrCount,
      dailyAsrLimit: this.DAILY_ASR_LIMIT,
      dailyTtsCount: this.dailyTtsCount,
      dailyTtsLimit: this.DAILY_TTS_LIMIT,
      weeklyAsrCount: this.weeklyAsrCount,
      weeklyAsrLimit: this.WEEKLY_ASR_LIMIT,
      weeklyTtsCount: this.weeklyTtsCount,
      weeklyTtsLimit: this.WEEKLY_TTS_LIMIT,
      weeklyCharsCount: this.weeklyCharsCount,
      weeklyCharsLimit: this.WEEKLY_CHARS_LIMIT,
      activeConcurrentRequests: this.activeConcurrentRequests,
      maxConcurrentAllowed: this.MAX_CONCURRENT_REQUESTS,
      lastDailyResetUtc: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), this.lastDailyResetDay)).toISOString(),
      lastWeeklyResetUtc: `Week ${this.lastWeeklyResetWeek}`,
      asrCircuitBreakerOpen: this.asrCircuitBreakerOpen,
      ttsCircuitBreakerOpen: this.ttsCircuitBreakerOpen,
      configured: this.isConfigured(),
    };
  }

  /**
   * Returns recent speech flow logs (max 100) for debugging & audits.
   */
  public getSpeechLogs(limit: number = 50): HciSpeechLogEntry[] {
    return this.speechLogs.slice(-Math.min(limit, this.MAX_LOG_ENTRIES)).reverse();
  }
}

export const hciLabService = HciLabService.getInstance();
