import React, { useState, useEffect, useRef } from "react";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  Download,
  CheckCircle2,
  Layers,
  Sparkles,
  Lock,
  Headphones,
  RotateCcw,
  Sliders,
  Send,
  Radio,
  Clock,
  Activity,
  Check,
  ShieldCheck,
} from "lucide-react";
import { api, AudioManifestResponse, AudioItem } from "../../lib/api";

export const TtsLabPage: React.FC = () => {
  const [manifest, setManifest] = useState<AudioManifestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedLang, setSelectedLang] = useState<"en" | "twi">("en");
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Dynamic Speech Synthesizer State
  const [customText, setCustomText] = useState(
    "Akwaaba! Welcome to Okwankyerɛfo Pa. You are about to send 50 Ghana Cedis to Kwame Mensah."
  );
  const [customLang, setCustomLang] = useState<"en" | "tw">("en");
  const [voiceProfile, setVoiceProfile] = useState<"ghanaian-warm" | "elderly-accessible" | "ghanaian-expressive" | "standard-telephony">("ghanaian-warm");
  const [speechSpeed, setSpeechSpeed] = useState<number>(1.0);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [synthesizedAudioUrl, setSynthesizedAudioUrl] = useState<string | null>(null);
  const [synthProvider, setSynthProvider] = useState<string | null>(null);
  const [synthDuration, setSynthDuration] = useState<number>(0);
  const [isSynthPlaying, setIsSynthPlaying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const synthAudioRef = useRef<HTMLAudioElement | null>(null);
  const catalogAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getAudioManifest()
      .then(setManifest)
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, []);

  const handlePlayCatalogAudio = (item: AudioItem) => {
    if (playingId === item.id) {
      catalogAudioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (catalogAudioRef.current) {
      catalogAudioRef.current.src = item.url;
      catalogAudioRef.current.onended = () => setPlayingId(null);
      catalogAudioRef.current.onerror = () => {
        console.warn("Audio playback error for", item.url);
        setPlayingId(null);
      };
      catalogAudioRef.current.play().catch(console.warn);
      setPlayingId(item.id);
    }
  };

  const handleSynthesize = async () => {
    if (!customText.trim()) return;
    setIsSynthesizing(true);
    const startTime = performance.now();

    try {
      const res = await api.synthesizeSpeech({
        text: customText.trim(),
        language: customLang,
        style: voiceProfile,
      });

      if (res?.result?.audioBase64) {
        const mime = res.result.audioMimeType || "audio/mp3";
        const audioUrl = `data:${mime};base64,${res.result.audioBase64}`;
        setSynthesizedAudioUrl(audioUrl);
        setSynthProvider(res.result.providerUsed || "Ghanaian Neural Synthesizer");
        setSynthDuration(Math.round(performance.now() - startTime));

        // Auto-play the synthesized audio
        if (synthAudioRef.current) {
          synthAudioRef.current.src = audioUrl;
          synthAudioRef.current.playbackRate = speechSpeed;
          synthAudioRef.current.play().then(() => {
            setIsSynthPlaying(true);
          }).catch(() => {
            // Browser autoplay restrictions
            setIsSynthPlaying(false);
          });
        }
      }
    } catch (err: any) {
      setErrorMessage(`Synthesis notice: ${err.message}`);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const toggleSynthPlayback = () => {
    if (!synthAudioRef.current || !synthesizedAudioUrl) return;
    if (isSynthPlaying) {
      synthAudioRef.current.pause();
      setIsSynthPlaying(false);
    } else {
      synthAudioRef.current.play().then(() => {
        setIsSynthPlaying(true);
      }).catch(console.warn);
    }
  };

  const applyPresetPhrase = (phrase: string, lang: "en" | "tw") => {
    setCustomText(phrase);
    setCustomLang(lang);
  };

  const insertSpecialChar = (char: string) => {
    setCustomText((prev) => prev + char);
  };

  const activeClips = selectedLang === "en" ? manifest?.englishPrompts : manifest?.twiPrompts;

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-16">
      {/* Hidden audio element for catalog playback */}
      <audio ref={catalogAudioRef} className="hidden" />
      {/* Hidden audio element for synthesized playback */}
      <audio
        ref={synthAudioRef}
        onEnded={() => setIsSynthPlaying(false)}
        onError={() => setIsSynthPlaying(false)}
        className="hidden"
      />

      {/* ── Error Banner ────────────────────────────────────────────────── */}
      {errorMessage && (
        <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
          <div className="flex-1">
            <div className="text-xs font-bold text-red-900">Speech Synthesis Notice</div>
            <p className="text-xs text-red-700 mt-0.5">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs font-bold text-red-800 hover:text-red-950 px-2 py-1 rounded bg-red-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Security Rule Reminder ────────────────────────────────────────── */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
        <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-amber-900">
            TTS Spoken Receipts Mandate (Zero-PIN Security)
          </div>
          <p className="text-xs text-amber-900 mt-0.5">
            Voice prompts verbalize transaction amounts, recipient names, and completion references, but must NEVER verbalize customer PINs.
          </p>
        </div>
      </div>

      {/* ── Header & Phase Info ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                TTS Laboratory (Voice Synthesis &amp; Prompt Quality)
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                Active &amp; Functional
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Inspect, generate, and evaluate dual-language spoken audio quality for Ghanaian English and Akan (Twi) IVR prompts.
              Supports authentic studio human prompts and dynamic neural synthesis with Ghanaian phonetic verbalization.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              Verified Studio Clips: {manifest?.totalClips || 24}
            </span>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              Sample Rate: 16kHz
            </span>
          </div>
        </div>

        {/* Specs bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Audio Codecs</span>
            <div className="font-extrabold text-slate-800 mt-0.5">MP3 / WAV 16kHz Mono Telephony</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Dialects Supported</span>
            <div className="font-extrabold text-slate-800 mt-0.5">en-GH &amp; Akan (Asante/Akuapem Twi)</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Synthesis Pipeline</span>
            <div className="font-extrabold text-emerald-700 mt-0.5">Studio Catalog + Neural TTS + Google Engine</div>
          </div>
        </div>
      </div>

      {/* ── SECTION 1: Live Interactive Speech Synthesizer ────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Live Ghanaian Speech Synthesizer</span>
            </h2>
            <p className="text-xs text-slate-500">
              Type any text in Ghanaian English or Akan Twi to generate natural spoken speech in real-time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setCustomLang("en");
                setCustomText("Akwaaba! You are about to send 50 Ghana Cedis to Kwame Mensah.");
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                customLang === "en" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              English
            </button>
            <button
              onClick={() => {
                setCustomLang("tw");
                setCustomText("Ɔkwankyerɛfo Pa ma wo akwaaba. Worebɛmane sika aduonu akɔma Kwame.");
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                customLang === "tw" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Akan Twi
            </button>
          </div>
        </div>

        {/* Preset Phrase Pills */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-slate-500">1-Tap Ghanaian Text Presets:</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => applyPresetPhrase("Akwaaba! Welcome to Okwankyerɛfo Pa, an easy financial transaction service.", "en")}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium transition-colors"
            >
              🎙️ Welcome Greeting (EN)
            </button>
            <button
              onClick={() => applyPresetPhrase("Ɔkwankyerɛfo Pa ma wo akwaaba. Sɛ wopɛ Twi a, mia mmienu.", "tw")}
              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-medium border border-amber-200 transition-colors"
            >
              🎙️ Akwaaba Twi
            </button>
            <button
              onClick={() => applyPresetPhrase("You are about to send 100 Ghana Cedis to Ama Serwaa. Press 1 to confirm.", "en")}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-medium transition-colors"
            >
              🎙️ Send 100 Cedis Confirmation (EN)
            </button>
            <button
              onClick={() => applyPresetPhrase("Worebɛmane sidi ɔha akɔma Ama Serwaa. Sɛ wopene so a mia baako.", "tw")}
              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-lg text-[11px] font-medium border border-amber-200 transition-colors"
            >
              🎙️ Mane Sika Aduonum (Twi)
            </button>
            <button
              onClick={() => applyPresetPhrase("Congratulations! Your transfer was successful. Reference number is OKP847291.", "en")}
              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-medium border border-emerald-200 transition-colors"
            >
              🎙️ Success Receipt (EN)
            </button>
          </div>
        </div>

        {/* Textarea with Ghanaian character helper chips */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700">Text to Verbalize:</label>
            {/* Ghanaian Orthography Helper Characters (Ɛ, ɛ, Ɔ, ɔ) */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-400 font-mono">Twi Vowels:</span>
              <button
                onClick={() => insertSpecialChar("Ɛ")}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold font-mono"
              >
                Ɛ
              </button>
              <button
                onClick={() => insertSpecialChar("ɛ")}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold font-mono"
              >
                ɛ
              </button>
              <button
                onClick={() => insertSpecialChar("Ɔ")}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold font-mono"
              >
                Ɔ
              </button>
              <button
                onClick={() => insertSpecialChar("ɔ")}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold font-mono"
              >
                ɔ
              </button>
            </div>
          </div>

          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={3}
            className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium leading-relaxed"
            placeholder="Type speech prompt to synthesize..."
          />
        </div>

        {/* Voice Profile & Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">Voice Profile:</label>
            <select
              value={voiceProfile}
              onChange={(e) => setVoiceProfile(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs font-medium focus:outline-none"
            >
              <option value="ghanaian-warm">Ghanaian Warm (Natural IVR)</option>
              <option value="elderly-accessible">Elderly Accessible (Slow, Crisp)</option>
              <option value="ghanaian-expressive">Ghanaian Expressive</option>
              <option value="standard-telephony">Standard Telephony Mono</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Speech Rate: <span className="font-mono text-emerald-700 font-bold">{speechSpeed}x</span>
            </label>
            <input
              type="range"
              min="0.75"
              max="1.25"
              step="0.05"
              value={speechSpeed}
              onChange={(e) => setSpeechSpeed(parseFloat(e.target.value))}
              className="w-full accent-emerald-600 mt-2"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleSynthesize}
              disabled={isSynthesizing || !customText.trim()}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              {isSynthesizing ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Synthesize &amp; Listen</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Synthesized Output Banner */}
        {synthesizedAudioUrl && (
          <div className="p-4 bg-slate-900 rounded-2xl text-white border border-slate-800 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-bold">
                  <Headphones className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">Synthesized Spoken Audio Ready</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Provider: {synthProvider} • Generated in {synthDuration}ms
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleSynthPlayback}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  {isSynthPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play Speech</span>
                    </>
                  )}
                </button>
                <a
                  href={synthesizedAudioUrl}
                  download={`okwankyer_tts_${Date.now()}.mp3`}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors"
                  title="Download MP3"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="p-2.5 bg-slate-950 rounded-xl text-xs text-slate-300 italic border border-slate-800/80">
              &quot;{customText}&quot;
            </div>
          </div>
        )}
      </div>

      {/* ── SECTION 2: Verified Pre-Recorded Audio Prompts Grid ─────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              Verified Studio Telephony Prompts ({activeClips?.length || 0})
            </h2>
            <p className="text-xs text-slate-500">
              Human-recorded studio audio clips for Ghana Telecom IVR telephony flows.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedLang("en")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedLang === "en" ? "bg-slate-900 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              English Prompts ({manifest?.englishPrompts.length || 0})
            </button>
            <button
              onClick={() => setSelectedLang("twi")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedLang === "twi" ? "bg-slate-900 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Twi Prompts ({manifest?.twiPrompts.length || 0})
            </button>
          </div>
        </div>

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
                    onClick={() => handlePlayCatalogAudio(item)}
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
                  <a
                    href={item.url}
                    download={item.filename}
                    className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-mono"
                    title="Download studio audio prompt"
                  >
                    <Download className="w-3 h-3" />
                    <span>Download</span>
                  </a>
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
