import React, { useState } from "react";
import { Play, Pause, Volume2, PhoneCall, Globe, CheckCheck, Smartphone, Receipt, ArrowRight } from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const HowItWorks: React.FC = () => {
  const { t } = useThemeLanguage();
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [activeAudioObj, setActiveAudioObj] = useState<HTMLAudioElement | null>(null);

  const stepIcons = [
    <PhoneCall key="1" className="w-5 h-5 text-emerald-600" />,
    <Globe key="2" className="w-5 h-5 text-amber-600" />,
    <CheckCheck key="3" className="w-5 h-5 text-emerald-600" />,
    <Smartphone key="4" className="w-5 h-5 text-blue-600" />,
    <Receipt key="5" className="w-5 h-5 text-emerald-600" />,
  ];

  const handleToggleAudio = (url: string) => {
    if (playingAudio === url && activeAudioObj) {
      activeAudioObj.pause();
      setPlayingAudio(null);
      return;
    }

    if (activeAudioObj) {
      activeAudioObj.pause();
    }

    const audio = new Audio(url);
    audio.play().catch(console.warn);
    audio.onended = () => setPlayingAudio(null);
    setActiveAudioObj(audio);
    setPlayingAudio(url);
  };

  return (
    <section id="how-it-works" className="py-20 bg-slate-50 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t.howItWorks.heading}
          </h2>
          <p className="mt-3 text-lg text-slate-600 leading-relaxed font-normal">
            {t.howItWorks.subheading}
          </p>
        </div>

        {/* 5-Step Flow Cards */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {t.howItWorks.steps.map((st, idx) => (
            <div
              key={st.stepNumber}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow relative"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs flex items-center justify-center border border-emerald-200/60 shadow-2xs">
                    {st.stepNumber}
                  </span>
                  {stepIcons[idx]}
                </div>
                <h3 className="font-bold text-sm text-slate-900 leading-snug">
                  {st.title}
                </h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                  {st.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] font-mono text-slate-400">
                Step 0{idx + 1} of 05
              </div>
            </div>
          ))}
        </div>

        {/* Audio Samples Showcase Card */}
        <div className="mt-12 bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  Hear the Real Studio Prompts
                </h3>
              </div>
              <p className="text-xs text-slate-600">
                Listen to the real English and Akan Twi audio prompts recorded for Ghanaian phone users.
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              Byte-Range HTTP 206 Live
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* English Prompt Sample */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">English Track</span>
                <div className="font-bold text-xs text-slate-900">1. Welcome &amp; Language Choice</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">&quot;Welcome to Ɔkwankyerɛfo Pa...&quot;</div>
              </div>
              <button
                onClick={() => handleToggleAudio("/audio/Welcome_prompt_01.mp3")}
                className="p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-colors shrink-0 ml-3"
                aria-label="Play English welcome audio"
              >
                {playingAudio === "/audio/Welcome_prompt_01.mp3" ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </button>
            </div>

            {/* Akan Twi Prompt Sample */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 font-semibold">
                  Akan Twi Track
                </span>
                <div className="font-bold text-xs text-slate-900">6. Spoken KYC Name Confirmation</div>
                <div className="text-[11px] text-slate-500 font-mono mt-0.5">&quot;Me pɛ sɛ wo bɛ sendi sika kɔ...&quot;</div>
              </div>
              <button
                onClick={() => handleToggleAudio("/audio/Twi/Audio_prompt_twi_06.mp3")}
                className="p-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-colors shrink-0 ml-3"
                aria-label="Play Akan Twi KYC confirmation audio"
              >
                {playingAudio === "/audio/Twi/Audio_prompt_twi_06.mp3" ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
