import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Download,
  Copy,
  Trash2,
  Pause,
  Play,
  ArrowDown,
  Search,
  Check,
  Delete,
} from "lucide-react";
import { usePhoneSimulator } from "../../hooks/usePhoneSimulator";
import { useSimulatorLog, LogCategory, SimulatorLogEntry } from "../../lib/simulatorLog";

interface KeypadButtonDef {
  digit: string;
  sub: string;
}

const KEYPAD_BUTTONS: KeypadButtonDef[] = [
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

const CATEGORY_COLORS: Record<LogCategory, { text: string; bg: string; border: string }> = {
  KEY: { text: "text-amber-400", bg: "bg-amber-950/40", border: "border-amber-800/40" },
  AUDIO: { text: "text-purple-400", bg: "bg-purple-950/40", border: "border-purple-800/40" },
  MIC: { text: "text-emerald-400", bg: "bg-emerald-950/40", border: "border-emerald-800/40" },
  ASR: { text: "text-cyan-400", bg: "bg-cyan-950/40", border: "border-cyan-800/40" },
  MATCH: { text: "text-blue-400", bg: "bg-blue-950/40", border: "border-blue-800/40" },
  BRAIN: { text: "text-indigo-400", bg: "bg-indigo-950/40", border: "border-indigo-800/40" },
  TURN: { text: "text-yellow-300", bg: "bg-yellow-950/40", border: "border-yellow-800/40" },
  TTS: { text: "text-pink-400", bg: "bg-pink-950/40", border: "border-pink-800/40" },
  STEP: { text: "text-teal-400", bg: "bg-teal-950/40", border: "border-teal-800/40" },
  ERROR: { text: "text-rose-400", bg: "bg-rose-950/40", border: "border-rose-800/40" },
};

const ALL_CATEGORIES: LogCategory[] = [
  "KEY",
  "AUDIO",
  "MIC",
  "ASR",
  "MATCH",
  "BRAIN",
  "TURN",
  "STEP",
  "ERROR",
];

export function PhoneSimulatorPage() {
  const {
    isActive,
    callDurationSec,
    currentStep,
    digitsBuffer,
    setDigitsBuffer,
    isMicActive,
    isAiSpeaking,
    isLoading,
    language,
    setLanguage,
    startCall,
    endCall,
    handleKeypadDigit,
    toggleMic,
    aiResponse,
    transcriptionStatus,
    aiProcessingDetail,
    micState,
    micErrorMessage,
    vadState,
  } = usePhoneSimulator();

  const { logs, clear, exportText } = useSimulatorLog();

  // Terminal state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<LogCategory>>(
    () => new Set(ALL_CATEGORIES)
  );
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  const terminalScrollRef = useRef<HTMLDivElement>(null);

  // Format call timer mm:ss
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Handle backspace on digits buffer
  const handleBackspace = () => {
    setDigitsBuffer((prev) => prev.slice(0, -1));
  };

  // Physical keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in search input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (/^[0-9*#]$/.test(e.key)) {
        e.preventDefault();
        setPressedKey(e.key);
        setTimeout(() => setPressedKey(null), 150);
        handleKeypadDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeypadDigit]);

  // Filter logs by search and active category chips
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (!selectedCategories.has(log.category)) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesMsg = log.message.toLowerCase().includes(query);
        const matchesCategory = log.category.toLowerCase().includes(query);
        const matchesTurn = log.turnId?.toLowerCase().includes(query) || false;
        if (!matchesMsg && !matchesCategory && !matchesTurn) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedCategories, searchQuery]);

  // Auto-scroll terminal to bottom unless paused or scrolled up
  useEffect(() => {
    if (!isAutoScrollPaused && !isUserScrolledUp && terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [filteredLogs, isAutoScrollPaused, isUserScrolledUp]);

  const handleScroll = () => {
    if (!terminalScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalScrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
      setIsUserScrolledUp(false);
    }
  };

  const toggleCategoryFilter = (cat: LogCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const selectAllCategories = () => {
    setSelectedCategories(new Set(ALL_CATEGORIES));
  };

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(exportText());
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownloadLogs = () => {
    const text = exportText();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `call_log_${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Derive status strip indicators
  const speakerStatus = isAiSpeaking
    ? { color: "bg-emerald-500", text: "Playing" }
    : { color: "bg-slate-400", text: "Silent" };

  const micStatus = (() => {
    if (micErrorMessage || micState === "MIC_UNAVAILABLE") {
      return { color: "bg-rose-500", text: "Error" };
    }
    if (micState === "MIC_STARTING") {
      return { color: "bg-amber-400 animate-pulse", text: "Starting" };
    }
    if (micState === "MIC_MUTED") {
      return { color: "bg-rose-500", text: "Muted" };
    }
    if (transcriptionStatus === "PROCESSING") {
      return { color: "bg-amber-500", text: "Processing" };
    }
    if (vadState === "SPEECH") {
      return { color: "bg-emerald-400 animate-pulse", text: "Hearing speech" };
    }
    if (isMicActive) {
      return { color: "bg-emerald-500", text: "Listening" };
    }
    return { color: "bg-slate-400", text: "Off" };
  })();

  const networkStatus = isLoading
    ? { color: "bg-amber-400 animate-pulse", text: "In flight" }
    : { color: "bg-emerald-500", text: "Idle" };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-900 text-slate-100 font-sans">
      {/* ─────────────────────────────────────────────────────────── */}
      {/* LEFT PANEL: THE TRADITIONAL HANDSET PHONE                  */}
      {/* ─────────────────────────────────────────────────────────── */}
      <div className="w-full lg:w-[420px] flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col items-center justify-center p-4 lg:p-6 overflow-y-auto">
        {/* Handset Outer Body Chassis */}
        <div className="w-[340px] bg-slate-950 rounded-[44px] p-4 border-4 border-slate-800 shadow-2xl flex flex-col items-center relative transition-all">
          {/* Top Speaker / Ear Piece Grill */}
          <div className="w-16 h-1.5 bg-slate-700 rounded-full mb-3 shadow-inner" />

          {/* Handset OLED Screen */}
          <div className="w-full bg-slate-900 border border-slate-700/80 rounded-2xl p-3 flex flex-col min-h-[175px] shadow-inner mb-4 relative overflow-hidden">
            {/* Top Bar: Call Status & Timer */}
            <div className="flex items-center justify-between text-xs text-slate-300 font-mono pb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isActive ? "bg-emerald-500 animate-pulse" : "bg-slate-500"
                  }`}
                />
                <span className="font-semibold uppercase tracking-wide">
                  {isActive ? "Connected" : "Idle"}
                </span>
              </div>
              <span className="font-mono text-emerald-400 font-bold">
                {isActive ? formatTimer(callDurationSec) : "00:00"}
              </span>
            </div>

            {/* Prompt Text / Current Step Area */}
            <div className="flex-1 py-2 flex flex-col justify-center">
              <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold mb-1">
                Step: {currentStep} · Lang: {language.toUpperCase()}
              </div>
              <div
                className="text-xs text-slate-200 line-clamp-3 leading-relaxed font-sans"
                title={aiResponse || "Welcome to Ɔkwankyerɛfo Pa"}
              >
                {isActive
                  ? aiResponse || "Akwaaba! Welcome to Ɔkwankyerɛfo Pa."
                  : "Phone ready. Press Call to start."}
              </div>

              {/* Noticeable Microphone Error Banner if error occurs */}
              {micErrorMessage && (
                <div
                  data-testid="mic-error-banner"
                  className="mt-2 p-2 bg-rose-950/90 border border-rose-500/80 rounded-lg text-[11px] text-rose-200 leading-snug shadow-md"
                >
                  <div className="font-bold text-rose-400 flex items-center gap-1 mb-0.5">
                    <span>⚠️ Microphone Notice</span>
                  </div>
                  <div className="break-words">{micErrorMessage}</div>
                </div>
              )}
            </div>

            {/* Hardware Status Strip */}
            <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-800 text-[10px] font-mono">
              <div className="flex items-center gap-1 bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800">
                <span className={`w-1.5 h-1.5 rounded-full ${speakerStatus.color}`} />
                <span className="text-slate-400 truncate">SPK: {speakerStatus.text}</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800">
                <span className={`w-1.5 h-1.5 rounded-full ${micStatus.color}`} />
                <span className="text-slate-400 truncate">MIC: {micStatus.text}</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800">
                <span className={`w-1.5 h-1.5 rounded-full ${networkStatus.color}`} />
                <span className="text-slate-400 truncate">NET: {networkStatus.text}</span>
              </div>
            </div>
          </div>

          {/* Digits Display Line */}
          <div className="w-full h-11 bg-slate-900/90 border border-slate-800 rounded-xl px-3 flex items-center justify-between font-mono mb-4">
            <span className="text-emerald-400 text-lg font-bold tracking-widest overflow-hidden text-ellipsis whitespace-nowrap">
              {digitsBuffer || <span className="text-slate-600 text-sm tracking-normal">Enter digits...</span>}
            </span>
            {digitsBuffer.length > 0 && (
              <button
                type="button"
                onClick={handleBackspace}
                aria-label="Backspace"
                className="text-slate-400 hover:text-rose-400 p-1 rounded transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <Delete size={16} />
              </button>
            )}
          </div>

          {/* Classic 12-Key Physical Keypad */}
          <div className="grid grid-cols-3 gap-3 w-full mb-4">
            {KEYPAD_BUTTONS.map((btn) => {
              const isPushed = pressedKey === btn.digit;
              return (
                <button
                  key={btn.digit}
                  type="button"
                  aria-label={`Key ${btn.digit} ${btn.sub}`}
                  onClick={() => {
                    setPressedKey(btn.digit);
                    setTimeout(() => setPressedKey(null), 120);
                    handleKeypadDigit(btn.digit);
                  }}
                  className={`h-12 rounded-2xl flex flex-col items-center justify-center border transition-all duration-75 select-none focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                    isPushed
                      ? "bg-emerald-600 border-emerald-400 text-white scale-95 shadow-inner"
                      : "bg-slate-900 border-slate-700/70 text-slate-100 hover:bg-slate-800 hover:border-slate-500 active:scale-95 shadow-md"
                  }`}
                >
                  <span className="text-lg font-bold leading-none font-mono">{btn.digit}</span>
                  {btn.sub && (
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter leading-none mt-0.5">
                      {btn.sub}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action Row: Green Call & Red Hang Up */}
          <div className="grid grid-cols-2 gap-3 w-full mb-4">
            <button
              type="button"
              aria-label="Start Call"
              disabled={isActive}
              onClick={() => startCall(language === "tw" ? "tw" : "en")}
              className={`h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm tracking-wide transition-all shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-400 ${
                isActive
                  ? "bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400 shadow-emerald-950/40"
              }`}
            >
              <Phone size={18} />
              <span>Call</span>
            </button>

            <button
              type="button"
              aria-label="Hang Up"
              disabled={!isActive}
              onClick={() => endCall("User pressed hang up")}
              className={`h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-sm tracking-wide transition-all shadow-lg active:scale-95 focus:outline-none focus:ring-2 focus:ring-rose-400 ${
                !isActive
                  ? "bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed"
                  : "bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 shadow-rose-950/40"
              }`}
            >
              <PhoneOff size={18} />
              <span>Hang up</span>
            </button>
          </div>

          {/* Sub-bar: Language Toggle & Mic Mute Toggle */}
          <div className="flex items-center justify-between w-full pt-2 border-t border-slate-800 text-xs">
            {/* Language Selection */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setLanguage("en")}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  language === "en" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage("tw")}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                  language === "tw" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Twi
              </button>
            </div>

            {/* Mic Mute Toggle */}
            <button
              type="button"
              onClick={toggleMic}
              aria-label={micState === "MIC_MUTED" ? "Unmute microphone" : "Mute microphone"}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                micState === "MIC_MUTED"
                  ? "bg-rose-950/60 border-rose-700 text-rose-400"
                  : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white"
              }`}
            >
              {micState === "MIC_MUTED" ? <MicOff size={13} /> : <Mic size={13} />}
              <span>{micState === "MIC_MUTED" ? "Muted" : "Mute Mic"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────── */}
      {/* RIGHT PANEL: LIVE SYSTEM LOG TERMINAL                      */}
      {/* ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col h-[50vh] lg:h-full bg-slate-950 overflow-hidden">
        {/* Terminal Header Bar */}
        <div className="h-14 bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between flex-shrink-0 gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isActive ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
              }`}
            />
            <h2 className="font-mono text-sm font-bold text-slate-100 uppercase tracking-wider">
              Call Log
            </h2>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700">
              {filteredLogs.length} events
            </span>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {/* Search filter input */}
            <div className="relative hidden sm:block w-44">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter logs..."
                className="w-full h-8 bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Clear Button */}
            <button
              type="button"
              onClick={clear}
              title="Clear all logs"
              className="h-8 px-2.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Trash2 size={13} />
              <span className="hidden md:inline">Clear</span>
            </button>

            {/* Pause / Resume Auto-scroll */}
            <button
              type="button"
              onClick={() => setIsAutoScrollPaused((prev) => !prev)}
              title={isAutoScrollPaused ? "Resume auto-scroll" : "Pause auto-scroll"}
              className={`h-8 px-2.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-colors ${
                isAutoScrollPaused
                  ? "bg-amber-950/60 border-amber-800 text-amber-400"
                  : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {isAutoScrollPaused ? <Play size={13} /> : <Pause size={13} />}
              <span className="hidden md:inline">
                {isAutoScrollPaused ? "Resume" : "Pause"}
              </span>
            </button>

            {/* Copy All */}
            <button
              type="button"
              onClick={handleCopyLogs}
              title="Copy entire log stream"
              className="h-8 px-2.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              {copiedSuccess ? (
                <>
                  <Check size={13} className="text-emerald-400" />
                  <span className="hidden md:inline text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span className="hidden md:inline">Copy</span>
                </>
              )}
            </button>

            {/* Download Log */}
            <button
              type="button"
              onClick={handleDownloadLogs}
              title="Download log file"
              className="h-8 px-2.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors"
            >
              <Download size={13} />
              <span className="hidden md:inline">.log</span>
            </button>
          </div>
        </div>

        {/* Filter Chips Bar */}
        <div className="bg-slate-900/60 border-b border-slate-800/80 px-4 py-1.5 flex items-center gap-1.5 overflow-x-auto flex-shrink-0 text-xs font-mono">
          <button
            type="button"
            onClick={selectAllCategories}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              selectedCategories.size === ALL_CATEGORIES.length
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            ALL
          </button>
          {ALL_CATEGORIES.map((cat) => {
            const isSelected = selectedCategories.has(cat);
            const color = CATEGORY_COLORS[cat];
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategoryFilter(cat)}
                className={`px-2 py-0.5 rounded text-[11px] border font-semibold transition-all ${
                  isSelected
                    ? `${color.bg} ${color.text} ${color.border}`
                    : "bg-slate-950/60 border-slate-800 text-slate-500 hover:border-slate-700"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Terminal Main Log Stream */}
        <div
          ref={terminalScrollRef}
          onScroll={handleScroll}
          className="flex-1 p-4 overflow-y-auto font-mono text-[12px] leading-relaxed text-slate-300 space-y-1 relative"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 select-none">
              <Radio size={28} className="text-slate-600 animate-pulse" />
              <p className="text-xs">Press Call to start. Events will appear here.</p>
            </div>
          ) : (
            filteredLogs.map((log, index) => {
              const prevLog = filteredLogs[index - 1];
              const isNewTurn = log.turnId && log.turnId !== prevLog?.turnId;
              const catColor = CATEGORY_COLORS[log.category] || {
                text: "text-slate-300",
                bg: "bg-slate-900",
                border: "border-slate-800",
              };
              const isSummary = log.message.includes("done in") && log.category === "TURN";
              const isExpanded = expandedLogId === log.id;

              return (
                <React.Fragment key={log.id}>
                  {/* Subtle Turn Separator */}
                  {isNewTurn && (
                    <div className="pt-2 pb-1 my-1 border-t border-slate-800/80 flex items-center gap-2 text-[10px] text-amber-500/80 font-bold tracking-wider uppercase">
                      <span>── Turn {log.turnId} ──</span>
                    </div>
                  )}

                  <div
                    onClick={() => {
                      if (log.data) {
                        setExpandedLogId(isExpanded ? null : log.id);
                      }
                    }}
                    className={`group flex items-start gap-2.5 px-2 py-1 rounded transition-colors ${
                      isSummary
                        ? "bg-slate-900/90 border-l-2 border-yellow-400 pl-3 font-semibold text-yellow-200"
                        : "hover:bg-slate-900/60"
                    } ${log.data ? "cursor-pointer" : ""}`}
                  >
                    {/* Timestamp */}
                    <span className="text-slate-500 select-none flex-shrink-0 text-[11px]">
                      {log.formattedTime}
                    </span>

                    {/* Turn tag if present */}
                    {log.turnId ? (
                      <span className="text-amber-400/90 font-bold select-none flex-shrink-0 text-[11px] w-6">
                        {log.turnId}
                      </span>
                    ) : (
                      <span className="w-6 flex-shrink-0" />
                    )}

                    {/* Category Badge */}
                    <span
                      className={`px-1.5 py-0.2 rounded text-[10px] font-bold border flex-shrink-0 select-none ${catColor.bg} ${catColor.text} ${catColor.border}`}
                    >
                      {log.category.padEnd(5)}
                    </span>

                    {/* Log Message */}
                    <span className="flex-1 break-words text-slate-200">
                      {log.message}
                    </span>

                    {/* Delta ms indicator */}
                    <span className="text-slate-600 group-hover:text-slate-400 text-[10px] select-none flex-shrink-0">
                      +{log.deltaMs}ms
                    </span>
                  </div>

                  {/* Expanded JSON payload if clicked */}
                  {isExpanded && log.data && (
                    <div className="ml-16 mr-4 my-1 p-2 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-400 overflow-x-auto">
                      <pre className="text-emerald-400">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </React.Fragment>
              );
            })
          )}

          {/* Jump to Latest Floating Pill when scrolled up */}
          {isUserScrolledUp && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="sticky bottom-3 left-1/2 -translate-x-1/2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 transition-all z-20"
            >
              <ArrowDown size={13} />
              <span>Jump to latest</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PhoneSimulatorPage;
