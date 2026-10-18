import { describe, it, expect } from "vitest";
import { AUDIO_RECORDINGS, getRecordingByPromptId } from "../src/audio/recordingRegistry";
import {
  CANONICAL_PROMPTS,
  CANONICAL_PROMPT_LIST,
  DYNAMIC_PROMPT_IDS,
  STATE_TO_CANONICAL_PROMPT_ID,
  isDynamicPrompt,
  getCanonicalPrompt,
  getCanonicalPromptByState,
  resolvePromptSpokenText,
  resolveCanonicalAudioUrl,
  buildVoiceXmlForCanonicalPrompt,
} from "../src/audio/canonicalRegistry";

describe("Canonical Prompt Registry (OP01–OP94)", () => {
  it("defines all 94 canonical prompt IDs from OP01 through OP94", () => {
    for (let i = 1; i <= 94; i++) {
      const id = `OP${i < 10 ? "0" + i : i}`;
      const prompt = getCanonicalPrompt(id);
      expect(prompt, `Expected ${id} to exist in CANONICAL_PROMPTS`).toBeDefined();
      expect(prompt?.id).toBe(id);
      expect(prompt?.state).toBeTruthy();
      expect(prompt?.english).toBeTruthy();
      expect(prompt?.twi).toBeTruthy();
    }
  });

  it("strictly classifies OP20, OP21, OP29, OP35, OP52, OP70 as DYNAMIC", () => {
    const expectedDynamic = ["OP20", "OP21", "OP29", "OP35", "OP52", "OP52b", "OP70"];
    for (const id of expectedDynamic) {
      expect(isDynamicPrompt(id)).toBe(true);
      const prompt = getCanonicalPrompt(id);
      expect(prompt?.type).toBe("DYNAMIC");
    }

    // Verify non-dynamic prompts are FIXED
    expect(isDynamicPrompt("OP01")).toBe(false);
    expect(isDynamicPrompt("OP02")).toBe(false);
    expect(isDynamicPrompt("OP07")).toBe(false);
    expect(isDynamicPrompt("OP34")).toBe(false);
    expect(isDynamicPrompt("OP94")).toBe(false);
  });

  it("maps key state machine states to their canonical prompt IDs", () => {
    expect(STATE_TO_CANONICAL_PROMPT_ID.WELCOME).toBe("OP01");
    expect(STATE_TO_CANONICAL_PROMPT_ID.LANGUAGE_SELECTION).toBe("OP02");
    expect(STATE_TO_CANONICAL_PROMPT_ID.SERVICE_SELECTION).toBe("OP07");
    expect(STATE_TO_CANONICAL_PROMPT_ID.RECIPIENT_NAME).toBe("OP20");
    expect(STATE_TO_CANONICAL_PROMPT_ID.RECIPIENT_FULL_NUMBER).toBe("OP21");
    expect(STATE_TO_CANONICAL_PROMPT_ID.AMOUNT_READBACK).toBe("OP29");
    expect(STATE_TO_CANONICAL_PROMPT_ID.CONFIRM_UNDERSTANDING).toBe("OP70");
    expect(STATE_TO_CANONICAL_PROMPT_ID.SUCCESS).toBe("OP52");

    expect(getCanonicalPromptByState("WELCOME")?.id).toBe("OP01");
    expect(getCanonicalPromptByState("LANGUAGE_SELECTION")?.id).toBe("OP02");
    expect(getCanonicalPromptByState("AMOUNT_READBACK")?.id).toBe("OP29");
  });

  it("selects the approved Twi library recording for prompts that have one", () => {
    const candidates = AUDIO_RECORDINGS.filter((recording) => recording.promptId === "OP01" && recording.language === "twi");
    const approved = candidates.find((recording) => recording.id.startsWith("supplied:Twi_library/"));
    expect(approved).toBeDefined();
    expect(approved?.audioVerified).toBe(true);
    expect(getRecordingByPromptId("OP01", "twi")).toBe(approved);
  });

  describe("Dynamic Template Rendering (Zero Placeholder Guarantee)", () => {
    it("recognizes OP52b as a dynamic reference read-back using the current transaction reference", () => {
      expect(isDynamicPrompt("OP52b")).toBe(true);
      expect(isDynamicPrompt("OP52B")).toBe(true);
      expect(getCanonicalPrompt("OP52b")?.type).toBe("DYNAMIC");

      const text = resolvePromptSpokenText("OP52b", "en", { referenceId: "OKP-654321" });
      expect(text).toContain("six ... five ... four ... three ... two ... one");
      expect(text).not.toContain("OKP-272");
      expect(text).not.toContain("OKP-782914");
    });

    it("renders OP20 (Recipient Name) with real KYC name in English and Twi without [DYNAMIC NAME]", () => {
      const enText = resolvePromptSpokenText("OP20", "en", { name: "Kofi Mensah" });
      expect(enText).toContain("Kofi Mensah");
      expect(enText).not.toContain("[DYNAMIC NAME]");
      expect(enText).not.toContain("{NAME}");

      const twiText = resolvePromptSpokenText("OP20", "twi", { name: "Kwame Asante" });
      expect(twiText).toContain("Kwame Asante");
      expect(twiText).not.toContain("[DYNAMIC NAME]");
      expect(twiText).not.toContain("{NAME}");
    });

    it("renders OP21 (Recipient Full Number) with spaced out digits for telephony clarity", () => {
      const enText = resolvePromptSpokenText("OP21", "en", { phone: "0543546010" });
      expect(enText).toContain("0 5 4 3 5 4 6 0 1 0");
      expect(enText).not.toContain("[ALL TEN DIGITS]");
      expect(enText).not.toContain("{PHONE}");

      const twiText = resolvePromptSpokenText("OP21", "twi", { phone: "0244123456" });
      expect(twiText).not.toContain("[ALL TEN DIGITS]");
      expect(twiText).not.toContain("{PHONE}");
    });

    it("renders OP29 (Amount Readback) with formatted Cedis and Pesewas in English and Twi", () => {
      const enText = resolvePromptSpokenText("OP29", "en", { amount: 50 });
      expect(enText).toContain("50");
      expect(enText).toContain("Ghana cedis");
      expect(enText).not.toContain("[DYNAMIC AMOUNT]");
      expect(enText).not.toContain("{AMOUNT}");

      const twiText = resolvePromptSpokenText("OP29", "twi", { amount: 120 });
      expect(twiText).toContain("120");
      expect(twiText).toContain("Ghana cedis");
      expect(twiText).not.toContain("[DYNAMIC AMOUNT]");
      expect(twiText).not.toContain("{AMOUNT}");
    });

    it("renders OP35 from current transaction fields and limits phone readback to the last four digits", () => {
      const text = resolvePromptSpokenText("OP35", "en", {
        amount: 50,
        recipientName: "Ama Mensah",
        recipientPhone: "0241234567",
        network: "MTN",
      });
      expect(text).toContain("50");
      expect(text).toContain("Ama Mensah");
      expect(text).toContain("MTN");
      expect(text).toContain("5 6 7");
      expect(text).not.toContain("0 2 4 1 2 3 4 5 6 7");
      expect(text).not.toContain("Press 1 to confirm");
      expect(resolvePromptSpokenText("OP35", "en", { amount: 50 })).toContain("cannot continue");
    });

    it("renders OP52 (Success Reference) with formatted reference ID", () => {
      const enText = resolvePromptSpokenText("OP52", "en", {
        ref: "OKP-847291",
        amount: 50,
        recipientName: "Ama Mensah",
      });
      expect(enText).toContain("O K P - 8 4 7 2 9 1");
      expect(enText).toContain("50");
      expect(enText).toContain("Ama Mensah");
      expect(enText).not.toContain("[DYNAMIC REFERENCE]");
      expect(enText).not.toContain("{REF}");

      const twiText = resolvePromptSpokenText("OP52", "twi", {
        ref: "OKP-123456",
        amount: 120,
        recipientName: "Ama Mensah",
      });
      expect(twiText).toContain("O K P - 1 2 3 4 5 6");
      expect(twiText).not.toContain("[DYNAMIC REFERENCE]");
      expect(twiText).not.toContain("{REF}");
      expect(resolvePromptSpokenText("OP52", "en", { ref: "OKP-123456" })).toContain("cannot continue");
    });

    it("renders OP70 (Acoustic Confirmation) with caller utterance", () => {
      const enText = resolvePromptSpokenText("OP70", "en", { utterance: "fifty cedis" });
      expect(enText).toContain("fifty cedis");
      expect(enText).not.toContain("[DYNAMIC RESPONSE]");
      expect(enText).not.toContain("{RESPONSE}");

      const twiText = resolvePromptSpokenText("OP70", "twi", { utterance: "Ghana cedis aduonum" });
      expect(twiText).toContain("Ghana cedis aduonum");
      expect(twiText).not.toContain("[DYNAMIC RESPONSE]");
      expect(twiText).not.toContain("{RESPONSE}");
    });
  });

  describe("Canonical Audio URL & VoiceXML Generation", () => {
    it("routes dynamic prompts to approved dynamic TTS endpoint and never static recordings", () => {
      const audioResult = resolveCanonicalAudioUrl("OP20", "en", "https://api.example.com", {
        name: "Abena Mansa",
      });
      expect(audioResult.mode).toBe("DYNAMIC_TTS");
      expect(audioResult.url).toContain("/api/audio/prompt-tts/en/OP20");
      expect(audioResult.url).toContain("name=Abena+Mansa");
      expect(audioResult.url).not.toContain(".m4a");
      expect(audioResult.url).not.toContain(".mp3");
    });

    it("routes unreviewed fixed prompts (OP01) through canonical TTS", () => {
      const audioResult = resolveCanonicalAudioUrl("OP01", "en", "https://api.example.com");
      expect(audioResult.mode).toBe("DYNAMIC_TTS");
      expect(audioResult.url).toBe("https://api.example.com/api/audio/prompt-tts/en/OP01");
    });

    it("builds valid VoiceXML with GetDigits and dynamic Say for OP20", () => {
      const xml = buildVoiceXmlForCanonicalPrompt({
        promptId: "OP20",
        language: "en",
        baseUrl: "https://example.com",
        params: { name: "Kwame Asante" },
        getDigits: { callbackUrl: "/verify-recipient-choice", timeout: 10, numDigits: 1 },
      });

      expect(xml).toContain('<GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="/verify-recipient-choice">');
      expect(xml).toContain('<Say voice="alice">');
      expect(xml).toContain("Kwame Asante");
      expect(xml).not.toContain("[DYNAMIC NAME]");
    });
  });
});
