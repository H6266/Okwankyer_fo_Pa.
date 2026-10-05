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
} from "lucide-react";
import {
  usePhoneSimulator,
  PRESET_SCENARIOS,
  SimulatorContact,
} from "../../hooks/usePhoneSimulator";

export const PhoneSimulatorPage: React.FC = () => {
  const sim = usePhoneSimulator();
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("send_money_en");
  const [typedInput, setTypedInput] = useState<string>("");
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [activeCenterTab, setActiveCenterTab] = useState<"transcript" | "voicexml" | "ledger">("transcript");
  const [copiedXml, setCopiedXml] = useState(false);

  // Keyboard accessibility: physical keypad listeners
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

  const quickUtterances = [
    { label: "🇬🇭 Twi Transfer", text: "Mepa wo kyɛw mane sika aduonu kɔma Kwame Nyamebere wɔ 0553838464", lang: "tw" },
    { label: "🇬🇧 English Transfer", text: "I want to send 20 cedis to 0553838464", lang: "en" },
    { label: "💰 Check Balance", text: "Wait, first check my balance", lang: "en" },
    { label: "✏️ Amount Correction", text: "No, make it 50 cedis instead", lang: "en" },
    { label: "⚠️ PIN Attempt (Zero-PIN)", text: "Send 30 cedis to 0553838464 with PIN 1234", lang: "en" },
    { label: "📱 Airtime Purchase", text: "Buy 10 cedis airtime for my phone", lang: "en" },
    { label: "❌ Cancel Transfer", text: "I don't want to send it anymore, cancel", lang: "en" },
  ];

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
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              SYNCHRONIZED
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl">
            Fully interactive test handset synchronized with all features: MoMo transactions, live Call Logs, KYC directory, ASR transcription, speech synthesis, and Africa's Talking VoiceXML.
          </p>
        </div>

        {/* Mode Selector & Audio Mode Options */}
        <div className="flex flex-wrap items-center gap-2.5">
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
              <span>Studio Clips</span>
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

      {/* ── Feature Synchronization Hub (Live Links to all 7 Features) ─────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* 1. Call Logs Link */}
        <Link
          to="/dashboard/calls"
          className="p-3 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Inspect live call sessions and drop-off funnels"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Call Logs</span>
            <History className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-base font-extrabold text-slate-900 font-mono">
              {sim.syncState.callLogsTotal} Calls
            </div>
            <span className="text-[10px] text-emerald-700 flex items-center gap-0.5 font-medium">
              <span>View Sessions</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </Link>

        {/* 2. MoMo Ledger Link */}
        <Link
          to="/dashboard/ledger"
          className="p-3 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Inspect immutable financial ledger & idempotency records"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Ledger</span>
            <ReceiptText className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-base font-extrabold text-slate-900 font-mono">
              {sim.syncState.ledgerTotal} Records
            </div>
            <span className="text-[10px] text-emerald-700 flex items-center gap-0.5 font-medium">
              <span>View Ledger</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </Link>

        {/* 3. MoMo Lab Link */}
        <Link
          to="/dashboard/momo"
          className="p-3 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Test MTN MoMo API collections, disbursements, and account balance"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">MoMo Float</span>
            <Wallet className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-bold text-emerald-700 font-mono truncate">
              GH₵ {sim.syncState.floatBalance.toLocaleString()}
            </div>
            <span className="text-[10px] text-slate-500 flex items-center gap-0.5 font-medium">
              <span>MoMo Lab</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </Link>

        {/* 4. ASR Lab Link */}
        <Link
          to="/dashboard/asr"
          className="p-3 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Test speech-to-text recognition accuracy and acoustic benchmarks"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">ASR Lab</span>
            <Mic2 className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-bold text-slate-900 font-mono">
              Ghana ASR
            </div>
            <span className="text-[10px] text-slate-500 flex items-center gap-0.5 font-medium">
              <span>Evaluate STT</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </Link>

        {/* 5. TTS Lab Link */}
        <Link
          to="/dashboard/tts"
          className="p-3 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Test Ghanaian English and Akan Twi speech synthesis and pronunciation lexicons"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">TTS Lab</span>
            <FileAudio className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-bold text-slate-900 font-mono truncate">
              {sim.voiceMode === "STUDIO_PROMPTS" ? "Studio Audio" : "Neural TTS"}
            </div>
            <span className="text-[10px] text-slate-500 flex items-center gap-0.5 font-medium">
              <span>TTS Lab</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </Link>

        {/* 6. KYC Directory Link */}
        <Link
          to="/dashboard/kyc"
          className="p-3 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Lookup subscriber identities and telco KYC verification"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">KYC Directory</span>
            <Users className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-bold text-slate-900 font-mono">
              {sim.contacts.length || 6} Contacts
            </div>
            <span className="text-[10px] text-slate-500 flex items-center gap-0.5 font-medium">
              <span>Inspect KYC</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </Link>

        {/* 7. IVR / AT Lab Link */}
        <Link
          to="/dashboard/ivr"
          className="p-3 bg-white hover:bg-emerald-50/50 rounded-xl border border-slate-200 shadow-2xs transition-all group flex flex-col justify-between"
          title="Africa's Talking telephony SIP trunk and VoiceXML simulator"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">IVR Telephony</span>
            <PhoneCall className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-1">
            <div className="text-xs font-bold text-slate-900 font-mono truncate">
              +233 30 804 8098
            </div>
            <span className="text-[10px] text-slate-500 flex items-center gap-0.5 font-medium">
              <span>IVR Lab</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </Link>
      </div>

      {/* ── KYC Quick Contact Selector Bar ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-700" />
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Quick Test Recipients (KYC Verified Contacts)
            </span>
          </div>
          <Link
            to="/dashboard/kyc"
            className="text-[11px] text-emerald-700 hover:underline font-semibold flex items-center gap-1"
          >
            <span>Manage in KYC Directory</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(sim.contacts.length > 0 ? sim.contacts : [
            { phone: "0553838464", name: "Kwame Nyamebere", network: "MTN" as const, verified: true, suggestedPromptEn: "", suggestedPromptTw: "" },
            { phone: "0241234567", name: "Ama Serwaa", network: "MTN" as const, verified: true, suggestedPromptEn: "", suggestedPromptTw: "" },
            { phone: "0543546010", name: "Hannes Aboagye", network: "MTN" as const, verified: true, suggestedPromptEn: "", suggestedPromptTw: "" },
            { phone: "0244123456", name: "Kwame Mensah", network: "MTN" as const, verified: true, suggestedPromptEn: "", suggestedPromptTw: "" },
            { phone: "0201234567", name: "Kofi Annan", network: "Telecel" as const, verified: true, suggestedPromptEn: "", suggestedPromptTw: "" },
            { phone: "0271234567", name: "Yaw Osei", network: "AT" as const, verified: true, suggestedPromptEn: "", suggestedPromptTw: "" },
          ]).map((c) => (
            <button
              key={c.phone}
              onClick={() => sim.sendContactTransfer(c, 25)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-emerald-300 bg-slate-50 hover:bg-emerald-50/60 text-xs font-medium text-slate-800 transition-all flex items-center gap-2 shadow-2xs group"
              title={`Click to send 25 cedis to ${c.name} (${c.phone})`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 group-hover:scale-125 transition-transform" />
              <span className="font-bold">{c.name}</span>
              <span className="font-mono text-[10px] text-slate-500">({c.network} · {c.phone.slice(-4)})</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold group-hover:bg-emerald-700 group-hover:text-white transition-colors">
                Send GH₵ 25
              </span>
            </button>
          ))}
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
                  <span className="font-bold tracking-tight">MTN 4G</span>
                </div>
                <div className="font-bold text-slate-300">
                  {sim.isActive ? formatTimer(sim.callDurationSec) : "STANDBY"}
                </div>
              </div>

              {/* Main Screen Content */}
              <div className="py-3 space-y-2 text-center my-auto">
                <div className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                  {sim.isActive ? `${sim.currentStep.toUpperCase()} STEP` : "ƆKWANKYERƐFO PA"}
                </div>

                {/* Spoken AI Status / Waveform */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 min-h-[70px] flex flex-col items-center justify-center">
                  {sim.isLoading ? (
                    <div className="flex items-center gap-2 text-amber-300 animate-pulse">
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span className="text-[11px] font-medium">AI reasoning...</span>
                    </div>
                  ) : sim.isAiSpeaking ? (
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Volume2 className="w-4 h-4 animate-bounce shrink-0" />
                      <span className="italic text-[11px] truncate max-w-[190px]">
                        🔊 {sim.voiceMode === "STUDIO_PROMPTS" ? "Studio prompt playing..." : "AI speaking..."}
                      </span>
                    </div>
                  ) : sim.isActive ? (
                    <div className="text-[11px] text-slate-300 line-clamp-2">
                      {sim.aiResponse || "Listening for speech or keypad digits..."}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500">
                      Press Call (Green), choose a scenario, or click a contact
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
            COLUMN 2: MULTI-TAB STUDIO PANE (Transcript / VoiceXML / Ledger)
        ══════════════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col h-[740px]">
          {/* Top Scenario Runner & Tab Switcher Bar */}
          <div className="pb-3 border-b border-slate-100 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              {/* Tab Selector */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setActiveCenterTab("transcript")}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    activeCenterTab === "transcript"
                      ? "bg-white text-slate-900 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Transcript
                </button>
                <button
                  onClick={() => setActiveCenterTab("voicexml")}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 ${
                    activeCenterTab === "voicexml"
                      ? "bg-white text-emerald-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <PhoneCall className="w-3 h-3 text-emerald-600" />
                  <span>VoiceXML ({sim.voiceXmlTraces.length})</span>
                </button>
                <button
                  onClick={() => setActiveCenterTab("ledger")}
                  className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1 ${
                    activeCenterTab === "ledger"
                      ? "bg-white text-emerald-800 font-bold shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ReceiptText className="w-3 h-3 text-emerald-600" />
                  <span>Ledger Sync</span>
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

          {/* Quick LLM Utterance Test Bar */}
          <div className="py-2 overflow-x-auto flex items-center gap-1.5 no-scrollbar border-b border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
              Quick Test:
            </span>
            {quickUtterances.map((u, i) => (
              <button
                key={i}
                onClick={() => {
                  if (!sim.isActive) sim.startCall(u.lang as any);
                  sim.sendInputTurn(u.text, "TEXT");
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-600 text-[11px] font-semibold whitespace-nowrap border border-slate-200/80 transition-colors"
              >
                {u.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Transcript Scroll Area */}
          {activeCenterTab === "transcript" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1" aria-label="Call conversation transcript">
              {sim.transcript.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <Smartphone className="w-10 h-10 stroke-1 text-slate-300 mb-2" />
                  <p className="text-xs font-medium text-slate-600">No active call conversation</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                    Press Call, click a contact above, run a scenario, or type an utterance below to start a live turn with the canonical AI brain.
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

          {/* Tab 2: Africa's Talking VoiceXML Live Trace */}
          {activeCenterTab === "voicexml" && (
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

          {/* Tab 3: Synchronized Ledger & Receipt */}
          {activeCenterTab === "ledger" && (
            <div className="flex-1 overflow-y-auto py-3 space-y-3 text-xs">
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <ReceiptText className="w-4 h-4 text-emerald-700" />
                    <span>Live Idempotency &amp; Ledger Synchronization</span>
                  </span>
                  <Link
                    to="/dashboard/ledger"
                    className="text-[11px] font-bold text-emerald-800 hover:underline flex items-center gap-0.5"
                  >
                    <span>Full Ledger</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                <p className="text-[11px] text-emerald-800">
                  Transactions executed through this simulator are registered in real-time in the central MoMo transaction ledger and velocity limits store.
                </p>
              </div>

              {sim.providerResult ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 font-mono">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-bold text-slate-800">LATEST TRANSACTION RECEIPT</span>
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
                    <div>Mode: {sim.executionMode}</div>
                    <div>Ledger total count: {sim.syncState.ledgerTotal}</div>
                    <div>Call logs total count: {sim.syncState.callLogsTotal}</div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <ReceiptText className="w-8 h-8 stroke-1 mx-auto text-slate-300 mb-1" />
                  <p className="text-xs font-medium text-slate-600">No transaction executed yet in this session</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                    Complete a transfer turn (e.g. "Send 20 cedis to 0553838464" followed by "1" or "Yes") to generate an immutable ledger entry.
                  </p>
                </div>
              )}
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
                  {(sim.confidence * 100).toFixed(1)}%
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
