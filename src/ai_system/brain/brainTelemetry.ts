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
}

class BrainTelemetryService {
  private startTime: number = Date.now();
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private latencies: number[] = [];
  private fallbackCount: number = 0;
  private modelCounts: Record<string, number> = {};

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
  }
}

export const brainTelemetry = new BrainTelemetryService();
