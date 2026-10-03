import React from "react";
import { Shield, KeyRound, UserCheck, Grid } from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const SafetyPillars: React.FC = () => {
  const { t } = useThemeLanguage();

  const iconMap: Record<string, React.ReactNode> = {
    "01": <Shield className="w-6 h-6 text-emerald-600" />,
    "02": <KeyRound className="w-6 h-6 text-emerald-600" />,
    "03": <UserCheck className="w-6 h-6 text-emerald-600" />,
    "04": <Grid className="w-6 h-6 text-emerald-600" />,
  };

  return (
    <section id="safety" className="py-20 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t.pillars.heading}
          </h2>
          <p className="mt-3 text-lg text-slate-600 leading-relaxed font-normal">
            {t.pillars.subheading}
          </p>
        </div>

        {/* 4 Pillars Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          {t.pillars.items.map((pillar) => (
            <div
              key={pillar.number}
              className="bg-slate-50/70 p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between hover:bg-slate-50 transition-colors"
            >
              <div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl w-fit mb-4 shadow-2xs">
                  {iconMap[pillar.number] || <Shield className="w-6 h-6 text-emerald-600" />}
                </div>
                <h3 className="text-xl font-bold text-slate-900 tracking-tight">
                  {pillar.title}
                </h3>
                <div className="text-xs font-semibold text-emerald-700 mt-1">{pillar.tagline}</div>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {pillar.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 text-xs font-mono font-semibold text-emerald-700 bg-white p-2.5 rounded-lg border">
                ✓ {pillar.technicalDetail}
              </div>
            </div>
          ))}
        </div>

        {/* Universal Keypad Grammar Graphic */}
        <div className="mt-12 bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs">
          <div className="max-w-2xl mb-6">
            <h3 className="text-lg font-bold text-slate-900">
              {t.pillars.keypadGrammarTitle}
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              {t.pillars.keypadGrammarDesc}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {t.pillars.keys.map((k) => (
              <div
                key={k.key}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center text-center shadow-2xs"
              >
                <div className="w-12 h-12 rounded-xl bg-white border-2 border-slate-300 shadow-xs flex items-center justify-center text-2xl font-black font-mono text-slate-900 mb-2">
                  {k.key}
                </div>
                <div className="text-xs font-bold text-slate-900">{k.label}</div>
                <div className="text-[10px] text-slate-500 mt-1 leading-tight">{k.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
