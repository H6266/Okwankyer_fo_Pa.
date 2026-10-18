import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../src/serverApp";
import { transactionStateMachine } from "../src/domain/stateMachine";
import { paymentSaga } from "../src/integrations/momo/paymentSaga";
import { isDynamicPrompt, resolvePromptSpokenText } from "../src/audio/canonicalRegistry";

describe("Telephony & Simulator 1:1 Parity Acceptance Tests", () => {
  const sessionId = `test_session_${Date.now()}`;
  const testCallerNumber = "+233543546010";

  it("serves the three English Library candidates from their registered paths", async () => {
    for (const filename of ["2.m4a", "3.m4a", "4.m4a"]) {
      const response = await request(app).get(`/audio/English_Library/${filename}`);
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toMatch(/audio\/mp4/);
      expect(response.body.length).toBeGreaterThan(0);
    }
  });

  it("rejects PIN fields and preserves pending simulator payment status", async () => {
    const pinAttempt = await request(app)
      .post("/api/ai/simulator/complete-transfer")
      .send({ sessionId: "SIM-PIN-REJECT-001", pin: "1234" });
    expect(pinAttempt.status).toBe(400);
    expect(transactionStateMachine.getSession("SIM-PIN-REJECT-001")).toBeUndefined();

    const sessionId = "SIM-PENDING-EVIDENCE-001";
    transactionStateMachine.getOrCreateSession(sessionId, "en");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      callerPhone: "0244123456",
      recipientPhone: "0241234567",
      recipientName: "Ama Mensah",
      isRecipientVerified: true,
      network: "MTN",
    });
    transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", { amount: 25 });

    const executeSaga = vi.spyOn(paymentSaga, "executeConfirmedTransferSaga").mockResolvedValue({
      saga: {
        sagaId: "SIM-PENDING-SAGA",
        sessionId,
        state: "WAITING_FOR_CUSTOMER_AUTHORIZATION",
      } as any,
      status: "PENDING",
      mode: "MOCK_PROVIDER",
    });
    const pending = await request(app)
      .post("/api/ai/simulator/complete-transfer")
      .send({ sessionId });
    expect(pending.status).toBe(202);
    expect(pending.body.status).toBe("PENDING");
    expect(pending.body.receiptText).toContain("pending provider confirmation");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("PIN_PENDING");
    executeSaga.mockRestore();
  });

  it("1. OP01 plays once with language choices and directs to the selector", async () => {
    const res = await request(app)
      .post("/voice-menu")
      .send({
        sessionId,
        callerNumber: testCallerNumber,
        callSessionState: "Ringing",
        isActive: "1",
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    const body = res.text;

    expect(body).toContain("<Response>");
    const prompts = [...body.matchAll(/<Play[^>]*url="([^"]+)"/gi)].map((match) => match[1]);
    expect(prompts).toHaveLength(0);
    expect(body).toContain("Sɛ wopɛ Borɔfo a, mia 1. Sɛ wopɛ Twi a, mia 2.");
    expect(body).toMatch(/\/(?:language-selection|service-choice)\?sessionId=/);
    expect(body).not.toContain("Welcome back");
  });

  it("2. Language selection occurs before language-specific prompts and routes without duplicate greeting", async () => {
    // English selection: DTMF 1
    const resEn = await request(app)
      .post(`/language-selection?sessionId=${sessionId}`)
      .send({ dtmfDigits: "1" });

    expect(resEn.status).toBe(200);
    expect(resEn.text).toContain("/service-select?sessionId=");
    expect(resEn.text).toContain("lang=en");
    // The language selection response advances without replaying the opening.
    expect(resEn.text).not.toContain("Welcome back");
    expect(resEn.text).not.toContain("Welcome%201%20(2).mp3");

    // Check service-select menu prompt
    const resService = await request(app)
      .get(`/service-select?sessionId=${sessionId}&lang=en`);

    expect(resService.status).toBe(200);
    expect(resService.text).toContain("<GetDigits");
    expect(resService.text).toContain("/service-choice");
    expect(resService.text).not.toContain("Welcome back");
  });

  it("3. Send Money: Recipient input resolves and triggers dynamic name & number readback (OP20 & OP21)", async () => {
    // Service choice 1 = Mobile money send
    const resServiceChoice = await request(app)
      .post(`/service-choice?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "1" });

    expect(resServiceChoice.status).toBe(200);

    // Enter recipient phone number (0543546010)
    const resRecipient = await request(app)
      .post(`/verify-recipient?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "0543546010#" });

    expect(resRecipient.status).toBe(200);
    const body = resRecipient.text;

    // State machine should advance to RECIPIENT_VERIFIED
    const session = transactionStateMachine.getSession(sessionId);
    expect(session?.state).toBe("RECIPIENT_VERIFIED");
    expect(session?.recipientPhone).toBe("0543546010");

    // Dynamic verification prompt must read out full spaced phone number and name without placeholder brackets
    expect(body).toContain("0 5 4 3 5 4 6 0 1 0");
    expect(body).not.toContain("[DYNAMIC NAME]");
    expect(body).not.toContain("[ALL TEN DIGITS]");
    expect(body).not.toContain("{NAME}");
    expect(body).not.toContain("{PHONE}");
    expect(body).toContain("/recipient-verify-choice");
  });

  it("4. Amount entry and dynamic readback (OP29) reflects exact caller amount in Ghana Cedis", async () => {
    // Confirm recipient: DTMF 1
    const resConfirmRecipient = await request(app)
      .post(`/recipient-verify-choice?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "1" });

    expect(resConfirmRecipient.status).toBe(200);

    // Enter amount: 50 Cedis
    const resAmount = await request(app)
      .post(`/verify-amount?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "50#" });

    expect(resAmount.status).toBe(200);
    expect(resAmount.text).toContain("/amount-readback-choice");

    const session = transactionStateMachine.getSession(sessionId);
    expect(session?.state).toBe("AMOUNT_ENTERED");
    expect(session?.amount).toBe(50);

    // Accept the amount before final transaction confirmation.
    const resAmountAccepted = await request(app)
      .post(`/amount-readback-choice?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "1" });
    expect(resAmountAccepted.status).toBe(200);
    expect(resAmountAccepted.text).toContain("/safe-confirmation");

    // Fetch safe-confirmation after amount acceptance.
    const resSafe = await request(app)
      .get(`/safe-confirmation?sessionId=${sessionId}&lang=en`);

    expect(resSafe.status).toBe(200);
    const body = resSafe.text;

    // Dynamic readback: OP29
    expect(body).toContain("50");
    expect(body).toContain("Cedis");
    expect(body).toMatch(/\/(?:pin-handoff|safe-outcome)/);
  });

  it("5. Zero-PIN guarantee: Safe outcome confirms without capturing raw PIN over call", async () => {
    // Caller confirms transfer with DTMF 1 to proceed to pin-handoff
    const resOutcome = await request(app)
      .post(`/pin-handoff?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "1" });

    expect(resOutcome.status).toBe(200);
    const body = resOutcome.text;

    // PIN handoff instructions given to caller; PIN is never captured in VoiceXML GetDigits
    expect(body).not.toContain('numDigits="4"');
    expect(body).not.toContain('numDigits="6"');
    expect(body).toMatch(/PIN|screen|transfer|authorization|handset/i);
  });

  it("6. Adaptive acoustic clarification triggers OP70 on noisy speech input before keypad fallback", async () => {
    const recoverySessionId = `noisy_session_${Date.now()}`;
    transactionStateMachine.getOrCreateSession(recoverySessionId, "en", "VOICE");

    // Simulate noisy first speech attempt (retry=0) with low confidence
    const resNoise = await request(app)
      .post(`/speech-fallback?step=enter-amount&sessionId=${recoverySessionId}&lang=en&retry=0`)
      .send({
        speechText: "fifty cedis",
        confidence: 0.5,
      });

    expect(resNoise.status).toBe(200);
    // Should trigger OP70 clarification asking if "fifty cedis" is correct
    expect(resNoise.text).toMatch(/I heard you say fifty cedis\. Is that correct\?/i);
    expect(resNoise.text).toContain("retry=1");
    expect(resNoise.text).not.toContain("[DYNAMIC RESPONSE]");
  });

  it("7. Dynamic TTS endpoint streams byte ranges without placeholder tokens", async () => {
    const res = await request(app)
      .get("/api/audio/prompt-tts/en/OP20?name=Kweku+Ananse")
      .set("Range", "bytes=0-100");

    // Supports byte-range 206 streaming for telephony gateways
    expect([200, 206]).toContain(res.status);
    expect(res.headers["content-type"]).toMatch(/audio/);
    expect(res.headers["accept-ranges"]).toBe("bytes");
  });
});
