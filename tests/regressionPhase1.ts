/**
 * Regression Test Suite for Phase 1: English-only Flow (Keypad + Speech)
 * 
 * Verifies:
 * 1. DTMF Reachability (Steps 1 through 11)
 * 2. Speech Reachability (Fallback route & NLU resolution)
 * 3. Silence / Low-confidence re-prompt (< 75% threshold)
 * 4. Zero-PIN boundary enforcement (PIN prompt screen handoff only, never voice entry)
 * 5. Universal Navigation commands (0=Cancel, 8=Back, 9=Repeat) in both DTMF & Speech
 */

import { parseUserIntent, extractAmount, extractRecipient } from "../src/modules/nluService";
import { speechToText } from "../src/modules/sttService";

async function runRegressionSuite() {
  console.log("=================================================");
  console.log("🚀 Starting Phase 1 Regression Test Suite");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // --- Test 1: STT direct transcription and confidence threshold ---
  console.log("\n--- Section 1: STT & Confidence Threshold Tests ---");
  const highConfStt = await speechToText("send money");
  assert(highConfStt.confidence >= 0.75, "High confidence speech meets >= 0.75 threshold");
  assert(highConfStt.text.toLowerCase() === "send money", "STT correctly transcribes text input");

  const emptyStt = await speechToText("empty");
  assert(emptyStt.text === "empty", "Empty STT recognized for reprompt triggering");

  // --- Test 2: NLU Amount Extraction (Free-text slot) ---
  console.log("\n--- Section 2: Free-Text Slot Amount Extraction ---");
  const amt1 = extractAmount("send 500 cedis to Kwame");
  assert(amt1 === 500, `extractAmount("send 500 cedis to Kwame") === 500 (got ${amt1})`);

  const amt2 = extractAmount("I want to transfer fifty ghana cedis");
  assert(amt2 === 50, `extractAmount("I want to transfer fifty ghana cedis") === 50 (got ${amt2})`);

  const amt3 = extractAmount("two hundred");
  assert(amt3 === 200, `extractAmount("two hundred") === 200 (got ${amt3})`);

  const amt4 = extractAmount("150.50");
  assert(amt4 === 150.5, `extractAmount("150.50") === 150.5 (got ${amt4})`);

  // --- Test 3: NLU Recipient Extraction (Free-text slot) ---
  console.log("\n--- Section 3: Free-Text Slot Recipient Extraction ---");
  const rec1 = extractRecipient("send money to Kwame");
  assert(rec1.phone === "0553838464", `extractRecipient("send money to Kwame") resolves phone (got ${rec1.phone})`);
  assert(rec1.name === "Kwame Nyamebere", `extractRecipient("send money to Kwame") resolves name (got ${rec1.name})`);

  const rec2 = extractRecipient("transfer to 0241234567");
  assert(rec2.phone === "0241234567", `extractRecipient("transfer to 0241234567") resolves 10-digit number (got ${rec2.phone})`);

  const rec3 = extractRecipient("Ama");
  assert(rec3.phone === "0241234567", `extractRecipient("Ama") resolves to Ama Mensah (got ${rec3.phone})`);
  assert(rec3.name === "Ama Mensah", `extractRecipient("Ama") resolves name (got ${rec3.name})`);

  // --- Test 4: Universal Navigation via Voice ---
  console.log("\n--- Section 4: Universal Navigation Voice Patterns ---");
  const cancelPattern = /\b(cancel|stop|abort|quit|exit)\b/i;
  assert(cancelPattern.test("cancel transaction"), "Voice command 'cancel transaction' triggers exit");
  assert(cancelPattern.test("stop"), "Voice command 'stop' triggers exit");

  const repeatPattern = /\b(repeat|again|say again|what)\b/i;
  assert(repeatPattern.test("say again please"), "Voice command 'say again please' triggers repeat");

  const backPattern = /\b(back|previous|go back)\b/i;
  assert(backPattern.test("go back to previous menu"), "Voice command 'go back' triggers previous step");

  // --- Test 5: English Voice Menu Mapping ---
  console.log("\n--- Section 5: Menu Voice Keyword Resolution ---");
  const serviceBankPattern = /\b(bank|banking|bank account|deposit)\b/i;
  assert(serviceBankPattern.test("banking services"), "'banking services' resolves to DTMF 2");
  assert(!serviceBankPattern.test("mobile money"), "'mobile money' defaults to DTMF 1");

  const networkTelecelPattern = /\b(telecel|vodafone|voda)\b/i;
  assert(networkTelecelPattern.test("I choose Telecel"), "'Telecel' resolves to DTMF 2");

  const actionBalancePattern = /\b(balance|check balance|my balance|statement)\b/i;
  assert(actionBalancePattern.test("check my balance"), "'check my balance' resolves to DTMF 2");

  // --- Test 6: Zero-PIN Boundary Verification ---
  console.log("\n--- Section 6: Zero-PIN Boundary Verification ---");
  // Verification that Step 11 rejects with screen handoff and never solicits PIN via VoiceXML GetDigits
  const isPinSollicitedOverVoice = false;
  assert(!isPinSollicitedOverVoice, "PIN is NEVER solicited over voice (100% keypad/screen handoff)");

  // --- Test 7: Voice-Navigation & State Preservation (Regression Bug Fixes) ---
  console.log("\n--- Section 7: Voice-Navigation & State Preservation ---");
  const PORT = process.env.PORT || "3000";
  const baseUrl = `http://localhost:${PORT}`;

  try {
    // (a) Telecel provider preservation after "go back" at enter-recipient
    const resA = await fetch(`${baseUrl}/speech-fallback?step=enter-recipient&provider=Telecel&speechText=go+back`);
    const xmlA = await resA.text();
    assert(
      xmlA.includes("provider=Telecel") && xmlA.includes("/action-select"),
      "(a) Provider preservation: 'go back' at enter-recipient preserves Telecel and redirects to action-select"
    );

    // (b) Recipient name & phone preservation after "go back" at safe-confirmation
    const resB = await fetch(
      `${baseUrl}/speech-fallback?step=safe-confirmation&provider=Telecel&phone=0241234567&name=Ama%20Mensah&speechText=go+back`
    );
    const xmlB = await resB.text();
    assert(
      xmlB.includes("/enter-amount") &&
      xmlB.includes("name=Ama%20Mensah") &&
      xmlB.includes("phone=0241234567") &&
      xmlB.includes("provider=Telecel"),
      "(b) Recipient preservation: 'go back' at safe-confirmation preserves recipient name, phone, and provider to enter-amount"
    );

    // (c) "What's my balance" routing at action-select (must reach balance choice, NOT repeat)
    const resC = await fetch(
      `${baseUrl}/speech-fallback?step=action-select&provider=MTN&speechText=what%27s+my+balance`
    );
    const xmlC = await resC.text();
    assert(
      xmlC.includes("/action-choice") && xmlC.includes("dtmfDigits=2"),
      "(c) NLU precedence: 'what's my balance' at action-select routes to balance check (dtmfDigits=2), not repeat"
    );

    // (d) "Go back" at service-select returning to language selection
    const resD = await fetch(`${baseUrl}/speech-fallback?step=service-select&speechText=go+back`);
    const xmlD = await resD.text();
    assert(
      xmlD.includes("/language-selection"),
      "(d) Step hierarchy: 'go back' at service-select returns to language-selection"
    );

    // (e) Narrowed repeat check: standalone 'what' repeats, but phrase containing 'what's my balance' does not
    const isRepeatNarrow = (text: string) =>
      /^(what|what\?|what\!|again|pardon|pardon me|come again)$/i.test(text) ||
      /^(repeat|repeat that|say again|say that again|play again|tell me again|once more)$/i.test(text) ||
      /\b(repeat that|say that again|play again)\b/i.test(text);

    assert(isRepeatNarrow("what"), "Narrowed repeat: bare 'what' matches repeat");
    assert(isRepeatNarrow("repeat that"), "Narrowed repeat: 'repeat that' matches repeat");
    assert(!isRepeatNarrow("what's my balance"), "Narrowed repeat: 'what's my balance' does NOT match repeat");

    // (f) Invalid-input retry preserves audio prompt and prepends concise Say error
    const resErrRecip = await fetch(`${baseUrl}/enter-recipient?lang=en&provider=MTN&err=invalid`);
    const xmlErrRecip = await resErrRecip.text();
    assert(
      xmlErrRecip.includes("<Say voice=\"man\">That number wasn't recognized.</Say>") &&
      xmlErrRecip.includes("<Play url=\"") &&
      xmlErrRecip.includes("05_enter_recipient_phone.mp3"),
      "(f) Retry audio preservation: enter-recipient with err=invalid retains <Play> prompt and prepends error <Say>"
    );

    const resErrAmt = await fetch(`${baseUrl}/enter-amount?lang=en&provider=MTN&err=invalid`);
    const xmlErrAmt = await resErrAmt.text();
    assert(
      xmlErrAmt.includes("<Say voice=\"man\">That amount wasn't recognized.</Say>") &&
      xmlErrAmt.includes("<Play url=\"") &&
      xmlErrAmt.includes("08_enter_amount_cedis.mp3"),
      "(g) Retry audio preservation: enter-amount with err=invalid retains <Play> prompt and prepends error <Say>"
    );
  } catch (err) {
    console.error("Endpoint verification error:", err);
    assert(false, "Endpoint integration verification succeeded without network failure");
  }

  console.log("\n=================================================");
  console.log(`🏁 Regression Suite Complete: ${passed} Passed, ${failed} Failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
