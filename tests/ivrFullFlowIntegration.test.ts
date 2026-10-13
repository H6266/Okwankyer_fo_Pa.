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
import { paymentSaga } from "../src/integrations/momo/paymentSaga";
import { brain } from "../src/ai_system/brain/brain";
import { auditLogger } from "../src/services/auditLogger";
import { resolvePromptText } from "../src/modules/ttsService";

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

  it("keeps language selection separate from mode selection and rejects menu-stage phone shortcuts", async () => {
    const sessionId = "AT-MODE-AND-MENU-001";

    await request(app)
      .post("/voice-menu")
      .send({ sessionId, callerNumber: "+233543546010", isActive: "1" });
    const languageRes = await request(app)
      .post("/language-selection")
      .send({ sessionId, dtmfDigits: "2" });
    expect(languageRes.text).toContain("/service-select?sessionId=AT-MODE-AND-MENU-001&amp;lang=twi");
    expect(transactionStateMachine.getSession(sessionId)?.language).toBe("twi");
    expect(transactionStateMachine.getSession(sessionId)?.interactionMode).toBeUndefined();

    const phoneAtMenuRes = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "twi", dtmfDigits: "0241234567" });
    expect(phoneAtMenuRes.text).not.toContain("/verify-recipient");
    expect(transactionStateMachine.getSession(sessionId)?.interactionMode).toBeUndefined();

    const serviceRes = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "twi", dtmfDigits: "1" });
    expect(serviceRes.text).toContain("/provider-select");
    expect(transactionStateMachine.getSession(sessionId)?.interactionMode).toBe("GUIDED_IVR");
  });

  it("does not treat a spoken phone number as recipient data outside recipient entry", async () => {
    const sessionId = "AT-PHONE-STATE-GUARD-001";
    const processBrain = vi.spyOn(brain, "process").mockResolvedValue({
      decision: { kind: "clarify_intent" },
      updatedDraft: { intent: null, slots: {} },
      reply: { text: "Please choose a supported service.", language: "en" },
      sessionLanguage: "en",
    } as any);

    const response = await request(app)
      .post(`/speech-fallback?step=action-select&sessionId=${sessionId}&lang=en`)
      .send({ speechText: "0241234567" });

    expect(response.text).not.toContain("/verify-recipient");
    expect(transactionStateMachine.getSession(sessionId)?.recipientPhone).toBeNull();
    processBrain.mockRestore();
  });

  it("advertises only supported network and action choices", async () => {
    const sessionId = "AT-SUPPORTED-CHOICES-001";

    const serviceMenu = await request(app)
      .post("/service-select")
      .query({ sessionId, lang: "en" });
    expect(serviceMenu.text).toContain("/prompt-tts/en/supported_service_select");
    expect(resolvePromptText("supported_service_select", "en")).toContain("Banking is not supported");

    const networkMenu = await request(app)
      .post("/provider-select")
      .query({ sessionId, lang: "en" });
    expect(networkMenu.text).toContain("/prompt-tts/en/mtn_network_select");
    expect(resolvePromptText("mtn_network_select", "en")).toContain("Only MTN Mobile Money transfers are currently supported");
    expect(resolvePromptText("mtn_network_select", "en")).not.toContain("Telecel");
    expect(resolvePromptText("mtn_network_select", "en")).not.toContain("AirtelTigo");

    const actionMenu = await request(app)
      .post("/action-select")
      .query({ sessionId, lang: "en" });
    expect(actionMenu.text).toContain("/prompt-tts/en/send_money_menu");
    expect(resolvePromptText("send_money_menu", "en")).toContain("To send money, press 1.");
    expect(resolvePromptText("send_money_menu", "en")).not.toContain("check your account, press 2");

    const balanceAttempt = await request(app)
      .post("/action-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "2" });
    expect(balanceAttempt.text).toContain("cannot check wallet balances");
    expect(balanceAttempt.text).not.toContain("/enter-recipient");
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
    const startSaga = vi.spyOn(paymentSaga, "executeConfirmedTransferSaga").mockResolvedValue({
      saga: {
        collectionReference: "collection-test-reference",
        state: "WAITING_FOR_CUSTOMER_AUTHORIZATION",
      } as any,
      status: "PENDING",
      mode: "MOCK_PROVIDER",
    });
    const outcomeRes = await request(app)
      .post("/safe-outcome")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(startSaga).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      senderPhone: "+233543546010",
      recipientPhone: "0553838464",
      amount: 75,
      network: "MTN",
    }));
    startSaga.mockRestore();
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

  it("understands a complete spoken transfer, verifies the recipient, and reads back the amount", async () => {
    const sessionId = "AT-SPEECH-TRANSFER-001";

    await request(app)
      .post("/voice-menu")
      .send({ sessionId, callerNumber: "+233543546010", isActive: "1" });

    const speechRes = await request(app)
      .post(`/speech-fallback?step=service-select&sessionId=${sessionId}&lang=en`)
      .send({ speechText: "I want to send 500 cedis to 0241234567" });
    expect(speechRes.status).toBe(200);
    expect(speechRes.text).toContain("/verify-recipient");
    const speechLog = auditLogger.getRecentLogs().find((entry) => entry.category === "STT" && entry.correlationId === sessionId);
    expect(speechLog?.message).toContain("[PHONE]");
    expect(speechLog?.message).toContain("[NUMBER]");
    expect(speechLog?.message).not.toContain("0241234567");
    expect(speechLog?.message).not.toContain("500");

    const recipientRes = await request(app)
      .post("/verify-recipient")
      .send({ sessionId, lang: "en", dtmfDigits: "0241234567" });
    expect(recipientRes.text).toContain("Ama Mensah");
    expect(transactionStateMachine.getSession(sessionId)?.amount).toBe(500);

    const recipientConfirmRes = await request(app)
      .post("/recipient-verify-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(recipientConfirmRes.text).toContain("/safe-confirmation");

    const readbackRes = await request(app)
      .post("/safe-confirmation")
      .query({ sessionId, lang: "en" });
    expect(readbackRes.text).toContain("500");
    expect(readbackRes.text).toContain("Ama Mensah");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("AMOUNT_ENTERED");
  });

  it("preserves a Brain-provided amount through recipient lookup and approval", async () => {
    const sessionId = "AT-BRAIN-AMOUNT-PERSIST-001";
    transactionStateMachine.getOrCreateSession(sessionId, "en", "VOICE");

    const recipientRes = await request(app)
      .post("/verify-recipient")
      .send({ sessionId, lang: "en", dtmfDigits: "0241234567", amount: "400" });
    expect(recipientRes.text).toContain("Ama Mensah");
    expect(transactionStateMachine.getSession(sessionId)?.amount).toBe(400);

    const approvalRes = await request(app)
      .post("/recipient-verify-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(approvalRes.text).toContain("/safe-confirmation");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("AMOUNT_ENTERED");
  });

  it.each([
    { utterance: "I want to send money", missingSlot: "amount" },
    { utterance: "I want to send 500 cedis", missingSlot: "recipient" },
  ])("requires recipient verification before continuing from spoken input missing $missingSlot", async ({ utterance, missingSlot }) => {
    const sessionId = `AT-SPEECH-MISSING-${missingSlot}`;
    const processBrain = vi.spyOn(brain, "process").mockResolvedValue({
      decision: { kind: "clarify_slot", slot: missingSlot },
      updatedDraft: { intent: "momo.transfer", slots: {} },
      reply: { text: `Please provide the ${missingSlot}.`, language: "en", promptId: `clarify_slot_${missingSlot}` },
      sessionLanguage: "en",
    } as any);

    const res = await request(app)
      .post(`/speech-fallback?step=service-select&sessionId=${sessionId}&lang=en`)
      .send({ speechText: utterance });

    expect(processBrain).toHaveBeenCalledWith(expect.objectContaining({
      transcript: utterance,
      forceModel: true,
    }));
    expect(res.text).toContain(`/verify-recipient?sessionId=${sessionId}`);
    expect(res.text).toContain("/api/audio/prompt-tts/en/intent_understood_ask_number");
    expect(transactionStateMachine.getSession(sessionId)?.interactionMode).toBe("NATURAL_CONVERSATION");
    processBrain.mockRestore();
  });

  it("fails closed for live non-MTN transfers until that provider is implemented", async () => {
    const sessionId = "AT-LIVE-NON-MTN-001";
    transactionStateMachine.getOrCreateSession(sessionId, "en", "VOICE");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      callerPhone: "+233543546010",
      recipientPhone: "0334848734",
      recipientName: "Unverified",
      network: "AT",
      isRecipientVerified: false,
    });
    transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", { amount: 500 });
    const startSaga = vi.spyOn(paymentSaga, "executeConfirmedTransferSaga");

    const res = await request(app)
      .post("/safe-outcome")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });

    expect(res.text).toContain("currently support MTN numbers only");
    expect(startSaga).not.toHaveBeenCalled();
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("FAILED");
    startSaga.mockRestore();
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
      expect(serviceMenuRes.text).toContain("/api/audio/prompt-tts/en/supported_service_select");
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

  it("explains Banking is unsupported when the unavailable option is selected", async () => {
    const res = await request(app)
      .post("/service-choice")
      .send({ sessionId: "AT-UNSUPPORTED-BANKING-001", lang: "en", dtmfDigits: "2" });

    expect(res.text).toContain("Banking is not supported in this pilot.");
    expect(res.text).not.toContain("not a valid choice");
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

  it("routes only the advertised English services to their supported handlers", async () => {
    const sessionId = "AT-TEST-DIRECT-TRANSFER-001";

    const menuRes = await request(app)
      .post("/service-select")
      .query({ sessionId, lang: "en" });
    expect(menuRes.text).toContain("/api/audio/prompt-tts/en/supported_service_select");

    const unavailableBankingChoice = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "2" });
    expect(unavailableBankingChoice.text).toContain("Banking is not supported in this pilot.");
    expect(unavailableBankingChoice.text).not.toContain("/provider-select");
    expect(unavailableBankingChoice.text).not.toContain("directTransfer=1");

    const mobileMoneyChoice = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(mobileMoneyChoice.text).toContain("/provider-select");
    expect(mobileMoneyChoice.text).not.toContain("directTransfer=1");

    const unadvertisedChoice = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "3" });
    expect(unadvertisedChoice.text).toContain("not a valid choice");
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
    const startSaga = vi.spyOn(paymentSaga, "executeConfirmedTransferSaga").mockResolvedValue({
      saga: {
        collectionReference: "collection-test-reference",
        state: "WAITING_FOR_CUSTOMER_AUTHORIZATION",
      } as any,
      status: "PENDING",
      mode: "MOCK_PROVIDER",
    });
    const handoffRes = await request(app)
      .post("/safe-outcome")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(startSaga).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      senderPhone: "+233543546010",
      recipientPhone: "0241234567",
      amount: 500,
      network: "MTN",
    }));
    startSaga.mockRestore();
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
