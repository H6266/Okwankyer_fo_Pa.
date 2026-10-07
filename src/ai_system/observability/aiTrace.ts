/**
 * Ɔkwankyerɛfo Pa - AI Execution Trace & Telemetry
 * Provides structured decision metadata for development and debugging without leaking PII.
 */

export interface AiTraceRecord {
  traceId: string;
  sessionId: string;
  timestamp: number;
  input: string;
  normalizedInput: string;
  detectedLanguage: string;
  intent: string;
  confidence: number;
  slots: Record<string, any>;
  navigationDecision: string;
  actionRequested: string;
  riskLevel: string;
  safetyFlag: boolean;
  response: string;
  speechVoiceProfile: string;
  latencies: {
    totalMs: number;
    perceptionMs?: number;
    memoryMs?: number;
    understandingMs?: number;
    actionPlanningMs?: number;
    responsePlanningMs?: number;
  };
}

function sanitizeTraceText(text: string): string {
  if (!text) return "";
  // 1. Redact PINs
  let sanitized = text.replace(/\b(?:\d[\s-]*){4,6}\b/g, "[PIN_REDACTED]");
  sanitized = sanitized.replace(/\b(?:pin|secret|passcode|code|password)\b/gi, "[PIN_KEYWORD]");
  // 2. Mask 10-digit / international phone numbers
  sanitized = sanitized.replace(/\b(0[235]\d{8}|233[235]\d{8})\b/g, "[PHONE_MASKED]");
  sanitized = sanitized.replace(/\b(?:\d[\s-]*){9,12}\b/g, "[PHONE_MASKED]");
  // 3. Mask spoken phone numbers in English or Twi
  const spokenSequenceRegex = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)(?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|hwee|baako|mmienu|mmiensa|mmiɛnsa|ɛnan|enan|enum|nsia|nson|nwɔtwe|nwotwe|nkron|kron)){6,}\b/gi;
  sanitized = sanitized.replace(spokenSequenceRegex, "[PHONE_MASKED]");
  // 4. Mask currency / amounts
  sanitized = sanitized.replace(/\b\d+(\.\d{1,2})?\s*(?:ghs|cedis?|pesewas?|sidi)?\b/gi, "[AMOUNT_MASKED]");
  return sanitized;
}

function sanitizeTraceSlots(slots: Record<string, any>): Record<string, any> {
  if (!slots) return {};
  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(slots)) {
    if (k.toLowerCase().includes("pin") || k.toLowerCase().includes("secret")) {
      continue; // drop PIN entirely
    }
    if (k === "recipientPhone" || k === "phone") {
      sanitized[k] = typeof v === "string" && v.length >= 7
        ? `${v.slice(0, 3)}****${v.slice(-3)}`
        : "[PHONE_MASKED]";
    } else if (k === "recipientName" || k === "name") {
      sanitized[k] = "[NAME_MASKED]";
    } else if (k === "amount") {
      sanitized[k] = "[AMOUNT_MASKED]";
      sanitized.hasAmount = true;
    } else if (typeof v === "object" && v !== null) {
      sanitized[k] = sanitizeTraceSlots(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

export class AiTrace {
  private traces = new Map<string, AiTraceRecord[]>();

  public log(record: AiTraceRecord): void {
    const sanitizedRecord: AiTraceRecord = {
      ...record,
      input: sanitizeTraceText(record.input),
      normalizedInput: sanitizeTraceText(record.normalizedInput),
      slots: sanitizeTraceSlots(record.slots || {}),
      response: sanitizeTraceText(record.response || ""),
    };
    const list = this.traces.get(record.sessionId) || [];
    list.push(sanitizedRecord);
    if (list.length > 20) list.shift();
    this.traces.set(record.sessionId, list);
  }

  public getSessionTraces(sessionId: string): AiTraceRecord[] {
    return this.traces.get(sessionId) || [];
  }

  public getTrace(traceId: string): AiTraceRecord | undefined {
    for (const list of this.traces.values()) {
      const match = list.find((t) => t.traceId === traceId);
      if (match) return match;
    }
    return undefined;
  }
}

export const aiTrace = new AiTrace();
