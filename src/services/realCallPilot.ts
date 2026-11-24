import crypto from "crypto";
import fs from "fs";
import path from "path";
import { evaluateVoiceSamples, LevenshteinSample } from "../ai_system/speech/voiceEvaluation";

export type PilotLanguage = "en" | "twi";

export interface RealCallEvidence {
  callId: string;
  participantId: string;
  consentRecorded: true;
  language: PilotLanguage;
  task: "greeting" | "balance" | "airtime" | "data" | "transfer" | "withdrawal" | "correction" | "confirmation" | "ambiguous" | "dtmf_recovery";
  humanVerifiedTranscript?: string;
  providerTranscript?: string;
  identifiedIntent?: string;
  expectedIntent?: string;
  entities?: {
    amount?: number;
    recipientReference?: string;
  };
  clarificationRequired: boolean;
  recoveryUsed: "speech" | "dtmf" | "none";
  conversationCompleted: boolean;
  spokenResponseDelivered: boolean;
  unexpectedCallTermination: boolean;
  emptyTranscription: boolean;
  recognitionTimeout: boolean;
  failureOrigin?: "carrier" | "asr" | "normalization" | "nlu" | "session" | "audio" | "none";
  accessibility?: {
    understoodInstructions: boolean;
    selectedPreferredLanguage: boolean;
    navigatedWithoutScreen: boolean;
    recoveredWhenMisunderstood: boolean;
    completedWithoutAssistance: boolean;
  };
}

export interface RealCallPilotReport {
  consentingParticipants: number;
  attemptedCalls: number;
  completedCalls: number;
  english: {
    calls: number;
    completed: number;
    wer: number | null;
    cer: number | null;
    intentAccuracy: number | null;
  };
  twi: {
    calls: number;
    completed: number;
    wer: number | null;
    cer: number | null;
    intentAccuracy: number | null;
  };
  emptyTranscriptionRate: number | null;
  recoverySuccessRate: number | null;
  unexpectedTerminationRate: number | null;
  accessibilityFeedbackCount: number;
  evidenceState: "NO_REAL_CALL_EVIDENCE" | "REAL_CALL_EVIDENCE_RECORDED";
  limitations: string[];
}

function anonymize(value: string): string {
  return `anon_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function redactSensitiveText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\b(?:pin|password|passcode|secret)\b[\s:=]*\d{4,10}/gi, "[REDACTED]")
    .replace(/\b(?:\+?233|0)(?:[\s.-]*\d){9}\b/g, "[SYNTHETIC_NUMBER]")
    .replace(/\b\d{4,10}\b/g, "[NUMBER]");
}

export class RealCallPilotService {
  private readonly defaultFilePath = path.resolve(process.cwd(), "data", "real_call_pilot.jsonl");
  private records: RealCallEvidence[] = [];

  constructor() {
    if (this.isEnabled()) this.load();
  }

  public isEnabled(): boolean {
    const storagePath = process.env.PILOT_EVIDENCE_STORAGE_PATH?.trim();
    return process.env.PILOT_EVIDENCE_ENABLED === "true" &&
      Boolean(storagePath && path.isAbsolute(storagePath));
  }

  private get filePath(): string {
    const storagePath = process.env.PILOT_EVIDENCE_STORAGE_PATH?.trim();
    return storagePath && path.isAbsolute(storagePath)
      ? path.resolve(storagePath)
      : this.defaultFilePath;
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    const lines = fs.readFileSync(this.filePath, "utf8").split("\n").filter((line) => line.trim());
    this.records = lines.map((line) => JSON.parse(line) as RealCallEvidence).filter((record) =>
      record.consentRecorded === true
    );
  }

  private persist(record: RealCallEvidence): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
  }

  public record(input: Omit<RealCallEvidence, "callId" | "participantId"> & {
    callId: string;
    participantId: string;
  }): RealCallEvidence {
    if (!this.isEnabled()) {
      throw new Error("Call evidence collection is disabled until an approved persistent storage path is configured.");
    }
    if (input.consentRecorded as unknown !== true) {
      throw new Error("Explicit participant consent is required.");
    }

    const record: RealCallEvidence = {
      ...input,
      callId: anonymize(input.callId),
      participantId: anonymize(input.participantId),
      humanVerifiedTranscript: input.humanVerifiedTranscript
        ? redactSensitiveText(input.humanVerifiedTranscript)
        : undefined,
      providerTranscript: input.providerTranscript
        ? redactSensitiveText(input.providerTranscript)
        : undefined,
      entities: input.entities
        ? {
            amount: input.entities.amount,
            recipientReference: input.entities.recipientReference
              ? redactSensitiveText(input.entities.recipientReference)
              : undefined,
          }
        : undefined,
    };

    this.persist(record);
    this.records.push(record);
    return record;
  }

  public getRecords(): RealCallEvidence[] {
    return this.records.map((record) => ({ ...record }));
  }

  public deleteParticipant(participantId: string): number {
    if (!this.isEnabled()) {
      throw new Error("Call evidence collection is disabled until an approved persistent storage path is configured.");
    }
    const anonymizedParticipantId = anonymize(participantId);
    const removed = this.records.filter((record) => record.participantId === anonymizedParticipantId).length;
    this.records = this.records.filter((record) => record.participantId !== anonymizedParticipantId);

    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const remainingLines = this.records
      .map((record) => JSON.stringify(record))
      .join("\n");
    fs.writeFileSync(this.filePath, remainingLines ? `${remainingLines}\n` : "", "utf8");
    return removed;
  }

  public clearForTesting(): void {
    this.records = [];
    try {
      if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
    } catch {}
  }

  public getReport(): RealCallPilotReport {
    const participants = new Set(this.records.map((record) => record.participantId)).size;
    const attempted = this.records.length;
    const completed = this.records.filter((record) => record.conversationCompleted).length;

    const languageMetrics = (language: PilotLanguage) => {
      const records = this.records.filter((record) => record.language === language);
      if (records.length === 0) {
        return { calls: 0, completed: 0, wer: null, cer: null, intentAccuracy: null };
      }

      const staged = records.filter((record) =>
        record.humanVerifiedTranscript &&
        record.providerTranscript &&
        record.expectedIntent &&
        record.identifiedIntent
      );
      if (staged.length === 0) {
        return {
          calls: records.length,
          completed: records.filter((record) => record.conversationCompleted).length,
          wer: null,
          cer: null,
          intentAccuracy: null,
        };
      }

      const samples: LevenshteinSample[] = staged.map((record, index) => ({
        id: `${language}-${index}`,
        language,
        humanTranscript: record.humanVerifiedTranscript || "",
        asrTranscript: record.providerTranscript || "",
        expectedIntent: record.expectedIntent || "UNKNOWN",
        actualIntent: record.identifiedIntent || "UNKNOWN",
        noise: "telephone",
      }));
      const metrics = evaluateVoiceSamples(samples);
      return {
        calls: records.length,
        completed: records.filter((record) => record.conversationCompleted).length,
        wer: metrics.wer,
        cer: metrics.cer,
        intentAccuracy: metrics.intentAccuracy,
      };
    };

    const recoveryCandidates = this.records.filter((record) => record.recoveryUsed !== "none");
    const recoverySuccesses = recoveryCandidates.filter((record) => record.conversationCompleted).length;

    return {
      consentingParticipants: participants,
      attemptedCalls: attempted,
      completedCalls: completed,
      english: languageMetrics("en"),
      twi: languageMetrics("twi"),
      emptyTranscriptionRate: attempted > 0
        ? Number((this.records.filter((record) => record.emptyTranscription).length / attempted).toFixed(4))
        : null,
      recoverySuccessRate: recoveryCandidates.length > 0
        ? Number((recoverySuccesses / recoveryCandidates.length).toFixed(4))
        : null,
      unexpectedTerminationRate: attempted > 0
        ? Number((this.records.filter((record) => record.unexpectedCallTermination).length / attempted).toFixed(4))
        : null,
      accessibilityFeedbackCount: this.records.filter((record) => record.accessibility).length,
      evidenceState: attempted > 0 ? "REAL_CALL_EVIDENCE_RECORDED" : "NO_REAL_CALL_EVIDENCE",
      limitations: [
        "Human participants and actual carrier calls are not presumed.",
        "WER/CER remains unavailable unless human and provider transcripts are recorded.",
        "Intent accuracy requires a separate human-verified expected intent.",
        "No real financial action is authorized or represented by this collector.",
      ],
    };
  }
}

export const realCallPilot = new RealCallPilotService();
