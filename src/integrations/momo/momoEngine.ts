/**
 * Ɔkwankyerɛfo Pa - MTN Mobile Money (MoMo) Open API Engine
 * 
 * Production-ready MTN MoMo API Client & Resilience Gateway.
 * Supports:
 *  1. Collections: RequestToPay (USSD push prompt sent to subscriber phone)
 *  2. Disbursements: Transfer (Direct B2C / P2P payout to mobile wallet)
 *  3. KYC & Verification: Account Holder Active Check & User Info
 *  4. Account: Real-time Balance inquiry
 *  5. Webhooks: Async callback handler for payment notifications
 *  6. Sandbox Auto-Provisioner: Automated API User & Key generation
 *  7. Environment-only configuration with explicit errors when credentials are missing
 *  8. Multi-key Switching: Primary, Secondary, and Custom developer keys
 */

import {
  MoMoConfig,
  MoMoTransactionRecord,
  RequestToPayParams,
  TransferParams,
  MoMoBalanceResult,
  MoMoAccountHolderResult,
  MoMoKeyConfig,
  RealAccountTestParams,
  RealAccountTestResult,
  MoMoDiagnostics,
  GatewayEvidence,
} from "./types";
import {
  loadConfigFromEnv,
  cleanAscii,
  formatMsisdn,
  generateReferenceId,
  MOMO_PRODUCTION_BASE_URL,
  MOMO_SANDBOX_BASE_URL,
} from "./config";

export class MoMoEngine {
  private config: MoMoConfig;
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();
  private transactionHistory: Map<string, MoMoTransactionRecord> = new Map();
  private listeners: Set<(tx: MoMoTransactionRecord) => void> = new Set();

  public readonly knownKeys = {
    primary:
      process.env.MOMO_PRIMARY_KEY ||
      process.env.MTN_API_PRIMARY_KEY ||
      process.env.mtn_api_primary_key ||
      process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY ||
      process.env.MOMO_SUBSCRIPTION_KEY ||
      "",
    secondary:
      process.env.MOMO_SECONDARY_KEY ||
      process.env.MTN_API_SECONDARY_KEY ||
      process.env.mtn_api_secondary_key ||
      process.env.MOMO_SUBSCRIPTION_KEY_SECONDARY ||
      process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY ||
      "",
    activeKeyType: "primary" as "primary" | "secondary" | "custom",
  };

  constructor(customConfig?: Partial<MoMoConfig>) {
    this.config = customConfig ? { ...loadConfigFromEnv(), ...customConfig } : loadConfigFromEnv();
    const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
    if (!isTestRuntime && this.config.targetEnv === "sandbox") {
      if (!this.config.collection.apiKey && (process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY || process.env.MOMO_SUBSCRIPTION_KEY)) {
        this.ensureSandboxProvisioned("collection").catch((err) => {
          console.warn("[MoMoEngine] Collection auto-provision notice:", err.message);
        });
      }
    }
  }

  /**
   * Returns current active subscription keys and active selection
   */
  public getKeys(): MoMoKeyConfig {
    return {
      primary: this.knownKeys.primary,
      secondary: this.knownKeys.secondary,
      activeKeyType: this.knownKeys.activeKeyType,
      activeKey: this.config.collection.subscriptionKey || this.knownKeys.primary,
      targetEnv: this.config.targetEnv,
      currency: this.config.currency,
    };
  }

  /**
   * Switches active key between primary, secondary, or custom for a specific product
   */
  public switchKey(
    keyType: "primary" | "secondary" | "custom",
    customKey?: string,
    product: "collection" | "disbursement" = "collection"
  ): MoMoKeyConfig {
    let newKey = this.knownKeys.primary;
    if (keyType === "secondary") {
      newKey = this.knownKeys.secondary;
    } else if (keyType === "custom" && customKey) {
      newKey = customKey.trim();
    }
    this.knownKeys.activeKeyType = keyType;
    if (product === "disbursement") {
      this.config.disbursement.subscriptionKey = newKey;
    } else {
      this.config.collection.subscriptionKey = newKey;
    }
    this.tokenCache.clear();
    console.log(`[MTN MoMo Engine] Switched active ${product} key to: ${keyType} (${newKey.slice(0, 6)}••••${newKey.slice(-4)})`);
    return this.getKeys();
  }

  /**
   * Switches target environment between sandbox and production
   */
  public setTargetEnv(env: "sandbox" | "production"): MoMoKeyConfig {
    this.config.targetEnv = env;
    this.config.baseUrl = env === "production" ? MOMO_PRODUCTION_BASE_URL : MOMO_SANDBOX_BASE_URL;
    this.config.currency = env === "production" ? "GHS" : "EUR";
    this.tokenCache.clear();
    console.log(`[MTN MoMo Engine] Target environment switched to: ${env} (${this.config.baseUrl}, Currency: ${this.config.currency})`);
    return this.getKeys();
  }

  /**
   * Automated test runner for testing real registered MoMo accounts/phone numbers
   */
  public async testRealAccount(params: RealAccountTestParams): Promise<RealAccountTestResult> {
    const { phone, subscriberName } = params;
    const amount = params.amount && params.amount > 0 ? params.amount : 5.0;
    const targetEnv: "sandbox" | "production" = params.targetEnv || (this.config.targetEnv === "production" ? "production" : "sandbox");
    const keyChoice = params.keyChoice || this.knownKeys.activeKeyType;

    if (keyChoice !== this.knownKeys.activeKeyType || (params.customKey && keyChoice === "custom")) {
      this.switchKey(keyChoice, params.customKey);
    }
    if (targetEnv !== this.config.targetEnv) {
      this.setTargetEnv(targetEnv);
    }

    const msisdn = this.formatMsisdn(phone);
    const auditSteps: RealAccountTestResult["auditSteps"] = [];

    // Step 1: Format MSISDN
    auditSteps.push({
      step: "MSISDN Normalization",
      status: "SUCCESS",
      details: { input: phone, formattedMsisdn: msisdn, country: "Ghana (+233)" },
    });

    // Step 2: KYC & Account Active Verification
    const kycResult = await this.validateAccountHolder(phone);
    auditSteps.push({
      step: "Account Active & KYC Lookup",
      status: kycResult.isActive ? "SUCCESS" : "WARNING",
      details: {
        msisdn: kycResult.msisdn,
        isActive: kycResult.isActive,
        name: kycResult.name || subscriberName || "Unknown (KYC not verified)",
        mode: kycResult.mode,
      },
    });

    // Step 3: Initiate RequestToPay
    const tx = await this.requestToPay({
      amount,
      payerPhone: phone,
      payerName: subscriberName || kycResult.name || "Unknown (KYC not verified)",
      payerMessage: `Test payment of GH₵ ${amount.toFixed(2)} on registered MoMo account`,
      payeeNote: "Okwankyerɛfo Pa Test",
    });

    auditSteps.push({
      step: "RequestToPay (Collection Push)",
      status: "SUCCESS",
      details: {
        referenceId: tx.referenceId,
        externalId: tx.externalId,
        status: tx.status,
        mode: tx.mode,
        amount: tx.amount,
        currency: tx.currency,
        financialTransactionId: tx.financialTransactionId || "Awaiting authorization",
      },
    });

    return {
      success: true,
      phone,
      msisdn,
      amount,
      currency: this.config.currency,
      activeKey: this.config.collection.subscriptionKey,
      activeKeyType: this.knownKeys.activeKeyType,
      targetEnv: this.config.targetEnv,
      kyc: kycResult,
      transaction: tx,
      auditSteps,
    };
  }

  /**
   * Registers a callback for real-time transaction updates (for SSE / Webhooks)
   */
  public addListener(fn: (tx: MoMoTransactionRecord) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Broadcasts transaction status update to all connected listeners
   */
  public notifyListeners(tx: MoMoTransactionRecord): void {
    for (const listener of this.listeners) {
      try {
        listener(tx);
      } catch (err) {
        console.error("[MoMo Engine Listener Error]:", err);
      }
    }
  }

  /**
   * Automated polling worker that syncs transaction status with MTN MoMo API
   * until the subscriber enters their PIN or a final status is reached.
   */
  public startAutoSync(referenceId: string, maxAttempts: number = 25, intervalMs: number = 3000): void {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const current = this.transactionHistory.get(referenceId);
      if (!current) {
        clearInterval(interval);
        return;
      }

      if (current.status !== "PENDING" || attempts >= maxAttempts) {
        if (attempts >= maxAttempts && current.status === "PENDING") {
          current.status = "TIMEOUT";
          current.updatedAt = new Date().toISOString();
          this.transactionHistory.set(referenceId, current);
          this.notifyListeners(current);
        }
        clearInterval(interval);
        return;
      }

      try {
        const updated = await this.getTransactionStatus(referenceId);
        if (updated) {
          this.notifyListeners(updated);
          if (updated.status !== "PENDING") {
            clearInterval(interval);
            console.log(`[MTN MoMo AutoSync] Transaction ${referenceId} finalized with status: ${updated.status} (Financial ID: ${updated.financialTransactionId || 'N/A'})`);
          }
        }
      } catch (err: any) {
        console.warn(`[MTN MoMo AutoSync] Polling notice for ${referenceId}: ${err.message}`);
      }
    }, intervalMs);
  }

  /**
   * Formats Ghanaian phone numbers to MTN MSISDN format
   */
  public formatMsisdn(phone: string): string {
    return formatMsisdn(phone);
  }

  /**
   * Generates a standard UUID v4 for MTN Reference ID
   */
  public generateReferenceId(): string {
    return generateReferenceId();
  }

  /**
   * Checks if live or sandbox credentials for a product are configured
   */
  public isConfigured(product: "collection" | "disbursement" = "collection"): boolean {
    const p = product === "collection" ? this.config.collection : this.config.disbursement;
    return Boolean(p.subscriptionKey && p.apiUserId && p.apiKey);
  }

  /**
   * Automatically provisions Sandbox API User ID and API Key if a Subscription Key is available.
   * Enables seamless testing with only the primary or secondary subscription key.
   */
  public async ensureSandboxProvisioned(product: "collection" | "disbursement" = "collection"): Promise<boolean> {
    if (this.config.targetEnv !== "sandbox") return false;
    const p = product === "collection" ? this.config.collection : this.config.disbursement;
    if (p.apiUserId && p.apiKey && p.subscriptionKey) return true;

    const subKey =
      p.subscriptionKey ||
      (product === "disbursement"
        ? (process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY || process.env.MOMO_PRIMARY_KEY || process.env.MOMO_SECONDARY_KEY || this.knownKeys.secondary)
        : (process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY || process.env.MOMO_SUBSCRIPTION_KEY || this.knownKeys.primary));

    if (!subKey) return false;

    try {
      console.log(`[MTN MoMo Engine] Auto-provisioning sandbox credentials for ${product} using key (${subKey.slice(0, 6)}...)...`);
      await this.autoProvisionSandbox(subKey, undefined, product);
      return true;
    } catch (err: any) {
      console.warn(`[MTN MoMo Engine] Sandbox auto-provision notice for ${product}:`, err.message);
      return false;
    }
  }

  /**
   * Fetches or reuses cached OAuth 2.0 Bearer Token from MTN MoMo API
   */
  private async getAccessToken(product: "collection" | "disbursement"): Promise<string> {
    const p = product === "collection" ? this.config.collection : this.config.disbursement;
    if (!p.subscriptionKey || !p.apiUserId || !p.apiKey) {
      throw new Error(`Missing MTN MoMo credentials for ${product}.`);
    }

    const cacheKey = `${product}_${p.apiUserId}`;
    const cached = this.tokenCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now + 30000) {
      return cached.token;
    }

    const authHeader = Buffer.from(`${p.apiUserId}:${p.apiKey}`).toString("base64");
    const tokenUrl = `${this.config.baseUrl}/${product}/token/`;

    let response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Ocp-Apim-Subscription-Key": p.subscriptionKey,
        "Content-Type": "application/json",
        "User-Agent": "okwankyerefo-pa/0.1",
        "Accept": "application/json",
      },
      body: "",
    });

    // In Sandbox, if API Key was rotated or expired ("invalid_client" 401),
    // self-heal by requesting the active API key directly from MTN sandbox
    if (response.status === 401 && this.config.targetEnv === "sandbox" && p.subscriptionKey && p.apiUserId) {
      try {
        console.log(`[MTN MoMo Engine] Token 401 on ${product}. Synchronizing active API Key from MTN Sandbox...`);
        const refreshRes = await fetch(`${this.config.baseUrl}/v1_0/apiuser/${p.apiUserId}/apikey`, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": p.subscriptionKey,
            "Content-Length": "0",
          },
          body: "",
        });
        if (refreshRes.ok) {
          const keyData = await refreshRes.json();
          if (keyData.apiKey) {
            p.apiKey = keyData.apiKey;
            console.log(`[MTN MoMo Engine] Synchronized active ${product} API Key with MTN.`);
            const refreshedAuthHeader = Buffer.from(`${p.apiUserId}:${p.apiKey}`).toString("base64");
            response = await fetch(tokenUrl, {
              method: "POST",
              headers: {
                "Authorization": `Basic ${refreshedAuthHeader}`,
                "Ocp-Apim-Subscription-Key": p.subscriptionKey,
                "Content-Type": "application/json",
                "User-Agent": "curl/7.88.1",
                "Accept": "application/json",
              },
              body: "",
            });
          }
        }
      } catch (syncErr: any) {
        console.warn(`[MTN MoMo Engine] Key sync notice:`, syncErr.message);
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to obtain MoMo token (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const token = data.access_token;
    const expiresIn = data.expires_in || 3600;

    this.tokenCache.set(cacheKey, {
      token,
      expiresAt: now + expiresIn * 1000,
    });

    return token;
  }

  /**
   * Sanitizes request/response headers by redacting sensitive secrets (showing only last 4 chars)
   */
  public redactHeaders(headers: Record<string, string>): Record<string, string> {
    const redacted: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      const lower = k.toLowerCase();
      if (lower === "authorization") {
        if (v.startsWith("Bearer ")) {
          redacted[k] = `Bearer ••••${v.slice(-4)}`;
        } else if (v.startsWith("Basic ")) {
          redacted[k] = `Basic ••••${v.slice(-4)}`;
        } else {
          redacted[k] = `••••${v.slice(-4)}`;
        }
      } else if (lower.includes("key") || lower.includes("secret") || lower.includes("password")) {
        redacted[k] = v.length > 4 ? `••••${v.slice(-4)}` : "••••";
      } else {
        redacted[k] = v;
      }
    }
    return redacted;
  }

  /**
   * Executes a real HTTP call against MTN MoMo Gateway and records full provenance GatewayEvidence
   */
  public async executeMtnCall(options: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
    expectedStatus?: number[];
  }): Promise<{ status: number; data: any; evidence: GatewayEvidence; responseHeaders: Record<string, string> }> {
    const { method, url, headers, body, expectedStatus = [200, 201, 202] } = options;
    const startTime = Date.now();
    const parsedUrl = new URL(url);
    const host = parsedUrl.host;
    const endpoint = parsedUrl.pathname;

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      });
    } catch (netErr: any) {
      const roundTripMs = Date.now() - startTime;
      const evidence: GatewayEvidence = {
        timestamp: new Date().toISOString(),
        host,
        roundTripMs,
        endpoint,
        request: {
          method,
          url,
          headers: this.redactHeaders(headers),
          body: typeof body === "string" ? (() => { try { return JSON.parse(body); } catch { return body; } })() : body,
        },
        response: {
          status: 0,
          statusText: netErr.message || "Network Error / Timeout",
          headers: {},
          body: { error: netErr.message, code: netErr.code || "NETWORK_ERROR" },
        },
      };
      const err = new Error(`MTN gateway network failure (${netErr.message}) on ${method} ${endpoint}`);
      (err as any).gatewayEvidence = evidence;
      (err as any).status = 0;
      (err as any).endpoint = endpoint;
      throw err;
    }

    const roundTripMs = Date.now() - startTime;
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    const rawText = await res.text();
    const actualByteLength = Buffer.byteLength(rawText, "utf8");
    const contentLengthHeader = resHeaders["content-length"] ? parseInt(resHeaders["content-length"], 10) : undefined;
    if (contentLengthHeader !== undefined && contentLengthHeader !== actualByteLength) {
      console.warn(`[MTN Gateway Evidence] Warning: Content-Length mismatch on ${method} ${endpoint}: header=${contentLengthHeader}, bodyByteLength=${actualByteLength}`);
    }

    let parsedBody: any;
    try {
      parsedBody = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsedBody = rawText;
    }

    const evidence: GatewayEvidence = {
      timestamp: new Date().toISOString(),
      host,
      roundTripMs,
      endpoint,
      request: {
        method,
        url,
        headers: this.redactHeaders(headers),
        body: typeof body === "string" ? (() => { try { return JSON.parse(body); } catch { return body; } })() : body,
      },
      response: {
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: parsedBody,
      },
    };

    if (!expectedStatus.includes(res.status)) {
      const err = new Error(`MTN MoMo API rejected request (${res.status} on ${endpoint}): ${typeof parsedBody === "string" ? parsedBody : JSON.stringify(parsedBody)}`);
      (err as any).gatewayEvidence = evidence;
      (err as any).status = res.status;
      (err as any).endpoint = endpoint;
      (err as any).body = parsedBody;
      throw err;
    }

    return {
      status: res.status,
      data: parsedBody,
      evidence,
      responseHeaders: resHeaders,
    };
  }

  /**
   * 1. REQUEST TO PAY (COLLECTION)
   * Sends a USSD push authorization prompt to the payer's mobile phone handset.
   * Subscriber sees the network prompt on their phone and enters their Mobile Money PIN.
   * This aligns 100% with the Ɔkwankyerɛfo Pa Zero-PIN Voice Security Boundary.
   */
  public async requestToPay(params: RequestToPayParams): Promise<MoMoTransactionRecord> {
    const { amount, payerPhone, payerName, payerMessage, payeeNote, externalId, currency } = params;
    if (!this.isConfigured("collection")) {
      const autoProvisioned = await this.ensureSandboxProvisioned("collection");
      if (!autoProvisioned) {
        throw new Error("MTN MoMo Collections is not configured.");
      }
    }
    const referenceId = this.generateReferenceId();
    const extId = externalId || `OKP-${Date.now().toString().slice(-6)}`;
    const msisdn = this.formatMsisdn(payerPhone);
    const timestamp = new Date().toISOString();

    const selectedCurrency = currency || (this.config.targetEnv === "production" ? "GHS" : "EUR");

    const initialRecord: MoMoTransactionRecord = {
      id: extId,
      referenceId,
      externalId: extId,
      type: "COLLECTION_REQUEST_TO_PAY",
      status: "PENDING",
      amount,
      currency: selectedCurrency,
      msisdn,
      recipientName: payerName || "Unknown (KYC not verified)",
      payerMessage: payerMessage || "Payment via Okwankyerɛfo Pa",
      mode: this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const token = await this.getAccessToken("collection");
    const url = `${this.config.baseUrl}/collection/v1_0/requesttopay`;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "X-Reference-Id": referenceId,
      "X-Target-Environment": this.config.targetEnv,
      "Ocp-Apim-Subscription-Key": this.config.collection.subscriptionKey!,
      "Content-Type": "application/json",
      "User-Agent": "okwankyerefo-pa/0.1",
    };

    if (this.config.targetEnv === "production" && this.config.callbackHost) {
      headers["X-Callback-Url"] = `${this.config.callbackHost}/api/momo/callback`;
    }

    const body = {
      amount: amount.toFixed(1),
      currency: selectedCurrency,
      externalId: extId,
      payer: {
        partyIdType: "MSISDN",
        partyId: msisdn,
      },
      payerMessage: cleanAscii(payerMessage || `Payment of GHS ${amount} via Okwankyerɛfo Pa`),
      payeeNote: cleanAscii(payeeNote || "Voice MoMo"),
    };
    initialRecord.currency = body.currency;

    const callRes = await this.executeMtnCall({
      method: "POST",
      url,
      headers,
      body,
      expectedStatus: [202],
    });

    initialRecord.mode = this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API";
    initialRecord.status = "PENDING";
    initialRecord.gatewayEvidence = callRes.evidence;
    initialRecord.rawPayload = callRes.data;

    this.transactionHistory.set(referenceId, initialRecord);
    this.transactionHistory.set(extId, initialRecord);
    this.notifyListeners(initialRecord);
    this.startAutoSync(referenceId);
    console.log(`[MTN MoMo Engine] RequestToPay dispatched (${initialRecord.mode}): Ref ${referenceId}, MSISDN ${msisdn}, Amount ${amount}`);
    return initialRecord;
  }

  /**
   * 2. DISBURSEMENT (TRANSFER)
   * Sends funds from the platform/merchant wallet directly into a recipient's MTN MoMo wallet.
   */
  public async transfer(params: TransferParams): Promise<MoMoTransactionRecord> {
    const { amount, payeePhone, payeeName, payerMessage, payeeNote, externalId, currency } = params;
    if (!this.isConfigured("disbursement")) {
      const autoProvisioned = await this.ensureSandboxProvisioned("disbursement");
      if (!autoProvisioned) {
        throw new Error("MTN MoMo Disbursement is not configured.");
      }
    }
    const referenceId = this.generateReferenceId();
    const extId = externalId || `OKP-${Date.now().toString().slice(-6)}`;
    const msisdn = this.formatMsisdn(payeePhone);
    const timestamp = new Date().toISOString();

    const selectedCurrency = currency || (this.config.targetEnv === "production" ? "GHS" : "EUR");

    const initialRecord: MoMoTransactionRecord = {
      id: extId,
      referenceId,
      externalId: extId,
      type: "DISBURSEMENT_TRANSFER",
      status: "PENDING",
      amount,
      currency: selectedCurrency,
      msisdn,
      recipientName: payeeName || "Unknown (KYC not verified)",
      payerMessage: payerMessage || "Transfer via Okwankyerɛfo Pa",
      mode: this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const token = await this.getAccessToken("disbursement");
    const url = `${this.config.baseUrl}/disbursement/v1_0/transfer`;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${token}`,
      "X-Reference-Id": referenceId,
      "X-Target-Environment": this.config.targetEnv,
      "Ocp-Apim-Subscription-Key": this.config.disbursement.subscriptionKey!,
      "Content-Type": "application/json",
      "User-Agent": "okwankyerefo-pa/0.1",
    };

    const body = {
      amount: amount.toFixed(2),
      currency: selectedCurrency,
      externalId: extId,
      payee: {
        partyIdType: "MSISDN",
        partyId: msisdn,
      },
      payerMessage: cleanAscii(payerMessage || `Payout of GHS ${amount} via Okwankyerɛfo Pa`),
      payeeNote: cleanAscii(payeeNote || "Voice Transfer"),
    };

    const callRes = await this.executeMtnCall({
      method: "POST",
      url,
      headers,
      body,
      expectedStatus: [202],
    });

    initialRecord.mode = this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API";
    initialRecord.status = "PENDING";
    initialRecord.gatewayEvidence = callRes.evidence;
    initialRecord.rawPayload = callRes.data;

    this.transactionHistory.set(referenceId, initialRecord);
    this.transactionHistory.set(extId, initialRecord);
    this.notifyListeners(initialRecord);
    this.startAutoSync(referenceId);
    console.log(`[MTN MoMo Engine] Transfer dispatched (${initialRecord.mode}): Ref ${referenceId}, MSISDN ${msisdn}, Amount ${amount}`);
    return initialRecord;
  }

  /**
   * 3. CHECK TRANSACTION STATUS (RequestToPay or Transfer)
   * Queries status directly from MTN and records full GatewayEvidence
   */
  public async getTransactionStatus(referenceId: string): Promise<MoMoTransactionRecord | null> {
    const local = this.transactionHistory.get(referenceId);

    const isCollection = local?.type === "COLLECTION_REQUEST_TO_PAY";
    const product = isCollection ? "collection" : "disbursement";
    const pathSegment = isCollection ? "requesttopay" : "transfer";

    try {
      const token = await this.getAccessToken(product);
      const url = `${this.config.baseUrl}/${product}/v1_0/${pathSegment}/${referenceId}`;
      const subKey = (isCollection ? this.config.collection.subscriptionKey : this.config.disbursement.subscriptionKey) || "";

      const callRes = await this.executeMtnCall({
        method: "GET",
        url,
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Target-Environment": this.config.targetEnv,
          "Ocp-Apim-Subscription-Key": subKey,
        },
        expectedStatus: [200],
      });

      const data = callRes.data;
      const record: MoMoTransactionRecord = local || {
        id: referenceId,
        referenceId,
        externalId: data.externalId || referenceId,
        type: isCollection ? "COLLECTION_REQUEST_TO_PAY" : "DISBURSEMENT_TRANSFER",
        status: (data.status || "PENDING").toUpperCase(),
        amount: parseFloat(data.amount) || 0,
        currency: data.currency || (this.config.targetEnv === "production" ? "GHS" : "EUR"),
        msisdn: data.payer?.partyId || data.payee?.partyId || "",
        mode: this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // STATUS AND FINANCIAL TRANSACTION ID COME ONLY FROM MTN
      record.status = (data.status || record.status).toUpperCase();
      record.financialTransactionId = data.financialTransactionId || undefined;
      record.updatedAt = new Date().toISOString();
      record.rawPayload = data;
      record.gatewayEvidence = callRes.evidence;

      this.transactionHistory.set(referenceId, record);
      return record;
    } catch (err: any) {
      console.error(`[MTN MoMo Engine] Error querying status for ${referenceId}:`, err);
      if (local) {
        if (err.gatewayEvidence) {
          local.gatewayEvidence = err.gatewayEvidence;
        }
        return local;
      }
      throw err;
    }
  }

  /**
   * Retrieves an in-memory transaction record by reference ID or external ID
   */
  public getTransactionRecord(referenceId: string): MoMoTransactionRecord | undefined {
    return this.transactionHistory.get(referenceId);
  }

  /**
   * Saves or updates an in-memory transaction record
   */
  public recordTransaction(record: MoMoTransactionRecord): void {
    if (record.referenceId) this.transactionHistory.set(record.referenceId, record);
    if (record.externalId) this.transactionHistory.set(record.externalId, record);
    if (record.id) this.transactionHistory.set(record.id, record);
    this.notifyListeners(record);
  }

  /**
   * 4. CHECK ACCOUNT BALANCE
   * Queries real MTN balance from live gateway.
   */
  public async getAccountBalance(product: "collection" | "disbursement" = "collection"): Promise<MoMoBalanceResult> {
    if (!this.isConfigured(product)) {
      await this.ensureSandboxProvisioned(product);
    }
    if (!this.isConfigured(product)) {
      throw new Error(`MTN MoMo ${product} credentials not configured.`);
    }

    const token = await this.getAccessToken(product);
    const url = `${this.config.baseUrl}/${product}/v1_0/account/balance`;
    const headers = {
      "Authorization": `Bearer ${token}`,
      "X-Target-Environment": this.config.targetEnv,
      "Ocp-Apim-Subscription-Key": (product === "collection" ? this.config.collection.subscriptionKey : this.config.disbursement.subscriptionKey) || "",
    };

    const callRes = await this.executeMtnCall({
      method: "GET",
      url,
      headers,
      expectedStatus: [200],
    });

    const data = callRes.data;
    const balanceNum = parseFloat(data.availableBalance) || 0;
    const curr = data.currency || (this.config.targetEnv === "production" ? "GHS" : "EUR");

    return {
      availableBalance: balanceNum,
      currency: curr,
      formatted: `${balanceNum.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${curr}`,
      mode: this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API",
      gatewayEvidence: callRes.evidence,
      rawPayload: data,
    };
  }

  /**
   * 5. VALIDATE ACCOUNT HOLDER & KYC STATUS
   * Zero fabrication: Recipient name comes ONLY from MTN's basicuserinfo call.
   * If that call fails or is not returned, name is "Unknown (KYC not verified)".
   */
  public async validateAccountHolder(phone: string): Promise<MoMoAccountHolderResult> {
    const msisdn = this.formatMsisdn(phone);

    // Prefer disbursement if configured, otherwise collection
    const preferredProduct: "collection" | "disbursement" = this.isConfigured("disbursement")
      ? "disbursement"
      : "collection";

    if (!this.isConfigured(preferredProduct)) {
      await this.ensureSandboxProvisioned(preferredProduct);
    }
    if (!this.isConfigured(preferredProduct)) {
      throw new Error(`MTN MoMo ${preferredProduct} is not configured.`);
    }

    const token = await this.getAccessToken(preferredProduct);
    const subKey = (preferredProduct === "collection"
      ? this.config.collection.subscriptionKey
      : this.config.disbursement.subscriptionKey) || "";

    const activeUrl = `${this.config.baseUrl}/${preferredProduct}/v1_0/accountholder/msisdn/${msisdn}/active`;

    const activeCall = await this.executeMtnCall({
      method: "GET",
      url: activeUrl,
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Target-Environment": this.config.targetEnv,
        "Ocp-Apim-Subscription-Key": subKey,
      },
      expectedStatus: [200],
    });

    const isActive = Boolean(activeCall.data?.result);
    let verifiedName: string | undefined;

    try {
      const infoUrl = `${this.config.baseUrl}/${preferredProduct}/v1_0/accountholder/msisdn/${msisdn}/basicuserinfo`;
      const infoCall = await this.executeMtnCall({
        method: "GET",
        url: infoUrl,
        headers: {
          "Authorization": `Bearer ${token}`,
          "X-Target-Environment": this.config.targetEnv,
          "Ocp-Apim-Subscription-Key": subKey,
        },
        expectedStatus: [200],
      });
      if (infoCall.data) {
        const given = (infoCall.data.given_name || "").trim();
        const family = (infoCall.data.family_name || "").trim();
        const full = `${given} ${family}`.trim() || (infoCall.data.name || "").trim();
        if (full) {
          verifiedName = full;
        }
      }
    } catch (infoErr) {
      console.warn(`[MTN MoMo Engine] Basic user info lookup not returned for ${msisdn}:`, infoErr);
    }

    return {
      isActive,
      msisdn,
      name: verifiedName || "Unknown (KYC not verified)",
      mode: this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API",
      gatewayEvidence: activeCall.evidence,
      rawPayload: activeCall.data,
    };
  }

  /**
   * 6. WEBHOOK CALLBACK HANDLER
   */
  public handleWebhook(payload: any, referenceId?: string): MoMoTransactionRecord | null {
    const ref = referenceId || payload?.referenceId || payload?.externalId;
    if (!ref) return null;

    let record = this.transactionHistory.get(ref);
    if (!record && payload.externalId) {
      record = this.transactionHistory.get(payload.externalId);
    }

    if (record) {
      switch (typeof payload.status === "string" ? payload.status.toUpperCase() : "") {
        case "PENDING":
          record.status = "PENDING";
          break;
        case "SUCCESSFUL":
          record.status = "SUCCESSFUL";
          break;
        case "FAILED":
          record.status = "FAILED";
          break;
        case "REJECTED":
          record.status = "REJECTED";
          break;
        case "TIMEOUT":
          record.status = "TIMEOUT";
          break;
        default:
          console.warn(`[MTN MoMo Engine Webhook] Ignoring callback with invalid status for ${record.referenceId}.`);
          return null;
      }
      record.financialTransactionId = payload.financialTransactionId || record.financialTransactionId;
      record.updatedAt = new Date().toISOString();
      record.rawPayload = payload;
      this.transactionHistory.set(record.referenceId, record);
      this.notifyListeners(record);
      console.log(`[MTN MoMo Engine Webhook] Updated transaction ${record.referenceId} -> Status: ${record.status}`);
      return record;
    }

    return null;
  }

  /**
   * 7. SANDBOX AUTO-PROVISIONER
   */
  public async autoProvisionSandbox(
    subscriptionKey: string,
    callbackHost: string = "okwankyer-fo-pa.onrender.com",
    product: "collection" | "disbursement" = "collection"
  ): Promise<{ apiUserId: string; apiKey: string }> {
    const apiUserId = this.generateReferenceId();
    const sandboxBase = MOMO_SANDBOX_BASE_URL;

    // Step 1: Create API User
    const createUserRes = await fetch(`${sandboxBase}/v1_0/apiuser`, {
      method: "POST",
      headers: {
        "X-Reference-Id": apiUserId,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        providerCallbackHost: callbackHost.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      }),
    });

    if (createUserRes.status !== 201) {
      const errText = await createUserRes.text();
      throw new Error(`Failed to create API User on Sandbox (${createUserRes.status}): ${errText}`);
    }

    // Step 2: Generate API Key
    const keyRes = await fetch(`${sandboxBase}/v1_0/apiuser/${apiUserId}/apikey`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": subscriptionKey,
        "Content-Length": "0",
      },
      body: "",
    });

    if (!keyRes.ok) {
      const errText = await keyRes.text();
      throw new Error(`Failed to generate API Key (${keyRes.status}): ${errText}`);
    }

    const keyData = await keyRes.json();
    const apiKey = keyData.apiKey;

    // Apply to current in-memory config for the specific product
    if (product === "disbursement") {
      this.config.disbursement.subscriptionKey = subscriptionKey;
      this.config.disbursement.apiUserId = apiUserId;
      this.config.disbursement.apiKey = apiKey;
    } else {
      this.config.collection.subscriptionKey = subscriptionKey;
      this.config.collection.apiUserId = apiUserId;
      this.config.collection.apiKey = apiKey;
    }

    console.log(`[MTN MoMo Engine Sandbox] Auto-provisioned API User for ${product}: ${apiUserId}`);
    return { apiUserId, apiKey };
  }

  /**
   * 8. SYSTEM STATUS & DIAGNOSTICS REPORT
   */
  public getDiagnostics(): MoMoDiagnostics {
    const hasCollectionKey = Boolean(this.config.collection.subscriptionKey);
    const hasCollectionUser = Boolean(this.config.collection.apiUserId);
    const hasCollectionApiKey = Boolean(this.config.collection.apiKey);

    const hasDisbKey = Boolean(this.config.disbursement.subscriptionKey);
    const hasDisbUser = Boolean(this.config.disbursement.apiUserId);
    const hasDisbApiKey = Boolean(this.config.disbursement.apiKey);

    const hasCollectionConfigured = hasCollectionKey && hasCollectionUser && hasCollectionApiKey;
    const hasDisbConfigured = hasDisbKey && hasDisbUser && hasDisbApiKey;

    const isFullyLive = this.config.targetEnv === "production" && (hasCollectionConfigured || hasDisbConfigured);
    const isSandboxActive = this.config.targetEnv === "sandbox" && (hasCollectionConfigured || hasDisbConfigured);

    return {
      activeMode: isFullyLive ? "LIVE_PRODUCTION" : isSandboxActive ? "SANDBOX_API" : "NOT_CONFIGURED",
      targetEnvironment: this.config.targetEnv,
      baseUrl: this.config.baseUrl,
      currency: this.config.currency,
      credentials: {
        collection: {
          subscriptionKeyConfigured: hasCollectionKey,
          apiUserIdConfigured: hasCollectionUser,
          apiKeyConfigured: hasCollectionApiKey,
          maskedKey: hasCollectionKey ? `${this.config.collection.subscriptionKey!.slice(0, 4)}••••${this.config.collection.subscriptionKey!.slice(-4)}` : "Not set",
        },
        disbursement: {
          subscriptionKeyConfigured: hasDisbKey,
          apiUserIdConfigured: hasDisbUser,
          apiKeyConfigured: hasDisbApiKey,
          maskedKey: hasDisbKey ? `${this.config.disbursement.subscriptionKey!.slice(0, 4)}••••${this.config.disbursement.subscriptionKey!.slice(-4)}` : "Not set",
        },
      },
      stats: {
        totalTransactions: this.transactionHistory.size,
        history: this.getHistory().slice(0, 10),
      },
      productionChecklist: [
        {
          step: 1,
          name: "MTN MoMo Developer Account",
          status: (hasCollectionKey || hasDisbKey) ? "CONFIGURED" : "PENDING",
          requirement: "Sign up at momodeveloper.mtn.com and subscribe to Collections and Disbursements products.",
          envVar: "MOMO_PRIMARY_KEY, MOMO_SECONDARY_KEY, or MOMO_DISBURSEMENT_SUBSCRIPTION_KEY",
        },
        {
          step: 2,
          name: "API User ID & API Key",
          status: (hasCollectionConfigured || hasDisbConfigured) ? "CONFIGURED" : "PENDING",
          requirement: "Generate API User UUID and API Key via Sandbox Auto-Provisioner or MTN Portal.",
          envVar: "MOMO_DISBURSEMENT_API_USER_ID, MOMO_DISBURSEMENT_API_KEY",
        },
        {
          step: 3,
          name: "MTN Merchant/Partner KYC Approval (Go-Live)",
          status: this.config.targetEnv === "production" ? "CONFIGURED" : "SANDBOX_OR_NOT_CONFIGURED",
          requirement: "Apply for MTN MoMo Production Go-Live approval with registered Ghanaian business certificate.",
          envVar: "MOMO_TARGET_ENV=production, MOMO_BASE_URL=https://proxy.momoapi.mtn.com",
        },
        {
          step: 4,
          name: "Webhook Callback Domain",
          status: this.config.callbackHost ? "CONFIGURED" : "AUTO_DETECTED",
          requirement: "Public HTTPS URL for instant USSD PIN entry payment callbacks.",
          envVar: "MOMO_CALLBACK_HOST=https://okwankyer-fo-pa.onrender.com",
        },
      ],
    };
  }

  /**
   * Returns deduplicated transaction history
   */
  public getHistory(): MoMoTransactionRecord[] {
    const seen = new Set<string>();
    const list: MoMoTransactionRecord[] = [];
    for (const tx of this.transactionHistory.values()) {
      if (!seen.has(tx.referenceId)) {
        seen.add(tx.referenceId);
        list.push(tx);
      }
    }
    return list.reverse();
  }

}

export const momoEngine = new MoMoEngine();
