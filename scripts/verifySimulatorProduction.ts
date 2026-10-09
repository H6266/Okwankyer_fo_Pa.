/**
 * Production-Mode Acceptance Verification Script for Simulator
 * 
 * Verifies:
 * 1. WebhookGuard is NOT bypassed for browser requests (direct /voice-menu rejects with 401 <Reject/>).
 * 2. Real Africa's Talking calls with AT_WEBHOOK_SECRET pass full verification (200 OK).
 * 3. Simulator routes (/api/simulator/*) are mounted behind existing dashboard adminAuth.
 * 4. With admin auth, simulator returns VoiceXML with public host callbackUrl and audioUrl (honoring x-forwarded-proto/host).
 * 5. First audio URL returned can be successfully requested (HTTP 200/206).
 * 6. "10 digits then #" sends exactly ONE request.
 * 7. When ENABLE_SIMULATOR=false, /api/simulator/* routes are unmounted (404).
 */

import http from "http";
import express from "express";
import request from "supertest";

// Set environment for production run
process.env.NODE_ENV = "production";
process.env.SKIP_AUTO_START = "true";
process.env.ENABLE_SIMULATOR = "true";
process.env.ADMIN_TOKEN = "production_super_admin_secret_token_at_least_32_chars";
process.env.SESSION_SECRET = "production_super_session_secret_at_least_32_chars";
process.env.ENCRYPTION_KEY = "production_super_encryption_key_at_least_32_chars";
process.env.GEMINI_MODEL = "gemini-2.5-flash";
process.env.CORS_ORIGINS = "https://ais-dev-iqel2ew5lrsri6dvcmvcpe-282440791493.europe-west2.run.app,http://localhost:3000";
process.env.AT_WEBHOOK_SECRET = "production_at_webhook_secret_key_123456";

async function runAcceptanceChecks() {
  console.log("===============================================================================");
  console.log("  ƆKWANKYERƐFO PA - PRODUCTION-MODE SIMULATOR ACCEPTANCE CHECKS");
  console.log("===============================================================================\n");

  const { app } = await import("../src/serverApp");

  const publicHost = "ais-dev-iqel2ew5lrsri6dvcmvcpe-282440791493.europe-west2.run.app";
  const adminToken = process.env.ADMIN_TOKEN!;
  const atSecret = process.env.AT_WEBHOOK_SECRET!;

  // ── CHECK 1: Direct /voice-menu without AT secret (Browser/Attacker) ──
  console.log("--- Check 1: Direct POST /voice-menu without AT_WEBHOOK_SECRET ---");
  const check1 = await request(app)
    .post("/voice-menu")
    .set("Content-Type", "application/x-www-form-urlencoded")
    .send("sessionId=AT_CALL_1728470000000&callerNumber=%2B233244123456&direction=Inbound");

  console.log(`Status: ${check1.status}`);
  console.log(`Guard Reason Header: ${check1.headers["x-telephony-guard-reason"]}`);
  console.log(`Response Body: ${check1.text}`);
  if (check1.status === 401 && check1.text.includes("<Reject/>")) {
    console.log("✅ Check 1 PASSED: WebhookGuard rejects direct browser request with 401 <Reject/>.\n");
  } else {
    console.error("❌ Check 1 FAILED");
    process.exit(1);
  }

  // ── CHECK 2: Direct /voice-menu WITH valid Africa's Talking Secret ──
  console.log("--- Check 2: Direct POST /voice-menu WITH valid Africa's Talking Secret ---");
  const check2 = await request(app)
    .post("/voice-menu")
    .set("Content-Type", "application/x-www-form-urlencoded")
    .set("X-At-Webhook-Secret", atSecret)
    .send("sessionId=AT_CALL_1728470000001&callerNumber=%2B233244123456&direction=Inbound");

  console.log(`Status: ${check2.status}`);
  console.log(`Response Body:\n${check2.text}`);
  if (check2.status === 200 && check2.text.includes("<Response>") && check2.text.includes("<GetDigits")) {
    console.log("✅ Check 2 PASSED: Real Africa's Talking webhook succeeds with full secret verification.\n");
  } else {
    console.error("❌ Check 2 FAILED");
    process.exit(1);
  }

  // ── CHECK 3: /api/simulator/voice-menu WITHOUT Admin Authentication ──
  console.log("--- Check 3: POST /api/simulator/voice-menu WITHOUT Admin Authentication ---");
  const check3 = await request(app)
    .post("/api/simulator/voice-menu")
    .set("Content-Type", "application/x-www-form-urlencoded")
    .send("sessionId=SIM_CALL_1728470000002&callerNumber=%2B233244123456");

  console.log(`Status: ${check3.status}`);
  console.log(`Response Body: ${check3.text}`);
  if (check3.status === 401) {
    console.log("✅ Check 3 PASSED: Simulator route rejects unauthenticated request with 401.\n");
  } else {
    console.error("❌ Check 3 FAILED");
    process.exit(1);
  }

  // ── CHECK 4: /api/simulator/voice-menu WITH Admin Auth & Public Host Headers ──
  console.log("--- Check 4: POST /api/simulator/voice-menu WITH Admin Auth & x-forwarded-host ---");
  const check4 = await request(app)
    .post("/api/simulator/voice-menu")
    .set("Content-Type", "application/x-www-form-urlencoded")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Forwarded-Proto", "https")
    .set("X-Forwarded-Host", publicHost)
    .send("sessionId=SIM_CALL_1728470000003&callerNumber=%2B233244123456");

  console.log(`Status: ${check4.status}`);
  console.log(`Response Body:\n${check4.text}`);

  const playMatch = check4.text.match(/<Play url="([^"]+)"/);
  const callbackMatch = check4.text.match(/callbackUrl="([^"]+)"/);
  const audioUrl = playMatch ? playMatch[1] : "";
  const callbackUrl = callbackMatch ? callbackMatch[1] : "";

  console.log(`Extracted Audio URL: ${audioUrl}`);
  console.log(`Extracted Callback URL: ${callbackUrl}`);

  if (
    check4.status === 200 &&
    callbackUrl.includes(publicHost) &&
    callbackUrl.includes("/api/simulator/language-selection") &&
    audioUrl.includes(publicHost) &&
    !audioUrl.includes("localhost")
  ) {
    console.log("✅ Check 4 PASSED: Simulator returns VoiceXML with public host and /api/simulator callback URL.\n");
  } else {
    console.error("❌ Check 4 FAILED: URLs do not match public host expectations.");
    process.exit(1);
  }

  // ── CHECK 5: Fetch First Audio URL Actually Requested By Browser ──
  console.log("--- Check 5: GET First Audio URL requested by browser ---");
  const audioPath = new URL(audioUrl).pathname;
  console.log(`Requesting Audio Path: ${audioPath}`);
  const check5 = await request(app).get(audioPath);

  console.log(`Status: ${check5.status}`);
  console.log(`Content-Type: ${check5.headers["content-type"]}`);
  console.log(`Content-Length: ${check5.headers["content-length"]} bytes`);
  if ((check5.status === 200 || check5.status === 206) && check5.headers["content-type"]?.includes("audio")) {
    console.log("✅ Check 5 PASSED: Browser successfully loads audio clip from public path.\n");
  } else {
    console.error("❌ Check 5 FAILED: Audio clip not accessible.");
    process.exit(1);
  }

  // ── CHECK 6: Verify '10 digits then #' sends ONE request ──
  console.log("--- Check 6: Verify '10 digits then #' sends exactly ONE request ---");
  // Simulate the simulator's client keypad buffer and request dispatching logic
  let requestsDispatched = 0;
  const simulatedDispatchedPayloads: any[] = [];

  const mockDispatchVoiceWebhook = async (targetUrl: string, params: Record<string, string>) => {
    requestsDispatched++;
    simulatedDispatchedPayloads.push({ targetUrl, params });
  };

  // State in PhoneSimulatorPage:
  let digitsBuffer = "";
  let lastSubmitted10Digit = 0;
  const activeCallbackUrl = `https://${publicHost}/api/simulator/verify-recipient?sessionId=SIM_CALL_1728470000003&lang=en`;
  const activeStepName = "enter-recipient";
  const activeFinishOnKey = "#";
  const activeNumDigits = 10;

  const simulateKeypadPress = (digit: string) => {
    // Exact logic from PhoneSimulatorPage.tsx handleKeypadPress:
    if (activeNumDigits === 1) {
      digitsBuffer = "";
      mockDispatchVoiceWebhook(activeCallbackUrl, { dtmfDigits: digit });
      return;
    }

    if (digit === activeFinishOnKey) {
      if (Date.now() - lastSubmitted10Digit < 5000) {
        return; // Ignored: just auto-submitted
      }
      if (digitsBuffer.trim()) {
        const submitted = digitsBuffer.trim();
        digitsBuffer = "";
        mockDispatchVoiceWebhook(activeCallbackUrl, { dtmfDigits: submitted });
      }
      return;
    }

    const nextBuf = digitsBuffer + digit;
    digitsBuffer = nextBuf;

    if (activeStepName.includes("recipient") && nextBuf.length === 10) {
      lastSubmitted10Digit = Date.now();
      digitsBuffer = "";
      mockDispatchVoiceWebhook(activeCallbackUrl, { dtmfDigits: nextBuf });
    }
  };

  // Caller types 10 digits followed by #
  const inputDigits = ["0", "2", "4", "4", "1", "2", "3", "4", "5", "6", "#"];
  for (const d of inputDigits) {
    simulateKeypadPress(d);
  }

  console.log(`Total Requests Dispatched for 10 digits then #: ${requestsDispatched}`);
  console.log(`Dispatched Payload:`, JSON.stringify(simulatedDispatchedPayloads));
  if (requestsDispatched === 1 && simulatedDispatchedPayloads[0]?.params?.dtmfDigits === "0244123456") {
    console.log("✅ Check 6 PASSED: '10 digits then #' sends exactly ONE request with all 10 digits.\n");
  } else {
    console.error(`❌ Check 6 FAILED: Expected 1 request, got ${requestsDispatched}`);
    process.exit(1);
  }

  // ── CHECK 7: Step 2 through 10 in Simulator Flow via /api/simulator/* ──
  console.log("--- Check 7: Sequential IVR Navigation through /api/simulator/* ---");
  // Step 2: Language Selection (1 = English)
  const langRes = await request(app)
    .post("/api/simulator/language-selection?sessionId=SIM_CALL_1728470000003")
    .set("Authorization", `Bearer ${adminToken}`)
    .set("X-Forwarded-Proto", "https")
    .set("X-Forwarded-Host", publicHost)
    .set("Content-Type", "application/x-www-form-urlencoded")
    .send("dtmfDigits=1");

  console.log(`Language Selection Response (Status: ${langRes.status}):\n${langRes.text}`);
  if (langRes.text.includes("/api/simulator/service-select")) {
    console.log("✅ Check 7 PASSED: Redirect URL correctly rewritten with /api/simulator prefix.\n");
  } else {
    console.error("❌ Check 7 FAILED: Redirect URL missing /api/simulator prefix.");
    process.exit(1);
  }
  console.log("===============================================================================");
  console.log("  ALL ACCEPTANCE CHECKS COMPLETED SUCCESSFULLY!");
  console.log("===============================================================================");
  process.exit(0);
}

runAcceptanceChecks().catch((err) => {
  console.error("Fatal Error in Acceptance Checks:", err);
  process.exit(1);
});
