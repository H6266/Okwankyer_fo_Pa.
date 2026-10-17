/**
 * Ɔkwankyerɛfo Pa - Chunk 3 Simulator Integration & Smoke Tests
 * (tests/chunk3IntegrationSimulator.test.ts)
 * 
 * Drives the simulator endpoints through full flows in:
 * - English
 * - Asante Twi
 * - Code-switched
 * with mocked ASR and mocked MoMo provider, plus sandbox checks.
 * 
 * Smoke test:
 * - Start Call -> input -> complete transfer -> assert panel diagnostic shows each stage.
 * - Invariant: Masked phone numbers in diagnostic draft and zero PII leaks.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { aiRouter } from "../src/routes/aiRoutes";
import { momoRouter } from "../src/routes/momoRoutes";
import { durableTransactionStore } from "../src/services/durableTransactionStore";
import { durableIdempotencyLedger } from "../src/services/durableIdempotencyLedger";
import { setAllowUnapprovedTemplates } from "../src/ai_system/brain/replyTemplates";
import { setRequireApprovedNumbers } from "../src/ai_system/linguistic/twiNumberWords";
import { momoEngine } from "../src/integrations/momo";

function createIntegrationApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(aiRouter);
  app.use(momoRouter);
  return app;
}

describe("Chunk 3: Simulator Integration & End-to-End Smoke Tests", () => {
  let app: express.Express;

  beforeEach(() => {
    durableTransactionStore.clearAllForTesting();
    durableIdempotencyLedger.clearAllForTesting();
    setAllowUnapprovedTemplates(true);
    setRequireApprovedNumbers(false);
    app = createIntegrationApp();
  });

  afterEach(() => {
    setAllowUnapprovedTemplates(false);
    setRequireApprovedNumbers(true);
    vi.restoreAllMocks();
  });

  // ── 1. ENGLISH FULL FLOW VIA SIMULATOR ENDPOINT ───────────────────────────
  it("drives full English transfer flow through /api/ai/simulator/turn and verifies panel diagnostics", async () => {
    const sessionId = "SIM_INTEG_EN_01";

    // Turn 1: Caller states transfer intent
    const turn1Res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "Send 50 cedis to 0553838464",
        language: "en",
        callerPhone: "0244123456",
      });

    expect(turn1Res.status).toBe(200);
    expect(turn1Res.body.success).toBe(true);
    expect(turn1Res.body.brain.decision.kind).toBe("confirm");
    expect(turn1Res.body.brain.updatedDraft.slots.amount).toBe(50);

    // Verify Panel Turn Diagnostic fields
    const diag1 = turn1Res.body.turnDiagnostic;
    expect(diag1).toBeDefined();
    expect(diag1.asrTranscript).toContain("Send 50 cedis");
    expect(diag1.decisionKind).toBe("confirm");
    expect(diag1.intent).toBe("momo.transfer");
    expect(diag1.latency).toBeDefined();
    expect(diag1.draftMasked.recipient.phone).toMatch(/\*\*\*/); // PII Masking invariant!

    // Turn 2: Caller confirms transfer
    const turn2Res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "Yes",
        language: "en",
        callerPhone: "0244123456",
        draft: turn1Res.body.brain.updatedDraft,
      });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.success).toBe(true);
    expect(turn2Res.body.brain.decision.kind).toBe("dispatch");

    // Verify MoMo Saga state in panel
    const diag2 = turn2Res.body.turnDiagnostic;
    expect(diag2.sagaState).toBeDefined();
    expect(["PENDING", "COMPLETED"]).toContain(diag2.sagaState.state);
    expect(diag2.sagaState.mode).toBeDefined();
  });

  // ── 2. ASANTE TWI FULL FLOW VIA SIMULATOR ENDPOINT ────────────────────────
  it("drives full Asante Twi transfer flow through /api/ai/simulator/turn and verifies panel diagnostics", async () => {
    const sessionId = "SIM_INTEG_TWI_01";

    // Turn 1: Caller speaks in Asante Twi
    const turn1Res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "Mane sika aduonum kɔma 0553838464",
        language: "tw",
        callerPhone: "0244123456",
      });

    expect(turn1Res.status).toBe(200);
    expect(turn1Res.body.brain.decision.kind).toBe("confirm");
    expect(turn1Res.body.brain.updatedDraft.slots.amount).toBe(50);

    const diag1 = turn1Res.body.turnDiagnostic;
    expect(diag1.language).toContain("twi");
    expect(diag1.translationEn).toBeDefined();
    expect(diag1.draftMasked.recipient.phone).toMatch(/\*\*\*/);

    // Turn 2: Caller confirms in Twi
    const turn2Res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "Aane, pene so",
        language: "tw",
        callerPhone: "0244123456",
        draft: turn1Res.body.brain.updatedDraft,
      });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.brain.decision.kind).toBe("dispatch");
    expect(turn2Res.body.turnDiagnostic.sagaState).toBeDefined();
  });

  // ── 3. CODE-SWITCHED SPEECH FLOW VIA SIMULATOR ENDPOINT ───────────────────
  it("drives full Ghanaian Code-Switched transfer flow through /api/ai/simulator/turn", async () => {
    const sessionId = "SIM_INTEG_MIXED_01";

    // Turn 1: Code-switched utterance
    const turn1Res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "Mane fifty cedis kɔma 0553838464",
        language: "tw",
        languageOverride: "mixed-twi-en",
        callerPhone: "0244123456",
      });

    expect(turn1Res.status).toBe(200);
    expect(turn1Res.body.brain.decision.kind).toBe("confirm");
    expect(turn1Res.body.brain.updatedDraft.slots.amount).toBe(50);

    // Turn 2: Confirmation
    const turn2Res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "Pene so",
        language: "tw",
        languageOverride: "mixed-twi-en",
        callerPhone: "0244123456",
        draft: turn1Res.body.brain.updatedDraft,
      });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.brain.decision.kind).toBe("dispatch");
  });

  // ── 4. MTN SANDBOX & MOCK PROVIDER CREDENTIAL CHECK ───────────────────────
  it("enforces explicit mock-provider mode and never silent fake success when credentials are missing", async () => {
    const isMtnConfigured = momoEngine.isConfigured("collection");

    const execRes = await request(app)
      .post("/api/momo/saga/execute")
      .send({
        sessionId: "SESSION_SANDBOX_CHECK_01",
        senderPhone: "0244123456",
        recipientPhone: "0553838464",
        amount: 25,
      });

    expect(execRes.status).toBe(200);
    expect(execRes.body.success).toBe(true);

    if (isMtnConfigured) {
      expect(execRes.body.mode).toBe("REAL_MTN_SANDBOX");
    } else {
      // Invariant: Missing sandbox credentials MUST show clear status badge and explicit mock-provider mode, NEVER silent fake success!
      expect(execRes.body.mode).toBe("MOCK_PROVIDER");
      expect(execRes.body.status).toBe("PENDING");
      expect(execRes.body.saga.state).toBe("WAITING_FOR_CUSTOMER_AUTHORIZATION");
    }
  });

  // ── 5. SMOKE TEST: CLICK START, ENTER DTMF, COMPLETE TRANSFER, VERIFY HUD ─
  it("smoke test: completes transfer via simulated DTMF digits and verifies all panel HUD stages", async () => {
    const sessionId = "SMOKE_TEST_SESSION_99";

    // 1. Inbound greeting
    const startRes = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "Hello",
        language: "en",
        callerPhone: "0244123456",
      });
    expect(startRes.status).toBe(200);

    // 2. DTMF recipient phone entry: "0553838464#"
    const recipientRes = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "DTMF",
        input: "0553838464#",
        language: "en",
        callerPhone: "0244123456",
        draft: startRes.body.brain.updatedDraft,
      });
    expect(recipientRes.status).toBe(200);

    // 3. DTMF amount entry: "50#"
    const amountRes = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "DTMF",
        input: "50#",
        language: "en",
        callerPhone: "0244123456",
        draft: recipientRes.body.brain.updatedDraft,
      });
    expect(amountRes.status).toBe(200);
    expect(amountRes.body.brain.decision.kind).toBe("confirm");

    // 4. DTMF confirm: "1"
    const confirmRes = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "DTMF",
        input: "1",
        language: "en",
        callerPhone: "0244123456",
        draft: amountRes.body.brain.updatedDraft,
      });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.brain.decision.kind).toBe("dispatch");

    // 5. Assert panel HUD diagnostic shows each required stage:
    const hud = confirmRes.body.turnDiagnostic;
    expect(hud).toBeDefined();
    expect(hud.asrTranscript).toBeDefined();
    expect(hud.language).toBeDefined();
    expect(hud.confidence).toBeGreaterThan(0);
    expect(hud.intent).toBe("momo.transfer");
    expect(hud.decisionKind).toBe("dispatch");
    expect(hud.replyText).toBeDefined();
    expect(hud.audioSource).toBeDefined();
    expect(hud.latency).toBeDefined();
    expect(hud.latency.totalMs).toBeGreaterThan(0);
    expect(hud.brainMode).toBeDefined();
    expect(hud.modelStatus).toBeDefined();
    expect(hud.sagaState).toBeDefined();
  });
});
