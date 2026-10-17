import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  AudioWaveform,
  ArrowRight,
  Radio,
  Layers,
  Square,
  Volume2,
  Search,
  Check,
  ChevronRight,
  ChevronDown
} from "lucide-react";
import { api, AudioManifestResponse } from "../../lib/api";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import {
  TWI_SEQUENTIAL_FLOW_STEPS,
  CANONICAL_IVR_CATEGORIES,
  FlowStepDefinition,
  IvrCategoryDefinition
} from "../../audio/twiSequentialAudioFlow";
import { matchReplyToAudio, AudioMatchResult } from "../../audio/replyAudioMatcher";

export const AudioLibraryPage: React.FC = () => {
  const [manifest, setManifest] = useState<AudioManifestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"flow" | "categories" | "matcher" | "manifest">("flow");
  const [selectedLang, setSelectedLang] = useState<"all" | "en" | "twi">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [byteRangeCheckResults, setByteRangeCheckResults] = useState<Record<string, { status: number; rangeOk: boolean }>>({});
  const [checkingByteRange, setCheckingByteRange] = useState(false);

  // Auto-play state for Sequential Flow
  const [autoPlayFlowActive, setAutoPlayFlowActive] = useState<boolean>(false);
  const [currentFlowStepIndex, setCurrentFlowStepIndex] = useState<number>(0);
  const autoPlayFlowIndexRef = useRef<number>(0);
  const autoPlayFlowActiveRef = useRef<boolean>(false);

  // Auto-play state for Categories
  const [autoPlayCategoryActive, setAutoPlayCategoryActive] = useState<number | null>(null);
  const [autoPlayCategoryPromptIndex, setAutoPlayCategoryPromptIndex] = useState<number>(0);
  const autoPlayCategoryRef = useRef<{ catNum: number | null; promptIdx: number }>({ catNum: null, promptIdx: 0 });
  const [expandedCategories, setExpandedCategories] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: false,
    4: false,
    5: false,
    6: false,
    7: false,
    8: false,
    9: false,
    10: false,
    11: false,
    12: false,
    13: false,
    14: false,
  });

  // Confidence Matcher Test State
  const [testPhrase, setTestPhrase] = useState("Please enter the recipient phone number");
  const [testLanguage, setTestLanguage] = useState<"tw" | "en">("en");
  const [matchResult, setMatchResult] = useState<AudioMatchResult | null>(null);
  const [aiAssemblyPlan, setAiAssemblyPlan] = useState<any>(null);
  const [isAiMatching, setIsAiMatching] = useState(false);

  autoPlayFlowIndexRef.current = currentFlowStepIndex;
  autoPlayFlowActiveRef.current = autoPlayFlowActive;
  autoPlayCategoryRef.current = { catNum: autoPlayCategoryActive, promptIdx: autoPlayCategoryPromptIndex };

  const handleAudioEnded = useCallback(() => {
    // 1. Advance sequential flow auto-play
    if (autoPlayFlowActiveRef.current) {
      const nextIdx = autoPlayFlowIndexRef.current + 1;
      if (nextIdx < TWI_SEQUENTIAL_FLOW_STEPS.length) {
        setCurrentFlowStepIndex(nextIdx);
        autoPlayFlowIndexRef.current = nextIdx;
        const nextStep = TWI_SEQUENTIAL_FLOW_STEPS[nextIdx];
        if (nextStep.audioUrl) {
          playAudio(nextStep.audioUrl, nextStep.name);
        } else {
          // Dynamic readback delay then continue
          setTimeout(() => {
            if (autoPlayFlowActiveRef.current) {
              const afterDynamicIdx = nextIdx + 1;
              if (afterDynamicIdx < TWI_SEQUENTIAL_FLOW_STEPS.length) {
                setCurrentFlowStepIndex(afterDynamicIdx);
                autoPlayFlowIndexRef.current = afterDynamicIdx;
                const afterStep = TWI_SEQUENTIAL_FLOW_STEPS[afterDynamicIdx];
                if (afterStep.audioUrl) {
                  playAudio(afterStep.audioUrl, afterStep.name);
                }
              } else {
                setAutoPlayFlowActive(false);
                autoPlayFlowActiveRef.current = false;
              }
            }
          }, 2000);
        }
      } else {
        setAutoPlayFlowActive(false);
        autoPlayFlowActiveRef.current = false;
      }
      return;
    }

    // 2. Advance Category auto-play
    const currentCatInfo = autoPlayCategoryRef.current;
    if (currentCatInfo.catNum !== null) {
      const cat = CANONICAL_IVR_CATEGORIES.find((c) => c.categoryNumber === currentCatInfo.catNum);
      if (cat) {
        const nextPromptIdx = currentCatInfo.promptIdx + 1;
        if (nextPromptIdx < cat.prompts.length) {
          setAutoPlayCategoryPromptIndex(nextPromptIdx);
          autoPlayCategoryRef.current = { catNum: currentCatInfo.catNum, promptIdx: nextPromptIdx };
          const prompt = cat.prompts[nextPromptIdx];
          if (prompt.audioUrl) {
            playAudio(prompt.audioUrl, prompt.title);
          }
        } else {
          setAutoPlayCategoryActive(null);
          autoPlayCategoryRef.current = { catNum: null, promptIdx: 0 };
        }
      }
    }
  }, []);

  const { isPlaying, currentUrl, playAudio, stopAudio } = useAudioPlayer(handleAudioEnded);

  useEffect(() => {
    fetchManifest();
    runMatcherTest("Please enter the recipient phone number", "en");
  }, []);

  const fetchManifest = async () => {
    setLoading(true);
    try {
      const data = await api.getAudioManifest();
      setManifest(data);
    } catch (e) {
      console.warn("Manifest load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlay = (url: string | null, title?: string) => {
    if (!url) return;
    if (autoPlayFlowActive) {
      setAutoPlayFlowActive(false);
      autoPlayFlowActiveRef.current = false;
    }
    if (autoPlayCategoryActive !== null) {
      setAutoPlayCategoryActive(null);
      autoPlayCategoryRef.current = { catNum: null, promptIdx: 0 };
    }

    if (isPlaying && currentUrl === url) {
      stopAudio();
    } else {
      stopAudio();
      playAudio(url, title);
    }
  };

  const startAutoPlayFlow = (fromIndex: number = 0) => {
    stopAudio();
    setAutoPlayCategoryActive(null);
    setCurrentFlowStepIndex(fromIndex);
    autoPlayFlowIndexRef.current = fromIndex;
    setAutoPlayFlowActive(true);
    autoPlayFlowActiveRef.current = true;

    const step = TWI_SEQUENTIAL_FLOW_STEPS[fromIndex];
    if (step?.audioUrl) {
      playAudio(step.audioUrl, step.name);
    }
  };

  const stopAutoPlayFlow = () => {
    setAutoPlayFlowActive(false);
    autoPlayFlowActiveRef.current = false;
    stopAudio();
  };

  const startAutoPlayCategory = (categoryNumber: number, fromPromptIndex: number = 0) => {
    stopAudio();
    setAutoPlayFlowActive(false);
    autoPlayFlowActiveRef.current = false;

    const cat = CANONICAL_IVR_CATEGORIES.find((c) => c.categoryNumber === categoryNumber);
    if (!cat || !cat.prompts.length) return;

    setAutoPlayCategoryActive(categoryNumber);
    setAutoPlayCategoryPromptIndex(fromPromptIndex);
    autoPlayCategoryRef.current = { catNum: categoryNumber, promptIdx: fromPromptIndex };

    // Auto-expand this category in UI
    setExpandedCategories((prev) => ({ ...prev, [categoryNumber]: true }));

    const prompt = cat.prompts[fromPromptIndex];
    if (prompt?.audioUrl) {
      playAudio(prompt.audioUrl, prompt.title);
    }
  };

  const stopAutoPlayCategory = () => {
    setAutoPlayCategoryActive(null);
    autoPlayCategoryRef.current = { catNum: null, promptIdx: 0 };
    stopAudio();
  };

  const toggleCategoryExpand = (catNum: number) => {
    setExpandedCategories((prev) => ({ ...prev, [catNum]: !prev[catNum] }));
  };

  const testByteRangeSupport = async (url: string) => {
    try {
      const res = await fetch(url, {
        headers: { Range: "bytes=0-1024" },
      });
      setByteRangeCheckResults((prev) => ({
        ...prev,
        [url]: { status: res.status, rangeOk: res.status === 206 },
      }));
    } catch {
      setByteRangeCheckResults((prev) => ({
        ...prev,
        [url]: { status: 500, rangeOk: false },
      }));
    }
  };

  const testAllByteRanges = async () => {
    if (!manifest) return;
    setCheckingByteRange(true);
    const allClips = [...(manifest.englishPrompts || []), ...(manifest.twiPrompts || [])];
    for (const clip of allClips) {
      await testByteRangeSupport(clip.url);
    }
    setCheckingByteRange(false);
  };

  const runMatcherTest = async (phrase: string, lang: "tw" | "en") => {
    const res = matchReplyToAudio(phrase, lang, { minConfidence: 0.50 });
    setMatchResult(res);

    if (phrase.trim()) {
      setIsAiMatching(true);
      try {
        const response = await fetch("/api/ai/cross-reference-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            replyText: phrase,
            language: lang === "tw" ? "twi" : "en",
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.plan) {
            setAiAssemblyPlan(data.plan);
          }
        }
      } catch (err) {
        console.warn("AI cross-reference test notice:", err);
      } finally {
        setIsAiMatching(false);
      }
    }
  };

  const allManifestClips = manifest
    ? selectedLang === "all"
      ? [...(manifest.englishPrompts || []), ...(manifest.twiPrompts || [])]
      : selectedLang === "en"
      ? (manifest.englishPrompts || [])
      : (manifest.twiPrompts || [])
    : [];

  const displayedClips = allManifestClips.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      (c.spokenText && c.spokenText.toLowerCase().includes(q)) ||
      c.filename.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8] flex items-center gap-2">
            <AudioWaveform className="w-6 h-6 text-[#0F382A] dark:text-[#D4AF37]" />
            Audio Engine &amp; Flow Orchestrator
          </h1>
          <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-0.5">
            Synchronized with all 14 IVR categories (OP01–OP94), automated sequential flow playback, and &ge;50% phrase matcher.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={testAllByteRanges}
            disabled={checkingByteRange}
            className="px-3.5 py-2 text-xs font-bold bg-[#FAF9F5] dark:bg-[#16241D] border border-[#0F382A]/20 hover:bg-[#0F382A]/5 rounded-xl transition-colors disabled:opacity-50"
          >
            {checkingByteRange ? "Testing 206 Byte-Ranges..." : "Run HTTP 206 Range Audit"}
          </button>
          <button
            onClick={fetchManifest}
            className="p-2 text-[#5E7265] hover:text-[#0F382A] rounded-xl hover:bg-[#0F382A]/5"
            title="Refresh manifest"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 p-1 bg-white dark:bg-[#101B15] border border-[#0F382A]/10 w-fit rounded-xl flex-wrap">
        <button
          onClick={() => setActiveTab("flow")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === "flow" ? "bg-[#0F382A] text-white" : "text-[#5E7265] hover:text-[#0F382A]"
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          Sequential IVR Flow (14 Steps)
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === "categories" ? "bg-[#0F382A] text-white" : "text-[#5E7265] hover:text-[#0F382A]"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          14 IVR Categories (OP01–OP94)
        </button>
        <button
          onClick={() => setActiveTab("matcher")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === "matcher" ? "bg-[#0F382A] text-white" : "text-[#5E7265] hover:text-[#0F382A]"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
          Confidence Phrase Matcher (50%–100%)
        </button>
        <button
          onClick={() => setActiveTab("manifest")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
            activeTab === "manifest" ? "bg-[#0F382A] text-white" : "text-[#5E7265] hover:text-[#0F382A]"
          }`}
        >
          Full Audio Catalog ({manifest?.totalClips || manifest?.allPrompts?.length || 0} files)
        </button>
      </div>

      {/* TAB 1: SEQUENTIAL FLOW (14 STEPS) WITH AUTOMATIC SEQUENTIAL PLAYBACK */}
      {activeTab === "flow" && (
        <div className="space-y-4">
          {/* Automatic Flow Playback Banner */}
          <div className="p-4 bg-gradient-to-r from-emerald-900 to-[#0F382A] text-white rounded-2xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-400/30">
                  AUTOMATED AUDIO JOURNEY
                </span>
                {autoPlayFlowActive && (
                  <span className="flex items-center gap-1 text-xs text-[#D4AF37] font-bold animate-pulse">
                    <Volume2 className="w-4 h-4" /> Playing Step {currentFlowStepIndex + 1} of 14:{" "}
                    {TWI_SEQUENTIAL_FLOW_STEPS[currentFlowStepIndex]?.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-100 max-w-2xl">
                Automatically plays through all 14 sequential Twi studio audio prompts in chronological transaction order without stopping.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {autoPlayFlowActive ? (
                <button
                  onClick={stopAutoPlayFlow}
                  className="px-4 py-2 text-xs font-bold bg-[#A32828] hover:bg-red-700 text-white rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop Auto-Play
                </button>
              ) : (
                <button
                  onClick={() => startAutoPlayFlow(0)}
                  className="px-4 py-2 text-xs font-bold bg-[#D4AF37] hover:bg-amber-400 text-[#111A15] rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Auto-Play Entire Flow (1 to 14)
                </button>
              )}
            </div>
          </div>

          {/* Flow Progress Bar */}
          {autoPlayFlowActive && (
            <div className="space-y-1.5 p-3.5 bg-white dark:bg-[#101B15] border border-[#0F382A]/10 rounded-xl">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-[#0F382A] dark:text-[#D4AF37]">
                  Step {currentFlowStepIndex + 1} / {TWI_SEQUENTIAL_FLOW_STEPS.length}: {TWI_SEQUENTIAL_FLOW_STEPS[currentFlowStepIndex]?.name}
                </span>
                <span className="text-[#5E7265]">
                  {Math.round(((currentFlowStepIndex + 1) / TWI_SEQUENTIAL_FLOW_STEPS.length) * 100)}% complete
                </span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-[#0F382A] dark:bg-[#D4AF37] h-full transition-all duration-300"
                  style={{ width: `${((currentFlowStepIndex + 1) / TWI_SEQUENTIAL_FLOW_STEPS.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {TWI_SEQUENTIAL_FLOW_STEPS.map((step, idx) => {
              const isThisPlaying = isPlaying && currentUrl === step.audioUrl;
              const isCurrentAutoStep = autoPlayFlowActive && currentFlowStepIndex === idx;

              return (
                <div
                  key={step.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isCurrentAutoStep
                      ? "bg-[#D4AF37]/15 border-[#D4AF37] ring-2 ring-[#D4AF37]/40 shadow-md"
                      : isThisPlaying
                      ? "bg-[#D4AF37]/10 border-[#D4AF37] shadow-sm"
                      : "bg-white dark:bg-[#101B15] border-[#0F382A]/10 dark:border-[#D4AF37]/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${
                            isCurrentAutoStep
                              ? "bg-[#D4AF37] text-slate-950 font-black animate-pulse"
                              : "bg-[#0F382A]"
                          }`}
                        >
                          {step.stepIndex}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#0F382A] dark:text-[#D4AF37]">
                          {step.name}
                        </span>
                        {isCurrentAutoStep && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                            Auto-Playing
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-[#111A15] dark:text-[#F8FAF8] mt-1">
                        "{step.spokenTextTwi}"
                      </p>
                      <p className="text-[11px] text-[#5E7265] italic">
                        "{step.spokenTextEn}"
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {step.audioUrl ? (
                        <button
                          onClick={() => handleTogglePlay(step.audioUrl, step.name)}
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            isThisPlaying
                              ? "bg-[#A32828] text-white"
                              : "bg-[#0F382A] text-white hover:bg-[#1A543F]"
                          }`}
                          aria-label={isThisPlaying ? "Pause audio" : "Play step audio"}
                        >
                          {isThisPlaying ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>
                      ) : (
                        <span className="px-2 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                          Dynamic Readback
                        </span>
                      )}

                      {!autoPlayFlowActive && (
                        <button
                          onClick={() => startAutoPlayFlow(idx)}
                          className="text-[10px] text-[#0F382A] dark:text-[#D4AF37] hover:underline font-bold"
                          title="Start automatic playback from this step onward"
                        >
                          Auto-Play from here
                        </button>
                      )}
                    </div>
                  </div>

                  {step.audioUrl && (
                    <div className="mt-3 pt-2.5 border-t border-[#0F382A]/10 dark:border-white/10 flex items-center justify-between text-[10px] font-mono text-[#5E7265]">
                      <span className="truncate max-w-[280px]">{step.audioUrl}</span>
                      {step.nextStepId && (
                        <span className="flex items-center gap-1 text-[#0F382A] dark:text-[#D4AF37] font-bold">
                          Next <ArrowRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: 14 IVR CATEGORIES (OP01-OP94) */}
      {activeTab === "categories" && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <span className="font-bold">14 Canonical IVR Audio Categories:</span> Complete architecture linking all 94 prompt states (OP01–OP94) to authentic audio recordings. Click any category to play prompts individually or auto-play through the entire category.
            </div>
            <div className="text-[11px] font-mono font-bold bg-emerald-100 dark:bg-emerald-900/50 px-2.5 py-1 rounded shrink-0">
              14 Categories • 94 States
            </div>
          </div>

          <div className="space-y-3">
            {CANONICAL_IVR_CATEGORIES.map((cat) => {
              const isExpanded = expandedCategories[cat.categoryNumber];
              const isCatAutoPlaying = autoPlayCategoryActive === cat.categoryNumber;

              return (
                <div
                  key={cat.id}
                  className="bg-white dark:bg-[#101B15] border border-[#0F382A]/10 dark:border-[#D4AF37]/20 rounded-2xl overflow-hidden shadow-xs transition-all"
                >
                  {/* Category Header */}
                  <div className="p-4 flex items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-900/40 border-b border-[#0F382A]/5">
                    <button
                      onClick={() => toggleCategoryExpand(cat.categoryNumber)}
                      className="flex items-center gap-2.5 text-left flex-1"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[#0F382A] dark:text-[#D4AF37]" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#5E7265]" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
                            {cat.title}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">
                            {cat.prompts.length} prompts
                          </span>
                        </div>
                        <p className="text-[11px] text-[#5E7265] mt-0.5">{cat.description}</p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0">
                      {isCatAutoPlaying ? (
                        <button
                          onClick={stopAutoPlayCategory}
                          className="px-3 py-1.5 text-xs font-bold bg-[#A32828] text-white rounded-lg flex items-center gap-1.5"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => startAutoPlayCategory(cat.categoryNumber, 0)}
                          className="px-3 py-1.5 text-xs font-bold bg-[#0F382A] hover:bg-[#1A543F] text-white rounded-lg flex items-center gap-1.5"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Auto-Play Category
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Prompts list */}
                  {isExpanded && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white dark:bg-[#101B15]">
                      {cat.prompts.map((p, pIdx) => {
                        const isThisPlaying = isPlaying && currentUrl === p.audioUrl;
                        const isThisAutoStep = isCatAutoPlaying && autoPlayCategoryPromptIndex === pIdx;

                        return (
                          <div
                            key={p.promptId}
                            className={`p-3.5 rounded-xl border transition-all ${
                              isThisAutoStep
                                ? "bg-[#D4AF37]/15 border-[#D4AF37] ring-1 ring-[#D4AF37]"
                                : isThisPlaying
                                ? "bg-[#D4AF37]/10 border-[#D4AF37]"
                                : "bg-[#FAF9F5] dark:bg-[#16241D] border-[#0F382A]/10 dark:border-white/5"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="px-1.5 py-0.5 rounded bg-[#0F382A] text-white font-mono text-[10px] font-bold">
                                    {p.promptId}
                                  </span>
                                  <span className="text-xs font-bold text-[#111A15] dark:text-[#F8FAF8]">
                                    {p.title}
                                  </span>
                                </div>
                                <p className="text-xs text-[#111A15] dark:text-[#F8FAF8] italic">
                                  "{p.spokenTextTwi}"
                                </p>
                                <p className="text-[11px] text-[#5E7265]">
                                  "{p.spokenTextEn}"
                                </p>
                              </div>

                              <button
                                onClick={() => handleTogglePlay(p.audioUrl, p.title)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                  isThisPlaying
                                    ? "bg-[#A32828] text-white"
                                    : "bg-[#0F382A] text-white hover:bg-[#1A543F]"
                                }`}
                                aria-label={isThisPlaying ? "Pause audio" : "Play prompt"}
                              >
                                {isThisPlaying ? (
                                  <Pause className="w-3.5 h-3.5" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                                )}
                              </button>
                            </div>

                            <div className="mt-2.5 pt-2 border-t border-[#0F382A]/5 flex items-center justify-between text-[10px] font-mono text-[#5E7265]">
                              <span className="truncate max-w-[260px]">{p.audioUrl}</span>
                              <span className="uppercase text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                Verified
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: CONFIDENCE MATCHER TESTER */}
      {activeTab === "matcher" && (
        <div className="space-y-6">
          <div className="p-6 bg-white dark:bg-[#101B15] border border-[#0F382A]/10 dark:border-[#D4AF37]/20 rounded-2xl space-y-4">
            <h2 className="text-sm font-bold text-[#111A15] dark:text-[#F8FAF8] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              Interactive Phrase Matcher &amp; TTS Fallback Simulator
            </h2>
            <p className="text-xs text-[#5E7265]">
              Type any arbitrary AI response or caller utterance below to test whether it matches a studio audio recording (&ge; 50% confidence) or falls back to neural TTS.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={testPhrase}
                onChange={(e) => {
                  setTestPhrase(e.target.value);
                  runMatcherTest(e.target.value, testLanguage);
                }}
                placeholder="Enter AI response or phrase..."
                className="flex-1 px-4 py-2.5 text-xs bg-[#FAF9F5] dark:bg-[#16241D] border border-[#0F382A]/20 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#0F382A]"
              />

              <select
                value={testLanguage}
                onChange={(e) => {
                  const lang = e.target.value as "tw" | "en";
                  setTestLanguage(lang);
                  runMatcherTest(testPhrase, lang);
                }}
                className="px-3 py-2.5 text-xs bg-[#FAF9F5] dark:bg-[#16241D] border border-[#0F382A]/20 rounded-xl font-bold"
              >
                <option value="en">English (en)</option>
                <option value="tw">Akan Twi (tw)</option>
              </select>

              <button
                onClick={() => runMatcherTest(testPhrase, testLanguage)}
                className="px-4 py-2.5 text-xs font-bold bg-[#0F382A] text-white hover:bg-[#1A543F] rounded-xl transition-colors"
              >
                Test Match
              </button>
            </div>

            {/* Quick Test Presets */}
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="font-bold text-[#5E7265]">Quick Test:</span>
              {[
                "Welcome to MTN Mobile Money",
                "Please enter the recipient phone number",
                "How many Ghana cedis do you want to send?",
                "Transaction cancelled or rejected",
                "What is the weather today in Kumasi?",
              ].map((sample) => (
                <button
                  key={sample}
                  onClick={() => {
                    setTestPhrase(sample);
                    runMatcherTest(sample, testLanguage);
                  }}
                  className="px-2.5 py-1 bg-[#FAF9F5] dark:bg-[#16241D] border border-[#0F382A]/10 hover:border-[#0F382A]/40 rounded-lg text-[#111A15] dark:text-[#D4DFD8] transition-colors"
                >
                  {sample}
                </button>
              ))}
            </div>

            {/* Result Display */}
            {matchResult && (
              <div
                className={`p-5 rounded-xl border mt-4 ${
                  matchResult.match
                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700/50"
                    : "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700/50"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-full ${
                          matchResult.match
                            ? "bg-emerald-600 text-white"
                            : "bg-amber-600 text-white"
                        }`}
                      >
                        {matchResult.match ? "STUDIO AUDIO MATCH" : "TTS FALLBACK DISPATCH"}
                      </span>
                      <span className="text-xs font-mono font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
                        Confidence: {Math.round(matchResult.confidence * 100)}% (Threshold: &ge; 50%)
                      </span>
                    </div>

                    <p className="text-xs text-[#111A15] dark:text-[#F8FAF8] font-semibold mt-1">
                      {matchResult.match
                        ? `Matched: "${matchResult.spokenText || matchResult.title}"`
                        : "Confidence below 50% threshold. Sent to GhanaNLP / Piper neural speech synthesis."}
                    </p>

                    <div className="text-[11px] font-mono text-[#5E7265] mt-1">
                      Match Reason: {matchResult.matchReason || "none"}
                    </div>
                  </div>

                  {matchResult.match && matchResult.audioUrl && (
                    <button
                      onClick={() => handleTogglePlay(matchResult.audioUrl!, matchResult.title)}
                      className="px-4 py-2 bg-[#0F382A] text-white hover:bg-[#1A543F] text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Play Matched Audio
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* AI Audio Assembly Brain Plan */}
            {isAiMatching && (
              <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-950/20 text-xs text-sky-300 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                <span>AI Brain (Gemini/OpenAI/Qwen) is cross-referencing reply with library transcripts...</span>
              </div>
            )}

            {aiAssemblyPlan && (
              <div className="p-5 rounded-xl border border-emerald-500/40 bg-slate-900/90 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    AI Assembly Brain Plan [{aiAssemblyPlan.source?.toUpperCase()}]
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    Confidence: {Math.round((aiAssemblyPlan.confidence || 0.9) * 100)}%
                  </span>
                </div>

                <p className="text-xs text-slate-300 italic">
                  &ldquo;{aiAssemblyPlan.reasoning}&rdquo;
                </p>

                {aiAssemblyPlan.segments && aiAssemblyPlan.segments.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Ordered Playback Sequence:
                    </span>
                    <div className="space-y-1.5">
                      {aiAssemblyPlan.segments.map((seg: any, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-[10px]">
                              {idx + 1}
                            </span>
                            {seg.type === "clip" ? (
                              <div>
                                <span className="font-semibold text-emerald-200">
                                  Studio Clip: {seg.filename}
                                </span>
                                {seg.transcript && (
                                  <p className="text-[11px] text-slate-400 mt-0.5">&ldquo;{seg.transcript}&rdquo;</p>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="font-semibold text-amber-300">
                                  Dynamic TTS Segment
                                </span>
                                <p className="text-[11px] text-slate-300 mt-0.5">&ldquo;{seg.text}&rdquo;</p>
                              </div>
                            )}
                          </div>

                          {seg.type === "clip" && seg.audioUrl && (
                            <button
                              onClick={() => handleTogglePlay(seg.audioUrl, seg.filename)}
                              className="p-1.5 rounded-lg bg-emerald-900/40 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 cursor-pointer"
                              title="Play clip"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: FULL AUDIO CATALOG */}
      {activeTab === "manifest" && (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-[#101B15] p-3 rounded-2xl border border-[#0F382A]/10">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-[#FAF9F5] dark:bg-[#16241D] border border-[#0F382A]/10 w-fit rounded-xl">
              <button
                onClick={() => setSelectedLang("all")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  selectedLang === "all" ? "bg-[#0F382A] text-white" : "text-[#5E7265] hover:text-[#0F382A]"
                }`}
              >
                All Prompts ({allManifestClips.length})
              </button>
              <button
                onClick={() => setSelectedLang("en")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  selectedLang === "en" ? "bg-[#0F382A] text-white" : "text-[#5E7265] hover:text-[#0F382A]"
                }`}
              >
                English ({manifest?.englishClips ?? manifest?.englishPrompts.length ?? 0} clips)
              </button>
              <button
                onClick={() => setSelectedLang("twi")}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  selectedLang === "twi" ? "bg-[#0F382A] text-white" : "text-[#5E7265] hover:text-[#0F382A]"
                }`}
              >
                Akan Twi ({manifest?.twiClips ?? manifest?.twiPrompts.length ?? 0} clips)
              </button>
            </div>

            {/* Search input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[#5E7265] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clips..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#FAF9F5] dark:bg-[#16241D] border border-[#0F382A]/20 rounded-xl focus:outline-hidden"
              />
            </div>
          </div>

          {/* Audio Prompts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedClips.map((clip) => {
              const isThisPlaying = isPlaying && currentUrl === clip.url;
              const rangeInfo = byteRangeCheckResults[clip.url];

              return (
                <div
                  key={clip.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    isThisPlaying
                      ? "bg-[#D4AF37]/10 border-[#D4AF37] shadow-sm"
                      : "bg-white dark:bg-[#101B15] border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-[#111A15] dark:text-[#F8FAF8] line-clamp-1">
                        {clip.title}
                      </h3>
                      <div className="text-[10px] font-mono text-slate-500">
                        Step {clip.step} • {clip.language.toUpperCase()}
                      </div>
                    </div>

                    <button
                      onClick={() => handleTogglePlay(clip.url, clip.title)}
                      disabled={!clip.url || !clip.exists}
                      className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isThisPlaying
                          ? "bg-[#A32828] text-white"
                          : clip.url && clip.exists
                            ? "bg-[#0F382A] text-white hover:bg-[#1A543F]"
                            : "bg-slate-400 text-white cursor-not-allowed"
                      }`}
                      aria-label={isThisPlaying ? "Pause audio" : clip.exists ? "Play audio" : "Audio unavailable"}
                    >
                      {isThisPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                    </button>
                  </div>

                  {/* Spoken Text Preview */}
                  <p className="text-xs text-[#3D4F44] dark:text-[#D4DFD8] italic line-clamp-2 my-2 font-medium">
                    "{clip.spokenText}"
                  </p>

                  {/* File Specs & Range Check */}
                  <div className="pt-3 border-t border-[#0F382A]/8 dark:border-white/10 flex items-center justify-between text-[11px] font-mono text-[#5E7265]">
                    <span>{clip.sizeFormatted}</span>
                    <span className="truncate max-w-[120px]">{clip.filename}</span>

                    <div className="flex items-center gap-1">
                      {rangeInfo ? (
                        rangeInfo.rangeOk ? (
                          <span className="text-emerald-500 font-bold text-[10px] flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> 206 OK
                          </span>
                        ) : (
                          <span className="text-red-500 font-bold text-[10px] flex items-center gap-0.5">
                            <AlertCircle className="w-3 h-3" /> Range Err
                          </span>
                        )
                      ) : (
                        <button
                          onClick={() => testByteRangeSupport(clip.url)}
                          className="text-[10px] text-[#0F382A] dark:text-[#D4AF37] hover:underline"
                        >
                          Check 206
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
