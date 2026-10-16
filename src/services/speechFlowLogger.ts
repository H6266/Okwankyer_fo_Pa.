/**
 * Ɔkwankyerɛfo Pa - Authoritative Speech Flow & Bug Diagnostic Logger
 * 
 * Tracks every ASR and TTS request, response, circuit breaker activation,
 * and error flow across all providers (HCI Lab, GhanaNLP, Gemini Multimodal,
 * Local Neural / Piper, Studio Catalog, and Offline synthesis).
 * 
 * Features:
 * 1. Zero-PIN & PII scrubbed diagnostics.
 * 2. Instant bug and anomaly detection (rate limit, quota breach, timeout, format rejection).
 * 3. Durable circular persistence (.cache/speech_flows.json).
 * 4. Rich search and aggregation statistics for UI and monitoring.
 */

import fs from "fs";
import path from "path";
import { redactPii } from "../domain/validation";

export type SpeechFlowType = "ASR" | "TTS";

export type SpeechFlowStatus =
  | "SUCCESS"
  | "CACHED"
  | "FALLBACK"
  | "QUOTA_BLOCKED"
  | "RATE_LIMITED"
  | "SECURITY_BLOCKED"
  | "ERROR";

export type SpeechFlowChannel =
  | "telephony_ivr"
  | "phone_simulator"
  | "asr_lab"
  | "tts_lab"
  | "playground"
  | "direct_api";

export interface SpeechFlowSecurityAudit {
  pinScrubbed: boolean;
  ssrfPassed: boolean;
  sizeValidated: boolean;
  mimeValidated: boolean;
}

export interface SpeechFlowLogEntry {
  id: string;
  timestamp: string;
  flowType: SpeechFlowType;
  channel: SpeechFlowChannel;
  step?: string;
  sessionId?: string;
  callerNumber?: string; // Redacted to last 3 digits
  status: SpeechFlowStatus;
  latencyMs: number;
  requestedProvider: string;
  resolvedProvider: string;
  inputSummary: string; // PII & PIN scrubbed
  outputSummary: string; // PII & PIN scrubbed
  audioSizeBytes?: number;
  durationSec?: number;
  charCount?: number;
  confidence?: number | null;
  confidenceSource?: string;
  language?: string;
  upstreamRequestId?: string;
  httpStatus?: number;
  errorCode?: string;
  errorMessage?: string;
  errorStack?: string;
  quotaAfter?: {
    dailyAsrRemaining: number;
    dailyTtsRemaining: number;
    weeklyAsrRemaining: number;
    weeklyTtsRemaining: number;
  };
  securityAudit: SpeechFlowSecurityAudit;
}

export interface SpeechFlowStats {
  totalFlows: number;
  asrCount: number;
  ttsCount: number;
  successRatePercent: number;
  cachedCount: number;
  fallbackCount: number;
  errorCount: number;
  quotaBlockedCount: number;
  rateLimitedCount: number;
  avgLatencyMs: number;
  recentErrors: Array<{
    id: string;
    timestamp: string;
    flowType: SpeechFlowType;
    errorCode: string;
    errorMessage: string;
    provider: string;
    upstreamRequestId?: string;
  }>;
  providerBreakdown: Record<string, number>;
}

function scrubLogText(text: string): { clean: string; pinScrubbed: boolean } {
  if (!text) return { clean: "", pinScrubbed: false };
  let pinScrubbed = false;

  // Intercept 4-digit PIN numbers
  let clean = text.replace(/\b\d{4}\b/g, () => {
    pinScrubbed = true;
    return "[PIN_REDACTED]";
  });

  // Intercept spoken PIN words
  clean = clean.replace(/\b(one|two|three|four|five|six|seven|eight|nine|zero|baako|mmienu|mmiɛnsa|nan|enum|nsia|nson|nwɔtwe|nkron|hwee)\s+(one|two|three|four|five|six|seven|eight|nine|zero|baako|mmienu|mmiɛnsa|nan|enum|nsia|nson|nwɔtwe|nkron|hwee)\s+(one|two|three|four|five|six|seven|eight|nine|zero|baako|mmienu|mmiɛnsa|nan|enum|nsia|nson|nwɔtwe|nkron|hwee)\s+(one|two|three|four|five|six|seven|eight|nine|zero|baako|mmienu|mmiɛnsa|nan|enum|nsia|nson|nwɔtwe|nkron|hwee)\b/gi, () => {
    pinScrubbed = true;
    return "[SPOKEN_PIN_REDACTED]";
  });

  // Redact phone numbers and standard PII
  clean = redactPii(clean);

  return { clean: clean.slice(0, 200), pinScrubbed };
}

export class SpeechFlowLogger {
  private static instance: SpeechFlowLogger;
  private readonly MAX_LOGS = 200;
  private logs: SpeechFlowLogEntry[] = [];
  private readonly persistencePath: string;

  private constructor() {
    this.persistencePath = path.resolve(process.cwd(), ".cache", "speech_flows.json");
    this.loadPersistedLogs();
  }

  public static getInstance(): SpeechFlowLogger {
    if (!SpeechFlowLogger.instance) {
      SpeechFlowLogger.instance = new SpeechFlowLogger();
    }
    return SpeechFlowLogger.instance;
  }

  private loadPersistedLogs(): void {
    try {
      if (fs.existsSync(this.persistencePath)) {
        const raw = fs.readFileSync(this.persistencePath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.logs = parsed.slice(-this.MAX_LOGS);
        }
      }
    } catch (err: any) {
      console.warn("⚠️ Notice loading speech flow persistence:", err?.message || err);
    }
  }

  private persistLogs(): void {
    try {
      const dir = path.dirname(this.persistencePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.persistencePath, JSON.stringify(this.logs.slice(-50), null, 2), "utf8");
    } catch {}
  }

  /**
   * Records a speech flow execution turn with safety checks and error context.
   */
  public logFlow(params: {
    flowType: SpeechFlowType;
    channel?: SpeechFlowChannel;
    step?: string;
    sessionId?: string;
    callerNumber?: string;
    status: SpeechFlowStatus;
    latencyMs: number;
    requestedProvider: string;
    resolvedProvider: string;
    rawInputSummary: string;
    rawOutputSummary: string;
    audioSizeBytes?: number;
    durationSec?: number;
    charCount?: number;
    confidence?: number | null;
    confidenceSource?: string;
    language?: string;
    upstreamRequestId?: string;
    httpStatus?: number;
    errorCode?: string;
    errorMessage?: string;
    errorStack?: string;
    quotaAfter?: {
      dailyAsrRemaining: number;
      dailyTtsRemaining: number;
      weeklyAsrRemaining: number;
      weeklyTtsRemaining: number;
    };
    ssrfPassed?: boolean;
    sizeValidated?: boolean;
    mimeValidated?: boolean;
  }): SpeechFlowLogEntry {
    const inputScrub = scrubLogText(params.rawInputSummary);
    const outputScrub = scrubLogText(params.rawOutputSummary);
    const callerRedacted = params.callerNumber ? redactPii(params.callerNumber) : undefined;

    const entry: SpeechFlowLogEntry = {
      id: `flow_${params.flowType.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      flowType: params.flowType,
      channel: params.channel || "direct_api",
      step: params.step,
      sessionId: params.sessionId,
      callerNumber: callerRedacted,
      status: params.status,
      latencyMs: Math.max(0, Math.round(params.latencyMs)),
      requestedProvider: params.requestedProvider,
      resolvedProvider: params.resolvedProvider,
      inputSummary: inputScrub.clean,
      outputSummary: outputScrub.clean,
      audioSizeBytes: params.audioSizeBytes,
      durationSec: params.durationSec,
      charCount: params.charCount,
      confidence: params.confidence,
      confidenceSource: params.confidenceSource,
      language: params.language,
      upstreamRequestId: params.upstreamRequestId,
      httpStatus: params.httpStatus,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      errorStack: params.errorStack ? params.errorStack.slice(0, 300) : undefined,
      quotaAfter: params.quotaAfter,
      securityAudit: {
        pinScrubbed: inputScrub.pinScrubbed || outputScrub.pinScrubbed,
        ssrfPassed: params.ssrfPassed ?? true,
        sizeValidated: params.sizeValidated ?? true,
        mimeValidated: params.mimeValidated ?? true,
      },
    };

    this.logs.push(entry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }

    this.persistLogs();

    if (entry.status === "ERROR" || entry.status === "SECURITY_BLOCKED") {
      console.error(
        `🚨 [SPEECH_FLOW_ALERT] ${entry.flowType} on ${entry.channel} (${entry.resolvedProvider}) -> ${entry.status} [${entry.errorCode || "FAIL"}]: ${entry.errorMessage || "Unknown error"}`
      );
    }

    return entry;
  }

  /**
   * Queries logged flows with flexible search and status filtering.
   */
  public getFlows(options: {
    type?: SpeechFlowType;
    status?: SpeechFlowStatus | "ALL";
    provider?: string;
    sessionId?: string;
    search?: string;
    limit?: number;
    errorsOnly?: boolean;
  } = {}): SpeechFlowLogEntry[] {
    const limit = Math.min(200, Math.max(1, options.limit || 50));
    let filtered = [...this.logs];

    if (options.type) {
      filtered = filtered.filter((f) => f.flowType === options.type);
    }
    if (options.status && options.status !== "ALL") {
      filtered = filtered.filter((f) => f.status === options.status);
    }
    if (options.errorsOnly) {
      filtered = filtered.filter((f) => f.status === "ERROR" || f.status === "QUOTA_BLOCKED" || f.status === "SECURITY_BLOCKED");
    }
    if (options.provider) {
      const p = options.provider.toLowerCase();
      filtered = filtered.filter((f) => f.resolvedProvider.toLowerCase().includes(p) || f.requestedProvider.toLowerCase().includes(p));
    }
    if (options.sessionId) {
      filtered = filtered.filter((f) => f.sessionId === options.sessionId);
    }
    if (options.search) {
      const q = options.search.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.inputSummary.toLowerCase().includes(q) ||
          f.outputSummary.toLowerCase().includes(q) ||
          (f.errorCode && f.errorCode.toLowerCase().includes(q)) ||
          (f.errorMessage && f.errorMessage.toLowerCase().includes(q)) ||
          (f.step && f.step.toLowerCase().includes(q))
      );
    }

    return filtered.slice(-limit).reverse();
  }

  /**
   * Calculates comprehensive diagnostic statistics.
   */
  public getStats(): SpeechFlowStats {
    const total = this.logs.length;
    if (total === 0) {
      return {
        totalFlows: 0,
        asrCount: 0,
        ttsCount: 0,
        successRatePercent: 100,
        cachedCount: 0,
        fallbackCount: 0,
        errorCount: 0,
        quotaBlockedCount: 0,
        rateLimitedCount: 0,
        avgLatencyMs: 0,
        recentErrors: [],
        providerBreakdown: {},
      };
    }

    let asrCount = 0;
    let ttsCount = 0;
    let successCount = 0;
    let cachedCount = 0;
    let fallbackCount = 0;
    let errorCount = 0;
    let quotaBlockedCount = 0;
    let rateLimitedCount = 0;
    let totalLatency = 0;
    const providerBreakdown: Record<string, number> = {};
    const recentErrors: SpeechFlowStats["recentErrors"] = [];

    for (const f of this.logs) {
      if (f.flowType === "ASR") asrCount++;
      if (f.flowType === "TTS") ttsCount++;
      if (f.status === "SUCCESS") successCount++;
      if (f.status === "CACHED") cachedCount++;
      if (f.status === "FALLBACK") fallbackCount++;
      if (f.status === "ERROR") errorCount++;
      if (f.status === "QUOTA_BLOCKED") quotaBlockedCount++;
      if (f.status === "RATE_LIMITED") rateLimitedCount++;

      totalLatency += f.latencyMs;

      const p = f.resolvedProvider || "unknown";
      providerBreakdown[p] = (providerBreakdown[p] || 0) + 1;

      if ((f.status === "ERROR" || f.status === "QUOTA_BLOCKED" || f.status === "SECURITY_BLOCKED") && f.errorCode) {
        recentErrors.push({
          id: f.id,
          timestamp: f.timestamp,
          flowType: f.flowType,
          errorCode: f.errorCode,
          errorMessage: f.errorMessage || "Unknown error",
          provider: f.resolvedProvider,
          upstreamRequestId: f.upstreamRequestId,
        });
      }
    }

    const successRatePercent = Number((((successCount + cachedCount) / total) * 100).toFixed(1));
    const avgLatencyMs = Math.round(totalLatency / total);

    return {
      totalFlows: total,
      asrCount,
      ttsCount,
      successRatePercent,
      cachedCount,
      fallbackCount,
      errorCount,
      quotaBlockedCount,
      rateLimitedCount,
      avgLatencyMs,
      recentErrors: recentErrors.slice(-10).reverse(),
      providerBreakdown,
    };
  }

  /**
   * Clears in-memory logs (for testing or reset).
   */
  public clear(): void {
    this.logs = [];
    try {
      if (fs.existsSync(this.persistencePath)) {
        fs.unlinkSync(this.persistencePath);
      }
    } catch {}
  }
}

export const speechFlowLogger = SpeechFlowLogger.getInstance();
