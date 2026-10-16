/**
 * Ɔkwankyerɛfo Pa - Central Brain Telemetry & Token Efficiency Monitor
 *
 * Tracks Tier 1 (Deterministic, Zero-Token) vs Tier 2 (Gemini Model) routing,
 * latency, token consumption, and estimated quota savings in real time.
 */

export interface BrainTurnTelemetry {
  id: string;
  timestamp: number;
  tier: 'TIER_1_DETERMINISTIC' | 'TIER_2_MODEL';
  tokensUsed: number;
  latencyMs: number;
  utterance: string;
  decisionKind: string;
  intent?: string;
  decisionSource: string;
}

export interface BrainTelemetrySummary {
  totalTurns: number;
  tier1Turns: number;
  tier2Turns: number;
  tier1Percentage: number;
  totalTokensUsed: number;
  estimatedTokensSaved: number;
  avgTier1LatencyMs: number;
  avgTier2LatencyMs: number;
  overallAvgLatencyMs: number;
  history: BrainTurnTelemetry[];
}

class BrainTelemetryService {
  private history: BrainTurnTelemetry[] = [];
  private static readonly MAX_HISTORY = 50;

  private totalTier1Latency = 0;
  private totalTier2Latency = 0;
  private tier1Count = 0;
  private tier2Count = 0;
  private totalTokens = 0;

  public recordTurn(entry: Omit<BrainTurnTelemetry, 'id' | 'timestamp'>): BrainTurnTelemetry {
    const item: BrainTurnTelemetry = {
      id: `turn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      ...entry,
    };

    if (entry.tier === 'TIER_1_DETERMINISTIC') {
      this.tier1Count++;
      this.totalTier1Latency += entry.latencyMs;
    } else {
      this.tier2Count++;
      this.totalTier2Latency += entry.latencyMs;
      this.totalTokens += entry.tokensUsed;
    }

    this.history.unshift(item);
    if (this.history.length > BrainTelemetryService.MAX_HISTORY) {
      this.history.pop();
    }

    return item;
  }

  public getSummary(): BrainTelemetrySummary {
    const totalTurns = this.tier1Count + this.tier2Count;
    const tier1Percentage = totalTurns > 0 ? Math.round((this.tier1Count / totalTurns) * 100) : 100;
    // An average multi-turn Gemini call with system instructions consumes ~450 tokens.
    // Every Tier 1 turn saves ~450 tokens from quota.
    const estimatedTokensSaved = this.tier1Count * 450;

    return {
      totalTurns,
      tier1Turns: this.tier1Count,
      tier2Turns: this.tier2Count,
      tier1Percentage,
      totalTokensUsed: this.totalTokens,
      estimatedTokensSaved,
      avgTier1LatencyMs: this.tier1Count > 0 ? Math.round(this.totalTier1Latency / this.tier1Count) : 8,
      avgTier2LatencyMs: this.tier2Count > 0 ? Math.round(this.totalTier2Latency / this.tier2Count) : 0,
      overallAvgLatencyMs:
        totalTurns > 0
          ? Math.round((this.totalTier1Latency + this.totalTier2Latency) / totalTurns)
          : 8,
      history: [...this.history],
    };
  }

  public reset(): void {
    this.history = [];
    this.totalTier1Latency = 0;
    this.totalTier2Latency = 0;
    this.tier1Count = 0;
    this.tier2Count = 0;
    this.totalTokens = 0;
  }
}

export const brainTelemetry = new BrainTelemetryService();
