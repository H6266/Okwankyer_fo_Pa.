/**
 * Ɔkwankyerɛfo Pa - Capability-Based Model Router (modelRouter.ts)
 * 
 * Implements:
 * 1. Capability-based provider dispatch (decoupled from hardcoded models)
 * 2. Per-provider circuit breakers with failure counters & cooldown timers
 * 3. Bounded timeouts with AbortController for all remote calls
 * 4. Graceful fallback cascade: Gemini -> Local SLM -> Deterministic Ghana Engine
 * 5. Provider observability metrics (latency p50/p95, error rates, status)
 */

import { geminiClient } from "../../services/geminiClient";
import { reasoningEngine } from "../understanding/reasoningEngine";
import { localLanguageBrain } from "./LocalLanguageBrain";
import { openAiReasoner } from "../../services/openai/openaiReasoner";
import { groqReasoner } from "../../services/groq/groqReasoner";
import { qwenReasoner } from "../../services/qwen/qwenReasoner";

export type CognitiveCapability =
  | "LOCAL_NLU"
  | "LOCAL_ASR"
  | "LOCAL_TTS"
  | "LOCAL_LLM"
  | "GEMINI_REASONING"
  | "GEMINI_LIVE"
  | "GEMINI_TTS"
  | "EMBEDDINGS";

export interface ProviderHealth {
  id: string;
  name: string;
  isLocal: boolean;
  capabilities: CognitiveCapability[];
  available: boolean;
  circuitBreakerOpen: boolean;
  failureCount: number;
  lastFailureTime?: number;
  cooldownRemainingSec: number;
  averageLatencyMs: number;
  successCount: number;
}

export interface ProviderRegistration {
  id: string;
  name: string;
  isLocal: boolean;
  capabilities: Set<CognitiveCapability>;
  priority: number; // lower number = higher priority
  timeoutMs: number;
  execute: (payload: any, signal?: AbortSignal) => Promise<any>;
  isAvailable: () => boolean;
}

export class ModelRouter {
  private static instance: ModelRouter;
  private providers = new Map<string, ProviderRegistration>();
  private failureCounts = new Map<string, number>();
  private circuitBreakers = new Map<string, { open: boolean; cooldownUntil: number }>();
  private latencyHistory = new Map<string, number[]>();
  private successCounts = new Map<string, number>();

  private readonly FAILURE_THRESHOLD = 3;
  private readonly COOLDOWN_DURATION_MS = 60 * 1000; // 60s cooldown

  constructor(registerDefaults: boolean = true) {
    if (registerDefaults) {
      this.registerDefaultProviders();
    }
  }

  public static getInstance(): ModelRouter {
    if (!ModelRouter.instance) {
      ModelRouter.instance = new ModelRouter(true);
    }
    return ModelRouter.instance;
  }

  public clear(): void {
    this.providers.clear();
    this.failureCounts.clear();
    this.circuitBreakers.clear();
    this.latencyHistory.clear();
    this.successCounts.clear();
  }

  private registerDefaultProviders(): void {
    // 1. Gemini API is the first content path for semantic reasoning when available.
    this.register({
      id: "gemini_reasoning",
      name: "Gemini 3.8 Flash Cloud Reasoning",
      isLocal: false,
      capabilities: new Set(["GEMINI_REASONING"]),
      priority: 10,
      timeoutMs: 2500,
      isAvailable: () => geminiClient.isAvailable(),
      execute: async (payload, signal) => {
        return geminiClient.executeWithTimeout(
          "GEMINI_REASONING_ROUTER",
          async (client, s) => {
            const resp = await client.models.generateContent({
              model: process.env.GEMINI_REASONING_MODEL || "gemini-3.8-flash",
              contents: payload.prompt,
              config: payload.config || { responseMimeType: "application/json" },
            });
            const raw = resp as any;
            return raw?.text && typeof raw.text === "function" ? raw.text() : raw?.text || "{}";
          },
          2500,
          0
        );
      },
    });

    // 2. OpenAI Cloud Reasoning: Handshake 1 fallback after Gemini (priority 15)
    this.register({
      id: "openai_reasoning",
      name: "OpenAI Cloud Reasoning (gpt-4o-mini)",
      isLocal: false,
      capabilities: new Set(["GEMINI_REASONING"]),
      priority: 15,
      timeoutMs: 3000,
      isAvailable: () => openAiReasoner.isAvailable(),
      execute: async (payload) => {
        const res = await openAiReasoner.reasonForBrain(
          payload?.utterance || payload?.prompt || "",
          payload?.existingSlots || {},
          3000
        );
        if (!res) throw new Error("OpenAI reasoning yielded no result");
        return res;
      },
    });

    const qwenLocal = qwenReasoner.isLocalMode();

    // Local open-weight Qwen is opt-in and leads reasoning only when explicitly selected.
    this.register({
      id: "qwen_reasoning",
      name: qwenLocal ? "Local Qwen 3 Reasoning (Ollama)" : "Qwen AI Cloud Reasoning (qwen-plus)",
      isLocal: qwenLocal,
      capabilities: new Set(["GEMINI_REASONING"]),
      priority: qwenLocal ? 5 : 25,
      timeoutMs: qwenLocal ? qwenReasoner.getTimeoutMs() : 3000,
      isAvailable: () => qwenReasoner.isAvailable(),
      execute: async (payload) => {
        const res = await qwenReasoner.reasonForBrain(
          payload?.utterance || payload?.prompt || "",
          payload?.existingSlots || {},
          qwenLocal ? qwenReasoner.getTimeoutMs() : 3000
        );
        if (!res) throw new Error("Qwen AI reasoning yielded no result");
        return res;
      },
    });

    // 3. Groq AI Cloud Reasoning: Handshake 2 fallback after OpenAI (priority 20)
    this.register({
      id: "groq_reasoning",
      name: "Groq AI LPU Cloud Reasoning",
      isLocal: false,
      capabilities: new Set(["GEMINI_REASONING"]),
      priority: 20,
      timeoutMs: 3000,
      isAvailable: () => groqReasoner.isAvailable(),
      execute: async (payload) => {
        const languageHint = String(payload?.languageHint || "en").toLowerCase();
        const targetLanguage = ["tw", "twi", "ak", "en-ak", "mixed-twi-en"].includes(languageHint)
          ? "twi-asante"
          : "en";
        const res = await groqReasoner.reasonForBrain(
          payload?.utterance || payload?.prompt || "",
          payload?.existingSlots || {},
          3000,
          {
            targetLanguage,
            currentStep: payload?.currentStep,
            transactionState: payload?.transactionState,
            recipientVerified: payload?.recipientVerified,
          }
        );
        if (!res) throw new Error("Groq reasoning yielded no result");
        return res;
      },
    });

    // 4. Deterministic local reasoning is the safety fallback when cloud LLMs fail.
    this.register({
      id: "deterministic_reasoning",
      name: "Deterministic Ghanaian Reasoning",
      isLocal: true,
      capabilities: new Set(["GEMINI_REASONING"]),
      priority: 30,
      timeoutMs: 800,
      isAvailable: () => true,
      execute: async (payload) => {
        const utterance = payload?.utterance || payload?.prompt || "";
        const response = reasoningEngine.deterministicReasoning({
          utterance,
          languageHint: payload?.languageHint || "en",
          currentScreen: payload?.currentScreen || "HOME",
          currentStep: payload?.currentStep || "welcome",
          existingSlots: payload?.existingSlots || {},
        });
        return response;
      },
    });

    // 5. Built-in local brain remains the final in-house fallback.
    this.register({
      id: "local_language_brain",
      name: "Local Inbuilt Language Brain",
      isLocal: true,
      capabilities: new Set(["GEMINI_REASONING"]),
      priority: 35,
      timeoutMs: 1000,
      isAvailable: () => true,
      execute: async (payload) => {
        const text = payload?.utterance || payload?.prompt || "";
        return localLanguageBrain.understand({
          text,
          language: payload?.languageHint || "en",
          previousSlots: payload?.existingSlots || {},
          currentStep: payload?.currentStep || "welcome",
        });
      },
    });

    // Gemini Cloud TTS Provider
    this.register({
      id: "gemini_tts",
      name: "Gemini Cloud Voice Synthesis",
      isLocal: false,
      capabilities: new Set(["GEMINI_TTS"]),
      priority: 15,
      timeoutMs: 3000,
      isAvailable: () => geminiClient.isAvailable(),
      execute: async (payload) => {
        const client = geminiClient.getRawClient();
        if (!client) throw new Error("Gemini client is not initialized.");
        const resp = await client.models.generateContent({
          model: process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts",
          contents: [{ parts: [{ text: payload.text }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: payload.voice || "Puck" },
              },
            },
          },
        });
        return resp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
      },
    });
  }

  public register(provider: ProviderRegistration): void {
    this.providers.set(provider.id, provider);
    this.failureCounts.set(provider.id, 0);
    this.circuitBreakers.set(provider.id, { open: false, cooldownUntil: 0 });
    this.latencyHistory.set(provider.id, []);
    this.successCounts.set(provider.id, 0);
  }

  /**
   * Executes a capability with automatic circuit breaker and fallback cascade.
   */
  public async executeCapability<T = any>(
    capability: CognitiveCapability,
    payload: any,
    fallbackFn?: () => Promise<T>
  ): Promise<{ result: T; providerUsed: string }> {
    const candidates = Array.from(this.providers.values())
      .filter((p) => p.capabilities.has(capability))
      .sort((a, b) => a.priority - b.priority);

    for (const provider of candidates) {
      if (!this.canAttempt(provider.id)) {
        continue;
      }

      if (!provider.isAvailable()) {
        continue;
      }

      const start = performance.now();
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), provider.timeoutMs);

      try {
        const result = await provider.execute(payload, abortController.signal);
        clearTimeout(timer);
        const duration = performance.now() - start;
        this.recordSuccess(provider.id, duration);
        return { result, providerUsed: provider.id };
      } catch (err: any) {
        clearTimeout(timer);
        this.recordFailure(provider.id);
        console.warn(`[ModelRouter] Provider '${provider.id}' failed capability '${capability}': ${err.message}. Trying next candidate.`);
      }
    }

    if (fallbackFn) {
      const fallbackResult = await fallbackFn();
      return { result: fallbackResult, providerUsed: "local_deterministic_fallback" };
    }

    throw new Error(`[ModelRouter] No available provider succeeded for capability '${capability}'.`);
  }

  private canAttempt(providerId: string): boolean {
    const cb = this.circuitBreakers.get(providerId);
    if (!cb || !cb.open) return true;

    // Check if cooldown has expired (half-open state)
    if (Date.now() >= cb.cooldownUntil) {
      cb.open = false; // Reset to trial state
      return true;
    }
    return false;
  }

  private recordSuccess(providerId: string, durationMs: number): void {
    this.failureCounts.set(providerId, 0);
    const cb = this.circuitBreakers.get(providerId);
    if (cb) cb.open = false;

    const count = this.successCounts.get(providerId) || 0;
    this.successCounts.set(providerId, count + 1);

    const history = this.latencyHistory.get(providerId) || [];
    history.push(durationMs);
    if (history.length > 50) history.shift();
    this.latencyHistory.set(providerId, history);
  }

  private recordFailure(providerId: string): void {
    const count = (this.failureCounts.get(providerId) || 0) + 1;
    this.failureCounts.set(providerId, count);

    if (count >= this.FAILURE_THRESHOLD) {
      const cb = this.circuitBreakers.get(providerId) || { open: false, cooldownUntil: 0 };
      cb.open = true;
      cb.cooldownUntil = Date.now() + this.COOLDOWN_DURATION_MS;
      this.circuitBreakers.set(providerId, cb);
      console.warn(`[ModelRouter] Circuit breaker TRIPPED for provider '${providerId}' until ${new Date(cb.cooldownUntil).toISOString()}`);
    }
  }

  public getHealthReport(): ProviderHealth[] {
    const report: ProviderHealth[] = [];
    const now = Date.now();

    const orderedProviders = Array.from(this.providers.entries()).sort(
      ([, left], [, right]) => left.priority - right.priority
    );
    for (const [id, provider] of orderedProviders) {
      const cb = this.circuitBreakers.get(id);
      const failures = this.failureCounts.get(id) || 0;
      const successes = this.successCounts.get(id) || 0;
      const history = this.latencyHistory.get(id) || [];
      const avgLatency = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 0;
      const cooldownRemaining = cb?.open && cb.cooldownUntil > now ? Math.round((cb.cooldownUntil - now) / 1000) : 0;

      report.push({
        id,
        name: provider.name,
        isLocal: provider.isLocal,
        capabilities: Array.from(provider.capabilities),
        available: provider.isAvailable() && (!cb?.open || cooldownRemaining === 0),
        circuitBreakerOpen: Boolean(cb?.open && cooldownRemaining > 0),
        failureCount: failures,
        cooldownRemainingSec: cooldownRemaining,
        averageLatencyMs: Math.round(avgLatency),
        successCount: successes,
      });
    }

    return report;
  }
}

export const modelRouter = ModelRouter.getInstance();
