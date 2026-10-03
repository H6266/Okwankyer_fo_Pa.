import React from "react";
import { CheckCircle2, User } from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const WhoItsFor: React.FC = () => {
  const { t } = useThemeLanguage();

  const personaMeta: Record<string, { tag: string; photoHint: string }> = {
    visually_impaired: {
      tag: "Accessibility First",
      photoHint: "Auditory guidance & keypad muscle memory",
    },
    elderly: {
      tag: "Patience Guaranteed",
      photoHint: "Gentle repetition & zero timeout rush",
    },
    low_literacy: {
      tag: "Pure Spoken Voice",
      photoHint: "Clear spoken Twi or English",
    },
    market_traders: {
      tag: "Fast & Protected",
      photoHint: "Instant KYC readback in loud markets",
    },
  };

  return (
    <section id="who-its-for" className="py-20 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t.personas.heading}
          </h2>
          <p className="mt-3 text-lg text-slate-600 leading-relaxed font-normal">
            {t.personas.subheading}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {t.personas.items.map((p) => {
            const meta = personaMeta[p.id];
            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow group"
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/60">
                      {meta?.tag}
                    </span>
                    <User className="w-4 h-4 text-slate-400" />
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                    {p.role}
                  </h3>

                  <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 italic">
                    &quot;{p.scenario}&quot;
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-bold text-slate-900">How Ɔkwankyerɛfo Pa helps:</div>
                    <div className="flex items-start gap-2 text-xs text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{p.solution}</span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-[11px] font-mono text-slate-500">
                  {meta?.photoHint}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
