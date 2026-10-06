/**
 * Ɔkwankyerɛfo Pa - Pilot Operational Metrics Collector (pilotMetrics.ts)
 * 
 * Strict Zero-PII Aggregator:
 * - Computes turn latencies (p50, p95, p99).
 * - Tracks model timeout rates and fallback rates.
 * - Tracks clarification loops per call and DTMF fallback rates.
 * - Tracks call abandonment before safe confirmation.
 * - Tracks payment outcome counts.
 * 
 * Invariant: Never stores phone numbers, PINs, or raw transcripts.
 */

export interface LatencyDistribution {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  count: number;
}

export interface PaymentOutcomeCounts {
  SUCCESSFUL: number;
  FAILED: number;
  CANCELLED: number;
  ABANDONED_BEFORE_CONFIRMATION: number;
  PENDING: number;
  EXPIRED_TIMEOUT: number;
}

export interface PilotMetricsSummary {
  periodStart: string;
  totalCalls: number;
  totalTurns: number;
  turnLatency: LatencyDistribution;
  model: {
    totalCalls: number;
    success: number;
    timeouts: number;
    errors: number;
    timeoutRate: number;
  };
  fallbacks: {
    total: number;
    fallbackRate: number; // fallbacks / totalTurns
    dtmfFallbacks: number;
    dtmfFallbackRate: number; // dtmfFallbacks / totalCalls
  };
  clarifications: {
    totalLoops: number;
    avgLoopsPerCall: number;
    maxLoopsInCall: number;
    callsExceedingThreshold: number;
  };
  abandonment: {
    abandonedBeforeConfirmation: number;
    abandonmentRate: number;
  };
  paymentOutcomes: PaymentOutcomeCounts;
}

export class PilotMetricsCollector {
  private static instance: PilotMetricsCollector;
  private periodStart: number = Date.now();

  private totalCalls: number = 0;
  private totalTurns: number = 0;
  private turnLatencies: number[] = [];

  private modelCalls: number = 0;
  private modelSuccesses: number = 0;
  private modelTimeouts: number = 0;
  private modelErrors: number = 0;

  private offlineFallbacks: number = 0;
  private dtmfFallbacks: number = 0;

  private callClarifications = new Map<string, number>(); // callHash -> count
  private maxClarificationLoops: number = 0;
  private totalClarificationLoops: number = 0;

  private abandonedBeforeConfirmation: number = 0;

  private paymentOutcomes: PaymentOutcomeCounts = {
    SUCCESSFUL: 0,
    FAILED: 0,
    CANCELLED: 0,
    ABANDONED_BEFORE_CONFIRMATION: 0,
    PENDING: 0,
    EXPIRED_TIMEOUT: 0,
  };

  private readonly MAX_LATENCY_SAMPLES = 5000;

  public static getInstance(): PilotMetricsCollector {
    if (!PilotMetricsCollector.instance) {
      PilotMetricsCollector.instance = new PilotMetricsCollector();
    }
    return PilotMetricsCollector.instance;
  }

  // ── Recording Helpers ──────────────────────────────────────────────────────

  public recordCallStart(_anonymizedCallId: string): void {
    this.totalCalls++;
  }

  public recordTurnLatency(durationMs: number): void {
    this.totalTurns++;
    this.turnLatencies.push(Math.max(0, durationMs));
    if (this.turnLatencies.length > this.MAX_LATENCY_SAMPLES) {
      this.turnLatencies.shift();
    }
  }

  public recordModelCall(status: 'SUCCESS' | 'TIMEOUT' | 'ERROR', _durationMs?: number): void {
    this.modelCalls++;
    if (status === 'SUCCESS') {
      this.modelSuccesses++;
    } else if (status === 'TIMEOUT') {
      this.modelTimeouts++;
    } else {
      this.modelErrors++;
    }
  }

  public recordFallbackToOffline(): void {
    this.offlineFallbacks++;
  }

  public recordDtmfFallback(): void {
    this.dtmfFallbacks++;
  }

  public recordClarificationLoop(anonymizedCallId: string): number {
    this.totalClarificationLoops++;
    const current = (this.callClarifications.get(anonymizedCallId) || 0) + 1;
    this.callClarifications.set(anonymizedCallId, current);
    if (current > this.maxClarificationLoops) {
      this.maxClarificationLoops = current;
    }
    return current;
  }

  public recordAbandonmentBeforeConfirmation(): void {
    this.abandonedBeforeConfirmation++;
    this.paymentOutcomes.ABANDONED_BEFORE_CONFIRMATION++;
  }

  public recordPaymentOutcome(status: keyof PaymentOutcomeCounts): void {
    if (this.paymentOutcomes[status] !== undefined) {
      this.paymentOutcomes[status]++;
    }
  }

  // ── Metrics Computation ───────────────────────────────────────────────────

  private computeLatencyDistribution(): LatencyDistribution {
    if (this.turnLatencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0, count: 0 };
    }

    const sorted = [...this.turnLatencies].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    const p50 = sorted[Math.floor(count * 0.5)] || 0;
    const p95 = sorted[Math.floor(count * 0.95)] || 0;
    const p99 = sorted[Math.floor(count * 0.99)] || 0;
    const min = sorted[0];
    const max = sorted[count - 1];
    const avg = Math.round(sum / count);

    return { p50, p95, p99, avg, min, max, count };
  }

  public getMetricsReport(): PilotMetricsSummary {
    const latencies = this.computeLatencyDistribution();
    const calls = Math.max(1, this.totalCalls);
    const turns = Math.max(1, this.totalTurns);
    const mCalls = Math.max(1, this.modelCalls);

    const callsExceeding = Array.from(this.callClarifications.values()).filter((cnt) => cnt >= 3).length;

    return {
      periodStart: new Date(this.periodStart).toISOString(),
      totalCalls: this.totalCalls,
      totalTurns: this.totalTurns,
      turnLatency: latencies,
      model: {
        totalCalls: this.modelCalls,
        success: this.modelSuccesses,
        timeouts: this.modelTimeouts,
        errors: this.modelErrors,
        timeoutRate: parseFloat(((this.modelTimeouts / mCalls) * 100).toFixed(2)),
      },
      fallbacks: {
        total: this.offlineFallbacks,
        fallbackRate: parseFloat(((this.offlineFallbacks / turns) * 100).toFixed(2)),
        dtmfFallbacks: this.dtmfFallbacks,
        dtmfFallbackRate: parseFloat(((this.dtmfFallbacks / calls) * 100).toFixed(2)),
      },
      clarifications: {
        totalLoops: this.totalClarificationLoops,
        avgLoopsPerCall: parseFloat((this.totalClarificationLoops / calls).toFixed(2)),
        maxLoopsInCall: this.maxClarificationLoops,
        callsExceedingThreshold: callsExceeding,
      },
      abandonment: {
        abandonedBeforeConfirmation: this.abandonedBeforeConfirmation,
        abandonmentRate: parseFloat(((this.abandonedBeforeConfirmation / calls) * 100).toFixed(2)),
      },
      paymentOutcomes: { ...this.paymentOutcomes },
    };
  }

  public resetMetrics(): void {
    this.periodStart = Date.now();
    this.totalCalls = 0;
    this.totalTurns = 0;
    this.turnLatencies = [];
    this.modelCalls = 0;
    this.modelSuccesses = 0;
    this.modelTimeouts = 0;
    this.modelErrors = 0;
    this.offlineFallbacks = 0;
    this.dtmfFallbacks = 0;
    this.callClarifications.clear();
    this.maxClarificationLoops = 0;
    this.totalClarificationLoops = 0;
    this.abandonedBeforeConfirmation = 0;
    this.paymentOutcomes = {
      SUCCESSFUL: 0,
      FAILED: 0,
      CANCELLED: 0,
      ABANDONED_BEFORE_CONFIRMATION: 0,
      PENDING: 0,
      EXPIRED_TIMEOUT: 0,
    };
  }
}

export const pilotMetrics = PilotMetricsCollector.getInstance();
