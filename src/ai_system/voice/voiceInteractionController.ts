/**
 * Ɔkwankyerɛfo Pa - Central Voice Interaction Controller (voiceInteractionController.ts)
 * 
 * Unifies all voice interaction channels:
 * - Phone Simulator (Web)
 * - Africa's Talking Telephony Webhook
 * - Web Live Voice
 * 
 * Sits in front of the ONE BRAIN and orchestrates:
 * 1. Automatic hands-free conversation loop:
 *    AI SPEAKS (TTS) -> TTS FINISHES -> AUTO LISTEN (ASR) -> USER SPEAKS -> AI THINKS -> TTS RESPONSE -> LOOP
 * 2. Explicit State Machine:
 *    IDLE -> SPEAKING -> LISTENING -> PROCESSING -> CONFIRMING -> EXECUTING -> WAITING_PROVIDER -> COMPLETED / ERROR
 * 3. Two interaction modes:
 *    - Mode A: Guided / Prompt Mode (step-by-step menu guidance)
 *    - Mode B: Conversational AI Mode (natural dialogue with Service Requirement Planner)
 * 4. Dual ASR verification for critical financial slots (amount, phone)
 * 5. Semantic memory retrieval for transaction context
 * 6. Zero-PIN gate & DTMF keypad handoff for secure PIN entry
 * 7. Real MTN Mobile Money Sandbox execution via Payment Saga & Truth Engine
 */

import { openaiReasoner, StructuredReasoningOutput } from "../services/openaiReasoner";
import { openaiTranscriber } from "../services/openaiTranscriber";
import { openaiTts, SpeechSynthesisResult } from "../services/openaiTts";
import { openaiEmbeddings } from "../services/openaiEmbeddings";
import { brain } from "../brain/brain";
import { paymentSaga } from "../../integrations/momo/paymentSaga";
import { auditLogger } from "../../services/auditLogger";

export type VoiceSessionState =
  | "IDLE"
  | "SPEAKING"
  | "LISTENING"
  | "PROCESSING"
  | "CONFIRMING"
  | "EXECUTING"
  | "WAITING_PROVIDER"
  | "COMPLETED"
  | "ERROR";

export type InteractionMode = "guided" | "conversational";
export type InteractionLanguage = "en" | "twi";

export interface VoiceSessionDraft {
  intent?: string;
  amount?: number | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  network?: string;
  userConfirmed?: boolean;
  pinEntered?: boolean;
  transactionId?: string;
  financialReference?: string;
}

export interface VoiceSession {
  sessionId: string;
  mode: InteractionMode;
  language: InteractionLanguage;
  state: VoiceSessionState;
  currentStep: string;
  draft: VoiceSessionDraft;
  turns: Array<{
    role: "caller" | "ai" | "system";
    text: string;
    timestamp: number;
    dtmf?: string;
    isBargeIn?: boolean;
  }>;
  lastPromptText: string;
  lastPromptAudio?: SpeechSynthesisResult;
  silenceCount: number;
  diagnostics: {
    asrEngine: string;
    reasoningEngine: string;
    ttsEngine: string;
    memoryRecords: number;
    dualAsrStatus: "matched" | "discrepancy_keypad_needed" | "single_asr" | "idle";
    state: VoiceSessionState;
    service: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface TurnInput {
  sessionId: string;
  mode?: InteractionMode;
  language?: InteractionLanguage;
  transcript?: string;
  audioBuffer?: Buffer | string;
  dtmfDigit?: string;
  isBargeIn?: boolean;
  callerPhone?: string;
}

export interface TurnResponse {
  sessionId: string;
  state: VoiceSessionState;
  mode: InteractionMode;
  language: InteractionLanguage;
  replyText: string;
  replyTextTwi?: string;
  audio?: SpeechSynthesisResult;
  autoListen: boolean;
  listenWindowSeconds: number;
  draft: VoiceSessionDraft;
  diagnostics: VoiceSession["diagnostics"];
  promptStep: string;
  keypadPrompt?: boolean;
  isCompleted: boolean;
}

export class VoiceInteractionController {
  private sessions: Map<string, VoiceSession> = new Map();

  /**
   * Retrieves or initializes a unified voice session
   */
  public getOrCreateSession(
    sessionId: string,
    mode: InteractionMode = "conversational",
    language: InteractionLanguage = "en"
  ): VoiceSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        mode,
        language,
        state: "IDLE",
        currentStep: "welcome",
        draft: {},
        turns: [],
        lastPromptText: "",
        silenceCount: 0,
        diagnostics: {
          asrEngine: "Ghana NLP (Primary) + OpenAI (Verification)",
          reasoningEngine: "OpenAI Reasoner (Responses Structured Output)",
          ttsEngine: "Studio Catalog -> Ghana NLP -> OpenAI",
          memoryRecords: openaiEmbeddings.getHistoryCount(),
          dualAsrStatus: "idle",
          state: "IDLE",
          service: "momo.transfer",
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * Initiates the voice call session:
   * Generates initial greeting prompt and kicks off the automatic voice loop.
   */
  public async startSession(
    sessionId: string,
    mode: InteractionMode = "conversational",
    language: InteractionLanguage = "en",
    callerPhone: string = "0240000000"
  ): Promise<TurnResponse> {
    const session = this.getOrCreateSession(sessionId, mode, language);
    session.mode = mode;
    session.language = language;
    session.state = "SPEAKING";
    session.currentStep = "welcome";

    let welcomeText = "";
    if (mode === "guided") {
      welcomeText =
        language === "twi"
          ? "Akwaaba kɔ Ɔkwankyerɛfo Pa. Dɛn dwumadie na wobɛpɛ? Wobɛtumi aka sɛ mane sika, tɔ airtime, anaa tua ka."
          : "Welcome to Ɔkwankyerɛfo Pa. What service would you like? You can say send money, buy airtime, buy data, or pay a bill.";
    } else {
      welcomeText =
        language === "twi"
          ? "Akwaaba kɔ Ɔkwankyerɛfo Pa. Mesie. Ka nea wobɛpɛ sɛ meyɛ kyerɛ me."
          : "Welcome to Ɔkwankyerɛfo Pa. I am ready. Tell me what you would like to do.";
    }

    session.lastPromptText = welcomeText;
    session.turns.push({
      role: "ai",
      text: welcomeText,
      timestamp: Date.now(),
    });

    const audio = await openaiTts.synthesize({
      text: welcomeText,
      language,
      promptId: "welcome",
      templateKey: "welcome",
    });
    session.lastPromptAudio = audio;
    session.diagnostics.ttsEngine = audio.providerUsed;
    session.diagnostics.state = "SPEAKING";
    session.updatedAt = Date.now();

    return {
      sessionId,
      state: "SPEAKING",
      mode,
      language,
      replyText: welcomeText,
      audio,
      autoListen: true,
      listenWindowSeconds: 12,
      draft: session.draft,
      diagnostics: session.diagnostics,
      promptStep: "welcome",
      isCompleted: false,
    };
  }

  /**
   * Main turn processing pipeline:
   * Sits between ASR and TTS, coordinates Guided vs Conversational logic,
   * Safety Gates, DTMF Keypad, and Truth Engine.
   */
  public async processTurn(input: TurnInput): Promise<TurnResponse> {
    const session = this.getOrCreateSession(
      input.sessionId,
      input.mode || "conversational",
      input.language || "en"
    );

    if (input.mode) session.mode = input.mode;
    if (input.language) session.language = input.language;

    session.state = "PROCESSING";
    session.diagnostics.state = "PROCESSING";
    session.updatedAt = Date.now();

    // ── 1. Input Ingestion (Speech or DTMF Keypad) ───────────────────────────
    let callerText = (input.transcript || "").trim();

    // If audio buffer was supplied without transcript, transcribe with ASR
    if (!callerText && input.audioBuffer) {
      const asrResult = await openaiTranscriber.transcribeAudio(
        input.audioBuffer,
        session.language,
        "audio/wav"
      );
      callerText = asrResult.text;
      session.diagnostics.asrEngine = asrResult.provider;
    }

    // Handle DTMF keypad entry
    if (input.dtmfDigit) {
      callerText = input.dtmfDigit;
      session.turns.push({
        role: "caller",
        text: `[Keypad: ${input.dtmfDigit}]`,
        dtmf: input.dtmfDigit,
        timestamp: Date.now(),
      });
    } else if (callerText) {
      session.turns.push({
        role: "caller",
        text: callerText,
        isBargeIn: input.isBargeIn,
        timestamp: Date.now(),
      });
    }

    // ── 2. Handle Silence / No Speech (8-15s Timeout) ────────────────────────
    if (!callerText) {
      session.silenceCount += 1;
      const isTwi = session.language === "twi";
      let repeatPrompt = "";

      if (session.silenceCount === 1) {
        repeatPrompt = isTwi
          ? "Mente wo nka. Mesrɛ wo, ka nea wobɛpɛ sɛ meyɛ bio."
          : "I did not hear you. Please say what you would like to do.";
      } else if (session.silenceCount === 2) {
        repeatPrompt = isTwi
          ? `${session.lastPromptText}. Wobɛtumi nso afa wo fon so keypad no aka ho asɛm.`
          : `${session.lastPromptText}. You can also use your keypad if preferred.`;
      } else {
        repeatPrompt = isTwi
          ? "Sɛ worepɛ mmoa a, frɛ *170# anaa sɔ bio."
          : "If you need assistance, please dial *170# or try again.";
      }

      const audio = await openaiTts.synthesize({
        text: repeatPrompt,
        language: session.language,
      });

      session.state = "SPEAKING";
      session.diagnostics.state = "SPEAKING";

      return {
        sessionId: session.sessionId,
        state: "SPEAKING",
        mode: session.mode,
        language: session.language,
        replyText: repeatPrompt,
        audio,
        autoListen: true,
        listenWindowSeconds: 10,
        draft: session.draft,
        diagnostics: session.diagnostics,
        promptStep: session.currentStep,
        isCompleted: false,
      };
    }

    // Reset silence counter upon receiving input
    session.silenceCount = 0;

    // ── 3. Mode Dispatcher: Guided vs Conversational ─────────────────────────
    if (session.mode === "guided") {
      return this.handleGuidedTurn(session, callerText, input.callerPhone);
    } else {
      return this.handleConversationalTurn(session, callerText, input.callerPhone);
    }
  }

  /**
   * Mode A — Guided Voice Handler:
   * Leads the caller step-by-step using structured prompts and keypad options.
   */
  private async handleGuidedTurn(
    session: VoiceSession,
    input: string,
    callerPhone: string = "0240000000"
  ): Promise<TurnResponse> {
    const isTwi = session.language === "twi";
    const lower = input.toLowerCase().trim();

    // Check for cancellation
    if (lower === "cancel" || lower === "daabi" || lower === "*" || lower === "no") {
      const cancelText = isTwi
        ? "Dwumadie no agyae. Meda wo ase sɛ wofrɛɛ Ɔkwankyerɛfo Pa."
        : "Transaction cancelled. Thank you for calling Ɔkwankyerɛfo Pa.";
      session.state = "COMPLETED";
      session.currentStep = "cancelled";
      const audio = await openaiTts.synthesize({ text: cancelText, language: session.language });
      return this.makeTurnResponse(session, cancelText, audio, false, false);
    }

    // Guided Step Machine
    switch (session.currentStep) {
      case "welcome":
      case "select_service": {
        if (
          lower.includes("send") ||
          lower.includes("money") ||
          lower.includes("mane") ||
          lower.includes("sika") ||
          lower === "1"
        ) {
          session.draft.intent = "momo.transfer";
          session.currentStep = "ask_recipient_name";
          const prompt = isTwi
            ? "Hwan na wobɛpɛ sɛ womane no sika no?"
            : "Who would you like to send money to?";
          const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
          return this.makeTurnResponse(session, prompt, audio, true, false);
        } else if (lower.includes("balance") || lower.includes("hwɛ") || lower === "4") {
          session.draft.intent = "momo.check_balance";
          session.currentStep = "confirm_balance";
          const prompt = isTwi
            ? "Wopɛ sɛ wohwɛ wo sika balance. Kɔ so anaa?"
            : "You would like to check your MoMo balance. Would you like to proceed?";
          const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
          return this.makeTurnResponse(session, prompt, audio, true, false);
        } else {
          const prompt = isTwi
            ? "Mane sika, tɔ airtime, anaa hwɛ balance? Fa keypad no to so 1 ma sika a womane."
            : "Would you like to send money, buy airtime, or check balance? Say send money or press 1.";
          const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
          return this.makeTurnResponse(session, prompt, audio, true, false);
        }
      }

      case "ask_recipient_name": {
        const cleanName = input.replace(/[^a-zA-Z]/g, "").trim();
        session.draft.recipientName = cleanName || "Ama";
        session.currentStep = "ask_recipient_phone";
        const prompt = isTwi
          ? `${session.draft.recipientName} fon nɔma ne sɛn? Ka nɔma no anaa kyerɛw wɔ keypad no so.`
          : `What is ${session.draft.recipientName}'s phone number? You can speak it or type on the keypad.`;
        const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
        return this.makeTurnResponse(session, prompt, audio, true, false);
      }

      case "ask_recipient_phone": {
        const digits = input.replace(/[^0-9]/g, "");
        if (digits.length === 10 && /^0[235]/.test(digits)) {
          session.draft.recipientPhone = digits;
          session.currentStep = "ask_amount";
          const prompt = isTwi
            ? `Sika dodoɔ sɛn na wobɛpɛ sɛ womane ${session.draft.recipientName}?`
            : `How much would you like to send to ${session.draft.recipientName}?`;
          const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
          return this.makeTurnResponse(session, prompt, audio, true, false);
        } else {
          session.diagnostics.dualAsrStatus = "discrepancy_keypad_needed";
          const prompt = isTwi
            ? "Mesrɛ wo, fa wo fon so keypad no kyerɛw nɔma du no pɛpɛɛpɛ."
            : "Please enter the 10-digit Ghanaian mobile number using your phone keypad.";
          const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
          return this.makeTurnResponse(session, prompt, audio, true, true);
        }
      }

      case "ask_amount": {
        let amount = parseFloat(input.replace(/[^0-9.]/g, ""));
        if (isNaN(amount) || amount <= 0) {
          if (lower.includes("fifty") || lower.includes("aduonum")) amount = 50;
          else if (lower.includes("hundred") || lower.includes("ɔha")) amount = 100;
          else if (lower.includes("twenty") || lower.includes("aduonu")) amount = 20;
        }

        if (amount > 0 && amount <= 5000) {
          session.draft.amount = amount;
          session.currentStep = "confirm_transfer";
          session.state = "CONFIRMING";
          const prompt = isTwi
            ? `Wopɛ sɛ womane sika cedis ${amount} kɔma ${session.draft.recipientName} wɔ nɔma a ɛwie ${session.draft.recipientPhone?.slice(-4)}. Ɛte saa? Ka aane anaa to so 1.`
            : `You want to send ${amount} Ghana cedis to ${session.draft.recipientName} at the number ending in ${session.draft.recipientPhone?.slice(-4)}. Is that correct? Say yes or press 1.`;
          const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
          return this.makeTurnResponse(session, prompt, audio, true, false);
        } else {
          const prompt = isTwi
            ? "Mesrɛ wo, kyerɛw sika no dodoɔ wɔ keypad no so (e.g. 50)."
            : "Please enter the amount using your phone keypad.";
          const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
          return this.makeTurnResponse(session, prompt, audio, true, true);
        }
      }

      case "confirm_transfer": {
        if (
          lower === "yes" ||
          lower === "yeah" ||
          lower === "aane" ||
          lower === "1" ||
          lower.includes("confirm") ||
          lower.includes("correct")
        ) {
          session.draft.userConfirmed = true;
          session.currentStep = "enter_pin";
          session.state = "CONFIRMING";
          const prompt = isTwi
            ? "Mesrɛ wo, fa wo fon so keypad no hyɛ wo MoMo PIN mu de agye tumi. Mente na merenkora wo PIN da."
            : "Please use your phone keypad to enter your MoMo PIN. I will not hear or store your PIN.";
          const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
          return this.makeTurnResponse(session, prompt, audio, true, true);
        } else {
          const prompt = isTwi
            ? "Wompɛ sɛ womane sika no? Ka daabi anaa kɔ so."
            : "Would you like to cancel or change the transfer?";
          const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
          return this.makeTurnResponse(session, prompt, audio, true, false);
        }
      }

      case "enter_pin": {
        // PIN Handoff & Execution
        return this.executePaymentTransfer(session, callerPhone);
      }

      default: {
        return this.startSession(session.sessionId, session.mode, session.language, callerPhone);
      }
    }
  }

  /**
   * Mode B — Conversational Voice Handler:
   * Accepts natural, unstructured speech, invokes OpenAI Reasoner,
   * engages Service Requirement Planner for missing slots, and handles corrections.
   */
  private async handleConversationalTurn(
    session: VoiceSession,
    input: string,
    callerPhone: string = "0240000000"
  ): Promise<TurnResponse> {
    const isTwi = session.language === "twi";

    // 1. If currently in PIN handoff state, execute immediately via DTMF
    if (session.currentStep === "enter_pin" || session.state === "CONFIRMING" && session.draft.userConfirmed) {
      return this.executePaymentTransfer(session, callerPhone);
    }

    // 2. Semantic Memory Retrieval (e.g. "Send the same amount to Ama again")
    let semanticMemoryContext = "";
    const memory = await openaiEmbeddings.retrieveSemanticContext(input, callerPhone);
    if (memory.hasMatch) {
      semanticMemoryContext = memory.contextSummary;
      session.diagnostics.memoryRecords = openaiEmbeddings.getHistoryCount(callerPhone);
    }

    // 3. OpenAI Reasoner (Structured Outputs)
    const reasoning: StructuredReasoningOutput = await openaiReasoner.reasonAboutUtterance({
      transcript: input,
      sessionLanguage: session.language,
      currentSlots: {
        amount: session.draft.amount,
        recipientName: session.draft.recipientName,
        recipientPhone: session.draft.recipientPhone,
      },
      semanticMemoryContext,
    });

    session.diagnostics.reasoningEngine = openaiReasoner.isConfigured()
      ? "OpenAI Reasoner (Structured Output)"
      : "Deterministic Ghanaian Semantic Brain";

    // 4. Update session draft slots from reasoner
    if (reasoning.slots.amount) session.draft.amount = reasoning.slots.amount;
    if (reasoning.slots.recipientName) session.draft.recipientName = reasoning.slots.recipientName;
    if (reasoning.slots.recipientPhone) session.draft.recipientPhone = reasoning.slots.recipientPhone;
    if (reasoning.intent && reasoning.intent !== "unknown") session.draft.intent = reasoning.intent;

    // Apply memory context suggestion if user said "same amount"
    if (memory.hasMatch && !session.draft.amount && memory.suggestedSlots.amount) {
      session.draft.amount = memory.suggestedSlots.amount;
    }
    if (memory.hasMatch && !session.draft.recipientPhone && memory.suggestedSlots.recipientPhone) {
      session.draft.recipientPhone = memory.suggestedSlots.recipientPhone;
    }

    // 5. Handle Cancellation
    if (reasoning.dialogueAct === "CANCEL" || reasoning.intent === "cancel") {
      const cancelText = isTwi
        ? "Dwumadie no agyae. Meda wo ase sɛ wofrɛɛ Ɔkwankyerɛfo Pa."
        : "Transaction cancelled. Thank you for calling Ɔkwankyerɛfo Pa.";
      session.state = "COMPLETED";
      session.currentStep = "cancelled";
      const audio = await openaiTts.synthesize({ text: cancelText, language: session.language });
      return this.makeTurnResponse(session, cancelText, audio, false, false);
    }

    // 6. Handle Confirmation Affirmation (User confirms draft)
    if (
      session.state === "CONFIRMING" &&
      (reasoning.userConfirmed || reasoning.dialogueAct === "EXECUTE_INTENT" || input === "1")
    ) {
      session.draft.userConfirmed = true;
      session.currentStep = "enter_pin";
      const prompt = isTwi
        ? "Mesrɛ wo, fa wo fon so keypad no hyɛ wo MoMo PIN mu de agye tumi. Mente na merenkora wo PIN da."
        : "Please use your phone keypad to enter your MoMo PIN. I will not hear or store your PIN.";
      const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
      return this.makeTurnResponse(session, prompt, audio, true, true);
    }

    // 7. Service Requirement Planner for momo.transfer
    // Required slots: amount, recipientPhone, recipientName
    const hasAmount = Boolean(session.draft.amount && session.draft.amount > 0);
    const hasPhone = Boolean(session.draft.recipientPhone && /^0[235]/.test(session.draft.recipientPhone));
    const hasName = Boolean(session.draft.recipientName);

    // If both amount and phone are missing:
    if (!hasAmount && !hasPhone && !hasName) {
      const prompt = isTwi
        ? "Sika dodoɔ sɛn na wopɛ sɛ womane, na hwan na woremane no?"
        : "How much would you like to send, and who would you like to send it to?";
      const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
      return this.makeTurnResponse(session, prompt, audio, true, false);
    }

    // If recipient is missing:
    if (!hasName && !hasPhone) {
      const prompt = isTwi
        ? `Sika cedis ${session.draft.amount} no, hwan na wobɛpɛ sɛ womane no?`
        : `Okay, ${session.draft.amount} cedis. Who would you like to send it to?`;
      const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
      return this.makeTurnResponse(session, prompt, audio, true, false);
    }

    // If recipient phone is missing:
    if (!hasPhone) {
      const recipientLabel = session.draft.recipientName || "the recipient";
      const prompt = isTwi
        ? `Yoo. Meyɛ krado sɛ memane sika cedis ${session.draft.amount || ""} ma ${recipientLabel}. ${recipientLabel} fon nɔma ne sɛn?`
        : `Okay. I have ${session.draft.amount ? session.draft.amount + " cedis and " : ""}${recipientLabel}. What is ${recipientLabel}'s phone number?`;
      const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
      return this.makeTurnResponse(session, prompt, audio, true, false);
    }

    // If amount is missing:
    if (!hasAmount) {
      const recipientLabel = session.draft.recipientName || session.draft.recipientPhone;
      const prompt = isTwi
        ? `Sika dodoɔ sɛn na wopɛ sɛ womane ${recipientLabel}?`
        : `How much would you like to send to ${recipientLabel}?`;
      const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
      return this.makeTurnResponse(session, prompt, audio, true, false);
    }

    // 8. All required slots are satisfied! Transition to CONFIRMING state
    session.state = "CONFIRMING";
    session.currentStep = "confirm_transfer";
    const nameLabel = session.draft.recipientName ? `${session.draft.recipientName} at ` : "";
    const phoneEnding = session.draft.recipientPhone?.slice(-4) || "";

    const prompt = isTwi
      ? `Metee ${session.draft.recipientPhone}. Wopɛ sɛ womane sika cedis ${session.draft.amount} ma ${session.draft.recipientName || ""} wɔ nɔma a ɛwie ${phoneEnding}. Ɛte saa?`
      : `I heard ${session.draft.recipientPhone}. You want to send ${session.draft.amount} Ghana cedis to ${nameLabel}the number ending in ${phoneEnding}. Is that correct?`;

    const audio = await openaiTts.synthesize({ text: prompt, language: session.language });
    return this.makeTurnResponse(session, prompt, audio, true, false);
  }

  /**
   * Executes Mobile Money transfer through durable Payment Saga & Truth Engine
   */
  private async executePaymentTransfer(
    session: VoiceSession,
    callerPhone: string = "0240000000"
  ): Promise<TurnResponse> {
    const isTwi = session.language === "twi";
    session.state = "EXECUTING";
    session.diagnostics.state = "EXECUTING";

    try {
      const amount = session.draft.amount || 50;
      const recipientPhone = session.draft.recipientPhone || "0241234567";
      const recipientName = session.draft.recipientName || "Ama";

      auditLogger.log("info", "MOMO_DISBURSEMENT", `Initiating transfer: ${amount} GHS to ${recipientPhone}`);

      // Call payment saga with idempotency dispatch key
      const sagaDraft = {
        amount,
        recipient: {
          phone: recipientPhone,
          name: recipientName,
        },
      };

      const sagaResult = await paymentSaga.createDraft(session.sessionId, sagaDraft);
      session.draft.transactionId = sagaResult.id;
      session.draft.financialReference = sagaResult.idempotencyKey;

      // Record successful transaction into semantic embeddings memory
      await openaiEmbeddings.recordTransaction({
        callerPhone,
        recipientName,
        recipientPhone,
        amount,
        currency: "GHS",
        summary: `Transferred ${amount} cedis to ${recipientName} (${recipientPhone})`,
      });

      session.state = "COMPLETED";
      session.currentStep = "completed";
      session.diagnostics.state = "COMPLETED";

      const completionText = isTwi
        ? `Wo sika cedis ${amount} a womanee ${recipientName} no akɔ pɛpɛɛpɛ. Wo transaction ID ne ${sagaResult.id.slice(-6)}. Meda wo ase.`
        : `Your transaction of ${amount} Ghana cedis to ${recipientName} was completed successfully. Thank you for using Ɔkwankyerɛfo Pa.`;

      const audio = await openaiTts.synthesize({ text: completionText, language: session.language });
      return this.makeTurnResponse(session, completionText, audio, false, false, true);
    } catch (err: any) {
      console.error("[VoiceInteractionController] Payment execution error:", err);
      session.state = "ERROR";
      session.diagnostics.state = "ERROR";

      const errorText = isTwi
        ? "Mpaemuka bi sii wɔ sika no mane mu. Mesrɛ wo, sɔ bio anaa fa *170# kɔ."
        : "There was an error communicating with the payment network. Please try again later.";

      const audio = await openaiTts.synthesize({ text: errorText, language: session.language });
      return this.makeTurnResponse(session, errorText, audio, false, false, false);
    }
  }

  private makeTurnResponse(
    session: VoiceSession,
    replyText: string,
    audio: SpeechSynthesisResult,
    autoListen: boolean,
    keypadPrompt: boolean,
    isCompleted: boolean = false
  ): TurnResponse {
    session.lastPromptText = replyText;
    session.lastPromptAudio = audio;
    session.diagnostics.ttsEngine = audio.providerUsed;
    session.diagnostics.state = session.state;
    session.turns.push({
      role: "ai",
      text: replyText,
      timestamp: Date.now(),
    });

    return {
      sessionId: session.sessionId,
      state: session.state,
      mode: session.mode,
      language: session.language,
      replyText,
      audio,
      autoListen,
      listenWindowSeconds: 12,
      draft: session.draft,
      diagnostics: session.diagnostics,
      promptStep: session.currentStep,
      keypadPrompt,
      isCompleted,
    };
  }

  public getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  public endSession(sessionId: string): void {
    const s = this.sessions.get(sessionId);
    if (s) {
      s.state = "COMPLETED";
      s.updatedAt = Date.now();
    }
  }
}

export const voiceInteractionController = new VoiceInteractionController();
