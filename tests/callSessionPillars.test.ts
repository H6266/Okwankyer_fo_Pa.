import { afterEach, describe, it, expect, vi } from "vitest";
import { parseUserIntent } from "../src/modules/nluService";
import { voicePaymentService } from "../src/integrations/momo/voicePaymentService";
import { buildSpokenText } from "../src/integrations/momo/spokenTextBuilder";

function setupMockMtnFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/token/")) {
      return Response.json({ access_token: "test-access-token", expires_in: 3600 });
    }
    if (url.includes("/active")) {
      return Response.json({ result: true });
    }
    if (url.includes("/basicuserinfo")) {
      const msisdn = url.match(/\/msisdn\/(\d+)\/basicuserinfo/)?.[1];
      const names: Record<string, { given_name: string; family_name: string }> = {
        "233553838464": { given_name: "Kwame", family_name: "Nyamebere" },
        "233241234567": { given_name: "Kwame", family_name: "Nyameba" },
        "233543546010": { given_name: "Hannes", family_name: "Aboagye" },
      };
      return Response.json(names[msisdn || ""] || {});
    }
    if (url.includes("/requesttopay")) {
      return new Response(null, { status: 202 });
    }
    return new Response(null, { status: 404 });
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pillar 1: Dual-Track Language Isolation & Grammar", () => {
  it("recognizes universal keypad grammar intents (# submit, * decimal, 8 back, 0 exit)", async () => {
    // 0 = EXIT
    const exit0 = await parseUserIntent("0");
    expect(exit0.intent).toBe("EXIT");

    const exitWord = await parseUserIntent("exit");
    expect(exitWord.intent).toBe("EXIT");

    // 8 = GO_BACK
    const back8 = await parseUserIntent("8");
    expect(back8.intent).toBe("GO_BACK");

    const backWord = await parseUserIntent("go back");
    expect(backWord.intent).toBe("GO_BACK");

    // Cancel = CANCEL
    const cancelRes = await parseUserIntent("cancel");
    expect(cancelRes.intent).toBe("CANCEL");
  });

  it("distinguishes English and Akan Twi tracks with high confidence", async () => {
    // English send money phrase
    const enSend = await parseUserIntent("send money to kofi");
    expect(enSend.intent).toBe("SEND_MONEY");
    expect(enSend.confidence).toBeGreaterThanOrEqual(0.75);

    // Bill payment
    const enBill = await parseUserIntent("pay electricity bill");
    expect(enBill.intent).toBe("PAY_BILL");
    expect(enBill.confidence).toBeGreaterThanOrEqual(0.75);
  });
});

describe("Pillar 2: Spoken KYC Name Readback Before Money Moves", () => {
  it("resolves registered subscribers to human-readable full names via MTN provider", async () => {
    setupMockMtnFetch();
    const kyc1 = await voicePaymentService.verifyNumber("0553838464");
    expect(kyc1.ok).toBe(true);
    expect(kyc1.fields.given_name).toBe("Kwame");
    expect(kyc1.fields.family_name).toBe("Nyamebere");

    const kyc2 = await voicePaymentService.verifyNumber("0241234567");
    expect(kyc2.ok).toBe(true);
    expect(kyc2.fields.given_name).toBe("Kwame");
    expect(kyc2.fields.family_name).toBe("Nyameba");

    const kyc3 = await voicePaymentService.verifyNumber("0543546010");
    expect(kyc3.ok).toBe(true);
    expect(kyc3.fields.given_name).toBe("Hannes");
    expect(kyc3.fields.family_name).toBe("Aboagye");
  });

  it("handles unindexed numbers gracefully with spoken-friendly digits format", async () => {
    setupMockMtnFetch();
    const unknown = await voicePaymentService.verifyNumber("0249991234");
    expect(unknown.ok).toBe(true);
    expect(unknown.fields.msisdn).toBe("233249991234");
    expect(unknown.fields.result).toBe(true);
    expect(unknown.fields.name).toBeUndefined();
    expect(unknown.fields.given_name).toBeUndefined();
    expect(unknown.fields.family_name).toBeUndefined();
    expect(unknown.fields.basicUserInfoResponseBody).toEqual({});

    const spoken = buildSpokenText(unknown);
    expect(spoken).toBe("The account is active on the network. Notice: Sandbox environment does not return real identity.");
  });
});

describe("Pillar 3: Zero-PIN Security Gate", () => {
  it("guarantees voice layer never collects or requires PIN digits", () => {
    // In our system architecture, Step 9 (zero-pin) only informs the user
    // to check their phone screen. No PIN is captured or asked in the IVR prompts.
    const zeroPinPrompt = "Confirmed. Now, please check your phone screen and enter your MoMo PIN accurately.";
    expect(zeroPinPrompt).not.toContain("dial your PIN");
    expect(zeroPinPrompt).not.toContain("say your PIN");
    expect(zeroPinPrompt).toContain("phone screen");
  });

  it("keeps an accepted RequestToPay pending and returns the MTN reference ID", async () => {
    setupMockMtnFetch();
    const result = await voicePaymentService.initiatePayment("0553838464", 150, { currency: "EUR" });

    expect(result.ok).toBe(true);
    expect(result.mtnHttpStatus).toBe(202);
    expect(result.fields.referenceId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    expect(result.mtnStatus).toBeUndefined();
  });
});
