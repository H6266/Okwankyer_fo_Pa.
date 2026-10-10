import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { aiRouter } from "../src/routes/aiRoutes";
import { momoRouter } from "../src/routes/momoRoutes";
import { durableTransactionStore } from "../src/services/durableTransactionStore";
import { durableIdempotencyLedger } from "../src/services/durableIdempotencyLedger";
import { setAllowUnapprovedTemplates } from "../src/ai_system/brain/replyTemplates";
import { setRequireApprovedNumbers } from "../src/ai_system/linguistic/twiNumberWords";
import { paymentSaga } from "../src/integrations/momo/paymentSaga";

function createIntegrationApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(aiRouter);
  app.use(momoRouter);
  return app;
}

describe("Simulator Flow & Trace Integration Tests", () => {
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

  it("turn 'send money to 0553838464 500 cedi' ends with confirmation naming looked-up recipient, PLAN=verify_recipient in trace, and no payment initiated", async () => {
    const sessionId = `sim_flow_test_${Date.now()}`;
    const executeTransferSpy = vi.spyOn(paymentSaga, "executeConfirmedTransferSaga");

    const res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "send money to 0553838464 500 cedi",
        language: "en",
        callerPhone: "0244123456",
        currentStep: "welcome",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // 1. Reply names the looked-up recipient ("Kwame Boateng") and amount 500
    const replyText = res.body.result?.dialogue?.response || res.body.processResult?.replyText;
    expect(replyText).toContain("Kwame Boateng");
    expect(replyText).toContain("500");
    expect(replyText.toLowerCase()).toContain("sure you want to send");

    // 2. Trace contains PLAN = verify_recipient and an AUDIO_RESOLVE entry
    const trace = res.body.trace as Array<{ category: string; message: string }>;
    expect(trace).toBeDefined();
    expect(Array.isArray(trace)).toBe(true);

    const planItem = trace.find((t) => t.category === "PLAN");
    expect(planItem).toBeDefined();
    expect(planItem?.message).toContain("verify_recipient");

    const audioResolveItem = trace.find((t) => t.category === "AUDIO_RESOLVE");
    expect(audioResolveItem).toBeDefined();

    // 3. No payment initiated yet (zero-PIN confirmation invariant)
    expect(executeTransferSpy).not.toHaveBeenCalled();
    const activeSaga = paymentSaga.getLatestSagaForSession(sessionId);
    expect(!activeSaga || activeSaga.state === "DRAFT" || activeSaga.state === "RECIPIENT_VERIFIED").toBe(true);
  });

  it("'no' at confirmation abandons safely", async () => {
    const sessionId = `sim_abandon_test_${Date.now()}`;

    // Step 1: establish draft with recipient and amount
    const turn1Res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "send money to 0553838464 500 cedi",
        language: "en",
        currentStep: "welcome",
      });

    expect(turn1Res.status).toBe(200);

    // Step 2: caller says 'no'
    const turn2Res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "no",
        language: "en",
        currentStep: "safe-confirmation",
        draft: turn1Res.body.brain?.updatedDraft,
      });

    expect(turn2Res.status).toBe(200);
    expect(turn2Res.body.success).toBe(true);

    // Assert flow planner cancelled/abandoned
    const plan = turn2Res.body.plan;
    expect(plan.process === "cancel" || plan.reason.includes("decline") || plan.reason.includes("cancel")).toBe(true);

    // Verify response indicates cancellation
    const replyText = turn2Res.body.result?.dialogue?.response || turn2Res.body.processResult?.replyText;
    expect(replyText.toLowerCase()).toMatch(/cancel|abandon|thank you|goodbye/i);
  });

  it("missing amount asks only for the amount", async () => {
    const sessionId = `sim_missing_amt_${Date.now()}`;

    const res = await request(app)
      .post("/api/ai/simulator/turn")
      .send({
        sessionId,
        channel: "SIMULATOR",
        input: "send money to 0553838464",
        language: "en",
        currentStep: "welcome",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const plan = res.body.plan;
    expect(plan.process).toBe("collect_slot");
    expect(plan.targetSlot).toBe("amount");
    expect(plan.missingSlots).toEqual(["amount"]);

    const replyText = res.body.result?.dialogue?.response || res.body.processResult?.replyText;
    expect(replyText.toLowerCase()).toContain("amount");
  });
});
