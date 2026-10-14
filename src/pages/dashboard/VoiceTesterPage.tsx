import React, { useEffect, useState } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Copy,
  Check,
  AlertTriangle,
  RotateCcw,
  FastForward,
  ShieldCheck,
  Clock,
  Code,
  Terminal,
} from "lucide-react";
import { useCallSession, CALL_STEPS, CallStep } from "../../hooks/useCallSession";
import { useDtmf } from "../../hooks/useDtmf";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";

export const VoiceTesterPage: React.FC = () => {
  const session = useCallSession();
  const { playTone } = useDtmf();
  const [copiedXml, setCopiedXml] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<"voicexml" | "state" | "logs">("voicexml");
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  // Audio player integration
  const audio = useAudioPlayer();

  // Play audio when currentAudioUrl changes
  useEffect(() => {
    if (session.isActive && session.currentAudioUrl) {
      audio.playAudio(session.currentAudioUrl);
    } else {
      audio.stopAudio();
    }
  }, [session.isActive, session.currentAudioUrl]);

  // Speech recognition integration (disabled when muted or inactive)
  const speech = useSpeechRecognition({
    language: session.language || "en",
    isMuted: !session.isActive || session.isMicMuted,
    isSpeaking: audio.isPlaying,
    activePrompt: session.currentAudioUrl || "",
    onMatch: (result) => {
      if (result.resolvedDigit) {
        handleKeyPress(result.resolvedDigit);
      }
    },
  });

  const handleKeyPress = (digit: string) => {
    playTone(digit);
    setPressedKey(digit);
    setTimeout(() => setPressedKey(null), 150);
    session.handleKeypadDigit(digit);
  };

  // Keyboard mapping to physical keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!session.isActive) return;
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) return;

      const key = e.key;
      if (/^[0-9]$/.test(key)) {
        handleKeyPress(key);
      } else if (key === "#" || key === "Enter") {
        e.preventDefault();
        handleKeyPress("#");
      } else if (key === "*" || key === ".") {
        e.preventDefault();
        handleKeyPress("*");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [session.isActive]);

  const copyVoiceXml = () => {
    navigator.clipboard.writeText(session.voiceXml);
    setCopiedXml(true);
    setTimeout(() => setCopiedXml(false), 2000);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Purpose Banner */}
      <div className="bg-white dark:bg-[#101B15] p-5 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
            Interactive VoiceXML &amp; Handset Simulator
          </h1>
          <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-0.5">
            Test the full 10-step accessibility flow with synthesized DTMF audio, speech detection, and Zero-PIN security handoff.
          </p>
        </div>

        {/* Quick Language Starters */}
        <div className="flex items-center gap-2">
          {!session.isActive ? (
            <>
              <button
                onClick={() => session.startCall("en")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F382A] text-white hover:bg-[#1A543F] text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Start Call (English)</span>
              </button>
              <button
                onClick={() => session.startCall("twi")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-[#0F382A] hover:bg-[#E2BC4B] text-xs font-bold rounded-xl shadow-xs transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Hyɛ Aseɛ (Twi)</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => session.endCall("CANCELLED")}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#A32828] text-white hover:bg-[#C53939] text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>Hang Up Call (0)</span>
            </button>
          )}
        </div>
      </div>

      {/* Language Isolation Warning (if triggered) */}
      {session.languageIsolationViolation && (
        <div className="p-4 bg-[#A32828]/15 border border-[#A32828] rounded-xl flex items-center gap-3 text-[#A32828] dark:text-[#FF6B6B] text-xs font-bold">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            CRITICAL SECURITY WARNING: Dual-track language isolation violated! Cross-language audio or prompt attempted after language selection.
          </span>
        </div>
      )}

      {/* 3-Column Studio Grid: Tracker (Left) — Handset (Center) — VoiceXML & State (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── Column 1: Vertical 10-Step Call Flow Tracker ─────────────── */}
        <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-900">
              Call-Flow Pipeline
            </span>
            <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              10 STEPS
            </span>
          </div>

          <div className="space-y-1.5" role="list">
            {CALL_STEPS.map((s, idx) => {
              const isCurrent = session.step === s.id;
              const isPassed = CALL_STEPS.findIndex((x) => x.id === session.step) > idx;

              return (
                <button
                  key={s.id}
                  onClick={() => session.goToStep(s.id)}
                  className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between ${
                    isCurrent
                      ? "bg-emerald-700 text-white font-bold shadow-xs border-l-4 border-amber-400"
                      : isPassed
                      ? "bg-slate-50 text-slate-700 border border-slate-200/60"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <div className="truncate">
                    <div>{session.language === "twi" ? s.nameTwi : s.nameEn}</div>
                    <div className="text-[10px] opacity-75 truncate">{s.expectedInput}</div>
                  </div>
                  {isCurrent && (
                    <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping" />
                  )}
                  {isPassed && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                </button>
              );
            })}
          </div>

          {/* Quick Simulation Jumps */}
          <div className="pt-3 border-t border-slate-100 space-y-1.5">
            <span className="text-[10px] font-bold uppercase text-slate-500 block">
              Simulation Fast Jumps:
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => session.goToStep("recipient")}
                className="py-1 px-2 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 text-slate-700"
              >
                Jump to Phone (40s)
              </button>
              <button
                onClick={() => session.goToStep("zero_pin")}
                className="py-1 px-2 text-[10px] font-bold bg-rose-50 text-rose-800 hover:bg-rose-100 rounded border border-rose-200"
              >
                Zero-PIN Handoff
              </button>
              <button
                onClick={() => session.goToStep("kyc")}
                className="py-1 px-2 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 text-slate-700"
              >
                KYC Readback
              </button>
              <button
                onClick={() => session.goToStep("receipt")}
                className="py-1 px-2 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 rounded border border-slate-200 text-slate-700"
              >
                Spoken Receipt
              </button>
            </div>
          </div>
        </div>

        {/* ── Column 2: Realistic Feature Phone Handset (Nokia/Itel Style) ─ */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <div className="w-full max-w-[340px] bg-[#121A15] p-5 rounded-[44px] border-[5px] border-[#2B3B30] shadow-2xl space-y-4">
            {/* Handset Speaker Notch */}
            <div className="w-16 h-2 bg-[#2B3B30] rounded-full mx-auto" />

            {/* Handset Screen */}
            <div className="relative bg-[#1A261F] rounded-2xl p-4 border border-[#2F4436] min-h-[220px] flex flex-col justify-between text-neutral-100">
              {/* Screen Top Status Bar */}
              <div className="flex items-center justify-between text-[11px] font-mono text-[#D4AF37] pb-2 border-b border-[#2F4436]">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${session.isActive ? "bg-emerald-400 animate-pulse" : "bg-neutral-500"}`} />
                  <span>{session.isActive ? "CALL ACTIVE" : "HANDSET READY"}</span>
                </div>
                <div className="font-bold">{formatTime(session.callDurationSec)}</div>
              </div>

              {/* Main Screen Content */}
              <div className="py-3 space-y-2 text-center">
                <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider">
                  {session.step.toUpperCase()} STEP
                </div>

                {/* Spoken Prompt Indicator */}
                <div className="p-2.5 rounded-lg bg-[#0F1813] border border-[#2F4436] text-xs text-neutral-200 min-h-[50px] flex items-center justify-center">
                  {audio.isPlaying ? (
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Volume2 className="w-4 h-4 animate-bounce shrink-0" />
                      <span className="italic truncate text-[11px]">Prompt playing...</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-neutral-400">
                      {session.isActive ? "Awaiting keypad punch or speech..." : "Press Call to Begin"}
                    </span>
                  )}
                </div>

                {/* Input Buffer / Number Display */}
                {session.digitsBuffer && (
                  <div className="font-mono text-lg font-bold text-[#D4AF37] tracking-widest">
                    {session.digitsBuffer}
                  </div>
                )}

                {/* Timers (40s or 30s) */}
                {session.stepRemainingSec !== null && (
                  <div className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                    <Clock className="w-3 h-3" />
                    <span>Timer: {session.stepRemainingSec}s window</span>
                  </div>
                )}
              </div>

              {/* Screen Bottom Security & Mic Status */}
              <div className="pt-2 border-t border-[#2F4436] flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1">
                  {session.isMicMuted ? (
                    <span className="inline-flex items-center gap-1 text-[#FF6B6B] font-bold">
                      <MicOff className="w-3 h-3" />
                      <span>MIC MUTED (Zero-PIN)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <Mic className="w-3 h-3" />
                      <span>Mic Listening</span>
                    </span>
                  )}
                </div>
                <div className="font-mono text-neutral-400 uppercase">
                  {session.language ? session.language.toUpperCase() : "BILINGUAL"}
                </div>
              </div>

              {/* Simulated Handset USSD Push Modal (For Zero-PIN Step) */}
              {session.isPinModalOpen && (
                <div className="absolute inset-2 bg-[#090F0C] border-2 border-emerald-500 rounded-xl p-3 flex flex-col justify-between shadow-2xl z-20">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-emerald-400 font-mono font-bold">
                      <span>MTN MoMo PUSH</span>
                      <span>SECURE USSD</span>
                    </div>
                    <div className="text-xs font-bold text-white">
                      Authorize GH₵ {session.amount}.00 to {session.recipientName}?
                    </div>
                    <div className="text-[10px] text-neutral-400 font-mono">
                      Ref: {session.referenceId}
                    </div>
                  </div>

                  <div className="py-2 text-center">
                    <div className="text-[10px] text-[#D4AF37] mb-1 font-semibold">
                      Enter 4-digit secret PIN on screen:
                    </div>
                    <div className="flex justify-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#D4AF37]" />
                      <span className="w-3 h-3 rounded-full bg-[#D4AF37]" />
                      <span className="w-3 h-3 rounded-full bg-[#D4AF37]" />
                      <span className="w-3 h-3 rounded-full bg-[#D4AF37]" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-800">
                    <button
                      onClick={() => session.handleUssdPinSubmit(true)}
                      className="py-1 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold"
                    >
                      1: Approve
                    </button>
                    <button
                      onClick={() => session.handleUssdPinSubmit(false)}
                      className="py-1 px-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-[11px] font-bold"
                    >
                      2: Decline
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Handset Physical Controls (Call / End / D-Pad) */}
            <div className="grid grid-cols-3 gap-2 px-2">
              <button
                onClick={() => session.startCall(session.language || "en")}
                className="py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl flex items-center justify-center font-bold shadow-xs active:scale-95"
                title="Place Call"
              >
                <Phone className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center">
                <div className="w-9 h-9 rounded-full bg-[#202E24] border border-[#354B3B] flex items-center justify-center">
                  <span className="w-3 h-3 rounded-full bg-[#D4AF37]/50" />
                </div>
              </div>

              <button
                onClick={() => session.endCall("CANCELLED")}
                className="py-2 bg-red-700 hover:bg-red-600 text-white rounded-xl flex items-center justify-center font-bold shadow-xs active:scale-95"
                title="End Call"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>

            {/* 12-Key Physical DTMF Keypad Grid */}
            <div className="grid grid-cols-3 gap-2 px-1">
              {keypadButtons.map((btn) => (
                <button
                  key={btn.digit}
                  onClick={() => handleKeyPress(btn.digit)}
                  className={`py-3 px-1 rounded-2xl flex flex-col items-center justify-center transition-all border ${
                    pressedKey === btn.digit
                      ? "bg-[#D4AF37] text-[#0F382A] border-[#D4AF37] scale-95 shadow-lg"
                      : "bg-[#1E2B22] hover:bg-[#283A2E] text-white border-[#2E4234] shadow-xs active:scale-95"
                  }`}
                >
                  <span className="text-xl font-bold font-mono leading-none">{btn.digit}</span>
                  {btn.sub && (
                    <span className="text-[8px] font-mono text-neutral-400 mt-0.5 truncate max-w-[60px]">
                      {btn.sub}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Bottom Mic Sensor Strip */}
            <div className="pt-2 text-center text-[10px] font-mono text-[#D4AF37]/80">
              OKWANKYERƐFO PA • DUAL-TONE SYNTHESIZER
            </div>
          </div>
        </div>

        {/* ── Column 3: Live VoiceXML & State Inspector (Right) ────────── */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col h-[650px] overflow-hidden">
          {/* Inspector Header Tabs */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveSideTab("voicexml")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                  activeSideTab === "voicexml"
                    ? "bg-emerald-700 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                VoiceXML Stream
              </button>
              <button
                onClick={() => setActiveSideTab("state")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                  activeSideTab === "state"
                    ? "bg-emerald-700 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Session JSON
              </button>
              <button
                onClick={() => setActiveSideTab("logs")}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                  activeSideTab === "logs"
                    ? "bg-emerald-700 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Logs
              </button>
            </div>

            {activeSideTab === "voicexml" && (
              <button
                onClick={copyVoiceXml}
                className="p-1.5 text-xs text-slate-600 hover:text-slate-900 rounded flex items-center gap-1 font-mono hover:bg-slate-200 transition-colors"
                title="Copy VoiceXML"
              >
                {copiedXml ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedXml ? "Copied" : "Copy"}</span>
              </button>
            )}
          </div>

          {/* Inspector Content */}
          <div className="flex-1 overflow-auto p-4 bg-slate-50 text-slate-800 font-mono text-xs leading-relaxed">
            {activeSideTab === "voicexml" && (
              <pre className="whitespace-pre-wrap">{session.voiceXml}</pre>
            )}

            {activeSideTab === "state" && (
              <pre className="whitespace-pre-wrap text-slate-700">
                {JSON.stringify(
                  {
                    isActive: session.isActive,
                    step: session.step,
                    language: session.language,
                    provider: session.provider,
                    recipientPhone: session.recipientPhone,
                    recipientName: session.recipientName,
                    amountGHS: session.amount,
                    referenceId: session.referenceId,
                    durationSeconds: session.callDurationSec,
                    micMuted: session.isMicMuted,
                    languageIsolationViolation: session.languageIsolationViolation,
                  },
                  null,
                  2
                )}
              </pre>
            )}

            {activeSideTab === "logs" && (
              <div className="space-y-1.5 text-[11px] text-slate-700">
                {session.eventLogs.map((log, i) => (
                  <div key={i} className="font-mono">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Control Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Webhook: /voice-menu</span>
            <span className="font-mono text-emerald-700 font-bold">Carrier: MTN GH</span>
          </div>
        </div>
      </div>
    </div>
  );
};
