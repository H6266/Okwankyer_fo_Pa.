import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  normalize: vi.fn(),
  analyze: vi.fn(),
  hciConfigured: vi.fn(),
  ghanaNlpConfigured: vi.fn(),
  ghanaNlpTranscribe: vi.fn(),
  geminiAvailable: vi.fn(),
  localCheckHealth: vi.fn(),
  localTranscribe: vi.fn(),
  recordTurn: vi.fn(),
}));

vi.mock("../src/ai_system/speech/asr/audioNormalizer", () => ({
  audioNormalizer: { normalize: mocks.normalize },
}));
vi.mock("../src/ai_system/speech/asr/audioQuality", () => ({
  audioQualityAnalyzer: { analyze: mocks.analyze },
}));
vi.mock("../src/services/hciLabService", () => ({
  hciLabService: { isConfigured: mocks.hciConfigured },
}));
vi.mock("../src/services/ghanaNlpAsrService", () => ({
  ghanaNlpAsrService: {
    isConfigured: mocks.ghanaNlpConfigured,
    transcribe: mocks.ghanaNlpTranscribe,
    defaultTimeoutMs: 5000,
  },
}));
vi.mock("../src/services/geminiClient", () => ({
  geminiClient: { isAvailable: mocks.geminiAvailable },
}));
vi.mock("../src/ai_system/speech/asr/neuralAsrProvider", () => ({
  neuralAsrProvider: {
    checkHealth: mocks.localCheckHealth,
    transcribe: mocks.localTranscribe,
  },
}));
vi.mock("../src/ai_system/speech/asr/feedbackService", () => ({
  feedbackService: { recordTurn: mocks.recordTurn },
}));

import { asrOrchestrator } from "../src/ai_system/speech/asr/asrOrchestrator";

describe("ASR local fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalize.mockResolvedValue({
      wavBuffer: Buffer.from("wav"),
      pcm16Buffer: Buffer.from([1, 2, 3]),
      isSilent: false,
    });
    mocks.analyze.mockReturnValue({
      status: "GOOD",
      speechDetected: true,
      rmsEnergy: 0.2,
    });
    mocks.hciConfigured.mockReturnValue(false);
    mocks.geminiAvailable.mockReturnValue(false);
    mocks.localCheckHealth.mockResolvedValue({ ready: true, model: "test-local-model" });
    mocks.localTranscribe.mockResolvedValue({
      text: "Send 20 cedis to Kwame",
      provider: "local-test-asr",
    });
  });

  it("uses local ASR when no hosted speech API keys are configured", async () => {
    const result = await asrOrchestrator.transcribe(Buffer.from([1, 2, 3]), "audio/wav", {
      languageHint: "en",
    });

    expect(mocks.localCheckHealth).toHaveBeenCalledOnce();
    expect(mocks.localTranscribe).toHaveBeenCalledOnce();
    expect(result.text).toBe("Send 20 cedis to Kwame");
    expect(result.providerUsed).toBe("local-test-asr");
    expect(result.errorMessage).toBeUndefined();
  });

  it.each([
    ["en-ak", "twi", "mixed-twi-en"],
    ["code-switched", "twi", "mixed-twi-en"],
    ["twi-akuapem", "atw", "atw"],
    ["en-gh", "eng", "eng"],
    ["fante", "fat", "fat"],
  ])("routes %s language hint to the right GhanaNLP language", async (hint, providerLanguage, detectedLanguage) => {
    mocks.ghanaNlpConfigured.mockReturnValue(true);
    mocks.ghanaNlpTranscribe.mockResolvedValue({
      text: "Mepɛ sɛ me send sika",
      confidence: null,
      confidenceSource: "provider_unreported",
    });

    const result = await asrOrchestrator.transcribe(Buffer.from([1, 2, 3]), "audio/wav", {
      languageHint: hint,
    });

    expect(mocks.ghanaNlpTranscribe).toHaveBeenCalledWith(
      expect.any(Buffer),
      providerLanguage,
      "audio/wav",
      5000
    );
    expect(result.languageDetected).toBe(detectedLanguage);
  });
});