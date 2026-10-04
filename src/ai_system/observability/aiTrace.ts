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

export class AiTrace {
  private traces = new Map<string, AiTraceRecord[]>();

  public log(record: AiTraceRecord): void {
    const list = this.traces.get(record.sessionId) || [];
    list.push(record);
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
