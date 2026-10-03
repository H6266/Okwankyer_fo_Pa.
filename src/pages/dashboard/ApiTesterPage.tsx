import React, { useState, useEffect } from "react";
import {
  Send,
  Copy,
  Check,
  Terminal,
  Play,
  RotateCcw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Zap,
  ShieldCheck,
  Smartphone,
  Wallet,
  UserCheck,
  ArrowRight,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { api, EndpointDoc } from "../../lib/api";

interface DiagnosticStep {
  id: string;
  name: string;
  endpoint: string;
  description: string;
  status: "idle" | "running" | "pass" | "fail";
  durationMs?: number;
  data?: any;
  error?: string;
}

export const ApiTesterPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"quick_test" | "diagnostic" | "raw_console" | "webhook">("quick_test");

  // Quick MoMo Handset Tester State
  const [testPhone, setTestPhone] = useState("0553838464");
  const [testAmount, setTestAmount] = useState("5.00");
  const [testNote, setTestNote] = useState("Test payment via Ɔkwankyerɛfo Pa");
  const [actionLoading, setActionLoading] = useState(false);
  const [lastActionResponse, setLastActionResponse] = useState<any>(null);
  const [activePrompt, setActivePrompt] = useState<{
    referenceId: string;
    amount: number;
    phone: string;
    status: string;
  } | null>(null);

  // Diagnostic Runner State
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnosticSteps, setDiagnosticSteps] = useState<DiagnosticStep[]>([
    {
      id: "status",
      name: "1. API Status & Keys Check",
      endpoint: "GET /api/momo/status",
      description: "Verifies subscription key, target sandbox environment, and credentials health",
      status: "idle",
    },
    {
      id: "balance",
      name: "2. Account Balance Inquiry",
      endpoint: "GET /api/momo/account/balance?product=collection",
      description: "Queries real-time collection wallet float and available currency",
      status: "idle",
    },
    {
      id: "holder",
      name: "3. Account Holder / KYC Validation",
      endpoint: "GET /api/momo/account/holder/:phone",
      description: "Validates active MSISDN account status on telco network core",
      status: "idle",
    },
    {
      id: "rtp",
      name: "4. RequestToPay Collection Push",
      endpoint: "POST /api/momo/request-to-pay",
      description: "Dispatches payment push prompt with standard OKP reference",
      status: "idle",
    },
    {
      id: "poll",
      name: "5. Transaction Status Polling",
      endpoint: "GET /api/momo/request-to-pay/:referenceId",
      description: "Polls transaction state to ensure end-to-end receipt completion",
      status: "idle",
    },
  ]);

  // Raw Console State
  const [endpoints, setEndpoints] = useState<EndpointDoc[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDoc | null>(null);
  const [activeCarrier, setActiveCarrier] = useState<"MTN" | "Telecel" | "AT">("MTN");
  const [requestBody, setRequestBody] = useState("");
  const [response, setResponse] = useState<{
    status: number;
    durationMs: number;
    headers: Record<string, string>;
    data: any;
  } | null>(null);
  const [consoleLoading, setConsoleLoading] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [requestHistory, setRequestHistory] = useState<
    Array<{ name: string; path: string; status: number; time: string }>
  >([]);

  // AT Webhook Simulator State
  const [webhookSessionId, setWebhookSessionId] = useState("AT-CALL-98214");
  const [webhookCaller, setWebhookCaller] = useState("+233543546010");
  const [webhookDigits, setWebhookDigits] = useState("1");
  const [webhookStep, setWebhookStep] = useState("welcome");
  const [simulatedVoiceXml, setSimulatedVoiceXml] = useState<string | null>(null);

  useEffect(() => {
    api.getEndpoints().then((list) => {
      setEndpoints(list);
      if (list.length > 0) {
        selectEndpoint(list[0]);
      }
    });
  }, []);

  const selectEndpoint = (ep: EndpointDoc) => {
    setSelectedEndpoint(ep);
    setRequestBody(ep.defaultPayload ? JSON.stringify(ep.defaultPayload, null, 2) : "");
    setResponse(null);
  };

  // 1-Click Complete MoMo API Diagnostic
  const runFullDiagnostic = async () => {
    setDiagnosticsRunning(true);
    const steps = [...diagnosticSteps];

    // Reset status
    steps.forEach((s) => {
      s.status = "idle";
      s.durationMs = undefined;
      s.data = undefined;
      s.error = undefined;
    });
    setDiagnosticSteps([...steps]);

    let createdRefId = "";

    // Step 1: Status
    try {
      steps[0].status = "running";
      setDiagnosticSteps([...steps]);
      const t0 = performance.now();
      const statusRes = await api.getMomoStatus();
      steps[0].durationMs = Math.round(performance.now() - t0);
      steps[0].status = statusRes.success !== false ? "pass" : "fail";
      steps[0].data = statusRes;
      setDiagnosticSteps([...steps]);
    } catch (err: any) {
      steps[0].status = "fail";
      steps[0].error = err.message;
      setDiagnosticSteps([...steps]);
    }

    // Step 2: Balance
    try {
      steps[1].status = "running";
      setDiagnosticSteps([...steps]);
      const t0 = performance.now();
      const balRes = await api.getMomoBalance("collection");
      steps[1].durationMs = Math.round(performance.now() - t0);
      steps[1].status = balRes.success !== false ? "pass" : "fail";
      steps[1].data = balRes;
      setDiagnosticSteps([...steps]);
    } catch (err: any) {
      steps[1].status = "fail";
      steps[1].error = err.message;
      setDiagnosticSteps([...steps]);
    }

    // Step 3: Account Holder Validation
    try {
      steps[2].status = "running";
      setDiagnosticSteps([...steps]);
      const t0 = performance.now();
      const holderRes = await api.validateMomoHolder(testPhone || "0553838464");
      steps[2].durationMs = Math.round(performance.now() - t0);
      steps[2].status = holderRes.success !== false ? "pass" : "fail";
      steps[2].data = holderRes;
      setDiagnosticSteps([...steps]);
    } catch (err: any) {
      steps[2].status = "fail";
      steps[2].error = err.message;
      setDiagnosticSteps([...steps]);
    }

    // Step 4: RequestToPay
    try {
      steps[3].status = "running";
      setDiagnosticSteps([...steps]);
      const t0 = performance.now();
      const rtpRes = await api.requestToPay({
        amount: parseFloat(testAmount) || 5.0,
        payerPhone: testPhone || "0553838464",
        payerName: "Test Subscriber",
        payerMessage: "Diagnostic Verification",
      });
      steps[3].durationMs = Math.round(performance.now() - t0);
      steps[3].status = rtpRes.success !== false ? "pass" : "fail";
      steps[3].data = rtpRes;
      createdRefId = rtpRes.transaction?.referenceId || rtpRes.referenceId || "";
      setDiagnosticSteps([...steps]);
    } catch (err: any) {
      steps[3].status = "fail";
      steps[3].error = err.message;
      setDiagnosticSteps([...steps]);
    }

    // Step 5: Status Poll
    try {
      steps[4].status = "running";
      setDiagnosticSteps([...steps]);
      const t0 = performance.now();
      const refToCheck = createdRefId || "OKP-847291";
      const pollRes = await api.getMomoTransactionStatus(refToCheck);
      steps[4].durationMs = Math.round(performance.now() - t0);
      steps[4].status = pollRes.success !== false ? "pass" : "fail";
      steps[4].data = pollRes;
      setDiagnosticSteps([...steps]);
    } catch (err: any) {
      steps[4].status = "fail";
      steps[4].error = err.message;
      setDiagnosticSteps([...steps]);
    }

    setDiagnosticsRunning(false);
  };

  // Quick Action Handlers
  const handleSendRequestToPay = async () => {
    setActionLoading(true);
    setLastActionResponse(null);
    try {
      const res = await api.requestToPay({
        amount: parseFloat(testAmount) || 5.0,
        payerPhone: testPhone,
        payerMessage: testNote,
      });
      setLastActionResponse(res);
      if (res.success && res.transaction) {
        setActivePrompt({
          referenceId: res.transaction.referenceId,
          amount: res.transaction.amount,
          phone: res.transaction.payerPhone,
          status: res.transaction.status,
        });
      }
    } catch (err: any) {
      setLastActionResponse({ error: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleValidateHolder = async () => {
    setActionLoading(true);
    setLastActionResponse(null);
    try {
      const res = await api.validateMomoHolder(testPhone);
      setLastActionResponse(res);
    } catch (err: any) {
      setLastActionResponse({ error: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckBalance = async () => {
    setActionLoading(true);
    setLastActionResponse(null);
    try {
      const res = await api.getMomoBalance("collection");
      setLastActionResponse(res);
    } catch (err: any) {
      setLastActionResponse({ error: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAuthorizePrompt = async (action: "approve" | "reject") => {
    if (!activePrompt) return;
    setActionLoading(true);
    try {
      const res = await api.authorizeMomoPrompt(activePrompt.referenceId, action);
      setLastActionResponse(res);
      if (res.success && res.transaction) {
        setActivePrompt({
          ...activePrompt,
          status: res.transaction.status,
        });
      }
    } catch (err: any) {
      setLastActionResponse({ error: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendCustomRequest = async () => {
    if (!selectedEndpoint) return;

    if (activeCarrier !== "MTN" && selectedEndpoint.group.includes("Collections")) {
      setResponse({
        status: 501,
        durationMs: 10,
        headers: { "content-type": "application/json" },
        data: {
          error: "Not Implemented",
          message: `${activeCarrier} Cash adapter is on the roadmap. Use MTN MoMo Sandbox.`,
          carrier: activeCarrier,
        },
      });
      return;
    }

    setConsoleLoading(true);
    try {
      let parsedBody: any = undefined;
      if (selectedEndpoint.method === "POST" && requestBody) {
        try {
          parsedBody = JSON.parse(requestBody);
        } catch {
          parsedBody = requestBody;
        }
      }

      const res = await api.sendCustomApiRequest({
        method: selectedEndpoint.method,
        path: selectedEndpoint.path,
        body: parsedBody,
      });

      setResponse(res);
      setRequestHistory((prev) => [
        {
          name: selectedEndpoint.name,
          path: selectedEndpoint.path,
          status: res.status,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 19),
      ]);
    } catch (err: any) {
      setResponse({
        status: 500,
        durationMs: 0,
        headers: {},
        data: { error: err.message },
      });
    } finally {
      setConsoleLoading(false);
    }
  };

  const handleSimulateWebhook = async () => {
    try {
      const res = await api.simulateVoiceMenu({
        sessionId: webhookSessionId,
        phoneNumber: webhookCaller,
        dtmfDigits: webhookDigits,
        step: webhookStep,
      });
      setSimulatedVoiceXml(res.voiceXml);
    } catch (err: any) {
      setSimulatedVoiceXml(`<!-- Simulation Error: ${err.message} -->`);
    }
  };

  const generateCurl = () => {
    if (!selectedEndpoint) return "";
    let cmd = `curl -X ${selectedEndpoint.method} "https://ais-dev-iqel2ew5lrsri6dvcmvcpe-282440791493.europe-west2.run.app${selectedEndpoint.path}"`;
    if (selectedEndpoint.method === "POST" && requestBody) {
      cmd += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${requestBody.replace(/'/g, "'\\''")}'`;
    }
    return cmd;
  };

  const copyCurlToClipboard = () => {
    navigator.clipboard.writeText(generateCurl());
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* ── Page Header (Clean White Styling) ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            MoMo API Test Center &amp; Health Suite
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Test and verify all MTN Mobile Money endpoints, test live account numbers, trigger simulated handset USSD
            push prompts, and inspect response payloads.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab("quick_test")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "quick_test" ? "bg-white text-slate-900 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⚡ Live Tester
          </button>
          <button
            onClick={() => setActiveTab("diagnostic")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "diagnostic" ? "bg-white text-slate-900 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            🛡️ 1-Click Diagnostic
          </button>
          <button
            onClick={() => setActiveTab("raw_console")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "raw_console" ? "bg-white text-slate-900 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            💻 HTTP Console
          </button>
          <button
            onClick={() => setActiveTab("webhook")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "webhook" ? "bg-white text-slate-900 shadow-2xs font-extrabold" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📡 Webhooks
          </button>
        </div>
      </div>

      {/* ── TAB 1: Quick Live Tester & Handset Simulator ────────────────── */}
      {activeTab === "quick_test" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Configuration & Trigger Panel */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm border border-emerald-200">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Live MoMo Transaction Tester</h2>
                    <p className="text-[11px] text-slate-500">Test RequestToPay collection push and KYC lookup</p>
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-md font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  SANDBOX READY
                </span>
              </div>

              {/* Preset Test Phone Numbers */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Preset Test Subscribers (Ghanaian MSISDN)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { phone: "0553838464", name: "Kwame Nyamebere", net: "MTN" },
                    { phone: "0241234567", name: "Kwame Nyameba", net: "MTN" },
                    { phone: "0543546010", name: "Hannes Aboagye", net: "MTN" },
                  ].map((sub) => (
                    <button
                      key={sub.phone}
                      type="button"
                      onClick={() => setTestPhone(sub.phone)}
                      className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                        testPhone === sub.phone
                          ? "border-emerald-600 bg-emerald-50/70 text-slate-900 shadow-2xs font-bold"
                          : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="font-bold text-slate-900 truncate">{sub.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{sub.phone}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Subscriber Phone Number
                  </label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="e.g. 0553838464"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount (GHS)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={testAmount}
                      onChange={(e) => setTestAmount(e.target.value)}
                      placeholder="5.00"
                      className="w-full px-3 py-2 pr-12 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 focus:bg-white transition-all"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">GHS</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Transaction Note / Purpose
                </label>
                <input
                  type="text"
                  value={testNote}
                  onChange={(e) => setTestNote(e.target.value)}
                  placeholder="Payment description"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 focus:bg-white transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={handleSendRequestToPay}
                  disabled={actionLoading}
                  className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                >
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>Send RequestToPay Push</span>
                </button>
                <button
                  type="button"
                  onClick={handleValidateHolder}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                >
                  <UserCheck className="w-4 h-4 text-slate-600" />
                  <span>Validate Account</span>
                </button>
                <button
                  type="button"
                  onClick={handleCheckBalance}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
                >
                  <Wallet className="w-4 h-4 text-slate-600" />
                  <span>Check Balance</span>
                </button>
              </div>
            </div>

            {/* Simulated Handset Prompt Box */}
            {activePrompt && (
              <div className="bg-amber-50/60 border-2 border-amber-300/80 p-5 rounded-2xl shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                      📱 Simulated Handset USSD Prompt (Zero-PIN Gate)
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white text-amber-800 border border-amber-200 font-bold">
                    Ref: {activePrompt.referenceId}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-xl border border-amber-200 text-slate-800 text-xs space-y-1 shadow-2xs font-mono">
                  <div className="text-slate-500 text-[11px]">Prompt sent to: {activePrompt.phone}</div>
                  <div className="font-bold text-slate-900 text-sm">
                    &quot;Authorize payment of GHS {activePrompt.amount.toFixed(2)} to Ɔkwankyerɛfo Pa? Enter PIN on handset.&quot;
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold pt-1">
                    Current Status: <span className="font-bold">{activePrompt.status}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleAuthorizePrompt("approve")}
                    disabled={actionLoading || activePrompt.status === "SUCCESSFUL"}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve Handset Prompt (Simulate PIN)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAuthorizePrompt("reject")}
                    disabled={actionLoading || activePrompt.status === "SUCCESSFUL"}
                    className="py-2.5 px-4 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl shadow-2xs transition-colors disabled:opacity-50"
                  >
                    Decline Prompt
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Live Response Inspector Panel */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs h-full flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-bold text-slate-900">API Response Payload</span>
                </div>
                {lastActionResponse && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700">
                    Live Result
                  </span>
                )}
              </div>

              <div className="flex-1 mt-4">
                {lastActionResponse ? (
                  <pre className="p-4 bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] leading-relaxed rounded-xl overflow-x-auto max-h-[480px] shadow-2xs">
                    {JSON.stringify(lastActionResponse, null, 2)}
                  </pre>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 space-y-2">
                    <Terminal className="w-8 h-8 text-slate-300" />
                    <p className="text-xs font-medium">Ready to test MTN MoMo API.</p>
                    <p className="text-[11px] text-slate-400">
                      Click &quot;Send RequestToPay Push&quot; or &quot;Validate Account&quot; to inspect the response payload.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Automated 1-Click MoMo Diagnostic ────────────────────── */}
      {activeTab === "diagnostic" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                End-to-End MTN MoMo Health &amp; Gateway Diagnostic
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically executes the 5 sequential stages of MoMo integration to confirm all credentials,
                balances, KYC resolution, and collections are operational.
              </p>
            </div>
            <button
              onClick={runFullDiagnostic}
              disabled={diagnosticsRunning}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
            >
              {diagnosticsRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  <span>Running Diagnostic...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 text-amber-300" />
                  <span>Run Full Diagnostic Now</span>
                </>
              )}
            </button>
          </div>

          <div className="space-y-3">
            {diagnosticSteps.map((step) => (
              <div
                key={step.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {step.status === "pass" && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                      {step.status === "fail" && <XCircle className="w-5 h-5 text-rose-600" />}
                      {step.status === "running" && <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />}
                      {step.status === "idle" && <Clock className="w-5 h-5 text-slate-300" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                        <span>{step.name}</span>
                        <code className="text-[10px] font-mono font-medium px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">
                          {step.endpoint}
                        </code>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{step.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {step.durationMs !== undefined && (
                      <span className="text-[11px] font-mono text-slate-500">{step.durationMs}ms</span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase font-mono ${
                        step.status === "pass"
                          ? "bg-emerald-100 text-emerald-800"
                          : step.status === "fail"
                          ? "bg-rose-100 text-rose-800"
                          : step.status === "running"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>
                </div>

                {step.data && (
                  <pre className="mt-3 p-3 bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[10px] rounded-lg overflow-x-auto max-h-40 shadow-2xs">
                    {JSON.stringify(step.data, null, 2)}
                  </pre>
                )}
                {step.error && (
                  <div className="mt-2 text-xs font-semibold text-rose-700 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                    Error: {step.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: Raw HTTP Console (Postman-Lite) ───────────────────────── */}
      {activeTab === "raw_console" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Endpoint Selector Sidebar */}
          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">Endpoints Catalog</span>
              <span className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">
                {endpoints.length} Routes
              </span>
            </div>

            {/* Carrier Filter */}
            <div>
              <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Active Provider Filter</label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                {(["MTN", "Telecel", "AT"] as const).map((carrier) => (
                  <button
                    key={carrier}
                    type="button"
                    onClick={() => setActiveCarrier(carrier)}
                    className={`py-1 rounded-lg text-center transition-colors ${
                      activeCarrier === carrier ? "bg-white text-slate-900 shadow-2xs font-extrabold" : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {carrier}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {endpoints.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => selectEndpoint(ep)}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all ${
                    selectedEndpoint?.id === ep.id
                      ? "border-emerald-600 bg-emerald-50/60 shadow-2xs text-slate-900 font-bold"
                      : "border-slate-100 bg-white hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        ep.method === "POST" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">{ep.group}</span>
                  </div>
                  <div className="font-semibold text-slate-900 mt-1 truncate">{ep.name}</div>
                  <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">{ep.path}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Request & Response Workbench */}
          <div className="lg:col-span-8 space-y-6">
            {selectedEndpoint ? (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        selectedEndpoint.method === "POST"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {selectedEndpoint.method}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-900">{selectedEndpoint.path}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copyCurlToClipboard}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      title="Copy cURL command"
                    >
                      {copiedCurl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCurl ? "Copied" : "Copy cURL"}</span>
                    </button>
                    <button
                      onClick={handleSendCustomRequest}
                      disabled={consoleLoading}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-colors disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{consoleLoading ? "Sending..." : "Send"}</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600">{selectedEndpoint.description}</p>

                {/* Request Payload Editor */}
                {selectedEndpoint.method === "POST" && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">JSON Request Body</label>
                    <textarea
                      value={requestBody}
                      onChange={(e) => setRequestBody(e.target.value)}
                      rows={6}
                      className="w-full p-3 font-mono text-xs bg-slate-50 text-slate-900 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 focus:bg-white shadow-2xs"
                    />
                  </div>
                )}

                {/* Response Viewer */}
                {response && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">HTTP Response</span>
                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span
                          className={`font-bold px-2 py-0.5 rounded ${
                            response.status < 300
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {response.status}
                        </span>
                        <span className="text-slate-500">{response.durationMs}ms</span>
                      </div>
                    </div>
                    <pre className="p-4 bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] rounded-xl overflow-x-auto max-h-80 shadow-2xs">
                      {typeof response.data === "string" ? response.data : JSON.stringify(response.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400">
                Select an endpoint from the catalog to begin testing.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: Telco Webhook Simulator ──────────────────────────────── */}
      {activeTab === "webhook" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Africa&apos;s Talking Webhook &amp; IVR Simulator</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Simulates incoming Africa&apos;s Talking voice menu callback requests to test dynamic VoiceXML XML generation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Session ID</label>
              <input
                type="text"
                value={webhookSessionId}
                onChange={(e) => setWebhookSessionId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Caller Phone Number</label>
              <input
                type="text"
                value={webhookCaller}
                onChange={(e) => setWebhookCaller(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">DTMF Digits Pressed</label>
              <input
                type="text"
                value={webhookDigits}
                onChange={(e) => setWebhookDigits(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
            </div>
          </div>

          <button
            onClick={handleSimulateWebhook}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            Execute Webhook &amp; Generate VoiceXML
          </button>

          {simulatedVoiceXml && (
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-900">Generated VoiceXML Response</span>
              <pre className="p-4 bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] rounded-xl overflow-x-auto shadow-2xs">
                {simulatedVoiceXml}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
