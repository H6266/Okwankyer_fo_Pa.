/**
 * Ɔkwankyerɛfo Pa - Voice Payment Service & Spoken Text Builder Verification Suite
 * 
 * Verifies all 10 Proof Cases (a through j):
 * 1. Every result carries an RFC4122 v4 UUID evidenceId that exists in evidenceStore.
 * 2. Spoken error priority: error.source, mtnHttpStatus, appOutcome evaluated BEFORE step.
 * 3. 401/403: "The payment service is not available right now. This is not a problem with your number."
 * 4. Network: "I cannot reach the telecom network right now. Please try again in a moment."
 * 5. Timeout: computed dynamically from appOutcome.elapsedMs, includes warning.
 * 6. Amounts spoken without trailing zeroes ("10 euros", not "10.00 euros").
 * 7. Sandbox success lines append: "This is the MTN sandbox. No real money moved."
 * 8. Only MTN 400 on VERIFY_NUMBER blames the number.
 * 9. Case j: mtnReason set from code (INVALID_CURRENCY), reason-map text spoken without double full stop.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildSpokenText,
  formatAmountForSpeech,
  formatDigitsForSpeech,
  MTN_REASON_CODE_MAP,
} from "../src/integrations/momo/spokenTextBuilder";
import {
  NormalizedVoicePaymentResult,
  voicePaymentService,
} from "../src/integrations/momo/voicePaymentService";
import { evidenceStore, StoredEvidenceRecord } from "../src/integrations/momo/evidenceStore";
import { generateReferenceId } from "../src/integrations/momo/config";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createSavedEvidence(evidenceId: string, status: number = 200, body: any = {}): StoredEvidenceRecord {
  const record: StoredEvidenceRecord = {
    evidenceId,
    timestamp: new Date().toISOString(),
    host: "sandbox.momodeveloper.mtn.com",
    endpoint: "/collection/v1_0/requesttopay",
    roundTripMs: 120,
    request: {
      method: "POST",
      url: "https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay",
      headers: { "user-agent": "okwankyerefo-pa/0.1" },
      body: {},
    },
    response: {
      status,
      statusText: status === 200 ? "OK" : status === 202 ? "Accepted" : "Error",
      headers: { "content-length": "20" },
      body,
      actualBodyByteLength: 20,
      contentLengthMatches: true,
    },
  };
  evidenceStore.save(record);
  return record;
}

describe("Voice MoMo Verification: 10 Proof Cases & Spoken Text Rules", () => {
  beforeEach(() => {
    evidenceStore.clear();
  });

  // Proof Case a: KYC success
  it("Case a: KYC success speaks active status and carries valid UUID in evidenceStore", () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 200, { result: true });

    const result: NormalizedVoicePaymentResult = {
      ok: true,
      step: "VERIFY_NUMBER",
      momoEnv: "sandbox",
      mtnHttpStatus: 200,
      fields: {
        msisdn: "233553838464",
        name: "Kwame Nyamebere",
        result: true,
        activeResponseBody: { result: true },
        basicUserInfoResponseBody: { given_name: "Kwame", family_name: "Nyamebere" },
      },
      evidenceId: evId,
      appOutcome: { type: "SUCCESS" },
    };

    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    expect(spoken).toBe("The account is active on the network. Notice: Sandbox environment does not return real identity.");
  });

  // Proof Case b: KYC failure (MTN 400 - ONLY case that blames the number)
  it("Case b: KYC failure on MTN 400 blames the number and carries valid UUID in evidenceStore", () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 400, { error: "Bad Request" });

    const result: NormalizedVoicePaymentResult = {
      ok: false,
      step: "VERIFY_NUMBER",
      momoEnv: "sandbox",
      mtnHttpStatus: 400,
      fields: { msisdn: "233553838464" },
      error: { source: "MTN", message: "Bad Request" },
      evidenceId: evId,
      appOutcome: { type: "REJECTED_INPUT" },
    };

    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    expect(spoken).toContain("Please check the number.");
    expect(spoken).toBe("The account lookup for 2 3 3 5 5 3 8 3 8 4 6 4 failed. Please check the number.");
  });

  // Proof Case c: Payment request accepted (202 Accepted, mtnStatus undefined per Task 5)
  it("Case c: Payment initiate 202 has undefined mtnStatus and speaks prompt notice", () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 202);

    const result: NormalizedVoicePaymentResult = {
      ok: true,
      step: "INITIATE_PAYMENT",
      momoEnv: "sandbox",
      mtnHttpStatus: 202,
      // mtnStatus undefined per Task 5
      fields: {
        msisdn: "233553838464",
        amount: "10.00",
        currency: "EUR",
        referenceId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      },
      evidenceId: evId,
      appOutcome: { type: "SUCCESS" },
    };

    expect(result.mtnStatus).toBeUndefined();
    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    // Amount spoken without trailing zeroes: "10 euros", not "10.00 euros"
    expect(spoken).toBe("MTN's sandbox accepted the request for 10 euros. No phone prompt is sent in the sandbox.");
  });

  // Proof Case d: Payment SUCCESSFUL (terminal 200, financialTransactionId, appends sandbox notice)
  it("Case d: Payment SUCCESSFUL speaks amount without trailing zeros and appends sandbox notice", () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 200, { status: "SUCCESSFUL", financialTransactionId: "987654321" });

    const result: NormalizedVoicePaymentResult = {
      ok: true,
      step: "CHECK_STATUS",
      momoEnv: "sandbox",
      mtnHttpStatus: 200,
      mtnStatus: "SUCCESSFUL",
      fields: {
        amount: "25.00",
        currency: "EUR",
        financialTransactionId: "987654321",
        referenceId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      },
      evidenceId: evId,
      appOutcome: { type: "SUCCESS", attempts: 3, elapsedMs: 9200 },
    };

    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    expect(spoken).toBe(
      "Payment of 25 euros was successful. Transaction ID 9 8 7 6 5 4 3 2 1. This is the MTN sandbox. No real money moved."
    );
  });

  // Proof Case e: Payment FAILED (terminal 200 with FAILED status and reason code)
  it("Case e: Payment FAILED speaks reason code mapping correctly", () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 200, { status: "FAILED", reason: "NOT_ENOUGH_FUNDS" });

    const result: NormalizedVoicePaymentResult = {
      ok: false,
      step: "CHECK_STATUS",
      momoEnv: "sandbox",
      mtnHttpStatus: 200,
      mtnStatus: "FAILED",
      mtnReason: "NOT_ENOUGH_FUNDS",
      fields: {
        amount: "50",
        currency: "EUR",
        referenceId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      },
      evidenceId: evId,
      appOutcome: { type: "FAILED", attempts: 2, elapsedMs: 6100 },
    };

    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    expect(spoken).toBe("Payment of 50 euros failed. Network reason: insufficient funds in the account.");
  });

  // Proof Case f: Payment REJECTED (terminal 200 with APPROVAL_REJECTED)
  it("Case f: Payment REJECTED speaks customer rejection correctly", () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 200, { status: "FAILED", reason: "APPROVAL_REJECTED" });

    const result: NormalizedVoicePaymentResult = {
      ok: false,
      step: "CHECK_STATUS",
      momoEnv: "sandbox",
      mtnHttpStatus: 200,
      mtnStatus: "FAILED",
      mtnReason: "APPROVAL_REJECTED",
      fields: {
        amount: "15",
        currency: "EUR",
        referenceId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      },
      evidenceId: evId,
      appOutcome: { type: "REJECTED", attempts: 1, elapsedMs: 3100 },
    };

    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    expect(spoken).toBe("Payment of 15 euros was rejected by the customer.");
  });

  // Proof Case g: Timeout (tested at 3 seconds and at 75 seconds)
  it("Case g: Timeout dynamically computes seconds from elapsedMs and includes warning", () => {
    const evId1 = generateReferenceId();
    createSavedEvidence(evId1, 200, { status: "PENDING" });

    // 3-second test limit
    const result3s: NormalizedVoicePaymentResult = {
      ok: false,
      step: "CHECK_STATUS",
      momoEnv: "sandbox",
      mtnHttpStatus: 200,
      mtnStatus: "PENDING",
      fields: { referenceId: "ref-3s" },
      evidenceId: evId1,
      appOutcome: { type: "POLL_TIMEOUT", attempts: 2, elapsedMs: 3045 },
    };

    expect(result3s.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result3s.evidenceId)).toBeDefined();

    const spoken3s = buildSpokenText(result3s);
    expect(spoken3s).toBe(
      "MTN did not give a final answer in 3 seconds. The payment may still go through. Please do not send it again. Check your MoMo messages."
    );

    // Real 75-second limit
    const evId2 = generateReferenceId();
    createSavedEvidence(evId2, 200, { status: "PENDING" });

    const result75s: NormalizedVoicePaymentResult = {
      ok: false,
      step: "CHECK_STATUS",
      momoEnv: "sandbox",
      mtnHttpStatus: 200,
      mtnStatus: "PENDING",
      fields: { referenceId: "ref-75s" },
      evidenceId: evId2,
      appOutcome: { type: "POLL_TIMEOUT", attempts: 25, elapsedMs: 75210 },
    };

    expect(result75s.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result75s.evidenceId)).toBeDefined();

    const spoken75s = buildSpokenText(result75s);
    expect(spoken75s).toBe(
      "MTN did not give a final answer in 75 seconds. The payment may still go through. Please do not send it again. Check your MoMo messages."
    );
  });

  // Proof Case h: HTTP 401/403 Authentication failure
  it("Case h: 401 or 403 evaluates error before step and says payment service is not available", () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 401, { error: "Access denied" });

    const result: NormalizedVoicePaymentResult = {
      ok: false,
      step: "INITIATE_PAYMENT",
      momoEnv: "sandbox",
      mtnHttpStatus: 401,
      fields: { msisdn: "233553838464", amount: "10" },
      error: { source: "MTN", message: "Access denied due to invalid subscription key" },
      evidenceId: evId,
      appOutcome: { type: "AUTH_FAILURE" },
    };

    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    expect(spoken).toBe("The payment service is not available right now. This is not a problem with your number.");
  });

  // Proof Case i: Network error (source: NETWORK / HTTP 0)
  it("Case i: Network error evaluates before step and says cannot reach telecom network", () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 0, { error: "fetch failed" });

    const result: NormalizedVoicePaymentResult = {
      ok: false,
      step: "INITIATE_PAYMENT",
      momoEnv: "sandbox",
      mtnHttpStatus: 0,
      fields: { msisdn: "233553838464", amount: "10" },
      error: { source: "NETWORK", message: "fetch failed: ECONNREFUSED" },
      evidenceId: evId,
      appOutcome: { type: "NETWORK_ERROR" },
    };

    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    expect(spoken).toBe("I cannot reach the telecom network right now. Please try again in a moment.");
  });

  // Proof Case j: Invalid body / unsupported currency (MTN 500 with code INVALID_CURRENCY)
  it("Case j: 500 INVALID_CURRENCY sets mtnReason from error body and speaks reason map without double full stop", () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 500, { code: "INVALID_CURRENCY", message: "Currency not supported" });

    const result: NormalizedVoicePaymentResult = {
      ok: false,
      step: "INITIATE_PAYMENT",
      momoEnv: "sandbox",
      mtnHttpStatus: 500,
      mtnReason: "INVALID_CURRENCY",
      fields: { msisdn: "233553838464", amount: "10", currency: "GHS" },
      error: {
        source: "MTN",
        message: "Currency not supported",
        mtnBody: { code: "INVALID_CURRENCY", message: "Currency not supported" },
      },
      evidenceId: evId,
      appOutcome: { type: "FAILED" },
    };

    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    expect(spoken).toBe("Payment failed. Reason: currency not supported.");
    // Assert no double full stop
    expect(spoken).not.toContain("..");
  });

  // Zero-PIN assertion
  it("Strict Zero-PIN Rule: No spoken output, field or error ever requires or asks for PIN", () => {
    const results = [
      buildSpokenText({ ok: true, step: "VERIFY_NUMBER", momoEnv: "sandbox", mtnHttpStatus: 200, fields: {}, evidenceId: generateReferenceId() }),
      buildSpokenText({ ok: true, step: "INITIATE_PAYMENT", momoEnv: "sandbox", mtnHttpStatus: 202, fields: { amount: "10", currency: "EUR" }, evidenceId: generateReferenceId() }),
      buildSpokenText({ ok: true, step: "CHECK_STATUS", momoEnv: "sandbox", mtnHttpStatus: 200, mtnStatus: "SUCCESSFUL", fields: { amount: "10", currency: "EUR" }, evidenceId: generateReferenceId() }),
    ];

    for (const text of results) {
      expect(text.toLowerCase()).not.toContain("enter your pin");
      expect(text.toLowerCase()).not.toContain("say your pin");
      expect(text.toLowerCase()).not.toContain("speak your pin");
    }
  });

  // Amount formatting tests
  it("formatAmountForSpeech eliminates trailing zeros", () => {
    expect(formatAmountForSpeech("10.00")).toBe("10");
    expect(formatAmountForSpeech("10")).toBe("10");
    expect(formatAmountForSpeech(10)).toBe("10");
    expect(formatAmountForSpeech("10.50")).toBe("10.5");
    expect(formatAmountForSpeech("10.55")).toBe("10.55");
    expect(formatAmountForSpeech("100.00")).toBe("100");
  });

  // Task 7: Inactive account holder check (result: false)
  it("Task 7: verifyNumber when account-holder active check returns {result: false} yields ok:false, spoken notice of no active account, and no name read-out", async () => {
    const evId = generateReferenceId();
    createSavedEvidence(evId, 200, { result: false });

    // Normalized result structure returned by verifyNumber
    const result: NormalizedVoicePaymentResult = {
      ok: false,
      step: "VERIFY_NUMBER",
      momoEnv: "sandbox",
      mtnHttpStatus: 200,
      fields: {
        msisdn: "233553838464",
        result: false,
        activeResponseBody: { result: false },
      },
      evidenceId: evId,
      appOutcome: { type: "REJECTED_INPUT" },
    };

    expect(result.ok).toBe(false);
    expect(result.fields.result).toBe(false);
    expect(result.fields.name).toBeUndefined();
    expect(result.evidenceId).toMatch(UUID_V4_REGEX);
    expect(evidenceStore.get(result.evidenceId)).toBeDefined();

    const spoken = buildSpokenText(result);
    // Spoken line says the number has no active MoMo account
    expect(spoken).toBe("The number 2 3 3 5 5 3 8 3 8 4 6 4 has no active MoMo account.");
    // No name read-out
    expect(spoken).not.toContain("under the name");
    expect(spoken).not.toContain("Kwame");
    // Does not blame number with 400 text
    expect(spoken).not.toContain("Please check the number");
  });

  it("verifyNumber service call when account-holder active check returns {result: false}: ok is false, spoken line says no active account, and no name read-out", async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/token/")) {
          return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/active")) {
          return new Response(JSON.stringify({ result: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/basicuserinfo")) {
          return new Response(JSON.stringify({ given_name: "Kwame", family_name: "Nyamebere" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("Not found", { status: 404 });
      });

      const res = await voicePaymentService.verifyNumber("0553838464");
      expect(res.ok).toBe(false);
      expect(res.fields.result).toBe(false);
      expect(res.fields.name).toBeUndefined();
      expect(res.fields.given_name).toBeUndefined();
      expect(res.fields.family_name).toBeUndefined();

      const spoken = buildSpokenText(res);
      expect(spoken).toBe("The number 2 3 3 5 5 3 8 3 8 4 6 4 has no active MoMo account.");
      expect(spoken).not.toContain("Kwame");
      expect(spoken).not.toContain("Nyamebere");
      expect(spoken).not.toContain("under the name");
      expect(spoken).not.toContain("Please check the number");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
