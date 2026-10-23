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
import { getCollectionStagePromptId, simulatorRouter, voiceRouter } from "../src/routes/voiceRoutes";
import { transactionStateMachine } from "../src/domain/stateMachine";
import { callSessionRepository } from "../src/services/callSessionRepository";
import { paymentSaga } from "../src/integrations/momo/paymentSaga";
import { brain } from "../src/ai_system/brain/brain";
import { auditLogger } from "../src/services/auditLogger";
import { resolvePromptText } from "../src/modules/ttsService";

import { durableTransactionStore } from "../src/services/durableTransactionStore";
import { recipientResolver } from "../src/providers/recipient/RecipientResolver";
import { config } from "../src/config/env";
import { isInboundVoiceEnabled } from "../src/providers/telephony/inboundVoiceConfig";

let nextTestClientIp = 1;

function createTestApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use((req, _res, next) => {
    req.headers["x-forwarded-for"] = `203.0.113.${nextTestClientIp++}`;
    next();
  });
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(voiceRouter);
  app.use("/api/simulator", simulatorRouter);
  return app;
}

describe("Task 8: End-to-End IVR Integration Flows", () => {
  let app: express.Express;

  beforeEach(() => {
    durableTransactionStore.clearAllForTesting();
    app = createTestApp();
  });

  it.each([
    { slot: "recipient" as const, expectedPromptId: "OP16" },
    { slot: "amount" as const, expectedPromptId: "OP28" },
  ])("selects the canonical next-stage prompt for $slot collection", ({ slot, expectedPromptId }) => {
    expect(getCollectionStagePromptId(slot, "model-or-template-prompt")).toBe(expectedPromptId);
  });

  it("keeps language selection separate from mode selection and rejects menu-stage phone shortcuts", async () => {
    const sessionId = "AT-MODE-AND-MENU-001";

    await request(app)
      .post("/voice-menu")
      .send({ sessionId, callerNumber: "+233543546010", isActive: "1", lang: "en" });
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

  it("keeps Twi audio when Africa's Talking omits lang on later callbacks", async () => {
    const sessionId = "AT-TWI-LANG-OMITTED-001";
    transactionStateMachine.getOrCreateSession(sessionId, "twi", "VOICE");

    const serviceChoice = await request(app)
      .post(`/service-choice?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "1" });

    expect(serviceChoice.status).toBe(200);
    expect(serviceChoice.text).toContain(`/provider-select?sessionId=${sessionId}&amp;lang=twi`);

    const providerMenu = await request(app)
      .post(`/provider-select?sessionId=${sessionId}&lang=en`);

    expect(providerMenu.status).toBe(200);
    expect(providerMenu.text).toContain("/audio/Twi/Network_selection.mp3?format=mp3");
    expect(providerMenu.text).not.toContain("<Say");

    const providerChoice = await request(app)
      .post(`/provider-choice?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "1" });
    expect(providerChoice.text).toContain(`/action-select?sessionId=${sessionId}&amp;lang=twi`);

    const actionMenu = await request(app)
      .post(`/action-select?sessionId=${sessionId}&lang=en`);
    expect(actionMenu.text).toContain("/audio/Twi/MTN%20menu.mp3?format=mp3");
    expect(actionMenu.text).not.toContain("<Say");

    const actionChoice = await request(app)
      .post(`/action-choice?sessionId=${sessionId}&lang=en`)
      .send({ dtmfDigits: "1" });
    expect(actionChoice.text).toContain(`/enter-recipient?sessionId=${sessionId}&amp;lang=twi`);

    const recipientPrompt = await request(app)
      .post(`/enter-recipient?sessionId=${sessionId}&lang=en`);
    expect(recipientPrompt.text).toContain("/audio/Twi/Enter_recipient.mp3?format=mp3");
    expect(recipientPrompt.text).not.toContain("<Say");
    const recipientGetDigits = recipientPrompt.text.match(/<GetDigits\b[^>]*>([\s\S]*?)<\/GetDigits>/i)?.[1] || "";
    expect([...recipientGetDigits.matchAll(/<(?:Say|Play)\b/gi)]).toHaveLength(1);
    expect(recipientPrompt.text.indexOf("/Send_money_selected.mp3")).toBeLessThan(recipientPrompt.text.indexOf("<GetDigits"));

    const amountPrompt = await request(app)
      .post("/enter-amount?sessionId=AT-GETDIGITS-PROMPT-001&lang=twi");
    const amountGetDigits = amountPrompt.text.match(/<GetDigits\b[^>]*>([\s\S]*?)<\/GetDigits>/i)?.[1] || "";
    expect([...amountGetDigits.matchAll(/<(?:Say|Play)\b/gi)]).toHaveLength(1);
    expect(amountPrompt.text.indexOf("/Amount%20prompt.mp3")).toBeLessThan(amountPrompt.text.indexOf("<GetDigits"));
    expect(amountGetDigits).toContain("/Enter%20amount.mp3");
  });

  it("keeps the Twi call open and replays direct audio when menu callbacks have no DTMF", async () => {
    const sessionId = "AT-TWI-EMPTY-DTMF-001";
    transactionStateMachine.getOrCreateSession(sessionId, "twi", "VOICE");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const serviceRetry = await request(app)
        .post(`/service-choice?sessionId=${sessionId}`)
        .send({ dtmfDigits: "" });

      expect(serviceRetry.status).toBe(200);
      expect(serviceRetry.text).toContain("<Redirect>");
      expect(serviceRetry.text).toContain(`/service-select?sessionId=${sessionId}&amp;lang=twi`);
      expect(serviceRetry.text).not.toContain("<Reject/>");
    }

    const serviceMenu = await request(app)
      .post(`/service-select?sessionId=${sessionId}`);
    expect(serviceMenu.text).toContain("/audio/Twi/Service_selection.mp3?format=mp3");

    const actionRetry = await request(app)
      .post(`/action-choice?sessionId=${sessionId}`)
      .send({ dtmfDigits: "" });

    expect(actionRetry.status).toBe(200);
    expect(actionRetry.text).toContain("<Redirect>");
    expect(actionRetry.text).toContain(`/action-select?sessionId=${sessionId}&amp;lang=twi`);
    expect(actionRetry.text).not.toContain("<Reject/>");

    const actionMenu = await request(app)
      .post(`/action-select?sessionId=${sessionId}`);
    expect(actionMenu.text).toContain("/audio/Twi/MTN%20menu.mp3?format=mp3");
    expect(actionMenu.text).toContain("/action-choice");
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
    expect(serviceMenu.text).toContain("/audio/English_Library/2.m4a?format=mp3");
    expect(resolvePromptText("supported_service_select", "en")).toContain("supported Mobile Money transfer");
    expect(resolvePromptText("supported_service_select", "en")).not.toMatch(/banking/i);

    const networkMenu = await request(app)
      .post("/provider-select")
      .query({ sessionId, lang: "en" });
    expect(networkMenu.text).toContain("For MTN Mobile Money, press 1");
    expect(networkMenu.text).toContain("For Telecel Cash, press 2");
    expect(resolvePromptText("mtn_network_select", "en")).toContain("For MTN Mobile Money, press 1");
    expect(resolvePromptText("mtn_network_select", "en")).toContain("For Telecel Cash, press 2");
    expect(resolvePromptText("mtn_network_select", "en")).not.toContain("AirtelTigo");

    const twiNetworkMenu = await request(app)
      .post("/provider-select")
      .query({ sessionId: "AT-TWI-NETWORK-AUDIO-001", lang: "twi" });
    expect(twiNetworkMenu.text).toContain("/audio/Twi/Network_selection.mp3?format=mp3");
    expect(twiNetworkMenu.text).not.toContain("Twi audio is unavailable");

    const actionMenu = await request(app)
      .post("/action-select")
      .query({ sessionId, lang: "en" });
    expect(actionMenu.text).toContain("To send money, press 1.");
    expect(resolvePromptText("send_money_menu", "en")).toContain("To send money, press 1.");
    expect(resolvePromptText("send_money_menu", "en")).not.toContain("check your account, press 2");

    const twiActionMenu = await request(app)
      .post("/action-select")
      .query({ sessionId: "AT-TWI-ACTION-AUDIO-001", lang: "twi" });
    expect(twiActionMenu.text).toContain("/audio/Twi/MTN%20menu.mp3?format=mp3");
    expect(twiActionMenu.text).toContain("/speech-fallback?step=action-select");
    expect(twiActionMenu.text).not.toContain("Twi audio is unavailable");

    const balanceAttempt = await request(app)
      .post("/action-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "2" });
    expect(balanceAttempt.text).toContain("cannot check wallet balances");
    expect(balanceAttempt.text).toContain("<GetDigits");
    expect(balanceAttempt.text).not.toContain("<Reject/>");
    expect(balanceAttempt.text).not.toContain("/enter-recipient");

    const twiBalanceAttempt = await request(app)
      .post("/action-choice")
      .send({ sessionId: "AT-TWI-UNSUPPORTED-BALANCE-001", lang: "twi", dtmfDigits: "2" });
    expect(twiBalanceAttempt.text).toContain("<GetDigits");
    expect(twiBalanceAttempt.text).toContain("/audio/Twi/MTN%20menu.mp3?format=mp3");
    expect(twiBalanceAttempt.text).not.toContain("<Reject/>");
  });

  it("plays one welcome with language choices and reserves OP02 for replay", async () => {
    const sessionId = "AT-OPENING-SEPARATE-001";
    const welcome = await request(app)
      .post("/voice-menu")
      .send({ sessionId, callerNumber: "+233543546010", isActive: "1", lang: "en" });

    const welcomePrompts = [...welcome.text.matchAll(/<Play[^>]*url="([^"]+)"/gi)].map((match) => match[1]);
    expect(welcomePrompts).toHaveLength(1);
    expect(welcomePrompts[0]).toContain("/audio/welcome_en.mp3");
    expect(welcome.text).not.toContain("<Say");
    expect(welcome.text).toContain(`/language-selection?sessionId=${sessionId}&amp;lang=en`);
    expect(decodeURIComponent(welcome.headers["x-ai-reply-text"])).toContain("For English press 1");

    const languagePrompt = await request(app)
      .post("/language-selection")
      .query({ sessionId, lang: "en" });
    expect(languagePrompt.text).toContain("For English, press 1. For Twi, press 2.");
    expect(languagePrompt.text).toContain(`/language-selection?sessionId=${sessionId}`);
    expect(languagePrompt.text).not.toContain("Welcome to Ɔkwankyerɛfo Pa");
  });

  it("silently rejects live AT voice while leaving the phone simulator available", async () => {
    const previousPipeline = process.env.AT_CALL_PIPELINE;
    const previousSetting = process.env.AT_INBOUND_VOICE_ENABLED;
    delete process.env.AT_CALL_PIPELINE;
    process.env.AT_INBOUND_VOICE_ENABLED = "false";

    try {
      const liveResponse = await request(app)
        .post("/voice-menu")
        .send({ sessionId: "AT-VOICE-DISABLED-001", callerNumber: "+233543546010", isActive: "1" });

      expect(liveResponse.status).toBe(200);
      expect(liveResponse.text).toContain("<Reject/>");
      expect(liveResponse.text).not.toMatch(/<Say\b|<Play\b|<GetDigits\b|<Record\b/i);

      const rootWebhookResponse = await request(app)
        .post("/")
        .send({ sessionId: "AT-VOICE-DISABLED-ROOT-001", callerNumber: "+233543546010", isActive: "1" });

      expect(rootWebhookResponse.status).toBe(200);
      expect(rootWebhookResponse.text).toContain("<Reject/>");
      expect(rootWebhookResponse.text).not.toMatch(/<Say\b|<Play\b|<GetDigits\b|<Record\b/i);

      const simulatorResponse = await request(app)
        .post("/api/simulator/voice-menu")
        .send({ sessionId: "AT-VOICE-DISABLED-SIM-001", phoneNumber: "+233543546010" });

      expect(simulatorResponse.status).toBe(200);
      expect(simulatorResponse.text).toContain("/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3");
    } finally {
      if (previousPipeline === undefined) delete process.env.AT_CALL_PIPELINE;
      else process.env.AT_CALL_PIPELINE = previousPipeline;
      if (previousSetting === undefined) delete process.env.AT_INBOUND_VOICE_ENABLED;
      else process.env.AT_INBOUND_VOICE_ENABLED = previousSetting;
    }
  });

  it("returns a playable menu for an enabled Africa's Talking Ringing callback", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSetting = process.env.AT_INBOUND_VOICE_ENABLED;
    process.env.NODE_ENV = "production";
    process.env.AT_INBOUND_VOICE_ENABLED = "false";

    try {
      const response = await request(app)
        .post("/voice/callback")
        .send({
          sessionId: "AT-RINGING-ENABLED-001",
          callerNumber: "+233543546010",
          destinationNumber: "+233308048097",
          direction: "Inbound",
          callSessionState: "Ringing",
          isActive: "1",
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain("<GetDigits");
      expect(response.text).toContain("/language-selection?");
      expect(response.text).not.toContain("<Response/>");
      expect(response.text).not.toContain("<Reject/>");
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSetting === undefined) delete process.env.AT_INBOUND_VOICE_ENABLED;
      else process.env.AT_INBOUND_VOICE_ENABLED = previousSetting;
    }
  });

  it("keeps production inbound voice enabled despite a stale false env override", () => {
    expect(isInboundVoiceEnabled({
      NODE_ENV: "production",
      AT_INBOUND_VOICE_ENABLED: "false",
    })).toBe(true);
    expect(isInboundVoiceEnabled({
      NODE_ENV: "test",
      AT_INBOUND_VOICE_ENABLED: "false",
    })).toBe(false);
  });

  it("stores final AT call details and closes completed callbacks", async () => {
    const previousSetting = process.env.AT_INBOUND_VOICE_ENABLED;
    process.env.AT_INBOUND_VOICE_ENABLED = "true";
    const sessionId = `AT-COMPLETED-${Date.now()}`;

    try {
      const response = await request(app)
        .post("/voice/callback")
        .send({
          sessionId,
          callerNumber: "+233543546010",
          callSessionState: "Completed",
          isActive: "0",
          recordingUrl: "https://recordings.example/call.mp3",
          durationInSeconds: "42",
          currencyCode: "GHS",
          amount: "0.35",
          errorMessage: "No actions were found in the input",
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe("OK");
      expect(response.headers["content-type"]).toContain("text/plain");
      expect(callSessionRepository.getSession(sessionId)?.voiceCallDetails).toEqual({
        recordingUrl: "https://recordings.example/call.mp3",
        durationInSeconds: 42,
        currencyCode: "GHS",
        amount: "0.35",
      });
      expect(callSessionRepository.getSession(sessionId)?.durationSeconds).toBe(42);
      expect(transactionStateMachine.getSession(sessionId)).toBeUndefined();

      const duplicate = await request(app)
        .post("/voice/callback")
        .send({ sessionId, callSessionState: "Completed", isActive: "0" });
      expect(duplicate.status).toBe(200);
      expect(duplicate.text).toBe("OK");
      expect(callSessionRepository.getSession(sessionId)?.voiceCallDetails).toEqual({
        recordingUrl: "https://recordings.example/call.mp3",
        durationInSeconds: 42,
        currencyCode: "GHS",
        amount: "0.35",
      });
    } finally {
      if (previousSetting === undefined) delete process.env.AT_INBOUND_VOICE_ENABLED;
      else process.env.AT_INBOUND_VOICE_ENABLED = previousSetting;
    }
  });

  it("records Africa's Talking call and transfer events", async () => {
    const previousSetting = process.env.AT_INBOUND_VOICE_ENABLED;
    process.env.AT_INBOUND_VOICE_ENABLED = "true";
    const sessionId = `AT-EVENT-${Date.now()}`;

    try {
      const response = await request(app)
        .post("/voice/events")
        .send({
          sessionId,
          direction: "Inbound",
          callSessionState: "Transferred",
          callTransferState: "TransferCompleted",
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe("OK");
      expect(callSessionRepository.getSession(sessionId)?.diagnostics.at(-1)?.details).toEqual({
        callSessionState: "Transferred",
        callTransferState: "TransferCompleted",
      });
    } finally {
      if (previousSetting === undefined) delete process.env.AT_INBOUND_VOICE_ENABLED;
      else process.env.AT_INBOUND_VOICE_ENABLED = previousSetting;
    }
  });
  it("waits for # in recipient and amount DTMF collection", async () => {
    const sessionId = "AT-DTMF-HASH-001";
    const recipientPrompt = await request(app)
      .post("/enter-recipient")
      .query({ sessionId, lang: "en" });
    const amountPrompt = await request(app)
      .post("/enter-amount")
      .query({ sessionId, lang: "en" });

    expect(recipientPrompt.text).toContain('finishOnKey="#"');
    expect(recipientPrompt.text).not.toContain('numDigits="10"');
    expect(amountPrompt.text).toContain('finishOnKey="#"');
    expect(amountPrompt.text).not.toMatch(/numDigits="(?:6|8)"/);
  });

  it("accepts a known sandbox fixture in demo mode and continues the transfer flow", async () => {
    const sessionId = "AT-DEMO-KNOWN-RECIPIENT-001";
    const previousDemoMode = config.demoMode;

    try {
      config.demoMode = true;

      const response = await request(app)
        .post("/verify-recipient")
        .send({ sessionId, lang: "en", dtmfDigits: "0241234567" });

      expect(response.text).toContain("/recipient-verify-choice");
      expect(response.text).not.toContain("local sandbox cannot verify it");
      expect([
        "Ama Mensah",
        "Kofi Annan",
        "Abena Mansa",
        "Kwame Boateng",
        "Akosua Asante",
        "Yaw Osei",
        "Adwoa Frimpong",
        "Kojo Owusu",
      ]).toContain(response.headers["x-recipient-name"]);
      expect(transactionStateMachine.getSession(sessionId)?.state).toBe("RECIPIENT_VERIFIED");
    } finally {
      config.demoMode = previousDemoMode;
    }
  });

  it("speaks only the Twi sandbox name and phone before confirmation audio, then accepts 1", async () => {
    const response = await request(app)
      .post("/verify-recipient")
      .send({ sessionId: "AT-TWI-KYC-READBACK-001", lang: "twi", dtmfDigits: "0241234567" });

    const sayMatch = response.text.match(/<Say\b[^>]*>[\s\S]*?<\/Say>/i);
    const sayIndex = sayMatch ? response.text.indexOf(sayMatch[0]) : -1;
    const confirmationAudioIndex = response.text.indexOf("Confirm_continue.mp3");
    expect(sayIndex).toBeGreaterThanOrEqual(0);
    expect(confirmationAudioIndex).toBeGreaterThan(sayIndex);

    const readback = sayMatch?.[0] || "";
    expect(readback).toContain("Recipient no din: Ama Mensah.");
    expect(readback).toContain("Ne phone: 0 2 4 1 2 3 4 5 6 7.");
    expect(readback).not.toContain("Please listen");
    expect(readback).not.toContain("mia 1");

    const accepted = await request(app)
      .post("/recipient-verify-choice")
      .send({ sessionId: "AT-TWI-KYC-READBACK-001", lang: "twi", dtmfDigits: "1" });
    expect(accepted.text).toContain("/enter-amount");
  });

  it("waits 90 seconds before reminding silent callers and keeps the current step", async () => {
    const sessionId = "AT-SILENCE-REMINDER-001";
    transactionStateMachine.getOrCreateSession(sessionId, "en");

    const prompt = await request(app)
      .post("/provider-select")
      .query({ sessionId, lang: "en" });
    expect(prompt.text).toContain('timeout="90"');

    const noInput = await request(app)
      .post("/provider-choice")
      .query({ sessionId, lang: "en", dtmfDigits: "" });
    expect(noInput.headers["x-canonical-prompt-id"]).toBe("OP67");
    expect(noInput.text).toContain(`/provider-select?sessionId=${sessionId}&amp;lang=en`);
    expect(transactionStateMachine.getSession(sessionId)?.retryCount).toBe(0);
  });

  it("repeats recipient confirmation on invalid input and advances only after acceptance", async () => {
    const sessionId = "AT-RECIPIENT-EXPLICIT-CONFIRMATION";
    transactionStateMachine.getOrCreateSession(sessionId, "en");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0241234567",
      recipientName: "Ama Mensah",
      isRecipientVerified: true,
      network: "MTN",
    });

    const invalidChoice = await request(app)
      .post("/recipient-verify-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "4" });
    expect(invalidChoice.text).toContain("/recipient-verify-choice");
    expect(invalidChoice.text).toContain("Recipient name: Ama Mensah.");
    expect(invalidChoice.text).toContain("Phone: 0 2 4 1 2 3 4 5 6 7.");
    expect(invalidChoice.text).toContain("Press 1 to confirm, 2 to change the recipient, or 0 to cancel.");
    expect(invalidChoice.text).not.toContain("doesn&apos;t tally");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("RECIPIENT_VERIFIED");

    const accepted = await request(app)
      .post("/recipient-verify-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(accepted.text).toContain("/enter-amount");
  });

  it("routes amounts below and above limits to OP32 and OP31", async () => {
    const sessionId = "AT-AMOUNT-LIMIT-PROMPTS";
    transactionStateMachine.getOrCreateSession(sessionId, "en");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0241234567",
      recipientName: "Ama Mensah",
      isRecipientVerified: true,
      network: "MTN",
    });

    const lowAmount = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "en", dtmfDigits: "0*50#" });
    expect(lowAmount.text).toContain("GHS 1.00 minimum");
    expect(lowAmount.text).not.toContain("/amount-readback-choice");

    const highAmount = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "en", dtmfDigits: "101#" });
    expect(highAmount.text).toContain("GHS 100 limit");
    expect(highAmount.text).not.toContain("/amount-readback-choice");

    const twiSessionId = "AT-AMOUNT-LIMIT-TWI-AUDIO";
    transactionStateMachine.getOrCreateSession(twiSessionId, "twi");
    transactionStateMachine.transition(twiSessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0241234567",
      recipientName: "Ama Mensah",
      isRecipientVerified: true,
      network: "MTN",
    });
    const twiHighAmount = await request(app)
      .post("/verify-amount")
      .send({ sessionId: twiSessionId, lang: "twi", dtmfDigits: "101#" });
    expect(twiHighAmount.text).toContain("Amount%20too%20high%203.mp3");
    expect(twiHighAmount.text).not.toContain("/amount-readback-choice");

    const maxAllowedAmount = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "en", dtmfDigits: "100" });
    expect(maxAllowedAmount.text).toContain("/amount-readback-choice");
    expect(transactionStateMachine.getSession(sessionId)?.amount).toBe(100);
  });

  it("requires OP29 amount acceptance before OP35 final transaction review", async () => {
    const sessionId = "AT-TWO-STAGE-READBACK-001";
    transactionStateMachine.getOrCreateSession(sessionId, "en");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0241234567",
      recipientName: "Ama Mensah",
      isRecipientVerified: true,
      network: "MTN",
    });

    const amountReadback = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "en", dtmfDigits: "50" });
    expect(amountReadback.text).toContain("50");
    expect(amountReadback.text).toContain("/amount-readback-choice");
    expect(amountReadback.text).not.toContain("/safe-confirmation");

    const acceptedAmount = await request(app)
      .post("/amount-readback-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(acceptedAmount.text).toContain("/safe-confirmation");

    const finalReview = await request(app)
      .post("/safe-confirmation")
      .query({ sessionId, lang: "en" });
    expect(finalReview.text).toContain("50");
    expect(finalReview.text).toContain("Ama Mensah");
    expect(finalReview.text).toContain("MTN");
    expect(finalReview.text).toContain("4 5 6 7");
    expect(finalReview.text).not.toContain("0 2 4 1 2 3 4 5 6 7");
    expect(finalReview.text).toContain("Press 1 to confirm");
    expect(finalReview.text).toContain("To change the amount, press 2");
    expect(finalReview.text).toContain("To change the recipient, press 3");
  });

  it("plays the Twi Step 8 confirmation clip after the spoken amount", async () => {
    const sessionId = "AT-TWI-AMOUNT-CONFIRM-AUDIO-001";
    transactionStateMachine.getOrCreateSession(sessionId, "twi");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0241234567",
      recipientName: "Ama Mensah",
      isRecipientVerified: true,
      network: "MTN",
    });

    const response = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "twi", dtmfDigits: "50" });

    const amountSpeechIndex = response.text.indexOf("Ghana cedis 50");
    const confirmationAudioIndex = response.text.indexOf("Confirm_continue.mp3");
    const getDigitsEndIndex = response.text.indexOf("</GetDigits>", confirmationAudioIndex);
    expect(amountSpeechIndex).toBeGreaterThanOrEqual(0);
    expect(confirmationAudioIndex).toBeGreaterThan(amountSpeechIndex);
    expect(response.text).toContain("/amount-readback-choice");
    expect(getDigitsEndIndex).toBeGreaterThan(confirmationAudioIndex);
  });

  it("keeps pending provider status on the call and receipts only trusted completion", async () => {
    const sessionId = "AT-STATUS-CHECK-LOOP-001";
    transactionStateMachine.getOrCreateSession(sessionId, "en");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0241234567",
      recipientName: "Ama Mensah",
      isRecipientVerified: true,
      network: "MTN",
    });
    transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", { amount: 10 });
    transactionStateMachine.transition(sessionId, "CONFIRMED");
    transactionStateMachine.transition(sessionId, "PIN_PENDING");

    const pendingSaga = vi.spyOn(paymentSaga, "getLatestSagaForSession").mockReturnValue({
      sagaId: "saga-pending",
      sessionId,
      state: "WAITING_FOR_CUSTOMER_AUTHORIZATION",
    } as any);
    const pending = await request(app).post("/check-status").query({ sessionId, lang: "en" });
    expect(pending.headers["x-payment-status"]).toBe("PENDING");
    expect(pending.text).toContain('timeout="90"');
    expect(pending.text).toContain("still pending provider confirmation");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("PIN_PENDING");

    pendingSaga.mockReturnValue({
      sagaId: "saga-complete",
      sessionId,
      state: "COMPLETED",
      providerFinancialTransactionId: "provider-financial-id",
      disbursementReference: "provider-disbursement-ref",
    } as any);
    const completed = await request(app).post("/check-status").query({ sessionId, lang: "en" });
    expect(completed.headers["x-payment-status"]).toBe("SUCCESSFUL");
    expect(completed.text).toContain("Your transfer of");
    expect(completed.text).toContain("Ama Mensah");
    expect(completed.text).toContain("application reference");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("COMPLETED");
    pendingSaga.mockRestore();
  });

  it("routes amount submissions back to recipient verification rather than throwing on an unverified session", async () => {
    const sessionId = "AT-AMOUNT-REQUIRES-VERIFIED-RECIPIENT";
    const response = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "en", dtmfDigits: "50" });

    expect(response.status).toBe(200);
    expect(response.text).toContain("Please verify the recipient");
    expect(response.text).toContain("/enter-recipient");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("INITIATED");
  });

  it.each(["024123456", "02412345678"])("rejects a %i-digit phone before recipient lookup", async (digits) => {
    const lookup = vi.spyOn(recipientResolver, "resolve");
    const response = await request(app)
      .post("/verify-recipient")
      .send({ sessionId: `AT-INVALID-${digits.length}`, lang: "en", dtmfDigits: digits });

    expect(response.text).toContain("/verify-recipient");
    expect(lookup).not.toHaveBeenCalled();
    lookup.mockRestore();
  });

  it("explains when a valid number is missing from the local sandbox directory", async () => {
    const sessionId = "AT-UNKNOWN-SANDBOX-RECIPIENT";
    const response = await request(app)
      .post("/verify-recipient")
      .send({ sessionId, lang: "en", dtmfDigits: "0244123903#" });

    expect(response.text).toContain("this local sandbox cannot verify it");
    expect(response.text).toContain("0553838464 or 0241234567");
    expect(response.text).toContain("/enter-recipient");
    expect(transactionStateMachine.getSession(sessionId)?.isRecipientVerified).toBe(false);
  });

  it("runs recipient lookup once for duplicate valid callbacks", async () => {
    const sessionId = "AT-RECIPIENT-LOOKUP-ONCE";
    const lookup = vi.spyOn(recipientResolver, "resolve").mockResolvedValue({
      valid: true,
      phoneNumber: "0241234567",
      normalizedPhone: "0241234567",
      name: "Synthetic Recipient",
      network: "MTN",
      verified: true,
      source: "SANDBOX_FIXTURE",
    });

    await request(app).post("/verify-recipient").send({ sessionId, lang: "en", dtmfDigits: "0241234567" });
    const duplicate = await request(app).post("/verify-recipient").send({ sessionId, lang: "en", dtmfDigits: "0241234567" });

    expect(duplicate.text).toContain("Synthetic Recipient");
    expect(lookup).toHaveBeenCalledTimes(1);
    lookup.mockRestore();
  });

  it("completes full English transfer flow via sequential webhooks with dynamic readback", async () => {
    const sessionId = "AT-TEST-EN-001";

    // 1. Initial Inbound Call
    const callRes = await request(app)
      .post("/voice-menu")
      .send({ sessionId, callerNumber: "+233543546010", isActive: "1", lang: "en" });
    expect(callRes.status).toBe(200);
    expect(callRes.text).toContain("<Response>");
    expect(callRes.text.match(/<Play\b/gi) || []).toHaveLength(1);
    expect(callRes.text).toContain("/audio/welcome_en.mp3");
    expect(callRes.text).not.toContain("<Say");
    expect(decodeURIComponent(callRes.headers["x-ai-reply-text"])).toContain("For English press 1");

    const languagePrompt = await request(app)
      .post("/language-selection")
      .query({ sessionId, lang: "en" });
    expect(languagePrompt.text).toContain("For English, press 1. For Twi, press 2.");
    expect(languagePrompt.text).toContain(`/language-selection?sessionId=${sessionId}`);

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

    const twiServicePrompt = await request(app)
      .post("/service-select")
      .query({ sessionId: "AT-TWI-NO-SECOND-WELCOME", lang: "twi" });
    expect(twiServicePrompt.text).not.toContain("Welcome 1");

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
    expect(amountRes.text).toContain("/amount-readback-choice");
    expect(amountRes.text).toContain("75");

    const amountAccepted = await request(app)
      .post("/amount-readback-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(amountAccepted.text).toContain("/safe-confirmation");

    // 9. Final OP35 transaction review is distinct from the OP29 amount check.
    const safeConfRes = await request(app)
      .post("/safe-confirmation")
      .query({ sessionId, lang: "en" });
    expect(safeConfRes.text).toContain("75");
    expect(safeConfRes.text.includes("Sand Box") || safeConfRes.text.includes("Kwame Boateng")).toBe(true);
    expect(safeConfRes.text).toContain("8 4 6 4");
    expect(safeConfRes.text).not.toContain("0 5 5 3 8 3 8 4 6 4");

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
    expect(outcomeRes.text).toContain("Waiting_confirmation.mp3");
    expect(outcomeRes.text).toContain("/submit-transfer?");
    expect(startSaga).not.toHaveBeenCalled();

    const handoffRes = await request(app)
      .post("/submit-transfer")
      .query({ sessionId, lang: "en" });
    expect(startSaga).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      senderPhone: "+233543546010",
      recipientPhone: "0553838464",
      amount: 75,
      network: "MTN",
    }));
    expect(handoffRes.text).toContain("Approve it on your handset.");
    expect(handoffRes.text).not.toContain("Waiting_confirmation.mp3");
    expect(handoffRes.text).not.toContain("Congratulations");
    expect(handoffRes.text).not.toContain("<Record");
    expect(handoffRes.text).toContain("/check-status");
    expect(handoffRes.text).toContain('timeout="90"');
    expect(handoffRes.text).not.toContain("<Reject/>");

    const duplicateOutcome = await request(app)
      .post("/safe-outcome")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(duplicateOutcome.text.toLowerCase()).toContain("do not retry");
    expect(startSaga).toHaveBeenCalledTimes(1);
    startSaga.mockRestore();

    // Verify session remains PIN_PENDING (never false COMPLETED before MoMo callback)
    const finalSession = transactionStateMachine.getSession(sessionId);
    expect(finalSession?.state).toBe("PIN_PENDING");
    expect(finalSession?.amount).toBe(75);
    expect(finalSession?.recipientName === "Sand Box" || finalSession?.recipientName === "Kwame Boateng").toBe(true);
  });

  it("continues from Twi final readback to the secure handset PIN handoff audio", async () => {
    const sessionId = "AT-TWI-PIN-HANDOFF-AUDIO-001";
    transactionStateMachine.getOrCreateSession(sessionId, "twi");
    transactionStateMachine.transition(sessionId, "INITIATED", { callerPhone: "+233543546010" });

    await request(app).post("/service-choice").send({ sessionId, lang: "twi", dtmfDigits: "1" });
    await request(app).post("/provider-choice").send({ sessionId, lang: "twi", dtmfDigits: "1" });
    await request(app).post("/action-choice").send({ sessionId, lang: "twi", dtmfDigits: "1" });
    const recipient = await request(app)
      .post("/verify-recipient")
      .send({ sessionId, lang: "twi", dtmfDigits: "0241234567" });
    expect(recipient.text).toContain("Ama Mensah");

    const recipientAccepted = await request(app)
      .post("/recipient-verify-choice")
      .send({ sessionId, lang: "twi", dtmfDigits: "1" });
    expect(recipientAccepted.text).toContain("/enter-amount");

    const amount = await request(app)
      .post("/verify-amount")
      .send({ sessionId, lang: "twi", dtmfDigits: "42" });
    expect(amount.text).toContain("/amount-readback-choice");

    const amountAccepted = await request(app)
      .post("/amount-readback-choice")
      .send({ sessionId, lang: "twi", dtmfDigits: "1" });
    expect(amountAccepted.text).toContain("/safe-confirmation");

    const finalReadback = await request(app)
      .get("/safe-confirmation")
      .query({ sessionId, lang: "twi" });
    expect(finalReadback.text).toContain("/safe-outcome");
    expect(finalReadback.text).toContain("Confirm_continue.mp3");

    const startSaga = vi.spyOn(paymentSaga, "executeConfirmedTransferSaga").mockResolvedValue({
      saga: {
        collectionReference: "twi-collection-test-reference",
        state: "WAITING_FOR_CUSTOMER_AUTHORIZATION",
      } as any,
      status: "PENDING",
      mode: "MOCK_PROVIDER",
    });
    try {
      const processing = await request(app)
        .post("/safe-outcome")
        .send({ sessionId, lang: "twi", dtmfDigits: "1" });

      expect(startSaga).toHaveBeenCalledTimes(0);
      expect(processing.text).toContain("Waiting_confirmation.mp3");
      expect(processing.text).toContain("/submit-transfer?");
      expect(startSaga).toHaveBeenCalledTimes(0);

      const handoff = await request(app)
        .post("/submit-transfer")
        .query({ sessionId, lang: "twi" });

      expect(startSaga).toHaveBeenCalledTimes(1);
      expect(handoff.headers["x-transaction-outcome"]).toBe("PENDING");
      expect(handoff.text).toContain("Pin_Handoff.mp3");
      expect(handoff.text).not.toContain("Waiting_confirmation.mp3");
      expect(handoff.text).not.toContain("/verify-pin");
      expect(handoff.text).not.toContain('numDigits="4"');
      expect(transactionStateMachine.getSession(sessionId)?.state).toBe("PIN_PENDING");
    } finally {
      startSaga.mockRestore();
    }
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

  it("never accepts a submitted PIN as payment confirmation", async () => {
    const sessionId = "AT-PIN-IS-NOT-PROOF-001";
    transactionStateMachine.getOrCreateSession(sessionId, "en");
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED", {
      recipientPhone: "0241234567",
      recipientName: "Test Recipient",
      isRecipientVerified: true,
    });
    transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED", { amount: 10 });
    transactionStateMachine.transition(sessionId, "CONFIRMED");
    transactionStateMachine.transition(sessionId, "PIN_PENDING");

    const response = await request(app)
      .post("/verify-pin")
      .query({ sessionId, lang: "en" })
      .send({ dtmfDigits: "1234" });

    expect(response.headers["x-payment-status"]).toBe("PENDING");
    expect(response.text).toContain("Do not enter or say your Mobile Money PIN here");
    expect(response.text).not.toContain("successful");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("PIN_PENDING");

    for (const route of ["enter-pin", "pin-handoff", "confirm-speech"]) {
      const legacyPinRoute = await request(app)
        .post(`/${route}`)
        .query({ sessionId, lang: "en" })
        .send({ dtmfDigits: "1234", speechText: "1234" });
      expect(legacyPinRoute.text).toContain("Do not enter or say your Mobile Money PIN here");
      expect(legacyPinRoute.text).not.toContain("<GetDigits");
      expect(legacyPinRoute.text).not.toContain("<Record");
      expect(transactionStateMachine.getSession(sessionId)?.state).toBe("PIN_PENDING");
    }

    const pinSpeechFallback = await request(app)
      .post(`/speech-fallback?step=pin-handoff&sessionId=${sessionId}&lang=en`)
      .send({ speechText: "1234" });
    expect(pinSpeechFallback.text).toContain("Do not enter or say your Mobile Money PIN here");
    expect(transactionStateMachine.getSession(sessionId)?.state).toBe("PIN_PENDING");

    const status = await request(app)
      .get(`/api/simulator/transaction-status?sessionId=${sessionId}`);
    expect(status.body.status).toBe("PIN_PENDING");
    expect(status.body.paymentStatus).toBe("PIN_PENDING");
  });

  it("keeps accessible PIN collection inside the simulator namespace", async () => {
    const sessionId = `AT-PIN-ISOLATION-${Date.now()}`;
    const liveResponse = await request(app)
      .post(`/enter-pin?sessionId=${sessionId}&accessiblePin=1`)
      .send({ sessionId });

    expect(liveResponse.text).toContain("Do not enter or say your Mobile Money PIN here");
    expect(liveResponse.text).not.toContain("<GetDigits");

    const simulatorResponse = await request(app)
      .post(`/api/simulator/enter-pin?sessionId=${sessionId}&accessiblePin=1`)
      .send({ sessionId });

    expect(simulatorResponse.text).toMatch(/<GetDigits\b[^>]*numDigits="4"/);
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
      sessionId,
      sessionLanguage: "en",
      telephonyContext: {
        currentStep: "service-select",
        transactionState: "INITIATED",
        recipientVerified: false,
      },
    }));
    expect(res.text).toContain(`/verify-recipient?sessionId=${sessionId}`);
    expect(res.text).toContain("Please enter the recipient&apos;s ten-digit phone number");
    expect(res.text).not.toContain("/api/audio/prompt-tts/en/OP16");
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

    expect(res.text).toContain("currently supports MTN and Telecel numbers only");
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
      expect(callRes.text).toContain(`/language-selection?sessionId=${sessionId}&amp;lang=twi&amp;secret=${secret}`);

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
      expect(serviceMenuRes.text).toContain("/audio/English_Library/2.m4a?format=mp3");
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

    expect(cancelRes.text).toContain("Your request was cancelled");
    expect(cancelRes.text).toContain("Check your Mobile Money transaction status");
    expect(cancelRes.text).toContain("<Reject/>");

    const session = transactionStateMachine.getSession(sessionId);
    expect(session?.state).toBe("CANCELLED");
  });

  it("explains Banking is unsupported when the unavailable option is selected", async () => {
    const res = await request(app)
      .post("/service-choice")
      .send({ sessionId: "AT-UNSUPPORTED-BANKING-001", lang: "en", dtmfDigits: "2" });

    expect(decodeURIComponent(res.headers["x-ai-reply-text"])).toContain("Banking is not supported in this pilot.");
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
    expect(menuRes.text).toContain("/audio/English_Library/2.m4a?format=mp3");

    const unavailableBankingChoice = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "3" });
    expect(decodeURIComponent(unavailableBankingChoice.headers["x-ai-reply-text"])).toContain("That service is not supported in this pilot.");
    expect(unavailableBankingChoice.text).not.toContain("/provider-select");
    expect(unavailableBankingChoice.text).not.toContain("directTransfer=1");

    const mobileMoneyChoice = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(mobileMoneyChoice.text).toContain("/provider-select");
    expect(mobileMoneyChoice.text).not.toContain("directTransfer=1");

    const unadvertisedChoice = await request(app)
      .post("/service-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "4" });
    expect(unadvertisedChoice.text).toContain("/audio/English_Library/2.m4a?format=mp3");
    expect(unadvertisedChoice.text).not.toContain("<Say");
  });

  it("executes the exact 7-step canonical MoMo voice flow (Ama Mensah, 500 GHS, Zero-PIN handoff, receipt)", async () => {
    const sessionId = "MOMO-CANONICAL-7STEP";

    // Step 1: Welcome & Language Selection
    const welcomeRes = await request(app)
      .post("/voice-menu")
      .send({ sessionId, callerNumber: "+233543546010", isActive: "1" });
    expect(welcomeRes.status).toBe(200);
    expect(welcomeRes.text.match(/<Play\b/gi) || []).toHaveLength(1);
    expect(welcomeRes.text).toContain("/audio/Twi/Opening_voice_welcome_to_okwankyerefopa.mp3");
    expect(welcomeRes.text).not.toContain("Sɛ wopɛ Borɔfo");

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
    expect(amountRes.text).toContain("/amount-readback-choice");

    const amountAccepted = await request(app)
      .post("/amount-readback-choice")
      .send({ sessionId, lang: "en", dtmfDigits: "1" });
    expect(amountAccepted.text).toContain("/safe-confirmation");

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
    expect(handoffRes.text).toContain("Waiting_confirmation.mp3");
    expect(handoffRes.text).toContain("/submit-transfer?");
    expect(startSaga).not.toHaveBeenCalled();

    const pendingRes = await request(app)
      .post("/submit-transfer")
      .query({ sessionId, lang: "en" });
    expect(startSaga).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      senderPhone: "+233543546010",
      recipientPhone: "0241234567",
      amount: 500,
      network: "MTN",
    }));
    startSaga.mockRestore();
    expect(pendingRes.text).toContain("Approve it on your handset.");
    expect(pendingRes.text).not.toContain("Waiting_confirmation.mp3");
    expect(pendingRes.text).toContain("/check-status");
    expect(pendingRes.text).toContain('timeout="90"');
    expect(pendingRes.text).not.toContain("<Reject/>");

    const stateAfterHandoff = transactionStateMachine.getSession(sessionId);
    expect(stateAfterHandoff?.state).toBe("PIN_PENDING");
    expect(stateAfterHandoff?.amount).toBe(500);
    expect(stateAfterHandoff?.recipientName).toBe("Ama Mensah");

    // Step 7: Only trusted provider evidence can produce the receipt.
    const providerStatus = vi.spyOn(paymentSaga, "getLatestSagaForSession").mockReturnValue({
      sagaId: "MOMO-CANONICAL-COMPLETE",
      sessionId,
      state: "COMPLETED",
      providerFinancialTransactionId: "provider-financial-id",
    } as any);
    const receipt = await request(app).post("/check-status").query({ sessionId, lang: "en" });
    providerStatus.mockRestore();
    expect(receipt.headers["x-payment-status"]).toBe("SUCCESSFUL");
    expect(receipt.text).toContain("Your transfer of");
    const completedSession = transactionStateMachine.getSession(sessionId)!;
    expect(completedSession.state).toBe("COMPLETED");
    expect(completedSession.referenceId).toMatch(/^OKP-\d+$/);
    expect(completedSession.amount).toBe(500);
    expect(completedSession.recipientName).toBe("Ama Mensah");
  });
});
