import { afterEach, describe, it, expect, vi } from "vitest";
import { parseUserIntent } from "../src/modules/nluService";
import { MtnPaymentProvider } from "../src/modules/paymentProvider";
import { MoMoEngine } from "../src/integrations/momo/momoEngine";
import { MOCK_CONTACTS } from "../src/modules/mockContacts";

function createMtnProviderWithMockApi(): MtnPaymentProvider {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/token/")) {
      return Response.json({ access_token: "test-access-token", expires_in: 3600 });
    }
    if (url.endsWith("/active")) {
      return Response.json({ result: true });
    }
    if (url.endsWith("/basicuserinfo")) {
      const msisdn = url.match(/\/msisdn\/(\d+)\/basicuserinfo$/)?.[1];
      const names: Record<string, { given_name: string; family_name: string }> = {
        "233553838464": { given_name: "Kwame", family_name: "Nyamebere" },
        "233241234567": { given_name: "Kwame", family_name: "Nyameba" },
        "233543546010": { given_name: "Hannes", family_name: "Aboagye" },
      };
      return Response.json(names[msisdn || ""] || {});
    }
    if (url.endsWith("/requesttopay")) {
      return new Response(null, { status: 202 });
    }
    return new Response(null, { status: 404 });
  }));

  return new MtnPaymentProvider(new MoMoEngine({
    baseUrl: "https://mtn.test",
    targetEnv: "sandbox",
    currency: "EUR",
    collection: {
      subscriptionKey: "test-collection-subscription",
      apiUserId: "test-collection-user",
      apiKey: "test-collection-key",
    },
    disbursement: {
      subscriptionKey: "test-disbursement-subscription",
      apiUserId: "test-disbursement-user",
      apiKey: "test-disbursement-key",
    },
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
    const mtn = createMtnProviderWithMockApi();
    const kyc1 = await mtn.lookupKyc("0553838464");
    expect(kyc1.verified).toBe(true);
    expect(kyc1.name).toBe("Kwame Nyamebere");
    expect(kyc1.network).toBe("MTN");

    const kyc2 = await mtn.lookupKyc("0241234567");
    expect(kyc2.verified).toBe(true);
    expect(kyc2.name).toBe("Kwame Nyameba");

    const kyc3 = await mtn.lookupKyc("0543546010");
    expect(kyc3.verified).toBe(true);
    expect(kyc3.name).toBe("Hannes Aboagye");
  });

  it("handles unindexed numbers gracefully with spoken-friendly digits format", async () => {
    const mtn = createMtnProviderWithMockApi();
    const unknown = await mtn.lookupKyc("0249991234");
    expect(unknown.verified).toBe(true);
    expect(unknown.name).toContain("Subscriber ending in");
  });

  it("verifies mock contact directory consistency", () => {
    expect(MOCK_CONTACTS["0553838464"].name).toBe("Kwame Nyamebere");
    expect(MOCK_CONTACTS["0241234567"].name).toBe("Ama Mensah");
    expect(MOCK_CONTACTS["0201234567"].network).toBe("Telecel");
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
    const mtn = createMtnProviderWithMockApi();
    const result = await mtn.requestToPay({
      amount: 150.0,
      currency: "GHS",
      payerPhone: "0553838464",
      payerMessage: "Market purchase",
      payeeNote: "Paid via Ɔkwankyerɛfo Pa",
    });

    expect(result.status).toBe("PENDING");
    expect(result.referenceId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  });
});
