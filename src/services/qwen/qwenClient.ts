/**
 * Ɔkwankyerɛfo Pa - Qwen AI Unified Client Wrapper (qwenClient.ts)
 * 
 * Provides:
 * 1. Single Qwen (DashScope / OpenAI-compatible) client instance management.
 * 2. Per-request abort controller and strict latency timeouts.
 * 3. Exponential backoff and circuit-breaker failover when quota is exhausted (HTTP 429).
 * 4. Resilient handoff in the Gemini -> OpenAI -> Qwen AI -> Local Brain cascade.
 */

import OpenAI from "openai";
import { auditLogger } from "../auditLogger";

function isPlaceholderKey(value?: string): boolean {
  const normalized = (value || "").trim();
  if (!normalized) return true;

  const lower = normalized.toLowerCase();
  return (
    lower.includes("mock-") ||
    lower.includes("mock_") ||
    lower.includes("placeholder") ||
    lower.includes("example") ||
    lower.includes("not set") ||
    lower.includes("changeme") ||
    lower.includes("your-key")
  );
}

export interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  cooldownUntil: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

export class QwenClientManager {
  private static instance: QwenClientManager;
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

  public isLocalMode(): boolean {
    if (process.env.QWEN_MODE?.trim().toLowerCase() === "local") {
      return true;
    }
    return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(this.getBaseUrl());
  }

  public static getInstance(): QwenClientManager {
    if (!QwenClientManager.instance) {
      QwenClientManager.instance = new QwenClientManager();
    }
    return QwenClientManager.instance;
  }

  public getApiKey(): string | undefined {
    const raw = (process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.GROQ_API_KEY || "").trim();
    if (isPlaceholderKey(raw)) {
      return this.isLocalMode() ? "ollama" : undefined;
    }
    return raw || undefined;
  }

  public getBaseUrl(): string {
    if (process.env.QWEN_BASE_URL) return process.env.QWEN_BASE_URL;
    if (process.env.QWEN_MODE?.trim().toLowerCase() === "local") return "http://127.0.0.1:11434/v1";
    if (process.env.GROQ_API_KEY && !process.env.QWEN_API_KEY) return process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
    return "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  }

  public getModel(): string {
    if (process.env.QWEN_MODEL) return process.env.QWEN_MODEL;
    if (this.isLocalMode()) return "qwen3:1.7b";
    if (process.env.GROQ_API_KEY && !process.env.QWEN_API_KEY) return process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
    return "qwen-plus";
  }

  public getTimeoutMs(): number {
    return this.isLocalMode() ? 20000 : 3000;
  }

  private initClient(): void {
    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        this.client = new OpenAI({
          apiKey,
          baseURL: this.getBaseUrl(),
          maxRetries: 1,
          timeout: Math.max(10000, this.getTimeoutMs() + 1000),
        });
      } catch (err: any) {
        console.warn("[QwenClient] Failed to initialize Qwen client:", err.message);
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
      "QWEN",
      `Qwen quota exhausted or rate limit reached. Circuit breaker open for ${Math.round(cooldownMs / 1000)}s`
    );
  }

  public recordFailure(err?: any): void {
    const msg = String(err?.message || err || "").toLowerCase();
    const isQuota =
      msg.includes("insufficient_quota") ||
      msg.includes("quota exceeded") ||
      msg.includes("rate_limit") ||
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
        "QWEN",
        `Qwen failure threshold reached (${this.circuitBreaker.failureCount}). Circuit breaker OPEN.`
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
      throw new Error(`QWEN_UNAVAILABLE: Circuit breaker is open or API key is missing.`);
    }

    const client = this.getRawClient();
    if (!client) {
      throw new Error(`QWEN_CLIENT_MISSING: Qwen client could not be initialized.`);
    }

    const abortController = new AbortController();
    const timer = setTimeout(() => {
      abortController.abort(new Error(`TIMEOUT: Qwen stage ${stage} exceeded ${timeoutMs}ms limit.`));
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
        "QWEN",
        `Qwen stage ${stage} failed after ${elapsed}ms: ${err?.message || err}`
      );
      throw err;
    }
  }
}

export const qwenClient = QwenClientManager.getInstance();
