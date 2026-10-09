import React, { useState, useRef, useEffect } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
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
  ArrowRight,
  RefreshCw,
  Sliders,
  Square,
  CircleDot,
  Zap,
  Check,
  Trash2,
  Layers,
} from "lucide-react";
import { usePhoneSimulator, AT_PRESET_SCENARIOS, PRESET_SCENARIOS } from "../../hooks/usePhoneSimulator";

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
    aiProcessingDetail,
    audioLevel,
    transcript,
    aiResponse,
    intent,
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

  const [activeTab, setActiveTab] = useState<"transcript" | "telephony_logs">("transcript");
  const [typedUtterance, setTypedUtterance] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [isPlayingRecordedAudio, setIsPlayingRecordedAudio] = useState(false);
  const recordedAudioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll transcript on new turns
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSendTyped = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!typedUtterance.trim()) return;
    const text = typedUtterance.trim();
    setTypedUtterance("");
    if (!isActive) {
      startCall(language === "tw" ? "tw" : "en");
    }
    sendInputTurn(text, "SIMULATOR");
  };

  const handleToggleRecordedPlayback = () => {
    if (!recordedAudioPlayerRef.current || !recordedAudioUrl) return;
    if (isPlayingRecordedAudio) {
      recordedAudioPlayerRef.current.pause();
      setIsPlayingRecordedAudio(false);
    } else {
      recordedAudioPlayerRef.current.play().then(() => {
        setIsPlayingRecordedAudio(true);
      }).catch(() => {
        setIsPlayingRecordedAudio(false);
      });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ── Top Header & Mode Controls ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Phone className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Telephony & Voice Simulator</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
              Live Gateway Active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time Africa's Talking IVR Trunk & Ghanaian Voice AI (ASR, Neural TTS, Zero-PIN & Long Conversation Recording)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Trunk / Gateway Mode Selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setGatewayMode("AFRICASTALKING_IVR")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                gatewayMode === "AFRICASTALKING_IVR"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Africa's Talking IVR
            </button>
            <button
              onClick={() => setGatewayMode("CANONICAL_AI")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                gatewayMode === "CANONICAL_AI"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              AI Voice Agent
            </button>
          </div>

          {/* Quick Refresh Status */}
          <button
            onClick={() => refreshSyncStatus()}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition border border-slate-700/60"
            title="Refresh status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main Cockpit: 2-Column Uncrowded Layout ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Left Column: Clean Phone Handset ──────────────────────────── */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[390px] bg-slate-950 border-4 border-slate-800 rounded-[44px] p-4 shadow-2xl relative flex flex-col items-center">
            {/* Speaker & Sensor Bar */}
            <div className="w-24 h-4 bg-slate-900 rounded-full mb-3 flex items-center justify-center">
              <div className="w-10 h-1 bg-slate-700 rounded-full" />
              <div className="w-2 h-2 rounded-full bg-slate-800 ml-2" />
            </div>

            {/* Handset Screen */}
            <div className="w-full bg-slate-900 rounded-[28px] border border-slate-800/80 p-4 flex flex-col justify-between min-h-[540px] shadow-inner relative overflow-hidden">
              {/* Screen Top Status Bar */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 font-medium">
                <span className="flex items-center gap-1">
                  <Radio className="w-3 h-3 text-emerald-400" />
                  MTN Ghana / AT
                </span>
                <span className="text-white font-semibold">
                  {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  100%
                </span>
              </div>

              {/* Call State Display */}
              <div className="flex-1 flex flex-col justify-between py-2">
                {isActive ? (
                  <div className="space-y-3">
                    {/* Active Call Header */}
                    <div className="text-center">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 mb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Call Active · {formatTime(callDurationSec)}
                      </div>
                      <h3 className="text-base font-bold text-white tracking-wide">
                        {gatewayMode === "AFRICASTALKING_IVR" ? "+233 30 804 8098" : "Ɔkwankyerɛfo Pa AI"}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {gatewayMode === "AFRICASTALKING_IVR"
                          ? `IVR Step: ${currentStep} (${atInstruction})`
                          : `Voice AI · Intent: ${intent || "Awaiting utterance"}`}
                      </p>
                    </div>

                    {/* Audio Wave & Speaker Status Indicator */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isAiSpeaking ? (
                          <div className="flex items-center gap-1 text-purple-400 text-xs font-medium">
                            <Volume2 className="w-4 h-4 animate-bounce" />
                            <span>AI Speaking...</span>
                          </div>
                        ) : isMicActive ? (
                          <div className="flex items-center gap-1 text-emerald-400 text-xs font-medium">
                            <Mic className="w-4 h-4 animate-pulse" />
                            <span>Listening...</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-400 text-xs font-medium">
                            <Clock className="w-4 h-4" />
                            <span>Line Open</span>
                          </div>
                        )}
                      </div>

                      {/* Visual Waveform bars */}
                      <div className="flex items-end gap-0.5 h-4">
                        {[0.3, 0.7, 0.4, 0.9, 0.5, 0.8, 0.2].map((heightMultiplier, i) => (
                          <div
                            key={i}
                            className={`w-1 rounded-full transition-all duration-150 ${
                              isAiSpeaking
                                ? "bg-purple-400 animate-pulse"
                                : isMicActive && audioLevel > 0.05
                                ? "bg-emerald-400 animate-pulse"
                                : "bg-slate-700"
                            }`}
                            style={{
                              height:
                                isAiSpeaking || (isMicActive && audioLevel > 0.05)
                                  ? `${Math.max(4, heightMultiplier * 16)}px`
                                  : "4px",
                            }}
                          />
                        ))}
                      </div>

                      {/* Replay Prompt Button */}
                      <button
                        onClick={() => replayCurrentSpeech()}
                        className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition flex items-center gap-1"
                        title="Replay audio prompt"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Replay
                      </button>
                    </div>

                    {/* Active Voice Prompt / Dialogue Card */}
                    <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 shadow-sm">
                      <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1 flex items-center justify-between">
                        <span>Current Prompt</span>
                        <span className="text-slate-500 font-normal">{language === "tw" ? "Akan Twi" : "English"}</span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed max-h-20 overflow-y-auto">
                        {aiResponse || "Akwaaba! Welcome to Okwankyerɛfo Pa. Press 1 for English, 2 for Akan Twi."}
                      </p>
                    </div>

                    {/* Live Interim Speech / Spoken Recognition */}
                    {interimTranscript && (
                      <div className="bg-emerald-950/60 border border-emerald-800/50 rounded-xl p-2.5">
                        <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                          <Mic className="w-3 h-3 animate-pulse" />
                          <span>Caller Speech (ASR)</span>
                        </div>
                        <p className="text-xs text-emerald-100 font-medium italic">"{interimTranscript}"</p>
                      </div>
                    )}

                    {/* Keypad Buffer (if caller typed digits) */}
                    {digitsBuffer && (
                      <div className="bg-slate-950 border border-purple-800/50 rounded-xl p-2.5 flex items-center justify-between">
                        <div>
                          <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">
                            Keypad Buffer (Expected: {atExpectedDigits} digits)
                          </div>
                          <div className="text-sm font-mono text-white font-bold tracking-widest">{digitsBuffer}</div>
                        </div>
                        <button
                          onClick={submitKeypadBuffer}
                          className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold"
                        >
                          Send ({atFinishOnKey})
                        </button>
                      </div>
                    )}

                    {/* Zero-PIN USSD Push Screen Overlay */}
                    {ussdPushPrompt?.active && (
                      <div className="absolute inset-0 z-30 bg-black/90 rounded-[28px] p-5 flex flex-col justify-center items-center text-center animate-fadeIn">
                        <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mb-3">
                          <ShieldCheck className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-white mb-1">{ussdPushPrompt.title}</h4>
                        <p className="text-xs text-slate-300 mb-3">{ussdPushPrompt.message}</p>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 w-full mb-4 text-xs font-mono text-amber-300">
                          Transfer {ussdPushPrompt.amount} {ussdPushPrompt.currency} to {ussdPushPrompt.recipientName} ({ussdPushPrompt.recipientPhone})
                        </div>
                        <div className="flex gap-2 w-full">
                          <button
                            onClick={dismissUssdPrompt}
                            className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold"
                          >
                            Authorize on Phone
                          </button>
                          <button
                            onClick={dismissUssdPrompt}
                            className="px-3 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-medium"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Idle Screen */
                  <div className="space-y-4 my-auto text-center">
                    <div className="w-12 h-12 bg-slate-800/80 rounded-full mx-auto flex items-center justify-center text-slate-400 border border-slate-700/50">
                      <Phone className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Telephone Ready</h3>
                      <p className="text-xs text-slate-400 mt-1 max-w-[260px] mx-auto">
                        Bilingual trunk (+233 30 804 8098). Press Call or dial any number.
                      </p>
                    </div>

                    {/* Dial Display with Destination and Backspace */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                      <div className="flex-1 text-left">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-semibold">
                          {digitsBuffer ? "Dialed Number" : "Trunk Destination"}
                        </span>
                        <span className="text-base font-mono text-emerald-400 font-bold tracking-wider">
                          {digitsBuffer || "+233 30 804 8098"}
                        </span>
                      </div>
                      {digitsBuffer && (
                        <button
                          type="button"
                          onClick={() => setDigitsBuffer((prev) => prev.slice(0, -1))}
                          className="px-2 py-1 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg text-xs transition"
                          title="Backspace"
                        >
                          ⌫
                        </button>
                      )}
                    </div>

                    <div className="pt-1">
                      <button
                        onClick={() => startCall()}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2"
                      >
                        <Phone className="w-4 h-4" />
                        {digitsBuffer ? `Call ${digitsBuffer}` : "Call (+233 30 804 8098)"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Keypad Grid ────────────────────────────────────────── */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60">
                {KEYPAD_BUTTONS.map((btn) => (
                  <button
                    key={btn.digit}
                    onClick={() => handleKeypadDigit(btn.digit)}
                    className="h-11 bg-slate-800/60 hover:bg-slate-700/70 active:bg-slate-600 rounded-xl flex flex-col items-center justify-center text-white transition border border-slate-700/30"
                  >
                    <span className="text-sm font-bold leading-none">{btn.digit}</span>
                    {btn.sub && <span className="text-[9px] text-slate-400 leading-none mt-0.5">{btn.sub}</span>}
                  </button>
                ))}
              </div>

              {/* ── Call Action Buttons ────────────────────────────────── */}
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800/60 mt-2">
                {/* Microphone Toggle Button */}
                <button
                  onClick={toggleMic}
                  className={`p-3 rounded-2xl transition border ${
                    isMicActive
                      ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/40 shadow-sm"
                      : "bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                  title={isMicActive ? "Mute Microphone" : "Unmute Microphone"}
                >
                  {isMicActive ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
                </button>

                {/* Primary Call / Hang Up Button */}
                {isActive ? (
                  <button
                    onClick={() => endCall("User hung up")}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-950/50 transition"
                  >
                    <PhoneOff className="w-4 h-4" />
                    End Call
                  </button>
                ) : (
                  <button
                    onClick={() => startCall()}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition"
                  >
                    <Phone className="w-4 h-4" />
                    Start Call
                  </button>
                )}

                {/* Speaker / TTS Output Toggle */}
                <button
                  onClick={() => setEnableTts(!enableTts)}
                  className={`p-3 rounded-2xl transition border ${
                    enableTts
                      ? "bg-purple-600/20 text-purple-400 border-purple-500/40 shadow-sm"
                      : "bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                  title={enableTts ? "Mute Voice Prompt Playback" : "Enable Voice Prompt Playback"}
                >
                  {enableTts ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column: Activity Cockpit & Long Conversation Controls ── */}
        <div className="lg:col-span-7 space-y-4">
          {/* ── Conversation Recording & Long-Session Control Bar ───────── */}
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
                    Long Conversation Recording
                    {isRecording && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-950 text-red-400 border border-red-800 animate-pulse">
                        ● REC {formatTime(recordingDurationSec)}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isRecording
                      ? `Streaming audio chunks to /api/ai/asr/session (${recordedChunksCount} chunks processed)`
                      : "Record entire multi-minute telephone calls and save full audio & transcripts"}
                  </p>
                </div>
              </div>

              {/* Record / Stop Recording Button */}
              <div className="flex items-center gap-2">
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="px-3.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    Stop Recording
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <CircleDot className="w-3.5 h-3.5 text-red-400" />
                    Record Call
                  </button>
                )}

                <button
                  onClick={() => exportTranscript("txt")}
                  disabled={transcript.length === 0}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-xl text-xs font-medium flex items-center gap-1.5 border border-slate-700/60 transition"
                  title="Export Transcript as TXT"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Transcript
                </button>
              </div>
            </div>

            {/* Recorded Audio Playback & Download Bar (if audio was recorded) */}
            {recordedAudioUrl && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleToggleRecordedPlayback}
                    className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition shadow-sm"
                  >
                    {isPlayingRecordedAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <div>
                    <span className="text-xs font-semibold text-white block">Recorded Call Audio</span>
                    <span className="text-[11px] text-slate-400">
                      Duration: {formatTime(recordingDurationSec)} · {recordedChunksCount} chunks
                    </span>
                  </div>
                  <audio
                    ref={recordedAudioPlayerRef}
                    src={recordedAudioUrl}
                    onEnded={() => setIsPlayingRecordedAudio(false)}
                    className="hidden"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={downloadRecording}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Audio (.webm)
                  </button>
                </div>
              </div>
            )}

            {/* Rolling Summary (if present from long conversation engine) */}
            {rollingSummary && (
              <div className="bg-purple-950/40 border border-purple-800/40 rounded-xl p-3 text-xs text-purple-200">
                <span className="font-bold text-purple-300 block mb-0.5 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Rolling Conversation Summary
                </span>
                {rollingSummary}
              </div>
            )}
          </div>

          {/* ── Preset Scenarios Quick Runner ───────────────────────────── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-white">Preset Scenarios:</span>
            </div>

            <div className="flex items-center gap-2 flex-1 max-w-md">
              <select
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 text-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
              >
                <option value="">Select a test scenario...</option>
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
                onClick={() => {
                  if (!selectedScenarioId) return;
                  if (selectedScenarioId.startsWith("at:")) {
                    runAtPresetScenario(selectedScenarioId.replace("at:", ""));
                  } else {
                    runScenario(selectedScenarioId.replace("ai:", ""));
                  }
                }}
                disabled={!selectedScenarioId}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition"
              >
                Run
              </button>
            </div>
          </div>

          {/* ── Cockpit Tabs & Live Conversation Feed ──────────────────── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[520px]">
            {/* Tab Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab("transcript")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    activeTab === "transcript"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Call Transcript ({transcript.length})
                </button>
                <button
                  onClick={() => setActiveTab("telephony_logs")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    activeTab === "telephony_logs"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Telephony Logs ({atHttpLogs.length})
                </button>
              </div>

              <span className="text-[11px] text-slate-500 font-mono">
                Session: {sessionId.slice(0, 16)}
              </span>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeTab === "transcript" ? (
                transcript.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12">
                    <Phone className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm font-medium">No conversation turns recorded yet.</p>
                    <p className="text-xs text-slate-600 mt-1">Start a call or speak to begin live transcription.</p>
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
                        <div className="my-1 px-3 py-1 bg-slate-950/80 border border-slate-800 rounded-full text-[11px] text-slate-400 font-mono">
                          {item.text}
                        </div>
                      ) : (
                        <div
                          className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-sm ${
                            item.role === "caller"
                              ? "bg-emerald-600 text-white rounded-br-none"
                              : "bg-slate-800 text-slate-100 border border-slate-700/60 rounded-bl-none"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 mb-1 text-[10px] opacity-75">
                            <span className="font-bold">
                              {item.role === "caller" ? "CALLER" : "ƆKWANKYERƐFO PA (IVR)"}
                            </span>
                            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p>{item.text}</p>
                          {item.intent && item.role === "ai" && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] bg-slate-900/60 text-slate-300">
                              Intent: {item.intent}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )
              ) : (
                /* Africa's Talking HTTP & VoiceXML Logs */
                atHttpLogs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-12">
                    <Terminal className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm font-medium">No HTTP webhook traces yet.</p>
                    <p className="text-xs text-slate-600 mt-1">Telemetry triggers automatically upon DTMF or call steps.</p>
                  </div>
                ) : (
                  atHttpLogs.map((log) => (
                    <div key={log.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs">
                      <div className="flex items-center justify-between text-slate-400 mb-1.5">
                        <span className="text-emerald-400 font-bold">{log.method} {log.endpoint}</span>
                        <span className="text-slate-500">{log.timestamp}</span>
                      </div>
                      <div className="text-slate-300 text-[11px] bg-slate-900 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
                        {log.voiceXml}
                      </div>
                    </div>
                  ))
                )
              )}
              <div ref={transcriptEndRef} />
            </div>

            {/* Bottom Utterance / Spoken Input Bar */}
            <form onSubmit={handleSendTyped} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={typedUtterance}
                onChange={(e) => setTypedUtterance(e.target.value)}
                placeholder="Type spoken utterance to test (e.g. 'Mepɛ sɛ mesoma sika 20 cedis' or 'Send money')..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={!typedUtterance.trim()}
                className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
