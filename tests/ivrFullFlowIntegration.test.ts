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
    const outcomeRes = await request(app)
      .post("/safe-outcome")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
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

  it("keeps Africa's Talking webhook authentication through callback and redirect steps", async () => {
    const originalSecret = process.env.AT_WEBHOOK_SECRET;
    const secret = "test-telephony-webhook-secret";
    process.env.AT_WEBHOOK_SECRET = secret;

    try {
      const sessionId = "AT-TEST-SECRET-001";
      const callRes = await request(app)
        .post("/voice-menu")
        .query({ secret })
        .send({ sessionId, callerNumber: "+233543546010", isActive: "1" });
      expect(callRes.status).toBe(200);
      expect(callRes.text).toMatch(
        new RegExp(`callbackUrl="https?:\\/\\/[^"]+\\/language-selection\\?sessionId=${sessionId}&amp;secret=${secret}"`)
      );

      const languageRes = await request(app)
        .post("/language-selection")
        .query({ sessionId, secret })
        .send({ dtmfDigits: "1" });
      expect(languageRes.status).toBe(200);
      expect(languageRes.text).toContain(`/service-select?sessionId=${sessionId}&amp;lang=en&amp;secret=${secret}`);

      const serviceMenuRes = await request(app)
        .get("/service-select")
        .query({ sessionId, lang: "en", secret });
      expect(serviceMenuRes.status).toBe(200);
      expect(serviceMenuRes.text).toContain('<Say voice="woman">');
      expect(serviceMenuRes.text).toContain(`callbackUrl="http://`);
      expect(serviceMenuRes.text).toContain(`secret=${secret}`);

      const missingSecretRes = await request(app)
        .post("/language-selection")
        .query({ sessionId })
        .send({ dtmfDigits: "1" });
      expect(missingSecretRes.status).toBe(401);
    } finally {
      if (originalSecret === undefined) {
        delete process.env.AT_WEBHOOK_SECRET;
      } else {
        process.env.AT_WEBHOOK_SECRET = originalSecret;
      }
    }
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

  it("routes the revised English service choices through distinct Mobile Money and direct-transfer paths", async () => {
    const sessionId = "AT-TEST-DIRECT-TRANSFER-001";

    const menuRes = await request(app)
      .post("/service-select")
      .query({ sessionId, lang: "en" });
    expect(menuRes.text).toContain("For Mobile Money services, press 1.");
    expect(menuRes.text).toContain("To transfer money to another mobile wallet, press 2.");
    expect(menuRes.text).toContain("For banking and international services, press 3.");

    const directChoice = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "2" });
    expect(directChoice.text).toContain("/provider-select");
    expect(directChoice.text).toContain("directTransfer=1");

    const providerMenu = await request(app)
      .post("/provider-select")
      .query({ sessionId, lang: "en", directTransfer: "1" });
    expect(providerMenu.text).toContain("/provider-choice?");
    expect(providerMenu.text).toContain("directTransfer=1");

    const invalidNetworkChoice = await request(app)
      .post("/provider-choice")
      .query({ sessionId, lang: "en", directTransfer: "1" })
      .send({ dtmfDigits: "5" });
    expect(invalidNetworkChoice.text).toContain("/provider-choice?");
    expect(invalidNetworkChoice.text).toContain("directTransfer=1");

    const directProviderChoice = await request(app)
      .post("/provider-choice")
      .query({ sessionId, lang: "en", directTransfer: "1" })
      .send({ dtmfDigits: "1" });
    expect(directProviderChoice.text).toContain("/enter-recipient");
    expect(directProviderChoice.text).not.toContain("/action-select");

    const unavailableChoice = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "3" });
    expect(unavailableChoice.text).toContain("This service is not available yet.");
    expect(unavailableChoice.text).toContain("/service-choice?");

    const mobileMoneyChoice = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(mobileMoneyChoice.text).toContain("/provider-select");
    expect(mobileMoneyChoice.text).not.toContain("directTransfer=1");
  });

  it("executes the exact 7-step canonical MoMo voice flow (Ama Mensah, 500 GHS, Zero-PIN handoff, receipt)", async () => {
    const sessionId = "MOMO-CANONICAL-7STEP";

    // Step 1: Welcome & Language Selection
    const welcomeRes = await request(app)
      .post("/voice-menu")
      .send({ sessionId, callerNumber: "+233543546010", isActive: "1" });
    expect(welcomeRes.status).toBe(200);
    expect(welcomeRes.text).toContain("Welcome_prompt_01.mp3");

    // User selects English (1)
    const langRes = await request(app)
      .post("/language-selection")
      .send({ sessionId, dtmfDigits: "1" });
    expect(langRes.text).toContain("lang=en");
    const session = transactionStateMachine.getSession(sessionId);
    expect(session?.language).toBe("en");

    // Step 2: Service Selection (MoMo Transfer)
    const serviceRes = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(serviceRes.text).toContain("/provider-select");

    const providerRes = await request(app)
      .post("/provider-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(providerRes.text).toContain("/action-select");

    const actionRes = await request(app)
      .post("/action-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(actionRes.text).toContain("/enter-recipient");

    // Step 3: Recipient Phone Entry (0241234567) -> KYC Lookup resolves "Ama Mensah"
    const recipRes = await request(app)
      .post("/verify-recipient")
      .send({ sessionId, lang: "en", dtmfDigits: "0241234567#" });
    expect(recipRes.text).toContain("Ama Mensah");
    expect(recipRes.text).toContain("4 5 6 7");

    // User confirms recipient Ama Mensah (1) -> proceed to amount
    const confirmRecipRes = await request(app)
      .post("/recipient-verify-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(confirmRecipRes.text).toContain("/enter-amount");

    // Step 4: Amount Entry (500 GHS)
    const amountRes = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "en", dtmfDigits: "500#" });
    expect(amountRes.text).toContain("/safe-confirmation");

    // Step 5: Safe Confirmation (Dynamic Readback)
    const safeConfRes = await request(app)
      .post("/safe-confirmation")
      .query({ sessionId, lang: "en" });
    expect(safeConfRes.text).toContain("500");
    expect(safeConfRes.text).toContain("Ama Mensah");

    // Step 6: PIN Handoff (Zero-PIN Security)
    const handoffRes = await request(app)
      .post("/safe-outcome")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(handoffRes.text).toContain("check your phone screen");
    expect(handoffRes.text).toContain("<Reject/>"); // stops listening to speech; no PIN over audio!

    const stateAfterHandoff = transactionStateMachine.getSession(sessionId);
    expect(stateAfterHandoff?.state).toBe("PIN_PENDING");
    expect(stateAfterHandoff?.amount).toBe(500);
    expect(stateAfterHandoff?.recipientName).toBe("Ama Mensah");

    // Step 7: Receipt & Exit (MoMo Out-of-band completion)
    const completedSession = transactionStateMachine.transition(sessionId, "COMPLETED");
    expect(completedSession.state).toBe("COMPLETED");
    expect(completedSession.referenceId).toMatch(/^OKP-\d+$/);
    expect(completedSession.amount).toBe(500);
    expect(completedSession.recipientName).toBe("Ama Mensah");
  });
});
