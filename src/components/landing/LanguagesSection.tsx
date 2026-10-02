import React from "react";
import { Check, Clock, Globe } from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const LanguagesSection: React.FC = () => {
  const { t } = useThemeLanguage();

  return (
    <section id="languages" className="py-20 bg-slate-50 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t.languagesSection.heading}
          </h2>
          <p className="mt-3 text-lg text-slate-600 leading-relaxed font-normal">
            {t.languagesSection.subheading}
          </p>
        </div>

        {/* Live Languages Cards */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          {t.languagesSection.activeLanguages.map((lang, idx) => (
            <div
              key={lang.name}
              className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Track 0{idx + 1} • {lang.status}
                  </span>
                  <Check className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {lang.name}
                </h3>
                <p className="text-xs font-medium text-emerald-700 mt-1">{lang.nativeName}</p>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  {lang.coverage}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
                <span>12 Native Studio Audio Tracks</span>
                <span className="text-emerald-700 font-semibold">100% Isolated</span>
              </div>
            </div>
          ))}
        </div>

        {/* Roadmap Strip */}
        <div className="mt-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800 mb-3">
            <Clock className="w-4 h-4 text-amber-600" />
            <span>{t.languagesSection.roadmapTitle}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {t.languagesSection.roadmapLanguages.map((rd) => (
              <div
                key={rd.name}
                className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 shadow-2xs"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900">{rd.name}</div>
                  <div className="text-[10px] text-slate-500">{rd.nativeName}</div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                  {rd.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
