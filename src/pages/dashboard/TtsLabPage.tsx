import React, { useState, useEffect } from "react";
import {
  Volume2,
  Play,
  Pause,
  Download,
  CheckCircle2,
  Layers,
  Sparkles,
  Lock,
  Headphones,
  RotateCcw,
} from "lucide-react";
import { api, AudioManifestResponse, AudioItem } from "../../lib/api";

export const TtsLabPage: React.FC = () => {
  const [manifest, setManifest] = useState<AudioManifestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedLang, setSelectedLang] = useState<"en" | "twi">("en");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getAudioManifest()
      .then(setManifest)
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  const handlePlayAudio = (item: AudioItem) => {
    if (playingId === item.id) {
      audioElement?.pause();
      setPlayingId(null);
      return;
    }

    if (audioElement) {
      audioElement.pause();
    }

    const audio = new Audio(item.url);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      console.warn("Audio playback error for", item.url);
      setPlayingId(null);
    };
    audio.play().catch(console.warn);
    setAudioElement(audio);
    setPlayingId(item.id);
  };

  const activeClips = selectedLang === "en" ? manifest?.englishPrompts : manifest?.twiPrompts;

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-16">
      {/* ── Security Rule Reminder ────────────────────────────────────────── */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
        <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-amber-900">
            TTS Spoken Receipts Mandate
          </div>
          <p className="text-xs text-amber-900 mt-0.5">
            Voice prompts will speak transaction references and recipient confirmations, but must NEVER verbalize customer PINs.
          </p>
        </div>
      </div>

      {/* ── Header & Phase 3 Info ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                TTS Laboratory (Voice Synthesis &amp; Prompt Quality)
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                Phase 3 Roadmap
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Inspect, generate, and evaluate dual-language spoken audio quality for Ghanaian English and Akan (Twi) IVR prompts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedLang("en")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedLang === "en"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              English Prompts ({manifest?.englishPrompts.length || 0})
            </button>
            <button
              onClick={() => setSelectedLang("twi")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedLang === "twi"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Twi Prompts ({manifest?.twiPrompts.length || 0})
            </button>
          </div>
        </div>

        {/* Specs bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Audio Format</span>
            <div className="font-extrabold text-slate-800 mt-0.5">WAV / MP3 8kHz Mono Telephony</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Total Pre-Recorded Clips</span>
            <div className="font-extrabold text-slate-800 mt-0.5">{manifest?.totalClips || 24} Verified Prompts</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Latency Budget</span>
            <div className="font-extrabold text-emerald-700 mt-0.5">&lt; 350ms Telephony Cache</div>
          </div>
        </div>
      </div>

      {/* ── Audio Prompts Grid ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-extrabold text-slate-900">
          {selectedLang === "en" ? "Ghanaian English Prompts" : "Akan (Twi) Prompts"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeClips && activeClips.length > 0 ? (
            activeClips.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono font-bold text-slate-400">
                      Step {item.step} • {item.filename}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
                      {item.sizeFormatted || "Verified"}
                    </span>
                  </div>
                  <h3 className="text-xs font-extrabold text-slate-800 mt-1">{item.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 italic">&quot;{item.spokenText}&quot;</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
                  <button
                    onClick={() => handlePlayAudio(item)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors"
                  >
                    {playingId === item.id ? (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Play Prompt</span>
                      </>
                    )}
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ~{item.durationEstSec || 3}s
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 text-center py-8 text-slate-400 text-xs">
              Loading audio manifest...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
