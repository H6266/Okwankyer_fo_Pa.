/**
 * Ɔkwankyerɛfo Pa - OpenAI Unified Client Wrapper (openaiClient.ts)
 * 
 * Provides:
 * 1. Single OpenAI client instance management.
 * 2. Per-request abort controller and strict latency timeouts.
 * 3. Exponential backoff and graceful circuit-breaker failover when quota is exhausted (HTTP 429 / insufficient_quota).
 * 4. Resilient fallbacks so that Ɔkwankyerɛfo Pa never hangs or crashes when external AI services are degraded.
 */

import OpenAI from "openai";
import { auditLogger } from "../auditLogger";

export interface OpenAiMetrics {
  stage: string;
  model: string;
  durationMs: number;
  success: boolean;
  circuitBreakerOpen: boolean;
  error?: string;
}

export interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  cooldownUntil: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

export class OpenAIClientManager {
  private static instance: OpenAIClientManager;
  private client: OpenAI | null = null;
  private circuitBreaker: CircuitBreakerState = {
    failureCount: 0,
    lastFailureTime: 0,
    cooldownUntil: 0,
    state: "CLOSED",
  };

  private readonly FAILURE_THRESHOLD = 3;
  private readonly DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes on quota exhaustion

  constructor() {
    this.initClient();
  }

  public static getInstance(): OpenAIClientManager {
    if (!OpenAIClientManager.instance) {
      OpenAIClientManager.instance = new OpenAIClientManager();
    }
    return OpenAIClientManager.instance;
  }

  public getApiKey(): string | undefined {
    // Unit tests must never make live API calls using synthetic credentials.
    if (process.env.NODE_ENV === "test" || process.env.VITEST) return undefined;
    const configuredKey = process.env.OPENAI_API_KEY?.trim();
    return configuredKey || undefined;
  }

  private initClient(): void {
    const apiKey = this.getApiKey();
    if (apiKey && apiKey.trim() !== "") {
      try {
        this.client = new OpenAI({
          apiKey: apiKey.trim(),
          maxRetries: 1,
          timeout: 10000,
        });
      } catch (err: any) {
        console.warn("[OpenAIClient] Failed to initialize OpenAI client:", err.message);
        this.client = null;
      }
    }
  }

  public getRawClient(): OpenAI | null {
    if (!this.client && this.getApiKey()) {
      this.initClient();
    }
    return this.client;
  }

  public isAvailable(): boolean {
    if (!this.getApiKey()) return false;
    const now = Date.now();
    if (this.circuitBreaker.cooldownUntil > now) {
      return false;
    }
    if (this.circuitBreaker.state === "OPEN") {
      if (now - this.circuitBreaker.lastFailureTime > 30000) {
        this.circuitBreaker.state = "HALF_OPEN";
        return true;
      }
      return false;
    }
    return true;
  }

  public recordQuotaExhausted(cooldownMs: number = this.DEFAULT_COOLDOWN_MS): void {
    this.circuitBreaker.state = "OPEN";
    this.circuitBreaker.cooldownUntil = Date.now() + cooldownMs;
    this.circuitBreaker.lastFailureTime = Date.now();
    auditLogger.log(
      "warn",
      "OPENAI",
      `OpenAI quota exhausted or credit balance exhausted. Circuit breaker open for ${Math.round(cooldownMs / 1000)}s`
    );
  }

  public recordFailure(err?: any): void {
    const msg = String(err?.message || err || "").toLowerCase();
    const isQuota =
      msg.includes("insufficient_quota") ||
      msg.includes("quota exceeded") ||
      msg.includes("credit_balance_exhausted") ||
      msg.includes("429");

    if (isQuota) {
      this.recordQuotaExhausted();
      return;
    }

    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failureCount >= this.FAILURE_THRESHOLD) {
      this.circuitBreaker.state = "OPEN";
      auditLogger.log(
        "warn",
        "OPENAI",
        `OpenAI failure threshold reached (${this.circuitBreaker.failureCount}). Circuit breaker OPEN.`
      );
    }
  }

  public recordSuccess(): void {
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.state = "CLOSED";
    this.circuitBreaker.cooldownUntil = 0;
  }

  public async executeWithTimeout<T>(
    stage: string,
    operation: (client: OpenAI, signal: AbortSignal) => Promise<T>,
    timeoutMs: number = 4000
  ): Promise<T> {
    if (!this.isAvailable()) {
      throw new Error(`OPENAI_UNAVAILABLE: Circuit breaker is open or API key is missing.`);
    }

    const client = this.getRawClient();
    if (!client) {
      throw new Error(`OPENAI_CLIENT_MISSING: OpenAI client could not be initialized.`);
    }

    const abortController = new AbortController();
    const timer = setTimeout(() => {
      abortController.abort(new Error(`TIMEOUT: OpenAI stage ${stage} exceeded ${timeoutMs}ms limit.`));
    }, timeoutMs);

    const start = performance.now();
    try {
      const result = await operation(client, abortController.signal);
      clearTimeout(timer);
      this.recordSuccess();
      return result;
    } catch (err: any) {
      clearTimeout(timer);
      const elapsed = Math.round(performance.now() - start);
      this.recordFailure(err);
      auditLogger.log(
        "warn",
        "OPENAI",
        `OpenAI stage ${stage} failed after ${elapsed}ms: ${err?.message || err}`
      );
      throw err;
    }
  }
}

export const openaiClient = OpenAIClientManager.getInstance();
