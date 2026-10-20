import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/serverApp";
import { transactionStateMachine } from "../src/domain/stateMachine";

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
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3?format=mp3");
    expect(prompts[1]).toContain("/audio/Twi/Language_selection.mp3?format=mp3");
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

  it("never treats a client-supplied recipient name as identity verification", async () => {
    const brainSessionId = `unverified_brain_${Date.now()}`;
    const brainResponse = await request(app)
      .post("/api/ai/brain/process")
      .send({
        sessionId: brainSessionId,
        transcript: "Send 42 cedis to Ama at 0209998464",
        language: "en",
        draft: {
          intent: "momo.transfer",
          slots: {
            recipient: { name: "Ama", phone: "0209998464" },
            verifiedName: "Forged Verified Name",
          },
        },
      });

    expect(brainResponse.status).toBe(200);
    expect(transactionStateMachine.getSession(brainSessionId)?.isRecipientVerified).toBe(false);
    expect(brainResponse.body.brainOutput.updatedDraft.slots.verifiedName).toBeUndefined();

    const syncSessionId = `unverified_sync_${Date.now()}`;
    const syncResponse = await request(app)
      .post("/api/ai/simulator/sync-session")
      .send({
        sessionId: syncSessionId,
        recipientPhone: "0209998464",
        recipientName: "Ama",
      });

    expect(syncResponse.status).toBe(200);
    expect(transactionStateMachine.getSession(syncSessionId)?.isRecipientVerified).toBe(false);
  });

  it("reads back the exact 42 cedis and 0543546010 before asking for confirmation", async () => {
    const flowSessionId = `exact_transfer_${Date.now()}`;
    transactionStateMachine.getOrCreateSession(flowSessionId, "en", "VOICE");
    transactionStateMachine.transition(flowSessionId, "INITIATED", {
      callerPhone: "+233244123456",
    });

    const recipientResponse = await request(app)
      .post(`/verify-recipient?sessionId=${flowSessionId}&lang=en`)
      .send({ dtmfDigits: "0543546010#" });
    expect(recipientResponse.status).toBe(200);

    const recipientConfirmation = await request(app)
      .post(`/recipient-verify-choice?sessionId=${flowSessionId}&lang=en`)
      .send({ dtmfDigits: "1" });
    expect(recipientConfirmation.status).toBe(200);

    const amountResponse = await request(app)
      .post(`/verify-amount?sessionId=${flowSessionId}&lang=en`)
      .send({ dtmfDigits: "42#" });
    expect(amountResponse.status).toBe(200);
    expect(amountResponse.text).toContain("/amount-readback-choice");

    const readback = await request(app).get(`/safe-confirmation?sessionId=${flowSessionId}&lang=en`);
    expect(readback.status).toBe(200);
    expect(readback.text).toContain("42 Cedis");
    expect(readback.text).toContain("6 0 1 0");
    expect(readback.text).toContain("/safe-outcome");
    expect(readback.text).not.toContain("numDigits=\"4\"");

    const handoff = await request(app)
      .post(`/safe-outcome?sessionId=${flowSessionId}&lang=en`)
      .send({ dtmfDigits: "1" });

    expect(handoff.status).toBe(200);
    expect(handoff.headers["x-transaction-outcome"]).toBe("PENDING");
    expect(handoff.text).toContain("private authorization prompt");
    expect(handoff.text).not.toContain("transaction was successful");
    expect(handoff.text).not.toContain("Success.m4a");
    expect(transactionStateMachine.getSession(flowSessionId)?.state).toBe("PIN_PENDING");
  });

  it("advances a complete natural-language transfer to a readback-ready state, not straight to PIN", async () => {
    const flowSessionId = `natural_transfer_${Date.now()}`;
    transactionStateMachine.getOrCreateSession(flowSessionId, "en", "VOICE");
    transactionStateMachine.transition(flowSessionId, "INITIATED", {
      callerPhone: "+233244123456",
    });
    const response = await request(app)
      .post("/api/ai/brain/process")
      .send({
        sessionId: flowSessionId,
        transcript: "I want to send 42 cedis to 0543546010",
        language: "en",
        draft: { slots: {} },
      });

    expect(response.status).toBe(200);
    expect(response.body.brainOutput.decision.kind).toBe("confirm");
    expect(response.body.brainOutput.reply.text).toContain("forty two Ghana cedis");
    const session = transactionStateMachine.getSession(flowSessionId);
    expect(session?.state).toBe("AMOUNT_ENTERED");
    expect(session?.isRecipientVerified).toBe(true);
    expect(session?.amount).toBe(42);

    const readback = await request(app).get(`/safe-confirmation?sessionId=${flowSessionId}&lang=en`);
    expect(readback.status).toBe(200);
    expect(readback.text).toContain("42 Cedis");
    expect(readback.text).toContain("6 0 1 0");

    const pinWithoutConfirmation = await request(app)
      .post(`/safe-outcome?sessionId=${flowSessionId}&lang=en`)
      .send({ dtmfDigits: "1" });
    expect(pinWithoutConfirmation.status).toBe(200);
    expect(pinWithoutConfirmation.text).toContain("private authorization prompt");
    expect(session?.state).toBe("PIN_PENDING");
  });

  it("synthesizes the exact personalized transaction readback as playable audio", async () => {
    const response = await request(app)
      .post("/api/ai/synthesize")
      .send({
        text: "You are about to send forty two Ghana cedis to Hannes Aboagye, whose phone number is zero five four three five four six zero one zero. Do you confirm?",
        language: "en",
        sessionId: `readback_audio_${Date.now()}`,
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.result.audioBase64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(response.body.result.audioBase64.length).toBeGreaterThan(128);
    expect(response.body.result.audioMimeType).toMatch(/^audio\//);
    expect(response.body.result.providerUsed).toBeTruthy();
  });

  it("rejects legacy app-submitted PIN and direct completion endpoints", async () => {
    const pinResponse = await request(app)
      .post("/api/ai/simulator/submit-pin")
      .send({ sessionId: `legacy_pin_${Date.now()}`, pin: "1234" });
    expect(pinResponse.status).toBe(410);
    expect(pinResponse.body.success).toBe(false);

    const completionResponse = await request(app)
      .post("/api/ai/simulator/complete-transfer")
      .send({ sessionId: `legacy_completion_${Date.now()}` });
    expect(completionResponse.status).toBe(410);
    expect(completionResponse.body.success).toBe(false);
  });

  it("does not collect, transcribe, or accept PINs in legacy IVR routes", async () => {
    const pinSessionId = `blocked_pin_${Date.now()}`;
    transactionStateMachine.getOrCreateSession(pinSessionId, "en", "VOICE");
    transactionStateMachine.transition(pinSessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0543546010",
      recipientName: "Hannes Aboagye",
      isRecipientVerified: true,
      callerPhone: "+233244123456",
    });
    transactionStateMachine.transition(pinSessionId, "AMOUNT_ENTERED", { amount: 42 });
    transactionStateMachine.transition(pinSessionId, "CONFIRMED");
    transactionStateMachine.transition(pinSessionId, "PIN_PENDING");

    const entry = await request(app).get(`/enter-pin?sessionId=${pinSessionId}&lang=en`);
    expect(entry.status).toBe(200);
    expect(entry.text).toContain("private authorization prompt");
    expect(entry.text).not.toContain("<GetDigits");
    expect(entry.text).not.toContain("<Record");

    const verification = await request(app)
      .post(`/verify-pin?sessionId=${pinSessionId}&lang=en`)
      .send({ dtmfDigits: "1234" });
    expect(verification.status).toBe(200);
    expect(verification.text).not.toContain("successful");
    expect(transactionStateMachine.getSession(pinSessionId)?.state).toBe("PIN_PENDING");

    const speech = await request(app)
      .post(`/speech-fallback?step=enter-pin&sessionId=${pinSessionId}&lang=en`)
      .send({ speechText: "1234" });
    expect(speech.status).toBe(200);
    expect(speech.text).not.toContain("1234");
    expect(speech.text).not.toContain("successful");
    expect(transactionStateMachine.getSession(pinSessionId)?.state).toBe("PIN_PENDING");
  });

  it("requires a transaction readback before accepting safe-outcome confirmation", async () => {
    const sessionId = `confirmation_without_readback_${Date.now()}`;
    transactionStateMachine.getOrCreateSession(sessionId, "en", "VOICE");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      callerPhone: "+233244123456",
      recipientPhone: "0543546010",
      recipientName: "Hannes Aboagye",
      isRecipientVerified: true,
      network: "MTN",
    });
    transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", { amount: 42 });

    const response = await request(app)
      .post(`/safe-outcome?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "1" });

    expect(response.status).toBe(200);
    expect(response.text).toContain("/safe-confirmation");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("AMOUNT_ENTERED");

    await request(app).get(`/safe-confirmation?sessionId=${sessionId}&lang=en`);
    transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", { amount: 43 });
    const changedAmountConfirmation = await request(app)
      .post(`/safe-outcome?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "1" });
    expect(changedAmountConfirmation.text).toContain("/safe-confirmation");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("AMOUNT_ENTERED");
  });
});
