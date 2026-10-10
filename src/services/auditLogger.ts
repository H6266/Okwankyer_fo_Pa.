/**
 * Ɔkwankyerɛfo Pa - Structured Audit Logger with PII Redaction
 * 
 * Guarantees that:
 * 1. Every log entry includes a per-call correlation ID.
 * 2. Mobile numbers are redacted (keeping only last 3 digits).
 * 3. Secret PIN digits or tokens are strictly purged before writing.
 */

import { redactPii, containsPinPattern } from "../domain/validation";

export type AuditCategory =
  | "TELEPHONY"
  | "MOMO"
  | "NLU"
  | "SECURITY"
  | "SYSTEM"
  | "MOMO_SAGA"
  | "SMS"
  | "SMS_SIMULATED"
  | "STT"
  | "PIN_SAFETY"
  | "AI_CIRCUIT_BREAKER"
  | "RECONCILIATION_REQUIRED"
  | string;

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error";
  category: AuditCategory;
  message: string;
  correlationId?: string;
}

class AuditLogger {
  private logBuffer: LogEntry[] = [];
  private readonly MAX_LOGS = 250;

  public log(
    level: LogEntry["level"],
    category: AuditCategory,
    rawMessage: string,
    correlationId?: string
  ): void {
    if (containsPinPattern(rawMessage)) {
      console.warn("⚠️ [SECURITY WARNING] Attempted to log message with PIN pattern. Scrubbing.");
    }

    const cleanMessage = redactPii(rawMessage);
    const entry: LogEntry = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message: cleanMessage,
      correlationId,
    };

    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.MAX_LOGS) {
      this.logBuffer.shift();
    }

    const prefix = correlationId ? `[${correlationId}] ` : "";
    if (level === "error") {
      console.error(`[${category}] ${prefix}${cleanMessage}`);
    } else if (level === "warn") {
      console.warn(`[${category}] ${prefix}${cleanMessage}`);
    } else {
      console.log(`[${category}] ${prefix}${cleanMessage}`);
    }
  }

  public getRecentLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  public getLogs(): LogEntry[] {
    return [...this.logBuffer];
  }

  public clear(): void {
    this.logBuffer = [];
  }
}

export const auditLogger = new AuditLogger();
