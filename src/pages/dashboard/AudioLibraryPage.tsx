import React, { useEffect, useState } from "react";
import { Play, Pause, CheckCircle2, AlertCircle, RefreshCw, Volume2 } from "lucide-react";
import { api, AudioManifestResponse, AudioItem } from "../../lib/api";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";

export const AudioLibraryPage: React.FC = () => {
  const [manifest, setManifest] = useState<AudioManifestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState<"all" | "en" | "twi">("all");
  const [byteRangeCheckResults, setByteRangeCheckResults] = useState<Record<string, { status: number; rangeOk: boolean }>>({});
  const [checkingByteRange, setCheckingByteRange] = useState(false);

  const { isPlaying, currentUrl, playAudio, stopAudio } = useAudioPlayer();

  useEffect(() => {
    fetchManifest();
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

  const handleTogglePlay = (url: string) => {
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
          <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
            Audio Phrase Bank &amp; Byte-Range Inspector
          </h1>
          <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-0.5">
            Verify dual-track studio recordings, inspect HTTP 206 Byte-Range streaming for Africa's Talking telecom gateway, and test audio playback.
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
          English (12 Clips)
        </button>
        <button
          onClick={() => setSelectedLang("twi")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            selectedLang === "twi" ? "bg-[#0F382A] text-white" : "text-[#5E7265] hover:text-[#0F382A]"
          }`}
        >
          Akan Twi (12 Clips)
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
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    isThisPlaying
                      ? "bg-[#A32828] text-white"
                      : "bg-[#0F382A] text-white hover:bg-[#1A543F]"
                  }`}
                  aria-label={isThisPlaying ? "Pause audio" : "Play audio"}
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
  );
};
