/**
 * Ɔkwankyerɛfo Pa - Brain Telemetry & Metrics Tracker
 */

export interface BrainTelemetrySummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  fallbackCount: number;
  modelCounts: Record<string, number>;
  uptimeSeconds: number;
  tier1Turns: number;
  tier2Turns: number;
  totalTokensUsed: number;
  estimatedTokensSaved: number;
}

export interface BrainTurnRecord {
  tier: 'TIER_1_DETERMINISTIC' | 'TIER_2_MODEL';
  tokensUsed: number;
  latencyMs: number;
  utterance?: string;
  decisionKind?: string;
  intent?: string;
  decisionSource?: string;
}

class BrainTelemetryService {
  private startTime: number = Date.now();
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private latencies: number[] = [];
  private fallbackCount: number = 0;
  private modelCounts: Record<string, number> = {};
  private tier1Turns: number = 0;
  private tier2Turns: number = 0;
  private totalTokensUsed: number = 0;
  private estimatedTokensSaved: number = 0;

  recordTurn(record: BrainTurnRecord): void {
    this.totalRequests++;
    this.successfulRequests++;
    this.latencies.push(record.latencyMs);
    if (this.latencies.length > 200) {
      this.latencies.shift();
    }
    if (record.tier === 'TIER_1_DETERMINISTIC') {
      this.tier1Turns++;
      this.estimatedTokensSaved += 320;
    } else {
      this.tier2Turns++;
      this.totalTokensUsed += record.tokensUsed || 320;
    }
  }

  recordRequest(model: string, latencyMs: number, success: boolean, usedFallback: boolean = false): void {
    this.totalRequests++;
    if (success) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }
    this.latencies.push(latencyMs);
    if (this.latencies.length > 200) {
      this.latencies.shift();
    }
    if (usedFallback) {
      this.fallbackCount++;
    }
    this.modelCounts[model] = (this.modelCounts[model] || 0) + 1;
  }

  getSummary(): BrainTelemetrySummary {
    const avgLatency =
      this.latencies.length > 0
        ? Math.round(this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length)
        : 0;

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      avgLatencyMs: avgLatency,
      fallbackCount: this.fallbackCount,
      modelCounts: { ...this.modelCounts },
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      tier1Turns: this.tier1Turns,
      tier2Turns: this.tier2Turns,
      totalTokensUsed: this.totalTokensUsed,
      estimatedTokensSaved: this.estimatedTokensSaved,
    };
  }

  reset(): void {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.latencies = [];
    this.fallbackCount = 0;
    this.modelCounts = {};
    this.tier1Turns = 0;
    this.tier2Turns = 0;
    this.totalTokensUsed = 0;
    this.estimatedTokensSaved = 0;
  }
}

export const brainTelemetry = new BrainTelemetryService();
