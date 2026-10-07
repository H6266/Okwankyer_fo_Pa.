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
  private static instances = new Map<string, UnifiedGeminiClient>();
  private ai: GoogleGenAI | null = null;
  public readonly laneName: string;
  private circuitBreaker: CircuitBreakerState = {
    failureCount: 0,
    lastFailureTime: 0,
    state: "CLOSED",
  };

  private readonly FAILURE_THRESHOLD = 4;
  private readonly RECOVERY_TIMEOUT_MS = 30 * 1000; // 30s
  private latencyHistory: { stage: string; durationMs: number; timestamp: number }[] = [];

  constructor(laneName: string = "telephony") {
    this.laneName = laneName;
    this.initClient();
  }

  public static getInstance(laneName: string = "telephony"): UnifiedGeminiClient {
    let inst = UnifiedGeminiClient.instances.get(laneName);
    if (!inst) {
      inst = new UnifiedGeminiClient(laneName);
      UnifiedGeminiClient.instances.set(laneName, inst);
    }
    return inst;
  }

  public getCircuitBreakerState(): "CLOSED" | "OPEN" | "HALF_OPEN" {
    return this.circuitBreaker.state;
  }

  public resetCircuitBreaker(): void {
    this.circuitBreaker = {
      failureCount: 0,
      lastFailureTime: 0,
      state: "CLOSED",
    };
    this.globalQuotaCooldownUntil = 0;
    this.modelQuotaCooldowns.clear();
    this.accessDenied = false;
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

  private modelQuotaCooldowns = new Map<string, number>();
  private globalQuotaCooldownUntil: number = 0;
  private accessDenied: boolean = false;
  private accessDeniedUntil: number = 0;

  public isAvailable(): boolean {
    if (this.accessDenied && Date.now() < this.accessDeniedUntil) {
      return false;
    }
    if (this.globalQuotaCooldownUntil && Date.now() < this.globalQuotaCooldownUntil) {
      return false;
    }
    return Boolean(this.getRawClient()) && this.checkCircuitBreaker();
  }

  public isModelAvailable(model: string): boolean {
    if (this.accessDenied && Date.now() < this.accessDeniedUntil) {
      return false;
    }
    if (this.globalQuotaCooldownUntil && Date.now() < this.globalQuotaCooldownUntil) {
      return false;
    }
    if (!this.getRawClient()) return false;
    const cooldownUntil = this.modelQuotaCooldowns.get(model);
    if (cooldownUntil && Date.now() < cooldownUntil) {
      return false;
    }
    return this.checkCircuitBreaker();
  }

  public recordAccessDenied(reason: string = "PERMISSION_DENIED", cooldownMs: number = 24 * 60 * 60 * 1000): void {
    this.accessDenied = true;
    this.accessDeniedUntil = Date.now() + cooldownMs;
  }

  public recordQuotaExhausted(retryDelayMs: number = 60 * 60 * 1000): void {
    this.globalQuotaCooldownUntil = Date.now() + retryDelayMs;
  }

  public recordModelQuotaExhausted(model: string, retryDelayMs: number = 15 * 60 * 1000): void {
    this.modelQuotaCooldowns.set(model, Date.now() + retryDelayMs);
  }

  private checkCircuitBreaker(): boolean {
    const now = Date.now();
    if (this.circuitBreaker.state === "OPEN") {
      if (now - this.circuitBreaker.lastFailureTime > this.RECOVERY_TIMEOUT_MS) {
        this.circuitBreaker.state = "HALF_OPEN";
        return true;
      }
      return false;
    }
    return true;
  }

  private recordSuccess(stage: string, durationMs: number): void {
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.state = "CLOSED";
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
      let timeoutTriggered = false;
      const timeoutHandle = setTimeout(() => {
        timeoutTriggered = true;
        controller.abort(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error(`[GeminiClient] Timeout after ${timeoutMs}ms for '${operationName}'`));
        });
      });

      try {
        const actionPromise = action(ai, controller.signal);
        const result = await Promise.race([actionPromise, timeoutPromise]);
        clearTimeout(timeoutHandle);
        const duration = Date.now() - startTime;
        this.recordSuccess(operationName, duration);
        return result;
      } catch (err: any) {
        clearTimeout(timeoutHandle);
        const msg = String(err?.message || "");
        const isQuotaExhausted =
          err.status === 429 &&
          (msg.includes("RESOURCE_EXHAUSTED") ||
           msg.includes("Quota exceeded") ||
           msg.includes("generativelanguage.googleapis.com"));

        const isForbidden =
          err.status === 403 ||
          msg.includes("403") ||
          msg.includes("PERMISSION_DENIED") ||
          msg.includes("denied access") ||
          msg.includes("API_KEY_INVALID");

        // If access is denied (403), immediately record access denied and do not retry
        if (isForbidden) {
          this.recordAccessDenied(msg);
          this.recordFailure();
          throw err;
        }

        // If daily quota is exhausted, retrying immediately is futile. Throw immediately.
        if (isQuotaExhausted) {
          let cooldownMs = 60 * 60 * 1000;
          const retrySecMatch = msg.match(/retryDelay['":\s]+([0-9]+)/i);
          if (retrySecMatch && retrySecMatch[1]) {
            cooldownMs = Math.max(60 * 1000, parseInt(retrySecMatch[1], 10) * 1000);
          }
          this.recordQuotaExhausted(cooldownMs);
          this.recordFailure();
          throw err;
        }

        // 503 high demand spikes: fail fast so fallback/alternate candidate can take over
        const isUnavailable =
          err.status === 503 ||
          msg.includes("503") ||
          msg.includes("high demand") ||
          msg.includes("UNAVAILABLE");
        if (isUnavailable && maxRetries === 0) {
          this.recordFailure();
          throw err;
        }

        const isAbort = controller.signal.aborted || err.name === "AbortError" || timeoutTriggered;
        const isRetriable =
          isAbort ||
          err.status === 429 ||
          (err.status >= 500 && err.status < 600) ||
          msg.includes("fetch failed") ||
          msg.includes("network");

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
    const primaryController = new AbortController();
    const secondaryController = new AbortController();

    const forwardAbort = () => {
      primaryController.abort();
      secondaryController.abort();
    };
    overallController.signal.addEventListener("abort", forwardAbort);

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let primaryFailed = false;
      let secondaryFailed = false;
      let primaryError: any = null;
      let secondaryError: any = null;
      let secondaryStarted = false;
      let hedgeTimer: NodeJS.Timeout | null = null;

      const deadlineHandle = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          overallController.abort();
          reject(new Error(`[GeminiClient] Overall deadline of ${overallDeadlineMs}ms exceeded for ${operationName}`));
        }
      }, overallDeadlineMs);

      const cleanup = () => {
        clearTimeout(deadlineHandle);
        if (hedgeTimer) clearTimeout(hedgeTimer);
        overallController.signal.removeEventListener("abort", forwardAbort);
      };

      const succeed = (val: T) => {
        if (!settled) {
          settled = true;
          cleanup();
          primaryController.abort();
          secondaryController.abort();
          resolve(val);
        }
      };

      const checkAllFailed = () => {
        if (!settled && primaryFailed && secondaryFailed) {
          settled = true;
          cleanup();
          this.recordFailure();

          const activeErr = secondaryError || primaryError;
          const msg = String(activeErr?.message || "");
          const isQuota =
            activeErr?.status === 429 ||
            msg.includes("429") ||
            msg.includes("RESOURCE_EXHAUSTED") ||
            msg.includes("Quota exceeded");
          const isForbidden =
            activeErr?.status === 403 ||
            msg.includes("403") ||
            msg.includes("PERMISSION_DENIED") ||
            msg.includes("denied access");

          if (isQuota) {
            let cooldownMs = 60 * 60 * 1000;
            const retrySecMatch = msg.match(/retryDelay['":\s]+([0-9]+)/i);
            if (retrySecMatch && retrySecMatch[1]) {
              cooldownMs = Math.max(60 * 1000, parseInt(retrySecMatch[1], 10) * 1000);
            }
            this.recordQuotaExhausted(cooldownMs);
          } else if (isForbidden) {
            this.recordAccessDenied(msg);
          }

          reject(activeErr || new Error(`Both hedged calls failed for ${operationName}`));
        }
      };

      const triggerSecondary = () => {
        if (secondaryStarted || settled) return;
        secondaryStarted = true;
        if (hedgeTimer) {
          clearTimeout(hedgeTimer);
          hedgeTimer = null;
        }

        secondaryAction(ai, secondaryController.signal)
          .then((res) => succeed(res))
          .catch((err) => {
            secondaryFailed = true;
            secondaryError = err;
            checkAllFailed();
          });
      };

      // Launch primary immediately
      primaryAction(ai, primaryController.signal)
        .then((res) => succeed(res))
        .catch((err) => {
          primaryFailed = true;
          primaryError = err;
          // If primary failed early, trigger secondary immediately instead of waiting for hedgeDelay
          if (!secondaryStarted) {
            triggerSecondary();
          } else {
            checkAllFailed();
          }
        });

      // Schedule secondary if primary hasn't finished within hedgeDelayMs
      hedgeTimer = setTimeout(() => {
        if (!settled && !secondaryStarted) {
          triggerSecondary();
        }
      }, hedgeDelayMs);
    });
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

export const geminiClient = UnifiedGeminiClient.getInstance("telephony");
export const studyGeminiClient = UnifiedGeminiClient.getInstance("study");
