import React from "react";
import { EyeOff, Clock, AlertTriangle, ShieldAlert } from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const TheProblem: React.FC = () => {
  const { t } = useThemeLanguage();

  const iconMap: Record<string, React.ReactNode> = {
    visual_menus: <EyeOff className="w-6 h-6 text-rose-600" />,
    timeout_anxiety: <Clock className="w-6 h-6 text-amber-600" />,
    wrong_numbers: <AlertTriangle className="w-6 h-6 text-rose-600" />,
    pin_eavesdropping: <ShieldAlert className="w-6 h-6 text-emerald-600" />,
  };

  return (
    <section id="why" className="py-20 bg-slate-50 border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t.problem.heading}
          </h2>
          <p className="mt-3 text-lg text-slate-600 leading-relaxed font-normal">
            {t.problem.subheading}
          </p>
        </div>

        {/* 4 Compact Problem Cards */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {t.problem.cards.map((card) => (
            <div
              key={card.id}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl w-fit mb-5 shadow-2xs">
                  {iconMap[card.id]}
                </div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {card.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 text-xs font-semibold text-rose-700">
                {card.impact}
              </div>
            </div>
          ))}
        </div>

        {/* Sourced Context Stat Area */}
        <div className="mt-12 bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              National Financial Inclusion Reality
            </span>
            <div className="text-sm sm:text-base font-medium text-slate-800 leading-relaxed">
              Ghana has over <strong>20 million active Mobile Money accounts</strong>, yet visual USSD menus and tight 15-second timeouts systematically exclude millions of elderly citizens, market traders, and visually impaired Ghanaians.
            </div>
          </div>
          <div className="shrink-0 p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center min-w-[200px]">
            <div className="text-3xl font-black text-emerald-800">100% Voice</div>
            <div className="text-xs font-semibold text-emerald-700 mt-1">Works on ordinary phone calls</div>
          </div>
        </div>
      </div>
    </section>
  );
};
