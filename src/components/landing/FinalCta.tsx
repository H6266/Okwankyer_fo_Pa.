import React from "react";
import { Link } from "react-router-dom";
import { Phone, ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const FinalCta: React.FC = () => {
  const { t } = useThemeLanguage();

  return (
    <section className="py-20 bg-gradient-to-b from-slate-50 via-white to-emerald-50/30 text-slate-900 border-b border-slate-200 relative overflow-hidden">
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-xs font-bold text-emerald-800 border border-emerald-200">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Zero-PIN Voice Security • Ghana DFS Hackathon Pilot</span>
        </div>

        <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 leading-tight">
          {t.finalCta.heading}
        </h2>

        <p className="text-base sm:text-xl text-slate-600 max-w-2xl mx-auto font-normal leading-relaxed">
          {t.finalCta.subheading}
        </p>

        {/* Big Phone Number Card */}
        <div className="pt-2">
          <a
            href="tel:+233308048098"
            className="inline-flex flex-col sm:flex-row items-center gap-4 px-8 py-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-2xl sm:text-3xl shadow-lg transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <div className="w-12 h-12 rounded-xl bg-white text-emerald-700 flex items-center justify-center shadow-xs">
              <Phone className="w-6 h-6 fill-current" />
            </div>
            <span>+233 30 804 8098</span>
          </a>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            to="/dashboard/api"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-xs transition-colors"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>Test MoMo API &amp; Simulator</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/dashboard"
            className="text-xs text-slate-600 hover:text-slate-900 underline py-2 font-medium"
          >
            Explore Developer Console &amp; Test Suite
          </Link>
        </div>

        <p className="text-xs text-slate-500 font-mono pt-2">
          {t.finalCta.zeroDataNote}
        </p>
      </div>
    </section>
  );
};
