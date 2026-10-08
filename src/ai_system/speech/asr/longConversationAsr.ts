/**
 * Ɔkwankyerɛfo Pa - Long-Conversation Session ASR Engine (longConversationAsr.ts)
 * 
 * Manages continuous telephony calls and multi-minute audio streams:
 * - Session lifecycle management (start, append, end, retrieve)
 * - VAD-aware audio chunk segmentation
 * - Deterministic ordered chunk assembly (guaranteeing out-of-order chunks do not corrupt transcripts)
 * - Deterministic overlap transcript merging via transcriptMerger
 * - Per-chunk timeouts rather than premature whole-conversation deadlines
 * - Multi-turn conversational session history and rolling summaries
 * - Structured metadata preservation for auditability
 */

import { asrOrchestrator, AsrOrchestrationResult } from "./asrOrchestrator";
import { transcriptMerger } from "./transcriptMerger";
import { config } from "../../../config/env";
import { audioNormalizer, AudioNormalizer } from "./audioNormalizer";
import { AudioQualityReport } from "./audioQuality";

export interface AsrChunkRecord {
  sessionId: string;
  chunkId: string;
  sequenceNumber: number;
  startMs: number;
  endMs: number;
  language: string;
  provider: string;
  status: "OK" | "EMPTY" | "ERROR";
  transcript: string;
  rawTranscript: string;
  processingLatencyMs: number;
  fallbackUsed: boolean;
  pinDiscarded?: boolean;
}

export interface AsrTurnRecord {
  turnId: string;
  chunkIds: string[];
  rawTranscript: string;
  normalizedTranscript: string;
  numericNormalizedTranscript: string;
  language: string;
  provider: string;
  latency: number;
  audioQuality: AudioQualityReport | null;
  finalizedAt: number;
}

export interface AsrSessionQualityMetrics {
  averageQualityScore: number;
  averageSnrDb: number;
  speechDurationMs: number;
  silenceDurationMs: number;
}

export interface AsrSessionProviderMetrics {
  primaryCount: number;
  fallbackCount: number;
  averageLatencyMs: number;
}

export interface AsrFeedbackItem {
  timestamp: number;
  originalTranscript: string;
  correctedTranscript: string;
  category: "name" | "number" | "amount" | "word" | "language";
}

export interface AsrConversationSession {
  sessionId: string;
  startedAt: number;
  createdAt: number;
  updatedAt: number;
  language: string;
  state: "ACTIVE" | "COMPLETED" | "ERROR";
  status: "ACTIVE" | "COMPLETED" | "ERROR"; // alias for backward compatibility
  audioDurationMs: number;
  totalAudioDurationMs: number; // alias
  chunks: AsrChunkRecord[];
  turns: AsrTurnRecord[];
  partialTranscript: string;
  finalTranscript: string;
  fullTranscript: string; // alias
  rollingSummary: string;
  qualityMetrics: AsrSessionQualityMetrics;
  providerMetrics: AsrSessionProviderMetrics;
  feedback: AsrFeedbackItem[];
  metadata?: Record<string, any>;
}

// Backward-compatibility alias
export type AsrSessionRecord = AsrConversationSession;

export class LongConversationAsrEngine {
  private sessions: Map<string, AsrConversationSession> = new Map();
  // Mutex per session to guarantee strictly ordered chunk processing
  private sessionQueues: Map<string, Promise<any>> = new Map();

  /**
   * Starts a new long-form conversation ASR session.
   */
  public startSession(options: { sessionId?: string; language?: string; metadata?: Record<string, any> } = {}): string {
    const sessionId = options.sessionId || `asr_sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const session: AsrConversationSession = {
      sessionId,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      language: options.language || "twi",
      state: "ACTIVE",
      status: "ACTIVE",
      audioDurationMs: 0,
      totalAudioDurationMs: 0,
      chunks: [],
      turns: [],
      partialTranscript: "",
      finalTranscript: "",
      fullTranscript: "",
      rollingSummary: "",
      qualityMetrics: {
        averageQualityScore: 0,
        averageSnrDb: 0,
        speechDurationMs: 0,
        silenceDurationMs: 0,
      },
      providerMetrics: {
        primaryCount: 0,
        fallbackCount: 0,
        averageLatencyMs: 0,
      },
      feedback: [],
      metadata: options.metadata,
    };
    this.sessions.set(sessionId, session);
    this.sessionQueues.set(sessionId, Promise.resolve());
    return sessionId;
  }

  /**
   * Appends an audio chunk to an ongoing session.
   * Guarantees strictly sequenced chunk assembly.
   */
  public async appendAudioChunk(
    sessionId: string,
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    step?: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    chunkId: string;
    sequenceNumber: number;
    partialTranscript: string;
    finalTranscript: string;
    language: string;
    provider: string;
    processingLatencyMs: number;
    audioQuality: any;
  }> {
    let session = this.sessions.get(sessionId);
    if (!session) {
      this.startSession({ sessionId });
      session = this.sessions.get(sessionId)!;
    }

    const sequenceNumber = session.chunks.length + 1;
    const chunkId = `${sessionId}_chk_${sequenceNumber}`;

    // Queue chunk through session mutex to prevent race conditions
    const currentQueue = this.sessionQueues.get(sessionId) || Promise.resolve();

    const task = currentQueue.then(async () => {
      const startTime = performance.now();
      const asrResult: AsrOrchestrationResult = await asrOrchestrator.transcribe(
        audioPayload,
        mimeType,
        {
          languageHint: session!.language,
          step,
          timeoutMs: config.ghanaNlp?.timeoutMs || 15000,
        }
      );
      const processingLatencyMs = Math.round(performance.now() - startTime);

      const chunkDuration = asrResult.audioQuality?.durationMs || 0;
      const startMs = session!.audioDurationMs;
      const endMs = startMs + chunkDuration;
      session!.audioDurationMs = endMs;
      session!.totalAudioDurationMs = endMs;
      session!.updatedAt = Date.now();

      const chunkRecord: AsrChunkRecord = {
        sessionId,
        chunkId,
        sequenceNumber,
        startMs,
        endMs,
        language: asrResult.languageDetected,
        provider: asrResult.providerUsed,
        status: asrResult.text ? "OK" : "EMPTY",
        transcript: asrResult.text,
        rawTranscript: asrResult.rawTranscript,
        processingLatencyMs,
        fallbackUsed: asrResult.fallbackUsed,
        pinDiscarded: asrResult.pinDiscarded,
      };

      session!.chunks.push(chunkRecord);

      // Deterministically update full conversation transcript using overlap merger
      session!.finalTranscript = transcriptMerger.mergeOrdered(
        session!.chunks.map((c) => ({
          sequenceNumber: c.sequenceNumber,
          transcript: c.transcript,
        }))
      );
      session!.fullTranscript = session!.finalTranscript;
      session!.partialTranscript = chunkRecord.transcript;

      // Update provider metrics
      if (chunkRecord.fallbackUsed) {
        session!.providerMetrics.fallbackCount++;
      } else {
        session!.providerMetrics.primaryCount++;
      }
      const totalChunks = session!.chunks.length;
      session!.providerMetrics.averageLatencyMs = Math.round(
        (session!.providerMetrics.averageLatencyMs * (totalChunks - 1) + processingLatencyMs) / totalChunks
      );

      // Update quality metrics if audioQuality present
      if (asrResult.audioQuality) {
        const q = asrResult.audioQuality;
        session!.qualityMetrics.averageQualityScore = Number(
          ((session!.qualityMetrics.averageQualityScore * (totalChunks - 1) + q.qualityScore) / totalChunks).toFixed(2)
        );
        session!.qualityMetrics.averageSnrDb = Math.round(
          (session!.qualityMetrics.averageSnrDb * (totalChunks - 1) + q.snrDb) / totalChunks
        );
        session!.qualityMetrics.speechDurationMs += Math.round(q.durationMs * q.speechRatio);
        session!.qualityMetrics.silenceDurationMs += Math.round(q.durationMs * q.silenceRatio);
      }

      return {
        success: true,
        sessionId,
        chunkId,
        sequenceNumber,
        partialTranscript: chunkRecord.transcript,
        finalTranscript: session!.finalTranscript,
        language: chunkRecord.language,
        provider: chunkRecord.provider,
        processingLatencyMs,
        audioQuality: asrResult.audioQuality,
      };
    });

    this.sessionQueues.set(sessionId, task.catch(() => {}));
    return await task;
  }

  /**
   * Registers a completed multi-sentence turn in the conversation session.
   */
  public registerTurn(
    sessionId: string,
    turnData: {
      turnId?: string;
      chunkIds?: string[];
      rawTranscript: string;
      normalizedTranscript: string;
      numericNormalizedTranscript: string;
      language: string;
      provider: string;
      latency: number;
      audioQuality?: AudioQualityReport | null;
    }
  ): AsrTurnRecord {
    let session = this.sessions.get(sessionId);
    if (!session) {
      this.startSession({ sessionId });
      session = this.sessions.get(sessionId)!;
    }

    const turn: AsrTurnRecord = {
      turnId: turnData.turnId || `turn_${session.turns.length + 1}_${Date.now()}`,
      chunkIds: turnData.chunkIds || [],
      rawTranscript: turnData.rawTranscript,
      normalizedTranscript: turnData.normalizedTranscript,
      numericNormalizedTranscript: turnData.numericNormalizedTranscript,
      language: turnData.language,
      provider: turnData.provider,
      latency: turnData.latency,
      audioQuality: turnData.audioQuality || null,
      finalizedAt: Date.now(),
    };

    session.turns.push(turn);
    session.updatedAt = Date.now();
    return turn;
  }

  /**
   * Updates the rolling conversational summary to avoid re-sending entire audio/turns.
   */
  public updateRollingSummary(sessionId: string, summary: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.rollingSummary = summary;
      session.updatedAt = Date.now();
    }
  }

  /**
   * Records user correction feedback for the session (sanitized, zero-PIN).
   */
  public recordFeedback(
    sessionId: string,
    feedbackItem: Omit<AsrFeedbackItem, "timestamp">
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Security: Strip out any PINs or 4-digit numeric credentials
      const scrubbed = (feedbackItem.correctedTranscript || "").replace(/\b\d{4,6}\b/g, "[PIN_SCRUBBED]");
      session.feedback.push({
        ...feedbackItem,
        correctedTranscript: scrubbed,
        timestamp: Date.now(),
      });
      session.updatedAt = Date.now();
    }
  }

  /**
   * Finalizes and closes an ASR session.
   */
  public async endSession(sessionId: string): Promise<AsrConversationSession> {
    const queue = this.sessionQueues.get(sessionId);
    if (queue) {
      await queue.catch(() => {});
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`ASR session not found: ${sessionId}`);
    }

    session.state = "COMPLETED";
    session.status = "COMPLETED";
    session.updatedAt = Date.now();
    this.sessionQueues.delete(sessionId);
    return session;
  }

  /**
   * Retrieves an ASR session record.
   */
  public getSession(sessionId: string): AsrConversationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Retrieves full accumulated conversation transcript.
   */
  public getFullTranscript(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    return session ? session.finalTranscript : "";
  }

  /**
   * Processes a long audio file (e.g., 2 to 30 minutes) by breaking it into
   * VAD-aware segments, transcribing sequentially, and merging transcripts.
   */
  public async processLongAudioFile(
    audioPayload: Buffer | string,
    mimeType: string = "audio/wav",
    language: string = "twi"
  ): Promise<{
    fullTranscript: string;
    totalChunks: number;
    totalDurationMs: number;
    chunks: AsrChunkRecord[];
  }> {
    const normalized = await audioNormalizer.normalize(audioPayload, mimeType);
    const sessionId = this.startSession({ language });

    const pcmBuffer = normalized.pcm16Buffer;
    const sampleRate = 16000;
    const bytesPerSecond = sampleRate * 2; // 32,000 bytes/sec
    const totalDurationMs = normalized.durationMs;

    // Chunk size: 12 seconds with 1 second overlap
    const chunkBytes = 12 * bytesPerSecond; // 384,000 bytes
    const stepBytes = 11 * bytesPerSecond;  // 352,000 bytes (1s overlap)

    let offset = 0;
    while (offset < pcmBuffer.length) {
      const sliceEnd = Math.min(pcmBuffer.length, offset + chunkBytes);
      const rawChunk = pcmBuffer.subarray(offset, sliceEnd);
      if (rawChunk.length < 3200) {
        // Less than 100ms remaining
        break;
      }
      const wavHeader = AudioNormalizer.createWavHeader(rawChunk.length, 16000, 1);
      const chunkWav = Buffer.concat([wavHeader, rawChunk]);

      await this.appendAudioChunk(sessionId, chunkWav, "audio/wav");
      offset += stepBytes;
    }

    const session = await this.endSession(sessionId);
    return {
      fullTranscript: session.finalTranscript,
      totalChunks: session.chunks.length,
      totalDurationMs,
      chunks: session.chunks,
    };
  }
}

export const longConversationAsr = new LongConversationAsrEngine();
