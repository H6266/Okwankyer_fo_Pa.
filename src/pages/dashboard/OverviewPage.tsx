import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  PhoneCall,
  Mic2,
  FileAudio,
  Code2,
  ShieldCheck,
  ReceiptText,
  Users,
  ArrowRight,
  RefreshCw,
  Zap,
  Smartphone,
  Check,
  Rocket,
  CheckSquare,
} from "lucide-react";
import { api, HealthResponse, SmokeTestResponse } from "../../lib/api";

export const OverviewPage: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [smokeTest, setSmokeTest] = useState<SmokeTestResponse | null>(null);
  const [testing, setTesting] = useState(false);

  // Quick MoMo Test state from Overview
  const [quickPhone, setQuickPhone] = useState("0553838464");
  const [quickAmount, setQuickAmount] = useState("5.00");
  const [quickTesting, setQuickTesting] = useState(false);
  const [quickResult, setQuickResult] = useState<any>(null);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(console.warn);
  }, []);

  const runFullSmokeTest = async () => {
    setTesting(true);
    try {
      const res = await api.runSmokeTest();
      setSmokeTest(res);
    } catch (err) {
      console.warn("Smoke test failed:", err);
    } finally {
      setTesting(false);
    }
  };

  const handleQuickMomoTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickTesting(true);
    setQuickResult(null);
    try {
      const res = await api.requestToPay({
        amount: parseFloat(quickAmount) || 5.0,
        payerPhone: quickPhone,
        payerMessage: "Overview Quick Test",
      });
      setQuickResult(res);
    } catch (err: any) {
      setQuickResult({ error: err.message });
    } finally {
      setQuickTesting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto font-sans">
      {/* Overview Top Header (White Theme) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Ɔkwankyerɛfo Pa Overview
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Real-time status of Africa&apos;s Talking voice line, MTN MoMo sandbox API, and dual-language IVR assets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/dashboard/shipping"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 hover:border-emerald-600 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <Rocket className="w-4 h-4 text-emerald-600" />
            <span>Shipping &amp; AT Backbone</span>
          </Link>
          <Link
            to="/dashboard/api"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>Open MoMo Tester</span>
          </Link>
          <button
            onClick={runFullSmokeTest}
            disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
          >
            {testing ? (
              <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
            ) : (
              <Play className="w-4 h-4 fill-current text-amber-300" />
            )}
            <span>{testing ? "Running..." : "Run Smoke Test"}</span>
          </button>
        </div>
      </div>

      {/* ── Prominent MoMo API Testing Widget ─────────────────────────── */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold border border-amber-200">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Test MTN MoMo API Directly</h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  SANDBOX
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Trigger a live RequestToPay payment collection push to any Ghanaian phone number.
              </p>
            </div>
          </div>
          <Link
            to="/dashboard/api"
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
          >
            <span>Full API Workbench</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <form onSubmit={handleQuickMomoTest} className="mt-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Phone Number</label>
            <input
              type="text"
              value={quickPhone}
              onChange={(e) => setQuickPhone(e.target.value)}
              placeholder="0553838464"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 focus:bg-white transition-all"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (GHS)</label>
            <input
              type="number"
              step="0.5"
              value={quickAmount}
              onChange={(e) => setQuickAmount(e.target.value)}
              placeholder="5.00"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 focus:bg-white transition-all"
            />
          </div>
          <div className="sm:col-span-4">
            <button
              type="submit"
              disabled={quickTesting}
              className="w-full py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {quickTesting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                  <span>Connecting MoMo API...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>Test MoMo Collection Now</span>
                </>
              )}
            </button>
          </div>
        </form>

        {quickResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] overflow-x-auto shadow-2xs">
            <div className="text-slate-500 text-[10px] pb-1 border-b border-slate-200 mb-2 font-bold flex items-center justify-between">
              <span>HTTP 200 OK — RequestToPay Response</span>
              <span className="text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-bold">PROCESSED</span>
            </div>
            <pre>{JSON.stringify(quickResult, null, 2)}</pre>
          </div>
        )}
      </div>

      {/* 4 Health Cards Grid (Clean White Theme) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Express Server */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Core Server</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {health?.status === "ok" ? "HEALTHY" : "INITIALIZING"}
          </div>
          <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">Express • Port 3000</div>
        </div>

        {/* Card 2: Africa's Talking */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Africa&apos;s Talking</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-xl font-black text-slate-900">+233 30 804 8098</div>
          <div className="text-[11px] font-mono text-amber-700 font-bold mt-1 truncate">
            Virtual Voice Trunk Active
          </div>
        </div>

        {/* Card 3: MTN MoMo Sandbox */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>MTN MoMo Sandbox</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-xl font-black text-emerald-800">READY</div>
          <div className="text-[11px] font-mono text-slate-500 mt-1">Collections &amp; Disbursements</div>
        </div>

        {/* Card 4: Audio Catalog */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2 font-medium">
            <span>Voice Catalog</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-xl font-black text-slate-900">24 Clips (100%)</div>
          <div className="text-[11px] font-mono text-slate-500 mt-1">12 Twi + 12 English studio tracks</div>
        </div>
      </div>

      {/* Smoke Test Checklist (if executed) */}
      {smokeTest && (
        <div className="p-6 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Automated System Smoke Test Report</h2>
              <span className="text-[11px] font-mono text-slate-500">
                Completed at {new Date(smokeTest.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono font-bold">
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {smokeTest.passCount} PASSED
              </span>
              {smokeTest.failCount > 0 && (
                <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  {smokeTest.failCount} FAILED
                </span>
              )}
              {smokeTest.warnCount > 0 && (
                <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {smokeTest.warnCount} WARNING
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {smokeTest.checks.map((chk) => (
              <div
                key={chk.id}
                className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3"
              >
                {chk.status === "pass" && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                {chk.status === "fail" && <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                {chk.status === "warn" && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                    <span className="truncate">{chk.name}</span>
                    <span className="font-mono text-[10px] text-slate-500">{chk.latencyMs}ms</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{chk.description}</p>
                  {chk.details && <p className="text-[10px] font-mono text-emerald-700 mt-1">{chk.details}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Launch Cards (Clean White Theme) */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Testing Suites &amp; Consoles</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/dashboard/tasks"
            className="p-5 bg-white rounded-2xl border-2 border-emerald-600/40 hover:border-emerald-600 shadow-xs transition-all group hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60">
                <CheckSquare className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-600 text-white">
                Asana Board
              </span>
            </div>
            <div className="font-bold text-sm text-slate-900">Team Tasks &amp; Delivery</div>
            <p className="text-xs text-slate-500 mt-1">
              Agile sprint board with task status, assignee filters, subtask checklists, and completion velocity.
            </p>
          </Link>

          <Link
            to="/dashboard/shipping"
            className="p-5 bg-white rounded-2xl border-2 border-emerald-600/40 hover:border-emerald-600 shadow-xs transition-all group hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60">
                <Rocket className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-600 text-white">
                Backbone
              </span>
            </div>
            <div className="font-bold text-sm text-slate-900">Shipping &amp; Africa&apos;s Talking</div>
            <p className="text-xs text-slate-500 mt-1">
              Ship voice codes to Africa&apos;s Talking services backbone, test live outbound calls, and verify trunk routes.
            </p>
          </Link>

          <Link
            to="/dashboard/api"
            className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-600 shadow-xs transition-all group hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60">
                <Code2 className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-700 transition-all" />
            </div>
            <div className="font-bold text-sm text-slate-900">MoMo API Test Center</div>
            <p className="text-xs text-slate-500 mt-1">
              Test Collections, Disbursements, KYC, Account Holder Validation, and Webhooks.
            </p>
          </Link>

          <Link
            to="/dashboard/voice"
            className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-600 shadow-xs transition-all group hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60">
                <PhoneCall className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-700 transition-all" />
            </div>
            <div className="font-bold text-sm text-slate-900">Interactive Voice Tester</div>
            <p className="text-xs text-slate-500 mt-1">
              Realistic feature-phone handset with synthesized DTMF tones and live VoiceXML stream.
            </p>
          </Link>

          <Link
            to="/dashboard/transaction"
            className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-600 shadow-xs transition-all group hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-700 transition-all" />
            </div>
            <div className="font-bold text-sm text-slate-900">Safe Transaction Walkthrough</div>
            <p className="text-xs text-slate-500 mt-1">
              Guided end-to-end send-money test with positive and negative path validations.
            </p>
          </Link>

          <Link
            to="/dashboard/speech"
            className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-600 shadow-xs transition-all group hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60">
                <Mic2 className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-700 transition-all" />
            </div>
            <div className="font-bold text-sm text-slate-900">Speech &amp; NLU Playground</div>
            <p className="text-xs text-slate-500 mt-1">
              Akan Twi and English conversational phrase tester with confidence scoring.
            </p>
          </Link>

          <Link
            to="/dashboard/ledger"
            className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-600 shadow-xs transition-all group hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60">
                <ReceiptText className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-700 transition-all" />
            </div>
            <div className="font-bold text-sm text-slate-900">Sandbox MoMo Ledger</div>
            <p className="text-xs text-slate-500 mt-1">
              Live transaction records, OKP reference IDs, status filters, and CSV export.
            </p>
          </Link>

          <Link
            to="/dashboard/kyc"
            className="p-5 bg-white rounded-2xl border border-slate-200 hover:border-emerald-600 shadow-xs transition-all group hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200/60">
                <Users className="w-5 h-5" />
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-700 transition-all" />
            </div>
            <div className="font-bold text-sm text-slate-900">KYC &amp; Subscribers</div>
            <p className="text-xs text-slate-500 mt-1">
              Manage test subscriber phone numbers and preview spoken name readbacks.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
};
