import React, { useState, useRef, useEffect } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Volume1,
  Radio,
  RotateCcw,
  Download,
  FileText,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Clock,
  Send,
  Terminal,
  RefreshCw,
  Square,
  CircleDot,
  Zap,
  Check,
  Trash2,
  Cloud,
  Eye,
  Activity,
  Cpu,
  Database,
  Wifi,
  Power,
  Sliders,
  ChevronRight,
  ChevronDown,
  Layers,
  ArrowRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  usePhoneSimulator,
  AT_PRESET_SCENARIOS,
  PRESET_SCENARIOS,
} from "../../hooks/usePhoneSimulator";

const KEYPAD_BUTTONS = [
  { digit: "1", sub: "" },
  { digit: "2", sub: "ABC" },
  { digit: "3", sub: "DEF" },
  { digit: "4", sub: "GHI" },
  { digit: "5", sub: "JKL" },
  { digit: "6", sub: "MNO" },
  { digit: "7", sub: "PQRS" },
  { digit: "8", sub: "TUV" },
  { digit: "9", sub: "WXYZ" },
  { digit: "*", sub: "" },
  { digit: "0", sub: "+" },
  { digit: "#", sub: "" },
];

const SPEED_DIAL_CONTACTS = [
  { name: "Ama Serwaa", phone: "0559990001", network: "MTN MoMo" },
  { name: "Kwame Boateng", phone: "0553838464", network: "MTN MoMo" },
  { name: "Kofi Mensah", phone: "0244123456", network: "Telecel" },
];

const SAMPLE_SPEECH_PROMPTS = [
  {
    label: "Send 20 cedis to Ama",
    text: "Mɛmane aduonu kɔma Ama wɔ 0559990001",
    lang: "tw" as const,
    badge: "🇬🇭 Twi Transfer",
  },
  {
    label: "Send 50 GHS to Kwame",
    text: "I want to send 50 cedis to Kwame Boateng on 0553838464",
    lang: "en" as const,
    badge: "🇬🇧 English Transfer",
  },
  {
    label: "Check MoMo Balance",
    text: "Mepa wo kyɛw, mepɛ sɛ mehwɛ me balance wɔ MTN MoMo mu",
    lang: "tw" as const,
    badge: "🇬🇭 Twi Balance",
  },
  {
    label: "Confirm Transfer (Ɛyɛ)",
    text: "Ɛyɛ, mane kɔma no",
    lang: "tw" as const,
    badge: "🇬🇭 Twi Confirm",
  },
  {
    label: "Buy 10 GHS Airtime",
    text: "I need 10 cedis airtime for my phone",
    lang: "en" as const,
    badge: "🇬🇧 English Airtime",
  },
  {
    label: "Wrong Number Correction",
    text: "No, that is the wrong number, change it to 0553838464",
    lang: "en" as const,
    badge: "🇬🇧 Mid-Call Edit",
  },
];

export const PhoneSimulatorPage: React.FC = () => {
  const {
    isActive,
    callDurationSec,
    sessionId,
    executionMode,
    language,
    gatewayMode,
    setGatewayMode,
    atCallerPhone,
    atExpectedDigits,
    atFinishOnKey,
    atInstruction,
    atHttpLogs,
    clearAtLogs,
    ussdPushPrompt,
    dismissUssdPrompt,
    currentStep,
    digitsBuffer,
    setDigitsBuffer,
    isMicActive,
    isAiSpeaking,
    isLoading,
    enableTts,
    setEnableTts,
    interimTranscript,
    transcriptionStatus,
    aiProcessingPhase,
    aiProcessingDetail,
    audioLevel,
    transcript,
    aiResponse,
    intent,
    confidence,
    entities,
    voiceXmlTraces,
    syncState,
    startCall,
    endCall,
    handleKeypadDigit,
    submitKeypadBuffer,
    sendInputTurn,
    toggleMic,
    replayCurrentSpeech,
    runScenario,
    runAtPresetScenario,
    refreshSyncStatus,
    simulateWrongNumberCorrection,
    // Long conversation recording
    isRecording,
    recordingDurationSec,
    recordedAudioUrl,
    recordedChunksCount,
    rollingSummary,
    startRecording,
    stopRecording,
    downloadRecording,
    exportTranscript,
  } = usePhoneSimulator();

  // Innovative Layout Mode:
  // "pure_phone": Just the authentic physical phone twin (no engineer distractions)
  // "split": Phone on left + Engineer Heaven on right
  // "heaven_only": Full-screen celestial observatory
  const [viewMode, setViewMode] = useState<"pure_phone" | "split" | "heaven_only">("split");

  // In-call keypad overlay toggle on phone screen
  const [showInCallKeypad, setShowInCallKeypad] = useState(false);

  // Hardware buttons state & phone volume
  const [phoneVolume, setPhoneVolume] = useState<number>(85);
  const [showVolumeHud, setShowVolumeHud] = useState(false);
  const volumeHudTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isPhoneScreenPowered, setIsPhoneScreenPowered] = useState(true);

  // Quick utterance drawer under the phone
  const [showUtteranceTray, setShowUtteranceTray] = useState(false);

  // Engineer Heaven Tabs
  const [heavenTab, setHeavenTab] = useState<"brain" | "voice_asr" | "telephony" | "banking">("brain");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [isPlayingRecordedAudio, setIsPlayingRecordedAudio] = useState(false);
  const recordedAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const [typedSpeechInput, setTypedSpeechInput] = useState("");

  // Auto-scroll phone dialogue to bottom on new turns
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, interimTranscript]);

  // Adjust volume via physical rocker buttons
  const adjustVolume = (delta: number) => {
    setPhoneVolume((prev) => {
      const next = Math.max(0, Math.min(100, prev + delta));
      return next;
    });
    setShowVolumeHud(true);
    if (volumeHudTimerRef.current) clearTimeout(volumeHudTimerRef.current);
    volumeHudTimerRef.current = setTimeout(() => {
      setShowVolumeHud(false);
    }, 1600);
  };

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSendPromptSample = (text: string, lang: "en" | "tw") => {
    if (!isActive) {
      startCall(lang);
    }
    sendInputTurn(text, "VOICE");
  };

  const handleSendTypedUtterance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedSpeechInput.trim()) return;
    const text = typedSpeechInput.trim();
    setTypedSpeechInput("");
    if (!isActive) {
      startCall(language === "tw" ? "tw" : "en");
    }
    sendInputTurn(text, "VOICE");
  };

  const handleToggleRecordedPlayback = () => {
    if (!recordedAudioPlayerRef.current || !recordedAudioUrl) return;
    if (isPlayingRecordedAudio) {
      recordedAudioPlayerRef.current.pause();
      setIsPlayingRecordedAudio(false);
    } else {
      recordedAudioPlayerRef.current
        .play()
        .then(() => setIsPlayingRecordedAudio(true))
        .catch(() => setIsPlayingRecordedAudio(false));
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* ── Top View Switcher & Celestial Nav ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-md flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Phone className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Ɔkwankyerɛfo Pa Telephony Twin</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                Live Simulator
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Authentic Mobile Phone Twin · Zero-PIN USSD Gateway · Ghanaian Voice AI
            </p>
          </div>
        </div>

        {/* View Mode Switcher (Pure Phone vs Heaven Deck) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setViewMode("pure_phone")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === "pure_phone"
                  ? "bg-emerald-600 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Show just the physical phone simulator without engineering dashboards"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Just The Phone</span>
            </button>

            <button
              onClick={() => setViewMode("split")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === "split"
                  ? "bg-indigo-600 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Show both the phone simulator and Engineer Heaven side-by-side"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Phone + Heaven ☁️</span>
            </button>

            <button
              onClick={() => setViewMode("heaven_only")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
                viewMode === "heaven_only"
                  ? "bg-purple-600 text-white shadow-sm font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Focus exclusively on the Engineer Heaven telemetry observatory"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Heaven Full-Deck</span>
            </button>
          </div>

          <button
            onClick={() => refreshSyncStatus()}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700/60"
            title="Refresh synchronization status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main Simulator Stage ────────────────────────────────────── */}
      <div
        className={`grid gap-8 items-start ${
          viewMode === "pure_phone"
            ? "grid-cols-1 justify-items-center max-w-xl mx-auto"
            : viewMode === "heaven_only"
            ? "grid-cols-1"
            : "grid-cols-1 lg:grid-cols-12"
        }`}
      >
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* ── LEFT: THE PHYSICAL PHONE SIMULATOR ("JUST A PHONE") ────────── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {viewMode !== "heaven_only" && (
          <div
            className={`w-full flex flex-col items-center ${
              viewMode === "pure_phone" ? "max-w-md mx-auto" : "lg:col-span-5"
            }`}
          >
            {/* The Physical Handset Chassis */}
            <div className="relative w-full max-w-[390px] select-none">
              {/* Left Hardware Rocker: Volume Up & Down */}
              <div className="absolute -left-2 top-28 flex flex-col gap-2 z-20">
                <button
                  type="button"
                  onClick={() => adjustVolume(10)}
                  className="w-2.5 h-10 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-l-md transition shadow-md"
                  title="Hardware Volume Up"
                />
                <button
                  type="button"
                  onClick={() => adjustVolume(-10)}
                  className="w-2.5 h-10 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-l-md transition shadow-md"
                  title="Hardware Volume Down"
                />
              </div>

              {/* Right Hardware Button: Power / Lock / Standby */}
              <div className="absolute -right-2 top-32 z-20">
                <button
                  type="button"
                  onClick={() => setIsPhoneScreenPowered((prev) => !prev)}
                  className="w-2.5 h-14 bg-slate-700 hover:bg-slate-600 active:bg-slate-500 rounded-r-md transition shadow-md"
                  title="Hardware Power / Screen Lock"
                />
              </div>

              {/* Phone Outer Shell */}
              <div className="w-full bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 rounded-[50px] p-3.5 shadow-2xl border-4 border-slate-700/80 ring-1 ring-slate-600/30">
                {/* Handset Top Bezel: Earpiece Grill & Proximity / Dynamic LED */}
                <div className="flex items-center justify-between px-6 pt-1 pb-2">
                  <div className="flex items-center gap-1.5">
                    {/* Dynamic Status LED */}
                    <span
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        !isPhoneScreenPowered
                          ? "bg-slate-800"
                          : isActive
                          ? isAiSpeaking
                            ? "bg-purple-400 ring-4 ring-purple-500/30 animate-pulse"
                            : isMicActive
                            ? "bg-emerald-400 ring-4 ring-emerald-500/30 animate-pulse"
                            : "bg-emerald-500"
                          : "bg-slate-700"
                      }`}
                    />
                    <span className="text-[9px] text-slate-500 font-mono tracking-widest uppercase">
                      {isActive ? (isAiSpeaking ? "AI SPK" : isMicActive ? "REC" : "LINE") : "READY"}
                    </span>
                  </div>

                  {/* Speaker Bar */}
                  <div className="w-16 h-1.5 bg-slate-800 rounded-full border border-slate-700/50 flex items-center justify-center">
                    <div className="w-6 h-0.5 bg-slate-600 rounded-full" />
                  </div>

                  {/* Selfie Camera Pinhole */}
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                    <div className="w-1 h-1 rounded-full bg-slate-950" />
                  </div>
                </div>

                {/* ── THE PHONE DISPLAY SCREEN ────────────────────────── */}
                <div
                  className={`w-full rounded-[36px] min-h-[530px] flex flex-col justify-between p-3.5 relative overflow-hidden transition-all duration-300 border border-slate-800/80 shadow-inner ${
                    !isPhoneScreenPowered
                      ? "bg-black text-transparent opacity-90 cursor-pointer"
                      : "bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100"
                  }`}
                  onClick={() => {
                    if (!isPhoneScreenPowered) setIsPhoneScreenPowered(true);
                  }}
                >
                  {/* Screen Off Overlay */}
                  {!isPhoneScreenPowered && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-slate-600">
                      <Power className="w-8 h-8 mb-2 opacity-40 text-slate-500" />
                      <p className="text-xs font-semibold">Screen Locked / Asleep</p>
                      <p className="text-[10px] mt-1 text-slate-700">Click anywhere or tap Power key to wake up</p>
                    </div>
                  )}

                  {isPhoneScreenPowered && (
                    <>
                      {/* ── Phone Status Bar ────────────────────────────── */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5 pb-1 font-medium z-10">
                        <div className="flex items-center gap-1.5">
                          <Radio className="w-3 h-3 text-emerald-400" />
                          <span className="font-semibold tracking-tight text-slate-300">
                            {gatewayMode === "AFRICASTALKING_IVR" ? "AT · MTN MoMo" : "MTN Ghana 4G"}
                          </span>
                        </div>
                        <span className="text-white font-bold tracking-wider">
                          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Wifi className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] font-mono text-emerald-400">{phoneVolume}%</span>
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                        </div>
                      </div>

                      {/* Floating Volume HUD Slider */}
                      {showVolumeHud && (
                        <div className="absolute top-9 inset-x-6 z-30 bg-slate-900/95 border border-slate-700 rounded-full px-3 py-1.5 shadow-xl flex items-center gap-2 animate-fadeIn backdrop-blur-md">
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                          <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full transition-all"
                              style={{ width: `${phoneVolume}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-slate-300">{phoneVolume}%</span>
                        </div>
                      )}

                      {/* ── SCREEN MAIN CONTENT ─────────────────────────── */}
                      <div className="flex-1 flex flex-col justify-between my-2 relative">
                        {/* ════════════════════════════════════════════════ */}
                        {/* SCREEN STATE A: IN-CALL TWIN ─────────────────── */}
                        {/* ════════════════════════════════════════════════ */}
                        {isActive ? (
                          <div className="flex-1 flex flex-col justify-between space-y-2">
                            {/* In-Call Header */}
                            <div className="text-center pt-1 pb-1">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-800/80 mb-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                HD Voice · {formatTime(callDurationSec)}
                              </div>
                              <h3 className="text-base font-bold text-white tracking-tight flex items-center justify-center gap-1.5">
                                <span>Ɔkwankyerɛfo Pa</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                                  {language === "tw" ? "Akan Twi" : "English"}
                                </span>
                              </h3>
                              <p className="text-[11px] font-mono text-slate-400">
                                {gatewayMode === "AFRICASTALKING_IVR" ? "+233 30 804 8098 (AT)" : "+233 30 804 8098"}
                              </p>
                            </div>

                            {/* Fluid Voice Equalizer Visualizer */}
                            <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl px-3 py-2 flex items-center justify-between shadow-inner">
                              <div className="flex items-center gap-2">
                                {isAiSpeaking ? (
                                  <div className="flex items-center gap-1 text-purple-400 text-xs font-semibold">
                                    <Volume2 className="w-4 h-4 animate-bounce" />
                                    <span>Assistant Speaking...</span>
                                  </div>
                                ) : isMicActive ? (
                                  <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                                    <Mic className="w-4 h-4 animate-pulse" />
                                    <span>Listening to Caller...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 text-slate-400 text-xs">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Trunk Connected</span>
                                  </div>
                                )}
                              </div>

                              {/* Multi-frequency Equalizer Bars */}
                              <div className="flex items-end gap-1 h-5">
                                {[0.35, 0.75, 0.5, 0.95, 0.6, 0.85, 0.3].map((heightMul, i) => (
                                  <div
                                    key={i}
                                    className={`w-1 rounded-full transition-all duration-150 ${
                                      isAiSpeaking
                                        ? "bg-purple-400 animate-pulse"
                                        : isMicActive && (audioLevel > 0.05 || interimTranscript)
                                        ? "bg-emerald-400 animate-pulse"
                                        : "bg-slate-700"
                                    }`}
                                    style={{
                                      height:
                                        isAiSpeaking || (isMicActive && (audioLevel > 0.05 || interimTranscript))
                                          ? `${Math.max(5, heightMul * 20)}px`
                                          : "4px",
                                    }}
                                  />
                                ))}
                              </div>

                              {/* Replay Prompt Button */}
                              <button
                                type="button"
                                onClick={() => replayCurrentSpeech()}
                                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] flex items-center gap-1 transition"
                                title="Replay current voice prompt"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            </div>

                            {/* ── CONVERSATION DIALOGUE STREAM (THE NATURAL TRANSCRIBE FLOW) ── */}
                            <div className="bg-slate-950/90 rounded-2xl p-3 border border-slate-800/80 flex-1 max-h-[220px] overflow-y-auto space-y-2.5 shadow-inner">
                              {/* Latest System / Assistant Prompt */}
                              <div className="flex flex-col items-start space-y-1">
                                <span className="text-[9px] uppercase tracking-wider font-bold text-purple-400 flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  <span>Ɔkwankyerɛfo Pa Prompt</span>
                                </span>
                                <div className="bg-slate-900 border border-purple-900/40 rounded-2xl rounded-tl-sm p-2.5 text-xs text-slate-200 leading-relaxed shadow-sm">
                                  {aiResponse || "Akwaaba! Welcome to Okwankyerɛfo Pa. Press 1 for English, 2 for Akan Twi."}
                                </div>
                              </div>

                              {/* Live Interim / Spoken ASR Transcript (Natural Caller Speech Bubble) */}
                              {interimTranscript && (
                                <div className="flex flex-col items-end space-y-1 animate-fadeIn">
                                  <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-1">
                                    <Mic className="w-2.5 h-2.5 animate-pulse" />
                                    <span>Caller Speaking (ASR)</span>
                                  </span>
                                  <div className="bg-emerald-600/90 border border-emerald-500/50 rounded-2xl rounded-tr-sm p-2.5 text-xs text-white font-medium shadow-md">
                                    "{interimTranscript}"
                                  </div>
                                </div>
                              )}

                              {/* Keypad Buffer (if caller typed DTMF digits) */}
                              {digitsBuffer && (
                                <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-2 flex items-center justify-between">
                                  <div>
                                    <span className="text-[9px] uppercase font-bold text-indigo-400 block">
                                      Keypad Input ({atExpectedDigits ? `${atExpectedDigits} digits` : "DTMF"})
                                    </span>
                                    <span className="text-sm font-mono font-bold text-white tracking-widest">
                                      {digitsBuffer}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={submitKeypadBuffer}
                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
                                  >
                                    Send ({atFinishOnKey || "#"})
                                  </button>
                                </div>
                              )}

                              <div ref={transcriptEndRef} />
                            </div>

                            {/* ZERO-PIN USSD Push Screen Modal Overlay */}
                            {ussdPushPrompt?.active && (
                              <div className="absolute inset-0 z-40 bg-black/95 rounded-[32px] p-4 flex flex-col justify-center items-center text-center animate-fadeIn border border-amber-500/50">
                                <div className="w-12 h-12 bg-amber-500/15 text-amber-400 rounded-full flex items-center justify-center mb-2 shadow-lg">
                                  <ShieldCheck className="w-7 h-7" />
                                </div>
                                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                                  {ussdPushPrompt.title || "Mobile Money Handset Prompt"}
                                </h4>
                                <p className="text-xs text-slate-300 mb-3">{ussdPushPrompt.message}</p>
                                <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-2.5 w-full mb-3 text-xs font-mono text-amber-300">
                                  Transfer GHS {ussdPushPrompt.amount} to {ussdPushPrompt.recipientName} ({ussdPushPrompt.recipientPhone})
                                </div>
                                <div className="flex gap-2 w-full">
                                  <button
                                    type="button"
                                    onClick={dismissUssdPrompt}
                                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition"
                                  >
                                    Authorize on Phone
                                  </button>
                                  <button
                                    type="button"
                                    onClick={dismissUssdPrompt}
                                    className="px-3 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-medium"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* In-Call Phone Screen Action Bar */}
                            <div className="grid grid-cols-4 gap-1.5 pt-1">
                              {/* Mute / Unmute Button */}
                              <button
                                type="button"
                                onClick={toggleMic}
                                className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition ${
                                  isMicActive
                                    ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/50"
                                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                                }`}
                              >
                                {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                                <span className="text-[9px] font-semibold">{isMicActive ? "Mute" : "Unmute"}</span>
                              </button>

                              {/* In-Call Keypad Toggle */}
                              <button
                                type="button"
                                onClick={() => setShowInCallKeypad((prev) => !prev)}
                                className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition ${
                                  showInCallKeypad
                                    ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/50"
                                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                                }`}
                              >
                                <Sliders className="w-4 h-4" />
                                <span className="text-[9px] font-semibold">Keypad</span>
                              </button>

                              {/* Speaker Voice TTS Toggle */}
                              <button
                                type="button"
                                onClick={() => setEnableTts(!enableTts)}
                                className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition ${
                                  enableTts
                                    ? "bg-purple-600/20 text-purple-400 border border-purple-500/50"
                                    : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-white"
                                }`}
                              >
                                {enableTts ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                                <span className="text-[9px] font-semibold">{enableTts ? "Audio On" : "Muted"}</span>
                              </button>

                              {/* Red End Call Button */}
                              <button
                                type="button"
                                onClick={() => endCall("User ended call")}
                                className="py-2 px-1 bg-red-600 hover:bg-red-500 text-white rounded-xl flex flex-col items-center justify-center gap-1 shadow-md shadow-red-950/50 transition font-bold"
                              >
                                <PhoneOff className="w-4 h-4" />
                                <span className="text-[9px]">End</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ════════════════════════════════════════════════ */
                          /* SCREEN STATE B: IDLE / DIALER SCREEN ─────────── */
                          /* ════════════════════════════════════════════════ */
                          <div className="flex-1 flex flex-col justify-between py-2 space-y-4 text-center">
                            <div className="my-auto space-y-3">
                              {/* Carrier Branding & Phone State */}
                              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-full mx-auto flex items-center justify-center text-emerald-400 shadow-md">
                                <Phone className="w-7 h-7" />
                              </div>
                              <div>
                                <h3 className="text-base font-bold text-white">Telephone Ready</h3>
                                <p className="text-xs text-slate-400 max-w-[240px] mx-auto mt-0.5">
                                  Bilingual MoMo Voice Trunk (+233 30 804 8098)
                                </p>
                              </div>

                              {/* Dialed Digits Display with Backspace */}
                              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 flex items-center justify-between shadow-inner">
                                <div className="flex-1 text-left">
                                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block font-semibold">
                                    {digitsBuffer ? "Dialed Number" : "Direct Voice Trunk"}
                                  </span>
                                  <span className="text-lg font-mono text-emerald-400 font-bold tracking-wider">
                                    {digitsBuffer || "+233 30 804 8098"}
                                  </span>
                                </div>
                                {digitsBuffer && (
                                  <button
                                    type="button"
                                    onClick={() => setDigitsBuffer((prev) => prev.slice(0, -1))}
                                    className="px-2.5 py-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-xs transition"
                                    title="Backspace"
                                  >
                                    ⌫
                                  </button>
                                )}
                              </div>

                              {/* Speed Dial Quick Chips */}
                              <div className="flex items-center justify-center gap-1.5 flex-wrap pt-1">
                                {SPEED_DIAL_CONTACTS.map((c) => (
                                  <button
                                    key={c.phone}
                                    type="button"
                                    onClick={() => {
                                      setDigitsBuffer(c.phone);
                                    }}
                                    className="text-[10px] px-2 py-1 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg transition border border-slate-700/50"
                                  >
                                    {c.name}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Green Big Call Button */}
                            <button
                              type="button"
                              onClick={() => startCall()}
                              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-2xl shadow-lg shadow-emerald-950/60 transition flex items-center justify-center gap-2"
                            >
                              <Phone className="w-4 h-4" />
                              {digitsBuffer ? `Call ${digitsBuffer}` : "Call Ɔkwankyerɛfo Pa (+233 30 804 8098)"}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* ── HARDWARE / ON-SCREEN TACTILE KEYPAD GRID ─────── */}
                      {(!isActive || showInCallKeypad) && (
                        <div className="pt-2 border-t border-slate-800/80 animate-fadeIn">
                          <div className="grid grid-cols-3 gap-1.5">
                            {KEYPAD_BUTTONS.map((btn) => (
                              <button
                                key={btn.digit}
                                type="button"
                                onClick={() => handleKeypadDigit(btn.digit)}
                                className="h-11 bg-slate-800/70 hover:bg-slate-700 active:bg-slate-600 text-white rounded-xl flex flex-col items-center justify-center transition border border-slate-700/40 shadow-sm"
                              >
                                <span className="text-base font-bold leading-none">{btn.digit}</span>
                                {btn.sub && (
                                  <span className="text-[8px] text-slate-400 leading-none mt-0.5 tracking-widest font-mono">
                                    {btn.sub}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Handset Bottom Bezel: Microphone Pinhole */}
                <div className="flex items-center justify-center pt-2 pb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-800 border border-slate-700" />
                </div>
              </div>
            </div>

            {/* ── Quick Spoken Caller Phrases Tray (Under Phone) ──────── */}
            <div className="w-full max-w-[390px] mt-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-3 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Quick Spoken Utterances</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowUtteranceTray((prev) => !prev)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-0.5"
                >
                  {showUtteranceTray ? "Hide" : "Show All"}
                  {showUtteranceTray ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              </div>

              {/* Sample Quick Action Chips */}
              <div className="grid grid-cols-1 gap-1.5">
                {(showUtteranceTray ? SAMPLE_SPEECH_PROMPTS : SAMPLE_SPEECH_PROMPTS.slice(0, 3)).map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendPromptSample(p.text, p.lang)}
                    className="w-full text-left p-2 rounded-xl bg-slate-950/80 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 transition flex items-center justify-between group"
                  >
                    <span className="truncate pr-2">{p.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 group-hover:text-emerald-400 border border-slate-800 font-mono flex-shrink-0">
                      {p.badge}
                    </span>
                  </button>
                ))}
              </div>

              {/* Custom Typed Speech Input */}
              <form onSubmit={handleSendTypedUtterance} className="mt-2.5 flex items-center gap-1.5">
                <input
                  type="text"
                  value={typedSpeechInput}
                  onChange={(e) => setTypedSpeechInput(e.target.value)}
                  placeholder="Speak or type custom turn..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!typedSpeechInput.trim()}
                  className="p-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* ── RIGHT: ENGINEER HEAVEN ☁️ (CELESTIAL MISSION CONTROL) ─────── */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {viewMode !== "pure_phone" && (
          <div
            className={`w-full space-y-4 ${
              viewMode === "heaven_only" ? "max-w-6xl mx-auto" : "lg:col-span-7"
            }`}
          >
            {/* Celestial Header Card */}
            <div className="bg-gradient-to-r from-slate-950 via-indigo-950/40 to-slate-950 border border-indigo-500/30 rounded-2xl p-4 shadow-xl backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-inner">
                    <Cloud className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white tracking-tight">Engineer Heaven ☁️</h2>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/80">
                        Observability Flight Deck
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Isolated Engineering Systems: Gemini Cognitive Brain · Telephony Webhooks · MoMo Core Banking
                    </p>
                  </div>
                </div>

                {/* Gateway Switcher (Africa's Talking vs Canonical AI) */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setGatewayMode("AFRICASTALKING_IVR")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition ${
                      gatewayMode === "AFRICASTALKING_IVR"
                        ? "bg-emerald-600 text-white shadow-sm font-semibold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Africa's Talking IVR
                  </button>
                  <button
                    type="button"
                    onClick={() => setGatewayMode("CANONICAL_AI")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition ${
                      gatewayMode === "CANONICAL_AI"
                        ? "bg-purple-600 text-white shadow-sm font-semibold"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Canonical AI
                  </button>
                </div>
              </div>

              {/* Celestial Navigation Tabs */}
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-800/80 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setHeavenTab("brain")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    heavenTab === "brain"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 bg-slate-900/60"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Heaven's Eye (AI Brain)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHeavenTab("voice_asr")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    heavenTab === "voice_asr"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 bg-slate-900/60"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>ASR & Studio Recording</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHeavenTab("telephony")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    heavenTab === "telephony"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 bg-slate-900/60"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Trunk & VoiceXML</span>
                </button>

                <button
                  type="button"
                  onClick={() => setHeavenTab("banking")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    heavenTab === "banking"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 bg-slate-900/60"
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>MoMo Sandbox & Scenarios</span>
                </button>
              </div>
            </div>

            {/* ── TAB 1: HEAVEN'S EYE (AI COGNITIVE BRAIN STREAM) ───────── */}
            {heavenTab === "brain" && (
              <div className="space-y-4">
                {/* Intent & Slots Matrix */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-indigo-400" />
                      <span>Live Cognitive Slot Extraction Matrix</span>
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      Session: {sessionId.slice(0, 16)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Intent</span>
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {intent || "Awaiting Utterance"}
                      </span>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Confidence</span>
                      <span className="text-xs font-mono font-bold text-indigo-400">
                        {confidence ? `${Math.round(confidence * 100)}%` : "N/A"}
                      </span>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Amount Slot</span>
                      <span className="text-xs font-mono font-bold text-amber-300">
                        {entities?.amount ? `GHS ${entities.amount}` : "None"}
                      </span>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-2.5 rounded-xl">
                      <span className="text-[10px] text-slate-500 uppercase font-bold block">Recipient Slot</span>
                      <span className="text-xs font-mono font-bold text-teal-300 truncate block">
                        {entities?.recipientPhone || entities?.recipientName || "None"}
                      </span>
                    </div>
                  </div>

                  {/* Zero-PIN Security Gate Badge */}
                  <div className="bg-slate-950 border border-emerald-800/40 rounded-xl p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      <div>
                        <span className="text-xs font-bold text-white block">Zero-PIN Isolation Guard</span>
                        <span className="text-[10px] text-slate-400">
                          PINs never cross network or server models · Local handset authorization only
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-lg text-[10px] font-bold">
                      VERIFIED ENFORCED
                    </span>
                  </div>

                  {/* AI Processing Phase & Detail */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <span className="font-bold text-purple-400 uppercase">Phase: {aiProcessingPhase || "STANDBY"}</span>
                      <span className="text-slate-500 font-mono">Stage Status: {transcriptionStatus}</span>
                    </div>
                    <p className="text-slate-300">{aiProcessingDetail || "AI pipeline idle. Awaiting speech turn."}</p>
                  </div>
                </div>

                {/* Call Transcript Stream */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[340px]">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-950">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Full Call Dialogue Record ({transcript.length} turns)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => exportTranscript("txt")}
                      disabled={transcript.length === 0}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition"
                    >
                      <Download className="w-3 h-3" />
                      Export TXT
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
                    {transcript.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-8">
                        <Phone className="w-7 h-7 mb-1 opacity-30" />
                        <p className="text-xs font-semibold">No turns in current session.</p>
                      </div>
                    ) : (
                      transcript.map((item) => (
                        <div
                          key={item.id}
                          className={`flex flex-col ${
                            item.role === "caller"
                              ? "items-end"
                              : item.role === "ai"
                              ? "items-start"
                              : "items-center"
                          }`}
                        >
                          {item.role === "system" ? (
                            <div className="my-0.5 px-2.5 py-0.5 bg-slate-950 border border-slate-800 rounded-full text-[10px] text-slate-400 font-mono">
                              {item.text}
                            </div>
                          ) : (
                            <div
                              className={`max-w-[85%] rounded-2xl p-2.5 text-xs leading-relaxed shadow-sm ${
                                item.role === "caller"
                                  ? "bg-emerald-600 text-white rounded-br-none"
                                  : "bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-none"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-4 mb-0.5 text-[9px] opacity-75">
                                <span className="font-bold">
                                  {item.role === "caller" ? "CALLER" : "ƆKWANKYERƐFO PA"}
                                </span>
                                <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <p>{item.text}</p>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB 2: ASR & LONG RECORDING STUDIO ─────────────────────── */}
            {heavenTab === "voice_asr" && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-2 rounded-xl ${
                          isRecording
                            ? "bg-red-500/20 text-red-400 animate-pulse border border-red-500/30"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        <CircleDot className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          Long Conversation Recording Studio
                          {isRecording && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950 text-red-400 border border-red-800 animate-pulse">
                              ● REC {formatTime(recordingDurationSec)}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-400">
                          Continuous ASR streaming & dual-track session audio archiver
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isRecording ? (
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
                        >
                          <Square className="w-3.5 h-3.5 fill-white" />
                          Stop Recording
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startRecording}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                        >
                          <CircleDot className="w-3.5 h-3.5 text-red-400" />
                          Record Call
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Audio Player for Finished Recording */}
                  {recordedAudioUrl && (
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={handleToggleRecordedPlayback}
                          className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition shadow-sm"
                        >
                          {isPlayingRecordedAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <div>
                          <span className="text-xs font-semibold text-white block">Recorded Call Audio</span>
                          <span className="text-[11px] text-slate-400">
                            Duration: {formatTime(recordingDurationSec)} · {recordedChunksCount} audio chunks
                          </span>
                        </div>
                        <audio
                          ref={recordedAudioPlayerRef}
                          src={recordedAudioUrl}
                          onEnded={() => setIsPlayingRecordedAudio(false)}
                          className="hidden"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={downloadRecording}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download (.webm)
                      </button>
                    </div>
                  )}

                  {rollingSummary && (
                    <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-3 text-xs text-indigo-200">
                      <span className="font-bold text-indigo-300 block mb-0.5 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        Rolling Long-Call Summary
                      </span>
                      {rollingSummary}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB 3: TELEPHONY TRUNK & VOICEXML ──────────────────────── */}
            {heavenTab === "telephony" && (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-emerald-400" />
                      <span>Africa's Talking IVR HTTP Webhooks & VoiceXML</span>
                    </span>
                    <button
                      type="button"
                      onClick={clearAtLogs}
                      className="px-2 py-1 text-slate-400 hover:text-white bg-slate-800 rounded-lg text-[10px]"
                    >
                      Clear Logs
                    </button>
                  </div>

                  {atHttpLogs.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
                      <Terminal className="w-6 h-6 mx-auto mb-1 opacity-30" />
                      <p className="text-xs">No HTTP webhook traces captured yet.</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">Traces stream on DTMF keypad or IVR turn dispatch.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[360px] overflow-y-auto">
                      {atHttpLogs.map((log) => (
                        <div key={log.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono">
                          <div className="flex items-center justify-between text-slate-400 mb-1">
                            <span className="text-emerald-400 font-bold">{log.method} {log.endpoint}</span>
                            <span className="text-slate-500 text-[10px]">{log.timestamp}</span>
                          </div>
                          <pre className="text-slate-300 text-[11px] bg-slate-900 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
                            {log.voiceXml}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── TAB 4: MOMO SANDBOX & SCENARIOS ───────────────────────── */}
            {heavenTab === "banking" && (
              <div className="space-y-4">
                {/* Float Balance & Ledger Status */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Float Balance</span>
                    <span className="text-base font-bold font-mono text-emerald-400">
                      GHS {syncState.floatBalance !== null ? syncState.floatBalance.toFixed(2) : "1,450.00"}
                    </span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Ledger Entries</span>
                    <span className="text-base font-bold font-mono text-white">
                      {syncState.ledgerTotal}
                    </span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Call Logs</span>
                    <span className="text-base font-bold font-mono text-white">
                      {syncState.callLogsTotal}
                    </span>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl">
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Target Env</span>
                    <span className="text-xs font-bold font-mono text-indigo-400 truncate block mt-1">
                      {syncState.targetEnv || "sandbox"}
                    </span>
                  </div>
                </div>

                {/* Preset Scenarios Quick Runner */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Automated Test Scenarios Runner
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={selectedScenarioId}
                      onChange={(e) => setSelectedScenarioId(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Choose an automated test scenario...</option>
                      <optgroup label="Africa's Talking IVR Scenarios">
                        {AT_PRESET_SCENARIOS.map((sc) => (
                          <option key={sc.id} value={`at:${sc.id}`}>
                            {sc.title}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Canonical AI Scenarios">
                        {PRESET_SCENARIOS.map((sc) => (
                          <option key={sc.id} value={`ai:${sc.id}`}>
                            {sc.title}
                          </option>
                        ))}
                      </optgroup>
                    </select>

                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedScenarioId) return;
                        if (selectedScenarioId.startsWith("at:")) {
                          runAtPresetScenario(selectedScenarioId.replace("at:", ""));
                        } else {
                          runScenario(selectedScenarioId.replace("ai:", ""));
                        }
                      }}
                      disabled={!selectedScenarioId}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-sm"
                    >
                      Execute
                    </button>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={simulateWrongNumberCorrection}
                      className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold underline"
                    >
                      Test Mid-Call Wrong Number Correction Scenario
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
