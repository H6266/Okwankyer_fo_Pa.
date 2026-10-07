import React, { useState, useEffect, useRef } from "react";
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
  UploadCloud,
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
  Maximize2,
  Minimize2,
  Activity,
  Cpu,
  TrendingUp,
  Gauge,
  Compass,
  ChevronDown,
  ChevronUp,
  Sliders,
  Wand2,
  Info,
  RadioTower,
  MessageSquare,
  Binary,
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
  const audioFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      sim.uploadAudioForAsr(file);
      e.target.value = "";
    }
  };
  const [phoneScale, setPhoneScale] = useState<"compact" | "large" | "cinematic">("large");
  const [phoneScreenTab, setPhoneScreenTab] = useState<"call_view" | "ai_brain" | "advancement">("call_view");
  const [showKeypad, setShowKeypad] = useState<boolean>(true);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("send_money_en");
  const [selectedAtScenarioId, setSelectedAtScenarioId] = useState<string>("at_send_money_en");
  const [typedInput, setTypedInput] = useState<string>("");
  const [inScreenSpeechText, setInScreenSpeechText] = useState<string>("");
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

      {/* ── Main 3-Column Studio Grid (Dynamically Responsive to Phone Viewport Scale) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ══════════════════════════════════════════════════════════════════
            COLUMN 1: EXPANDED PRO PHONE SCREEN & HANDSET (Interactive UI/AI HUD)
        ══════════════════════════════════════════════════════════════════ */}
        <div className={`${phoneScale === "cinematic" ? "lg:col-span-6" : phoneScale === "large" ? "lg:col-span-5" : "lg:col-span-4"} flex flex-col items-center transition-all duration-300`}>
          
          {/* Top Handset Controls Bar: Scale Toggle & Keypad Visibility */}
          <div className="w-full flex items-center justify-between pb-2.5 px-2 text-xs">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase px-1">Display:</span>
              <button
                onClick={() => setPhoneScale("compact")}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                  phoneScale === "compact"
                    ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="Compact 360px handset view"
              >
                Compact
              </button>
              <button
                onClick={() => setPhoneScale("large")}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                  phoneScale === "large"
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="Large 460px expanded handset screen (Recommended)"
              >
                Large (460px)
              </button>
              <button
                onClick={() => setPhoneScale("cinematic")}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
                  phoneScale === "cinematic"
                    ? "bg-slate-900 text-amber-300 shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="Cinematic 540px expansive widescreen handset view"
              >
                <Maximize2 className="w-2.5 h-2.5" />
                <span>Cinematic</span>
              </button>
            </div>

            {/* Keypad Visibility Toggle */}
            <button
              onClick={() => setShowKeypad(!showKeypad)}
              className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 text-[10px] font-bold flex items-center gap-1 shadow-2xs transition-colors"
              title={showKeypad ? "Hide keypad to expand screen size" : "Show keypad for DTMF dialing"}
            >
              <Binary className="w-3 h-3 text-emerald-600" />
              <span>{showKeypad ? "Hide Keypad" : "Show Keypad"}</span>
            </button>
          </div>

          {/* Physical Phone Handset Casing (Enlarged Pro Viewport) */}
          <div className={`w-full ${phoneScale === "cinematic" ? "max-w-[560px]" : phoneScale === "large" ? "max-w-[480px]" : "max-w-[360px]"} bg-slate-950 p-4 sm:p-5 rounded-[46px] border-[7px] border-slate-800 shadow-2xl space-y-3.5 transition-all duration-300 relative`}>
            
            {/* Top Speaker Notch & Camera Pin */}
            <div className="flex items-center justify-center gap-2 pt-0.5">
              <div className="w-3 h-3 rounded-full bg-slate-900 border border-slate-700/80" />
              <div className="w-20 h-2.5 bg-slate-800 rounded-full shadow-inner" />
            </div>

            {/* Handset OLED Display Screen (Enlarged with High Viewport Clarity) */}
            <div className={`relative bg-gradient-to-b from-slate-950 via-slate-900 to-black rounded-3xl p-3.5 sm:p-4 border border-slate-800/90 ${showKeypad ? "h-[540px] min-h-[540px]" : "h-[680px] min-h-[680px]"} flex flex-col justify-between text-slate-100 shadow-2xl overflow-hidden transition-all duration-300`}>
              
              {/* ── 1. Top Dynamic Island & Status Bar ─────────────────────────── */}
              <div className="flex items-center justify-between text-[11px] font-mono pb-2 border-b border-slate-800/80 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      sim.isActive ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                    }`}
                  />
                  <span className="font-bold tracking-tight text-emerald-400">
                    {sim.gatewayMode === "AFRICASTALKING_IVR"
                      ? "AT TRUNK · +233 30 804 8098"
                      : sim.entities.network ? `${sim.entities.network} 4G` : "MTN 4G"}
                  </span>
                  <span className="hidden sm:inline text-slate-500 font-mono text-[10px]">●●●●</span>
                </div>

                {/* Call Timer / Standby & Codec */}
                <div className="flex items-center gap-2">
                  {sim.isActive ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{formatTimer(sim.callDurationSec)}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400 font-bold text-[10px]">STANDBY</span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[9px] font-mono font-bold">
                    {sim.language.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* ── 2. In-Screen Interactive Mode Switcher ─────────────────────── */}
              <div className="pt-2 pb-1 shrink-0">
                <div className="grid grid-cols-3 gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
                  <button
                    onClick={() => setPhoneScreenTab("call_view")}
                    className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                      phoneScreenTab === "call_view"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>Live Call</span>
                  </button>
                  <button
                    onClick={() => setPhoneScreenTab("ai_brain")}
                    className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                      phoneScreenTab === "ai_brain"
                        ? "bg-amber-600 text-white shadow-xs"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Cpu className="w-3 h-3" />
                    <span>AI Brain</span>
                  </button>
                  <button
                    onClick={() => setPhoneScreenTab("advancement")}
                    className={`py-1.5 rounded-lg transition-all flex items-center justify-center gap-1 ${
                      phoneScreenTab === "advancement"
                        ? "bg-purple-600 text-white shadow-xs"
                        : "text-slate-400 hover:text-white"
                    }`}
                    title="Inspect which portion of the system needs advancement and improvement"
                  >
                    <TrendingUp className="w-3 h-3" />
                    <span>Radar</span>
                  </button>
                </div>
              </div>

              {/* ── 3. Real-Time Telemetry Banners (Transcribing / Processing) ─── */}
              <div className="space-y-1.5 py-1 shrink-0">
                {/* A. Live Speech-in-Progress / ASR Stream with Animated Sound Wave Visualizer */}
                {(sim.isMicActive || sim.interimTranscript || sim.transcriptionStatus === "LISTENING") && (
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-950/95 via-slate-900/95 to-amber-950/95 border-2 border-amber-500/80 text-amber-200 text-xs shadow-xl animate-pulse space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
                          <Mic className="w-3.5 h-3.5 animate-bounce" />
                        </div>
                        <div>
                          <div className="text-[10px] font-mono text-amber-400 font-bold uppercase tracking-wider">
                            🎙️ ASR Live Speech Ingest
                          </div>
                          <div className="text-[9px] text-amber-300/80">Ghanaian English &amp; Akan Twi</div>
                        </div>
                      </div>

                      {/* Animated Sound Wave Equalizer Bars */}
                      <div className="flex items-center gap-1 px-2 py-1 bg-amber-950/60 rounded-lg border border-amber-600/30">
                        <div
                          className="w-1 bg-amber-400 rounded-full transition-all duration-75"
                          style={{ height: `${Math.max(6, Math.min(22, (sim.audioLevel || 20) * 0.25))}px` }}
                        />
                        <div
                          className="w-1 bg-amber-300 rounded-full transition-all duration-75"
                          style={{ height: `${Math.max(8, Math.min(26, (sim.audioLevel || 35) * 0.35))}px` }}
                        />
                        <div
                          className="w-1 bg-amber-400 rounded-full transition-all duration-75"
                          style={{ height: `${Math.max(10, Math.min(28, (sim.audioLevel || 50) * 0.4))}px` }}
                        />
                        <div
                          className="w-1 bg-amber-300 rounded-full transition-all duration-75"
                          style={{ height: `${Math.max(8, Math.min(24, (sim.audioLevel || 30) * 0.3))}px` }}
                        />
                        <div
                          className="w-1 bg-amber-400 rounded-full transition-all duration-75"
                          style={{ height: `${Math.max(6, Math.min(20, (sim.audioLevel || 15) * 0.2))}px` }}
                        />
                      </div>
                    </div>

                    {/* Transcribed Speech In Progress */}
                    <div className="bg-black/60 rounded-xl p-2 border border-amber-500/30 text-[11px] font-medium text-amber-100 flex items-center justify-between gap-2">
                      <div className="truncate flex-1">
                        {sim.interimTranscript ? (
                          <span className="font-semibold text-white">"{sim.interimTranscript}"</span>
                        ) : (
                          <span className="text-amber-300/80 italic">Listening... Speak now into your microphone</span>
                        )}
                      </div>
                      <button
                        onClick={sim.toggleMic}
                        className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-[10px] font-extrabold shadow-xs transition-colors shrink-0"
                      >
                        Stop &amp; Submit
                      </button>
                    </div>
                  </div>
                )}

                {/* B. Live AI Is Processing Multi-Stage Pipeline Holographic Indicator */}
                {(sim.isLoading || sim.transcriptionStatus === "PROCESSING") && (
                  <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-950/95 via-slate-900/95 to-emerald-950/95 border-2 border-emerald-500/80 text-emerald-200 text-xs shadow-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-emerald-500/30 text-emerald-300 flex items-center justify-center border border-emerald-400/50">
                          <Sparkles className="w-3.5 h-3.5 animate-spin" />
                        </div>
                        <div>
                          <div className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                            ⚡ AI Cognitive Engine Active
                          </div>
                          <div className="text-[9px] text-emerald-300/80">Ghanaian MoMo Orchestrator</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-900/80 text-emerald-300 text-[9px] font-mono font-bold animate-pulse">
                        PROCESSING
                      </span>
                    </div>

                    {/* Behind the System Multi-Stage Progress */}
                    <div className="grid grid-cols-4 gap-1 text-[8px] font-mono font-bold text-center">
                      <div className="p-1 rounded bg-emerald-900/40 border border-emerald-700/50 text-emerald-300">
                        1. ASR Ingest
                      </div>
                      <div className="p-1 rounded bg-emerald-900/40 border border-emerald-700/50 text-emerald-300">
                        2. NLU Intent
                      </div>
                      <div className="p-1 rounded bg-emerald-900/40 border border-emerald-700/50 text-emerald-300">
                        3. Zero-PIN
                      </div>
                      <div className="p-1 rounded bg-amber-900/40 border border-amber-700/50 text-amber-300 animate-pulse">
                        4. Response
                      </div>
                    </div>

                    <div className="text-[10px] font-semibold text-white/90 truncate bg-black/40 px-2 py-1 rounded-lg border border-emerald-500/20">
                      {sim.aiProcessingDetail || "Reasoning through Ghanaian cognitive layer & checking Zero-PIN security..."}
                    </div>
                  </div>
                )}

                {/* C. Clear Microphone Error / Fallback Guidance Notice */}
                {sim.transcriptionStatus === "ERROR" && (
                  <div className="p-2.5 rounded-2xl bg-amber-950/95 border border-amber-500/80 text-amber-200 text-xs shadow-md space-y-2 animate-fadeIn">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-bold text-amber-300 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Microphone Access Notice (Preview iFrame)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={sim.toggleMic}
                          className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 text-[10px] font-bold transition-colors"
                        >
                          Retry Mic
                        </button>
                        <button
                          onClick={() => audioFileInputRef.current?.click()}
                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition-colors flex items-center gap-1"
                        >
                          <FileAudio className="w-3 h-3" />
                          <span>Upload Audio</span>
                        </button>
                        <button
                          onClick={() => sim.setTranscriptionStatus("IDLE")}
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition-colors"
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-amber-200/90 leading-tight">
                      Browser blocked mic access in preview iframe. Tap any Ghanaian voice chip below or type in the speech bar to test speech & AI understanding!
                    </p>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      <button
                        onClick={() => sim.simulateAsrSample("1", "en")}
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 rounded text-[9px] font-bold border border-emerald-700/50"
                        title="Say or send Option 1 (English / MoMo / Yes)"
                      >
                        🎙️ Option 1
                      </button>
                      <button
                        onClick={() => sim.simulateAsrSample("2", "tw")}
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-amber-300 rounded text-[9px] font-bold border border-amber-700/50"
                        title="Say or send Option 2 (Twi / Banking / Cancel)"
                      >
                        🎙️ Option 2
                      </button>
                      <button
                        onClick={() => sim.simulateAsrSample("Send 20 cedis to 0553838464", "en")}
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-emerald-300 rounded text-[9px] font-bold border border-emerald-700/50"
                      >
                        🎙️ Send 20 Cedis (EN)
                      </button>
                      <button
                        onClick={() => sim.simulateAsrSample("Mepa wo kyɛw, mane sika aduonu kɔma Ama wɔ 0553838464", "tw")}
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-amber-300 rounded text-[9px] font-bold border border-amber-700/50"
                      >
                        🎙️ Mane Sika (Twi)
                      </button>
                      <button
                        onClick={() => sim.simulateAsrSample("Check my mobile money wallet balance", "en")}
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-cyan-300 rounded text-[9px] font-bold border border-cyan-700/50"
                      >
                        🎙️ Check Balance
                      </button>
                      <button
                        onClick={() => sim.simulateAsrSample("Buy 5 cedis airtime for my phone", "en")}
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-indigo-300 rounded text-[9px] font-bold border border-indigo-700/50"
                      >
                        🎙️ Buy Airtime
                      </button>
                      <button
                        onClick={() => sim.simulateAsrSample("Aane, pene so", "tw")}
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-emerald-400 rounded text-[9px] font-bold border border-emerald-700/50"
                      >
                        🎙️ Aane (Confirm)
                      </button>
                      <button
                        onClick={() => sim.simulateAsrSample("Dabi, gyae mu", "tw")}
                        className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-rose-300 rounded text-[9px] font-bold border border-rose-700/50"
                      >
                        🎙️ Dabi (Cancel)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 4. Main Body: Mode-Specific Display ────────────────────────── */}
              
              {/* VIEW 1: LIVE CALL & FULL TRANSCRIBED INTERACTION FEED */}
              {phoneScreenTab === "call_view" && (
                <div className="flex-1 overflow-y-auto space-y-2.5 my-1 pr-1 text-xs select-text scroll-smooth" aria-label="Phone conversation stream">
                  {sim.transcript.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400 space-y-2 my-auto">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shadow-inner">
                        <Smartphone className="w-6 h-6 stroke-1.5" />
                      </div>
                      <p className="text-xs font-bold text-slate-200">Ɔkwankyerɛfo Pa Voice Ready</p>
                      <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                        Akwaaba! Click <span className="text-emerald-400 font-bold">Call</span>, tap the microphone to speak, upload an audio clip, or tap any Ghanaian voice phrase below to test ASR &amp; AI reasoning.
                      </p>

                      {/* 1-Tap Quick Action Suggestions inside the screen */}
                      <div className="pt-2 w-full space-y-1.5 text-left">
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block font-bold">
                          1-Tap Ghanaian Voice Phrases (Instant ASR Ingest):
                        </span>
                        <button
                          onClick={() => sim.simulateAsrSample("Send 20 cedis to 0553838464", "en")}
                          className="w-full text-left p-2 rounded-xl bg-slate-900/90 hover:bg-emerald-950/60 border border-slate-800 hover:border-emerald-700/60 text-[11px] text-slate-200 font-medium truncate transition-colors flex items-center justify-between"
                        >
                          <span>🎙️ "Send 20 cedis to 0553838464"</span>
                          <span className="text-[9px] text-emerald-400 font-mono font-bold">EN-GH</span>
                        </button>
                        <button
                          onClick={() => sim.simulateAsrSample("Mepa wo kyɛw, mane sika aduonu kɔma Ama wɔ 0553838464", "tw")}
                          className="w-full text-left p-2 rounded-xl bg-slate-900/90 hover:bg-emerald-950/60 border border-slate-800 hover:border-emerald-700/60 text-[11px] text-slate-200 font-medium truncate transition-colors flex items-center justify-between"
                        >
                          <span>🎙️ "Mane sika aduonu kɔma Ama"</span>
                          <span className="text-[9px] text-amber-400 font-mono font-bold">TWI</span>
                        </button>
                        <button
                          onClick={() => sim.simulateAsrSample("Check my mobile money wallet balance", "en")}
                          className="w-full text-left p-2 rounded-xl bg-slate-900/90 hover:bg-emerald-950/60 border border-slate-800 hover:border-emerald-700/60 text-[11px] text-slate-200 font-medium truncate transition-colors flex items-center justify-between"
                        >
                          <span>🎙️ "Check my MoMo wallet balance"</span>
                          <span className="text-[9px] text-cyan-400 font-mono font-bold">WALLET</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    sim.transcript.map((item) => {
                      if (item.role === "caller") {
                        return (
                          <div key={item.id} className="flex flex-col items-end space-y-1">
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-mono">
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-emerald-400 font-bold">
                                👤 YOU (Caller)
                              </span>
                              <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                            </div>
                            <div className="max-w-[85%] bg-emerald-600 text-white px-3 py-2 rounded-2xl rounded-tr-xs text-xs font-medium shadow-md leading-relaxed break-words">
                              {item.text}
                            </div>
                          </div>
                        );
                      }

                      if (item.role === "ai") {
                        return (
                          <div key={item.id} className="flex flex-col items-start space-y-1">
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-400 font-mono">
                              <span className="px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 font-bold border border-amber-800/60">
                                🤖 AI VOICE
                              </span>
                              {item.stage && (
                                <span className="text-slate-400 font-mono uppercase text-[8px]">
                                  {item.stage}
                                </span>
                              )}
                              <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                            </div>
                            <div className="max-w-[88%] bg-slate-800/90 text-slate-100 border border-slate-700/80 px-3 py-2 rounded-2xl rounded-tl-xs text-xs font-medium shadow-md leading-relaxed space-y-1 break-words">
                              <p>{item.text}</p>
                              {/* Audio Replay Chip */}
                              <div className="pt-1 flex items-center justify-between border-t border-slate-700/60 text-[10px]">
                                <span className="text-emerald-400 font-mono">
                                  {sim.voiceMode === "STUDIO_PROMPTS" ? "Authentic Studio Prompt" : "Ghanaian Neural Voice"}
                                </span>
                                <button
                                  onClick={() => sim.playStudioClip(item.text)}
                                  className="text-[9px] text-amber-300 hover:text-amber-200 flex items-center gap-1 font-bold transition-colors"
                                  title="Replay Voice Prompt Audio"
                                >
                                  <Volume2 className="w-2.5 h-2.5" />
                                  <span>Replay Audio</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // System / Security event notice
                      return (
                        <div key={item.id} className="text-center py-1">
                          <span className="inline-block px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[10px] text-slate-400 font-mono">
                            {item.text}
                          </span>
                        </div>
                      );
                    })
                  )}

                  {/* ── Real-Time AI Intent & Entity Comprehension Card ─── */}
                  {sim.transcript.length > 0 && sim.intent && sim.intent !== "UNKNOWN" && (
                    <div className="p-2.5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-emerald-500/60 text-emerald-200 text-xs shadow-lg space-y-1.5 animate-fadeIn">
                      <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                          <span>AI COMPREHENSION SUMMARY</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/80 text-[9px]">
                          {sim.intent}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px] bg-black/60 p-2 rounded-xl border border-slate-800">
                        <div>
                          <span className="text-slate-400 block text-[9px]">Detected Action:</span>
                          <span className="font-semibold text-white">
                            {sim.intent === "SEND_MONEY" ? "💸 Send Money" :
                             sim.intent === "CHECK_BALANCE" ? "💳 Check Wallet Balance" :
                             sim.intent === "BUY_AIRTIME" ? "📱 Buy Airtime" :
                             sim.intent === "PAY_BILL" ? "🧾 Pay Utility Bill" : sim.intent}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">Amount:</span>
                          <span className="font-mono font-bold text-amber-300">
                            {sim.entities.amount ? `GH₵ ${Number(sim.entities.amount).toFixed(2)}` : "Not specified"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">Recipient:</span>
                          <span className="font-semibold text-emerald-300 truncate block">
                            {sim.entities.recipientName || sim.entities.recipientPhone || "Pending"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px]">Zero-PIN Security:</span>
                          <span className="font-semibold text-cyan-300">
                            {sim.safety?.sanitized ? "🛡️ PIN Protected" : "Active"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: AI BRAIN & BEHIND-THE-SYSTEM COGNITION HUD */}
              {phoneScreenTab === "ai_brain" && (
                <div className="flex-1 overflow-y-auto space-y-2.5 my-1 pr-1 text-xs select-text">
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-amber-400 font-bold uppercase">
                      <span>🧠 Real-Time Cognitive Decision</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {sim.intent || "IDLE"}
                      </span>
                    </div>

                    {/* Intent & Confidence Meter */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Calibrated Confidence:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {sim.confidence !== null ? `${(sim.confidence * 100).toFixed(1)}%` : "Calibrating..."}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${sim.confidence !== null ? Math.min(100, sim.confidence * 100) : 0}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] font-mono text-slate-300">
                      <div>
                        Language: <span className="text-amber-300 font-bold">{sim.language.toUpperCase()}</span>
                      </div>
                      <div>
                        Step: <span className="text-emerald-400 font-bold">{sim.currentStep}</span>
                      </div>
                    </div>
                  </div>

                  {/* Extracted Transaction Slots HUD */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                      Extracted Financial Slots:
                    </span>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Amount:</span>
                        <span className="font-mono font-bold text-white">
                          {sim.entities.amount ? `GH₵ ${Number(sim.entities.amount).toFixed(2)}` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Recipient Phone:</span>
                        <span className="font-mono font-bold text-amber-300">
                          {maskPhone(sim.entities.recipientPhone)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Recipient Name:</span>
                        <span className="font-bold text-emerald-300">
                          {sim.entities.recipientName || "Unresolved"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Telco Network:</span>
                        <span className="font-mono font-bold text-cyan-400">
                          {sim.entities.network || "MTN"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Security Radar */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-emerald-400" />
                        <span>Zero-PIN Guard:</span>
                      </span>
                      <span className="font-mono font-bold text-emerald-400">
                        {sim.safety.pinDetectedInVoice ? "BLOCKED ✕" : "ENFORCED ✓"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Latency:</span>
                      <span className="font-mono text-slate-300">
                        {sim.pipelineLatency ? `${sim.pipelineLatency.totalMs}ms` : "< 200ms target"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* VIEW 3: INNOVATION & ADVANCEMENT RADAR (What Needs Improvement) */}
              {phoneScreenTab === "advancement" && (
                <div className="flex-1 overflow-y-auto space-y-2.5 my-1 pr-1 text-xs select-text">
                  <div className="p-2.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-200 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold font-mono text-purple-300 uppercase">
                      <span>🔬 System Advancement Radar</span>
                      <span>DIAGNOSTICS</span>
                    </div>
                    <p className="text-[10px] text-purple-300 leading-snug">
                      Real-time assessment to identify which cognitive or telephony portions need engineering improvement.
                    </p>
                  </div>

                  {/* Aspect 1: ASR Acoustic Calibration */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-slate-200">1. ASR Acoustic Recognition</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 font-mono text-[9px]">
                        OPTIMAL (94%)
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Acoustic calibration matches Ghanaian telephony bandwidth (8kHz).
                    </p>
                    <div className="text-[10px] text-amber-300/90 font-medium bg-amber-950/40 p-1.5 rounded-lg border border-amber-900/40">
                      💡 <span className="font-bold">Advancement Need:</span> Add noise suppression for open-market callers (Kejetia / Makola market background noise).
                    </div>
                  </div>

                  {/* Aspect 2: Dialectal Nuance & Code-Switching */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-slate-200">2. Akan Dialect Grammar</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 font-mono text-[9px]">
                        STRONG
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Asante Twi &amp; Ghanaian English code-switching handled with tone disambiguation.
                    </p>
                    <div className="text-[10px] text-amber-300/90 font-medium bg-amber-950/40 p-1.5 rounded-lg border border-amber-900/40">
                      💡 <span className="font-bold">Advancement Need:</span> Expand Fante and Bono vocabulary variants in local linguistic lexicon.
                    </div>
                  </div>

                  {/* Aspect 3: Recipient Coreference & Contact Resolving */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span className="text-slate-200">3. Contact Matching &amp; KYC</span>
                      <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 font-mono text-[9px]">
                        ACTIVE
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Matches verified Ghanaian phone numbers and KYC subscriber directory.
                    </p>
                    <div className="text-[10px] text-amber-300/90 font-medium bg-amber-950/40 p-1.5 rounded-lg border border-amber-900/40">
                      💡 <span className="font-bold">Advancement Need:</span> Add fuzzy phonetic day-name resolution (Kwame, Kwabena, Ama).
                    </div>
                  </div>
                </div>
              )}

              {/* ── 5. Screen Bottom: Live Voice Bar, In-Screen Utterances & Buffer ─ */}
              <div className="pt-2 border-t border-slate-800/80 shrink-0 space-y-2">
                {/* Keypad Digits Buffer Display */}
                {sim.digitsBuffer && (
                  <div className="font-mono text-lg font-bold text-amber-400 tracking-widest bg-slate-900/90 py-1 px-3 rounded-lg border border-amber-400/30 text-center flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 font-normal">BUFFER:</span>
                    <span>{sim.digitsBuffer}</span>
                    <button
                      onClick={() => sim.submitKeypadBuffer()}
                      className="text-[9px] px-2 py-0.5 rounded bg-emerald-700 text-white font-bold"
                    >
                      # Submit
                    </button>
                  </div>
                )}

                {/* In-Screen Voice & Interaction Action Bar */}
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    <button
                      onClick={sim.toggleMic}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 shadow-sm transition-all shrink-0 ${
                        sim.isMicActive
                          ? "bg-amber-500 text-slate-950 ring-2 ring-amber-300 animate-pulse font-extrabold"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      }`}
                      title={sim.isMicActive ? "Click to finish speaking and submit" : "Click to speak into microphone (Ghanaian ASR)"}
                    >
                      <Mic className={`w-3 h-3 ${sim.isMicActive ? "animate-bounce" : ""}`} />
                      <span>{sim.isMicActive ? "⏹️ Stop & Send Speech" : "🎙️ Speak (Mic)"}</span>
                    </button>

                    {/* Quick-Turn Chips (Immediate Ghanaian ASR Ingest) */}
                    <button
                      onClick={() => sim.simulateAsrSample("Send 20 cedis to Kwame", "en")}
                      className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors"
                      title="Test speech: 'Send 20 cedis to Kwame'"
                    >
                      🎙️ Send 20
                    </button>
                    <button
                      onClick={() => sim.simulateAsrSample("Mane sika aduonum kɔma Ama", "tw")}
                      className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors"
                      title="Test Twi speech: 'Mane sika aduonum kɔma Ama'"
                    >
                      🎙️ Mane Sika (Twi)
                    </button>
                    <button
                      onClick={() => sim.simulateAsrSample("Check balance", "en")}
                      className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors"
                      title="Test speech: 'Check balance'"
                    >
                      🎙️ Balance
                    </button>
                    <button
                      onClick={() => sim.simulateAsrSample("Buy 10 cedis airtime", "en")}
                      className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 text-[10px] font-medium whitespace-nowrap shrink-0 transition-colors"
                      title="Test speech: 'Buy 10 cedis airtime'"
                    >
                      🎙️ Airtime
                    </button>
                    <button
                      onClick={() => sim.sendInputTurn("Aane", "TEXT")}
                      disabled={!sim.isActive}
                      className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[10px] font-bold disabled:opacity-30 whitespace-nowrap shrink-0"
                    >
                      ✅ Aane (Yes)
                    </button>
                    <button
                      onClick={() => sim.sendInputTurn("Dabi", "TEXT")}
                      disabled={!sim.isActive}
                      className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 text-[10px] font-bold disabled:opacity-30 whitespace-nowrap shrink-0"
                    >
                      ❌ Dabi (No)
                    </button>
                  </div>

                  {/* In-Screen Direct Speech & Utterance Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (inScreenSpeechText.trim()) {
                        if (!sim.isActive) sim.startCall(sim.language === "tw" ? "tw" : "en");
                        sim.sendInputTurn(inScreenSpeechText.trim(), "VOICE");
                        setInScreenSpeechText("");
                      }
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      value={inScreenSpeechText}
                      onChange={(e) => setInScreenSpeechText(e.target.value)}
                      placeholder={sim.isActive ? "Type voice request (e.g. Send 20 cedis to Kwame)..." : "Start call or type speech request..."}
                      className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-2.5 py-1.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                    />
                    <button
                      type="submit"
                      disabled={!inScreenSpeechText.trim()}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white rounded-xl text-[10px] font-bold shadow-xs transition-colors shrink-0 flex items-center gap-1"
                    >
                      <span>Send</span>
                      <Send className="w-2.5 h-2.5" />
                    </button>
                  </form>
                </div>
              </div>

              {/* ── 6. MoMo Push / Execution Modal Overlay ─────────────────────── */}
              {(sim.currentStep === "confirm" || sim.currentStep === "execution" || sim.action.isExecutable) && (
                <div className="absolute inset-2 bg-slate-950/98 backdrop-blur-md border-2 border-emerald-500/80 rounded-2xl p-4 flex flex-col justify-between shadow-2xl z-30">
                  <div className="space-y-1.5 text-left">
                    <div className="flex items-center justify-between text-[11px] text-emerald-400 font-mono font-bold">
                      <span>MTN MoMo PUSH</span>
                      <span className="text-amber-400">GHANA TELECOM</span>
                    </div>
                    <div className="text-sm font-bold text-white pt-1">
                      {sim.entities.amount ? `GH₵ ${Number(sim.entities.amount).toFixed(2)}` : "Mobile Transfer"}
                    </div>
                    <div className="text-[11px] text-slate-300">
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
                  <div className="py-2.5 text-center bg-slate-900 rounded-xl border border-slate-800">
                    <div className="text-[11px] text-amber-300 font-semibold flex items-center justify-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Zero-PIN Security Enforced</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Press 1 to confirm · Press 2 to cancel
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleKeyPress("1")}
                      className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
                    >
                      1: Confirm
                    </button>
                    <button
                      onClick={() => handleKeyPress("2")}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
                    >
                      2: Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Hidden file input for audio file upload ASR */}
            <input
              type="file"
              ref={audioFileInputRef}
              accept="audio/*,.mp3,.wav,.m4a,.webm,.ogg"
              onChange={handleAudioFileUpload}
              className="hidden"
            />

            {/* Handset Top Action Buttons (Call / Mic / Upload / Replay / End) */}
            <div className="grid grid-cols-5 gap-1.5 px-1">
              <button
                onClick={() => sim.startCall(sim.language === "tw" ? "tw" : "en")}
                disabled={sim.isActive}
                className="py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-2xl flex items-center justify-center font-bold shadow-md active:scale-95 transition-all group"
                title="Start Phone Call"
              >
                <Phone className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
              </button>

              <button
                onClick={sim.toggleMic}
                className={`py-3 rounded-2xl flex items-center justify-center font-bold shadow-md active:scale-95 transition-all relative ${
                  sim.isMicActive
                    ? "bg-amber-500 text-slate-950 ring-4 ring-amber-400/50 animate-pulse"
                    : "bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700/80"
                }`}
                title={sim.isMicActive ? "Mute Microphone / Stop Speaking" : "🎙️ Tap to Speak (Ghanaian ASR Voice Ingest)"}
              >
                <Mic className={`w-4 h-4 sm:w-5 sm:h-5 ${sim.isMicActive ? "text-slate-950 animate-bounce" : "text-emerald-400"}`} />
              </button>

              <button
                onClick={() => audioFileInputRef.current?.click()}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700/80 rounded-2xl flex items-center justify-center font-bold shadow-md active:scale-95 transition-all group"
                title="Upload Audio File for Ghanaian Speech Recognition"
              >
                <FileAudio className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform text-cyan-400" />
              </button>

              <button
                onClick={sim.replayCurrentSpeech}
                className="py-3 bg-slate-800 hover:bg-slate-700 text-purple-400 border border-slate-700/80 rounded-2xl flex items-center justify-center font-bold shadow-md active:scale-95 transition-all group"
                title="Replay Voice Prompt (Audio Playback)"
              >
                <Volume2 className={`w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform ${sim.isAiSpeaking ? "text-amber-400 animate-pulse" : "text-purple-400"}`} />
              </button>

              <button
                onClick={() => sim.endCall("User pressed End Call")}
                disabled={!sim.isActive}
                className="py-3 bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white rounded-2xl flex items-center justify-center font-bold shadow-md active:scale-95 transition-all group"
                title="Hang Up and sync call session to Call Logs"
              >
                <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
              </button>
            </div>

            {/* Physical 12-Button Tactile Keypad (Collapsible) */}
            {showKeypad && (
              <div className="grid grid-cols-3 gap-2 px-1 transition-all duration-300 animate-fadeIn">
                {keypadButtons.map((btn) => (
                  <button
                    key={btn.digit}
                    onClick={() => handleKeyPress(btn.digit)}
                    className={`h-11 sm:h-12 rounded-2xl flex flex-col items-center justify-center transition-all duration-75 shadow-xs ${
                      pressedKey === btn.digit
                        ? "bg-amber-400 text-slate-950 scale-95"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60"
                    }`}
                  >
                    <span className="text-sm font-extrabold leading-none">{btn.digit}</span>
                    {btn.sub && (
                      <span className="text-[8px] font-mono text-slate-400 leading-tight">
                        {btn.sub}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Handset Brand Footer */}
            <div className="text-center pt-0.5">
              <span className="text-[10px] font-mono tracking-widest text-slate-500 font-bold uppercase">
                Ɔkwankyerɛfo Pa Voice Handset
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            COLUMN 2: MULTI-TAB STUDIO PANE (All Features Testable Here)
        ══════════════════════════════════════════════════════════════════ */}
        <div className={`${phoneScale === "cinematic" ? "lg:col-span-6" : phoneScale === "large" ? "lg:col-span-4" : "lg:col-span-5"} bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col h-[740px] transition-all duration-300`}>
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
        <div className={`${phoneScale === "cinematic" ? "col-span-12 lg:col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 space-y-0" : "lg:col-span-3 space-y-4"} transition-all duration-300`}>
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
