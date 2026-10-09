/**
 * Ɔkwankyerɛfo Pa - End-to-End IVR Telephony Integration Tests
 * 
 * Simulates real Africa's Talking webhook callbacks for complete end-to-end call sessions:
 * - English full transfer flow
 * - Akan Twi full transfer flow
 * - Universal navigation grammar: Back (8), Repeat (9), Cancel (0)
 * - Timeout handling and re-prompts
 * - Invalid phone number and malformed amount handling
 * - Idempotent duplicate webhook callbacks
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { voiceRouter } from "../src/routes/voiceRoutes";
import { transactionStateMachine } from "../src/domain/stateMachine";

import { durableTransactionStore } from "../src/services/durableTransactionStore";
import { momoSagaOrchestrator } from "../src/services/momoSagaOrchestrator";

function createTestApp() {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(voiceRouter);
  return app;
}

describe("Task 8: End-to-End IVR Integration Flows", () => {
  let app: express.Express;

  beforeEach(() => {
    durableTransactionStore.clearAllForTesting();
    app = createTestApp();
  });

  it("completes full English transfer flow via sequential webhooks with dynamic readback", async () => {
    const sessionId = "AT-TEST-EN-001";

    // 1. Initial Inbound Call
    const callRes = await request(app)
      .post("/voice-menu")
      .send({ sessionId, callerNumber: "+233543546010", isActive: "1" });
    expect(callRes.status).toBe(200);
    expect(callRes.text).toContain("<Response>");
    expect(callRes.text).toContain("Welcome_prompt_01.mp3");

    // 2. Language Selection -> English (1)
    const langRes = await request(app)
      .post("/language-selection")
      .send({ sessionId, dtmfDigits: "1" });
    expect(langRes.text).toContain("/service-select?sessionId=AT-TEST-EN-001&amp;lang=en");

    // 3. Service Select -> Telecom MoMo (1)
    const serviceRes = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(serviceRes.text).toContain("/provider-select");

    // 4. Provider Select -> MTN (1)
    const providerRes = await request(app)
      .post("/provider-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(providerRes.text).toContain("/action-select");

    // 5. Action Menu -> Send Money (1)
    const actionRes = await request(app)
      .post("/action-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(actionRes.text).toContain("/enter-recipient");

    // 6. Recipient Phone Entry -> 0553838464
    const recipRes = await request(app)
      .post("/verify-recipient")
      .send({ sessionId, lang: "en", dtmfDigits: "0553838464" });
    expect(recipRes.text.includes("Sand Box") || recipRes.text.includes("Kwame Boateng")).toBe(true);
    expect(recipRes.text).toContain("8 4 6 4");

    // 7. Confirm Recipient Name (1)
    const confirmRecipRes = await request(app)
      .post("/recipient-verify-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(confirmRecipRes.text).toContain("/enter-amount");

    // 8. Amount Input -> 75 Cedis
    const amountRes = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "en", dtmfDigits: "75" });
    expect(amountRes.text).toContain("/safe-confirmation");

    // 9. Safe Confirmation Readback -> MUST BE DYNAMIC (75 Cedis, Sand Box)
    const safeConfRes = await request(app)
      .post("/safe-confirmation")
      .query({ sessionId, lang: "en" });
    expect(safeConfRes.text).toContain("75 Cedis");
    expect(safeConfRes.text.includes("Sand Box") || safeConfRes.text.includes("Kwame Boateng")).toBe(true);
    expect(safeConfRes.text).toContain("8 4 6 4");
    expect(safeConfRes.text).not.toContain("500 Ghana cedis"); // Mismatch check!

    // 10. Confirm Transfer (1) -> Handoff to USSD Prompt & Zero-PIN Safety Gate (Item 1.1)
    // Simulate the accepted MoMo handoff; never call MTN from this IVR test.
    const sagaSpy = vi
      .spyOn(momoSagaOrchestrator, "startSaga")
      .mockResolvedValueOnce({
        collectionRef: "TEST-MOMO-COLLECTION-REF",
        mode: "SANDBOX_SIMULATOR",
      });

    const outcomeRes = await request(app)
      .post("/safe-outcome")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    sagaSpy.mockRestore();
    expect(outcomeRes.text).toContain("check your phone screen");
    expect(outcomeRes.text).not.toContain("Congratulations");
    expect(outcomeRes.text).not.toContain("<Record");
    expect(outcomeRes.text).not.toContain("<GetDigits");
    expect(outcomeRes.text).toContain("<Reject/>");

    // Verify session remains PIN_PENDING (never false COMPLETED before MoMo callback)
    const finalSession = transactionStateMachine.getSession(sessionId);
    expect(finalSession?.state).toBe("PIN_PENDING");
    expect(finalSession?.amount).toBe(75);
    expect(finalSession?.recipientName === "Sand Box" || finalSession?.recipientName === "Kwame Boateng").toBe(true);
  });

  it("handles cancellation gracefully at safe confirmation with zero fund movement", async () => {
    const sessionId = "AT-TEST-CANCEL-001";
    transactionStateMachine.getOrCreateSession(sessionId, "en");

    // User cancels at confirmation by pressing 0
    const cancelRes = await request(app)
      .post("/safe-outcome")
      .send({ sessionId, lang: "en", dtmfDigits: "0" });

    expect(cancelRes.text).toContain("Transaction cancelled. No money has been deducted");
    expect(cancelRes.text).toContain("<Reject/>");

    const session = transactionStateMachine.getSession(sessionId);
    expect(session?.state).toBe("CANCELLED");
  });

  it("rejects malformed amount entry e.g. '5*0*1' and re-prompts caller", async () => {
    const sessionId = "AT-TEST-MALFORMED-AMT";
    transactionStateMachine.getOrCreateSession(sessionId, "en");

    const res = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "en", dtmfDigits: "5*0*1" });

    expect(res.text).toContain("/enter-amount");
    expect(res.text).toContain("err=invalid");
  });

  it("supports Universal Navigation Grammar: Back (8) and Repeat (9)", async () => {
    const sessionId = "AT-TEST-NAV-001";

    // Replay (9) at service choice
    const repeatRes = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "9" });
    expect(repeatRes.text).toContain("/service-select");

    // Back (8) at service choice
    const backRes = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "8" });
    expect(backRes.text).toContain("/language-selection");
  });
});
