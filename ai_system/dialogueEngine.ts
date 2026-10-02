/**
 * Ɔkwankyerɛfo Pa - AI Conversational Dialogue State Machine
 * Manages multi-turn voice sessions, transaction memory, and security guarantees.
 */

import {
  DialogueSessionState,
  DialogueTurn,
  ExtractedSlots,
  SupportedLanguage,
  VoicePromptResult,
} from "./types";
import { transcriptionEngine } from "./transcriptionEngine";
import { nluEngine } from "./nluEngine";
import { speechSynthesisEngine } from "./speechSynthesisEngine";

export class DialogueEngine {
  private sessions: Map<string, DialogueSessionState> = new Map();

  /**
   * Initializes or fetches an active dialogue session.
   */
  public getOrCreateSession(sessionId: string, callerPhone: string = ""): DialogueSessionState {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        callerPhone,
        selectedLanguage: "bilingual",
        currentStep: "LANGUAGE_SELECT",
        transactionData: {},
        turns: [],
        retryCount: 0,
        maxRetries: 3,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * Processes a turn from spoken audio or raw text.
   */
  public async handleTurn(
    sessionId: string,
    input: { audioBuffer?: Buffer | string; text?: string; mimeType?: string }
  ): Promise<{
    session: DialogueSessionState;
    prompt: VoicePromptResult;
    slots?: ExtractedSlots;
  }> {
    const session = this.getOrCreateSession(sessionId);
    session.updatedAt = Date.now();

    let recognizedText = input.text || "";
    let detectedLang: SupportedLanguage = session.selectedLanguage;

    // If audio is provided, run speech-to-text
    if (input.audioBuffer) {
      const transcribeResult = await transcriptionEngine.transcribe({
        audioBuffer: input.audioBuffer,
        mimeType: input.mimeType,
        expectedLanguage: session.selectedLanguage,
      });
      recognizedText = transcribeResult.text;
      if (session.selectedLanguage === "bilingual") {
        detectedLang = transcribeResult.detectedLanguage;
      }
    }

    // Run NLU on text
    const slots = await nluEngine.analyzeUtterance(recognizedText, session.selectedLanguage);

    // Record turn in session history
    const userTurn: DialogueTurn = {
      role: "user",
      content: recognizedText,
      language: detectedLang,
      timestamp: Date.now(),
      intent: slots.intent,
      slotsExtracted: slots,
    };
    session.turns.push(userTurn);

    // Handle conversational step transitions
    const prompt = await this.transitionStep(session, slots);

    // Record assistant turn
    session.turns.push({
      role: "assistant",
      content: prompt.spokenText,
      language: prompt.language,
      timestamp: Date.now(),
    });

    return { session, prompt, slots };
  }

  private async transitionStep(
    session: DialogueSessionState,
    slots: ExtractedSlots
  ): Promise<VoicePromptResult> {
    const lang = session.selectedLanguage === "bilingual" ? slots.language : session.selectedLanguage;

    // Global cancellation
    if (slots.intent === "CANCEL") {
      session.currentStep = "CANCELLED";
      const text = lang === "twi"
        ? "Yɛatwa mu. Sika biara mfiri wo account mu. Yɛdaase."
        : "Transaction cancelled. No money has been deducted from your account. Goodbye.";
      return speechSynthesisEngine.synthesize(text, lang);
    }

    switch (session.currentStep) {
      case "LANGUAGE_SELECT": {
        if (slots.rawUtterance.includes("1") || slots.rawUtterance.toLowerCase().includes("english")) {
          session.selectedLanguage = "en";
          session.currentStep = "MAIN_MENU";
          const text = "English selected. For telecom or mobile money services, press 1. For banking services, press 2.";
          return speechSynthesisEngine.synthesize(text, "en");
        } else if (slots.rawUtterance.includes("2") || slots.rawUtterance.toLowerCase().includes("twi")) {
          session.selectedLanguage = "twi";
          session.currentStep = "MAIN_MENU";
          const text = "Twi apaw. Sɛ wopɛ sɛ wosende sika kɔ Mobile Money a, mia 1. Sikakorabea dwumadie no, mia 2.";
          return speechSynthesisEngine.synthesize(text, "twi");
        } else {
          session.retryCount++;
          const text = "For English, press 1. Twi firi mu, mia 2.";
          return speechSynthesisEngine.synthesize(text, "en");
        }
      }

      case "MAIN_MENU": {
        if (slots.intent === "SEND_MONEY" || slots.rawUtterance.includes("1")) {
          session.currentStep = "RECIPIENT_INPUT";
          const text = lang === "twi"
            ? "Mepa wo kyɛw, bɔ nɔmba du a wopɛ sɛ wosende sika no to so no, na fa hash ka ho."
            : "Please enter or speak the 10-digit phone number you want to send money to, followed by hash.";
          return speechSynthesisEngine.synthesize(text, lang);
        } else if (slots.intent === "CHECK_BALANCE") {
          session.currentStep = "HANDOFF_PIN";
          const text = lang === "twi"
            ? "Woregye wo balance. Sesei, hwɛ wo phone screen na fa wo MoMo PIN nwura mu pɛpɛɛpɛ."
            : "Checking balance. Please check your screen now to enter your PIN securely on the network prompt.";
          return speechSynthesisEngine.synthesize(text, lang);
        } else {
          const text = lang === "twi"
            ? "Sɛ wopɛ sɛ wosende sika a, mia 1. Sɛ wopɛ sɛ wocheck balance a, mia 2."
            : "To send money, press 1. To check balance, press 2.";
          return speechSynthesisEngine.synthesize(text, lang);
        }
      }

      case "RECIPIENT_INPUT": {
        if (slots.recipientPhone) {
          session.transactionData.recipientPhone = slots.recipientPhone;
          session.transactionData.recipientName = slots.recipientName || "Verified Subscriber";
          session.currentStep = "RECIPIENT_CONFIRM";
          const text = lang === "twi"
            ? `Woremane sika kɔ ${session.transactionData.recipientName} a ne nɔmba ne ${slots.recipientPhone}. Sɛ ɛyɛ ampa a, mia 1. Sɛ dabi a, mia 2.`
            : `You are sending money to ${session.transactionData.recipientName} at ${slots.recipientPhone}. To confirm this recipient, press 1. To cancel, press 2.`;
          return speechSynthesisEngine.synthesize(text, lang);
        } else {
          const text = lang === "twi"
            ? "Yɛante nɔmba no yie. Mepa wo kyɛw, bɔ nɔmba du no bio."
            : "We did not catch the 10-digit number. Please enter or speak the phone number again.";
          return speechSynthesisEngine.synthesize(text, lang);
        }
      }

      case "RECIPIENT_CONFIRM": {
        if (slots.intent === "CONFIRM") {
          session.currentStep = "AMOUNT_INPUT";
          const text = lang === "twi"
            ? "Mepa wo kyɛw, bɔ sika dodow a wopɛ sɛ womane no wɔ cedi mu, na fa hash ka ho."
            : "Please enter or speak the cedi amount you want to send, followed by hash.";
          return speechSynthesisEngine.synthesize(text, lang);
        } else {
          session.currentStep = "RECIPIENT_INPUT";
          const text = lang === "twi"
            ? "Sesa nɔmba no. Bɔ nɔmba foforɔ no."
            : "Let's change the number. Please enter the correct recipient number.";
          return speechSynthesisEngine.synthesize(text, lang);
        }
      }

      case "AMOUNT_INPUT": {
        if (slots.amount && slots.amount > 0) {
          session.transactionData.amountGHS = slots.amount;
          session.currentStep = "TRANSACTION_CONFIRM";
          const text = lang === "twi"
            ? `Woremane cedi ${slots.amount} akɔma ${session.transactionData.recipientName || "subscriber"}. Sɛ wopene so a, mia 1. Sɛ woampene so a, mia 2.`
            : `You are about to send ${slots.amount} Ghana cedis to ${session.transactionData.recipientName || "recipient"}. To confirm and send, press 1. To cancel, press 2.`;
          return speechSynthesisEngine.synthesize(text, lang);
        } else {
          const text = lang === "twi"
            ? "Yɛante sika dodow no yie. Mepa wo kyɛw, bɔ sika no bio."
            : "We did not get the amount. Please enter the amount in Ghana Cedis.";
          return speechSynthesisEngine.synthesize(text, lang);
        }
      }

      case "TRANSACTION_CONFIRM": {
        if (slots.intent === "CONFIRM") {
          session.currentStep = "HANDOFF_PIN";
          const text = lang === "twi"
            ? "Yɛapene so. Sesei, hwɛ wo fon screen na bɔ wo MoMo PIN pɛpɛɛpɛ. Yɛda wo ase sɛ wode Ɔkwankyerɛfo Pa di dwuma. Nante yie."
            : "Confirmed. Now, please check your phone screen and enter your MoMo PIN accurately on the prompt. Thank you for using Ɔkwankyerɛfo Pa. Goodbye.";
          return speechSynthesisEngine.synthesize(text, lang);
        } else {
          session.currentStep = "CANCELLED";
          const text = lang === "twi"
            ? "Yɛatwa mu. Sika biara mfiri wo account mu."
            : "Transaction cancelled. No funds were transferred.";
          return speechSynthesisEngine.synthesize(text, lang);
        }
      }

      default: {
        const text = lang === "twi"
          ? "Akwaaba kɔ Ɔkwankyerɛfo Pa."
          : "Welcome to Ɔkwankyerɛfo Pa.";
        return speechSynthesisEngine.synthesize(text, lang);
      }
    }
  }

  public getSession(sessionId: string): DialogueSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

export const dialogueEngine = new DialogueEngine();
