import { describe, it, expect } from "vitest";
import { ModelRouter, CognitiveCapability } from "../src/ai_system/providers/modelRouter";

describe("ModelRouter & Circuit Breakers (Section 41 & 42)", () => {
  it("uses Gemini as the primary provider and keeps deterministic / local-brain fallbacks in the default routing order", () => {
    const router = new ModelRouter();
    const order = router.getHealthReport().map((provider) => provider.id);

    expect(order.indexOf("gemini_reasoning")).toBeLessThan(order.indexOf("deterministic_reasoning"));
    expect(order.indexOf("deterministic_reasoning")).toBeLessThan(order.indexOf("local_language_brain"));
  });

  it("trips circuit breaker after consecutive failures and falls back to deterministic engine", async () => {
    const router = new ModelRouter();

    let remoteAttempts = 0;
    router.register({
      id: "flaky_cloud_provider",
      name: "Flaky Cloud LLM",
      isLocal: false,
      capabilities: new Set(["GEMINI_REASONING" as CognitiveCapability]),
      priority: 1, // Higher priority than local
      timeoutMs: 1000,
      isAvailable: () => true,
      execute: async () => {
        remoteAttempts++;
        throw new Error("HTTP 429 Quota Exhausted");
      },
    });

    const fallbackFn = async () => ({ intent: "SEND_MONEY", source: "local_rules" });

    // Attempt 1: Gemini fails, deterministic reasoning handles the fallback path.
    const res1 = await router.executeCapability("GEMINI_REASONING", { prompt: "test" }, fallbackFn);
    expect(res1.result.intent).toBe("SEND_MONEY");
    expect(res1.providerUsed).toBe("deterministic_reasoning");

    // Attempt 2: Fails
    await router.executeCapability("GEMINI_REASONING", { prompt: "test" }, fallbackFn);

    // Attempt 3: Fails and TRIPS circuit breaker
    await router.executeCapability("GEMINI_REASONING", { prompt: "test" }, fallbackFn);

    const report = router.getHealthReport().find((p) => p.id === "flaky_cloud_provider");
    expect(report).toBeDefined();
    expect(report!.circuitBreakerOpen).toBe(true);
    expect(report!.failureCount).toBe(3);
    expect(report!.cooldownRemainingSec).toBeGreaterThan(0);

    // Attempt 4: Should SKIP remote execution entirely due to open circuit breaker.
    const attemptsBefore = remoteAttempts;
    const res4 = await router.executeCapability("GEMINI_REASONING", { prompt: "test" }, fallbackFn);
    expect(res4.result.intent).toBe("SEND_MONEY");
    expect(res4.providerUsed).toBe("deterministic_reasoning");
    expect(remoteAttempts).toBe(attemptsBefore); // Proves circuit breaker bypassed the failing remote call!
  });
});
