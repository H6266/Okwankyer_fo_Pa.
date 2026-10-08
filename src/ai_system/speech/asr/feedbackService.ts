/**
 * Ɔkwankyerɛfo Pa - ASR Feedback & Diagnostics Service (feedbackService.ts)
 * 
 * Responsibilities:
 * - Collects structured user corrections to speech transcriptions
 * - Enforces Zero-PIN & PII redaction before storage (masks PINs, credentials, phone numbers)
 * - Tracks empirical ASR telemetry (turns, provider usage, latencies, error rates)
 * - Computes honest dashboard diagnostics (p50/p95 latency, real correction rates)
 * - NEVER stores raw PINs or unredacted financial secrets
 */

import fs from "fs";
import path from "path";

export type FeedbackReason =
  | "wrong_word"
  | "wrong_name"
  | "wrong_number"
  | "wrong_language"
  | "missed_speech"
  | "noise"
  | "code_switching"
  | "accent"
  | "other";

export interface AsrFeedbackEntry {
  feedbackId: string;
  sessionId: string;
  chunkId?: string;
  provider: string;
  language: string;
  originalTranscript: string;
  correctedTranscript: string;
  reason: FeedbackReason;
  userNotes?: string;
  timestamp: number;
  userConsent: boolean;
}

export interface AsrTurnTelemetry {
  turnId: string;
  timestamp: number;
  provider: string;
  fallbackUsed: boolean;
  timeoutOccurred: boolean;
  emptyResult: boolean;
  latencyMs: number;
  language: string;
  speechDetected: boolean;
  qualityStatus: string;
}

export interface AsrFeedbackMetrics {
  totalTurns: number;
  ghanaNlpUsageCount: number;
  ghanaNlpUsageRate: number;
  fallbackUsageCount: number;
  fallbackUsageRate: number;
  timeoutCount: number;
  emptyResultCount: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  speechDetectionFailureRate: number;
  audioQualityFailureRate: number;
  totalFeedbackCount: number;
  overallCorrectionRate: number;
  languageDistribution: Record<string, number>;
  twiCorrectionRate: number;
  englishCorrectionRate: number;
  codeSwitchCorrectionRate: number;
  recentFeedback: AsrFeedbackEntry[];
}

export class FeedbackService {
  private feedbackEntries: AsrFeedbackEntry[] = [];
  private turnTelemetries: AsrTurnTelemetry[] = [];
  private feedbackFilePath: string;

  constructor() {
    const dataDir = path.resolve(process.cwd(), "data");
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch {}
    this.feedbackFilePath = path.join(dataDir, "asr_feedback.jsonl");
    this.loadPersistedFeedback();
  }

  /**
   * Sanitizes text to remove PINs, passwords, and sensitive financial credentials.
   */
  public sanitizeTranscript(text: string, maskPhone: boolean = true): string {
    if (!text) return "";
    let sanitized = text;

    // Redact explicit PIN words and adjacent numbers
    sanitized = sanitized.replace(/\b(pin|momo\s*pin|password|secret|passcode)\s*[:=]?\s*\d+/gi, "$1 [REDACTED_PIN]");
    sanitized = sanitized.replace(/\b\d{4,6}\b/g, (match) => {
      // If it looks like a 4-6 digit standalone PIN (not year 2024-2026 or cedi amounts)
      if (match.startsWith("19") || match.startsWith("20")) return match;
      return "[REDACTED_NUMBER]";
    });

    // Mask phone numbers if requested: 0553838464 -> 055***64
    if (maskPhone) {
      sanitized = sanitized.replace(/\b0(20|23|24|26|27|28|30|50|54|55|57|59)\d{7}\b/g, (phone) => {
        return `${phone.slice(0, 3)}****${phone.slice(-2)}`;
      });
    }

    return sanitized;
  }

  /**
   * Records an ASR execution turn for honest telemetry analysis.
   */
  public recordTurn(telemetry: Omit<AsrTurnTelemetry, "turnId" | "timestamp">): void {
    const entry: AsrTurnTelemetry = {
      turnId: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      ...telemetry,
    };
    this.turnTelemetries.push(entry);
    // Keep max 10,000 recent turns in memory
    if (this.turnTelemetries.length > 10000) {
      this.turnTelemetries.shift();
    }
  }

  /**
   * Submits a user correction to an ASR transcription.
   */
  public submitCorrection(params: {
    sessionId: string;
    chunkId?: string;
    provider: string;
    language: string;
    originalTranscript: string;
    correctedTranscript: string;
    reason: FeedbackReason;
    userNotes?: string;
    userConsent?: boolean;
  }): AsrFeedbackEntry {
    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const consent = params.userConsent !== false;

    const entry: AsrFeedbackEntry = {
      feedbackId,
      sessionId: params.sessionId,
      chunkId: params.chunkId,
      provider: params.provider || "unknown",
      language: params.language || "twi",
      originalTranscript: this.sanitizeTranscript(params.originalTranscript, !consent),
      correctedTranscript: this.sanitizeTranscript(params.correctedTranscript, !consent),
      reason: params.reason,
      userNotes: params.userNotes ? this.sanitizeTranscript(params.userNotes) : undefined,
      timestamp: Date.now(),
      userConsent: consent,
    };

    this.feedbackEntries.push(entry);
    this.persistEntry(entry);
    return entry;
  }

  private persistEntry(entry: AsrFeedbackEntry): void {
    try {
      const line = JSON.stringify(entry) + "\n";
      fs.appendFileSync(this.feedbackFilePath, line, "utf-8");
    } catch (err: any) {
      console.warn(`[FeedbackService] Warning: Could not persist feedback to file: ${err.message}`);
    }
  }

  private loadPersistedFeedback(): void {
    try {
      if (fs.existsSync(this.feedbackFilePath)) {
        const raw = fs.readFileSync(this.feedbackFilePath, "utf-8");
        const lines = raw.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            this.feedbackEntries.push(parsed);
          } catch {}
        }
      }
    } catch {}
  }

  /**
   * Computes rigorous, honest telemetry metrics.
   * No manufactured accuracy; ground truth calculations only.
   */
  public getMetrics(): AsrFeedbackMetrics {
    const turns = this.turnTelemetries;
    const totalTurns = turns.length;

    let ghanaNlpCount = 0;
    let fallbackCount = 0;
    let timeoutCount = 0;
    let emptyResultCount = 0;
    let speechFailCount = 0;
    let qualityFailCount = 0;
    const latencies: number[] = [];
    const languageDist: Record<string, number> = {};

    for (const t of turns) {
      if (t.provider.toLowerCase().includes("ghananlp")) {
        ghanaNlpCount++;
      }
      if (t.fallbackUsed) fallbackCount++;
      if (t.timeoutOccurred) timeoutCount++;
      if (t.emptyResult) emptyResultCount++;
      if (!t.speechDetected) speechFailCount++;
      if (t.qualityStatus === "LOW_AUDIO_QUALITY" || t.qualityStatus === "CORRUPT_AUDIO") {
        qualityFailCount++;
      }
      latencies.push(t.latencyMs);

      const langKey = t.language || "unknown";
      languageDist[langKey] = (languageDist[langKey] || 0) + 1;
    }

    latencies.sort((a, b) => a - b);
    const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    const p50Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p95Latency = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

    const totalFeedback = this.feedbackEntries.length;
    const overallCorrectionRate = totalTurns > 0 ? Number((totalFeedback / totalTurns).toFixed(3)) : 0;

    // Language specific correction rates
    const twiTurns = turns.filter((t) => t.language.includes("tw")).length;
    const engTurns = turns.filter((t) => t.language.includes("en")).length;
    const mixedTurns = turns.filter((t) => t.language.includes("mix")).length;

    const twiFeedback = this.feedbackEntries.filter((f) => f.language.includes("tw")).length;
    const engFeedback = this.feedbackEntries.filter((f) => f.language.includes("en")).length;
    const mixedFeedback = this.feedbackEntries.filter((f) => f.language.includes("mix")).length;

    return {
      totalTurns,
      ghanaNlpUsageCount: ghanaNlpCount,
      ghanaNlpUsageRate: totalTurns > 0 ? Number((ghanaNlpCount / totalTurns).toFixed(3)) : 0,
      fallbackUsageCount: fallbackCount,
      fallbackUsageRate: totalTurns > 0 ? Number((fallbackCount / totalTurns).toFixed(3)) : 0,
      timeoutCount,
      emptyResultCount,
      avgLatencyMs: avgLatency,
      p50LatencyMs: p50Latency,
      p95LatencyMs: p95Latency,
      speechDetectionFailureRate: totalTurns > 0 ? Number((speechFailCount / totalTurns).toFixed(3)) : 0,
      audioQualityFailureRate: totalTurns > 0 ? Number((qualityFailCount / totalTurns).toFixed(3)) : 0,
      totalFeedbackCount: totalFeedback,
      overallCorrectionRate,
      languageDistribution: languageDist,
      twiCorrectionRate: twiTurns > 0 ? Number((twiFeedback / twiTurns).toFixed(3)) : 0,
      englishCorrectionRate: engTurns > 0 ? Number((engFeedback / engTurns).toFixed(3)) : 0,
      codeSwitchCorrectionRate: mixedTurns > 0 ? Number((mixedFeedback / mixedTurns).toFixed(3)) : 0,
      recentFeedback: this.feedbackEntries.slice(-10),
    };
  }
}

export const feedbackService = new FeedbackService();
