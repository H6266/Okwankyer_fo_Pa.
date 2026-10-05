/**
 * Ɔkwankyerɛfo Pa - OpenAI Cloud Reasoner Client
 * 
 * Provides structured JSON cognitive reasoning fallback when Gemini is quota-exhausted or unavailable.
 * Features:
 * - Direct HTTP fetch (no external SDK dependency)
 * - Circuit breaker with quota cooldown (10 minutes on credit_balance_exhausted / 429)
 * - AbortController timeout (<2500ms)
 * - Strict JSON response parsing
 */

import { auditLogger } from "./auditLogger";

export interface OpenAiCircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
}

export class UnifiedOpenAiClient {
  private static instance: UnifiedOpenAiClient;
  private circuitBreaker: OpenAiCircuitBreakerState = {
    failureCount: 0,
    lastFailureTime: 0,
    state: "CLOSED",
  };

  private readonly FAILURE_THRESHOLD = 3;
  private readonly RECOVERY_TIMEOUT_MS = 30 * 1000;
  private readonly QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
  private isQuotaCooldown = false;

  public static getInstance(): UnifiedOpenAiClient {
    if (!UnifiedOpenAiClient.instance) {
      UnifiedOpenAiClient.instance = new UnifiedOpenAiClient();
    }
    return UnifiedOpenAiClient.instance;
  }

  public isAvailable(): boolean {
    const key = process.env.OPENAI_API_KEY;
    if (!key || key.trim() === "") return false;
    return this.checkCircuitBreaker();
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

  public recordQuotaExceeded(reason?: string): void {
    this.circuitBreaker.failureCount = this.FAILURE_THRESHOLD;
    this.circuitBreaker.lastFailureTime = Date.now();
    this.circuitBreaker.state = "OPEN";
    this.isQuotaCooldown = true;
    auditLogger.log(
      "warn",
      "OPENAI_CIRCUIT_BREAKER",
      `OpenAI API quota/credit exhausted: ${reason || "insufficient_quota"}. Cooldown active for 10m.`
    );
  }

  public recordSuccess(): void {
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.state = "CLOSED";
    this.isQuotaCooldown = false;
  }

  public recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    if (this.circuitBreaker.failureCount >= this.FAILURE_THRESHOLD) {
      this.circuitBreaker.state = "OPEN";
    }
  }

  public async generateStructuredReasoning(prompt: string, timeoutMs: number = 2500): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("[OpenAiClient] OPENAI_API_KEY not configured.");
    }

    if (!this.checkCircuitBreaker()) {
      throw new Error("[OpenAiClient] Circuit breaker is OPEN. Fast-failing request.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are an expert Ghanaian mobile financial voice cognitive engine. Analyze spoken English, Twi, and code-switched inputs accurately into structured JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!response.ok) {
        const bodyText = await response.text();
        let parsedErr: any = {};
        try {
          parsedErr = JSON.parse(bodyText);
        } catch {
          parsedErr = { error: { message: bodyText } };
        }

        const errCode = parsedErr?.error?.code || "";
        const errType = parsedErr?.error?.type || "";
        const errMsg = parsedErr?.error?.message || bodyText;

        if (
          response.status === 429 ||
          errCode === "insufficient_quota" ||
          errCode === "credit_balance_exhausted" ||
          errType === "insufficient_quota" ||
          errMsg.includes("credit") ||
          errMsg.includes("quota")
        ) {
          this.recordQuotaExceeded(errMsg);
          throw new Error(`OpenAI quota exceeded: ${errMsg}`);
        }

        this.recordFailure();
        throw new Error(`OpenAI HTTP ${response.status}: ${errMsg}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      this.recordSuccess();
      return content;
    } catch (err: any) {
      clearTimeout(timer);
      const msg = String(err.message || "");
      if (msg.includes("credit") || msg.includes("quota")) {
        this.recordQuotaExceeded(msg);
      } else {
        this.recordFailure();
      }
      throw err;
    }
  }
}

export const openAiClient = UnifiedOpenAiClient.getInstance();
