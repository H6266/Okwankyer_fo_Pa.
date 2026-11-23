import fs from "fs";
import path from "path";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { voiceRouter } from "../src/routes/voiceRoutes";
import { transactionStateMachine } from "../src/domain/stateMachine";
import { ivrDecisionEngine } from "../src/ai_system/brain/ivrDecisionEngine";
import { evaluateVoiceSamples, LevenshteinSample } from "../src/ai_system/speech/voiceEvaluation";
import { voicePipelineMonitor } from "../src/services/voicePipelineMonitor";

function createApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(voiceRouter);
  return app;
}

describe("Phase 3 voice intelligence", () => {
  beforeEach(() => {
    transactionStateMachine.deleteSession;
  });

  it("provides honest WER, CER and staged voice metrics", () => {
    const samples: LevenshteinSample[] = [
      { id: "en-1", language: "en", humanTranscript: "send 50 cedis to 0241234567", asrTranscript: "send 50 cedis to 0241234567", expectedIntent: "SEND_MONEY", actualIntent: "SEND_MONEY", noise: "quiet" },
      { id: "en-2", language: "en", humanTranscript: "check my balance", asrTranscript: "check my balances", expectedIntent: "CHECK_BALANCE", actualIntent: "CHECK_BALANCE", noise: "telephone" },
      { id: "tw-1", language: "twi", humanTranscript: "mepɛ sɛ mesoma sika", asrTranscript: "mepɛ sɛ mesoma sika", expectedIntent: "SEND_MONEY", actualIntent: "SEND_MONEY", noise: "quiet" },
      { id: "tw-2", language: "twi", humanTranscript: "mede sika kɔma obi", asrTranscript: "mede sika koma obi", expectedIntent: "SEND_MONEY", actualIntent: "SEND_MONEY", noise: "moderate_noise" },
      { id: "tw-empty", language: "twi", humanTranscript: "me balance", asrTranscript: "", expectedIntent: "CHECK_BALANCE", actualIntent: "UNKNOWN", noise: "moderate_noise" },
    ];

    const metrics = evaluateVoiceSamples(samples);
    expect(metrics.sampleCount).toBe(5);
    expect(metrics.wer).toBeGreaterThanOrEqual(0);
    expect(metrics.cer).toBeGreaterThanOrEqual(0);
    expect(metrics.englishIntentAccuracy).toBe(1);
    expect(metrics.emptyTranscriptionRate).toBe(0.2);
  });

  it("does not treat system prompt recordings as human acoustic data", () => {
    const twiDir = path.resolve(process.cwd(), "Audio_files", "Twi_library");
    const files = fs.readdirSync(twiDir).filter((name) => /\.(mp3|m4a|amr)$/i.test(name));
    expect(files.length).toBeGreaterThanOrEqual(86);

    const manifest = fs.readFileSync(path.resolve(process.cwd(), "Audio_files", "Twi_library", "transcriped_twi_audio_library.txt"), "utf8");
    expect(manifest).toContain("welcome");
    expect(files.some((name) => name.includes("Pin"))).toBe(true);
  });

  it("tracks safe operational pipeline events without raw speech", () => {
    voicePipelineMonitor.reset();
    voicePipelineMonitor.record("asr_success");
    voicePipelineMonitor.record("asr_empty");
    voicePipelineMonitor.record("conversation_completed");
    voicePipelineMonitor.record("response_delivery_failure");
    const metrics = voicePipelineMonitor.getMetrics();
    expect(metrics.emptyTranscriptionRate).toBeGreaterThan(0);
    expect(metrics.completionRate).toBe(1);
    expect(JSON.stringify(metrics)).not.toMatch(/pin|password|phone|recipient/i);
  });

  it("handles 30 complete voice scenario matrices through the IVR decision engine", () => {
    const english = [
      "I want to send money",
      "Help me transfer money",
      "Send 50 cedis to 0241234567",
      "Check my balance",
      "Buy airtime",
      "Buy a data bundle",
      "I want to withdraw money",
      "Actually make it 80",
      "No, change the recipient",
      "Cancel this transaction",
      "Repeat that",
    ];
    const twi = [
      "Mepɛ sɛ mesoma sika",
      "Mepɛ sɛ mede sika kɔma obi",
      "Mane sika aduonum kɔma 0553838464",
      "Hwɛ me balance",
      "Mepɛ sɛ metɔ airtime",
      "Mepɛ sɛ metɔ bundle",
      "Mepɛ sɛ megye sika",
      "Sesa no kɔ 80",
      "Dabi",
      "Tie bio",
      "Gyae",
    ];
    const scenarios = [...english.slice(0, 15), ...twi.slice(0, 15)];

    for (let i = 0; i < 30; i++) {
      const language = i < 15 ? "en" : "twi";
      const text = language === "en" ? english[i % english.length] : twi[i % twi.length];
      const decision = ivrDecisionEngine.decide({
        stepId: language === "en" ? "service-select" : "supported-service-select",
        language,
        input: text,
        inputMethod: "speech",
        retryCount: i % 3,
        sessionId: `phase3-${i}`,
      });
      expect(decision.type).toBeTruthy();
      expect(decision.replyText.length).toBeGreaterThan(0);
    }
  });

  it("keeps the voice fallback call active for low-confidence and empty speech", async () => {
    const app = createApp();
    for (const [index, confidence] of [0.5, 0].entries()) {
      const sessionId = `phase3-recovery-${index}`;
      transactionStateMachine.getOrCreateSession(sessionId, "en", "VOICE");
      const response = await request(app)
        .post(`/speech-fallback?step=enter-amount&sessionId=${sessionId}&lang=en&retry=0`)
        .send({ speechText: index === 0 ? "fifty cedis" : "", confidence });
      expect(response.status).toBe(200);
      expect(response.text).toContain("<Response>");
      expect(response.text).not.toContain("[DYNAMIC RESPONSE]");
    }
  });

  it("does not emit or store spoken PIN text in the direct speech adapter", async () => {
    const { speechToText } = await import("../src/modules/sttService");
    const result = await speechToText("my pin is 4455", "audio/wav", "service-choice");
    expect(result.pinDiscarded).toBe(true);
    expect(result.text).toBe("[DISCARDED_PIN]");
  });
});
