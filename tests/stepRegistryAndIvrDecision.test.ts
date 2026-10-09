import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { getStepDefinition, validateKeypadInput, STEP_REGISTRY } from "../src/domain/stepRegistry";
import { validateGhanaPhoneNumber, parseAndValidateAmount } from "../src/domain/validation";
import { ivrDecisionEngine, IvrDecisionEngine } from "../src/ai_system/brain/ivrDecisionEngine";
import { brain } from "../src/ai_system/brain/brain";
import { ivrRouter } from "../src/routes/voiceRoutes";
import { PROMPT_TABLE, PROMPT_SCRIPTS } from "../src/modules/ttsService";

describe("Step Registry & Canonical Input Contracts", () => {
  it("defines every required IVR step with prompt keys and accepted inputs", () => {
    const requiredSteps = [
      "voice-menu",
      "language-selection",
      "service-select",
      "provider-select",
      "action-select",
      "enter-recipient",
      "recipient-verify-choice",
      "enter-amount",
      "safe-confirmation",
    ];

    for (const stepId of requiredSteps) {
      const step = getStepDefinition(stepId);
      expect(step, `Missing step ${stepId}`).not.toBeNull();
      expect(step!.promptKey).toBeDefined();
      expect(step!.promptText.en).toBeDefined();
      expect(step!.promptText.twi).toBeDefined();
      expect(step!.inputType).toBeDefined();
      expect(step!.navigation).toBeDefined();
    }
  });

  describe("Menu Navigation Contracts (8=Back, 9=Repeat, 0=Exit)", () => {
    it("service-select: accepts 1 and 2, back 8, repeat 9, cancel 0; rejects invalid digits 5, 6, 7", () => {
      const step = getStepDefinition("service-select")!;
      expect(validateKeypadInput(step, "1").valid).toBe(true);
      expect(validateKeypadInput(step, "2").valid).toBe(true);
      expect(validateKeypadInput(step, "8").valid).toBe(true);
      expect(validateKeypadInput(step, "8").isNavigation).toBe(true);
      expect(validateKeypadInput(step, "8").targetStep).toBe("language-selection");
      expect(validateKeypadInput(step, "9").isNavigation).toBe(true);
      expect(validateKeypadInput(step, "0").isNavigation).toBe(true);

      // Keys 5, 6, 7 are invalid choices
      for (const invalidKey of ["5", "6", "7"]) {
        const res = validateKeypadInput(step, invalidKey);
        expect(res.valid).toBe(false);
        expect(res.errorReason).toContain(`Key '${invalidKey}' is not an option`);
      }
    });

    it("provider-select: accepts 1, 2, 3, repeat 9, cancel 0; rejects 8 and invalid digits", () => {
      const step = getStepDefinition("provider-select")!;
      expect(validateKeypadInput(step, "1").valid).toBe(true);
      expect(validateKeypadInput(step, "2").valid).toBe(true);
      expect(validateKeypadInput(step, "3").valid).toBe(true);
      expect(validateKeypadInput(step, "9").isNavigation).toBe(true);
      expect(validateKeypadInput(step, "0").isNavigation).toBe(true);

      // In provider-select, 8 is not an option (prompt does not offer 8 to go back)
      const res8 = validateKeypadInput(step, "8");
      expect(res8.valid).toBe(false);
      expect(res8.errorReason).toContain("Key '8' is not an option");
    });

    it("action-select: allows back 8 (to provider-select), repeat 9, cancel 0", () => {
      const step = getStepDefinition("action-select")!;
      expect(validateKeypadInput(step, "1").valid).toBe(true);
      expect(validateKeypadInput(step, "2").valid).toBe(true);

      const res8 = validateKeypadInput(step, "8");
      expect(res8.valid).toBe(true);
      expect(res8.isNavigation).toBe(true);
      expect(res8.navAction).toBe("back");
      expect(res8.targetStep).toBe("provider-select");
    });

    it("recipient-verify-choice: allows 1 (confirm), 2 (re-enter), back 8, repeat 9, cancel 0", () => {
      const step = getStepDefinition("recipient-verify-choice")!;
      expect(validateKeypadInput(step, "1").valid).toBe(true);
      expect(validateKeypadInput(step, "2").valid).toBe(true);

      const res8 = validateKeypadInput(step, "8");
      expect(res8.valid).toBe(true);
      expect(res8.isNavigation).toBe(true);
      expect(res8.navAction).toBe("back");
      expect(res8.targetStep).toBe("enter-recipient");
    });
  });

  describe("Recipient Phone Number Validation", () => {
    it("accepts valid 10-digit Ghana mobile numbers across MTN, Telecel, and AT", () => {
      const validNumbers = [
        { num: "0241234567", network: "MTN" },
        { num: "0553838464", network: "MTN" },
        { num: "0201234567", network: "Telecel" },
        { num: "0501234567", network: "Telecel" },
        { num: "0271234567", network: "AT" },
      ];

      for (const { num, network } of validNumbers) {
        const val = validateGhanaPhoneNumber(num);
        expect(val.valid, `Failed on ${num}`).toBe(true);
        expect(val.network).toBe(network);
      }
    });

    it("identifies why numbers are rejected: unknown prefix (666, 555, 095)", () => {
      const res666 = validateGhanaPhoneNumber("6666666666");
      expect(res666.valid).toBe(false);
      expect(res666.error).toContain("Invalid Ghanaian network prefix '666'");

      const res555 = validateGhanaPhoneNumber("5555555555");
      expect(res555.valid).toBe(false);
      expect(res555.error).toContain("Invalid Ghanaian network prefix '555'");

      const res095 = validateGhanaPhoneNumber("952547858");
      expect(res095.valid).toBe(false);
      expect(res095.error).toContain("Invalid Ghanaian network prefix '095'");
    });

    it("identifies why numbers are rejected: length (555639, 1457, 99977)", () => {
      const short6 = validateGhanaPhoneNumber("555639");
      expect(short6.valid).toBe(false);
      expect(short6.error).toContain("received 6");

      const short4 = validateGhanaPhoneNumber("1457");
      expect(short4.valid).toBe(false);
      expect(short4.error).toContain("received 4");

      const short5 = validateGhanaPhoneNumber("99977");
      expect(short5.valid).toBe(false);
      expect(short5.error).toContain("received 5");
    });
  });

  describe("Amount Validation", () => {
    it("accepts valid amounts in Cedis and pesewas via star notation", () => {
      expect(parseAndValidateAmount("50").amount).toBe(50);
      expect(parseAndValidateAmount("25*50").amount).toBe(25.5);
      expect(parseAndValidateAmount("100#").amount).toBe(100);
    });

    it("rejects malformed amounts with explicit error reasons", () => {
      expect(parseAndValidateAmount("*50").valid).toBe(false);
      expect(parseAndValidateAmount("5*0*1").valid).toBe(false);
      expect(parseAndValidateAmount("0").valid).toBe(false);
      expect(parseAndValidateAmount("10000").valid).toBe(false); // exceeds 5,000 GHS limit
    });
  });
});

describe("Cognitive IVR Decision Engine Structured Decisions", () => {
  const engine = new IvrDecisionEngine();

  it("decision type 'invalid_choice': explains key and replays same prompt without advancing", () => {
    const decision = engine.decide({
      stepId: "service-select",
      language: "en",
      input: "5",
      inputMethod: "keypad",
      retryCount: 1,
    });

    expect(decision.type).toBe("invalid_choice");
    expect(decision.reason).toContain("Input '5' is not a valid option");
    expect(decision.replyText).toContain("Option 5 is not a valid choice");
    expect(decision.action).toBe("replay");
    expect(decision.promptReplayKey).toBe("service_select");
  });

  it("decision type 'invalid_choice': states specific phone number defect", () => {
    // 1. Prefix 666
    const decision666 = engine.decide({
      stepId: "enter-recipient",
      language: "en",
      input: "6666666666",
      inputMethod: "keypad",
      retryCount: 1,
    });
    expect(decision666.type).toBe("invalid_choice");
    expect(decision666.reason).toContain("prefix '666'");
    expect(decision666.replyText).toContain("prefix 666 is not a valid Ghanaian mobile network");

    // 2. Short number
    const decisionShort = engine.decide({
      stepId: "enter-recipient",
      language: "en",
      input: "555639",
      inputMethod: "keypad",
      retryCount: 1,
    });
    expect(decisionShort.type).toBe("invalid_choice");
    expect(decisionShort.reason).toContain("only 6 digits");
    expect(decisionShort.replyText).toContain("too short with only 6 digits");
  });

  it("decision type 'understood_intent': spoken 'send money' advances to enter-recipient", () => {
    const decision = engine.decide({
      stepId: "service-select",
      language: "en",
      input: "send money",
      inputMethod: "speech",
    });

    expect(decision.type).toBe("understood_intent");
    expect(decision.nextStep).toBe("enter-recipient");
    expect(decision.action).toBe("advance");
    expect(decision.replyText).toContain("enter the recipient's ten-digit phone number");
  });

  it("decision type 'understood_intent': spoken number advances to recipient confirmation", () => {
    const decision = engine.decide({
      stepId: "enter-recipient",
      language: "en",
      input: "0553838464",
      inputMethod: "speech",
    });

    expect(decision.type).toBe("understood_intent");
    expect(decision.nextStep).toBe("recipient-verify-choice");
    expect(decision.action).toBe("advance");
    expect(decision.updatedSlots?.recipientPhone).toBe("0553838464");
    expect(decision.updatedSlots?.network).toBe("MTN");
  });

  it("decision type 'unsupported': explains unsupported banking, loans, or balance inquiry", () => {
    const decBank = engine.decide({
      stepId: "service-select",
      language: "en",
      input: "I want to apply for a loan",
      inputMethod: "speech",
    });
    expect(decBank.type).toBe("unsupported");
    expect(decBank.replyText).toContain("currently not supported");

    const decBal = engine.decide({
      stepId: "action-select",
      language: "en",
      input: "what's my balance",
      inputMethod: "speech",
    });
    expect(decBal.type).toBe("unsupported");
    expect(decBal.replyText).toContain("star one seven zero hash");
  });

  it("decision type 'clarify': spoken 'say again please' repeats prompt", () => {
    const decision = engine.decide({
      stepId: "provider-select",
      language: "en",
      input: "say again please",
      inputMethod: "speech",
    });
    expect(decision.type).toBe("clarify");
    expect(decision.action).toBe("repeat");
    expect(decision.promptReplayKey).toBe("provider_select");
  });

  it("enforces max-retry hangup gate when retryCount >= 3", () => {
    const decision = engine.decide({
      stepId: "service-select",
      language: "en",
      input: "99",
      inputMethod: "keypad",
      retryCount: 3,
    });
    expect(decision.action).toBe("hangup");
    expect(decision.replyText).toContain("Too many unrecognized attempts");
  });

  it("brain exposes decideIvr delegating directly to ivrDecisionEngine", () => {
    const decision = brain.decideIvr({
      stepId: "service-select",
      language: "en",
      input: "5",
      inputMethod: "keypad",
      retryCount: 1,
    });
    expect(decision.type).toBe("invalid_choice");
    expect(decision.action).toBe("replay");
  });
});

describe("TTS Table Reply Keys & Studio Recording Scripts", () => {
  it("contains all cognitive reply keys in PROMPT_TABLE and PROMPT_SCRIPTS", () => {
    const expectedKeys = [
      "invalid_choice",
      "intent_understood_ask_number",
      "intent_understood_ask_amount",
      "intent_understood_proceed",
      "number_invalid",
      "network_unsupported",
      "service_unsupported",
      "amount_invalid",
      "balance_inquiry_unsupported",
      "unknown_input",
      "max_retries_exceeded",
    ];

    for (const key of expectedKeys) {
      expect(PROMPT_TABLE[key], `Missing ${key} in PROMPT_TABLE`).toBeDefined();
      expect(PROMPT_SCRIPTS[key], `Missing ${key} in PROMPT_SCRIPTS`).toBeDefined();
      expect(PROMPT_SCRIPTS[key].en.length).toBeGreaterThan(10);
      expect(PROMPT_SCRIPTS[key].twi.length).toBeGreaterThan(10);
    }
  });
});

describe("IVR Telephony Route Integration (Real Express XML Responses)", () => {
  const app = express();
  app.use((req, _res, next) => {
    req.headers.host = "localhost:3000";
    next();
  });
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(ivrRouter);

  it("Scenario a: At service step press 5: replies 5 is not an option, replays prompt, does not advance", async () => {
    const res = await request(app)
      .post("/service-choice?sessionId=TEST_SESS_A&lang=en")
      .send({ dtmfDigits: "5" });

    expect(res.status).toBe(200);
    expect(res.headers["x-ai-decision-type"]).toBe("invalid_choice");
    expect(res.headers["x-ai-decision-reason"]).toContain("1 for Mobile Money, 2 for Banking");
    expect(res.text).toContain("<Say voice=\"female\">Option 5 is not a valid choice");
    expect(res.text).toContain("<GetDigits");
    expect(res.text).toContain("callbackUrl=\"http://localhost:3000/service-choice?sessionId=TEST_SESS_A&amp;lang=en\"");
    expect(res.text).toContain("Audio_prompt_02.mp3");
    expect(res.text).not.toContain("<Redirect");
  });

  it("Scenario b: At service step say 'send money': replies understood, asks for recipient, moves to enter-recipient", async () => {
    const res = await request(app)
      .post("/speech-fallback?step=service-select&sessionId=TEST_SESS_B&lang=en")
      .send({ speechText: "I want to send money" });

    expect(res.status).toBe(200);
    expect(res.headers["x-ai-decision-type"]).toBe("understood_intent");
    expect(res.headers["x-ai-reply-key"]).toBe("intent_understood_ask_number");
    expect(res.text).toContain("enter the recipient's ten-digit phone number");
    expect(res.text).toContain("<GetDigits timeout=\"40\" finishOnKey=\"#\" numDigits=\"10\"");
    expect(res.text).toContain("callbackUrl=\"http://localhost:3000/verify-recipient?sessionId=TEST_SESS_B&amp;lang=en\"");
    expect(res.text).toContain("Audio_prompt_06.mp3");
  });

  it("Scenario c (invalid phone): At enter-recipient enter '6666666666#': states invalid prefix 666, re-prompts", async () => {
    const res = await request(app)
      .post("/verify-recipient?sessionId=TEST_SESS_C&lang=en")
      .send({ dtmfDigits: "6666666666#" });

    expect(res.status).toBe(200);
    expect(res.headers["x-ai-decision-type"]).toBe("invalid_choice");
    expect(res.headers["x-ai-decision-reason"]).toContain("prefix '666'");
    expect(res.text).toContain("The prefix 666 is not a valid Ghanaian mobile network");
    expect(res.text).toContain("<GetDigits timeout=\"40\" finishOnKey=\"#\" numDigits=\"10\"");
    expect(res.text).toContain("Audio_prompt_06.mp3");
  });

  it("Scenario c (valid phone): At enter-recipient enter '0553838464#': resolves MTN recipient and asks for confirmation", async () => {
    const res = await request(app)
      .post("/verify-recipient?sessionId=TEST_SESS_C_VALID&lang=en")
      .send({ dtmfDigits: "0553838464#" });

    expect(res.status).toBe(200);
    expect(res.text).toContain("<GetDigits timeout=\"12\" finishOnKey=\"#\" numDigits=\"1\"");
    expect(res.text).toContain("callbackUrl=\"http://localhost:3000/recipient-verify-choice?sessionId=TEST_SESS_C_VALID&amp;lang=en\"");
  });

  it("Pressing 8 at network step (provider-choice) does not jump back: treated as invalid key", async () => {
    const res = await request(app)
      .post("/provider-choice?sessionId=TEST_SESS_NET8&lang=en")
      .send({ dtmfDigits: "8" });

    expect(res.status).toBe(200);
    expect(res.headers["x-ai-decision-type"]).toBe("invalid_choice");
    expect(res.text).toContain("Option 8 is not a valid choice");
    expect(res.text).toContain("callbackUrl=\"http://localhost:3000/provider-choice?sessionId=TEST_SESS_NET8&amp;lang=en\"");
    expect(res.text).not.toContain("service-select");
  });
});
