/**
 * Typed API Client Layer for Ɔkwankyerɛfo Pa
 * Communicates with backend Express services
 */

import type { SimulatorTurnRequest, SimulatorTurnResponse } from "../ai_system/core/aiTypes";

export interface HealthResponse {
  status: string;
  service: string;
  team: string;
  abstract: string;
  voiceNumber: string;
  username: string;
  atConfigured: boolean;
  baseUrl: string;
  callbackUrl: string;
  features: string[];
}

let activeAdminToken: string | null =
  typeof window !== "undefined" && typeof localStorage !== "undefined"
    ? localStorage.getItem("okw_admin_token")
    : null;

function getAdminAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...customHeaders };
  const token = activeAdminToken || (typeof localStorage !== "undefined" ? localStorage.getItem("okw_admin_token") : null);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export interface AudioItem {
  id: string;
  number?: string;
  language: "en" | "twi" | "bilingual";
  step: number;
  filename: string;
  title: string;
  spokenText: string;
  description: string;
  url: string | null;
  exists: boolean;
  sizeBytes: number;
  sizeFormatted: string;
  promptId?: string | null;
  assetRoot?: "supplied" | "public" | "additional";
  mimeType?: string;
  isAlternate?: boolean;
  recordingRole?: "fixed" | "dynamic" | "alternative" | "unmapped";
  durationEstSec?: number;
}

export interface AudioManifestResponse {
  englishPrompts: AudioItem[];
  twiPrompts: AudioItem[];
  sharedPrompts?: AudioItem[];
  allPrompts?: AudioItem[];
  unresolvedAssets?: AudioItem[];
  missingPromptVariants?: Array<{
    promptId: string;
    language: "en" | "twi";
    state: string;
    status: string;
  }>;
  totalClips: number;
  englishClips?: number;
  twiClips?: number;
  allPresent?: boolean;
}

export interface SessionRecord {
  id: string;
  sessionId: string;
  callerNumber: string;
  startedAt: string;
  durationSeconds: number;
  language: "en" | "twi";
  finalStep: string;
  stepReachedIndex: number;
  outcome: "COMPLETED" | "CANCELLED" | "TIMEOUT" | "ERROR";
  amountGHS?: number;
  recipientName?: string;
  recipientPhone?: string;
  referenceId?: string;
  voiceXmlTrace: Array<{
    step: string;
    requestBody?: any;
    voiceXml: string;
    timestamp: string;
  }>;
}

export interface LedgerItem {
  id: string;
  referenceId: string;
  type: "COLLECTION_REQUEST_TO_PAY" | "DISBURSEMENT_TRANSFER";
  msisdn: string;
  recipientName?: string;
  amount: number;
  currency: string;
  status: "SUCCESSFUL" | "PENDING" | "FAILED" | "REJECTED" | "TIMEOUT";
  createdAt: string;
}

export interface SmokeTestCheck {
  id: string;
  name: string;
  description: string;
  status: "pass" | "fail" | "warn" | "pending";
  latencyMs: number;
  details?: string;
}

export interface SmokeTestResponse {
  timestamp: string;
  overallStatus: "pass" | "fail" | "warn";
  checks: SmokeTestCheck[];
  passCount: number;
  failCount: number;
  warnCount: number;
}

export interface EndpointParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example: any;
}

export interface EndpointDoc {
  id: string;
  group: "Collections" | "Disbursements" | "KYC & Subscribers" | "Voice & Webhooks" | "System & Health";
  name: string;
  method: "GET" | "POST";
  path: string;
  description: string;
  headers?: Record<string, string>;
  params?: EndpointParam[];
  defaultPayload?: any;
}

export interface KycLookupResponse {
  valid: boolean;
  error?: string;
  record?: {
    phoneNumber: string;
    name: string;
    network: "MTN" | "Telecel" | "AT" | "G-Money";
    tier?: string;
  };
}

export interface MomoRequestToPayRequest {
  amount: number;
  currency: "GHS";
  payerPhone: string;
  payerMessage?: string;
  payeeNote?: string;
  referenceId?: string;
}

export interface MomoTransactionStatus {
  referenceId: string;
  externalId?: string;
  amount: number;
  currency: string;
  status: "SUCCESSFUL" | "PENDING" | "FAILED";
  reason?: string;
  financialTransactionId?: string;
  timestamp: string;
}

export interface ParsedVoiceXml {
  raw: string;
  say?: { text: string; voice?: string };
  sayText?: string;
  playUrl?: string;
  playUrls?: string[];
  redirect?: string;
  getDigits?: {
    timeout?: number;
    finishOnKey?: string;
    numDigits?: number;
    callbackUrl?: string;
  };
  record?: {
    timeout?: number;
    finishOnKey?: string;
    maxLength?: number;
    callbackUrl?: string;
    playBeep?: boolean;
    trimSilence?: boolean;
  };
  redirectUrl?: string;
  isReject: boolean;
  httpStatus?: number;
  guardReason?: string;
}

export function parseVoiceXml(xmlText: string): ParsedVoiceXml {
  const result: ParsedVoiceXml = {
    raw: xmlText || "",
    isReject: (xmlText || "").includes("<Reject") || (xmlText || "").includes("<reject"),
  };

  if (!xmlText) return result;

  // Extract all Play URLs in order
  const playUrls: string[] = [];
  const playRegex = /<Play\s+[^>]*url=["']([^"']+)["'][^>]*\/?>(?:<\/Play>)?|<Play[^>]*>([^<]+)<\/Play>/gi;
  let pMatch: RegExpExecArray | null;
  while ((pMatch = playRegex.exec(xmlText)) !== null) {
    const matchedUrl = (pMatch[1] || pMatch[2] || "").trim();
    if (matchedUrl) {
      playUrls.push(matchedUrl);
    }
  }
  if (playUrls.length > 0) {
    result.playUrls = playUrls;
    result.playUrl = playUrls[0];
  }

  // Say text and voice
  const sayMatch = xmlText.match(/<Say(?:\s+voice=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/Say>/i);
  if (sayMatch) {
    result.say = {
      voice: sayMatch[1] || "female",
      text: sayMatch[2].trim(),
    };
    result.sayText = sayMatch[2].trim();
  }

  // GetDigits attributes
  const digitsMatch = xmlText.match(/<GetDigits\s+([^>]+)>/i);
  if (digitsMatch) {
    const attrs = digitsMatch[1];
    const timeout = attrs.match(/timeout=["'](\d+)["']/i);
    const finishOnKey = attrs.match(/finishOnKey=["']([^"']+)["']/i);
    const numDigits = attrs.match(/numDigits=["'](\d+)["']/i);
    const callbackUrl = attrs.match(/callbackUrl=["']([^"']+)["']/i);

    result.getDigits = {
      timeout: timeout ? parseInt(timeout[1], 10) : undefined,
      finishOnKey: finishOnKey ? finishOnKey[1] : undefined,
      numDigits: numDigits ? parseInt(numDigits[1], 10) : undefined,
      callbackUrl: callbackUrl ? callbackUrl[1].replace(/&amp;/g, "&") : undefined,
    };
  }

  // Record attributes
  const recordMatch = xmlText.match(/<Record\s+([^>]+)>/i);
  if (recordMatch) {
    const attrs = recordMatch[1];
    const timeout = attrs.match(/timeout=["'](\d+)["']/i);
    const finishOnKey = attrs.match(/finishOnKey=["']([^"']+)["']/i);
    const maxLength = attrs.match(/maxLength=["'](\d+)["']/i);
    const callbackUrl = attrs.match(/callbackUrl=["']([^"']+)["']/i);

    result.record = {
      timeout: timeout ? parseInt(timeout[1], 10) : undefined,
      finishOnKey: finishOnKey ? finishOnKey[1] : undefined,
      maxLength: maxLength ? parseInt(maxLength[1], 10) : undefined,
      callbackUrl: callbackUrl ? callbackUrl[1].replace(/&amp;/g, "&") : undefined,
      playBeep: attrs.includes('playBeep="true"'),
      trimSilence: attrs.includes('trimSilence="true"'),
    };
  }

  // Redirect
  const redirectMatch = xmlText.match(/<Redirect[^>]*>([^<]+)<\/Redirect>/i);
  if (redirectMatch) {
    result.redirectUrl = redirectMatch[1].trim().replace(/&amp;/g, "&");
  }

  return result;
}

async function parseJsonResponse(res: Response, endpoint: string): Promise<any> {
  const contentType = res.headers.get("Content-Type") || "";
  if (contentType.includes("text/html")) {
    throw new Error(
      `Expected JSON from ${endpoint}, received text/html (HTTP ${res.status}). Check that the request is routed to the backend API.`
    );
  }
  return res.json();
}

export const api = {
  // ── Africa's Talking Telephony Webhook Dispatcher ───────────────────
  async dispatchAtVoiceWebhook(
    endpointUrl: string,
    params: {
      sessionId: string;
      callerNumber?: string;
      destinationNumber?: string;
      isActive?: string | number;
      direction?: string;
      dtmfDigits?: string;
      recordingUrl?: string;
      [key: string]: any;
    }
  ): Promise<{ voiceXml: string; parsed: ParsedVoiceXml; status: number; effectiveUrl: string }> {
    let effectiveUrl = endpointUrl;
    if (effectiveUrl.startsWith("http://") || effectiveUrl.startsWith("https://")) {
      try {
        const u = new URL(effectiveUrl);
        effectiveUrl = u.pathname + u.search;
      } catch {
        // fallback
      }
    }

    if (!effectiveUrl.startsWith("/api/simulator")) {
      effectiveUrl = `/api/simulator${effectiveUrl.startsWith("/") ? "" : "/"}${effectiveUrl}`;
    }

    const formParams = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        formParams.append(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/xml, text/xml, */*",
    };
    const token = activeAdminToken || (typeof localStorage !== "undefined" ? localStorage.getItem("okw_admin_token") : null);
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let res: Response;
    try {
      res = await fetch(effectiveUrl, {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: formParams.toString(),
      });
    } catch (fetchErr: any) {
      // 1 automatic retry on transient socket reset or container reload
      await new Promise((r) => setTimeout(r, 450));
      res = await fetch(effectiveUrl, {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: formParams.toString(),
      });
    }

    const xmlText = await res.text();
    return {
      voiceXml: xmlText,
      parsed: parseVoiceXml(xmlText),
      status: res.status,
      effectiveUrl,
    };
  },
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
    return res.json();
  },

  async getAudioManifest(): Promise<AudioManifestResponse> {
    const res = await fetch("/api/audio/manifest");
    if (!res.ok) throw new Error(`Audio manifest request failed: ${res.status}`);
    return res.json();
  },

  async getSessions(): Promise<SessionRecord[]> {
    const res = await fetch("/api/sessions");
    if (!res.ok) throw new Error(`Sessions fetch failed: ${res.status}`);
    const data = await res.json();
    return data.sessions || [];
  },

  async getLedger(): Promise<LedgerItem[]> {
    const res = await fetch("/api/ledger");
    if (!res.ok) throw new Error(`Ledger fetch failed: ${res.status}`);
    const data = await res.json();
    return data.ledger || [];
  },

  async runSmokeTest(): Promise<SmokeTestResponse> {
    const res = await fetch("/api/dev/smoke-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Smoke test failed: ${res.status}`);
    return res.json();
  },

  async getEndpoints(): Promise<EndpointDoc[]> {
    const res = await fetch("/api/dev/endpoints");
    if (!res.ok) throw new Error(`Endpoints catalog fetch failed: ${res.status}`);
    const data = await res.json();
    return data.endpoints || [];
  },

  async lookupKyc(phoneNumber: string): Promise<KycLookupResponse> {
    const res = await fetch(`/api/kyc/lookup?phone=${encodeURIComponent(phoneNumber)}`);
    if (!res.ok) throw new Error(`KYC lookup failed: ${res.status}`);
    return res.json();
  },

  async simulateVoiceMenu(payload: {
    sessionId: string;
    phoneNumber: string;
    dtmfDigits?: string;
    step?: string;
    language?: "en" | "twi";
  }): Promise<{ voiceXml: string; status: number }> {
    const params = new URLSearchParams();
    params.append("sessionId", payload.sessionId);
    params.append("phoneNumber", payload.phoneNumber);
    if (payload.dtmfDigits !== undefined) params.append("dtmfDigits", payload.dtmfDigits);
    if (payload.step) params.append("step", payload.step);

    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    const token = activeAdminToken || (typeof localStorage !== "undefined" ? localStorage.getItem("okw_admin_token") : null);
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("/api/simulator/voice-menu", {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: params.toString(),
    });
    const xml = await res.text();
    return { voiceXml: xml, status: res.status };
  },

  async sendCustomApiRequest(endpoint: {
    method: "GET" | "POST";
    path: string;
    headers?: Record<string, string>;
    body?: any;
  }): Promise<{ status: number; durationMs: number; headers: Record<string, string>; data: any }> {
    const start = performance.now();
    const fetchOptions: RequestInit = {
      method: endpoint.method,
      headers: {
        Accept: "application/json, text/xml, */*",
        ...(endpoint.headers || {}),
      },
    };

    if (endpoint.method === "POST" && endpoint.body) {
      if (typeof endpoint.body === "string") {
        fetchOptions.body = endpoint.body;
      } else {
        fetchOptions.headers = {
          "Content-Type": "application/json",
          ...fetchOptions.headers,
        };
        fetchOptions.body = JSON.stringify(endpoint.body);
      }
    }

    const res = await fetch(endpoint.path, fetchOptions);
    const durationMs = Math.round(performance.now() - start);

    const resHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      resHeaders[key] = val;
    });

    const text = await res.text();
    let parsedData: any = text;
    try {
      parsedData = JSON.parse(text);
    } catch {
      // Keep as text / XML
    }

    return {
      status: res.status,
      durationMs,
      headers: resHeaders,
      data: parsedData,
    };
  },

  // ── Dedicated MTN MoMo Testing Methods ──────────────────────────────
  async getMomoStatus(): Promise<any> {
    const res = await fetch("/api/momo/status", {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return parseJsonResponse(res, "/api/momo/status");
  },

  async provisionMomoSandbox(subscriptionKey?: string): Promise<any> {
    const res = await fetch("/api/momo/provision", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ subscriptionKey }),
    });
    return res.json();
  },

  async getCapabilityMatrix(): Promise<any> {
    const res = await fetch("/api/momo/capability-matrix", {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async getMomoBalance(product: "collection" | "disbursement" = "collection"): Promise<any> {
    const res = await fetch(`/api/momo/account/balance?product=${product}`, {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async validateMomoHolder(phone: string): Promise<any> {
    const res = await fetch(`/api/momo/account/holder/${encodeURIComponent(phone)}`, {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async requestToPay(params: {
    amount: number;
    payerPhone: string;
    payerName?: string;
    payerMessage?: string;
    payeeNote?: string;
    externalId?: string;
  }): Promise<any> {
    const res = await fetch("/api/momo/request-to-pay", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async getMomoTransactionStatus(referenceId: string): Promise<any> {
    const res = await fetch(`/api/momo/request-to-pay/${encodeURIComponent(referenceId)}`, {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async transferFunds(params: {
    amount: number;
    payeePhone: string;
    payeeName?: string;
    payerMessage?: string;
    payeeNote?: string;
    externalId?: string;
  }): Promise<any> {
    const res = await fetch("/api/momo/transfer", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async getTransferStatus(referenceId: string): Promise<any> {
    const res = await fetch(`/api/momo/transfer/${encodeURIComponent(referenceId)}`, {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async authorizeMomoPrompt(referenceId: string, action: "approve" | "reject" = "approve"): Promise<any> {
    const res = await fetch("/api/momo/authorize-prompt", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ referenceId, action }),
    });
    return res.json();
  },

  async testRealAccount(params: {
    phone: string;
    amount?: number;
    subscriberName?: string;
  }): Promise<any> {
    const res = await fetch("/api/momo/test-account", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async runMomoTestSuite(): Promise<any> {
    const res = await fetch("/api/momo/test-all", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  // ── Telecel Cash Sandbox & Live API Methods ─────────────────────────
  async getTelecelDiagnostics(): Promise<any> {
    const res = await fetch("/api/telecel/status", {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async updateTelecelKeys(params: {
    apiKey?: string;
    clientId?: string;
    clientSecret?: string;
    merchantId?: string;
    targetEnv?: string;
    baseUrl?: string;
  }): Promise<any> {
    const res = await fetch("/api/telecel/keys", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async getTelecelBalance(): Promise<any> {
    const res = await fetch("/api/telecel/balance", {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async lookupTelecelKyc(phone: string): Promise<any> {
    const res = await fetch(`/api/telecel/kyc/${encodeURIComponent(phone)}`, {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async telecelRequestToPay(params: {
    amount: number;
    payerPhone: string;
    payerName?: string;
    payerMessage?: string;
    payeeNote?: string;
    voucherCode?: string;
    externalId?: string;
  }): Promise<any> {
    const res = await fetch("/api/telecel/collection", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async telecelTransfer(params: {
    amount: number;
    payeePhone: string;
    payeeName?: string;
    payerMessage?: string;
    payeeNote?: string;
    externalId?: string;
  }): Promise<any> {
    const res = await fetch("/api/telecel/transfer", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async getTelecelTransactionStatus(referenceId: string): Promise<any> {
    const res = await fetch(`/api/telecel/transaction/${encodeURIComponent(referenceId)}`, {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async sendMoney(params: {
    recipient_phone: string;
    recipient_name: string;
    amount: number;
    network?: string;
    payer_phone?: string;
    mode?: "COLLECTION_REQUEST_TO_PAY" | "DISBURSEMENT_TRANSFER";
  }): Promise<any> {
    const res = await fetch("/api/momo/send", {
      method: "POST",
      credentials: "same-origin",
      headers: getAdminAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(params),
    });
    return res.json();
  },

  // ── Centralized Transaction Engine Pipeline ────────────────────────
  async validateRecipient(phone: string): Promise<any> {
    const res = await fetch("/api/momo/validate-recipient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    return res.json();
  },

  async createCentralTransaction(params: {
    operation?: string;
    recipientPhone: string;
    amount: number;
    channel?: string;
    payerPhone?: string;
  }): Promise<any> {
    const res = await fetch("/api/momo/transaction/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async validateCentralTransactionRecipient(transactionId: string, phone?: string): Promise<any> {
    const res = await fetch("/api/momo/transaction/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, phone }),
    });
    return res.json();
  },

  async confirmCentralTransaction(transactionId: string, confirmed: boolean = true): Promise<any> {
    const res = await fetch("/api/momo/transaction/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, confirmed }),
    });
    return res.json();
  },

  async submitCentralTransaction(transactionId: string, options?: { mode?: string; payerPhone?: string }): Promise<any> {
    const res = await fetch("/api/momo/transaction/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, ...options }),
    });
    return res.json();
  },

  async getCentralTransaction(id: string): Promise<any> {
    const res = await fetch(`/api/momo/transaction/${encodeURIComponent(id)}`);
    return res.json();
  },

  async buyAirtime(params: {
    phone: string;
    amount: number;
    network?: string;
  }): Promise<any> {
    const res = await fetch("/api/momo/airtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async buyData(params: {
    phone: string;
    bundle: string;
    amount?: number;
    network?: string;
  }): Promise<any> {
    const res = await fetch("/api/momo/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async payBills(params: {
    biller: string;
    accountNumber: string;
    amount: number;
  }): Promise<any> {
    const res = await fetch("/api/momo/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async cashOut(params: {
    phone: string;
    amount: number;
  }): Promise<any> {
    const res = await fetch("/api/momo/cashout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async enableVoiceCashOut(params: {
    callerPhone?: string;
    language?: string;
  }): Promise<{
    success: boolean;
    state: any;
    callerPhone: string;
    expiresInMinutes: number;
    message: string;
    messageEn: string;
    messageTw: string;
  }> {
    const res = await fetch("/api/ai/cashout/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async checkCashOutBalance(params: {
    callerPhone?: string;
    pin: string;
    requestedAmount?: number;
    network?: string;
    language?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    affordability?: any;
    message?: string;
    messageEn?: string;
    messageTw?: string;
  }> {
    const res = await fetch("/api/ai/cashout/check-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async simulateAgentCashOutRequest(params: {
    callerPhone?: string;
    agentCode?: string;
    agentName?: string;
    amount?: number;
  }): Promise<{
    success: boolean;
    request: any;
    message: string;
  }> {
    const res = await fetch("/api/ai/cashout/agent-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async getPendingCashOutRequest(callerPhone?: string): Promise<{
    success: boolean;
    hasPending: boolean;
    request?: any;
  }> {
    const res = await fetch(`/api/ai/cashout/get-pending?callerPhone=${encodeURIComponent(callerPhone || "0543546010")}`);
    return res.json();
  },

  async approveCashOut(params: {
    callerPhone?: string;
    pin: string;
    language?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    remainingAttempts?: number;
    isLocked?: boolean;
    referenceId?: string;
    request?: any;
    balanceDetails?: {
      currentBalance: number;
      requestedAmount: number;
      fee: number;
      totalRequired: number;
      shortage: number;
      maxPossibleWithdrawal: number;
      agentName: string;
    };
    message?: string;
    messageEn?: string;
    messageTw?: string;
    privacyTipEn?: string;
    privacyTipTw?: string;
  }> {
    const res = await fetch("/api/ai/cashout/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async understandCashOutIntent(params: {
    transcript: string;
    currentState: string;
    callerPhone?: string;
    requestedAmount?: number;
    language?: string;
  }): Promise<{
    success: boolean;
    intent: "AGENT_INITIATED" | "CONFIRM_PROCEED" | "REJECT_CANCEL" | "CHECK_BALANCE" | "WAITING" | "UNKNOWN";
    action: "FETCH_PENDING" | "PROCEED" | "CANCEL" | "CHECK_BALANCE" | "WAIT" | "CLARIFY";
    confidence: number;
    reason?: string;
    replyEn?: string;
    replyTw?: string;
  }> {
    const res = await fetch("/api/ai/cashout/understand-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async setCashOutWalletBalance(params: {
    callerPhone?: string;
    balance: number;
  }): Promise<{
    success: boolean;
    callerPhone: string;
    balance: number;
  }> {
    const res = await fetch("/api/ai/cashout/set-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async getMomoTransactions(): Promise<any> {
    const res = await fetch("/api/momo/transactions");
    return res.json();
  },

  // ── Africa's Talking Shipping & Deployment Methods ──────────────────
  async getShippingStatus(): Promise<any> {
    const res = await fetch("/api/shipping/status");
    if (!res.ok) throw new Error(`Shipping status fetch failed: ${res.status}`);
    return res.json();
  },

  async deployToAfricasTalking(): Promise<any> {
    const res = await fetch("/api/shipping/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Deploy to Africa's Talking failed: ${res.status}`);
    return res.json();
  },

  async dispatchTestCall(phone: string): Promise<any> {
    const res = await fetch("/api/shipping/test-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    return res.json();
  },

  async updateShippingConfig(config: { username?: string; apiKey?: string; voiceNumber?: string }): Promise<any> {
    const res = await fetch("/api/shipping/update-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    return res.json();
  },

  // ── Team Tasks API (Asana-Style Agile Board) ────────────────────────
  async getTasks(): Promise<{ tasks: ProjectTask[]; members: TaskMember[]; stats: TaskStats }> {
    const res = await fetch("/api/tasks");
    if (!res.ok) throw new Error(`Tasks fetch failed: ${res.status}`);
    return res.json();
  },

  async createTask(task: {
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: string;
    dueDate?: string;
    tags?: string[];
    section?: string;
  }): Promise<{ success: boolean; task: ProjectTask }> {
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    if (!res.ok) throw new Error(`Task creation failed: ${res.status}`);
    return res.json();
  },

  async updateTask(id: string, updates: Partial<ProjectTask> & { assigneeId?: string }): Promise<{ success: boolean; task: ProjectTask }> {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`Task update failed: ${res.status}`);
    return res.json();
  },

  async deleteTask(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Task deletion failed: ${res.status}`);
    return res.json();
  },

  async getAdminSession(): Promise<{ authenticated: boolean; isDev?: boolean; hint?: string }> {
    const res = await fetch("/api/admin/session", {
      credentials: "same-origin",
      headers: getAdminAuthHeaders(),
    });
    return res.json();
  },

  async adminLogin(token: string): Promise<any> {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data?.error || `Admin login failed (${res.status}).`
      );
    }

    if (data?.token) {
      activeAdminToken = data.token;
    } else {
      activeAdminToken = token;
    }

    if (typeof localStorage !== "undefined" && activeAdminToken) {
      localStorage.setItem("okw_admin_token", activeAdminToken);
    }

    return data;
  },

  async adminLogout(): Promise<any> {
    activeAdminToken = null;
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("okw_admin_token");
    }
    const res = await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    });

    return res.json();
  },

  async processSimulatorTurn(payload: SimulatorTurnRequest): Promise<SimulatorTurnResponse> {
    const res = await fetch("/api/ai/simulator/turn", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(activeAdminToken ? { Authorization: `Bearer ${activeAdminToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "AI simulator request failed.");
    }
    return data;
  },

  async synthesizeSpeech(payload: {
    text: string;
    language?: string;
    style?: string;
  }): Promise<{ success: boolean; result: { audioBase64?: string; audioMimeType?: string; providerUsed?: string } }> {
    const res = await fetch("/api/ai/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Speech synthesis failed");
    return data;
  },

  async processBrain(payload: {
    transcript: string;
    language?: string;
    draft?: any;
    callerNumber?: string;
    sessionId?: string;
    forceModel?: boolean;
  }): Promise<{ success: boolean; brainOutput: any; result: any }> {
    const res = await fetch("/api/ai/brain/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Brain processing failed");
    return data;
  },

  async validateSimulatorRecipient(payload: {
    phone: string;
    sessionId?: string;
    candidateName?: string;
    candidateNetwork?: string;
  }): Promise<{
    success: boolean;
    phone: string;
    verifiedName: string;
    network: string;
    verified: boolean;
    nameMismatch: boolean;
    networkMismatch: boolean;
    candidateName: string | null;
    candidateNetwork: string | null;
  }> {
    const res = await fetch("/api/ai/simulator/validate-recipient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Recipient validation failed");
    return data;
  },

  async submitPin(payload: {
    sessionId: string;
    pin: string;
    amount: number;
    recipientPhone: string;
    recipientName?: string;
    network?: string;
    callerPhone?: string;
    language?: string;
  }): Promise<{
    success: boolean;
    error?: string;
    remainingAttempts?: number;
    message?: string;
    messageTw?: string;
    reference?: string;
    amount?: number;
    recipientName?: string;
    recipientPhone?: string;
  }> {
    const res = await fetch("/api/ai/simulator/submit-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || "PIN submission failed");
    return data;
  },

  async analyzeUtterance(utterance: string, languageHint?: string): Promise<{ success: boolean; result: any; brainOutput?: any }> {
    const res = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, languageHint }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Utterance analysis failed");
    return data;
  },

  async transcribeAudio(
    audioBase64: string,
    mimeType?: string,
    language?: string,
    step?: string,
    hintText?: string
  ): Promise<{
    success: boolean;
    result: {
      text: string;
      confidence: number;
      languageDetected: string;
      provider?: string;
      durationMs?: number;
      speechActivityDetected?: boolean;
    };
  }> {
    const res = await fetch("/api/ai/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioBase64, mimeType, language, step, hintText }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Audio transcription failed");
    return data;
  },

  async endSimulatorCall(payload: { sessionId: string; durationSeconds?: number; reason?: string; outcome?: string }): Promise<any> {
    const res = await fetch("/api/ai/simulator/call-end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async getSimulatorContacts(): Promise<any[]> {
    try {
      const res = await fetch("/api/ai/simulator/contacts");
      if (!res.ok) return [];
      const data = await res.json();
      return data.contacts || [];
    } catch {
      return [];
    }
  },

  async getSimulatorSyncStatus(): Promise<any> {
    try {
      const res = await fetch("/api/ai/simulator/sync-status");
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  async getGhanaNlpHealth(): Promise<any> {
    try {
      const res = await fetch("/api/ai/ghananlp/health");
      if (!res.ok) return { configured: false };
      return res.json();
    } catch {
      return { configured: false };
    }
  },

  async getGhanaNlpLanguages(): Promise<any> {
    const res = await fetch("/api/ai/ghananlp/languages");
    return res.json();
  },

  async getGhanaNlpSpeakers(): Promise<any> {
    const res = await fetch("/api/ai/ghananlp/speakers");
    return res.json();
  },
};

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TaskMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  email: string;
  color: string;
}

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface ProjectTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: TaskMember;
  dueDate: string;
  tags: string[];
  subtasks: TaskSubtask[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  section: string;
}

export interface TaskStats {
  total: number;
  completed: number;
  inProgress: number;
  inReview: number;
  todo: number;
  completionRate: number;
}
