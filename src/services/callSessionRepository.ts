/**
 * Ɔkwankyerɛfo Pa - Call Session & Ledger Repository
 * 
 * Provides an authoritative repository layer for call logs, conversation flows,
 * API request tracing, and transaction ledger.
 * When DEMO_MODE is true, clearly labels any seeded sample data with an `isDemo: true` flag.
 */

import { TransactionSession, transactionStateMachine } from "../domain/stateMachine";
import { config } from "../config/env";
import { mtnMomoService } from "../modules/mtnMomoService";

export interface CallConversationTurn {
  id: string;
  turnNumber: number;
  timestamp: string;
  callerInput: string;
  callerChannel: "VOICE" | "DTMF" | "SIMULATOR" | "TEXT";
  asrProvider?: string;
  asrConfidence?: number | null;
  asrLatencyMs?: number;
  intent?: string;
  entitiesExtracted?: Record<string, any>;
  assistantResponse: string;
  assistantAudioUrl?: string | null;
  ttsProvider?: string;
  step: string;
  status: "SUCCESS" | "FAILED" | "FALLBACK";
  rawAsrText?: string;
}

export interface CallApiTrace {
  id: string;
  timestamp: string;
  endpoint: string;
  method: string;
  provider: string; // e.g. "HCI_LAB_ASR", "HCI_LAB_TTS", "PIPER_LOCAL", "MTN_MOMO", "KYC_DIRECTORY"
  latencyMs: number;
  httpStatus: number;
  requestSummary?: string;
  responseSummary?: string;
  status: "SUCCESS" | "ERROR" | "TIMEOUT" | "RATE_LIMITED" | "QUOTA_EXCEEDED";
  errorMessage?: string;
}

export interface CallDiagnosticEvent {
  id: string;
  timestamp: string;
  type: "INFO" | "WARN" | "ERROR" | "QUOTA" | "RATE_LIMIT";
  message: string;
  details?: any;
}

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
  conversationTurns: CallConversationTurn[];
  apiRequests: CallApiTrace[];
  diagnostics: CallDiagnosticEvent[];
  voiceCallDetails?: {
    recordingUrl?: string;
    durationInSeconds?: number;
    currencyCode?: string;
    amount?: string;
  };
  voiceXmlTrace: Array<{
    step: string;
    voiceXml: string;
    timestamp: string;
  }>;
}

export class CallSessionRepository {
  private inMemorySessions = new Map<string, StoredCallSession>();

  constructor() {
    this.seedDemoSessions();
  }

  private seedDemoSessions(): void {
    const demoSessions: StoredCallSession[] = [
      {
        id: "demo-sess-1",
        sessionId: "DEMO-MOMO-CALL-001",
        callerNumber: "024****491",
        startedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        durationSeconds: 54,
        language: "en",
        finalStep: "receipt",
        outcome: "COMPLETED",
        amountGHS: 50,
        recipientName: "Kwame Boateng",
        recipientPhone: "0553838464",
        referenceId: "OKP-847291",
        isDemo: true,
        conversationTurns: [
          {
            id: "turn-1",
            turnNumber: 1,
            timestamp: "12:00:05",
            callerInput: "I want to send fifty cedis to Kwame Boateng",
            callerChannel: "VOICE",
            asrProvider: "HCI_LAB_ASR",
            asrConfidence: 0.94,
            asrLatencyMs: 820,
            intent: "SEND_MONEY",
            entitiesExtracted: { amount: 50, recipientName: "Kwame Boateng" },
            assistantResponse: "Please speak or enter Kwame Boateng's 10-digit mobile phone number.",
            assistantAudioUrl: "/audio/Prompt_Recipient_Number.mp3",
            ttsProvider: "tier1-studio-catalog",
            step: "enter-recipient",
            status: "SUCCESS",
          },
          {
            id: "turn-2",
            turnNumber: 2,
            timestamp: "12:00:22",
            callerInput: "0553838464",
            callerChannel: "VOICE",
            asrProvider: "HCI_LAB_ASR",
            asrConfidence: 0.98,
            asrLatencyMs: 650,
            intent: "PROVIDE_PHONE",
            entitiesExtracted: { recipientPhone: "0553838464" },
            assistantResponse: "Recipient verified as Kwame Boateng on MTN. You are about to send 50 Ghana Cedis. Say yes or press 1 to confirm.",
            assistantAudioUrl: null,
            ttsProvider: "tier1-hci-lab-neural-tts",
            step: "safe-confirmation",
            status: "SUCCESS",
          },
          {
            id: "turn-3",
            turnNumber: 3,
            timestamp: "12:00:38",
            callerInput: "Yes confirm",
            callerChannel: "VOICE",
            asrProvider: "HCI_LAB_ASR",
            asrConfidence: 0.96,
            asrLatencyMs: 510,
            intent: "CONFIRM_TRANSFER",
            entitiesExtracted: { confirmed: true },
            assistantResponse: "Transfer of 50 Cedis to Kwame Boateng completed! Your reference is OKP-847291.",
            assistantAudioUrl: "/audio/Success.mp3",
            ttsProvider: "tier1-studio-catalog",
            step: "receipt",
            status: "SUCCESS",
          },
        ],
        apiRequests: [
          {
            id: "req-1",
            timestamp: "12:00:04",
            endpoint: "/api/v1/asr",
            method: "POST",
            provider: "HCI_LAB_ASR",
            latencyMs: 820,
            httpStatus: 200,
            requestSummary: "Audio 16kHz WAV (1.8s) -> 'I want to send fifty cedis to Kwame Boateng'",
            responseSummary: "Confidence: 0.94, Tokens: 9",
            status: "SUCCESS",
          },
          {
            id: "req-2",
            timestamp: "12:00:23",
            endpoint: "/api/momo/account/holder/0553838464",
            method: "GET",
            provider: "KYC_DIRECTORY",
            latencyMs: 140,
            httpStatus: 200,
            requestSummary: "Lookup holder: 0553838464",
            responseSummary: "Name: Kwame Boateng, Network: MTN, KYC: Verified",
            status: "SUCCESS",
          },
          {
            id: "req-3",
            timestamp: "12:00:25",
            endpoint: "/api/v1/tts",
            method: "POST",
            provider: "HCI_LAB_TTS",
            latencyMs: 940,
            httpStatus: 200,
            requestSummary: "Synthesize: 'Recipient verified as Kwame Boateng on MTN...'",
            responseSummary: "WAV Audio 184kB generated",
            status: "SUCCESS",
          },
          {
            id: "req-4",
            timestamp: "12:00:39",
            endpoint: "/api/momo/transfer",
            method: "POST",
            provider: "MTN_MOMO",
            latencyMs: 420,
            httpStatus: 200,
            requestSummary: "Disbursement GHS 50.00 to 0553838464 (Kwame Boateng)",
            responseSummary: "Transaction SUCCESSFUL, Ref: OKP-847291",
            status: "SUCCESS",
          },
        ],
        diagnostics: [
          {
            id: "diag-1",
            timestamp: "12:00:01",
            type: "INFO",
            message: "Inbound audio channel initialized with 16kHz mono PCM stream.",
          },
          {
            id: "diag-2",
            timestamp: "12:00:23",
            type: "INFO",
            message: "Zero-PIN verification enforced: Secret MoMo PIN guarded from voice channel.",
          },
        ],
        voiceXmlTrace: [
          { step: "welcome", voiceXml: "<Response><GetDigits timeout='2' ...><Play url='/audio/Welcome_prompt_01.mp3'/></GetDigits></Response>", timestamp: "12:00:00" },
          { step: "safe-confirmation", voiceXml: "<Response><Say voice='female'>You are about to send 50 Cedis to Kwame Boateng...</Say></Response>", timestamp: "12:00:35" },
        ],
      },
      {
        id: "demo-sess-2",
        sessionId: "DEMO-TWI-CALL-002",
        callerNumber: "055****381",
        startedAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        durationSeconds: 42,
        language: "twi",
        finalStep: "safe-confirmation",
        outcome: "IN_PROGRESS",
        amountGHS: 20,
        recipientName: "Ama Serwaa",
        recipientPhone: "0244123987",
        referenceId: "OKP-918234",
        isDemo: true,
        conversationTurns: [
          {
            id: "turn-twi-1",
            turnNumber: 1,
            timestamp: "12:15:02",
            callerInput: "Mepɛ sɛ memane sika aduonu kɔma Ama Serwaa",
            callerChannel: "VOICE",
            asrProvider: "HCI_LAB_ASR",
            asrConfidence: 0.91,
            asrLatencyMs: 980,
            intent: "SEND_MONEY",
            entitiesExtracted: { amount: 20, recipientName: "Ama Serwaa" },
            assistantResponse: "Yɛsrɛ wo bɔ obi a woremane no no fon nɔmba a ɛyɛ du.",
            assistantAudioUrl: "/audio/Twi/5.Recipient%20Phone%20Number/RECIPIENT_PHONE.aac",
            ttsProvider: "tier1-studio-catalog",
            step: "enter-recipient",
            status: "SUCCESS",
          },
        ],
        apiRequests: [
          {
            id: "req-twi-1",
            timestamp: "12:15:01",
            endpoint: "/api/v1/asr",
            method: "POST",
            provider: "HCI_LAB_ASR",
            latencyMs: 980,
            httpStatus: 200,
            requestSummary: "Akan Twi Audio (2.1s) -> 'Mepɛ sɛ memane sika aduonu kɔma Ama Serwaa'",
            responseSummary: "Confidence: 0.91, Dialect: Asante Twi",
            status: "SUCCESS",
          },
        ],
        diagnostics: [
          {
            id: "diag-twi-1",
            timestamp: "12:15:00",
            type: "INFO",
            message: "Language detected as Akan Twi (Asante). HCI Lab primary Akan speech pipeline engaged.",
          },
        ],
        voiceXmlTrace: [],
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
      isDemo: existing?.isDemo ?? false,
      conversationTurns: partial.conversationTurns || existing?.conversationTurns || [],
      apiRequests: partial.apiRequests || existing?.apiRequests || [],
      diagnostics: partial.diagnostics || existing?.diagnostics || [],
      voiceCallDetails: partial.voiceCallDetails || existing?.voiceCallDetails,
      voiceXmlTrace: partial.voiceXmlTrace
        ? (existing?.voiceXmlTrace ? [...existing.voiceXmlTrace, ...partial.voiceXmlTrace] : partial.voiceXmlTrace)
        : (existing?.voiceXmlTrace || []),
    };
    this.inMemorySessions.set(partial.sessionId, updated);
    return updated;
  }

  public addTurn(sessionId: string, turn: CallConversationTurn): StoredCallSession {
    let session = this.inMemorySessions.get(sessionId);
    if (!session) {
      session = this.upsertSession({ sessionId });
    }
    const turns = [...session.conversationTurns, turn];
    session.conversationTurns = turns;
    session.finalStep = turn.step || session.finalStep;
    this.inMemorySessions.set(sessionId, session);
    return session;
  }

  public addApiTrace(sessionId: string, trace: CallApiTrace): StoredCallSession {
    let session = this.inMemorySessions.get(sessionId);
    if (!session) {
      session = this.upsertSession({ sessionId });
    }
    const traces = [...session.apiRequests, trace];
    session.apiRequests = traces;
    this.inMemorySessions.set(sessionId, session);
    return session;
  }

  public addDiagnostic(sessionId: string, diagnostic: CallDiagnosticEvent): StoredCallSession {
    let session = this.inMemorySessions.get(sessionId);
    if (!session) {
      session = this.upsertSession({ sessionId });
    }
    const diags = [...session.diagnostics, diagnostic];
    session.diagnostics = diags;
    this.inMemorySessions.set(sessionId, session);
    return session;
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
          conversationTurns: [],
          apiRequests: [],
          diagnostics: [],
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
