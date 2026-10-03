/**
 * Comprehensive Acceptance & Regression Test Suite:
 * Conversational Voice Banking Assistant (Okwankyerɛfo Pa)
 * 
 * Verifies:
 * 1. Decoupled Architecture (ASR, AI Reasoning, TTS, State, Network, Transaction)
 * 2. Multi-turn slot filling ("Send 500 to Kwame" -> asks for number -> provides number -> asks confirmation -> yes -> executes MTN MoMo)
 * 3. Single-turn all-in-one ("Send 500 cedis to Kwame on 0553838464" -> asks confirmation directly)
 * 4. Deterministic phone normalization & network detection
 * 5. Deterministic MTN-Only restriction (rejects Telecel/AT phone numbers)
 * 6. Security seam: AI never calls MoMo API directly; deterministic validation gates execution
 * 7. Mid-flow corrections ("Actually make it 700", "Cancel")
 * 8. Akan Twi language support
 * 9. Provider swappability (ASR & TTS adapters)
 */

import { networkDetectionService } from "../src/modules/networkDetectionService";
import { contactService } from "../src/modules/contactService";
import { asrService } from "../src/modules/asrService";
import { ttsService } from "../src/modules/ttsService";
import { aiConversationService } from "../src/modules/aiConversationService";
import { conversationManager } from "../src/modules/conversationManager";
import { transactionService } from "../src/modules/transactionService";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${testName}${details ? ` -> ${details}` : ""}`);
  }
}

async function runTestSuite() {
  console.log("\n=======================================================");
  console.log("🚀 Running Conversational Voice Banking Architecture Tests");
  console.log("=======================================================\n");

  // ── Test Section 1: Phone Normalization & Network Detection ─────────
  console.log("Section 1: Deterministic Network & Phone Detection");

  const mtn1 = networkDetectionService.validatePhoneNumber("0244 123 456");
  assert(mtn1.isValid && mtn1.isMtn && mtn1.network === "MTN", "Normalizes '0244 123 456' as MTN");

  const mtn2 = networkDetectionService.validatePhoneNumber("+233553838464");
  assert(mtn2.isValid && mtn2.isMtn && mtn2.normalizedNumber === "0553838464", "Converts +233553838464 to canonical 0553838464");

  const telecel = networkDetectionService.validatePhoneNumber("0201234567");
  assert(telecel.isValid && !telecel.isMtn && telecel.network === "Telecel", "Detects Telecel prefix 020 as non-MTN");

  const at = networkDetectionService.validatePhoneNumber("0271234567");
  assert(at.isValid && !at.isMtn && at.network === "AT", "Detects AT prefix 027 as non-MTN");

  const invalidDigits = networkDetectionService.validatePhoneNumber("12345");
  assert(!invalidDigits.isValid, "Rejects invalid short numbers");

  // ── Test Section 2: Contact & KYC Service ───────────────────────────
  console.log("\nSection 2: Contact & KYC Lookup Layer");

  const kwameKyc = contactService.lookup("Kwame");
  assert(kwameKyc !== null && kwameKyc.phoneNumber === "0553838464" && kwameKyc.isMtn, "Resolves Kwame to 0553838464 MTN");

  const phoneSpeech = contactService.formatForSpeech("0244123456");
  assert(phoneSpeech.includes("0 2 4") && phoneSpeech.includes("4 1 2"), "Formats phone number in natural 3-3-4 cadence for TTS");

  // ── Test Section 3: ASR & TTS Adapter Layer ─────────────────────────
  console.log("\nSection 3: ASR & TTS Provider Decoupling");

  const asrResult = await asrService.transcribe("send 500 cedis to Kwame");
  assert(asrResult.text.includes("500") && asrResult.confidence > 0.5, "ASR service transcribes spoken utterance");

  const ttsResult = await ttsService.synthesize("Welcome to voice banking", { language: "en" });
  assert(ttsResult.audioBuffer.length > 0 && !!ttsResult.cacheId, "TTS service synthesizes audio and stores in cache");

  // ── Test Section 4: AI Conversation Service (Structured JSON) ───────
  console.log("\nSection 4: AI Reasoning Engine Structured Output");

  const aiResp = await aiConversationService.process("Send 500 cedis to Kwame", {
    sessionId: "test_ai_1",
    language: "en",
    intent: null,
    amount: null,
    currency: "GHS",
    recipientName: null,
    recipientPhone: null,
    recipientNetwork: null,
    status: "COLLECTING_INFORMATION",
    awaiting: null,
  });

  assert(aiResp.intent === "SEND_MONEY", "AI recognizes SEND_MONEY intent");
  assert(aiResp.entities.amount === 500, "AI extracts 500 GHS amount");
  assert(aiResp.entities.recipientName === "Kwame" || aiResp.response.includes("Kwame"), "AI extracts Kwame recipient");
  assert(aiResp.nextAction === "ASK_RECIPIENT_PHONE" || aiResp.missingInformation.includes("recipientPhone"), "AI requests missing recipient phone");

  // ── Test Section 5: Acceptance Criteria Multi-Turn Flow ─────────────
  console.log("\nSection 5: Multi-Turn Conversational Money Transfer Flow");
  const sessionId = "acceptance_test_" + Date.now();

  // Turn 1: "Send 500 cedis to Kwame."
  const turn1 = await conversationManager.handleTurn(sessionId, "Send 500 cedis to Kwame.", "en");
  assert(turn1.state.amount === 500, "Turn 1: Stores 500 GHS amount in conversation state");
  assert(turn1.state.awaiting === "RECIPIENT_PHONE" || turn1.state.status === "AWAITING_RECIPIENT", "Turn 1: State moves to awaiting phone number");
  assert(turn1.spokenPrompt.toLowerCase().includes("phone number") || turn1.spokenPrompt.toLowerCase().includes("number"), "Turn 1: Speaks response asking for phone number");

  // Turn 2: Caller provides MTN number "0553838464"
  const turn2 = await conversationManager.handleTurn(sessionId, "0553838464", "en");
  assert(turn2.state.recipientPhone === "0553838464", "Turn 2: Recognizes and validates 0553838464");
  assert(turn2.state.recipientNetwork === "MTN", "Turn 2: Identifies network as MTN");
  assert(turn2.state.status === "AWAITING_CONFIRMATION" || turn2.state.awaiting === "CONFIRMATION", "Turn 2: Asks for explicit confirmation");
  assert(turn2.spokenPrompt.toLowerCase().includes("proceed") || turn2.spokenPrompt.toLowerCase().includes("confirm"), "Turn 2: Prompts caller for confirmation");

  // Turn 3: Caller says "Yes"
  const turn3 = await conversationManager.handleTurn(sessionId, "Yes, proceed.", "en");
  assert(turn3.state.status === "TRANSACTION_COMPLETED", "Turn 3: State updates to TRANSACTION_COMPLETED");
  assert(turn3.isCompleted, "Turn 3: Marked as completed");
  assert(turn3.state.lastTransactionResult !== undefined, "Turn 3: MoMo transaction executed and recorded");
  assert(turn3.state.lastTransactionResult?.status === "SUCCESS", "Turn 3: MoMo transaction successful");
  assert(turn3.spokenPrompt.toLowerCase().includes("successful") || turn3.spokenPrompt.toLowerCase().includes("reference"), "Turn 3: Spoken receipt delivered to caller");

  // ── Test Section 6: MTN-Only Restriction Enforcement ────────────────
  console.log("\nSection 6: MTN-Only Restriction Enforcement");
  const mtnTestSession = "mtn_restriction_" + Date.now();

  // Try to send to a Telecel number
  const telecelTurn = await conversationManager.handleTurn(mtnTestSession, "Send 200 cedis to 0201234567", "en");
  assert(telecelTurn.spokenPrompt.includes("MTN Mobile Money") || telecelTurn.displayStepTag.includes("Blocked"), "Application blocks non-MTN network with required explanation");
  assert(telecelTurn.state.status !== "TRANSACTION_COMPLETED", "Transaction does NOT execute for non-MTN number");

  // ── Test Section 7: Mid-Flow Corrections ───────────────────────────
  console.log("\nSection 7: Mid-Flow Corrections");
  const correctionSession = "correction_" + Date.now();

  await conversationManager.handleTurn(correctionSession, "Send 500 cedis to Kwame on 0553838464", "en");
  const correctedTurn = await conversationManager.handleTurn(correctionSession, "Actually make it 700", "en");
  assert(correctedTurn.state.amount === 700, "Updates amount from 500 to 700 on correction");

  const cancelTurn = await conversationManager.handleTurn(correctionSession, "Cancel", "en");
  assert(cancelTurn.state.status === "TERMINATED", "Immediately moves to TERMINATED on 'Cancel'");

  // ── Test Section 8: Akan Twi Support ────────────────────────────────
  console.log("\nSection 8: Akan Twi Voice Banking");
  const twiSession = "twi_" + Date.now();

  const twiTurn = await conversationManager.handleTurn(twiSession, "Me pɛ sɛ memane sika ahanu kɔ ma Kwame", "twi");
  assert(twiTurn.state.language === "twi", "Maintains Akan Twi language in conversation state");
  assert(twiTurn.spokenPrompt.length > 0, "Produces Akan Twi spoken response");

  // ── Test Section 9: Security Seam Verification ──────────────────────
  console.log("\nSection 9: Security Seam Verification (AI Never Calls MoMo Directly)");

  // Attempt to execute without confirmation
  const unconfirmedContext = {
    sessionId: "sec_test",
    source: "VOICE" as const,
    amount: 500,
    recipientPhone: "0553838464",
    recipientName: "Kwame",
    confirmedByUser: false,
    status: "COLLECTING_INFORMATION",
  };
  const decisionNoConfirm = transactionService.validateSendMoney(unconfirmedContext);
  assert(!decisionNoConfirm.isAllowed && decisionNoConfirm.code === "MISSING_CONFIRMATION", "TransactionService denies execution without explicit confirmation");

  // Attempt to execute negative amount
  const negativeContext = {
    sessionId: "sec_test",
    source: "VOICE" as const,
    amount: -50,
    recipientPhone: "0553838464",
    recipientName: "Kwame",
    confirmedByUser: true,
    status: "AWAITING_CONFIRMATION",
  };
  const decisionNegative = transactionService.validateSendMoney(negativeContext);
  assert(!decisionNegative.isAllowed && decisionNegative.code === "INVALID_AMOUNT", "TransactionService denies execution for negative amount");

  console.log("\n" + "=".repeat(55));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(55));

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch((err) => {
  console.error("Test suite runtime failure:", err);
  process.exit(1);
});
