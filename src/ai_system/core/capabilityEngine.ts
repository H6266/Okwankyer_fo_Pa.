/**
 * Ɔkwankyerɛfo Pa - Deterministic Capability Engine (capabilityEngine.ts)
 * 
 * Evaluates whether a requested action or financial query is actually supported by the
 * underlying telco/banking integrations, environment, and user authorization state.
 * Never promises an action or makes assumptions about unsupported APIs.
 */

export type CapabilityStatus = 
  | "SUPPORTED"
  | "BALANCE_NOT_AVAILABLE_VIA_API"
  | "KYC_LOOKUP_UNAVAILABLE"
  | "AIRTIME_DISBURSEMENT_UNAVAILABLE"
  | "P2P_DISBURSEMENT_UNAVAILABLE"
  | "ENVIRONMENT_RESTRICTED"
  | "UNSUPPORTED_OPERATION";

export interface CapabilityCheckResult {
  allowed: boolean;
  status: CapabilityStatus;
  userExplanationEn: string;
  userExplanationTw: string;
  recommendedAlternative?: string;
  recommendedUssd?: string;
}

export class CapabilityEngine {
  /**
   * Evaluates if balance inquiry can be authoritatively retrieved via API.
   * In standard Ghana MoMo Open API (Collection/Disbursement), third-party wallet
   * balance inquiry for consumer subscribers is NOT available over the public API.
   * To prevent fraud and hallucination, this returns BALANCE_NOT_AVAILABLE_VIA_API.
   */
  public checkBalanceCapability(phone?: string): CapabilityCheckResult {
    // Subscriber wallet balances cannot be fetched via standard 3rd party Open API.
    // Must fail closed with explicit instruction to dial *170#
    return {
      allowed: false,
      status: "BALANCE_NOT_AVAILABLE_VIA_API",
      userExplanationEn: "For your security, mobile money wallet balances cannot be shared over this voice line. Please dial *170# directly on your phone keypad to view your balance safely.",
      userExplanationTw: "Wo bammbɔ nti, yɛntumi nka wo MoMo balance wɔ fon yi so. Mepa wo kyɛw, pia *170# pɛpɛɛpɛ wɔ wo fon so na hwɛ wo balance wɔ hɔ ahotɔsoɔ mu.",
      recommendedAlternative: "Dial *170# directly on handset",
      recommendedUssd: "*170#",
    };
  }

  /**
   * Evaluates if recipient KYC verification is available.
   */
  public checkKycCapability(isProviderConfigured: boolean): CapabilityCheckResult {
    if (!isProviderConfigured) {
      return {
        allowed: false,
        status: "KYC_LOOKUP_UNAVAILABLE",
        userExplanationEn: "Network subscriber name verification is temporarily offline. Please verify the recipient's phone number carefully before continuing.",
        userExplanationTw: "Telco kɔmputa a ɛhwehwɛ edin no ayɛ bɔkɔɔ kakra. Mepa wo kyɛw, hwɛ fon nɔma no yie ansa na woatoa so.",
      };
    }
    return {
      allowed: true,
      status: "SUPPORTED",
      userExplanationEn: "Recipient name verification is operational.",
      userExplanationTw: "Din nhwehwɛmu no rekɔ so yie.",
    };
  }

  /**
   * Evaluates if P2P transfer execution is supported in the current environment.
   */
  public checkTransferCapability(isDisbursementConfigured: boolean, isProduction: boolean): CapabilityCheckResult {
    if (!isDisbursementConfigured && isProduction) {
      return {
        allowed: false,
        status: "P2P_DISBURSEMENT_UNAVAILABLE",
        userExplanationEn: "Direct money transfer is currently restricted. Please try again in a few moments or use your normal MoMo menu.",
        userExplanationTw: "Sika mane no ayɛ bɔkɔɔ kakra seesei. Mepa wo kyɛw, fa wo fon MoMo menu *170# yɛ.",
      };
    }
    return {
      allowed: true,
      status: "SUPPORTED",
      userExplanationEn: "Money transfer is supported.",
      userExplanationTw: "Sika mane no rekɔ so yie.",
    };
  }
}

export const capabilityEngine = new CapabilityEngine();
