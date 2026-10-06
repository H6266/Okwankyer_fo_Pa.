/**
 * Ɔkwankyerɛfo Pa - Call Session & Ledger Repository
 * 
 * Provides an honest repository layer for call logs, session traces, and transaction ledger.
 * When DEMO_MODE is true, clearly labels any seeded sample data with an `isDemo: true` flag.
 */

import { TransactionSession, transactionStateMachine } from "../domain/stateMachine";
import { config } from "../config/env";
import { mtnMomoService } from "../modules/mtnMomoService";

export interface StoredCallSession {
  id: string;
  sessionId: string;
  callerNumber: string;
  startedAt: string;
  durationSeconds: number;
  language: "en" | "twi";
  finalStep: string;
  outcome: "COMPLETED" | "CANCELLED" | "FAILED" | "TIMEOUT" | "IN_PROGRESS" | "RECONCILIATION_REQUIRED";
  amountGHS?: number;
  recipientName: string;
  recipientPhone: string;
  referenceId: string;
  isDemo: boolean;
  voiceXmlTrace: Array<{
    step: string;
    voiceXml: string;
    timestamp: string;
  }>;
}

export class CallSessionRepository {
  private inMemorySessions = new Map<string, StoredCallSession>();

  constructor() {
    if (config.demoMode) {
      this.seedDemoSessions();
    }
  }

  private seedDemoSessions(): void {
    const demoSessions: StoredCallSession[] = [
      {
        id: "demo-sess-1",
        sessionId: "DEMO-CALL-001",
        callerNumber: "054****010",
        startedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        durationSeconds: 48,
        language: "en",
        finalStep: "receipt",
        outcome: "COMPLETED",
        amountGHS: 50,
        recipientName: "Kwame Boateng",
        recipientPhone: "055****464",
        referenceId: "OKP-847291",
        isDemo: true,
        voiceXmlTrace: [
          { step: "welcome", voiceXml: "<Response><GetDigits timeout='2' ...><Play url='/audio/Welcome_prompt_01.mp3'/></GetDigits></Response>", timestamp: "12:00:00" },
          { step: "safe-confirmation", voiceXml: "<Response><Say voice='female'>You are about to send 50 Cedis to Kwame Boateng...</Say></Response>", timestamp: "12:00:35" },
        ],
      },
    ];

    for (const s of demoSessions) {
      this.inMemorySessions.set(s.sessionId, s);
    }
  }

  public recordSession(session: StoredCallSession): void {
    this.inMemorySessions.set(session.sessionId, session);
  }

  public upsertSession(partial: Partial<StoredCallSession> & { sessionId: string }): StoredCallSession {
    const existing = this.inMemorySessions.get(partial.sessionId);
    const updated: StoredCallSession = {
      id: existing?.id || `sim-sess-${partial.sessionId}`,
      sessionId: partial.sessionId,
      callerNumber: partial.callerNumber || existing?.callerNumber || "Unknown",
      startedAt: existing?.startedAt || partial.startedAt || new Date().toISOString(),
      durationSeconds: partial.durationSeconds !== undefined ? partial.durationSeconds : (existing?.durationSeconds || 0),
      language: partial.language || existing?.language || "en",
      finalStep: partial.finalStep || existing?.finalStep || "welcome",
      outcome: partial.outcome || existing?.outcome || "IN_PROGRESS",
      amountGHS: partial.amountGHS !== undefined ? partial.amountGHS : existing?.amountGHS,
      recipientName: partial.recipientName || existing?.recipientName || "",
      recipientPhone: partial.recipientPhone || existing?.recipientPhone || "",
      referenceId: partial.referenceId || existing?.referenceId || "",
      isDemo: false,
      voiceXmlTrace: partial.voiceXmlTrace
        ? (existing?.voiceXmlTrace ? [...existing.voiceXmlTrace, ...partial.voiceXmlTrace] : partial.voiceXmlTrace)
        : (existing?.voiceXmlTrace || []),
    };
    this.inMemorySessions.set(partial.sessionId, updated);
    return updated;
  }

  public getSession(sessionId: string): StoredCallSession | undefined {
    return this.inMemorySessions.get(sessionId);
  }

  public getAllSessions(): StoredCallSession[] {
    // Combine state machine live sessions with stored logs
    const liveSessions = transactionStateMachine.getAllSessions();
    for (const live of liveSessions) {
      if (!this.inMemorySessions.has(live.sessionId)) {
        this.inMemorySessions.set(live.sessionId, {
          id: `live-${live.sessionId}`,
          sessionId: live.sessionId,
          callerNumber: live.callerPhone || "Unknown",
          startedAt: new Date(live.createdAt).toISOString(),
          durationSeconds: Math.floor((live.updatedAt - live.createdAt) / 1000),
          language: live.language,
          finalStep: live.state.toLowerCase(),
          outcome:
            live.state === "COMPLETED"
              ? "COMPLETED"
              : live.state === "CANCELLED"
              ? "CANCELLED"
              : live.state === "FAILED"
              ? "FAILED"
              : "IN_PROGRESS",
          amountGHS: live.amount,
          recipientName: live.recipientName || "",
          recipientPhone: live.recipientPhone || "",
          referenceId: live.referenceId,
          isDemo: false,
          voiceXmlTrace: [],
        });
      }
    }

    return Array.from(this.inMemorySessions.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  public getLedger(): any[] {
    return mtnMomoService.getHistory();
  }
}

export const callSessionRepository = new CallSessionRepository();
