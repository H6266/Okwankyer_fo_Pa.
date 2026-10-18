import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  Smartphone,
  CheckCircle2,
  Sliders,
  Sparkles,
  Layers,
  ArrowRight,
  Headphones,
  Search,
  Check,
  Info,
  Radio,
  FileAudio,
  ShieldAlert,
} from "lucide-react";
import {
  MONEY_TRANSFER_FLOW_STEPS,
  AUTHENTIC_TWI_RECORDINGS,
  AUTHENTIC_EN_RECORDINGS,
  audioFlowStore,
  FlowStepAudioConfig,
  AvailableAudioFile,
} from "../../audio/audioFlowStore";
import { audioPlaybackController } from "../../audio/audioPlaybackController";

export const AudioFlowPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"NORMAL" | "CONVERSATIONAL">("NORMAL");
  const [selectedLanguage, setSelectedLanguage] = useState<"twi" | "en">("twi");
  const [masterVolume, setMasterVolume] = useState<number>(audioFlowStore.getMasterVolume());
  const [overrides, setOverrides] = useState(audioFlowStore.getOverrides());
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  // Subscribe to changes in AudioFlowStore
  useEffect(() => {
    const unsubscribe = audioFlowStore.subscribe(() => {
      setOverrides(audioFlowStore.getOverrides());
      setMasterVolume(audioFlowStore.getMasterVolume());
    });
    return unsubscribe;
  }, []);

  // Listen to AudioPlaybackController state to sync play/pause UI
  useEffect(() => {
    const unsubscribe = audioPlaybackController.subscribe((state) => {
      if (!state.isPlaying) {
        setActivePlayingId(null);
      }
    });
    return unsubscribe;
  }, []);

  // Handle master volume slider
  const handleVolumeChange = (newVal: number) => {
    audioFlowStore.setMasterVolume(newVal);
    setMasterVolume(newVal);
  };

  // Play / Stop step audio
  const handleTogglePlayStep = async (step: FlowStepAudioConfig) => {
    if (activePlayingId === step.id) {
      audioPlaybackController.stop();
      setActivePlayingId(null);
      return;
    }

    const audioUrl = audioFlowStore.resolveStepAudio(step, selectedLanguage);
    const transcript = selectedLanguage === "twi" ? step.transcriptTwi : step.transcriptEn;

    setActivePlayingId(step.id);
    audioPlaybackController.unlockAudio();

    try {
      const ok = await audioPlaybackController.play(audioUrl, {
        promptId: step.promptId,
        language: selectedLanguage,
        onEnd: () => setActivePlayingId(null),
        onError: () => setActivePlayingId(null),
      });
      if (!ok) {
        // Fallback to synthesize if static file fails
        await audioPlaybackController.speakText(transcript, {
          promptId: step.promptId,
          language: selectedLanguage,
          onEnd: () => setActivePlayingId(null),
          onError: () => setActivePlayingId(null),
        });
      }
    } catch {
      setActivePlayingId(null);
    }
  };

  // Assign audio file to step
  const handleAssignAudio = (stepId: string, filenameOrUrl: string) => {
    let resolvedUrl = filenameOrUrl;
    if (!filenameOrUrl.startsWith("/")) {
      resolvedUrl = selectedLanguage === "twi"
        ? `/audio/Twi_library/${filenameOrUrl}`
        : `/audio/English_Library/${filenameOrUrl}`;
    }

    audioFlowStore.assignAudioForStep(stepId, selectedLanguage, resolvedUrl);
    setSaveSuccessMsg(`Updated audio for ${stepId} (${selectedLanguage.toUpperCase()})`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Reset step
  const handleResetStep = (stepId: string) => {
    audioFlowStore.resetStepToDefault(stepId);
    setSaveSuccessMsg(`Reset ${stepId} to default audio.`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Reset all
  const handleResetAll = () => {
    if (window.confirm("Are you sure you want to reset all audio assignments to defaults?")) {
      audioFlowStore.resetAllToDefaults();
      setSaveSuccessMsg("Reset all audio flow assignments to defaults.");
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  // Test sound with high volume
  const handleTestVolumeAudio = async () => {
    audioPlaybackController.unlockAudio();
    const testUrl = selectedLanguage === "twi"
      ? "/audio/Twi_library/Greetings.mp3"
      : "/audio/welcome_en.mp3";
    const testText = selectedLanguage === "twi"
      ? "Akwaaba kɔ Ɔkwankyerɛfo Pa mu!"
      : "Welcome to Ɔkwankyerɛfo Pa!";

    setActivePlayingId("test_master_vol");
    await audioPlaybackController.play(testUrl, {
      language: selectedLanguage,
      onEnd: () => setActivePlayingId(null),
      onError: () => setActivePlayingId(null),
    });
  };

  // Filter steps by tab
  const filteredSteps = MONEY_TRANSFER_FLOW_STEPS.filter((step) => {
    if (step.flowType !== activeTab) return false;
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      step.titleEn.toLowerCase().includes(q) ||
      step.titleTwi.toLowerCase().includes(q) ||
      step.promptId.toLowerCase().includes(q) ||
      step.category.toLowerCase().includes(q) ||
      step.transcriptEn.toLowerCase().includes(q) ||
      step.transcriptTwi.toLowerCase().includes(q)
    );
  });

  const availableCatalog = selectedLanguage === "twi" ? AUTHENTIC_TWI_RECORDINGS : AUTHENTIC_EN_RECORDINGS;
  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* ── Top Header & Hero ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/80 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-emerald-500/10 via-amber-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <span>🇬🇭</span>
              <span>Central Audio Flow Studio</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Live Global Synchronization</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Money Transfer Audio Flow &amp; Assignment
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Orchestrate the exact sequence of audio prompts used in Mobile Money transfers. Separated into{" "}
              <strong className="text-emerald-800">Normal IVR Flow</strong> (structured keypad prompts) and{" "}
              <strong className="text-amber-800">Conversational Flow</strong> (natural spoken Central Brain turns).
              Any audio assigned here is <strong>immediately applied across the entire project</strong>, including the Phone Simulator.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              to="/dashboard/phone"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors shadow-xs"
            >
              <Smartphone className="w-4 h-4" />
              <span>Open Phone Simulator</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            {overrideCount > 0 && (
              <button
                onClick={handleResetAll}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100 text-rose-700 font-medium text-sm transition-colors"
                title="Restore all default canonical audio files"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset All ({overrideCount})</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Notification Banner ─────────────────────────────────────────── */}
        {saveSuccessMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* ── Master Volume Amplification Panel ───────────────────────────── */}
        <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-slate-50/70 p-4 rounded-xl border border-slate-200/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <Volume2 className="w-4 h-4 text-emerald-600" />
              <span>Master Audio Volume &amp; Clarity Boost</span>
            </div>
            <p className="text-xs text-slate-500">
              High-gain dynamics compressor active. Prevents digital clipping while amplifying quiet vocals for elderly callers.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>Volume Multiplier</span>
              <span className="text-emerald-700 font-mono font-bold">{Math.round(masterVolume * 100)}% ({masterVolume.toFixed(1)}x Gain)</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.1"
              value={masterVolume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>50%</span>
              <span>100% (Unity)</span>
              <span>180% (Recommended)</span>
              <span>250% (Max)</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={handleTestVolumeAudio}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activePlayingId === "test_master_vol"
                  ? "bg-amber-600 text-white shadow-xs animate-pulse"
                  : "bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 shadow-2xs"
              }`}
            >
              {activePlayingId === "test_master_vol" ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Testing Output...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Test Audio Volume</span>
                </>
              )}
            </button>
            <button
              onClick={() => handleVolumeChange(2.0)}
              className="px-2.5 py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-semibold"
              title="Set to optimal loud 200% volume"
            >
              2.0x Boost
            </button>
          </div>
        </div>
      </div>

      {/* ── Controls & Tabs Bar ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        {/* Flow Mode Tabs (Normal vs Conversational) */}
        <div className="inline-flex p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => setActiveTab("NORMAL")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "NORMAL"
                ? "bg-white text-slate-900 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Radio className="w-4 h-4 text-emerald-600" />
            <span>Normal IVR Flow</span>
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
              {MONEY_TRANSFER_FLOW_STEPS.filter((s) => s.flowType === "NORMAL").length} Steps
            </span>
          </button>

          <button
            onClick={() => setActiveTab("CONVERSATIONAL")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeTab === "CONVERSATIONAL"
                ? "bg-white text-slate-900 shadow-xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-600" />
            <span>Conversational Flow</span>
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">
              {MONEY_TRANSFER_FLOW_STEPS.filter((s) => s.flowType === "CONVERSATIONAL").length} Turns
            </span>
          </button>
        </div>

        {/* Right side controls: Language toggle + Search filter */}
        <div className="flex items-center gap-3">
          <div className="inline-flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setSelectedLanguage("twi")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedLanguage === "twi"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>🇬🇭</span>
              <span>Akan Twi</span>
            </button>
            <button
              onClick={() => setSelectedLanguage("en")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedLanguage === "en"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span>🇬🇧</span>
              <span>English</span>
            </button>
          </div>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search steps & prompts..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* ── Flow Description Banner ─────────────────────────────────────── */}
      <div className={`p-4 rounded-xl border text-xs sm:text-sm flex items-start gap-3 ${
        activeTab === "NORMAL"
          ? "bg-emerald-50/60 border-emerald-200 text-emerald-950"
          : "bg-amber-50/60 border-amber-200 text-amber-950"
      }`}>
        <Info className={`w-5 h-5 shrink-0 mt-0.5 ${activeTab === "NORMAL" ? "text-emerald-600" : "text-amber-600"}`} />
        <div className="space-y-1">
          <span className="font-bold">
            {activeTab === "NORMAL" ? "Normal Flow (Automated Telephony & Keypad IVR)" : "Conversational Voice Flow (Natural Akan & Central Brain)"}
          </span>
          <p className="text-xs text-slate-600 leading-relaxed">
            {activeTab === "NORMAL"
              ? "Arranged strictly in the order the simulator traverses during an automated Mobile Money transfer. Each step prompts the caller via studio voice and waits for DTMF keypad input (1, 2, #, 0, 8, 9) or spoken command."
              : "Arranged according to how callers naturally speak in Ghanaian markets and rural communities. Central Brain extracts slots (recipient name, amount, telco) and returns empathetic, conversational voice responses with Zero-PIN safeguards."}
          </p>
        </div>
      </div>

      {/* ── Flow Steps List ─────────────────────────────────────────────── */}
      <div className="space-y-4">
        {filteredSteps.map((step) => {
          const currentAudioUrl = audioFlowStore.resolveStepAudio(step, selectedLanguage);
          const isOverridden = Boolean(
            selectedLanguage === "twi"
              ? overrides[step.id]?.customAudioTwi
              : overrides[step.id]?.customAudioEn
          );
          const isPlaying = activePlayingId === step.id;
          const transcript = selectedLanguage === "twi" ? step.transcriptTwi : step.transcriptEn;
          const isExpanded = expandedStepId === step.id;

          // Extract human filename
          const filename = currentAudioUrl.split("/").pop()?.split("?")[0] || "Custom Audio";
          const isStudioMp3 = currentAudioUrl.includes("Twi_library") || currentAudioUrl.endsWith(".mp3");

          return (
            <div
              key={step.id}
              className={`bg-white rounded-2xl border transition-all ${
                isPlaying
                  ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-md"
                  : isOverridden
                  ? "border-amber-300 shadow-xs"
                  : "border-slate-200/90 shadow-2xs hover:border-slate-300"
              }`}
            >
              {/* Card Header Row */}
              <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5">
                  {/* Play Button */}
                  <button
                    onClick={() => handleTogglePlayStep(step)}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                      isPlaying
                        ? "bg-emerald-600 text-white shadow-sm ring-4 ring-emerald-100 animate-pulse"
                        : "bg-slate-100 hover:bg-emerald-600 hover:text-white text-slate-700"
                    }`}
                    title={isPlaying ? "Stop audio" : "Play step audio at amplified volume"}
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
                  </button>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                        {step.promptId}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 uppercase tracking-wide">
                        {step.category}
                      </span>
                      {isOverridden && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                          <Check className="w-3 h-3 text-amber-700" />
                          <span>Custom Assigned</span>
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-slate-900">
                      {selectedLanguage === "twi" ? step.titleTwi : step.titleEn}
                    </h2>
                  </div>
                </div>

                {/* Right side info & action pills */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {step.keypadAction && (
                    <div className="text-xs font-mono font-medium px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                      ⌨ {step.keypadAction}
                    </div>
                  )}

                  {/* Audio Status Pill */}
                  <div className={`text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                    isStudioMp3
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-sky-50 text-sky-800 border border-sky-200"
                  }`}>
                    <Headphones className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[170px]" title={filename}>
                      {filename}
                    </span>
                  </div>

                  {/* Expand / Reassign Dropdown Trigger */}
                  <button
                    onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5"
                  >
                    <Sliders className="w-3.5 h-3.5 text-slate-500" />
                    <span>{isExpanded ? "Close" : "Change Audio"}</span>
                  </button>
                </div>
              </div>

              {/* Transcript Box */}
              <div className="px-4 sm:px-5 pb-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700 leading-relaxed font-sans">
                  <div className="flex items-center gap-2 mb-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>{selectedLanguage === "twi" ? "🇬🇭 Akan Twi Script" : "🇬🇧 English Script"}</span>
                  </div>
                  <p className="font-medium text-slate-800">
                    "{transcript}"
                  </p>
                  {step.conversationalUtterance && (
                    <p className="mt-1.5 text-slate-500 italic text-[11px]">
                      💡 Context: {step.conversationalUtterance}
                    </p>
                  )}
                </div>
              </div>

              {/* ── Expanded Drawer for Audio Assignment ──────────────────── */}
              {isExpanded && (
                <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl space-y-4 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <FileAudio className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Assign Audio File for {selectedLanguage.toUpperCase()}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Select any of the 86+ authentic Ghanaian studio recordings or dynamic TTS.
                      </p>
                    </div>

                    {isOverridden && (
                      <button
                        onClick={() => handleResetStep(step.id)}
                        className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset to Default Audio</span>
                      </button>
                    )}
                  </div>

                  {/* Quick Select Suggested Audio Chips */}
                  {step.suggestedFilesTwi.length > 0 && selectedLanguage === "twi" && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-600">Suggested Studio Takes:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {step.suggestedFilesTwi.map((sugFile) => {
                          const isAssigned = filename === sugFile;
                          return (
                            <button
                              key={sugFile}
                              onClick={() => handleAssignAudio(step.id, sugFile)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                isAssigned
                                  ? "bg-emerald-600 text-white shadow-2xs font-bold"
                                  : "bg-white border border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50"
                              }`}
                            >
                              {isAssigned && <Check className="w-3 h-3" />}
                              <span>{sugFile.replace(/\.mp3$/i, "")}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Full Audio File Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600">
                      All Authentic Recordings ({availableCatalog.length} Available):
                    </label>
                    <select
                      value={currentAudioUrl}
                      onChange={(e) => handleAssignAudio(step.id, e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <optgroup label="Authentic Studio MP3 Catalog">
                        {availableCatalog.map((rec) => (
                          <option key={rec.filename} value={rec.url}>
                            {rec.title} ({rec.filename}) — {rec.category}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Dynamic Neural TTS">
                        <option value={`/api/audio/prompt-tts/${selectedLanguage}/${step.promptId}`}>
                          Neural TTS Synthesis: {step.promptId}
                        </option>
                      </optgroup>
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredSteps.length === 0 && (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
            <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">No steps matched your search filter</h3>
            <p className="text-xs text-slate-500 mt-1">Try clearing the search query to view all flow steps.</p>
          </div>
        )}
      </div>

      {/* ── Footer Information Card ─────────────────────────────────────── */}
      <div className="p-6 rounded-2xl bg-slate-900 text-slate-100 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          <h3 className="font-bold text-sm text-white">
            Architecture Guarantee: Strict Separation &amp; Zero-PIN Security
          </h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Both the <strong>Normal IVR Flow</strong> and <strong>Conversational Flow</strong> strictly enforce Ghana digital accessibility standards. All money transfer requests require subscriber handset authentication via USSD network push (Zero-PIN). Voice calls never prompt for, record, or ingest secret mobile money PIN digits.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            to="/dashboard/phone"
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
          >
            Test Flows in Phone Simulator →
          </Link>
          <Link
            to="/dashboard/tts"
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
          >
            TTS Acoustic Benchmark
          </Link>
          <Link
            to="/dashboard/audio"
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition-colors"
          >
            Audio Asset Inventory
          </Link>
        </div>
      </div>
    </div>
  );
};
