import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  History,
  Phone,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Volume2,
  Play,
  Square,
  Search,
  RefreshCw,
  FileText,
  Terminal,
  Globe,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Layers,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { api, SessionRecord, SessionConversationTurn, SessionApiTrace, SessionDiagnosticEvent } from "../../lib/api";

type TabType = "flow" | "network" | "diagnostics" | "telephony";

export const CallLogsPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("flow");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOutcome, setFilterOutcome] = useState<string>("ALL");
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchSessions = async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setIsRefreshing(true);
    try {
      const data = await api.getSessions();
      setSessions(data);
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].sessionId);
      }
    } catch (err) {
      console.warn("Failed to load call sessions:", err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(() => {
      fetchSessions(false);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const selectedSession = useMemo(() => {
    return sessions.find((s) => s.sessionId === selectedSessionId) || sessions[0] || null;
  }, [sessions, selectedSessionId]);

  // Filtered session list
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        s.sessionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.callerNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.recipientName && s.recipientName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.recipientPhone && s.recipientPhone.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.referenceId && s.referenceId.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesFilter =
        filterOutcome === "ALL" ||
        (filterOutcome === "COMPLETED" && s.outcome === "COMPLETED") ||
        (filterOutcome === "IN_PROGRESS" && s.outcome === "IN_PROGRESS") ||
        (filterOutcome === "FAILED" && (s.outcome === "FAILED" || s.outcome === "CANCELLED" || s.outcome === "TIMEOUT"));

      return matchesSearch && matchesFilter;
    });
  }, [sessions, searchQuery, filterOutcome]);

  // Aggregated analytics metrics
  const totalCalls = sessions.length;
  const completedCalls = sessions.filter((s) => s.outcome === "COMPLETED").length;
  const completionRate = totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(0) : "100";
  const avgDuration =
    totalCalls > 0
      ? Math.round(sessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) / totalCalls)
      : 0;

  // Total turns and API requests across all sessions
  const totalTurns = sessions.reduce((acc, s) => acc + (s.conversationTurns?.length || 0), 0);
  const totalApiRequests = sessions.reduce((acc, s) => acc + (s.apiRequests?.length || 0), 0);

  // Play assistant audio safely
  const handlePlayAudio = async (turn: SessionConversationTurn) => {
    if (playingAudioId === turn.id) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlayingAudioId(null);
      return;
    }

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      setPlayingAudioId(turn.id);
      audioRef.current.onended = () => setPlayingAudioId(null);
      audioRef.current.onerror = () => setPlayingAudioId(null);

      // 1. Direct audio clip if available
      if (turn.assistantAudioUrl) {
        audioRef.current.src = turn.assistantAudioUrl;
        await audioRef.current.play();
        return;
      }

      // 2. Synthesize dynamically via backend speech router
      const synth = await api.synthesizeSpeech({
        text: turn.assistantResponse,
        language: selectedSession?.language === "twi" ? "tw" : "en",
        sessionId: selectedSession?.sessionId,
      });

      if (synth?.result?.audioBase64 && audioRef.current) {
        const mime = synth.result.audioMimeType || "audio/wav";
        audioRef.current.src = `data:${mime};base64,${synth.result.audioBase64}`;
        await audioRef.current.play();
      } else {
        setPlayingAudioId(null);
      }
    } catch (e) {
      console.warn("Audio playback failed:", e);
      setPlayingAudioId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
              <History className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
              Call Logs &amp; Conversation Tracing
            </h1>
          </div>
          <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-1">
            Real-time session audit for Ghana financial accessibility: inspect conversation flow turns, HCI Lab ASR / TTS API traces, and Zero-PIN safeguards.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => fetchSessions(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-xl border border-[#0F382A]/15 dark:border-[#D4AF37]/30 bg-white dark:bg-[#101B15] hover:bg-[#FAF9F5] dark:hover:bg-[#16241D] text-[#111A15] dark:text-[#F8FAF8] transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#D4AF37]" : ""}`} />
            <span>{isRefreshing ? "Syncing..." : "Live Refresh"}</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Analytics Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-[#101B15] rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#5E7265] uppercase">Total Sessions</span>
            <Phone className="w-3.5 h-3.5 text-[#5E7265]" />
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-[#111A15] dark:text-[#F8FAF8]">
            {totalCalls} Calls
          </div>
          <span className="text-[10px] text-[#5E7265] font-mono">Simulated &amp; Telephony</span>
        </div>

        <div className="p-4 bg-white dark:bg-[#101B15] rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#5E7265] uppercase">Completion Rate</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-emerald-500">
            {completionRate}%
          </div>
          <span className="text-[10px] text-[#5E7265] font-mono">{completedCalls} of {totalCalls} completed</span>
        </div>

        <div className="p-4 bg-white dark:bg-[#101B15] rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#5E7265] uppercase">Total Speech Turns</span>
            <Activity className="w-3.5 h-3.5 text-[#D4AF37]" />
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-[#D4AF37]">
            {totalTurns} Turns
          </div>
          <span className="text-[10px] text-[#5E7265] font-mono">ASR &amp; Dialogue passes</span>
        </div>

        <div className="p-4 bg-white dark:bg-[#101B15] rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-[#5E7265] uppercase">API Traces Logged</span>
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-2xl font-black font-mono mt-1 text-sky-400">
            {totalApiRequests} Requests
          </div>
          <span className="text-[10px] text-[#5E7265] font-mono">ASR, TTS &amp; MoMo calls</span>
        </div>
      </div>

      {/* Main Split Layout: Session Selector List (Left) + Detailed Session Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Sessions List */}
        <div className="lg:col-span-5 space-y-3">
          {/* Search & Filter Bar */}
          <div className="p-3 bg-white dark:bg-[#101B15] rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs space-y-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#5E7265]" />
              <input
                type="text"
                placeholder="Search session, phone, or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border border-[#0F382A]/10 text-[#111A15] dark:text-[#F8FAF8] focus:outline-none focus:border-[#D4AF37]/50 font-mono"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono">
              {["ALL", "COMPLETED", "IN_PROGRESS", "FAILED"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterOutcome(tab)}
                  className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                    filterOutcome === tab
                      ? "bg-[#D4AF37] text-neutral-950 font-bold"
                      : "bg-[#FAF9F5] dark:bg-[#16241D] text-[#5E7265] hover:text-[#111A15] dark:hover:text-[#F8FAF8]"
                  }`}
                >
                  {tab === "ALL" ? "All Calls" : tab === "IN_PROGRESS" ? "Active" : tab}
                </button>
              ))}
            </div>
          </div>

          {/* Session Cards List */}
          <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
            {filteredSessions.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-[#101B15] rounded-2xl border border-[#0F382A]/10 text-xs text-[#5E7265]">
                No call sessions matched your search or filter.
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isSelected = selectedSession?.sessionId === s.sessionId;
                const turnCount = s.conversationTurns?.length || 0;
                const reqCount = s.apiRequests?.length || 0;

                return (
                  <div
                    key={s.id || s.sessionId}
                    onClick={() => setSelectedSessionId(s.sessionId)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[#D4AF37]/10 border-[#D4AF37] shadow-sm"
                        : "bg-white dark:bg-[#101B15] border-[#0F382A]/10 dark:border-[#D4AF37]/20 hover:border-[#D4AF37]/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-[#111A15] dark:text-[#F8FAF8]">
                            {s.sessionId}
                          </span>
                          {s.isDemo && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#5E7265] font-mono">
                          Caller: <span className="text-[#111A15] dark:text-[#F8FAF8]">{s.callerNumber}</span>
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                          s.outcome === "COMPLETED"
                            ? "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30"
                            : s.outcome === "IN_PROGRESS"
                            ? "bg-sky-500/15 text-sky-400 border border-sky-500/30 animate-pulse"
                            : "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                        }`}
                      >
                        {s.outcome}
                      </span>
                    </div>

                    {/* Recipient & Amount Info if available */}
                    {(s.recipientName || s.amountGHS) && (
                      <div className="mt-2.5 pt-2.5 border-t border-[#0F382A]/10 dark:border-white/5 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[#5E7265] truncate max-w-[160px]">
                          To: <strong className="text-[#111A15] dark:text-[#F8FAF8]">{s.recipientName || s.recipientPhone}</strong>
                        </span>
                        {s.amountGHS && (
                          <span className="font-bold text-[#D4AF37]">
                            GHS {s.amountGHS.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bottom Metadata Badges */}
                    <div className="mt-3 flex items-center justify-between text-[10px] font-mono text-[#5E7265]">
                      <div className="flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-[#FAF9F5] dark:bg-[#16241D] uppercase font-bold text-[#111A15] dark:text-[#F8FAF8]">
                          {s.language}
                        </span>
                        <span>{s.durationSeconds || 0}s duration</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-500">{turnCount} turns</span>
                        <span>·</span>
                        <span className="text-sky-400">{reqCount} APIs</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Session Inspector */}
        <div className="lg:col-span-7 bg-white dark:bg-[#101B15] rounded-3xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-md overflow-hidden flex flex-col">
          {selectedSession ? (
            <>
              {/* Session Header Card */}
              <div className="p-5 border-b border-[#0F382A]/10 dark:border-white/10 bg-[#FAF9F5] dark:bg-[#142019] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-black font-mono text-[#111A15] dark:text-[#F8FAF8]">
                        {selectedSession.sessionId}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          selectedSession.outcome === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-500"
                            : selectedSession.outcome === "IN_PROGRESS"
                            ? "bg-sky-500/20 text-sky-400"
                            : "bg-amber-500/20 text-amber-500"
                        }`}
                      >
                        {selectedSession.outcome}
                      </span>
                    </div>
                    <div className="text-xs text-[#5E7265] font-mono mt-0.5">
                      Started: {new Date(selectedSession.startedAt).toLocaleString()} · Step: <strong className="text-[#D4AF37]">{selectedSession.finalStep}</strong>
                    </div>
                  </div>

                  {selectedSession.referenceId && (
                    <div className="px-3 py-1.5 bg-[#D4AF37]/15 rounded-xl border border-[#D4AF37]/30 text-right">
                      <div className="text-[9px] font-mono text-[#5E7265] uppercase">MoMo Reference</div>
                      <div className="text-xs font-mono font-bold text-[#D4AF37]">{selectedSession.referenceId}</div>
                    </div>
                  )}
                </div>

                {/* Session Key Attributes Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#0F382A]/10 dark:border-white/5 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-[#5E7265] uppercase block">Caller Phone:</span>
                    <span className="font-bold text-[#111A15] dark:text-[#F8FAF8]">{selectedSession.callerNumber}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#5E7265] uppercase block">Recipient:</span>
                    <span className="font-bold text-[#111A15] dark:text-[#F8FAF8]">
                      {selectedSession.recipientName || selectedSession.recipientPhone || "None"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#5E7265] uppercase block">Amount:</span>
                    <span className="font-bold text-[#D4AF37]">
                      {selectedSession.amountGHS ? `GHS ${selectedSession.amountGHS.toFixed(2)}` : "None"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#5E7265] uppercase block">Language Mode:</span>
                    <span className="font-bold uppercase text-[#111A15] dark:text-[#F8FAF8]">{selectedSession.language}</span>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-[#0F382A]/10 dark:border-white/10 bg-white dark:bg-[#101B15] px-4">
                <button
                  onClick={() => setActiveTab("flow")}
                  className={`py-3 px-3 text-xs font-mono font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "flow"
                      ? "border-[#D4AF37] text-[#D4AF37]"
                      : "border-transparent text-[#5E7265] hover:text-[#111A15] dark:hover:text-[#F8FAF8]"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Conversation Flow ({selectedSession.conversationTurns?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab("network")}
                  className={`py-3 px-3 text-xs font-mono font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "network"
                      ? "border-[#D4AF37] text-[#D4AF37]"
                      : "border-transparent text-[#5E7265] hover:text-[#111A15] dark:hover:text-[#F8FAF8]"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>API Requests ({selectedSession.apiRequests?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab("diagnostics")}
                  className={`py-3 px-3 text-xs font-mono font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "diagnostics"
                      ? "border-[#D4AF37] text-[#D4AF37]"
                      : "border-transparent text-[#5E7265] hover:text-[#111A15] dark:hover:text-[#F8FAF8]"
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Diagnostics ({selectedSession.diagnostics?.length || 0})</span>
                </button>

                <button
                  onClick={() => setActiveTab("telephony")}
                  className={`py-3 px-3 text-xs font-mono font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
                    activeTab === "telephony"
                      ? "border-[#D4AF37] text-[#D4AF37]"
                      : "border-transparent text-[#5E7265] hover:text-[#111A15] dark:hover:text-[#F8FAF8]"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>VoiceXML ({selectedSession.voiceXmlTrace?.length || 0})</span>
                </button>
              </div>

              {/* Tab Contents */}
              <div className="p-5 max-h-[600px] overflow-y-auto space-y-4">
                {/* 1. CONVERSATION FLOW TAB */}
                {activeTab === "flow" && (
                  <div className="space-y-4">
                    {(!selectedSession.conversationTurns || selectedSession.conversationTurns.length === 0) ? (
                      <div className="p-8 text-center bg-[#FAF9F5] dark:bg-[#16241D] rounded-2xl border border-[#0F382A]/10 text-xs text-[#5E7265] font-mono">
                        No conversation turns recorded for this call yet. Use the Phone Simulator to make a live or test call!
                      </div>
                    ) : (
                      selectedSession.conversationTurns.map((turn, idx) => (
                        <div key={turn.id || idx} className="p-4 rounded-2xl bg-[#FAF9F5] dark:bg-[#16241D] border border-[#0F382A]/10 dark:border-[#D4AF37]/15 space-y-3 font-mono text-xs">
                          {/* Turn Header */}
                          <div className="flex items-center justify-between pb-2 border-b border-[#0F382A]/10 dark:border-white/5 text-[11px] text-[#5E7265]">
                            <span className="font-bold text-[#D4AF37]">TURN {turn.turnNumber || idx + 1} · {turn.step.toUpperCase()}</span>
                            <span>{turn.timestamp}</span>
                          </div>

                          {/* Caller Turn Bubble */}
                          <div className="p-3 bg-white dark:bg-[#101B15] rounded-xl border border-sky-500/20 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-sky-400 uppercase flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                <span>Caller Speech / Input</span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                {turn.asrProvider && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                    {turn.asrProvider}
                                  </span>
                                )}
                                {turn.asrConfidence !== undefined && turn.asrConfidence !== null && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-400">
                                    {(turn.asrConfidence * 100).toFixed(0)}% conf
                                  </span>
                                )}
                                {turn.asrLatencyMs && (
                                  <span className="text-[9px] text-[#5E7265]">{turn.asrLatencyMs}ms</span>
                                )}
                              </div>
                            </div>
                            <div className="text-sm font-medium text-[#111A15] dark:text-[#F8FAF8]">
                              "{turn.callerInput}"
                            </div>
                            {turn.intent && (
                              <div className="text-[10px] text-[#5E7265]">
                                Intent Detected: <strong className="text-sky-300">{turn.intent}</strong>
                              </div>
                            )}
                          </div>

                          {/* Assistant Response Bubble */}
                          <div className="p-3 bg-[#D4AF37]/5 dark:bg-[#D4AF37]/10 rounded-xl border border-[#D4AF37]/25 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-[#D4AF37] uppercase flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                <span>Assistant Spoken Response</span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                {turn.ttsProvider && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-[#D4AF37]/20 text-[#D4AF37]">
                                    {turn.ttsProvider}
                                  </span>
                                )}
                                <button
                                  onClick={() => handlePlayAudio(turn)}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#D4AF37] hover:bg-[#b89528] text-neutral-950 font-bold text-[10px] transition-colors"
                                >
                                  {playingAudioId === turn.id ? (
                                    <>
                                      <Square className="w-2.5 h-2.5 fill-current" />
                                      <span>Stop</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-2.5 h-2.5 fill-current" />
                                      <span>Play Audio</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                            <div className="text-xs text-[#111A15] dark:text-[#F8FAF8] leading-relaxed">
                              {turn.assistantResponse}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 2. API REQUESTS & NETWORK TRACE TAB */}
                {activeTab === "network" && (
                  <div className="space-y-3 font-mono">
                    {(!selectedSession.apiRequests || selectedSession.apiRequests.length === 0) ? (
                      <div className="p-8 text-center bg-[#FAF9F5] dark:bg-[#16241D] rounded-2xl border border-[#0F382A]/10 text-xs text-[#5E7265]">
                        No API requests recorded for this session.
                      </div>
                    ) : (
                      selectedSession.apiRequests.map((req, i) => (
                        <div
                          key={req.id || i}
                          className="p-3.5 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border border-[#0F382A]/10 dark:border-white/5 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  req.method === "POST"
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-sky-500/15 text-sky-400"
                                }`}
                              >
                                {req.method}
                              </span>
                              <span className="font-bold text-[#111A15] dark:text-[#F8FAF8]">
                                {req.endpoint}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="text-[#5E7265]">{req.latencyMs}ms</span>
                              <span
                                className={`px-2 py-0.5 rounded font-bold ${
                                  req.httpStatus >= 200 && req.httpStatus < 300
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-red-500/20 text-red-400"
                                }`}
                              >
                                {req.httpStatus} {req.status}
                              </span>
                            </div>
                          </div>

                          <div className="text-[11px] text-[#5E7265] space-y-1 pt-1 border-t border-[#0F382A]/5 dark:border-white/5">
                            <div>Provider: <strong className="text-[#D4AF37]">{req.provider}</strong></div>
                            {req.requestSummary && <div>Request: {req.requestSummary}</div>}
                            {req.responseSummary && (
                              <div className="text-emerald-400/90">Response: {req.responseSummary}</div>
                            )}
                            {req.errorMessage && (
                              <div className="text-red-400">Error: {req.errorMessage}</div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 3. DIAGNOSTICS & BUG AUDIT TAB */}
                {activeTab === "diagnostics" && (
                  <div className="space-y-3 font-mono">
                    <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-400">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>Zero-PIN Security Active: Mobile Money secret PINs are strictly guarded and never verbalized over voice telephony channels.</span>
                    </div>

                    {(!selectedSession.diagnostics || selectedSession.diagnostics.length === 0) ? (
                      <div className="p-8 text-center bg-[#FAF9F5] dark:bg-[#16241D] rounded-2xl border border-[#0F382A]/10 text-xs text-[#5E7265]">
                        No warnings or diagnostic alerts recorded for this session. Clean execution.
                      </div>
                    ) : (
                      selectedSession.diagnostics.map((diag, i) => (
                        <div
                          key={diag.id || i}
                          className={`p-3 rounded-xl border text-xs space-y-1 ${
                            diag.type === "ERROR" || diag.type === "RATE_LIMIT"
                              ? "bg-red-500/10 border-red-500/25 text-red-400"
                              : diag.type === "WARN" || diag.type === "QUOTA"
                              ? "bg-amber-500/10 border-amber-500/25 text-amber-400"
                              : "bg-[#FAF9F5] dark:bg-[#16241D] border-[#0F382A]/10 text-[#5E7265]"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span>{diag.type}</span>
                            <span>{diag.timestamp}</span>
                          </div>
                          <div>{diag.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 4. VOICEXML & TELEPHONY TRACE TAB */}
                {activeTab === "telephony" && (
                  <div className="space-y-3 font-mono text-xs">
                    {(!selectedSession.voiceXmlTrace || selectedSession.voiceXmlTrace.length === 0) ? (
                      <div className="p-8 text-center bg-[#FAF9F5] dark:bg-[#16241D] rounded-2xl border border-[#0F382A]/10 text-xs text-[#5E7265]">
                        No VoiceXML responses generated (this session operated via Direct AI Simulator).
                      </div>
                    ) : (
                      selectedSession.voiceXmlTrace.map((trace, i) => (
                        <div key={i} className="p-3 bg-[#090F0C] text-emerald-400 rounded-xl border border-neutral-800 space-y-1.5 overflow-hidden">
                          <div className="flex items-center justify-between text-[10px] text-neutral-400 pb-1 border-b border-neutral-800">
                            <span className="text-[#D4AF37] font-bold">STAGE {i + 1}: {trace.step.toUpperCase()}</span>
                            <span>{trace.timestamp}</span>
                          </div>
                          <pre className="whitespace-pre-wrap overflow-x-auto text-[11px] font-mono leading-relaxed">
                            {trace.voiceXml}
                          </pre>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-20 text-center text-neutral-500 font-mono text-xs space-y-2">
              <Phone className="w-8 h-8 mx-auto text-neutral-600 opacity-60" />
              <div>Select a session from the left to inspect conversation turns &amp; API requests.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
