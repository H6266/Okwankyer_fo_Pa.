import React, { useEffect, useState } from "react";
import { Play, Pause, CheckCircle2, AlertCircle, RefreshCw, Sparkles, AudioWaveform, ArrowRight, Radio } from "lucide-react";
import { api, AudioManifestResponse } from "../../lib/api";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";
import { TWI_SEQUENTIAL_FLOW_STEPS, FlowStepDefinition } from "../../audio/twiSequentialAudioFlow";
import { matchReplyToAudio, AudioMatchResult } from "../../audio/replyAudioMatcher";

export const AudioLibraryPage: React.FC = () => {
  const [manifest, setManifest] = useState<AudioManifestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"flow" | "matcher" | "manifest">("flow");
  const [selectedLang, setSelectedLang] = useState<"all" | "en" | "twi">("all");
  const [byteRangeCheckResults, setByteRangeCheckResults] = useState<Record<string, { status: number; rangeOk: boolean }>>({});
  const [checkingByteRange, setCheckingByteRange] = useState(false);

  // Confidence Matcher Test State
  const [testPhrase, setTestPhrase] = useState("Please enter the recipient phone number");
  const [testLanguage, setTestLanguage] = useState<"tw" | "en">("en");
  const [matchResult, setMatchResult] = useState<AudioMatchResult | null>(null);

  const { isPlaying, currentUrl, playAudio, stopAudio } = useAudioPlayer();

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

  const handleTogglePlay = (url: string | null) => {
    if (!url) return;
    if (isPlaying && currentUrl === url) {
      stopAudio();
    } else {
      stopAudio();
      playAudio(url);
    }
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

  const runMatcherTest = (phrase: string, lang: "tw" | "en") => {
    const res = matchReplyToAudio(phrase, lang, { minConfidence: 0.50 });
    setMatchResult(res);
  };

  const displayedClips = manifest
    ? selectedLang === "all"
      ? [...(manifest.englishPrompts || []), ...(manifest.twiPrompts || [])]
      : selectedLang === "en"
      ? (manifest.englishPrompts || [])
      : (manifest.twiPrompts || [])
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8] flex items-center gap-2">
            <AudioWaveform className="w-6 h-6 text-[#0F382A] dark:text-[#D4AF37]" />
            Audio Engine &amp; Flow Orchestrator
          </h1>
          <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-0.5">
            14-step sequential Twi IVR audio journey, AI confidence-based phrase matcher (50%–100%), and dynamic TTS fallback.
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
      <div className="flex items-center gap-2 p-1 bg-white dark:bg-[#101B15] border border-[#0F382A]/10 w-fit rounded-xl">
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
          Full Audio Catalog ({manifest?.totalRecordings || 0} files)
        </button>
      </div>

      {/* TAB 1: SEQUENTIAL FLOW (14 STEPS) */}
      {activeTab === "flow" && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
            <div>
              <span className="font-bold">Standard Guided Flow Track:</span> When the caller follows the predetermined journey, these studio audio files play sequentially in order without AI deviation.
            </div>
            <div className="text-[11px] font-mono font-bold bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded">
              14 Steps Total
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {TWI_SEQUENTIAL_FLOW_STEPS.map((step) => {
              const isThisPlaying = isPlaying && currentUrl === step.audioUrl;
              return (
                <div
                  key={step.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isThisPlaying
                      ? "bg-[#D4AF37]/10 border-[#D4AF37] shadow-sm"
                      : "bg-white dark:bg-[#101B15] border-[#0F382A]/10 dark:border-[#D4AF37]/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#0F382A] text-white text-[10px] font-bold flex items-center justify-center">
                          {step.stepIndex}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#0F382A] dark:text-[#D4AF37]">
                          {step.name}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[#111A15] dark:text-[#F8FAF8] mt-1">
                        "{step.spokenTextTwi}"
                      </p>
                      <p className="text-[11px] text-[#5E7265] italic">
                        "{step.spokenTextEn}"
                      </p>
                    </div>

                    {step.audioUrl ? (
                      <button
                        onClick={() => handleTogglePlay(step.audioUrl)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          isThisPlaying
                            ? "bg-[#A32828] text-white"
                            : "bg-[#0F382A] text-white hover:bg-[#1A543F]"
                        }`}
                        aria-label={isThisPlaying ? "Pause audio" : "Play step audio"}
                      >
                        {isThisPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>
                    ) : (
                      <span className="px-2 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                        Dynamic Readback
                      </span>
                    )}
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

      {/* TAB 2: CONFIDENCE MATCHER TESTER */}
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
                      onClick={() => handleTogglePlay(matchResult.audioUrl!)}
                      className="px-4 py-2 bg-[#0F382A] text-white hover:bg-[#1A543F] text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Play Matched Audio
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: FULL AUDIO CATALOG */}
      {activeTab === "manifest" && (
        <div className="space-y-4">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#101B15] border border-[#0F382A]/10 w-fit rounded-xl">
            <button
              onClick={() => setSelectedLang("all")}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                selectedLang === "all" ? "bg-[#0F382A] text-white" : "text-[#5E7265] hover:text-[#0F382A]"
              }`}
            >
              All Prompts ({displayedClips.length})
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
                      onClick={() => handleTogglePlay(clip.url)}
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
