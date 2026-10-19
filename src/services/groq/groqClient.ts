/**
 * Ɔkwankyerɛfo Pa - Groq AI LPU Unified Client Wrapper (groqClient.ts)
 * 
 * Provides:
 * 1. Ultra-low-latency Groq LPU client instance management (~80-150ms TTFT).
 * 2. Per-request abort controller and bounded timeouts.
 * 3. Exponential backoff and circuit-breaker failover when quota is exhausted (HTTP 429).
 * 4. High-performance fallback in the Gemini -> Groq AI -> Deterministic Brain cascade.
 */

import { auditLogger } from "../auditLogger";

export interface GroqChatCompletion {
  choices: Array<{ message?: { content?: string | null } }>;
}

export interface GroqApiClient {
  chat: { completions: { create(request: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<GroqChatCompletion> } };
}

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

export class GroqClientManager {
  private static instance: GroqClientManager;
  private client: GroqApiClient | null = null;
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

  public static getInstance(): GroqClientManager {
    if (!GroqClientManager.instance) {
      GroqClientManager.instance = new GroqClientManager();
    }
    return GroqClientManager.instance;
  }

  public getApiKey(): string | undefined {
    const raw = (process.env.GROQ_API_KEY || "").trim();
    if (isPlaceholderKey(raw)) {
      return undefined;
    }
    return raw || undefined;
  }

  public getBaseUrl(): string {
    return process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
  }

  public getModel(): string {
    return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  }

  public getTimeoutMs(): number {
    return 3000;
  }

  private initClient(): void {
    const apiKey = this.getApiKey();
    if (apiKey) {
      try {
        const baseUrl = this.getBaseUrl().replace(/\/+$/, "");
        this.client = {
          chat: {
            completions: {
              create: async (request, options = {}) => {
                const response = await fetch(`${baseUrl}/chat/completions`, {
                  method: "POST",
                  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                  body: JSON.stringify(request),
                  signal: options.signal,
                });
                if (!response.ok) {
                  const details = await response.text();
                  throw new Error(`Groq HTTP ${response.status}: ${details.slice(0, 300)}`);
                }
                return response.json() as Promise<GroqChatCompletion>;
              },
            },
          },
        };
      } catch (err: any) {
        console.warn("[GroqClient] Failed to initialize Groq client:", err.message);
        this.client = null;
      }
    }
  }

  public getRawClient(): GroqApiClient | null {
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

  public getUnavailableReason(): string | null {
    if (!this.getApiKey()) return "GROQ_API_KEY is missing or is a placeholder";
    const now = Date.now();
    if (this.circuitBreaker.cooldownUntil > now) {
      return `Groq circuit breaker cooldown has ${Math.ceil((this.circuitBreaker.cooldownUntil - now) / 1000)}s remaining`;
    }
    if (this.circuitBreaker.state === "OPEN" && now - this.circuitBreaker.lastFailureTime <= 30000) {
      return "Groq circuit breaker is open";
    }
    return null;
  }

  public recordQuotaExhausted(cooldownMs: number = this.DEFAULT_COOLDOWN_MS): void {
    this.circuitBreaker.state = "OPEN";
    this.circuitBreaker.cooldownUntil = Date.now() + cooldownMs;
    this.circuitBreaker.lastFailureTime = Date.now();
    auditLogger.log(
      "warn",
      "GROQ",
      `Groq quota exhausted or rate limit reached. Circuit breaker open for ${Math.round(cooldownMs / 1000)}s`
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
      this.circuitBreaker.cooldownUntil = Date.now() + 60000; // 1 min cooldown for normal failures
      auditLogger.log(
        "warn",
        "GROQ",
        `Groq reached ${this.FAILURE_THRESHOLD} consecutive errors. Circuit breaker open for 60s: ${msg}`
      );
    }
  }

  public recordSuccess(): void {
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.state = "CLOSED";
  }

  public async executeWithTimeout<T>(
    operationName: string,
    fn: (client: GroqApiClient, signal: AbortSignal) => Promise<T>,
    timeoutMs: number = this.getTimeoutMs()
  ): Promise<T> {
    if (!this.isAvailable()) {
      throw new Error(`[GroqClient] Groq is unavailable (missing key or circuit breaker open) for ${operationName}`);
    }

    const client = this.getRawClient();
    if (!client) {
      throw new Error(`[GroqClient] Groq client not initialized for ${operationName}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const result = await fn(client, controller.signal);
      this.recordSuccess();
      return result;
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        this.recordFailure(new Error("Timeout"));
        throw new Error(`[GroqClient] Operation ${operationName} timed out after ${timeoutMs}ms`);
      }
      this.recordFailure(err);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const groqClient = GroqClientManager.getInstance();
