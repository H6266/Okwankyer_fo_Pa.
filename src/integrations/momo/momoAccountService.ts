/**
 * Ɔkwankyerɛfo Pa - MTN MoMo Account & KYC Service
 * 
 * Responsibilities:
 * - Validate whether account holder is active on MTN network
 * - Retrieve Basic User Info (name from MTN telco directory)
 * - Normalize results into internal RecipientLookupResult structure
 * - Retrieve platform account balance
 */

import { momoAuthService, MoMoAuthService } from "./momoAuthService";
import { formatMsisdn } from "./config";
import { RecipientLookupResult, MoMoBalance } from "./momoTypes";
import { validateGhanaPhoneNumber } from "../../domain/validation";

export class MoMoAccountService {
  constructor(private readonly auth: MoMoAuthService = momoAuthService) {}

  /**
   * Validates account holder active status on MTN network
   */
  public async isAccountActive(phone: string, product: "collection" | "disbursement" = "disbursement"): Promise<boolean> {
    const msisdn = formatMsisdn(phone);
    const token = await this.auth.getAccessToken(product);
    const { baseUrl, targetEnv } = this.auth.getEnvironment();
    const subKey = this.auth.getSubscriptionKey(product);

    const url = `${baseUrl}/${product}/v1_0/accountholder/msisdn/${msisdn}/active`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Target-Environment": targetEnv,
        "Ocp-Apim-Subscription-Key": subKey,
        "User-Agent": "curl/7.88.1",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[MoMoAccountService] Active check for ${msisdn} failed (${res.status}): ${err}`);
      return false;
    }

    const data = await res.json();
    return Boolean(data.result);
  }

  /**
   * Retrieves MTN Basic User Info (given_name, family_name)
   */
  public async getBasicUserInfo(phone: string, product: "collection" | "disbursement" = "disbursement"): Promise<{ given_name?: string; family_name?: string; name: string } | null> {
    const msisdn = formatMsisdn(phone);
    const token = await this.auth.getAccessToken(product);
    const { baseUrl, targetEnv } = this.auth.getEnvironment();
    const subKey = this.auth.getSubscriptionKey(product);

    const url = `${baseUrl}/${product}/v1_0/accountholder/msisdn/${msisdn}/basicuserinfo`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Target-Environment": targetEnv,
        "Ocp-Apim-Subscription-Key": subKey,
        "User-Agent": "curl/7.88.1",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[MoMoAccountService] BasicUserInfo for ${msisdn} failed (${res.status}): ${err}`);
      return null;
    }

    const data = await res.json();
    const givenName = (data.given_name || "").trim();
    const familyName = (data.family_name || "").trim();
    const fullName = `${givenName} ${familyName}`.trim() || (data.name || "").trim();

    if (!fullName) {
      return null;
    }

    return {
      given_name: givenName,
      family_name: familyName,
      name: fullName,
    };
  }

  /**
   * Reusable Recipient Lookup Service
   * 
   * 1. Validate phone number format
   * 2. Call MTN Account Holder Active check
   * 3. Call MTN Basic User Info to retrieve account holder's name
   * 4. Normalize result into internal RecipientLookupResult structure
   * - ZERO FABRICATION: recipient name comes ONLY from MTN API or 'Unknown (KYC not verified)'.
   */
  public async lookupRecipient(phone: string): Promise<RecipientLookupResult> {
    const validation = validateGhanaPhoneNumber(phone);
    const normalized = validation.normalized || phone.replace(/[^0-9]/g, "");
    const { targetEnv } = this.auth.getEnvironment();

    // Prefer disbursement credentials if configured, otherwise collection
    const preferredProduct: "collection" | "disbursement" = this.auth.isConfigured("disbursement")
      ? "disbursement"
      : "collection";

    // Step 1 & 2: Active check and Basic User Info from MTN API
    const [active, userInfo] = await Promise.all([
      this.isAccountActive(normalized, preferredProduct),
      this.getBasicUserInfo(normalized, preferredProduct),
    ]);

    const name = userInfo?.name || "Unknown (KYC not verified)";

    return {
      phone: normalized,
      name,
      accountActive: active,
      provider: "MTN",
      environment: targetEnv,
      source: "MTN_MOMO_API",
      rawUserInfo: userInfo || undefined,
    };
  }

  /**
   * Retrieves account balance from MTN MoMo API
   */
  public async getAccountBalance(product: "collection" | "disbursement" = "disbursement"): Promise<MoMoBalance> {
    const { baseUrl, targetEnv, currency } = this.auth.getEnvironment();
    const token = await this.auth.getAccessToken(product);
    const subKey = this.auth.getSubscriptionKey(product);

    const url = `${baseUrl}/${product}/v1_0/account/balance`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-Target-Environment": targetEnv,
        "Ocp-Apim-Subscription-Key": subKey,
        "User-Agent": "curl/7.88.1",
        "Accept": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const balanceNum = parseFloat(data.availableBalance) || 0;
      const curr = data.currency || currency;
      return {
        availableBalance: balanceNum,
        currency: curr,
        formatted: `${balanceNum.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${curr}`,
        mode: targetEnv === "production" ? "REAL" : "SANDBOX",
        product,
        timestamp: new Date().toISOString(),
      };
    }

    const err = await res.text();
    throw new Error(`MTN balance check failed (${res.status}): ${err}`);
  }
}

export const momoAccountService = new MoMoAccountService();
