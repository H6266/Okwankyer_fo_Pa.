/**
 * Ɔkwankyerɛfo Pa - MTN MoMo Authentication Service
 * 
 * Responsibilities:
 * - Generate MTN OAuth 2.0 Bearer tokens
 * - Cache tokens in memory with TTL safety buffer
 * - Auto-refresh when expired
 * - Never expose tokens to frontend
 */

import { loadConfigFromEnv } from "./config";
import { MoMoConfig } from "./types";

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

export class MoMoAuthService {
  private tokenCache: Map<string, TokenCacheEntry> = new Map();
  private config: MoMoConfig;

  constructor(customConfig?: Partial<MoMoConfig>) {
    this.config = customConfig ? { ...loadConfigFromEnv(), ...customConfig } : loadConfigFromEnv();
  }

  public reloadConfig(): void {
    this.config = loadConfigFromEnv();
    this.tokenCache.clear();
  }

  /**
   * Retrieves a valid Bearer token for the requested product (collection or disbursement)
   */
  public async getAccessToken(product: "collection" | "disbursement" = "collection"): Promise<string> {
    const creds = product === "collection" ? this.config.collection : this.config.disbursement;

    if (!creds.subscriptionKey || !creds.apiUserId || !creds.apiKey) {
      throw new Error(`Missing MTN MoMo credentials for ${product}. Subscription Key, API User ID, and API Key are required.`);
    }

    const cacheKey = `${product}:${creds.apiUserId}`;
    const cached = this.tokenCache.get(cacheKey);
    const now = Date.now();

    // 30-second margin before token expiration
    if (cached && cached.expiresAt > now + 30000) {
      return cached.token;
    }

    const authHeader = Buffer.from(`${creds.apiUserId}:${creds.apiKey}`).toString("base64");
    const tokenUrl = `${this.config.baseUrl}/${product}/token/`;

    let response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Ocp-Apim-Subscription-Key": creds.subscriptionKey,
        "Content-Type": "application/json",
        "User-Agent": "curl/7.88.1",
        "Accept": "application/json",
      },
      body: "",
    });

    if (response.status === 401 && this.config.targetEnv === "sandbox" && creds.subscriptionKey && creds.apiUserId) {
      try {
        console.log(`[MoMoAuthService] 401 on ${product}. Synchronizing active API Key from MTN Sandbox...`);
        const refreshRes = await fetch(`${this.config.baseUrl}/v1_0/apiuser/${creds.apiUserId}/apikey`, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": creds.subscriptionKey,
            "Content-Length": "0",
          },
          body: "",
        });
        if (refreshRes.ok) {
          const keyData = await refreshRes.json();
          if (keyData.apiKey) {
            creds.apiKey = keyData.apiKey;
            if (product === "collection") {
              process.env.MOMO_COLLECTION_API_KEY = keyData.apiKey;
              process.env.MTN_COLLECTION_API_KEY = keyData.apiKey;
            } else {
              process.env.MOMO_DISBURSEMENT_API_KEY = keyData.apiKey;
              process.env.MTN_DISBURSEMENT_API_KEY = keyData.apiKey;
            }
            const refreshedAuth = Buffer.from(`${creds.apiUserId}:${keyData.apiKey}`).toString("base64");
            response = await fetch(tokenUrl, {
              method: "POST",
              headers: {
                "Authorization": `Basic ${refreshedAuth}`,
                "Ocp-Apim-Subscription-Key": creds.subscriptionKey,
                "Content-Type": "application/json",
                "User-Agent": "curl/7.88.1",
                "Accept": "application/json",
              },
              body: "",
            });
          }
        }
      } catch (syncErr: any) {
        console.warn(`[MoMoAuthService] Key sync notice for ${product}:`, syncErr.message);
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`MTN MoMo OAuth token failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const token = data.access_token;
    const expiresIn = Number(data.expires_in) || 3600;

    this.tokenCache.set(cacheKey, {
      token,
      expiresAt: now + expiresIn * 1000,
    });

    return token;
  }

  /**
   * Clears in-memory token cache
   */
  public clearCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Returns subscription key for a product
   */
  public getSubscriptionKey(product: "collection" | "disbursement"): string {
    const creds = product === "collection" ? this.config.collection : this.config.disbursement;
    return creds.subscriptionKey || "";
  }

  /**
   * Returns whether credentials are fully present for a product
   */
  public isConfigured(product: "collection" | "disbursement"): boolean {
    const creds = product === "collection" ? this.config.collection : this.config.disbursement;
    return Boolean(creds.subscriptionKey && creds.apiUserId && creds.apiKey);
  }

  /**
   * Returns current environment and base URL
   */
  public getEnvironment(): { targetEnv: "sandbox" | "production"; baseUrl: string; currency: string } {
    return {
      targetEnv: this.config.targetEnv,
      baseUrl: this.config.baseUrl,
      currency: this.config.currency,
    };
  }

  /**
   * Switches target environment
   */
  public setTargetEnv(env: "sandbox" | "production"): void {
    this.config.targetEnv = env;
    this.config.baseUrl = env === "production" ? "https://proxy.momoapi.mtn.com" : "https://sandbox.momodeveloper.mtn.com";
    this.config.currency = env === "production" ? "GHS" : "EUR";
    this.clearCache();
  }
}

export const momoAuthService = new MoMoAuthService();
