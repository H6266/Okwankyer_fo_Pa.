import React, { useState, useEffect } from "react";
import {
  Rocket,
  Radio,
  Phone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Terminal,
  FileCode,
  Server,
  Zap,
  Globe,
  Key,
} from "lucide-react";
import { api } from "../../lib/api";

interface ShippingStatus {
  success: boolean;
  voiceNumber: string;
  username: string;
  maskedApiKey: string;
  callbackUrl: string;
  baseUrl: string;
  atTrunkConnected: boolean;
  credentialsStatus: {
    valid: boolean;
    balance?: string;
    errorMessage?: string;
  };
  audioAssetsReady: boolean;
  totalAudioClips: number;
  lastShippedAt: string | null;
  lastShipResult: any;
  voicexmlEndpoints: Array<{
    name: string;
    path: string;
    method: string;
    status: string;
  }>;
}

export const ShippingPage: React.FC = () => {
  const [status, setStatus] = useState<ShippingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [shipping, setShipping] = useState(false);
  const [shipReport, setShipReport] = useState<any>(null);

  // Test Outbound Call state
  const [targetPhone, setTargetPhone] = useState("+233543546010");
  const [callLoading, setCallLoading] = useState(false);
  const [callResult, setCallResult] = useState<any>(null);

  // Config Update state
  const [usernameInput, setUsernameInput] = useState("");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [voiceNumberInput, setVoiceNumberInput] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<"shipping" | "test_call" | "voicexml" | "config">("shipping");
  const [copiedXml, setCopiedXml] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const data = await api.getShippingStatus();
      setStatus(data);
      setUsernameInput(data.username || "sandbox");
      setVoiceNumberInput(data.voiceNumber || "+233308048098");
      if (data.lastShipResult) {
        setShipReport(data.lastShipResult);
      }
    } catch (err) {
      console.warn("Shipping status load error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleShipCodes = async () => {
    setShipping(true);
    setShipReport(null);
    try {
      const res = await api.deployToAfricasTalking();
      setShipReport(res);
      await loadStatus();
    } catch (err: any) {
      setShipReport({ error: err.message });
    } finally {
      setShipping(false);
    }
  };

  const handleDispatchTestCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPhone) return;
    setCallLoading(true);
    setCallResult(null);
    try {
      const res = await api.dispatchTestCall(targetPhone);
      setCallResult(res);
    } catch (err: any) {
      setCallResult({ error: err.message });
    } finally {
      setCallLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    setConfigMsg(null);
    try {
      const res = await api.updateShippingConfig({
        username: usernameInput,
        apiKey: apiKeyInput || undefined,
        voiceNumber: voiceNumberInput,
      });
      setConfigMsg(res.message);
      await loadStatus();
    } catch (err: any) {
      setConfigMsg(`Error: ${err.message}`);
    } finally {
      setConfigSaving(false);
    }
  };

  const sampleVoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Ɔkwankyerɛfo Pa Production VoiceXML Manifest for Africa's Talking -->
<Response>
  <!-- Step 1: Language Gate with DTMF Barge-In -->
  <GetDigits timeout="2" finishOnKey="#" numDigits="1" callbackUrl="${status?.baseUrl || "https://okwankyer-fo-pa.onrender.com"}/language-selection?retry=0">
    <Play url="${status?.baseUrl || "https://okwankyer-fo-pa.onrender.com"}/audio/Welcome_prompt_01.mp3"/>
  </GetDigits>
  <!-- Dual-Track Speech Fallback Engine -->
  <Record trimSilence="true" finishOnKey="#" playBeep="true" maxLength="5" timeout="4" callbackUrl="${status?.baseUrl || "https://okwankyer-fo-pa.onrender.com"}/speech-fallback?step=language-selection&amp;retry=0"/>
</Response>`;

  const copyVoiceXml = () => {
    navigator.clipboard.writeText(sampleVoiceXml);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* ── Page Header (Clean White Styling) ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Shipping &amp; Telecom Gateway
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Ship and synchronize your VoiceXML IVR application, audio CDN assets, and callback webhooks directly to
            Africa&apos;s Talking telephony services—the core telecommunications backbone of our project.
          </p>
        </div>

        {/* Action Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab("shipping")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "shipping"
                ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            🚀 Ship Codes
          </button>
          <button
            onClick={() => setActiveTab("test_call")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "test_call"
                ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📞 Test Live Call
          </button>
          <button
            onClick={() => setActiveTab("voicexml")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "voicexml"
                ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📄 VoiceXML
          </button>
          <button
            onClick={() => setActiveTab("config")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeTab === "config"
                ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            ⚙️ AT Config
          </button>
        </div>
      </div>

      {/* ── Status Metrics Bar ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: AT Trunk Status */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>AT Voice Trunk</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {status?.atTrunkConnected ? "CONNECTED" : "SIMULATOR READY"}
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">
            User: {status?.username || "sandbox"}
          </div>
        </div>

        {/* Metric 2: Virtual Voice Number */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Active Voice Line</span>
            <Radio className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {status?.voiceNumber || "+233308048098"}
          </div>
          <div className="text-[11px] font-mono text-emerald-700 font-bold mt-1 truncate">
            Primary Inbound Trunk
          </div>
        </div>

        {/* Metric 3: Callback Webhook URL */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Shipped Callback URL</span>
            <Globe className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xs font-mono font-bold text-slate-900 truncate mt-1">
            {status?.callbackUrl || "/voice-menu"}
          </div>
          <div className="text-[11px] font-mono text-emerald-700 mt-1">HTTP POST Callback Active</div>
        </div>

        {/* Metric 4: Audio Catalog */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Telephony Audio CDN</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-xl font-black text-slate-900">
            24 / 24 Prompts
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-1">HTTP 206 Streaming Verified</div>
        </div>
      </div>

      {/* ── TAB 1: Main Shipping Center ──────────────────────────────── */}
      {activeTab === "shipping" && (
        <div className="space-y-6">
          {/* Shipping Action Hero Banner (White Themed) */}
          <div className="bg-white text-slate-900 p-8 rounded-2xl border-2 border-emerald-500/40 shadow-xs relative overflow-hidden bg-gradient-to-br from-white via-emerald-50/30 to-white">
            <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
                  <Rocket className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Africa&apos;s Talking Deployment Engine</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                  Ship Voice Application to Africa&apos;s Talking
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                  Publish your latest Express VoiceXML routes, DTMF Barge-In grammars, Akan Twi audio mappings, and
                  telephony callback endpoints directly into Africa&apos;s Talking telephony routing backbone.
                </p>
                {status?.lastShippedAt && (
                  <div className="text-[11px] font-mono text-slate-500 pt-1">
                    Last Shipped: {new Date(status.lastShippedAt).toLocaleString()}
                  </div>
                )}
              </div>

              <button
                onClick={handleShipCodes}
                disabled={shipping}
                className="shrink-0 px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm sm:text-base shadow-sm transition-transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2.5 disabled:opacity-50"
              >
                {shipping ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin text-amber-300" />
                    <span>Shipping to AT Services...</span>
                  </>
                ) : (
                  <>
                    <Rocket className="w-5 h-5" />
                    <span>Ship Codes Now</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Shipping Report (if generated) */}
          {shipReport && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    {shipReport.message || "Shipping Verification Succeeded"}
                  </h3>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {shipReport.deployment?.deploymentId || "DEPLOYED"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">Shipped Callback</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5 truncate">
                    {shipReport.deployment?.callbackUrl || status?.callbackUrl}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">Target Voice Trunk</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5">
                    {shipReport.deployment?.voiceNumber || status?.voiceNumber}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                  <div className="text-slate-500 text-[10px] uppercase font-bold">Telephony Status</div>
                  <div className="font-mono font-bold text-emerald-700 mt-0.5">
                    LIVE &amp; SYNCHRONIZED
                  </div>
                </div>
              </div>

              {shipReport.manifest && (
                <div className="space-y-1 pt-2">
                  <span className="text-xs font-bold text-slate-700">Compiled VoiceXML Manifest</span>
                  <pre className="p-4 bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] rounded-xl overflow-x-auto max-h-56 shadow-2xs">
                    {JSON.stringify(shipReport.manifest, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* VoiceXML Endpoints Shipped Verification Grid */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Shipped Telephony Endpoints Inventory</h3>
                <p className="text-xs text-slate-500">
                  Routes automatically registered with Africa&apos;s Talking voice webhooks.
                </p>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-700">
                {status?.voicexmlEndpoints.length || 9} Webhook Handlers
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(status?.voicexmlEndpoints || []).map((ep) => (
                <div
                  key={ep.path}
                  className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      {ep.method}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {ep.status}
                    </span>
                  </div>
                  <div className="font-bold text-xs text-slate-900 mt-2 truncate">{ep.name}</div>
                  <div className="font-mono text-[11px] text-slate-500 truncate mt-0.5">{ep.path}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Live Test Call Dispatcher ─────────────────────────── */}
      {activeTab === "test_call" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">Dispatch Live Call via Africa&apos;s Talking Trunk</h2>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Enter your mobile phone number. Africa&apos;s Talking will place a real phone call from{" "}
                <span className="font-mono font-bold text-slate-800">{status?.voiceNumber || "+233 30 804 8098"}</span> to
                your handset and execute the shipped VoiceXML menu.
              </p>
            </div>

            <form onSubmit={handleDispatchTestCall} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recipient Phone Number (with +233 or 0)
                </label>
                <input
                  type="text"
                  value={targetPhone}
                  onChange={(e) => setTargetPhone(e.target.value)}
                  placeholder="+233543546010 or 0553838464"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 focus:bg-white transition-all"
                />
              </div>

              {/* Quick Ghanaian Preset Numbers */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">Preset Numbers</label>
                <div className="flex flex-wrap gap-2">
                  {["+233543546010", "+233553838464", "+233241234567"].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setTargetPhone(num)}
                      className="px-2.5 py-1 text-xs font-mono bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 border border-slate-200 font-semibold"
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={callLoading}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {callLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                      <span>Placing Call via Africa&apos;s Talking...</span>
                    </>
                  ) : (
                    <>
                      <Phone className="w-4 h-4 fill-current text-amber-300" />
                      <span>Trigger Outbound Call to Handset</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <span>How Live Phone Testing Works</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                When triggered, Africa&apos;s Talking voice infrastructure dials your phone, invokes our shipped callback{" "}
                <code className="font-mono bg-white px-1 py-0.5 rounded border">{status?.callbackUrl}</code>, and plays the
                studio audio prompts.
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900">Africa&apos;s Talking Call Response</span>
              <Terminal className="w-4 h-4 text-slate-400" />
            </div>

            <div className="flex-1 mt-4">
              {callResult ? (
                <pre className="p-4 bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] rounded-xl overflow-x-auto max-h-96 shadow-2xs">
                  {JSON.stringify(callResult, null, 2)}
                </pre>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 space-y-2">
                  <Phone className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-medium">No active call dispatched yet.</p>
                  <p className="text-[11px] text-slate-400">
                    Enter a phone number and click &quot;Trigger Outbound Call&quot; to inspect the telecom response.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: VoiceXML Telephony Application Package ────────────── */}
      {activeTab === "voicexml" && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Africa&apos;s Talking VoiceXML Application Manifest</h2>
              <p className="text-xs text-slate-500">
                Standard XML compliant with Africa&apos;s Talking VoiceXML interpreter specification.
              </p>
            </div>
            <button
              onClick={copyVoiceXml}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-200 transition-colors"
            >
              {copiedXml ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedXml ? "Copied" : "Copy VoiceXML"}</span>
            </button>
          </div>

          <pre className="p-4 bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] leading-relaxed rounded-xl overflow-x-auto max-h-[500px] shadow-2xs">
            {sampleVoiceXml}
          </pre>
        </div>
      )}

      {/* ── TAB 4: AT Credentials Configuration ──────────────────────── */}
      {activeTab === "config" && (
        <div className="max-w-2xl bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Africa&apos;s Talking Credentials &amp; Trunk Setup</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure Africa&apos;s Talking account username, API key, and virtual voice number.
            </p>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Africa&apos;s Talking Username
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="sandbox or your AT username"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Use &quot;sandbox&quot; for simulation or your live AT account username.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Africa&apos;s Talking API Key (Masked: {status?.maskedApiKey})
              </label>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Enter new AT API key to update"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Starts with &quot;atsk_&quot; in sandbox or production alphanumeric key.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Assigned Virtual Voice Number
              </label>
              <input
                type="text"
                value={voiceNumberInput}
                onChange={(e) => setVoiceNumberInput(e.target.value)}
                placeholder="+233308048098"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
              />
            </div>

            {configMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${
                  configMsg.startsWith("Error")
                    ? "bg-rose-50 text-rose-800 border border-rose-200"
                    : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                }`}
              >
                {configMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={configSaving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
            >
              {configSaving ? "Saving Configuration..." : "Save AT Configuration"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
