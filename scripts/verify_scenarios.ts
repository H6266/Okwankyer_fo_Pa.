/**
 * Headless Browser Verification Script for Ɔkwankyerɛfo Pa Phone Simulator
 * Connects to http://localhost:3000 where ENABLE_SIMULATOR=true is running.
 * Verifies scenarios a, b, c, and full keypad flow in headless Chromium.
 */

import { chromium } from "playwright";

async function run() {
  const PORT = 3000;
  console.log(`[Verify] Connecting to server at http://localhost:${PORT}`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Establish Admin Authentication
    const sessionRes = await page.request.get(`http://localhost:${PORT}/api/admin/session`);
    const sessionData = await sessionRes.json();
    console.log(`[Verify] Admin session query: enableSimulator=${sessionData.enableSimulator}, isDev=${sessionData.isDev}`);

    const adminLoginRes = await page.request.post(`http://localhost:${PORT}/api/admin/login`, {
      data: { password: sessionData.hint || "dev_admin_secret_token_12345" },
    });
    const loginData = await adminLoginRes.json();
    console.log(`[Verify] Admin login success: token=${loginData.token?.slice(0, 10)}...`);

    // Set localStorage token and cookie before loading page
    await page.addInitScript((token) => {
      localStorage.setItem("okw_admin_token", token);
    }, loginData.token);

    // Navigate to Phone Simulator
    await page.goto(`http://localhost:${PORT}/dashboard/phone`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const getTerminalLogs = async () => {
      return await page.$$eval(".font-mono.text-xs > div", (nodes) =>
        nodes.map((n) => n.textContent?.trim() || "")
      );
    };

    console.log("\n=======================================================");
    console.log("SCENARIO A: At service step press 5 (invalid choice)");
    console.log("=======================================================");

    // Start Call
    await page.click("button:has-text('Call')");
    await page.waitForTimeout(600);

    // Press 1 for English
    await page.click("button:has-text('1')");
    await page.waitForTimeout(600);

    // Press 5 at service-select
    await page.click("button:has-text('5')");
    await page.waitForTimeout(600);

    let logs = await getTerminalLogs();
    logs.slice(-8).forEach((l) => console.log(l));

    console.log("\n=======================================================");
    console.log("SCENARIO B: Spoken 'send money' moves to enter-recipient");
    console.log("=======================================================");

    const speechRes = await page.request.post(
      `http://localhost:${PORT}/api/simulator/speech-fallback?step=service-select&sessionId=sim_verify_b&lang=en`,
      {
        headers: { Authorization: `Bearer ${loginData.token}` },
        data: { speechText: "I want to send money" },
      }
    );
    const speechXml = await speechRes.text();
    console.log(`[AI Decision Type]: ${speechRes.headers()["x-ai-decision-type"]}`);
    console.log(`[AI Decision Reason]: ${speechRes.headers()["x-ai-decision-reason"]}`);
    console.log(`[AI Reply Text]: ${speechRes.headers()["x-ai-reply-text"]}`);
    console.log(`[AI Reply Key]: ${speechRes.headers()["x-ai-reply-key"]}`);
    console.log(`[Speech VoiceXML Response]:\n${speechXml}`);

    console.log("\n=======================================================");
    console.log("SCENARIO C: Invalid Recipient (6666666666#) vs Valid Recipient");
    console.log("=======================================================");

    const invalidPhoneRes = await page.request.post(
      `http://localhost:${PORT}/api/simulator/verify-recipient?sessionId=sim_verify_c&lang=en`,
      {
        headers: { Authorization: `Bearer ${loginData.token}` },
        data: { dtmfDigits: "6666666666#" },
      }
    );
    const invalidPhoneXml = await invalidPhoneRes.text();
    console.log(`[Invalid Phone Decision Type]: ${invalidPhoneRes.headers()["x-ai-decision-type"]}`);
    console.log(`[Invalid Phone Reason]: ${invalidPhoneRes.headers()["x-ai-decision-reason"]}`);
    console.log(`[Invalid Phone Reply]: ${invalidPhoneRes.headers()["x-ai-reply-text"]}`);
    console.log(`[Invalid Phone VoiceXML]:\n${invalidPhoneXml}`);

    const validPhoneRes = await page.request.post(
      `http://localhost:${PORT}/api/simulator/verify-recipient?sessionId=sim_verify_c_valid&lang=en`,
      {
        headers: { Authorization: `Bearer ${loginData.token}` },
        data: { dtmfDigits: "0553838464#" },
      }
    );
    const validPhoneXml = await validPhoneRes.text();
    console.log(`\n[Valid Phone VoiceXML Response]:\n${validPhoneXml}`);

    console.log("\n=======================================================");
    console.log("FULL KEYPAD FLOW: Keypad to Safe Confirmation & PIN Handoff");
    console.log("=======================================================");

    // Hang up current call and start fresh full flow
    await page.click("button:has-text('End')");
    await page.waitForTimeout(400);

    // Call
    await page.click("button:has-text('Call')");
    await page.waitForTimeout(500);

    // 1: English
    await page.click("button:has-text('1')");
    await page.waitForTimeout(500);

    // 1: Mobile Money
    await page.click("button:has-text('1')");
    await page.waitForTimeout(500);

    // 1: MTN
    await page.click("button:has-text('1')");
    await page.waitForTimeout(500);

    // 1: Send Money
    await page.click("button:has-text('1')");
    await page.waitForTimeout(500);

    // Enter Recipient: 0553838464#
    const digits = ["0", "5", "5", "3", "8", "3", "8", "4", "6", "4", "#"];
    for (const d of digits) {
      await page.click(`button:has-text('${d}')`);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);

    // Confirm Recipient (1)
    await page.click("button:has-text('1')");
    await page.waitForTimeout(600);

    // Enter Amount: 50#
    for (const d of ["5", "0", "#"]) {
      await page.click(`button:has-text('${d}')`);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);

    // Confirm & Authorize: 1
    await page.click("button:has-text('1')");
    await page.waitForTimeout(1000);

    logs = await getTerminalLogs();
    console.log("\n[Terminal Output for Full Keypad Flow]:");
    logs.slice(-14).forEach((l) => console.log(l));

    const zeroPinVisible = await page.isVisible("text=ZERO-PIN PROTOCOL ACTIVE");
    console.log(`\n[Zero-PIN Overlay visible on screen]: ${zeroPinVisible}`);

    console.log("\n=======================================================");
    console.log("VERIFICATION COMPLETE");
    console.log("=======================================================");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("[Verify] Failure:", err);
  process.exit(1);
});
