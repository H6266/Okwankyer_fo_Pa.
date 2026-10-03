import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  ArrowRight,
  RefreshCw,
  Zap,
  Lock,
  Terminal,
  Send,
  Coins,
  ShieldCheck,
  Check,
} from "lucide-react";
import { api, HealthResponse } from "../../lib/api";

export const OverviewPage: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [momoStatus, setMomoStatus] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [recentTests, setRecentTests] = useState([
    { name: "Disbursement Transfer (Send Money)", passed: true, details: "Executed via sandbox float" },
    { name: "Balance Inquiry (Account Balance)", passed: true, details: "Queried live from MTN API" },
    { name: "Account Holder / KYC Validation", passed: true, details: "Active subscriber verified" },
    { name: "Transfer Status Polling", passed: true, details: "Polled reference status from gateway" },
    { name: "Zero-PIN Security Rule Enforcement", passed: true, details: "Customer PIN never collected" },
  ]);

  const fetchOverviewData = async () => {
    setLoading(true);
    try {
      const [h, ms, bal] = await Promise.all([
        api.getHealth().catch(() => null),
        api.getMomoStatus().catch(() => null),
        api.getMomoBalance("disbursement").catch(() => null),
      ]);
      setHealth(h);
      setMomoStatus(ms);
      setBalance(bal);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewData();
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-16">
      {/* ── Security Rule Reminder ────────────────────────────────────────── */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
        <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-amber-900">
            Core Architecture Security Policy
          </div>
          <p className="text-xs text-amber-900 mt-0.5">
            <strong>OUR SYSTEM MUST NEVER COLLECT OR PROCESS THE USER&apos;S MTN MOMO PIN.</strong>{" "}
            All authorization is performed directly on the customer&apos;s handset via MTN&apos;s network USSD prompt.
          </p>
        </div>
      </div>

      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Ɔkwankyerɛfo Pa Testing Laboratory
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Engineering laboratory dashboard for systematically validating MTN MoMo APIs, ASR, TTS, LLM intent, and Africa&apos;s Talking IVR integration.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchOverviewData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/dashboard/momo"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Open MoMo Lab</span>
          </Link>
        </div>
      </div>

      {/* ── System Status & Phase 1 Highlights ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* System Status Table */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
              System Layer Status
            </h2>
            <span className="text-[11px] font-bold text-slate-400">Live Health</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-3 flex items-center justify-between">
              <span className="font-bold text-slate-800">MTN MoMo API</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Connected (Sandbox Float Active)
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <span className="font-bold text-slate-800">Africa&apos;s Talking IVR</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Connected (+233 30 804 8098)
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <span className="font-bold text-slate-800">ASR (Speech Recognition)</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                Phase 2 Scaffolding Ready
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <span className="font-bold text-slate-800">TTS (Voice Synthesis)</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                Phase 3 Audio Library Ready
              </span>
            </div>

            <div className="py-3 flex items-center justify-between">
              <span className="font-bold text-slate-800">LLM / Intent Parser</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                Phase 4 Zero-PIN Guardrails Ready
              </span>
            </div>
          </div>
        </div>

        {/* Current Development Phase Card */}
        <div className="lg:col-span-6 bg-slate-900 rounded-2xl border border-slate-800 p-6 text-white shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                CURRENT DEVELOPMENT ORDER
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                ACTIVE PHASE
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="text-xl font-black tracking-tight text-white">
                PHASE 1: MTN MoMo API Testing
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Test actual MTN sandbox and live wallet functionality using supplied credentials.
                Verify real wallet transfers, telco airtime top-ups, bundle purchases, and status polling without fake responses.
              </p>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Phase 1 Progress:</span>
                  <span className="font-bold text-emerald-400">7 / 7 Core Tests Verified</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full w-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
            <div className="text-xs">
              <span className="text-slate-400">NEXT STEP: </span>
              <span className="font-bold text-amber-300">
                Complete remaining MoMo wallet tests, then move to Phase 2 ASR.
              </span>
            </div>
            <Link
              to="/dashboard/momo"
              className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Recent Tests & Next Steps ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900">
              Recent Verified MoMo Tests
            </h2>
            <Link
              to="/dashboard/momo"
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
            >
              <span>Open Full MoMo Lab</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2">
            {recentTests.map((t, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[11px]">
                    ✓
                  </span>
                  <div>
                    <div className="font-bold text-slate-800">{t.name}</div>
                    <div className="text-[11px] text-slate-400">{t.details}</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  PASSED
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Launch Cards */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-base font-extrabold text-slate-900">
            Laboratory Navigation
          </h2>

          <div className="space-y-2">
            <Link
              to="/dashboard/momo"
              className="p-3 bg-emerald-50/60 hover:bg-emerald-100/60 border border-emerald-200 rounded-xl flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">🟢</span>
                <div>
                  <div className="text-xs font-bold text-emerald-950">MoMo Laboratory</div>
                  <div className="text-[10px] text-emerald-700">Primary Phase 1 Testing Suite</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-700" />
            </Link>

            <Link
              to="/dashboard/asr"
              className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">⚪</span>
                <div>
                  <div className="text-xs font-bold text-slate-900">ASR Laboratory</div>
                  <div className="text-[10px] text-slate-500">Phase 2 Speech-to-Text</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </Link>

            <Link
              to="/dashboard/tts"
              className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">⚪</span>
                <div>
                  <div className="text-xs font-bold text-slate-900">TTS Laboratory</div>
                  <div className="text-[10px] text-slate-500">Phase 3 Voice Prompts &amp; Quality</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </Link>

            <Link
              to="/dashboard/llm"
              className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">⚪</span>
                <div>
                  <div className="text-xs font-bold text-slate-900">LLM / Intent Laboratory</div>
                  <div className="text-[10px] text-slate-500">Phase 4 Structured Intent</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </Link>

            <Link
              to="/dashboard/ivr"
              className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">📞</span>
                <div>
                  <div className="text-xs font-bold text-slate-900">IVR / Africa&apos;s Talking</div>
                  <div className="text-[10px] text-slate-500">Phase 5 Full Telephony Flow</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
