/**
 * Ɔkwankyerɛfo Pa - Unified Gemini Client Wrapper
 * 
 * Provides:
 * 1. Single GoogleGenAI instance management.
 * 2. Per-request abort controller and timeouts.
 * 3. Exponential backoff retry logic on retriable HTTP errors (429, 5xx, timeout).
 * 4. Circuit breaker pattern to fail fast when quota/service is impaired.
 * 5. Hedged requests for STT and latency-sensitive steps.
 * 6. Structured stage timing metrics (p50, p95, p99).
 */

import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG } from "../ai_system/core/aiConfig";
import { auditLogger } from "./auditLogger";

export interface RequestMetrics {
  stage: string;
  model: string;
  durationMs: number;
  success: boolean;
  retries: number;
  circuitBreakerOpen: boolean;
}

export interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

export class UnifiedGeminiClient {
  private static instance: UnifiedGeminiClient;
  private ai: GoogleGenAI | null = null;
  private circuitBreaker: CircuitBreakerState = {
    failureCount: 0,
    lastFailureTime: 0,
    state: "CLOSED",
  };

  private readonly FAILURE_THRESHOLD = 4;
  private readonly RECOVERY_TIMEOUT_MS = 30 * 1000; // 30s
  private readonly QUOTA_COOLDOWN_MS = 10 * 60 * 1000; // 10m on quota exhaustion
  private isQuotaCooldown = false;
  private latencyHistory: { stage: string; durationMs: number; timestamp: number }[] = [];

  constructor() {
    this.initClient();
  }

  public static getInstance(): UnifiedGeminiClient {
    if (!UnifiedGeminiClient.instance) {
      UnifiedGeminiClient.instance = new UnifiedGeminiClient();
    }
    return UnifiedGeminiClient.instance;
  }

  private initClient(): void {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": AI_CONFIG.userAgentHeader,
          },
        },
      });
    }
  }

  public getRawClient(): GoogleGenAI | null {
    if (!this.ai && process.env.GEMINI_API_KEY) {
      this.initClient();
    }
    return this.ai;
  }

  public isAvailable(): boolean {
    return Boolean(this.getRawClient()) && this.checkCircuitBreaker();
  }

  private checkCircuitBreaker(): boolean {
    const now = Date.now();
    const timeout = this.isQuotaCooldown ? this.QUOTA_COOLDOWN_MS : this.RECOVERY_TIMEOUT_MS;
    if (this.circuitBreaker.state === "OPEN") {
      if (now - this.circuitBreaker.lastFailureTime > timeout) {
        this.circuitBreaker.state = "HALF_OPEN";
        this.isQuotaCooldown = false;
        return true;
      }
      return false;
    }
    return true;
  }

  public recordQuotaExceeded(operationName?: string): void {
    this.circuitBreaker.failureCount = this.FAILURE_THRESHOLD;
    this.circuitBreaker.lastFailureTime = Date.now();
    this.circuitBreaker.state = "OPEN";
    this.isQuotaCooldown = true;
    auditLogger.log("warn", "AI_CIRCUIT_BREAKER", `Gemini API quota exceeded for ${operationName || "operation"}. Fast-failing to local offline engine for 10 minutes.`);
  }

  private recordSuccess(stage: string, durationMs: number): void {
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.state = "CLOSED";
    this.isQuotaCooldown = false;
    this.latencyHistory.push({ stage, durationMs, timestamp: Date.now() });
    if (this.latencyHistory.length > 500) {
      this.latencyHistory.shift();
    }
  }

  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failureCount >= this.FAILURE_THRESHOLD) {
      this.circuitBreaker.state = "OPEN";
      auditLogger.log("warn", "AI_CIRCUIT_BREAKER", "Gemini circuit breaker OPENED due to consecutive failures. Failing fast to DTMF.");
    }
  }

  /**
   * Executes a generation request with strict timeout, retry, and circuit breaker.
   */
  public async executeWithTimeout<T>(
    operationName: string,
    action: (ai: GoogleGenAI, signal: AbortSignal) => Promise<T>,
    timeoutMs: number = 3000,
    maxRetries: number = 1
  ): Promise<T> {
    const ai = this.getRawClient();
    if (!ai) {
      throw new Error(`[GeminiClient] GEMINI_API_KEY not configured. Operation '${operationName}' aborted.`);
    }

    if (!this.checkCircuitBreaker()) {
      throw new Error(`[GeminiClient] Circuit breaker is OPEN. Fast-failing '${operationName}'.`);
    }

    let attempt = 0;
    const startTime = Date.now();

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await action(ai, controller.signal);
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;
        this.recordSuccess(operationName, duration);
        return result;
      } catch (err: any) {
        clearTimeout(timeoutHandle);
        const errMessage = String(err.message || "");
        const isQuota =
          err.status === 429 ||
          errMessage.includes("429") ||
          errMessage.includes("RESOURCE_EXHAUSTED") ||
          errMessage.includes("Quota exceeded") ||
          errMessage.includes("quota");

        if (isQuota) {
          this.recordQuotaExceeded(operationName);
          throw err;
        }

        const isAbort = controller.signal.aborted || err.name === "AbortError";
        const isRetriable =
          isAbort ||
          (err.status >= 500 && err.status < 600) ||
          errMessage.includes("fetch failed") ||
          errMessage.includes("network");

        if (attempt < maxRetries && isRetriable) {
          attempt++;
          const backoffMs = Math.min(200 * Math.pow(2, attempt), 1000);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }

        this.recordFailure();
        throw err;
      }
    }

    throw new Error(`[GeminiClient] Exhausted retries for '${operationName}'.`);
  }

  /**
   * Hedged request runner: Launches primary model call, and if not resolved after hedgeDelayMs,
   * launches secondary model call. Resolves with whichever completes first and aborts the other.
   */
  public async executeHedged<T>(
    operationName: string,
    primaryAction: (ai: GoogleGenAI, signal: AbortSignal) => Promise<T>,
    secondaryAction: (ai: GoogleGenAI, signal: AbortSignal) => Promise<T>,
    overallDeadlineMs: number = 3000,
    hedgeDelayMs: number = 1200
  ): Promise<T> {
    const ai = this.getRawClient();
    if (!ai) {
      throw new Error(`[GeminiClient] GEMINI_API_KEY not configured for hedged call.`);
    }

    const overallController = new AbortController();
    const deadlineHandle = setTimeout(() => {
      overallController.abort(new Error(`Overall deadline of ${overallDeadlineMs}ms exceeded`));
    }, overallDeadlineMs);

    const primaryController = new AbortController();
    const secondaryController = new AbortController();

    const forwardAbort = () => {
      primaryController.abort();
      secondaryController.abort();
    };
    overallController.signal.addEventListener("abort", forwardAbort);

    let winnerFound = false;

    const primaryPromise = (async () => {
      const res = await primaryAction(ai, primaryController.signal);
      if (!winnerFound) {
        winnerFound = true;
        secondaryController.abort();
      }
      return res;
    })();

    const secondaryPromise = (async () => {
      await new Promise((r) => setTimeout(r, hedgeDelayMs));
      if (winnerFound || overallController.signal.aborted) {
        throw new Error("Secondary cancelled: Primary completed first.");
      }
      const res = await secondaryAction(ai, secondaryController.signal);
      if (!winnerFound) {
        winnerFound = true;
        primaryController.abort();
      }
      return res;
    })();

    try {
      const result = await Promise.race([primaryPromise, secondaryPromise]);
      clearTimeout(deadlineHandle);
      return result;
    } catch (err: any) {
      clearTimeout(deadlineHandle);
      throw err;
    } finally {
      clearTimeout(deadlineHandle);
    }
  }

  public getLatencyMetrics(): { p50: number; p95: number; p99: number; count: number } {
    if (this.latencyHistory.length === 0) {
      return { p50: 0, p95: 0, p99: 0, count: 0 };
    }
    const sorted = [...this.latencyHistory].map((h) => h.durationMs).sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    return { p50, p95, p99, count: sorted.length };
  }
}

export const geminiClient = UnifiedGeminiClient.getInstance();
