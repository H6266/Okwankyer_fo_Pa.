/**
 * Ɔkwankyerɛfo Pa - Extensible Intent Engine
 * Recognizes user intentions from Ghanaian English, Akan Twi, and DTMF.
 */

import { IntentName, AiLanguage } from "../core/aiTypes";

export interface IntentMatch {
  intent: IntentName;
  confidence: number;
  matchedRule?: string;
}

export class IntentEngine {
  /**
   * Fast-path deterministic rule-based intent classification.
   */
  public classify(text: string, currentStep?: string): IntentMatch {
    const lower = text.toLowerCase().trim();

    // 1. Confirmation / Affirmation
    if (/^(1|yes|yeah|yep|sure|ok|okay|aane|ɛyɛ|eyie|yɛ|confirm|pene|pene so)$/i.test(lower)) {
      return { intent: "CONFIRM", confidence: 0.99, matchedRule: "exact_confirm" };
    }

    // 2. Cancellation / Denial
    if (/^(2|no|nope|cancel|stop|dabi|twa mu|abort|exit)$/i.test(lower)) {
      return { intent: "CANCEL", confidence: 0.99, matchedRule: "exact_cancel" };
    }

    // 3. Navigation: Home
    if (/^(0|home|go home|main menu|start over|kɔ fie|firi ase)$/i.test(lower) || lower.includes("take me home") || lower.includes("go to home")) {
      return { intent: "GO_HOME", confidence: 0.95, matchedRule: "go_home" };
    }

    // 4. Navigation: Back
    if (/^(8|back|go back|previous|san|san akyi|kɔ akyi)$/i.test(lower) || lower.includes("take me back") || lower.includes("go back")) {
      return { intent: "GO_BACK", confidence: 0.95, matchedRule: "go_back" };
    }

    // 5. Repeat
    if (/^(9|repeat|say that again|say again|tie bio|ka biom|what did you say)$/i.test(lower) || lower.includes("repeat that")) {
      return { intent: "REPEAT", confidence: 0.95, matchedRule: "repeat" };
    }

    // 6. Help
    if (lower.includes("help") || lower.includes("boa me") || lower.includes("i don't understand") || lower.includes("mente aseɛ")) {
      return { intent: "HELP", confidence: 0.92, matchedRule: "help" };
    }

    // 7. Mid-flow corrections / Changes
    if (
      lower.includes("actually") ||
      lower.includes("make it") ||
      lower.includes("change") ||
      lower.includes("instead") ||
      lower.includes("sesa") ||
      lower.includes("i meant") ||
      lower.includes("that's not right") ||
      lower.includes("wrong number")
    ) {
      return { intent: "CHANGE_INFORMATION", confidence: 0.90, matchedRule: "correction" };
    }

    // 8. Financial: Check balance
    if (
      lower.includes("balance") ||
      lower.includes("check balance") ||
      lower.includes("sika a aka") ||
      lower.includes("me balance") ||
      lower.includes("how much do i have")
    ) {
      return { intent: "CHECK_BALANCE", confidence: 0.95, matchedRule: "check_balance" };
    }

    // 9. Financial: Send money / MoMo Transfer
    if (
      lower.includes("send money") ||
      lower.includes("send sika") ||
      lower.includes("mane sika") ||
      lower.includes("transfer") ||
      lower.includes("momo") ||
      lower.includes("fa sika kɔ") ||
      lower.startsWith("send ") ||
      lower.startsWith("mane ")
    ) {
      return { intent: "SEND_MONEY", confidence: 0.93, matchedRule: "send_money" };
    }

    // 10. Financial: Pay bills
    if (lower.includes("bill") || lower.includes("tua bill") || lower.includes("ecg") || lower.includes("gwcl") || lower.includes("water bill") || lower.includes("light bill")) {
      return { intent: "PAY_BILL", confidence: 0.93, matchedRule: "pay_bill" };
    }

    // 11. Financial: Buy Airtime / Bundle
    if (lower.includes("airtime") || lower.includes("credit") || lower.includes("tɔ airtime") || lower.includes("tɔ credit") || lower.includes("recharge")) {
      return { intent: "BUY_AIRTIME", confidence: 0.93, matchedRule: "buy_airtime" };
    }

    if (lower.includes("data") || lower.includes("bundle") || lower.includes("internet")) {
      return { intent: "BUY_DATA", confidence: 0.93, matchedRule: "buy_data" };
    }

    // 12. Financial: Cash Out
    if (lower.includes("cash out") || lower.includes("withdraw") || lower.includes("allow cash out") || lower.includes("allow cashout")) {
      return { intent: "CASH_OUT", confidence: 0.93, matchedRule: "cash_out" };
    }

    // 13. Contextual Slot Inputs: Phone Number / Recipient Step
    if (/\b(0[25][0-9]{8}|233[25][0-9]{8})\b/.test(text) || currentStep === "recipient" || currentStep === "kyc") {
      return { intent: "SEND_MONEY", confidence: 0.95, matchedRule: "recipient_slot" };
    }

    // 14. Contextual Slot Inputs: Amount Step
    if ((/\b\d+(\.\d{1,2})?\s*(cedis?|ghs)?\b/i.test(text) && currentStep === "amount") || currentStep === "amount") {
      return { intent: "SEND_MONEY", confidence: 0.95, matchedRule: "amount_slot" };
    }

    // Step-contextual single digits
    if (currentStep === "service") {
      if (lower === "1") return { intent: "SEND_MONEY", confidence: 0.95 };
      if (lower === "2") return { intent: "CHECK_ACCOUNT", confidence: 0.95 };
    }
    if (currentStep === "provider") {
      return { intent: "SEND_MONEY", confidence: 0.95, matchedRule: "provider_select" };
    }

    return { intent: "UNKNOWN", confidence: 0.3 };
  }
}

export const intentEngine = new IntentEngine();
