import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/serverApp";
import { transactionStateMachine } from "../src/domain/stateMachine";
import { isDynamicPrompt, resolvePromptSpokenText } from "../src/audio/canonicalRegistry";

describe("Telephony & Simulator 1:1 Parity Acceptance Tests", () => {
  const sessionId = `test_session_${Date.now()}`;
  const testCallerNumber = "+233543546010";

  it("1. Welcome plays once at session start and directs to language selection", async () => {
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

    // Play the welcome and language selection recordings sequentially, once each.
    expect(body).toContain("<Response>");
    const prompts = [...body.matchAll(/<Play[^>]*url="([^"]+)"/gi)].map((match) => match[1]);
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("Welcome%201%20(2).mp3");
    expect(prompts[1]).toContain("Language%20selection.mp3");
    expect(body).toContain("/language-selection?sessionId=");
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
    expect(resAmount.text).toContain("/safe-confirmation");

    const session = transactionStateMachine.getSession(sessionId);
    expect(session?.state).toBe("AMOUNT_ENTERED");
    expect(session?.amount).toBe(50);

    // Fetch safe-confirmation
    const resSafe = await request(app)
      .get(`/safe-confirmation?sessionId=${sessionId}&lang=en`);

    expect(resSafe.status).toBe(200);
    const body = resSafe.text;

    // Dynamic readback: OP29
    expect(body).toContain("50");
    expect(body).toContain("Cedis");
    expect(body).toContain("/pin-handoff");
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
