/**
 * Typed API Client Layer for Ɔkwankyerɛfo Pa
 * Communicates with backend Express services
 */

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

let activeAdminToken: string | null = null;

function getAdminAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...customHeaders };
  if (activeAdminToken) {
    headers["Authorization"] = `Bearer ${activeAdminToken}`;
  }
  return headers;
}

export interface AudioItem {
  id: string;
  number: string;
  language: "en" | "twi" | "bilingual";
  step: number;
  filename: string;
  title: string;
  spokenText: string;
  description: string;
  url: string;
  exists: boolean;
  sizeBytes: number;
  sizeFormatted: string;
  durationEstSec: number;
}

export interface AudioManifestResponse {
  englishPrompts: AudioItem[];
  twiPrompts: AudioItem[];
  sharedPrompts: AudioItem[];
  totalClips: number;
  allPresent: boolean;
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

export const api = {
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

    const res = await fetch("/voice-menu", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    return res.json();
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

    return data;
  },

  async adminLogout(): Promise<any> {
    activeAdminToken = null;
    const res = await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "same-origin",
    });

    return res.json();
  },

  async processSimulatorTurn(payload: {
    sessionId: string;
    input: string;
    channel: "VOICE" | "DTMF" | "TEXT" | "SIMULATOR";
    language?: "en" | "tw" | "ak" | "en-ak";
    currentScreen?: string;
    currentStep?: string;
    executionMode?: "SIMULATION" | "MTN_SANDBOX";
    userProfile?: any;
  }): Promise<{ success: boolean; result: any }> {
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

  async analyzeUtterance(utterance: string, languageHint?: string): Promise<{ success: boolean; result: any }> {
    const res = await fetch("/api/ai/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ utterance, languageHint }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Utterance analysis failed");
    return data;
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
