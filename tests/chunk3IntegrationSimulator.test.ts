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
import { voiceRouter } from "../src/routes/voiceRoutes";
import { aiSystem } from "../src/ai_system";
import { momoRouter } from "../src/routes/momoRoutes";
import { durableTransactionStore } from "../src/services/durableTransactionStore";
import { durableIdempotencyLedger } from "../src/services/durableIdempotencyLedger";
import { setAllowUnapprovedTemplates } from "../src/ai_system/brain/replyTemplates";
import { setRequireApprovedNumbers } from "../src/ai_system/linguistic/twiNumberWords";
import { momoEngine } from "../src/integrations/momo";
import { paymentSaga } from "../src/integrations/momo/paymentSaga";
import { config } from "../src/config/env";
import { financialServices } from "../src/ai_system/services/financialServices";

const TEST_ADMIN_TOKEN = "chunk3-simulator-admin-token";

function postSimulatorTurn(app: express.Express, body: Record<string, unknown>) {
  return request(app)
    .post("/api/ai/simulator/turn")
    .set("Authorization", `Bearer ${TEST_ADMIN_TOKEN}`)
    .send(body);
}

function createIntegrationApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(aiRouter);
  app.use(voiceRouter);
  app.use(momoRouter);
  return app;
}

describe("Chunk 3: Simulator Integration & End-to-End Smoke Tests", () => {
  let app: express.Express;
  let originalAdminToken: string;

  beforeEach(() => {
    originalAdminToken = config.adminToken;
    config.adminToken = TEST_ADMIN_TOKEN;
    durableTransactionStore.clearAllForTesting();
    durableIdempotencyLedger.clearAllForTesting();
    setAllowUnapprovedTemplates(true);
    setRequireApprovedNumbers(false);
    app = createIntegrationApp();
  });

  afterEach(() => {
    config.adminToken = originalAdminToken;
    setAllowUnapprovedTemplates(false);
    setRequireApprovedNumbers(true);
    vi.restoreAllMocks();
  });

  it("uses equivalent canonical decisions for the same simulator and AT speech turn", async () => {
    const processSpy = vi.spyOn(aiSystem, "process");
    const utterance = "Send 50 cedis to 0553838464";

    const simulatorResponse = await postSimulatorTurn(app, {
        sessionId: "PARITY-SIMULATOR-001",
        channel: "SIMULATOR",
        input: utterance,
        language: "en",
        callerPhone: "0244123456",
      });
    const voiceResponse = await request(app)
      .post("/speech-fallback?step=service-select&sessionId=PARITY-VOICE-001&lang=en")
      .send({ speechText: utterance });

    expect(simulatorResponse.status).toBe(200);
    expect(voiceResponse.status).toBe(200);
    expect(processSpy).toHaveBeenCalledTimes(2);

    const simulatorDecision = await processSpy.mock.results[0].value;
    const voiceDecision = await processSpy.mock.results[1].value;
    const parityShape = (decision: Awaited<ReturnType<typeof aiSystem.process>>) => ({
      intent: decision.intent,
      amount: decision.entities.amount,
      recipientPhone: decision.entities.recipientPhone,
      targetStep: decision.navigation.targetStep,
      actionTool: decision.action.tool,
      actionRisk: decision.action.riskLevel,
      requiresConfirmation: decision.safety.requiresConfirmation,
      dialogueType: decision.dialogue.type,
      targetedSlot: decision.dialogue.targetedSlot,
    });

    expect(parityShape(simulatorDecision)).toEqual(parityShape(voiceDecision));
    expect(simulatorDecision.action.executedResult).toBeUndefined();
    expect(voiceDecision.action.executedResult).toBeUndefined();
    expect(processSpy.mock.calls[0][0]).toMatchObject({ channel: "SIMULATOR", executionPolicy: "UNDERSTAND_ONLY" });
    expect(processSpy.mock.calls[1][0]).toMatchObject({ channel: "VOICE", executionPolicy: "UNDERSTAND_ONLY" });
  });

  it("requires admin auth for simulator turns and never submits a transfer", async () => {
    const executeSaga = vi.spyOn(paymentSaga, "executeConfirmedTransferSaga");
    const requestToPay = vi.spyOn(momoEngine, "requestToPay");
    const transfer = vi.spyOn(momoEngine, "transfer");
    const processSpy = vi.spyOn(aiSystem, "process");

    const unauthorized = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId: "UNAUTH-SIMULATOR-TURN",
        input: "Yes",
        executionMode: "MTN_SANDBOX",
        callerPhone: "0244123456",
      });
    expect(unauthorized.status).toBe(401);
    expect(processSpy).not.toHaveBeenCalled();

    const sessionId = "SIMULATOR-NO-PAYMENT-001";
    const draftResponse = await postSimulatorTurn(app, {
      sessionId,
      input: "Send 25 cedis to 0553838464",
      language: "en",
      callerPhone: "0244123456",
      executionMode: "MTN_SANDBOX",
    });
    expect(draftResponse.status).toBe(200);

    const confirmation = await postSimulatorTurn(app, {
      sessionId,
      input: "Yes",
      language: "en",
      callerPhone: "0244123456",
      executionMode: "MTN_SANDBOX",
      draft: draftResponse.body.brain.updatedDraft,
    });
    expect(confirmation.status).toBe(200);
    expect(confirmation.body.brain.decision.kind).toBe("not_ready");
    expect(confirmation.body.saga).toBeNull();
    expect(executeSaga).not.toHaveBeenCalled();
    expect(requestToPay).not.toHaveBeenCalled();
    expect(transfer).not.toHaveBeenCalled();
    expect(processSpy.mock.calls.every(([input]) => input.executionPolicy === "UNDERSTAND_ONLY")).toBe(true);
  });

  it("forces public AI processing to understand-only despite a client execution policy", async () => {
    const executeTransfer = vi.spyOn(financialServices.transferService, "executeTransfer");
    const processSpy = vi.spyOn(aiSystem, "process");
    const sessionId = "PUBLIC-AI-UNDERSTAND-ONLY-001";
    const profile = { phoneNumber: "0244123456" };

    const draft = await request(app)
      .post("/api/ai/process")
      .send({
        sessionId,
        input: "Send 25 cedis to 0553838464",
        language: "en",
        userProfile: profile,
        executionPolicy: "NORMAL",
      });
    expect(draft.status).toBe(200);

    const confirmation = await request(app)
      .post("/api/ai/process")
      .send({
        sessionId,
        input: "Yes",
        language: "en",
        userProfile: profile,
        executionPolicy: "NORMAL",
      });
    expect(confirmation.status).toBe(200);
    expect(confirmation.body.result.action.tool).toBe("momo_execute_transfer");
    expect(confirmation.body.result.action.executedResult).toBeUndefined();
    expect(processSpy.mock.calls.every(([input]) => input.executionPolicy === "UNDERSTAND_ONLY")).toBe(true);
    expect(executeTransfer).not.toHaveBeenCalled();
  });

  it("keeps the handset brain endpoint as a canonical, understand-only adapter", async () => {
    const processSpy = vi.spyOn(aiSystem, "process");
    const sessionId = "BRAIN-ENDPOINT-CANONICAL-001";
    const startResponse = await request(app)
      .post("/api/ai/brain/process")
      .send({
        sessionId,
        callerNumber: "0244123456",
        language: "en",
        transcript: "Send 50 cedis to 0553838464",
      });

    expect(startResponse.status).toBe(200);
    expect(startResponse.body.brainOutput.decision.kind).toBe("confirm");

    const confirmationResponse = await request(app)
      .post("/api/ai/brain/process")
      .send({
        sessionId,
        callerNumber: "0244123456",
        language: "en",
        transcript: "Yes",
        draft: startResponse.body.brainOutput.updatedDraft,
      });

    expect(confirmationResponse.status).toBe(200);
    expect(confirmationResponse.body.brainOutput.decision.kind).toBe("dispatch");
    expect(processSpy).toHaveBeenCalledTimes(2);
    const engineResults = await Promise.all(processSpy.mock.results.map((call) => call.value));
    expect(engineResults.every((result) => result.action.executedResult === undefined)).toBe(true);
    expect(processSpy.mock.calls.every((call) => call[0].executionPolicy === "UNDERSTAND_ONLY")).toBe(true);
  });

  // ── 1. ENGLISH FULL FLOW VIA SIMULATOR ENDPOINT ───────────────────────────
  it("drives full English transfer flow through /api/ai/simulator/turn and verifies panel diagnostics", async () => {
    const sessionId = "SIM_INTEG_EN_01";

    // Turn 1: Caller states transfer intent
    const turn1Res = await postSimulatorTurn(app, {
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
    const turn2Res = await postSimulatorTurn(app, {
        sessionId,
        channel: "SIMULATOR",
        input: "Yes",
        language: "en",
        callerPhone: "0244123456",
        draft: turn1Res.body.brain.updatedDraft,
      });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.success).toBe(true);
    expect(turn2Res.body.brain.decision.kind).toBe("not_ready");
    expect(turn2Res.body.brain.reply.text).toContain("cannot submit transfers");

    // The simulator prepares and explains transfers, but never submits payment requests.
    const diag2 = turn2Res.body.turnDiagnostic;
    expect(diag2.sagaState).toBeNull();
    expect(turn2Res.body.saga).toBeNull();

    const repeatedConfirmation = await postSimulatorTurn(app, {
        sessionId,
        channel: "SIMULATOR",
        input: "Yes",
        language: "en",
        callerPhone: "0244123456",
        draft: turn1Res.body.brain.updatedDraft,
      });
    expect(repeatedConfirmation.status).toBe(200);
      expect(repeatedConfirmation.body.brain.decision.kind).toBe("not_ready");
      expect(repeatedConfirmation.body.saga).toBeNull();
  });

  // ── 2. ASANTE TWI FULL FLOW VIA SIMULATOR ENDPOINT ────────────────────────
  it("drives full Asante Twi transfer flow through /api/ai/simulator/turn and verifies panel diagnostics", async () => {
    const sessionId = "SIM_INTEG_TWI_01";

    // Turn 1: Caller speaks in Asante Twi
    const turn1Res = await postSimulatorTurn(app, {
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
    const turn2Res = await postSimulatorTurn(app, {
        sessionId,
        channel: "SIMULATOR",
        input: "Aane, pene so",
        language: "tw",
        callerPhone: "0244123456",
        draft: turn1Res.body.brain.updatedDraft,
      });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.brain.decision.kind).toBe("not_ready");
    expect(turn2Res.body.turnDiagnostic.sagaState).toBeNull();
  });

  // ── 3. CODE-SWITCHED SPEECH FLOW VIA SIMULATOR ENDPOINT ───────────────────
  it("drives full Ghanaian Code-Switched transfer flow through /api/ai/simulator/turn", async () => {
    const sessionId = "SIM_INTEG_MIXED_01";

    // Turn 1: Code-switched utterance
    const turn1Res = await postSimulatorTurn(app, {
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
    const turn2Res = await postSimulatorTurn(app, {
        sessionId,
        channel: "SIMULATOR",
        input: "Pene so",
        language: "tw",
        languageOverride: "mixed-twi-en",
        callerPhone: "0244123456",
        draft: turn1Res.body.brain.updatedDraft,
      });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.brain.decision.kind).toBe("not_ready");
  });

  // ── 4. MTN SANDBOX & MOCK PROVIDER CREDENTIAL CHECK ───────────────────────
  it("rejects unauthorized requests and disables direct saga execution even for admins", async () => {
    const originalAdminToken = config.adminToken;
    config.adminToken = "phase1-route-test-admin-token";
    const execute = vi.spyOn(paymentSaga, "executeConfirmedTransferSaga");
    const recordCollectionResult = vi.spyOn(paymentSaga, "recordCollectionResult");
    const transaction = {
      sessionId: "DIRECT-SAGA-BYPASS-TEST",
      senderPhone: "0244123456",
      recipientPhone: "0553838464",
      recipientName: "Ama",
      amount: 25,
      network: "MTN",
      confirmedDraftHash: "client-supplied-hash",
    };

    try {
      const unauthorized = await request(app)
        .post("/api/momo/saga/execute")
        .send(transaction);

      expect(unauthorized.status).toBe(401);
      expect(execute).not.toHaveBeenCalled();

      const authorized = await request(app)
        .post("/api/momo/saga/execute")
        .set("Authorization", `Bearer ${config.adminToken}`)
        .send(transaction);

      expect(authorized.status).toBe(410);
      expect(authorized.body.error).toBe("DIRECT_SAGA_EXECUTION_DISABLED");
      expect(authorized.body.traceId).toBeTruthy();
      expect(execute).not.toHaveBeenCalled();
      expect(durableTransactionStore.getAllSagas()).toHaveLength(0);

      const unauthorizedMockResolution = await request(app)
        .post("/api/momo/saga/resolve-mock")
        .send({ sagaId: transaction.sessionId, outcome: "SUCCESS" });
      expect(unauthorizedMockResolution.status).toBe(401);

      const mockResolution = await request(app)
        .post("/api/momo/saga/resolve-mock")
        .set("Authorization", `Bearer ${config.adminToken}`)
        .send({ sagaId: transaction.sessionId, outcome: "SUCCESS" });
      expect(mockResolution.status).toBe(410);
      expect(mockResolution.body.error).toBe("MOCK_SAGA_RESOLUTION_DISABLED");
      expect(recordCollectionResult).not.toHaveBeenCalled();

      const unauthorizedRead = await request(app)
        .get(`/api/momo/saga/${transaction.sessionId}`);
      expect(unauthorizedRead.status).toBe(401);

      const unauthorizedLatestRead = await request(app)
        .get("/api/momo/saga/latest")
        .query({ sessionId: transaction.sessionId });
      expect(unauthorizedLatestRead.status).toBe(401);
    } finally {
      config.adminToken = originalAdminToken;
    }
  });

  // ── 5. SMOKE TEST: CLICK START, ENTER DTMF, COMPLETE TRANSFER, VERIFY HUD ─
  it("smoke test: completes transfer via simulated DTMF digits and verifies all panel HUD stages", async () => {
    const sessionId = "SMOKE_TEST_SESSION_99";

    // 1. Inbound greeting
    const startRes = await postSimulatorTurn(app, {
        sessionId,
        channel: "SIMULATOR",
        input: "Hello",
        language: "en",
        callerPhone: "0244123456",
      });
    expect(startRes.status).toBe(200);

    // 2. DTMF recipient phone entry: "0553838464#"
    const recipientRes = await postSimulatorTurn(app, {
        sessionId,
        channel: "DTMF",
        input: "0553838464#",
        language: "en",
        callerPhone: "0244123456",
        draft: startRes.body.brain.updatedDraft,
      });
    expect(recipientRes.status).toBe(200);

    // 3. DTMF amount entry: "50#"
    const amountRes = await postSimulatorTurn(app, {
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
    const confirmRes = await postSimulatorTurn(app, {
        sessionId,
        channel: "DTMF",
        input: "1",
        language: "en",
        callerPhone: "0244123456",
        draft: amountRes.body.brain.updatedDraft,
      });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.brain.decision.kind).toBe("not_ready");

    // 5. Assert panel HUD diagnostic shows each required stage:
    const hud = confirmRes.body.turnDiagnostic;
    expect(hud).toBeDefined();
    expect(hud.asrTranscript).toBeDefined();
    expect(hud.language).toBeDefined();
    expect(hud.confidence).toBeGreaterThan(0);
    expect(hud.intent).toBe("momo.transfer");
    expect(hud.decisionKind).toBe("not_ready");
    expect(hud.replyText).toBeDefined();
    expect(hud.audioSource).toBeDefined();
    expect(hud.latency).toBeDefined();
    expect(hud.latency.totalMs).toBeGreaterThan(0);
    expect(hud.brainMode).toBeDefined();
    expect(hud.modelStatus).toBeDefined();
    expect(hud.sagaState).toBeNull();
  });
});
