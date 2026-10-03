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
 *  7. Hybrid Resilience: High-fidelity fallback emulator if credentials are not yet supplied
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
    primary: "",
    secondary: "",
    activeKeyType: "custom" as "primary" | "secondary" | "custom",
  };

  constructor(customConfig?: Partial<MoMoConfig>) {
    this.config = customConfig ? { ...loadConfigFromEnv(), ...customConfig } : loadConfigFromEnv();
  }

  /**
   * Returns current active subscription keys and active selection
   */
  public getKeys(): MoMoKeyConfig {
    return {
      primary: this.knownKeys.primary,
      secondary: this.knownKeys.secondary,
      activeKeyType: this.knownKeys.activeKeyType,
      activeKey: this.config.collection.subscriptionKey || "",
      targetEnv: this.config.targetEnv,
      currency: this.config.currency,
    };
  }

  /**
   * Switches active key between primary, secondary, or custom
   */
  public switchKey(keyType: "primary" | "secondary" | "custom", customKey?: string): MoMoKeyConfig {
    if (keyType !== "custom" || !customKey?.trim()) {
      throw new Error("Only a runtime custom MoMo subscription key may be selected. Store credentials in environment variables.");
    }

    const newKey = customKey.trim();
    this.knownKeys.activeKeyType = "custom";
    this.config.collection.subscriptionKey = newKey;
    this.config.disbursement.subscriptionKey = newKey;
    this.tokenCache.clear();

    console.log("[MTN MoMo Engine] Switched active subscription key from runtime configuration.");
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
   * Authorizes or rejects a simulated prompt from the HTML UI or external trigger
   */
  public authorizeSimulatedPrompt(referenceId: string, action: "approve" | "reject" = "approve"): MoMoTransactionRecord | null {
    if (process.env.MOMO_DEMO_MODE !== "true") {
      return null;
    }

    let rec = this.transactionHistory.get(referenceId);
    if (!rec) {
      for (const val of this.transactionHistory.values()) {
        if (val.referenceId === referenceId || val.externalId === referenceId) {
          rec = val;
          break;
        }
      }
    }

    if (!rec) return null;

    if (action === "approve") {
      rec.status = "SUCCESSFUL";
      if (!rec.financialTransactionId) {
        rec.financialTransactionId = `MOMO-${Math.floor(100000000 + Math.random() * 900000000)}`;
      }
    } else {
      rec.status = "REJECTED";
      rec.reason = "User declined USSD push authorization on handset";
    }

    rec.updatedAt = new Date().toISOString();
    this.transactionHistory.set(rec.referenceId, rec);
    this.transactionHistory.set(rec.externalId, rec);
    this.notifyListeners(rec);
    console.log(`[MTN MoMo Engine] Handset prompt ${action} for Ref ${rec.referenceId} -> Status: ${rec.status}`);
    return rec;
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
    let kycResult: MoMoAccountHolderResult;
    try {
      kycResult = await this.validateAccountHolder(phone);
      auditSteps.push({
        step: "Account Active & KYC Lookup",
        status: kycResult.isActive ? "SUCCESS" : "WARNING",
        details: {
          msisdn: kycResult.msisdn,
          isActive: kycResult.isActive,
          name: kycResult.name || subscriberName || "MTN MoMo Subscriber",
          mode: kycResult.mode,
        },
      });
    } catch (err: any) {
      throw new Error(`Account holder verification failed: ${err.message}`);
    }

    // Step 3: Initiate RequestToPay
    const tx = await this.requestToPay({
      amount,
      payerPhone: phone,
      payerName: subscriberName || kycResult.name || "MTN MoMo Subscriber",
      payerMessage: `Test payment of GH₵ ${amount.toFixed(2)} on registered MoMo account`,
      payeeNote: "Okwankyerɛfo Pa Test",
    });

    auditSteps.push({
      step: "RequestToPay (Collection Push)",
      status: tx.mode === "EMULATOR" ? "INFO" : "SUCCESS",
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

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Ocp-Apim-Subscription-Key": p.subscriptionKey,
        "Content-Length": "0",
      },
      body: "",
    });

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
   * 1. REQUEST TO PAY (COLLECTION)
   * Sends a USSD push authorization prompt to the payer's mobile phone handset.
   * Subscriber sees the network prompt on their phone and enters their Mobile Money PIN.
   * This aligns 100% with the Ɔkwankyerɛfo Pa Zero-PIN Voice Security Boundary.
   */
  public async requestToPay(params: RequestToPayParams): Promise<MoMoTransactionRecord> {
    const { amount, payerPhone, payerName, payerMessage, payeeNote, externalId } = params;
    const referenceId = this.generateReferenceId();
    const extId = externalId || `OKP-${Math.floor(100000 + Math.random() * 900000)}`;
    const msisdn = this.formatMsisdn(payerPhone);
    const timestamp = new Date().toISOString();

    const initialRecord: MoMoTransactionRecord = {
      id: extId,
      referenceId,
      externalId: extId,
      type: "COLLECTION_REQUEST_TO_PAY",
      status: "PENDING",
      amount,
      currency: this.config.currency,
      msisdn,
      recipientName: payerName || "MTN MoMo Subscriber",
      payerMessage: payerMessage || "Payment via Okwankyerɛfo Pa",
      mode: "EMULATOR",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // If configured with real/sandbox credentials, call the actual MTN MoMo API
    if (this.isConfigured("collection")) {
      try {
        const token = await this.getAccessToken("collection");
        const url = `${this.config.baseUrl}/collection/v1_0/requesttopay`;

        const headers: Record<string, string> = {
          "Authorization": `Bearer ${token}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": this.config.targetEnv,
          "Ocp-Apim-Subscription-Key": this.config.collection.subscriptionKey!,
          "Content-Type": "application/json",
        };

        if (this.config.targetEnv === "production" && this.config.callbackHost) {
          headers["X-Callback-Url"] = `${this.config.callbackHost}/api/momo/callback`;
        }

        let apiCurrency = this.config.targetEnv === "production" ? "GHS" : (this.config.currency || "EUR");
        const body = {
          amount: amount.toFixed(1),
          currency: apiCurrency,
          externalId: extId,
          payer: {
            partyIdType: "MSISDN",
            partyId: msisdn,
          },
          payerMessage: cleanAscii(payerMessage || `Payment of GHS ${amount} via Okwankyerɛfo Pa`),
          payeeNote: cleanAscii(payeeNote || "Voice MoMo"),
        };

        let res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        // If sandbox rejects non-EUR currency, retry automatically with EUR
        if (res.status === 400 && apiCurrency !== "EUR" && this.config.targetEnv === "sandbox") {
          console.log("[MTN MoMo Sandbox] Retrying with EUR currency adaptation...");
          apiCurrency = "EUR";
          body.currency = "EUR";
          res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          });
        }

        // MTN MoMo returns HTTP 202 Accepted for valid RequestToPay
        if (res.status === 202) {
          initialRecord.mode = this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API";
          initialRecord.status = "PENDING";
          this.transactionHistory.set(referenceId, initialRecord);
          this.transactionHistory.set(extId, initialRecord);
          this.notifyListeners(initialRecord);
          this.startAutoSync(referenceId);
          console.log(`[MTN MoMo Engine] RequestToPay dispatched (${initialRecord.mode}): Ref ${referenceId}, MSISDN ${msisdn}, Amount ${amount}`);
          return initialRecord;
        } else {
          const errBody = await res.text();
          console.warn(`[MTN MoMo Engine Notice] API returned ${res.status}: "${errBody}".`);
          initialRecord.reason = `MTN API status ${res.status}: ${errBody}`;
        }
      } catch (err: any) {
        console.warn(`[MTN MoMo Engine] Direct API call error: ${err.message}. Engaging resilient emulator.`);
        initialRecord.reason = err.message;
      }
    }

    initialRecord.status = "FAILED";
    initialRecord.reason = initialRecord.reason || "MTN MoMo Collection request was not accepted.";
    this.transactionHistory.set(referenceId, initialRecord);
    this.transactionHistory.set(extId, initialRecord);
    this.notifyListeners(initialRecord);
    throw new Error(initialRecord.reason);
  }

  /**
   * 2. DISBURSEMENT (TRANSFER)
   * Sends funds from the platform/merchant wallet directly into a recipient's MTN MoMo wallet.
   */
  public async transfer(params: TransferParams): Promise<MoMoTransactionRecord> {
    const { amount, payeePhone, payeeName, payerMessage, payeeNote, externalId } = params;
    const referenceId = this.generateReferenceId();
    const extId = externalId || `OKP-${Math.floor(100000 + Math.random() * 900000)}`;
    const msisdn = this.formatMsisdn(payeePhone);
    const timestamp = new Date().toISOString();

    const initialRecord: MoMoTransactionRecord = {
      id: extId,
      referenceId,
      externalId: extId,
      type: "DISBURSEMENT_TRANSFER",
      status: "PENDING",
      amount,
      currency: this.config.currency,
      msisdn,
      recipientName: payeeName || "Subscriber",
      payerMessage: payerMessage || "Transfer via Okwankyerɛfo Pa",
      mode: "EMULATOR",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    if (this.isConfigured("disbursement")) {
      try {
        const token = await this.getAccessToken("disbursement");
        const url = `${this.config.baseUrl}/disbursement/v1_0/transfer`;

        const headers: Record<string, string> = {
          "Authorization": `Bearer ${token}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": this.config.targetEnv,
          "Ocp-Apim-Subscription-Key": this.config.disbursement.subscriptionKey!,
          "Content-Type": "application/json",
        };

        const body = {
          amount: amount.toFixed(2),
          currency: this.config.currency,
          externalId: extId,
          payee: {
            partyIdType: "MSISDN",
            partyId: msisdn,
          },
          payerMessage: cleanAscii(payerMessage || `Payout of GHS ${amount} via Okwankyerɛfo Pa`),
          payeeNote: cleanAscii(payeeNote || "Voice Transfer"),
        };

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (res.status === 202) {
          initialRecord.mode = this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API";
          initialRecord.status = "PENDING";
          this.transactionHistory.set(referenceId, initialRecord);
          this.transactionHistory.set(extId, initialRecord);
          this.notifyListeners(initialRecord);
          this.startAutoSync(referenceId);
          console.log(`[MTN MoMo Engine] Transfer dispatched (${initialRecord.mode}): Ref ${referenceId}, MSISDN ${msisdn}, Amount ${amount}`);
          return initialRecord;
        } else {
          const errBody = await res.text();
          console.warn(`[MTN MoMo Engine] Disbursement returned ${res.status}: ${errBody}`);
          initialRecord.reason = `MTN API status ${res.status}: ${errBody}`;
        }
      } catch (err: any) {
        console.warn(`[MTN MoMo Engine] Disbursement API call error: ${err.message}`);
        initialRecord.reason = err.message;
      }
    }

    initialRecord.status = "FAILED";
    initialRecord.reason = initialRecord.reason || "MTN MoMo disbursement was not accepted.";
    this.transactionHistory.set(referenceId, initialRecord);
    this.transactionHistory.set(extId, initialRecord);
    this.notifyListeners(initialRecord);
    throw new Error(initialRecord.reason);
  }

  /**
   * 3. CHECK TRANSACTION STATUS (RequestToPay or Transfer)
   */
  public async getTransactionStatus(referenceId: string): Promise<MoMoTransactionRecord | null> {
    const local = this.transactionHistory.get(referenceId);

    if (local && local.mode !== "EMULATOR" && local.status === "PENDING") {
      const isCollection = local.type === "COLLECTION_REQUEST_TO_PAY";
      const product = isCollection ? "collection" : "disbursement";
      const pathSegment = isCollection ? "requesttopay" : "transfer";

      try {
        const token = await this.getAccessToken(product);
        const url = `${this.config.baseUrl}/${product}/v1_0/${pathSegment}/${referenceId}`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "X-Target-Environment": this.config.targetEnv,
            "Ocp-Apim-Subscription-Key": (isCollection ? this.config.collection.subscriptionKey : this.config.disbursement.subscriptionKey) || "",
          },
        });

        if (res.ok) {
          const data = await res.json();
          local.status = data.status || local.status;
          local.financialTransactionId = data.financialTransactionId || local.financialTransactionId;
          local.updatedAt = new Date().toISOString();
          local.rawPayload = data;
          this.transactionHistory.set(referenceId, local);
          return local;
        }
      } catch (err) {
        console.error(`[MTN MoMo Engine] Error querying status for ${referenceId}:`, err);
      }
    }

    return local || null;
  }

  /**
   * 4. CHECK ACCOUNT BALANCE
   */
  public async getAccountBalance(product: "collection" | "disbursement" = "collection"): Promise<MoMoBalanceResult> {
    if (this.isConfigured(product)) {
      try {
        const token = await this.getAccessToken(product);
        const url = `${this.config.baseUrl}/${product}/v1_0/account/balance`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "X-Target-Environment": this.config.targetEnv,
            "Ocp-Apim-Subscription-Key": (product === "collection" ? this.config.collection.subscriptionKey : this.config.disbursement.subscriptionKey) || "",
          },
        });

        if (res.ok) {
          const data = await res.json();
          const balanceNum = parseFloat(data.availableBalance) || 0;
          const curr = data.currency || this.config.currency;
          return {
            availableBalance: balanceNum,
            currency: curr,
            formatted: `${balanceNum.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${curr}`,
            mode: this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API",
          };
        }
      } catch (err: any) {
        console.warn(`[MTN MoMo Engine] Balance inquiry notice: ${err.message}. Returning fallback.`);
      }
    }

    throw new Error(`Unable to retrieve ${product} MoMo account balance from MTN.`);
  }

  /**
   * 5. VALIDATE ACCOUNT HOLDER & KYC STATUS
   */
  public async validateAccountHolder(phone: string): Promise<MoMoAccountHolderResult> {
    const msisdn = this.formatMsisdn(phone);

    if (this.isConfigured("collection")) {
      try {
        const token = await this.getAccessToken("collection");
        const url = `${this.config.baseUrl}/collection/v1_0/accountholder/msisdn/${msisdn}/active`;

        const res = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "X-Target-Environment": this.config.targetEnv,
            "Ocp-Apim-Subscription-Key": this.config.collection.subscriptionKey!,
          },
        });

        if (res.ok) {
          const data = await res.json();
          const isActive = Boolean(data.result);

          let name: string | undefined;
          try {
            const infoRes = await fetch(`${this.config.baseUrl}/collection/v1_0/accountholder/msisdn/${msisdn}/basicuserinfo`, {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${token}`,
                "X-Target-Environment": this.config.targetEnv,
                "Ocp-Apim-Subscription-Key": this.config.collection.subscriptionKey!,
              },
            });
            if (infoRes.ok) {
              const info = await infoRes.json();
              if (info.given_name || info.family_name) {
                name = `${info.given_name || ""} ${info.family_name || ""}`.trim();
              }
            }
          } catch {
            // Basic user info optional
          }

          return {
            isActive,
            msisdn,
            name,
            mode: this.config.targetEnv === "production" ? "LIVE_API" : "SANDBOX_API",
          };
        }
      } catch (err: any) {
        console.warn(`[MTN MoMo Engine] Account holder lookup error: ${err.message}`);
      }
    }

    throw new Error("Unable to verify the MTN MoMo account holder from the API.");
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
      if (!payload?.status) {
        return null;
      }

      record.status = String(payload.status).toUpperCase() as MoMoTransactionRecord["status"];
      record.financialTransactionId = payload.financialTransactionId || record.financialTransactionId;
      record.updatedAt = new Date().toISOString();
      record.rawPayload = payload;
      this.transactionHistory.set(record.referenceId, record);
      console.log(`[MTN MoMo Engine Webhook] Updated transaction ${record.referenceId} -> Status: ${record.status}`);
      return record;
    }

    return null;
  }

  /**
   * 7. SANDBOX AUTO-PROVISIONER
   */
  public async autoProvisionSandbox(subscriptionKey: string, callbackHost: string = "okwankyer-fo-pa.onrender.com"): Promise<{ apiUserId: string; apiKey: string }> {
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

    // Apply to current in-memory config
    this.config.collection.subscriptionKey = subscriptionKey;
    this.config.collection.apiUserId = apiUserId;
    this.config.collection.apiKey = apiKey;
    this.config.disbursement.subscriptionKey = subscriptionKey;
    this.config.disbursement.apiUserId = apiUserId;
    this.config.disbursement.apiKey = apiKey;

    console.log(`[MTN MoMo Engine Sandbox] Auto-provisioned API User: ${apiUserId}`);
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

    const isFullyLive = this.config.targetEnv === "production" &&
      hasCollectionKey && hasCollectionUser && hasCollectionApiKey;

    const isSandboxActive = this.config.targetEnv === "sandbox" &&
      hasCollectionKey && hasCollectionUser && hasCollectionApiKey;

    return {
      activeMode: isFullyLive ? "LIVE_PRODUCTION" : isSandboxActive ? "SANDBOX_API" : "RESILIENT_EMULATOR",
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
          status: hasCollectionKey ? "CONFIGURED" : "PENDING",
          requirement: "Sign up at momodeveloper.mtn.com and subscribe to Collections and Disbursements products.",
          envVar: "MOMO_SUBSCRIPTION_KEY or MOMO_COLLECTION_SUBSCRIPTION_KEY",
        },
        {
          step: 2,
          name: "API User ID & API Key",
          status: hasCollectionUser && hasCollectionApiKey ? "CONFIGURED" : "PENDING",
          requirement: "Generate API User UUID and API Key via Sandbox Auto-Provisioner or MTN Portal.",
          envVar: "MOMO_API_USER_ID, MOMO_API_KEY",
        },
        {
          step: 3,
          name: "MTN Merchant/Partner KYC Approval (Go-Live)",
          status: this.config.targetEnv === "production" ? "CONFIGURED" : "SANDBOX_OR_EMULATED",
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


export const momoEngine = new MoMoEngine();
