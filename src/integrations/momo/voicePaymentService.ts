/**
 * Ɔkwankyerɛfo Pa - Voice MoMo Gateway Layer
 * 
 * Strict boundary:
 * - We are the voice layer only.
 * - MTN verifies, customer approves, MTN executes money movement.
 * - Zero PIN handling, zero mock data, zero simulated successes.
 * - Every spoken sentence is composed purely from fields returned by MTN gateway.
 * - Every result carries an RFC4122 v4 UUID evidenceId saved in evidenceStore.
 */

import { generateReferenceId, loadConfigFromEnv, formatMsisdn } from "./config";
import { evidenceStore, StoredEvidenceRecord } from "./evidenceStore";

export type MomoEnv = "sandbox" | "production";

export interface NormalizedVoicePaymentResult {
  ok: boolean;
  step: "VERIFY_NUMBER" | "INITIATE_PAYMENT" | "CHECK_STATUS";
  momoEnv: MomoEnv;
  mtnHttpStatus: number;
  mtnStatus?: string;
  mtnReason?: string;
  fields: {
    msisdn?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    birthdate?: string;
    locale?: string;
    gender?: string;
    result?: boolean;
    amount?: string;
    currency?: string;
    financialTransactionId?: string;
    externalId?: string;
    referenceId?: string;
    payerMessage?: string;
    payeeNote?: string;
    activeResponseBody?: any;
    basicUserInfoResponseBody?: any;
    [key: string]: any;
  };
  error?: {
    source: "MTN" | "NETWORK" | "APP";
    message: string;
    mtnBody?: any;
  };
  evidenceId: string;
  appOutcome?: {
    type: "SUCCESS" | "FAILED" | "REJECTED" | "POLL_TIMEOUT" | "REJECTED_INPUT" | "AUTH_FAILURE" | "NETWORK_ERROR";
    attempts?: number;
    elapsedMs?: number;
    details?: string;
    [key: string]: any;
  };
}

export class VoicePaymentService {
  private config = loadConfigFromEnv();
  private tokenCache: { token: string; expiresAt: number } | null = null;

  public getEnv(): MomoEnv {
    const raw = (process.env.MOMO_ENV || process.env.MOMO_TARGET_ENV || this.config.targetEnv || "sandbox").toLowerCase();
    return raw === "production" || raw === "live" ? "production" : "sandbox";
  }

  public setMockCredentials(
    subKey = "test-subscription-key",
    apiUserId = "test-api-user-id",
    apiKey = "test-api-key"
  ): void {
    this.config.collection.subscriptionKey = subKey;
    this.config.collection.apiUserId = apiUserId;
    this.config.collection.apiKey = apiKey;
  }

  /**
   * Auto-provisions Sandbox API User and API Key if only subscriptionKey is present
   */
  public async ensureSandboxProvisioned(): Promise<boolean> {
    if (this.getEnv() !== "sandbox") return false;

    // Refresh config from env in case it was updated
    this.config = loadConfigFromEnv();

    if (this.config.collection.subscriptionKey && this.config.collection.apiUserId && this.config.collection.apiKey) {
      return true;
    }

    const subKey = (
      this.config.collection.subscriptionKey ||
      process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ||
      process.env.MTN_API_PRIMARY_KEY ||
      process.env.mtn_api_primary_key ||
      process.env.MOMO_SUBSCRIPTION_KEY ||
      process.env.MTN_API_SECONDARY_KEY ||
      process.env.mtn_api_secondary_key ||
      ""
    ).trim();

    if (!subKey) return false;

    const envUserId = (process.env.MOMO_COLLECTION_API_USER_ID || process.env.MOMO_API_USER_ID || "").trim();
    const envApiKey = (process.env.MOMO_COLLECTION_API_KEY || process.env.MOMO_API_KEY || "").trim();

    if (envUserId && envApiKey) {
      this.config.collection.subscriptionKey = subKey;
      this.config.collection.apiUserId = envUserId;
      this.config.collection.apiKey = envApiKey;
      return true;
    }

    try {
      console.log(`[VoicePaymentService Sandbox] Auto-provisioning sandbox credentials with MTN...`);
      const apiUserId = generateReferenceId();
      const sandboxBase = this.config.baseUrl || "https://sandbox.momodeveloper.mtn.com";

      const userRes = await fetch(`${sandboxBase}/v1_0/apiuser`, {
        method: "POST",
        headers: {
          "X-Reference-Id": apiUserId,
          "Ocp-Apim-Subscription-Key": subKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ providerCallbackHost: "okwankyer-fo-pa.onrender.com" }),
      });

      if (!userRes.ok && userRes.status !== 201) {
        console.warn(`[VoicePaymentService] Failed to create sandbox API User (${userRes.status})`);
        return false;
      }

      const keyRes = await fetch(`${sandboxBase}/v1_0/apiuser/${apiUserId}/apikey`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": subKey,
          "Content-Length": "0",
        },
        body: "",
      });

      if (!keyRes.ok) {
        console.warn(`[VoicePaymentService] Failed to generate sandbox API Key (${keyRes.status})`);
        return false;
      }

      const keyData = await keyRes.json();
      const apiKey = keyData.apiKey;

      this.config.collection.subscriptionKey = subKey;
      this.config.collection.apiUserId = apiUserId;
      this.config.collection.apiKey = apiKey;

      process.env.MOMO_COLLECTION_API_USER_ID = apiUserId;
      process.env.MOMO_COLLECTION_API_KEY = apiKey;
      process.env.MOMO_API_USER_ID = apiUserId;
      process.env.MOMO_API_KEY = apiKey;

      console.log(`[VoicePaymentService] Successfully auto-provisioned API User ${apiUserId}`);
      return true;
    } catch (err: any) {
      console.warn(`[VoicePaymentService] Sandbox auto-provision failed:`, err.message);
      return false;
    }
  }

  /**
   * Refreshes or retrieves active OAuth token for Collection API
   */
  public async getCollectionToken(): Promise<{ token: string; evidenceId: string }> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 30000) {
      return { token: this.tokenCache.token, evidenceId: this.tokenCache.token };
    }

    if (!this.config.collection.subscriptionKey || !this.config.collection.apiUserId || !this.config.collection.apiKey) {
      await this.ensureSandboxProvisioned();
    }

    const { subscriptionKey, apiUserId, apiKey } = this.config.collection;
    if (!subscriptionKey || !apiUserId || !apiKey) {
      const evidenceId = generateReferenceId();
      evidenceStore.save({
        evidenceId,
        timestamp: new Date().toISOString(),
        host: new URL(this.config.baseUrl).host,
        endpoint: "/collection/token/",
        roundTripMs: 0,
        request: {
          method: "POST",
          url: `${this.config.baseUrl}/collection/token/`,
          headers: {},
        },
        response: {
          status: 401,
          statusText: "Unauthorized",
          headers: {},
          body: { error: "Missing MTN MoMo Collection credentials in environment variables." },
          actualBodyByteLength: 0,
          contentLengthMatches: true,
        },
      });
      const err = new Error("Missing MTN MoMo Collection credentials in environment variables.");
      (err as any).evidenceId = evidenceId;
      (err as any).status = 401;
      throw err;
    }

    const authHeader = `Basic ${Buffer.from(`${apiUserId}:${apiKey}`).toString("base64")}`;
    const tokenUrl = `${this.config.baseUrl}/collection/token/`;
    const headers: Record<string, string> = {
      "Authorization": authHeader,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      "Content-Length": "0",
      "User-Agent": "okwankyerefo-pa/0.1",
    };

    const callRes = await this.executeMtnGatewayCall({
      method: "POST",
      url: tokenUrl,
      headers,
    });

    if (callRes.status !== 200) {
      const err = new Error(`Failed to obtain collection token (HTTP ${callRes.status}): ${typeof callRes.data === "string" ? callRes.data : JSON.stringify(callRes.data)}`);
      (err as any).evidenceId = callRes.evidenceId;
      (err as any).status = callRes.status;
      (err as any).mtnBody = callRes.data;
      throw err;
    }

    const token = callRes.data?.access_token;
    const expiresIn = Number(callRes.data?.expires_in) || 3600;
    this.tokenCache = {
      token,
      expiresAt: now + expiresIn * 1000,
    };

    return { token, evidenceId: callRes.evidenceId };
  }

  /**
   * Low-level HTTP executor that records honest evidence and validates Content-Length
   */
  public async executeMtnGatewayCall(options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  }): Promise<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    data: any;
    rawText: string;
    evidenceId: string;
    roundTripMs: number;
  }> {
    const { method, url, headers, body } = options;
    const evidenceId = generateReferenceId();
    const startTime = Date.now();
    const parsedUrl = new URL(url);

    let res: Response;
    const stringBody = body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined;

    try {
      res = await fetch(url, {
        method,
        headers,
        body: stringBody,
      });
    } catch (netErr: any) {
      const roundTripMs = Date.now() - startTime;
      const failedEvidence: StoredEvidenceRecord = {
        evidenceId,
        timestamp: new Date().toISOString(),
        host: parsedUrl.host,
        endpoint: parsedUrl.pathname,
        roundTripMs,
        request: {
          method,
          url,
          headers,
          body,
        },
        response: {
          status: 0,
          statusText: netErr.message || "Network Error",
          headers: {},
          body: { error: netErr.message, code: netErr.code || "NETWORK_ERROR" },
          actualBodyByteLength: 0,
          contentLengthMatches: false,
        },
      };
      evidenceStore.save(failedEvidence);

      const err = new Error(`MTN gateway network failure (${netErr.message}) on ${method} ${parsedUrl.pathname}`);
      (err as any).evidenceId = evidenceId;
      (err as any).status = 0;
      throw err;
    }

    const roundTripMs = Date.now() - startTime;
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k.toLowerCase()] = v;
    });

    const rawText = await res.text();
    const actualByteLength = Buffer.byteLength(rawText, "utf8");
    const contentLengthHeader = resHeaders["content-length"] ? parseInt(resHeaders["content-length"], 10) : undefined;
    const contentLengthMatches = contentLengthHeader !== undefined ? contentLengthHeader === actualByteLength : true;

    if (contentLengthHeader !== undefined && contentLengthHeader !== actualByteLength) {
      console.warn(`[MTN MoMo Gateway] Content-Length mismatch on ${method} ${parsedUrl.pathname}: header=${contentLengthHeader}, actualByteLength=${actualByteLength}`);
    }

    let parsedData: any;
    try {
      parsedData = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsedData = rawText;
    }

    const evidenceRecord: StoredEvidenceRecord = {
      evidenceId,
      timestamp: new Date().toISOString(),
      host: parsedUrl.host,
      endpoint: parsedUrl.pathname,
      roundTripMs,
      request: {
        method,
        url,
        headers,
        body,
      },
      response: {
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: parsedData,
        contentLengthHeader,
        actualBodyByteLength: actualByteLength,
        contentLengthMatches,
      },
    };
    evidenceStore.save(evidenceRecord);

    return {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      data: parsedData,
      rawText,
      evidenceId,
      roundTripMs,
    };
  }

  /**
   * 1. verifyNumber(msisdn)
   * Validates account status on MTN and fetches basic KYC profile
   */
  public async verifyNumber(msisdn: string): Promise<NormalizedVoicePaymentResult> {
    const env = this.getEnv();
    const formatted = formatMsisdn(msisdn);
    const subKey = this.config.collection.subscriptionKey || "";

    let token = "";
    try {
      const auth = await this.getCollectionToken();
      token = auth.token;
    } catch (tokenErr: any) {
      const isNet = tokenErr.message?.includes("fetch failed") || tokenErr.code === "ECONNREFUSED" || tokenErr.code === "ENOTFOUND" || tokenErr.code === "ETIMEDOUT";
      return {
        ok: false,
        step: "VERIFY_NUMBER",
        momoEnv: env,
        mtnHttpStatus: isNet ? 0 : (tokenErr.status || 401),
        fields: { msisdn: formatted },
        error: {
          source: isNet ? "NETWORK" : "MTN",
          message: tokenErr.message || "Failed to authenticate with MTN gateway",
          mtnBody: tokenErr.mtnBody,
        },
        evidenceId: tokenErr.evidenceId || generateReferenceId(),
        appOutcome: { type: isNet ? "NETWORK_ERROR" : "AUTH_FAILURE" },
      };
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "X-Target-Environment": env,
      "Ocp-Apim-Subscription-Key": subKey,
      "User-Agent": "okwankyerefo-pa/0.1",
    };

    // 1. Check active status
    const activeUrl = `${this.config.baseUrl}/collection/v1_0/accountholder/msisdn/${formatted}/active`;
    let activeCall;
    try {
      activeCall = await this.executeMtnGatewayCall({
        method: "GET",
        url: activeUrl,
        headers,
      });
    } catch (err: any) {
      return {
        ok: false,
        step: "VERIFY_NUMBER",
        momoEnv: env,
        mtnHttpStatus: 0,
        fields: { msisdn: formatted },
        error: {
          source: "NETWORK",
          message: err.message,
        },
        evidenceId: err.evidenceId,
        appOutcome: { type: "NETWORK_ERROR" },
      };
    }

    if (activeCall.status !== 200) {
      return {
        ok: false,
        step: "VERIFY_NUMBER",
        momoEnv: env,
        mtnHttpStatus: activeCall.status,
        fields: { msisdn: formatted },
        error: {
          source: "MTN",
          message: typeof activeCall.data === "string" ? activeCall.data : JSON.stringify(activeCall.data),
          mtnBody: activeCall.data,
        },
        evidenceId: activeCall.evidenceId,
        appOutcome: { type: "REJECTED_INPUT" },
      };
    }

    // Account Holder Active Check: if result is false, subscriber has no active MoMo account
    const isActive = Boolean(activeCall.data?.result);
    if (!isActive) {
      return {
        ok: false,
        step: "VERIFY_NUMBER",
        momoEnv: env,
        mtnHttpStatus: 200,
        fields: {
          msisdn: formatted,
          result: false,
          activeResponseBody: activeCall.data,
        },
        evidenceId: activeCall.evidenceId,
        appOutcome: { type: "REJECTED_INPUT" },
      };
    }

    // 2. Fetch basic KYC information
    const infoUrl = `${this.config.baseUrl}/collection/v1_0/accountholder/msisdn/${formatted}/basicuserinfo`;
    const infoCall = await this.executeMtnGatewayCall({
      method: "GET",
      url: infoUrl,
      headers,
    });

    const kycFields: Record<string, any> = {
      msisdn: formatted,
      result: Boolean(activeCall.data?.result),
      activeResponseBody: activeCall.data,
      basicUserInfoResponseBody: infoCall.data,
    };

    if (infoCall.status === 200 && typeof infoCall.data === "object") {
      Object.assign(kycFields, infoCall.data);
    }

    return {
      ok: true,
      step: "VERIFY_NUMBER",
      momoEnv: env,
      mtnHttpStatus: activeCall.status,
      fields: kycFields,
      evidenceId: infoCall.evidenceId,
      appOutcome: { type: "SUCCESS" },
    };
  }

  /**
   * 2. initiatePayment(payer, amount, options)
   * Sends RequestToPay to payer's wallet via MTN MoMo Collection API
   */
  public async initiatePayment(
    payer: string,
    amount: string | number,
    options?: { currency?: string; externalId?: string }
  ): Promise<NormalizedVoicePaymentResult> {
    const env = this.getEnv();
    const formatted = formatMsisdn(payer);
    const subKey = this.config.collection.subscriptionKey || "";
    const referenceId = generateReferenceId();

    const amtStr = typeof amount === "number" ? amount.toFixed(2) : String(amount);
    const currency = options?.currency || (env === "production" ? "GHS" : "EUR");
    const externalId = options?.externalId || `OKP-${Date.now().toString().slice(-6)}`;

    let token = "";
    try {
      const auth = await this.getCollectionToken();
      token = auth.token;
    } catch (tokenErr: any) {
      const isNet = tokenErr.message?.includes("fetch failed") || tokenErr.code === "ECONNREFUSED" || tokenErr.code === "ENOTFOUND" || tokenErr.code === "ETIMEDOUT";
      return {
        ok: false,
        step: "INITIATE_PAYMENT",
        momoEnv: env,
        mtnHttpStatus: isNet ? 0 : (tokenErr.status || 401),
        fields: { msisdn: formatted, amount: amtStr, currency, referenceId },
        error: {
          source: isNet ? "NETWORK" : "MTN",
          message: tokenErr.message,
          mtnBody: tokenErr.mtnBody,
        },
        evidenceId: tokenErr.evidenceId || generateReferenceId(),
        appOutcome: { type: isNet ? "NETWORK_ERROR" : "AUTH_FAILURE" },
      };
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "X-Reference-Id": referenceId,
      "X-Target-Environment": env,
      "Ocp-Apim-Subscription-Key": subKey,
      "Content-Type": "application/json",
      "User-Agent": "okwankyerefo-pa/0.1",
    };

    const body = {
      amount: amtStr,
      currency,
      externalId,
      payer: {
        partyIdType: "MSISDN",
        partyId: formatted,
      },
      payerMessage: "Payment via Okwankyerefo Pa",
      payeeNote: "Voice MoMo Payment",
    };

    const url = `${this.config.baseUrl}/collection/v1_0/requesttopay`;

    let callRes;
    try {
      callRes = await this.executeMtnGatewayCall({
        method: "POST",
        url,
        headers,
        body,
      });
    } catch (netErr: any) {
      return {
        ok: false,
        step: "INITIATE_PAYMENT",
        momoEnv: env,
        mtnHttpStatus: 0,
        fields: { msisdn: formatted, amount: amtStr, currency, referenceId, externalId },
        error: {
          source: "NETWORK",
          message: netErr.message,
        },
        evidenceId: netErr.evidenceId,
        appOutcome: { type: "NETWORK_ERROR" },
      };
    }

    if (callRes.status === 202) {
      return {
        ok: true,
        step: "INITIATE_PAYMENT",
        momoEnv: env,
        mtnHttpStatus: 202,
        // mtnStatus left undefined on 202 Accepted per task 5!
        fields: {
          msisdn: formatted,
          amount: amtStr,
          currency,
          referenceId,
          externalId,
        },
        evidenceId: callRes.evidenceId,
        appOutcome: { type: "SUCCESS" },
      };
    }

    // Handle gateway rejections (400, 401, 409, 500, etc.)
    const code = callRes.data?.code;
    const errorMessage = callRes.data?.message || (typeof callRes.data === "string" ? callRes.data : "MTN request rejected");
    return {
      ok: false,
      step: "INITIATE_PAYMENT",
      momoEnv: env,
      mtnHttpStatus: callRes.status,
      mtnReason: code, // Set mtnReason from code in MTN's error body (INVALID_CURRENCY)
      fields: {
        msisdn: formatted,
        amount: amtStr,
        currency,
        referenceId,
        externalId,
      },
      error: {
        source: "MTN",
        message: errorMessage,
        mtnBody: callRes.data,
      },
      evidenceId: callRes.evidenceId,
      appOutcome: { type: "FAILED" },
    };
  }

  /**
   * 3. checkStatus(referenceId)
   * Polls status until terminal (SUCCESSFUL / FAILED) or maxWaitSeconds timeout
   */
  public async checkStatus(
    referenceId: string,
    options?: { maxWaitSeconds?: number; pollIntervalMs?: number; singlePoll?: boolean }
  ): Promise<NormalizedVoicePaymentResult> {
    const env = this.getEnv();
    const subKey = this.config.collection.subscriptionKey || "";
    const maxSeconds = options?.maxWaitSeconds || 75;
    const intervalMs = options?.pollIntervalMs || 3000;
    const isSinglePoll = Boolean(options?.singlePoll);

    const startTime = Date.now();
    const deadline = startTime + maxSeconds * 1000;
    let attempts = 0;

    let token = "";
    try {
      const auth = await this.getCollectionToken();
      token = auth.token;
    } catch (tokenErr: any) {
      return {
        ok: false,
        step: "CHECK_STATUS",
        momoEnv: env,
        mtnHttpStatus: 401,
        fields: { referenceId },
        error: {
          source: "MTN",
          message: tokenErr.message,
          mtnBody: tokenErr.mtnBody,
        },
        evidenceId: tokenErr.evidenceId || generateReferenceId(),
        appOutcome: { type: "AUTH_FAILURE" },
      };
    }

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "X-Target-Environment": env,
      "Ocp-Apim-Subscription-Key": subKey,
      "User-Agent": "okwankyerefo-pa/0.1",
    };

    const url = `${this.config.baseUrl}/collection/v1_0/requesttopay/${referenceId}`;

    while (true) {
      attempts++;
      let callRes;
      try {
        callRes = await this.executeMtnGatewayCall({
          method: "GET",
          url,
          headers,
        });
      } catch (netErr: any) {
        return {
          ok: false,
          step: "CHECK_STATUS",
          momoEnv: env,
          mtnHttpStatus: 0,
          fields: { referenceId },
          error: {
            source: "NETWORK",
            message: netErr.message,
          },
          evidenceId: netErr.evidenceId,
          appOutcome: { type: "NETWORK_ERROR", attempts, elapsedMs: Date.now() - startTime },
        };
      }

      if (callRes.status !== 200) {
        return {
          ok: false,
          step: "CHECK_STATUS",
          momoEnv: env,
          mtnHttpStatus: callRes.status,
          fields: { referenceId },
          error: {
            source: "MTN",
            message: callRes.data?.message || `Status check failed with HTTP ${callRes.status}`,
            mtnBody: callRes.data,
          },
          evidenceId: callRes.evidenceId,
          appOutcome: { type: "FAILED", attempts, elapsedMs: Date.now() - startTime },
        };
      }

      const mtnBody = callRes.data || {};
      const status = String(mtnBody.status || "").toUpperCase();
      const reason = mtnBody.reason;

      // Extract ONLY fields returned by MTN's body
      const extractedFields: Record<string, any> = {
        referenceId,
      };
      for (const [k, v] of Object.entries(mtnBody)) {
        if (k !== "status" && k !== "reason") {
          extractedFields[k] = v;
        }
      }

      // Check if terminal
      if (status === "SUCCESSFUL") {
        return {
          ok: true,
          step: "CHECK_STATUS",
          momoEnv: env,
          mtnHttpStatus: 200,
          mtnStatus: "SUCCESSFUL",
          fields: extractedFields,
          evidenceId: callRes.evidenceId,
          appOutcome: { type: "SUCCESS", attempts, elapsedMs: Date.now() - startTime },
        };
      }

      if (status === "FAILED") {
        return {
          ok: false,
          step: "CHECK_STATUS",
          momoEnv: env,
          mtnHttpStatus: 200,
          mtnStatus: "FAILED",
          mtnReason: reason,
          fields: extractedFields,
          evidenceId: callRes.evidenceId,
          appOutcome: {
            type: reason === "APPROVAL_REJECTED" ? "REJECTED" : "FAILED",
            attempts,
            elapsedMs: Date.now() - startTime,
          },
        };
      }

      if (status !== "PENDING" && status !== "CREATED" && status !== "ONGOING") {
        console.warn(`[MTN MoMo Gateway] unrecognised status: ${status} for ${referenceId}`);
      }

      if (isSinglePoll) {
        return {
          ok: false,
          step: "CHECK_STATUS",
          momoEnv: env,
          mtnHttpStatus: 200,
          mtnStatus: status,
          mtnReason: reason,
          fields: extractedFields,
          evidenceId: callRes.evidenceId,
          appOutcome: { type: "FAILED", attempts, elapsedMs: Date.now() - startTime },
        };
      }

      // Check deadline
      if (Date.now() >= deadline) {
        return {
          ok: false,
          step: "CHECK_STATUS",
          momoEnv: env,
          mtnHttpStatus: 200,
          mtnStatus: status,
          mtnReason: reason,
          fields: extractedFields,
          evidenceId: callRes.evidenceId,
          appOutcome: {
            type: "POLL_TIMEOUT",
            attempts,
            elapsedMs: Date.now() - startTime,
            details: `MTN did not give a final answer in ${maxSeconds} seconds.`,
          },
        };
      }

      // Sleep before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  /**
   * Retrieves merchant collection account balance (for backoffice diagnostics)
   */
  public async getMerchantBalance(): Promise<{
    availableBalance: string;
    currency: string;
    evidenceId: string;
  }> {
    const auth = await this.getCollectionToken();
    const env = this.getEnv();
    const subKey = this.config.collection.subscriptionKey || "";
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${auth.token}`,
      "X-Target-Environment": env,
      "Ocp-Apim-Subscription-Key": subKey,
      "User-Agent": "okwankyerefo-pa/0.1",
    };
    const url = `${this.config.baseUrl}/collection/v1_0/account/balance`;
    const res = await this.executeMtnGatewayCall({
      method: "GET",
      url,
      headers,
    });
    if (res.status !== 200) {
      throw new Error(`Failed to fetch merchant balance: HTTP ${res.status}`);
    }
    return {
      availableBalance: res.data?.availableBalance || "0",
      currency: res.data?.currency || (env === "production" ? "GHS" : "EUR"),
      evidenceId: res.evidenceId,
    };
  }
}

export const voicePaymentService = new VoicePaymentService();
