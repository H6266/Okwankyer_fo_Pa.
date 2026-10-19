import { afterEach, describe, expect, it, vi } from "vitest";
import { NeuralAsrProvider } from "../src/ai_system/speech/asr/neuralAsrProvider";

describe("Neural ASR readiness probes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("coalesces concurrent checks and briefly caches unavailable workers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ready: false, model: "not-running" }), { status: 503 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new NeuralAsrProvider();

    const [first, concurrent] = await Promise.all([
      provider.checkHealth(),
      provider.checkHealth(),
    ]);
    const cached = await provider.checkHealth();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(first.ready).toBe(false);
    expect(concurrent.ready).toBe(false);
    expect(cached.details).toContain("HTTP 503");
  });

  it("aborts a stalled health probe within the configured cap", async () => {
    vi.stubEnv("LOCAL_GHANA_ASR_HEALTH_TIMEOUT_MS", "100");
    const fetchMock = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("probe aborted")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new NeuralAsrProvider();
    const started = performance.now();

    const result = await provider.checkHealth();

    expect(performance.now() - started).toBeLessThan(1000);
    expect(result.ready).toBe(false);
    expect(result.details).toContain("probe aborted");
  });

  it("does not invent ASR confidence when the worker omits it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "Send twenty cedis", language: "en" }), { status: 200 })
    ));
    const provider = new NeuralAsrProvider();

    const result = await provider.transcribe(Buffer.from("audio"), "audio/wav", "en");

    expect(result.text).toBe("Send twenty cedis");
    expect(result.confidence).toBeNull();
    expect(result.confidenceSource).toBe("PROVIDER_UNREPORTED");
  });
});