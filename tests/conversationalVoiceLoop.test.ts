import { describe, it, expect } from "vitest";
import {
  CONVERSATIONAL_PROMPT_CATALOG,
  getConversationalPrompt,
} from "../src/audio/catalog";
import { voiceInteractionController } from "../src/ai_system/voice/voiceInteractionController";
import { determineSpeechOutput } from "../src/hooks/usePhoneSimulator";
import { formatSpokenNumbersAsDigits } from "../src/domain/numberFormatter";

describe("Conversational Voice Layer & Audio Pipeline Verification", () => {
  describe("1. Dedicated Conversational Prompt Catalogue", () => {
    it("plays correct English conversational welcome prompt (not keypad menu)", () => {
      const prompt = getConversationalPrompt("welcome", "en");
      expect(prompt.id).toBe("conversational_welcome_en");
      expect(prompt.spokenText).toBe(
        "Welcome to Ɔkwankyerɛfo Pa. I am ready to help you. Tell me what you would like to do, in your own words. You can speak naturally."
      );
      // Must NOT contain keypad instructions like 'Press 1'
      expect(prompt.spokenText).not.toContain("Press 1");
      expect(prompt.spokenText).not.toContain("Press 2");
    });

    it("plays separately reviewed Twi conversational welcome prompt", () => {
      const prompt = getConversationalPrompt("welcome", "twi");
      expect(prompt.id).toBe("conversational_welcome_tw");
      expect(prompt.spokenText).toBe(
        "Akwaaba kɔ Ɔkwankyerɛfo Pa. Meyɛ krado sɛ mɛboa wo. Ka nea wobɛpɛ sɛ woyɛ kyerɛ me wɔ w'ankasa w'anom asɛm mu. Wobɛtumi akasa sɛnea ɛteɛ."
      );
      expect(prompt.spokenText).not.toContain("Mia baako");
      expect(prompt.spokenText).not.toContain("Mia 1");
    });

    it("provides dedicated listening prompt cues", () => {
      const en = getConversationalPrompt("listening", "en");
      const tw = getConversationalPrompt("listening", "twi");
      expect(en.spokenText).toContain("I am listening");
      expect(tw.spokenText).toContain("Meretie wo");
    });

    it("provides dedicated retry prompts for no speech or failed transcription", () => {
      const en = getConversationalPrompt("retry", "en");
      const tw = getConversationalPrompt("retry", "twi");
      expect(en.spokenText).toContain("Sorry, I did not understand that clearly. Please say it again, slowly");
      expect(tw.spokenText).toContain("Kafra, mante nea wokae no yiye. Mesrɛ wo, ka bio brɛoo");
    });

    it("provides dedicated clarify prompts when required information is missing", () => {
      const en = getConversationalPrompt("clarify", "en");
      const tw = getConversationalPrompt("clarify", "twi");
      expect(en.spokenText).toContain("I can help with that. Please tell me the information I need to continue.");
      expect(tw.spokenText).toContain("Mebɛtumi aboa wo wɔ saa asɛm no ho.");
    });

    it("provides dedicated confirm prompts before transaction dispatch", () => {
      const en = getConversationalPrompt("confirm", "en");
      const tw = getConversationalPrompt("confirm", "twi");
      expect(en.spokenText).toContain("Please listen carefully while I repeat the details.");
      expect(tw.spokenText).toContain("Mesrɛ wo, tie yiye berɛ a mereti nkyerɛkyerɛmu no mu.");
    });

    it("provides dedicated complete prompts only after verified success", () => {
      const en = getConversationalPrompt("complete", "en");
      const tw = getConversationalPrompt("complete", "twi");
      expect(en.spokenText).toBe("Your transaction has been completed successfully.");
      expect(tw.spokenText).toBe("Wo dwumadie no awie pɛpɛɛpɛ.");
    });

    it("provides dedicated failed prompts when transaction fails or remains unconfirmed", () => {
      const en = getConversationalPrompt("failed", "en");
      const tw = getConversationalPrompt("failed", "twi");
      expect(en.spokenText).toContain("I cannot confirm that the transaction was successful.");
      expect(tw.spokenText).toContain("Mirentumi nsi so dua sɛ dwumadie no akɔ so yiye.");
    });
  });

  describe("2. Conversational Audio Dispatch vs Keypad Audio Isolation", () => {
    it("ensures conversational welcome is never mapped to static keypad Welcome_prompt_01.mp3", () => {
      const conversationalText =
        "Welcome to Ɔkwankyerɛfo Pa. I am ready to help you. Tell me what you would like to do, in your own words. You can speak naturally.";
      const speech = determineSpeechOutput(conversationalText, "en", "welcome");
      // Must be dynamic TTS, NOT recorded keypad Welcome_prompt_01.mp3
      expect(speech.kind).toBe("tts");
    });

    it("ensures static keypad greeting is mapped to Welcome_prompt_01.mp3 only when explicit keypad instructions exist", () => {
      const keypadText = "Welcome to Okwankyerɛfo Pa. Press 1 for English, press 2 for Twi.";
      const speech = determineSpeechOutput(keypadText, "en", "welcome");
      expect(speech.kind).toBe("recorded");
      if (speech.kind === "recorded") {
        expect(speech.url).toContain("Welcome_prompt_01.mp3");
      }
    });
  });

  describe("3. Voice Interaction Controller Session Lifecycle & State Machine", () => {
    it("starts a conversational session with autoListen: true and PLAYING_RESPONSE state", async () => {
      const sessionId = `test_conv_${Date.now()}`;
      const response = await voiceInteractionController.startSession(sessionId, "conversational", "en");

      expect(response.state).toBe("PLAYING_RESPONSE");
      expect(response.autoListen).toBe(true);
      expect(response.replyText).toContain("Welcome to Ɔkwankyerɛfo Pa. I am ready to help you.");
      expect(response.promptStep).toBe("welcome");
    });

    it("returns conversational retry prompt when no speech/silence is detected", async () => {
      const sessionId = `test_silence_${Date.now()}`;
      await voiceInteractionController.startSession(sessionId, "conversational", "en");

      // Process turn with empty transcript (simulating silence)
      const turnRes = await voiceInteractionController.processTurn({
        sessionId,
        transcript: "",
      });

      expect(turnRes.state).toBe("PLAYING_RESPONSE");
      expect(turnRes.autoListen).toBe(true);
      expect(turnRes.replyText).toContain("Sorry, I did not understand that clearly");
    });
  });

  describe("4. Preservation of Ghanaian Phone Numbers and Leading Zeroes", () => {
    it("preserves leading zero on Ghanaian phone numbers", () => {
      const input = "zero five five three eight three eight four six four";
      const normalized = formatSpokenNumbersAsDigits(input);
      expect(normalized).toBe("0553838464");
      expect(normalized.startsWith("0")).toBe(true);
    });

    it("preserves 10 digits for MTN numbers starting with 024", () => {
      const input = "zero two four one two three four five six seven";
      const normalized = formatSpokenNumbersAsDigits(input);
      expect(normalized).toBe("0241234567");
    });
  });
});
