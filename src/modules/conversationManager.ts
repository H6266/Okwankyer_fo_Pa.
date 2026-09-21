/**
 * Ɔkwankyerɛfo Pa - Conversational Multi-Turn State Machine
 * 
 * Manages conversational sessions, slot-filling, menu skipping,
 * mid-flow corrections, confidence thresholds, and continuation.
 * 
 * Complies strictly with the prompt specification and Reference Demo Script.
 */

import {
  parseUserIntent,
  extractAmount,
  extractRecipient,
  extractNetwork,
  classifyIntentLocally,
  IntentType,
} from "./nluService";
import { findContact, maskPhoneNumber, normalizePhoneNumber, formatPhoneNumberForSpeech, isPhoneNumber } from "./mockContacts";
import { transactionOrchestrator, TransactionResult } from "./transactionOrchestrator";
import { secureAuthGate } from "./secureAuth";

export type ConversationStatus =
  | "COLLECTING_INFORMATION"
  | "AWAITING_NETWORK"
  | "AWAITING_RECIPIENT"
  | "AWAITING_AMOUNT"
  | "AWAITING_CONFIRMATION"
  | "AWAITING_SECURE_PIN"
  | "TRANSACTION_COMPLETED"
  | "OFFER_CONTINUATION"
  | "TERMINATED";

export interface ConversationState {
  sessionId: string;
  intent: IntentType | null;
  language: "en" | "twi";
  network: "MTN" | "Telecel" | "AT" | null;
  recipient_phone: string | null;
  recipient_name: string | null;
  amount: number | null;
  currency: "GHS";
  confirmation: boolean | null;
  status: ConversationStatus;
  consecutiveFailures: number;
  lastUpdated: number;
  history: Array<Omit<ConversationState, "history">>;
  lastTransactionResult?: TransactionResult;
}

export interface ConversationTurnResult {
  state: ConversationState;
  spokenPrompt: string;
  displayStepTag: string;
  requiresPinInput: boolean;
  isCompleted: boolean;
  offeredMenuFallback: boolean;
  confidence: number;
  activeIntent: string;
}

class ConversationManager {
  private sessions = new Map<string, ConversationState>();
  private readonly SESSION_TIMEOUT_MS = 90 * 1000; // 90 seconds timeout

  /**
   * Initializes or returns existing session
   */
  public getOrCreateSession(sessionId: string, language: "en" | "twi" = "en"): ConversationState {
    const now = Date.now();
    const existing = this.sessions.get(sessionId);

    if (existing && now - existing.lastUpdated < this.SESSION_TIMEOUT_MS) {
      existing.lastUpdated = now;
      return existing;
    }

    const newSession: ConversationState = {
      sessionId,
      intent: null,
      language,
      network: null,
      recipient_phone: null,
      recipient_name: null,
      amount: null,
      currency: "GHS",
      confirmation: null,
      status: "COLLECTING_INFORMATION",
      consecutiveFailures: 0,
      lastUpdated: now,
      history: [],
    };

    this.sessions.set(sessionId, newSession);
    return newSession;
  }

  /**
   * Pushes current state snapshot to history for undo / corrections
   */
  private snapshot(state: ConversationState): void {
    const { history, ...snapshotData } = state;
    // Keep last 5 states
    state.history = [...state.history.slice(-4), JSON.parse(JSON.stringify(snapshotData))];
  }

  /**
   * Reverts to previous state (GO_BACK / mid-flow correction)
   */
  public revertToPrevious(state: ConversationState): ConversationState {
    if (state.history.length === 0) return state;
    const previous = state.history.pop()!;
    Object.assign(state, previous);
    state.lastUpdated = Date.now();
    return state;
  }

  /**
   * Main Conversational Turn Handler
   */
  public async handleTurn(
    sessionId: string,
    userInputText: string,
    language: "en" | "twi" = "en"
  ): Promise<ConversationTurnResult> {
    const state = this.getOrCreateSession(sessionId, language);
    const text = userInputText.trim();
    const cleanLower = text.toLowerCase().replace(/[.,!?;:]/g, "").trim();

    console.log(`[ConversationManager] Turn received for [${sessionId}]: "${text}" (Current status: ${state.status})`);

    // ── Mid-flow Global Controls: EXIT / CANCEL / GO_BACK ──────────────
    if (cleanLower === "0" || cleanLower === "exit" || cleanLower.includes("hang up")) {
      state.status = "TERMINATED";
      return {
        state,
        spokenPrompt: "Thank you for using Ɔkwankyerɛfo Pa. Goodbye.",
        displayStepTag: "Call Ended",
        requiresPinInput: false,
        isCompleted: true,
        offeredMenuFallback: false,
        confidence: 0.99,
        activeIntent: "EXIT",
      };
    }

    if (cleanLower === "8" || cleanLower === "back" || cleanLower === "go back") {
      this.revertToPrevious(state);
      return this.generateStatusPrompt(state, "Returned to previous step.", 0.95);
    }

    if (cleanLower === "cancel" || cleanLower === "stop" || (state.status === "AWAITING_CONFIRMATION" && (cleanLower === "2" || cleanLower === "no"))) {
      state.status = "TERMINATED";
      return {
        state,
        spokenPrompt: "Transaction cancelled. No money has been deducted from your account. Goodbye.",
        displayStepTag: "Transaction Cancelled",
        requiresPinInput: false,
        isCompleted: true,
        offeredMenuFallback: false,
        confidence: 0.98,
        activeIntent: "CANCEL",
      };
    }

    // ── Mid-flow Correction Check (e.g. "No, make it 200", "Actually send it to Ama") ──
    const isAmountCorrection = cleanLower.includes("make it") || cleanLower.includes("change amount") || cleanLower.includes("change to") || (state.status === "AWAITING_CONFIRMATION" && extractAmount(text) !== null && cleanLower.includes("no"));
    const isRecipientCorrection = cleanLower.includes("send it to") || cleanLower.includes("change recipient") || cleanLower.includes("send to ama") || cleanLower.includes("instead");

    if ((isAmountCorrection || isRecipientCorrection) && state.intent === "SEND_MONEY") {
      this.snapshot(state);
      if (isAmountCorrection) {
        const newAmt = extractAmount(text);
        if (newAmt) {
          state.amount = newAmt;
          console.log(`[ConversationManager] Corrected amount to: ${newAmt}`);
        }
      }
      if (isRecipientCorrection) {
        const newRecip = extractRecipient(text);
        if (newRecip.name || newRecip.phone) {
          const contact = findContact(newRecip.phone || newRecip.name || "");
          if (contact) {
            state.recipient_name = contact.name;
            state.recipient_phone = contact.phoneNumber;
          } else {
            state.recipient_name = newRecip.name;
            state.recipient_phone = newRecip.phone;
          }
          console.log(`[ConversationManager] Corrected recipient to: ${state.recipient_name}`);
        }
      }
      state.status = "AWAITING_CONFIRMATION";
      return this.generateConfirmationPrompt(state);
    }

    // ── Continuation Handling (After completed transaction) ─────────────
    if (state.status === "OFFER_CONTINUATION" || state.status === "TRANSACTION_COMPLETED") {
      if (cleanLower.includes("no") || cleanLower === "no" || cleanLower.includes("thats all") || cleanLower.includes("nothing")) {
        state.status = "TERMINATED";
        return {
          state,
          spokenPrompt: "Thank you for using Ɔkwankyerɛfo Pa. Have a great day! Goodbye.",
          displayStepTag: "Call Ended",
          requiresPinInput: false,
          isCompleted: true,
          offeredMenuFallback: false,
          confidence: 0.98,
          activeIntent: "EXIT",
        };
      }

      // User says "Yes. Check my balance" or "Check my balance"
      if (cleanLower.includes("balance") || cleanLower.includes("check")) {
        const bal = transactionOrchestrator.getAccountBalance("MTN");
        state.status = "OFFER_CONTINUATION";
        return {
          state,
          spokenPrompt: `Sure. Your available balance is ${bal.formatted}. Would you like to do anything else?`,
          displayStepTag: "Account Balance",
          requiresPinInput: false,
          isCompleted: false,
          offeredMenuFallback: false,
          confidence: 0.96,
          activeIntent: "CHECK_BALANCE",
        };
      }

      // If user says "Yes" without specifying, reset to start new intent
      if (cleanLower === "yes" || cleanLower === "yeah" || cleanLower === "sure") {
        state.intent = null;
        state.status = "COLLECTING_INFORMATION";
        return {
          state,
          spokenPrompt: "Sure! What would you like to do? You can say send money, buy airtime, or check balance.",
          displayStepTag: "Ready for Next Request",
          requiresPinInput: false,
          isCompleted: false,
          offeredMenuFallback: false,
          confidence: 0.95,
          activeIntent: "CONTINUATION",
        };
      }
    }

    // ── State-specific Slot Filling (Bare Follow-up Turns) ──────────────
    if (state.status === "AWAITING_NETWORK") {
      const net = extractNetwork(text);
      if (net || cleanLower.includes("mtn") || cleanLower.includes("telecel") || cleanLower.includes("at")) {
        state.network = net || (cleanLower.includes("telecel") ? "Telecel" : cleanLower.includes("at") ? "AT" : "MTN");
        state.consecutiveFailures = 0;
        return this.progressSendMoney(state);
      }
    }

    if (state.status === "AWAITING_AMOUNT") {
      const amt = extractAmount(text);
      if (amt !== null) {
        state.amount = amt;
        state.consecutiveFailures = 0;
        return this.progressSendMoney(state);
      }
    }

    if (state.status === "AWAITING_RECIPIENT") {
      const recip = extractRecipient(text);
      if (recip.name || recip.phone) {
        const contact = findContact(recip.phone || recip.name || text);
        if (contact) {
          state.recipient_name = contact.name;
          state.recipient_phone = contact.phoneNumber;
        } else {
          state.recipient_name = recip.name || text;
          state.recipient_phone = recip.phone;
        }
        state.consecutiveFailures = 0;
        return this.progressSendMoney(state);
      }
    }

    if (state.status === "AWAITING_CONFIRMATION") {
      const isConfirmed =
        cleanLower === "1" ||
        cleanLower === "yes" ||
        cleanLower.startsWith("yes") ||
        cleanLower === "yeah" ||
        cleanLower.startsWith("yeah") ||
        cleanLower === "confirm" ||
        cleanLower === "proceed" ||
        cleanLower === "correct" ||
        cleanLower === "thats right" ||
        cleanLower === "yep" ||
        cleanLower === "yoo" ||
        cleanLower === "ampa";

      const isTwi = state.language === "twi";

      if (isConfirmed) {
        state.status = "AWAITING_SECURE_PIN";
        state.confirmation = true;
        return {
          state,
          spokenPrompt: isTwi
            ? "Medaase, woapene so pɛpɛɛpɛ. Me pa wo kyɛw, hwɛ wo fon so sesei ara na fa wo MoMo PIN bɔ mu ahobammbɔ mu."
            : "Thank you, confirmed. Please check your phone screen now and enter your MoMo PIN securely on the network prompt.",
          displayStepTag: "Step 8: Zero-PIN Security Handoff",
          requiresPinInput: true,
          isCompleted: false,
          offeredMenuFallback: false,
          confidence: 0.98,
          activeIntent: "SEND_MONEY",
        };
      }

      const isChange =
        cleanLower === "2" ||
        cleanLower === "change" ||
        cleanLower === "edit" ||
        cleanLower.includes("change number") ||
        cleanLower.includes("wrong number") ||
        cleanLower.includes("different number") ||
        cleanLower === "no" ||
        cleanLower === "sesa";

      if (isChange) {
        state.status = "AWAITING_RECIPIENT";
        state.recipient_name = null;
        state.recipient_phone = null;
        return {
          state,
          spokenPrompt: isTwi
            ? "Me pa wo kyɛw, firi me kwan. Yɛsrɛ wo, bɔ nɔma foforɔ a wopɛ no dennen bio."
            : "Understood, please. Kindly call out your preferred recipient number or name again.",
          displayStepTag: "Re-enter Preferred Number",
          requiresPinInput: false,
          isCompleted: false,
          offeredMenuFallback: false,
          confidence: 0.95,
          activeIntent: "SEND_MONEY",
        };
      }
    }

    // ── General Intent Classification & Slot Extraction ────────────────
    const nlu = await parseUserIntent(text);
    console.log(`[ConversationManager] Parsed NLU: intent=${nlu.intent}, conf=${nlu.confidence}`);

    // Confidence check
    if (nlu.confidence < 0.4 || nlu.intent === "UNKNOWN") {
      state.consecutiveFailures++;
      const showKeypadFallback = state.consecutiveFailures >= 2;
      const isTwi = state.language === "twi";
      return {
        state,
        spokenPrompt: isTwi
          ? (showKeypadFallback
            ? "Me pa wo kyɛw, mantie no yiye. Yɛsrɛ wo, mia baako (1) ma menu kɛseɛ no, anaa ka sɛ 'agyae'."
            : "Me pa wo kyɛw, mantie no yiye. Wotumi ka te sɛ 'Mane cedi 500 kɔma Kwame', anaa bɔ nɔma du (10) a wopɛ no.")
          : (showKeypadFallback
            ? "Pardon me, please. I am having trouble catching that. Kindly use your keypad by pressing 1 for the main menu, or say cancel."
            : "Pardon me, please. I didn't quite catch that. You can kindly call out your preferred number like '055 383 8464', or say 'Send 500 cedis to Kwame.'"),
        displayStepTag: "Input Unrecognized",
        requiresPinInput: false,
        isCompleted: false,
        offeredMenuFallback: showKeypadFallback,
        confidence: nlu.confidence,
        activeIntent: "UNKNOWN",
      };
    }

    // Reset failure counter on recognized intent
    state.consecutiveFailures = 0;

    // Check Balance Intent
    if (nlu.intent === "CHECK_BALANCE") {
      const bal = transactionOrchestrator.getAccountBalance("MTN");
      state.status = "OFFER_CONTINUATION";
      return {
        state,
        spokenPrompt: `Sure. Your available balance is ${bal.formatted}. Would you like to do anything else?`,
        displayStepTag: "Account Balance",
        requiresPinInput: false,
        isCompleted: false,
        offeredMenuFallback: false,
        confidence: nlu.confidence,
        activeIntent: "CHECK_BALANCE",
      };
    }

    // Other scoped prototype intents (Graceful prototype responses)
    if (["PAY_BILL", "BUY_AIRTIME", "BUY_DATA", "CASH_OUT", "CHECK_ACCOUNT"].includes(nlu.intent)) {
      return {
        state,
        spokenPrompt: `The ${nlu.intent.replace("_", " ").toLowerCase()} feature is currently in pilot on Ɔkwankyerɛfo Pa. You can try sending money or checking your balance. Would you like to send money?`,
        displayStepTag: "Feature in Pilot",
        requiresPinInput: false,
        isCompleted: false,
        offeredMenuFallback: false,
        confidence: nlu.confidence,
        activeIntent: nlu.intent,
      };
    }

    // Help Intent
    if (nlu.intent === "HELP") {
      return {
        state,
        spokenPrompt: "You can say: 'Send 500 cedis to Kwame', 'Check my balance', or press 1 at any time to use the standard keypad menu.",
        displayStepTag: "Voice Guidance",
        requiresPinInput: false,
        isCompleted: false,
        offeredMenuFallback: false,
        confidence: nlu.confidence,
        activeIntent: "HELP",
      };
    }

    // Process SEND_MONEY
    if (nlu.intent === "SEND_MONEY") {
      this.snapshot(state);
      state.intent = "SEND_MONEY";

      // Fill extracted slots
      if (nlu.amount !== null) state.amount = nlu.amount;
      if (nlu.network !== null) state.network = nlu.network;

      if (nlu.recipient_phone || nlu.recipient_name) {
        const contact = findContact(nlu.recipient_phone || nlu.recipient_name || "");
        if (contact) {
          state.recipient_name = contact.name;
          state.recipient_phone = contact.phoneNumber;
        } else {
          state.recipient_name = nlu.recipient_name;
          state.recipient_phone = nlu.recipient_phone;
        }
      }

      return this.progressSendMoney(state);
    }

    return this.generateStatusPrompt(state, "How can I help you today?", nlu.confidence);
  }

  /**
   * Progresses SEND_MONEY state machine and asks only for what is genuinely missing.
   * If all slots present, skips straight to confirmation!
   */
  private progressSendMoney(state: ConversationState): ConversationTurnResult {
    const isTwi = state.language === "twi";

    // 1. Check network
    if (!state.network) {
      state.status = "AWAITING_NETWORK";
      return {
        state,
        spokenPrompt: isTwi
          ? "Me pa wo kyɛw, network bɛn na worepɛ de adi dwuma? MTN, Telecel, anaa AT?"
          : "Certainly, please. Which network provider would you like to use? MTN, Telecel, or AirtelTigo?",
        displayStepTag: "Network Selection",
        requiresPinInput: false,
        isCompleted: false,
        offeredMenuFallback: false,
        confidence: 0.95,
        activeIntent: "SEND_MONEY",
      };
    }

    // 2. Check recipient
    if (!state.recipient_name && !state.recipient_phone) {
      state.status = "AWAITING_RECIPIENT";
      return {
        state,
        spokenPrompt: isTwi
          ? "Me pa wo kyɛw, hwan na worepɛ amane sika no akɔma no? Wotumi bɔ din te sɛ Kwame anaa bɔ nɔma du (10) a wopɛ no pɛpɛɛpɛ."
          : "Please, who would you like to send money to? Kindly call out a recipient name like Kwame, or speak your preferred 10-digit number.",
        displayStepTag: "Recipient Selection",
        requiresPinInput: false,
        isCompleted: false,
        offeredMenuFallback: false,
        confidence: 0.95,
        activeIntent: "SEND_MONEY",
      };
    }

    // Ensure recipient contact is resolved
    if (!state.recipient_phone && state.recipient_name) {
      const contact = findContact(state.recipient_name);
      if (contact) {
        state.recipient_name = contact.name;
        state.recipient_phone = contact.phoneNumber;
      }
    }

    // 3. Check amount
    if (!state.amount || state.amount <= 0) {
      state.status = "AWAITING_AMOUNT";
      return {
        state,
        spokenPrompt: isTwi
          ? `Me pa wo kyɛw, sika Ghana cedi dodoɔ sɛn na worepɛ amane akɔma ${state.recipient_name || "onipa no"}?`
          : `Please, how much would you like to send to ${state.recipient_name || "the recipient"} in Ghana Cedis?`,
        displayStepTag: "Enter Amount",
        requiresPinInput: false,
        isCompleted: false,
        offeredMenuFallback: false,
        confidence: 0.95,
        activeIntent: "SEND_MONEY",
      };
    }

    // All slots present! Skip straight to confirmation
    state.status = "AWAITING_CONFIRMATION";
    return this.generateConfirmationPrompt(state);
  }

  /**
   * Builds respectful, polite confirmation prompt with clear digit readback
   */
  private generateConfirmationPrompt(state: ConversationState): ConversationTurnResult {
    const cleanPhone = state.recipient_phone ? normalizePhoneNumber(state.recipient_phone) : "";
    const last4Spaced = cleanPhone.length >= 4 ? cleanPhone.slice(-4).split("").join(" ") : "";
    const phoneSpaced = cleanPhone ? formatPhoneNumberForSpeech(cleanPhone) : "";
    const name = state.recipient_name || "Subscriber";
    const amt = state.amount || 0;
    const isTwi = state.language === "twi";

    const spokenPrompt = isTwi
      ? `Medaase pa ara. Woapaw ${name}, a ne nɔma a wopɛ no yɛ ${phoneSpaced || "deɛ ɛwɔ hɔ no"}, a ɛwie ${last4Spaced}. Me pa wo kyɛw, worebɛmane Ghana cedi ${amt} akɔma ${name}. Sɛ ɛyɛ ampa a, ka sɛ 'yoo' anaa mia baako (1) na yɛnkɔ so. Sɛ worepɛ asesa nɔma no a, mia mmienu (2).`
      : `Thank you, please. You selected ${name} with preferred number ${phoneSpaced || "on file"}, ending in ${last4Spaced}. You are about to send ${amt} Ghana Cedis to ${name}. Kindly confirm if you would like to proceed by saying yes or pressing 1, or say change to try another number.`;

    return {
      state,
      spokenPrompt,
      displayStepTag: "Confirm Transfer Summary",
      requiresPinInput: false,
      isCompleted: false,
      offeredMenuFallback: false,
      confidence: 0.98,
      activeIntent: "SEND_MONEY",
    };
  }

  /**
   * Finalizes secure transaction handoff.
   * Verified by secureAuthGate; does not receive or handle any PIN!
   */
  public async completeAuthorizedTransaction(sessionId: string): Promise<ConversationTurnResult> {
    const state = this.getOrCreateSession(sessionId);

    // Call isolated secure auth gate to confirm client screen verification
    const authResult = await secureAuthGate.verifyClientAuthorization({
      sessionId,
      maskedRecipient: state.recipient_phone ? maskPhoneNumber(state.recipient_phone) : "",
      amount: state.amount || 0,
    });

    if (!authResult.authenticated) {
      throw new Error("Authentication failed");
    }

    // Execute through converged Transaction Orchestrator
    const tx = await transactionOrchestrator.executeSendMoney({
      source: "VOICE",
      network: state.network || "MTN",
      recipient_phone: state.recipient_phone || "0553838464",
      recipient_name: state.recipient_name || "Kwame Nyamebere",
      amount: state.amount || 500,
      sessionId,
    });

    state.lastTransactionResult = tx;
    state.status = "OFFER_CONTINUATION";

    return {
      state,
      spokenPrompt: tx.spokenReceipt,
      displayStepTag: "Transaction Completed",
      requiresPinInput: false,
      isCompleted: true,
      offeredMenuFallback: false,
      confidence: 1.0,
      activeIntent: "SEND_MONEY",
    };
  }

  private generateStatusPrompt(state: ConversationState, prompt: string, conf: number): ConversationTurnResult {
    return {
      state,
      spokenPrompt: prompt,
      displayStepTag: "Conversational Assistant",
      requiresPinInput: false,
      isCompleted: false,
      offeredMenuFallback: false,
      confidence: conf,
      activeIntent: state.intent || "OPEN",
    };
  }
}

export const conversationManager = new ConversationManager();
