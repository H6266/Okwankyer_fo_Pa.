import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Smartphone,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Sparkles,
  Send,
  AlertTriangle,
  ArrowRight,
  HelpCircle,
  Lock,
  ReceiptText,
  History,
  Mic2,
  FileAudio,
  Users,
  Zap,
  PhoneCall,
  ExternalLink,
  Wallet,
  Radio,
  Copy,
  Check,
  Truck,
  FileCheck,
  RefreshCw,
  PlayCircle,
  Flame,
} from "lucide-react";
import {
  usePhoneSimulator,
  PRESET_SCENARIOS,
  AT_PRESET_SCENARIOS,
  SimulatorContact,
} from "../../hooks/usePhoneSimulator";
import { AUDIO_CATALOG } from "../../audio/catalog";

export const PhoneSimulatorPage: React.FC = () => {
  const sim = usePhoneSimulator();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("send_money_en");
  const [selectedAtScenarioId, setSelectedAtScenarioId] = useState<string>("at_send_money_en");
  const [typedInput, setTypedInput] = useState<string>("");
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [activeCenterTab, setActiveCenterTab] = useState<
    | "transcript"
    | "momo_ledger"
    | "asr_speech"
    | "tts_audio"
    | "zeropin_security"
    | "voicexml_ivr"
    | "kyc_contacts"
    | "shipping_escrow"
    | "test_suite"
  >("transcript");
  const [copiedXml, setCopiedXml] = useState(false);
  const [customTtsText, setCustomTtsText] = useState("Akwaaba, wo ho te sɛn?");
  const [isSynthesizingCustom, setIsSynthesizingCustom] = useState(false);
  const [audioCategoryFilter, setAudioCategoryFilter] = useState<"all" | "en" | "twi">("all");

  // Physical keyboard listeners for telephone keypad
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return;
      const key = e.key;
      if (/^[0-9]$/.test(key) || key === "#" || key === "*") {
        e.preventDefault();
        sim.handleKeypadDigit(key);
        setPressedKey(key);
        setTimeout(() => setPressedKey(null), 160);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sim]);

  const handleKeyPress = (digit: string) => {
    sim.handleKeypadDigit(digit);
    setPressedKey(digit);
    setTimeout(() => setPressedKey(null), 160);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (typedInput.trim()) {
      if (!sim.isActive) {
        sim.startCall(sim.language === "tw" ? "tw" : "en");
      }
      sim.sendInputTurn(typedInput.trim(), "TEXT");
      setTypedInput("");
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const maskPhone = (phone?: string) => {
    if (!phone) return "—";
    const clean = phone.replace(/[^0-9]/g, "");
    if (clean.length === 10) {
      return `${clean.slice(0, 3)}••••${clean.slice(-4)}`;
    }
    return phone;
  };

  const copyVoiceXml = (xml: string) => {
    navigator.clipboard?.writeText(xml);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 2000);
  };

  const keypadButtons = [
    { digit: "1", sub: "" },
    { digit: "2", sub: "ABC" },
    { digit: "3", sub: "DEF" },
    { digit: "4", sub: "GHI" },
    { digit: "5", sub: "JKL" },
    { digit: "6", sub: "MNO" },
    { digit: "7", sub: "PQRS" },
    { digit: "8", sub: "TUV (Back)" },
    { digit: "9", sub: "WXYZ (Rep)" },
    { digit: "*", sub: "Pesewas" },
    { digit: "0", sub: "Cancel" },
    { digit: "#", sub: "Submit" },
  ];

  const pipelineStagesList = [
    { key: "speechInput", label: "Speech / Input" },
    { key: "language", label: "Language Detection" },
    { key: "normalization", label: "Normalization" },
    { key: "intent", label: "Intent Classification" },
    { key: "slotExtraction", label: "Slot Extraction" },
    { key: "context", label: "Contextual Memory" },
    { key: "safety", label: "Safety & Zero-PIN Gate" },
    { key: "action", label: "Action Planning" },
    { key: "provider", label: "MTN Provider Handoff" },
    { key: "truthVerification", label: "Truth Verification" },
    { key: "response", label: "Dialogue & Speech" },
  ];

  const filteredAudioCatalog = AUDIO_CATALOG.filter((item) => {
    if (audioCategoryFilter === "en") return item.language === "en" || item.language === "bilingual";
    if (audioCategoryFilter === "twi") return item.language === "twi" || item.language === "bilingual";
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-16">
      {/* ── Top Header Banner: Single Cognitive Authority ─────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg border border-emerald-200 shadow-2xs">
              📱
            </span>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Ɔkwankyerɛfo Pa Phone Simulator
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              <span>ALL FEATURES LINKED &amp; SYNCHRONIZED</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-3xl">
            Live interactive test handset fully linked to every system feature: MoMo Sandbox &amp; Ledger, Africa's Talking IVR &amp; VoiceXML, ASR speech recognition, TTS neural synthesizer, 26 studio audio prompts, KYC directory, Zero-PIN security guard, shipping delivery escrow, and automated test suites.
          </p>
        </div>

        {/* Global Controls & Sync Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Refresh Synchronization */}
          <button
            onClick={() => sim.refreshSyncStatus()}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Refresh synchronization across all features"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">Sync All</span>
          </button>

          {/* Voice Mode Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => sim.setVoiceMode("AI_NEURAL")}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                sim.voiceMode === "AI_NEURAL"
                  ? "bg-white text-emerald-800 font-bold shadow-xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Neural speech synthesis with Ghanaian cadence"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Neural TTS</span>
            </button>
            <button
              onClick={() => sim.setVoiceMode("STUDIO_PROMPTS")}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                sim.voiceMode === "STUDIO_PROMPTS"
                  ? "bg-white text-emerald-800 font-bold shadow-xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
              title="Plays authentic Ghanaian studio recordings (Audio Library)"
            >
              <Radio className="w-3 h-3 text-emerald-600" />
              <span>Studio Prompts</span>
            </button>
          </div>

          {/* Gateway Selector: Africa's Talking IVR vs Conversational AI */}
          <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-700 text-xs font-semibold shadow-xs">
            <button
              onClick={() => sim.setGatewayMode("AFRICASTALKING_IVR")}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                sim.gatewayMode === "AFRICASTALKING_IVR"
                  ? "bg-amber-400 text-slate-950 font-bold shadow-xs"
                  : "text-slate-300 hover:text-white"
              }`}
              title="Real-time Africa's Talking voice telephony trunk (+233 30 804 8098) with VoiceXML and IVR menus"
            >
              <PhoneCall className="w-3 h-3" />
              <span>Africa's Talking IVR</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-amber-300 font-mono">+233 30 804 8098</span>
            </button>
            <button
              onClick={() => sim.setGatewayMode("CANONICAL_AI")}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                sim.gatewayMode === "CANONICAL_AI"
                  ? "bg-emerald-600 text-white font-bold shadow-xs"
                  : "text-slate-300 hover:text-white"
              }`}
              title="Conversational AI brain with natural Ghanaian voice & text understanding"
            >
              <Sparkles className="w-3 h-3" />
              <span>Conversational AI</span>
            </button>
          </div>

          {/* Mode Selector: Safe Simulation vs Live MTN Sandbox */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => sim.setExecutionMode("SIMULATION")}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                sim.executionMode === "SIMULATION"
                  ? "bg-white text-emerald-800 font-bold shadow-xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>AI Mode</span>
            </button>
            <button
              onClick={() => sim.setExecutionMode("MTN_SANDBOX")}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                sim.executionMode === "MTN_SANDBOX"
                  ? "bg-rose-600 text-white font-bold shadow-xs"
                  : "text-slate-600 hover:text-rose-700"
              }`}
              title="Engages real MTN sandbox disbursement transfers"
            >
              <span className="w-2 h-2 rounded-full bg-white" />
              <span>Sandbox</span>
            </button>
          </div>

          {/* Audio Synthesizer toggle */}
          <button
            onClick={() => sim.setEnableTts(!sim.enableTts)}
            className={`p-2 rounded-xl border transition-colors ${
              sim.enableTts
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-100 text-slate-400 border-slate-200"
            }`}
            title={sim.enableTts ? "TTS Audio Voice On" : "TTS Audio Voice Muted"}
          >
            {sim.enableTts ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Feature Synchronization Ribbon (Live Link Cards to ALL Features) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2.5">
        {/* 1. Call Logs */}
        <Link
          to="/dashboard/calls"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Inspect live call sessions and telephony audio recordings"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">Calls</span>
            <History className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-sm font-extrabold text-slate-900 font-mono">
              {sim.syncState.callLogsTotal}
            </div>
            <span className="text-[9px] text-emerald-700 font-semibold flex items-center">
              <span>View Logs →</span>
            </span>
          </div>
        </Link>

        {/* 2. MoMo Ledger */}
        <Link
          to="/dashboard/ledger"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Inspect immutable financial ledger & idempotency keys"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">Ledger</span>
            <ReceiptText className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-sm font-extrabold text-slate-900 font-mono">
              {sim.syncState.ledgerTotal} tx
            </div>
            <span className="text-[9px] text-emerald-700 font-semibold flex items-center">
              <span>Ledger →</span>
            </span>
          </div>
        </Link>

        {/* 3. MoMo Float */}
        <Link
          to="/dashboard/momo"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="MTN MoMo API collections, disbursements, and float balance"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">Float</span>
            <Wallet className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-[11px] font-extrabold text-emerald-700 font-mono truncate">
              {sim.syncState.floatBalance === null ? "Unavailable" : `GH₵ ${sim.syncState.floatBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            </div>
            <span className="text-[9px] text-slate-500 font-semibold flex items-center">
              <span>MoMo Lab →</span>
            </span>
          </div>
        </Link>

        {/* 4. ASR Lab */}
        <Link
          to="/dashboard/asr"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Speech-to-text recognition accuracy & acoustic calibration"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">ASR Lab</span>
            <Mic2 className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-[11px] font-bold text-slate-900 font-mono">
              Ghana STT
            </div>
            <span className="text-[9px] text-slate-500 font-semibold flex items-center">
              <span>ASR Lab →</span>
            </span>
          </div>
        </Link>

        {/* 5. TTS Lab */}
        <Link
          to="/dashboard/tts"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Ghanaian neural speech synthesis and pronunciation lexicons"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">TTS Lab</span>
            <FileAudio className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-[11px] font-bold text-slate-900 font-mono truncate">
              {sim.voiceMode === "STUDIO_PROMPTS" ? "Studio Audio" : "Neural TTS"}
            </div>
            <span className="text-[9px] text-slate-500 font-semibold flex items-center">
              <span>TTS Lab →</span>
            </span>
          </div>
        </Link>

        {/* 6. Audio Library */}
        <Link
          to="/dashboard/audio"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Authentic studio recordings (13 English + 13 Twi prompts)"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">Prompts</span>
            <Radio className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-[11px] font-bold text-slate-900 font-mono">
              {sim.syncState.audioTotal} Clips
            </div>
            <span className="text-[9px] text-slate-500 font-semibold flex items-center">
              <span>Library →</span>
            </span>
          </div>
        </Link>

        {/* 7. KYC Directory */}
        <Link
          to="/dashboard/kyc"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Verified mobile subscribers & Ghana Card verification"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">KYC</span>
            <Users className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-[11px] font-bold text-slate-900 font-mono">
              {sim.syncState.kycTotal} Verified
            </div>
            <span className="text-[9px] text-slate-500 font-semibold flex items-center">
              <span>Directory →</span>
            </span>
          </div>
        </Link>

        {/* 8. IVR Telephony */}
        <Link
          to="/dashboard/ivr"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Africa's Talking telephony SIP trunk and VoiceXML simulator"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">IVR</span>
            <PhoneCall className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-[11px] font-bold text-slate-900 font-mono truncate">
              {sim.syncState.ivrVoiceNumber.slice(-8)}
            </div>
            <span className="text-[9px] text-slate-500 font-semibold flex items-center">
              <span>IVR Lab →</span>
            </span>
          </div>
        </Link>

        {/* 9. Shipping / Escrow */}
        <Link
          to="/dashboard/shipping"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="MoMo delivery fee and dispatch rider escrow payment"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">Escrow</span>
            <Truck className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-[11px] font-bold text-slate-900 font-mono">
              {sim.syncState.shippingActive} Ready
            </div>
            <span className="text-[9px] text-slate-500 font-semibold flex items-center">
              <span>Shipping →</span>
            </span>
          </div>
        </Link>

        {/* 10. Test Suites */}
        <Link
          to="/dashboard/tests"
          className="p-2.5 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Automated architectural and PIN security assertion test suites"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">Tests</span>
            <FileCheck className="w-3 h-3 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-[11px] font-bold text-emerald-700 font-mono">
              {sim.syncState.testsPassing}/{sim.syncState.testsTotal} Pass
            </div>
            <span className="text-[9px] text-slate-500 font-semibold flex items-center">
              <span>Suites →</span>
            </span>
          </div>
        </Link>
      </div>

      {/* ── 1-Click Feature Testing Tray (All Features Triggerable directly) ─── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              1-Click Feature Testing Dock (Try Every Feature)
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            Click any button below to trigger and test that feature immediately through the handset
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {sim.gatewayMode === "AFRICASTALKING_IVR" ? (
            <>
              {/* AT Scenario 1: English 9-Step Transfer */}
              <button
                onClick={() => sim.runAtPresetScenario("at_send_money_en")}
                className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-left border border-amber-300 transition-all text-xs font-medium group"
                title="Full 9-step Africa's Talking IVR call in English with recipient lookup and Zero-PIN push"
              >
                <div className="text-[10px] font-bold text-amber-900 flex items-center gap-1">
                  <PhoneCall className="w-3 h-3 text-amber-700" />
                  <span>AT MoMo (EN)</span>
                </div>
                <div className="text-[11px] text-slate-800 font-bold truncate">9-Step Full IVR</div>
              </button>

              {/* AT Scenario 2: Akan Twi 9-Step Transfer */}
              <button
                onClick={() => sim.runAtPresetScenario("at_send_money_twi")}
                className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-left border border-emerald-300 transition-all text-xs font-medium group"
                title="Full 9-step Africa's Talking IVR call in Akan Twi with authentic voice prompts"
              >
                <div className="text-[10px] font-bold text-emerald-900 flex items-center gap-1">
                  <PhoneCall className="w-3 h-3 text-emerald-700" />
                  <span>AT Mane Sika</span>
                </div>
                <div className="text-[11px] text-slate-800 font-bold truncate">9-Step Akan Twi</div>
              </button>

              {/* AT Inbound Call Entry */}
              <button
                onClick={() => sim.startAtCall("en")}
                className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-left border border-slate-200 hover:border-emerald-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-emerald-800">📞 Inbound Trunk</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">+233 30 804 8098</div>
              </button>

              {/* AT Balance Guidance */}
              <button
                onClick={() => sim.runAtPresetScenario("at_balance_inquiry")}
                className="p-2 rounded-xl bg-slate-50 hover:bg-amber-50 text-left border border-slate-200 hover:border-amber-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-amber-700">💰 Balance Query</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">Dial *170# VoiceXML</div>
              </button>

              {/* AT Cancel Transfer */}
              <button
                onClick={() => sim.runAtPresetScenario("at_cancel_transfer")}
                className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-left border border-slate-200 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-slate-700">🛑 Cancel Call</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">Press 0 (&lt;Reject/&gt;)</div>
              </button>

              {/* AT Recipient Lookup */}
              <button
                onClick={() => {
                  if (!sim.isActive) sim.startAtCall("en");
                  sim.handleKeypadDigit("0");
                  sim.handleKeypadDigit("5");
                  sim.handleKeypadDigit("5");
                  sim.handleKeypadDigit("3");
                  sim.handleKeypadDigit("8");
                  sim.handleKeypadDigit("3");
                  sim.handleKeypadDigit("8");
                  sim.handleKeypadDigit("4");
                  sim.handleKeypadDigit("6");
                  sim.handleKeypadDigit("4");
                  sim.handleKeypadDigit("#");
                }}
                className="p-2 rounded-xl bg-slate-50 hover:bg-blue-50 text-left border border-slate-200 hover:border-blue-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-blue-700">👤 Recipient Lookup</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">Kwame Boateng</div>
              </button>

              {/* Zero-PIN Security Screen Prompt */}
              <button
                onClick={() => sim.runAtPresetScenario("at_send_money_en")}
                className="p-2 rounded-xl bg-rose-50/70 hover:bg-rose-100 text-left border border-rose-200 transition-all text-xs font-medium group"
                title="Tests Zero-PIN handoff from Africa's Talking voice trunk to handset USSD screen prompt"
              >
                <div className="text-[10px] font-bold text-rose-800 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-rose-600" />
                  <span>Zero-PIN Push</span>
                </div>
                <div className="text-[11px] text-rose-700 font-semibold truncate">USSD Screen Prompt</div>
              </button>

              {/* Hangup Trunk */}
              <button
                onClick={() => sim.endCall("User ended IVR call")}
                className="p-2 rounded-xl bg-slate-50 hover:bg-rose-50 text-left border border-slate-200 hover:border-rose-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-slate-600">⏹ Hang Up</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">Release Trunk</div>
              </button>
            </>
          ) : (
            <>
              {/* Transfer EN */}
              <button
                onClick={() => {
                  if (!sim.isActive) sim.startCall("en");
                  sim.sendInputTurn("I want to send 20 cedis to 0553838464", "TEXT");
                }}
                className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-left border border-slate-200 hover:border-emerald-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-emerald-800">💸 Send Money</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">20 GHS (EN)</div>
              </button>

              {/* Transfer Twi */}
              <button
                onClick={() => {
                  if (!sim.isActive) sim.startCall("tw");
                  sim.sendInputTurn("Mepa wo kyɛw, mane sika aduonu kɔma Kwame Nyamebere wɔ 0553838464", "TEXT");
                }}
                className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-left border border-slate-200 hover:border-emerald-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-emerald-800">🇬🇭 Mane Sika</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">20 GHS (Akan Twi)</div>
              </button>

              {/* Code-Switching */}
              <button
                onClick={() => {
                  if (!sim.isActive) sim.startCall("en");
                  sim.sendInputTurn("Please mane 20 cedis kɔma my brother on 0553838464", "TEXT");
                }}
                className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-left border border-slate-200 hover:border-emerald-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-purple-700">🔀 Code-Switch</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">English + Twi</div>
              </button>

              {/* Float / Balance Inquiry */}
              <button
                onClick={() => sim.simulateBalanceInquiry()}
                className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-left border border-slate-200 hover:border-emerald-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-amber-700">💰 MoMo Float</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">Check Balance</div>
              </button>

              {/* Airtime Purchase */}
              <button
                onClick={() => sim.simulateAirtimePurchase(10)}
                className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-left border border-slate-200 hover:border-emerald-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-cyan-700">📱 Airtime Top-Up</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">10 GHS Airtime</div>
              </button>

              {/* Delivery Rider Escrow */}
              <button
                onClick={() => sim.simulateEscrowPayment("#1042", 15)}
                className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 text-left border border-slate-200 hover:border-emerald-300 transition-all text-xs font-medium group"
              >
                <div className="text-[10px] font-bold text-blue-700">🚚 Escrow Delivery</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">15 GHS Rider Fee</div>
              </button>

              {/* Zero-PIN Security Interception Test */}
              <button
                onClick={() => sim.simulateSpokenPinViolation()}
                className="p-2 rounded-xl bg-rose-50/70 hover:bg-rose-100 text-left border border-rose-200 transition-all text-xs font-medium group"
                title="Spoken PIN security test: validates that spoken PINs are blocked and never processed"
              >
                <div className="text-[10px] font-bold text-rose-800 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-rose-600" />
                  <span>Zero-PIN Test</span>
                </div>
                <div className="text-[11px] text-rose-700 font-semibold truncate">Spoken PIN Intercept</div>
              </button>

              {/* Mid-Call Correction */}
              <button
                onClick={() => sim.simulateMidCallCorrection()}
                className="p-2 rounded-xl bg-slate-50 hover:bg-amber-50 text-left border border-slate-200 hover:border-amber-300 transition-all text-xs font-medium group"
                title="Mid-call amount correction test: ensures previous confirmation is invalidated"
              >
                <div className="text-[10px] font-bold text-amber-800">✏️ Correction</div>
                <div className="text-[11px] text-slate-700 font-semibold truncate">20 → 50 Cedis</div>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Main 3-Column Studio Grid ────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ══════════════════════════════════════════════════════════════════
            COLUMN 1: PHONE SCREEN & HANDSET (Presentation Layer)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-4 flex flex-col items-center">
          <div className="w-full max-w-[340px] bg-slate-900 p-5 rounded-[44px] border-[6px] border-slate-700 shadow-2xl space-y-4">
            {/* Top Speaker Notch */}
            <div className="w-16 h-2 bg-slate-700 rounded-full mx-auto" />

            {/* Handset OLED Display Screen */}
            <div className="relative bg-slate-950 rounded-2xl p-4 border border-slate-800 min-h-[260px] flex flex-col justify-between text-slate-100 shadow-inner overflow-hidden">
              {/* Screen Top Status Bar */}
              <div className="flex items-center justify-between text-[11px] font-mono text-amber-400 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      sim.isActive ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                    }`}
                  />
                  <span className="font-bold tracking-tight">
                    {sim.gatewayMode === "AFRICASTALKING_IVR"
                      ? "AT TRUNK · +233 30 804 8098"
                      : sim.entities.network ? `${sim.entities.network} 4G` : "MTN 4G"}
                  </span>
                </div>
                <div className="font-bold text-slate-300">
                  {sim.isActive ? formatTimer(sim.callDurationSec) : "STANDBY"}
                </div>
              </div>

              {/* Main Screen Content */}
              <div className="py-3 space-y-2 text-center my-auto">
                <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 flex items-center justify-center gap-1">
                  <span>
                    {sim.isActive
                      ? sim.gatewayMode === "AFRICASTALKING_IVR"
                        ? `AT IVR · ${sim.currentStep.toUpperCase()}`
                        : `${sim.currentStep.toUpperCase()} STEP`
                      : sim.gatewayMode === "AFRICASTALKING_IVR"
                      ? "AFRICA'S TALKING IVR TRUNK"
                      : "ƆKWANKYERƐFO PA"}
                  </span>
                  {sim.safety.pinDetectedInVoice && (
                    <span className="px-1 py-0.2 rounded bg-rose-950 text-rose-400 font-bold border border-rose-800">
                      PIN BLOCKED
                    </span>
                  )}
                </div>

                {/* Spoken AI Status / Waveform */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 min-h-[70px] flex flex-col items-center justify-center">
                  {sim.isLoading ? (
                    <div className="flex items-center gap-2 text-amber-300 animate-pulse">
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span className="text-[11px] font-medium">
                        {sim.gatewayMode === "AFRICASTALKING_IVR" ? "Africa's Talking routing..." : "AI reasoning..."}
                      </span>
                    </div>
                  ) : sim.isAiSpeaking ? (
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Volume2 className="w-4 h-4 animate-bounce shrink-0" />
                      <span className="italic text-[11px] truncate max-w-[190px]">
                        🔊 {sim.activeAudioClip ? "Playing AT Prompt..." : sim.voiceMode === "STUDIO_PROMPTS" ? "Studio prompt playing..." : "Prompt playing..."}
                      </span>
                    </div>
                  ) : sim.isActive ? (
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-200 font-medium line-clamp-2">
                        {sim.aiResponse || sim.atInstruction || "Listening for speech or keypad digits..."}
                      </div>
                      {sim.gatewayMode === "AFRICASTALKING_IVR" && (
                        <div className="text-[10px] text-amber-300 font-mono">
                          {sim.atInstruction}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500">
                      {sim.gatewayMode === "AFRICASTALKING_IVR"
                        ? "Press Call (Green) to dial Africa's Talking IVR Trunk"
                        : "Press Call (Green), choose a scenario, or click a contact"}
                    </div>
                  )}
                </div>

                {/* Keypad Digits Buffer Display */}
                {sim.digitsBuffer && (
                  <div className="font-mono text-xl font-bold text-amber-400 tracking-widest bg-slate-900/60 py-1 rounded-lg border border-amber-400/20">
                    {sim.digitsBuffer}
                  </div>
                )}
              </div>

              {/* Screen Bottom Indicators: Language & Mic */}
              <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  {sim.isMicActive ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold animate-pulse">
                      <Mic className="w-3 h-3" />
                      <span>Recording via ASR</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <MicOff className="w-3 h-3" />
                      <span>Mic Idle</span>
                    </span>
                  )}
                </div>
                <div className="font-mono text-slate-400 uppercase font-semibold">
                  {sim.language.toUpperCase()}
                </div>
              </div>

              {/* ── MoMo Push / Execution Modal Overlay ──────────────────── */}
              {(sim.currentStep === "confirm" || sim.currentStep === "execution" || sim.action.isExecutable) && (
                <div className="absolute inset-2 bg-slate-950/95 backdrop-blur-md border-2 border-emerald-500/80 rounded-xl p-3 flex flex-col justify-between shadow-2xl z-20">
                  <div className="space-y-1 text-left">
                    <div className="flex items-center justify-between text-[10px] text-emerald-400 font-mono font-bold">
                      <span>MTN MoMo PUSH</span>
                      <span className="text-amber-400">GHANA TELECOM</span>
                    </div>
                    <div className="text-xs font-bold text-white pt-1">
                      {sim.entities.amount ? `GH₵ ${Number(sim.entities.amount).toFixed(2)}` : "Mobile Transfer"}
                    </div>
                    <div className="text-[10px] text-slate-300">
                      To: <span className="font-mono font-bold text-amber-300">{maskPhone(sim.entities.recipientPhone)}</span>
                      {sim.entities.recipientName ? ` (${sim.entities.recipientName})` : ""}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono pt-1">
                      Funding: <span className="text-emerald-400 font-semibold">Business Float</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Status:{" "}
                      <span className="text-amber-400 font-bold uppercase">
                        {sim.providerResult?.data?.status || "CONFIRMATION_PENDING"}
                      </span>
                    </div>
                  </div>

                  {/* Authorization / Dial Keypad instruction */}
                  <div className="py-2 text-center bg-slate-900 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-amber-300 font-semibold flex items-center justify-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>Zero-PIN Security Enforced</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Press 1 to confirm · Press 2 to cancel
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleKeyPress("1")}
                      className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold shadow-xs active:scale-95 transition-all"
                    >
                      1: Confirm
                    </button>
                    <button
                      onClick={() => handleKeyPress("2")}
                      className="py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-bold shadow-xs active:scale-95 transition-all"
                    >
                      2: Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Handset Top Action Buttons (Call / End / Mic) */}
            <div className="grid grid-cols-3 gap-2 px-2">
              <button
                onClick={() => sim.startCall(sim.language === "tw" ? "tw" : "en")}
                disabled={sim.isActive}
                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center font-bold shadow-xs active:scale-95 transition-all"
                title="Start Call"
              >
                <Phone className="w-4 h-4" />
              </button>

              <button
                onClick={sim.toggleMic}
                disabled={!sim.isActive}
                className={`py-2.5 rounded-xl flex items-center justify-center font-bold shadow-xs active:scale-95 transition-all ${
                  sim.isMicActive
                    ? "bg-amber-500 text-slate-950 animate-pulse"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40"
                }`}
                title={sim.isMicActive ? "Mute Microphone" : "Speak to AI (ASR Capture)"}
              >
                {sim.isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>

              <button
                onClick={() => sim.endCall("User pressed End Call")}
                disabled={!sim.isActive}
                className="py-2.5 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white rounded-xl flex items-center justify-center font-bold shadow-xs active:scale-95 transition-all"
                title="Hang Up and sync to Call Logs"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>

            {/* Physical 12-Button Keypad with Authentic Audio Tones */}
            <div className="grid grid-cols-3 gap-2 px-2">
              {keypadButtons.map((btn) => (
                <button
                  key={btn.digit}
                  onClick={() => handleKeyPress(btn.digit)}
                  className={`h-11 rounded-xl flex flex-col items-center justify-center transition-all duration-75 shadow-xs ${
                    pressedKey === btn.digit
                      ? "bg-amber-400 text-slate-950 scale-95"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60"
                  }`}
                >
                  <span className="text-sm font-bold leading-none">{btn.digit}</span>
                  {btn.sub && (
                    <span className="text-[8px] font-mono text-slate-400 leading-tight">
                      {btn.sub}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Handset Brand Footer */}
            <div className="text-center">
              <span className="text-[10px] font-mono tracking-widest text-slate-500 font-bold uppercase">
                Ɔkwankyerɛfo Pa Handset
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            COLUMN 2: MULTI-TAB STUDIO PANE (All Features Testable Here)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col h-[740px]">
          {/* Top Scenario Runner & Tab Switcher Bar */}
          <div className="pb-3 border-b border-slate-100 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              {/* Tab Selector */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-[11px] font-semibold overflow-x-auto no-scrollbar gap-0.5">
                <button
                  onClick={() => setActiveCenterTab("transcript")}
                  className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap ${
                    activeCenterTab === "transcript"
                      ? "bg-white text-slate-900 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Transcript
                </button>
                <button
                  onClick={() => setActiveCenterTab("momo_ledger")}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    activeCenterTab === "momo_ledger"
                      ? "bg-white text-emerald-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ReceiptText className="w-3 h-3 text-emerald-600" />
                  <span>MoMo &amp; Ledger</span>
                </button>
                <button
                  onClick={() => setActiveCenterTab("asr_speech")}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    activeCenterTab === "asr_speech"
                      ? "bg-white text-emerald-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Mic2 className="w-3 h-3 text-emerald-600" />
                  <span>ASR Lab</span>
                </button>
                <button
                  onClick={() => setActiveCenterTab("tts_audio")}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    activeCenterTab === "tts_audio"
                      ? "bg-white text-emerald-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileAudio className="w-3 h-3 text-emerald-600" />
                  <span>TTS &amp; Clips</span>
                </button>
                <button
                  onClick={() => setActiveCenterTab("zeropin_security")}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    activeCenterTab === "zeropin_security"
                      ? "bg-white text-rose-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ShieldCheck className="w-3 h-3 text-rose-600" />
                  <span>Zero-PIN</span>
                </button>
                <button
                  onClick={() => setActiveCenterTab("voicexml_ivr")}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    activeCenterTab === "voicexml_ivr"
                      ? "bg-white text-emerald-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <PhoneCall className="w-3 h-3 text-emerald-600" />
                  <span>VoiceXML</span>
                </button>
                <button
                  onClick={() => setActiveCenterTab("kyc_contacts")}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    activeCenterTab === "kyc_contacts"
                      ? "bg-white text-emerald-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Users className="w-3 h-3 text-emerald-600" />
                  <span>KYC</span>
                </button>
                <button
                  onClick={() => setActiveCenterTab("shipping_escrow")}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    activeCenterTab === "shipping_escrow"
                      ? "bg-white text-blue-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Truck className="w-3 h-3 text-blue-600" />
                  <span>Escrow</span>
                </button>
                <button
                  onClick={() => setActiveCenterTab("test_suite")}
                  className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 whitespace-nowrap ${
                    activeCenterTab === "test_suite"
                      ? "bg-white text-emerald-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileCheck className="w-3 h-3 text-emerald-600" />
                  <span>Test Suites</span>
                </button>
              </div>

              <button
                onClick={() => sim.runScenario(selectedScenarioId)}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs transition-colors shrink-0"
              >
                <Play className="w-3 h-3 fill-white" />
                <span>Run Scenario</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {PRESET_SCENARIOS.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.title} {sc.executionMode === "MTN_SANDBOX" ? "🔴 (Sandbox)" : ""}
                  </option>
                ))}
              </select>

              <button
                onClick={() => sim.startCall("tw")}
                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-colors"
                title="Start in Twi"
              >
                Twi
              </button>
              <button
                onClick={() => sim.startCall("en")}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors"
                title="Start in English"
              >
                English
              </button>
            </div>
          </div>

          {/* TAB 1: Live Call Transcript */}
          {activeCenterTab === "transcript" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1" aria-label="Call conversation transcript">
              {sim.transcript.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <Smartphone className="w-10 h-10 stroke-1 text-slate-300 mb-2" />
                  <p className="text-xs font-medium text-slate-600">No active call conversation</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                    Press Call (Green), use the 1-Click Feature Testing Dock above, or type an utterance below to start.
                  </p>
                </div>
              ) : (
                sim.transcript.map((item) => {
                  if (item.role === "system") {
                    return (
                      <div key={item.id} className="text-center my-2">
                        <span className="inline-block px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-mono border border-slate-200 font-medium">
                          {item.text}
                        </span>
                      </div>
                    );
                  }

                  const isAi = item.role === "ai";
                  return (
                    <div
                      key={item.id}
                      className={`flex items-start gap-2.5 ${isAi ? "justify-start" : "justify-end"}`}
                    >
                      {isAi && (
                        <div className="w-7 h-7 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                          🤖
                        </div>
                      )}
                      <div
                        className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed shadow-2xs ${
                          isAi
                            ? "bg-slate-50 border border-slate-200 text-slate-800"
                            : "bg-emerald-700 text-white font-medium"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className={`font-bold text-[10px] uppercase ${isAi ? "text-emerald-800" : "text-emerald-100"}`}>
                            {isAi ? "Ɔkwankyerɛfo Pa" : "Caller"}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {item.stage && (
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.2 rounded ${
                                  isAi
                                    ? "bg-slate-200/70 text-slate-600"
                                    : "bg-emerald-800/80 text-emerald-100"
                                }`}
                              >
                                {item.stage}
                              </span>
                            )}
                            {isAi && (
                              <button
                                onClick={() => sim.playStudioClip(item.text)}
                                className="text-slate-400 hover:text-emerald-700 p-0.5"
                                title="Replay AI speech utterance"
                              >
                                <PlayCircle className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="whitespace-pre-wrap">{item.text}</p>
                      </div>
                      {!isAi && (
                        <div className="w-7 h-7 rounded-xl bg-amber-500 text-slate-900 flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                          👤
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: MoMo & Ledger Synchronization */}
          {activeCenterTab === "momo_ledger" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <ReceiptText className="w-4 h-4 text-emerald-700" />
                    <span>Live Idempotent Ledger Synchronization</span>
                  </span>
                  <Link
                    to="/dashboard/ledger"
                    className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-0.5"
                  >
                    <span>Full Ledger ({sim.syncState.ledgerTotal})</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                  <div className="bg-white p-2 rounded border border-emerald-200">
                    <span className="text-slate-500 block text-[10px]">Business Float:</span>
                    <span className="font-bold text-emerald-800">
                      {sim.syncState.floatBalance === null ? "Unavailable" : `GH₵ ${sim.syncState.floatBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </span>
                  </div>
                  <div className="bg-white p-2 rounded border border-emerald-200">
                    <span className="text-slate-500 block text-[10px]">Target Env:</span>
                    <span className="font-bold text-slate-800 uppercase">{sim.syncState.targetEnv}</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-emerald-200">
                    <span className="text-slate-500 block text-[10px]">Disbursements:</span>
                    <span className="font-bold text-slate-800">{sim.syncState.disbursementsCount} tx</span>
                  </div>
                  <div className="bg-white p-2 rounded border border-emerald-200">
                    <span className="text-slate-500 block text-[10px]">Airtime / Top-up:</span>
                    <span className="font-bold text-slate-800">{sim.syncState.airtimeCount} tx</span>
                  </div>
                </div>
              </div>

              {sim.providerResult ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 font-mono">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-800">MOST RECENT TRANSACTION RECEIPT</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {sim.providerResult?.data?.status || "SUCCESSFUL"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-500 block">Amount:</span>
                      <span className="font-bold text-slate-900 text-sm">
                        GH₵ {sim.entities.amount || "20.00"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Recipient:</span>
                      <span className="font-bold text-slate-900">
                        {sim.entities.recipientPhone || "0553838464"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Reference ID:</span>
                      <span className="text-slate-700 text-[10px] truncate block">
                        {sim.providerResult?.data?.referenceId || sim.sessionId}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Financial Tx ID:</span>
                      <span className="text-emerald-700 font-bold text-[10px] truncate block">
                        {sim.providerResult?.data?.financialTransactionId || "FIN-CONFIRMED"}
                      </span>
                    </div>
                  </div>

                  <div className="p-2 bg-white rounded border border-slate-200 text-[10px] text-slate-600">
                    <div>Execution Mode: {sim.executionMode}</div>
                    <div>Central Ledger Total: {sim.syncState.ledgerTotal} transactions</div>
                    <div>Call Sessions Total: {sim.syncState.callLogsTotal} calls</div>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-2">
                  <ReceiptText className="w-8 h-8 stroke-1 mx-auto text-slate-400" />
                  <div className="font-bold text-slate-800 text-xs">No transaction executed in this active call yet</div>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Try sending money, buying airtime, or paying delivery escrow to see real-time ledger entries created here and in the Ledger page.
                  </p>
                  <div className="pt-2 flex justify-center gap-2">
                    <button
                      onClick={() => sim.simulateAirtimePurchase(10)}
                      className="px-3 py-1 bg-emerald-700 text-white rounded-lg text-[11px] font-bold"
                    >
                      Test 10 GHS Airtime
                    </button>
                    <button
                      onClick={() => sim.simulateEscrowPayment("#1042", 15)}
                      className="px-3 py-1 bg-blue-700 text-white rounded-lg text-[11px] font-bold"
                    >
                      Test 15 GHS Escrow
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ASR Speech Lab Synchronization */}
          {activeCenterTab === "asr_speech" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="p-3.5 bg-slate-900 text-amber-300 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Mic2 className="w-4 h-4 text-emerald-400" />
                    <span>Ghana Speech-To-Text (ASR) Integration</span>
                  </div>
                  <Link
                    to="/dashboard/asr"
                    className="text-[11px] font-bold text-emerald-400 hover:underline flex items-center gap-0.5"
                  >
                    <span>Open ASR Lab →</span>
                  </Link>
                </div>
                <p className="text-[11px] text-slate-300">
                  Dual-channel acoustic processing with Ghanaian English and Akan Twi language identification and phonetic number decoding.
                </p>
              </div>

              {/* Live Microphone Test Box */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Live Microphone Ingestion</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    sim.isMicActive ? "bg-amber-100 text-amber-800 animate-pulse" : "bg-slate-200 text-slate-700"
                  }`}>
                    {sim.isMicActive ? "MICROPHONE ACTIVE" : "IDLE"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Speak into your microphone in Ghanaian English or Akan Twi to test real-time ASR audio capture.
                </p>
                <button
                  onClick={sim.toggleMic}
                  className={`w-full py-2 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition-all ${
                    sim.isMicActive
                      ? "bg-amber-500 hover:bg-amber-600 text-slate-950"
                      : "bg-emerald-700 hover:bg-emerald-600 text-white"
                  }`}
                >
                  {sim.isMicActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{sim.isMicActive ? "Stop Recording & Transcribe" : "Start Live Voice Recording"}</span>
                </button>
              </div>

              {/* Sample ASR Utterances */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                  Click to Ingest Pre-Calibrated Ghanaian Audio Utterances:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => sim.simulateAsrSample("I want to send twenty cedis to Kwame on 0553838464", "en")}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50 text-left space-y-1 transition-all"
                  >
                    <div className="text-[10px] font-bold text-emerald-800">🇬🇧 Ghanaian English ASR</div>
                    <div className="text-[11px] text-slate-800 italic">"I want to send twenty cedis to Kwame on 0553838464"</div>
                  </button>

                  <button
                    onClick={() => sim.simulateAsrSample("Mepa wo kyɛw mane sika aduonu kɔma Kwame Nyamebere", "tw")}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50 text-left space-y-1 transition-all"
                  >
                    <div className="text-[10px] font-bold text-amber-800">🇬🇭 Akan Twi ASR</div>
                    <div className="text-[11px] text-slate-800 italic">"Mepa wo kyɛw mane sika aduonu kɔma Kwame Nyamebere"</div>
                  </button>

                  <button
                    onClick={() => sim.simulateAsrSample("Send fifty to 0241112233... no make it 0553838464 instead", "en")}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50 text-left space-y-1 transition-all"
                  >
                    <div className="text-[10px] font-bold text-blue-800">🔄 Number Correction ASR</div>
                    <div className="text-[11px] text-slate-800 italic">"Send fifty to 0241112233... no make it 0553838464"</div>
                  </button>

                  <button
                    onClick={() => sim.simulateAsrSample("Send twenty cedis with secret PIN 4921", "en")}
                    className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-left space-y-1 transition-all"
                  >
                    <div className="text-[10px] font-bold text-rose-800">🚨 Spoken PIN Security Filter</div>
                    <div className="text-[11px] text-rose-900 italic">"Send twenty cedis with secret PIN 4921"</div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TTS & Audio Library (Audition Studio Prompts & Neural Speech) */}
          {activeCenterTab === "tts_audio" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <FileAudio className="w-4 h-4 text-emerald-700" />
                    <span>Studio Audio Prompts &amp; Neural Speech Synthesizer</span>
                  </div>
                  <Link
                    to="/dashboard/audio"
                    className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-0.5"
                  >
                    <span>Full Audio Library (26) →</span>
                  </Link>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Click any studio clip to listen to it directly on the phone simulator handset speaker.
                </p>
              </div>

              {/* Filter Bar */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Catalog Language:
                </span>
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px] font-semibold">
                  <button
                    onClick={() => setAudioCategoryFilter("all")}
                    className={`px-2 py-0.5 rounded ${audioCategoryFilter === "all" ? "bg-white text-slate-900 font-bold shadow-2xs" : "text-slate-600"}`}
                  >
                    All ({AUDIO_CATALOG.length})
                  </button>
                  <button
                    onClick={() => setAudioCategoryFilter("en")}
                    className={`px-2 py-0.5 rounded ${audioCategoryFilter === "en" ? "bg-white text-slate-900 font-bold shadow-2xs" : "text-slate-600"}`}
                  >
                    English (13)
                  </button>
                  <button
                    onClick={() => setAudioCategoryFilter("twi")}
                    className={`px-2 py-0.5 rounded ${audioCategoryFilter === "twi" ? "bg-white text-slate-900 font-bold shadow-2xs" : "text-slate-600"}`}
                  >
                    Akan Twi (13)
                  </button>
                </div>
              </div>

              {/* Audio Prompt Grid */}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                {filteredAudioCatalog.map((prompt) => (
                  <div
                    key={prompt.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-700 font-bold">
                          {prompt.id}
                        </span>
                        <span className="font-bold text-slate-800 text-[11px] truncate">{prompt.title}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-1 italic">
                        "{prompt.spokenText}"
                      </p>
                    </div>

                    <button
                      onClick={() => sim.playStudioClip(prompt.filename)}
                      className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 shadow-2xs"
                    >
                      <Play className="w-2.5 h-2.5 fill-white" />
                      <span>Audition</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Neural TTS Custom Synthesis Sandbox */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 text-[11px] block">
                  Test Neural Voice Synthesis with Custom Text:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customTtsText}
                    onChange={(e) => setCustomTtsText(e.target.value)}
                    placeholder="Enter custom phrase..."
                    className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => {
                      if (!customTtsText.trim()) return;
                      sim.playStudioClip(customTtsText.trim());
                    }}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shrink-0"
                  >
                    Synthesize
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Zero-PIN Security & Risk Guard */}
          {activeCenterTab === "zeropin_security" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-rose-950 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-rose-700" />
                    <span>Zero-PIN Voice Security Boundary</span>
                  </div>
                  <Link
                    to="/dashboard/transaction"
                    className="text-[11px] font-bold text-rose-800 hover:underline flex items-center gap-0.5"
                  >
                    <span>Security Lab →</span>
                  </Link>
                </div>
                <p className="text-[11px] text-rose-800">
                  Architectural rule: Callers must NEVER speak their secret PIN over voice calls. PIN entry is strictly restricted to the subscriber's private telecom USSD prompt.
                </p>
              </div>

              {/* Security Test Actions */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <span className="font-bold text-slate-800 block text-xs">Simulate Spoken PIN Attack / Leak:</span>
                <p className="text-[11px] text-slate-500">
                  Send a simulated voice turn containing a secret 4-digit PIN to verify instant redaction and safety warnings:
                </p>
                <button
                  onClick={() => sim.simulateSpokenPinViolation()}
                  className="px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                >
                  <ShieldAlert className="w-4 h-4" />
                  <span>Execute Spoken PIN Interception Test</span>
                </button>
              </div>

              {/* Security Invariants Checklist */}
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200">
                  <span>Zero-PIN Voice Redaction</span>
                  <span className="font-bold">ACTIVE ✓</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200">
                  <span>Mid-Call Re-confirmation Guard</span>
                  <span className="font-bold">ENFORCED ✓</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200">
                  <span>Ghana Velocity Limits (Tier 1/2/3)</span>
                  <span className="font-bold">ACTIVE ✓</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200">
                  <span>Cryptographic Idempotency Store</span>
                  <span className="font-bold">ACTIVE ✓</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: VoiceXML & Africa's Talking Telephony */}
          {activeCenterTab === "voicexml_ivr" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between p-3 bg-slate-900 text-amber-300 rounded-xl border border-slate-800">
                <div>
                  <div className="font-bold text-xs text-white">Live Africa's Talking VoiceXML</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Production XML responses generated by the simulator and logged to Call Logs.
                  </div>
                </div>
                <Link
                  to="/dashboard/ivr"
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold shadow-xs transition-colors"
                >
                  Open in IVR Lab →
                </Link>
              </div>

              {sim.voiceXmlTraces.length === 0 ? (
                <div className="py-12 text-center text-slate-400 font-sans text-xs">
                  Start a call or send a turn to see real-time Africa's Talking VoiceXML output.
                </div>
              ) : (
                sim.voiceXmlTraces.map((trace, idx) => (
                  <div key={idx} className="bg-slate-950 text-emerald-400 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-800 pb-1.5">
                      <span className="font-bold text-amber-400 uppercase">
                        STEP: {trace.step}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px]">{trace.timestamp}</span>
                        <button
                          onClick={() => copyVoiceXml(trace.xml)}
                          className="p-1 hover:text-white rounded"
                          title="Copy VoiceXML"
                        >
                          {copiedXml ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    </div>
                    <pre className="whitespace-pre-wrap text-[11px] leading-relaxed overflow-x-auto text-emerald-300">
                      {trace.xml}
                    </pre>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 7: KYC Directory Contacts */}
          {activeCenterTab === "kyc_contacts" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-emerald-700" />
                    <span>Verified Mobile Subscribers Directory</span>
                  </div>
                  <Link
                    to="/dashboard/kyc"
                    className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-0.5"
                  >
                    <span>Manage in KYC Lab →</span>
                  </Link>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Click any subscriber below to immediately start a test transfer to their phone number.
                </p>
              </div>

              <div className="space-y-2">
                {sim.contacts.map((contact) => (
                  <div
                    key={contact.phone}
                    className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-bold text-slate-900 text-xs">{contact.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold">
                          {contact.network}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {contact.phone} · {contact.tier || "Tier 2"} (Max GH₵ 5,000/day)
                      </div>
                    </div>

                    <button
                      onClick={() => sim.sendContactTransfer(contact, 20)}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold shrink-0 shadow-2xs"
                    >
                      Send 20 GHS
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: Shipping & Delivery Escrow */}
          {activeCenterTab === "shipping_escrow" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-blue-950 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-blue-700" />
                    <span>MoMo Shipping &amp; Delivery Escrow</span>
                  </div>
                  <Link
                    to="/dashboard/shipping"
                    className="text-[11px] font-bold text-blue-800 hover:underline flex items-center gap-0.5"
                  >
                    <span>Shipping Page →</span>
                  </Link>
                </div>
                <p className="text-[11px] text-blue-800">
                  Test dispatch rider deliveries with funds held securely in escrow until goods arrival confirmation.
                </p>
              </div>

              <div className="space-y-2">
                <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Order #1042: Accra Central Market to Cantonments</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                      RIDER DISPATCHED
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    Rider: Kofi Mensah (0553838464) · Fee: GH₵ 15.00
                  </div>
                  <button
                    onClick={() => sim.simulateEscrowPayment("#1042", 15)}
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-bold"
                  >
                    Authorize 15 GHS Escrow Release
                  </button>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">Order #1043: Kumasi Kejetia to KNUST Campus</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      DELIVERED
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    Rider: Yaw Osei (0271234567) · Fee: GH₵ 25.00
                  </div>
                  <button
                    onClick={() => sim.simulateEscrowPayment("#1043", 25)}
                    className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-bold"
                  >
                    Authorize 25 GHS Escrow Release
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: Automated Test Suites */}
          {activeCenterTab === "test_suite" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-700" />
                    <span>Automated Verification Suites</span>
                  </div>
                  <Link
                    to="/dashboard/tests"
                    className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-0.5"
                  >
                    <span>All Tests ({sim.syncState.testsTotal}) →</span>
                  </Link>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Run scenario evaluation directly against the live backend to verify cognitive accuracy and PIN invariants.
                </p>
              </div>

              <div className="space-y-1.5">
                {PRESET_SCENARIOS.map((sc) => (
                  <div
                    key={sc.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <div className="font-bold text-slate-800 text-[11px] truncate">{sc.title}</div>
                      <div className="text-[10px] text-slate-500 truncate">{sc.description}</div>
                    </div>
                    <button
                      onClick={() => sim.runScenario(sc.id)}
                      className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[10px] font-bold shrink-0"
                    >
                      Run Test
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Turn Input Form */}
          <form
            onSubmit={handleTextSubmit}
            className="pt-3 border-t border-slate-100 flex items-center gap-2"
          >
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder={sim.isActive ? "Type caller utterance (English or Twi)..." : "Type to start call..."}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={sim.isLoading || !typedInput.trim()}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition-colors shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            COLUMN 3: AI INSPECTOR (Structured Decision & Security View)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-3 space-y-4">
          {/* Card 1: AI Result & Entity Extraction */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                <span>AI Cognitive State</span>
              </span>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                Turn {sim.lastTurnDiagnostic?.turnNumber || 0}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Detected Intent</span>
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {sim.intent}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Confidence Score</span>
                <span className="font-mono font-bold text-emerald-700">
                  {sim.confidence === null ? "Unavailable" : `${(sim.confidence * 100).toFixed(1)}%`}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-50">
                <span className="text-slate-500">Language</span>
                <span className="font-mono font-semibold uppercase text-slate-800">
                  {sim.language} ({sim.language === "tw" ? "Akan/Twi" : sim.language === "en-ak" ? "Code-Switch" : "English"})
                </span>
              </div>

              {/* Slots Box */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-1.5 mt-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Extracted Slots:
                </span>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Amount:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {sim.entities.amount ? `GHS ${Number(sim.entities.amount).toFixed(2)}` : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Recipient Phone:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {maskPhone(sim.entities.recipientPhone)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Recipient Name:</span>
                  <span className="font-bold text-slate-900">
                    {sim.entities.recipientName || "—"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Network:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {sim.entities.network || "MTN"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: 11-Stage Authoritative Pipeline Indicator */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Pipeline Execution Trace
              </span>
              <span className="text-[10px] font-mono text-slate-400">11 STAGES</span>
            </div>

            <div className="space-y-1.5" role="list">
              {pipelineStagesList.map((stage) => {
                const val = (sim.pipelineStages as any)[stage.key];
                const isPassed = val === true;
                const isFailed = val === false;
                const isNeutral = val === null;

                return (
                  <div
                    key={stage.key}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50/70 border border-slate-100"
                  >
                    <span className="text-slate-600 text-[11px]">{stage.label}</span>
                    {isPassed && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>PASS</span>
                      </span>
                    )}
                    {isFailed && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600">
                        <XCircle className="w-3.5 h-3.5 text-rose-500" />
                        <span>FAIL</span>
                      </span>
                    )}
                    {isNeutral && (
                      <span className="text-[10px] font-mono text-slate-400">○ IDLE</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 3: "What Changed?" Diagnostics */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                <span>Turn Diagnostics</span>
              </span>
              <span className="text-[10px] font-bold text-slate-500">WHAT CHANGED?</span>
            </div>

            {sim.lastTurnDiagnostic && sim.lastTurnDiagnostic.changedFields.length > 0 ? (
              <div className="space-y-2 text-xs">
                <div className="text-[11px] text-slate-600 bg-amber-50/70 border border-amber-200/80 p-2 rounded-lg">
                  <div className="font-semibold text-amber-900">
                    Correction / Update Detected:
                  </div>
                  {sim.lastTurnDiagnostic.changedFields.map((ch, idx) => (
                    <div key={idx} className="font-mono text-[11px] text-amber-800 mt-0.5">
                      {ch.field}: {String(ch.oldVal || "unset")} → <span className="font-bold">{String(ch.newVal)}</span>
                    </div>
                  ))}
                </div>

                {sim.lastTurnDiagnostic.confirmationInvalidated && (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Prior confirmation invalidated. Safe re-prompt enforced.</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic py-2">
                No mid-call parameter corrections on last turn.
              </p>
            )}
          </div>

          {/* Card 4: AI Accuracy Test Result (When Running Scenarios) */}
          {sim.accuracyResult && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  AI Accuracy Test Mode
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                    sim.accuracyResult.isPass
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-rose-100 text-rose-800 border border-rose-300"
                  }`}
                >
                  {sim.accuracyResult.isPass ? "PASS ✓" : "FAIL ✕"}
                </span>
              </div>

              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Expected Intent:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {sim.accuracyResult.expectedIntent || "ANY"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Actual Intent:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {sim.accuracyResult.actualIntent}
                  </span>
                </div>
                {sim.accuracyResult.expectedAmount && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expected Amount:</span>
                    <span className="font-mono font-bold text-slate-800">
                      GHS {sim.accuracyResult.expectedAmount}
                    </span>
                  </div>
                )}
                {sim.accuracyResult.actualAmount && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Actual Amount:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      GHS {sim.accuracyResult.actualAmount}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
