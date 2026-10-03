import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Phone, Menu, X, ArrowRight, Zap } from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const Header: React.FC = () => {
  const { language, setLanguage, t } = useThemeLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-2xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <Link
          to="/"
          className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 hover:opacity-90 transition-opacity flex items-center gap-2.5"
          aria-label="Ɔkwankyerɛfo Pa Home"
        >
          <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg shrink-0 border border-emerald-200/60 shadow-2xs">
            🔊
          </span>
          <span className="font-extrabold text-slate-900 tracking-tight">Ɔkwankyerɛfo Pa</span>
        </Link>

        {/* Zone 2: Clean text navigation links */}
        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-slate-600">
          <a href="#why" className="hover:text-emerald-700 transition-colors py-1">
            {t.nav.why}
          </a>
          <a href="#how-it-works" className="hover:text-emerald-700 transition-colors py-1">
            {t.nav.howItWorks}
          </a>
          <a href="#safety" className="hover:text-emerald-700 transition-colors py-1">
            {t.nav.safety}
          </a>
          <a href="#who-its-for" className="hover:text-emerald-700 transition-colors py-1">
            {t.nav.whoItsFor}
          </a>
          <a href="#languages" className="hover:text-emerald-700 transition-colors py-1">
            {t.nav.languages}
          </a>
        </nav>

        {/* Zone 3: Actions + Language Toggle */}
        <div className="flex items-center gap-3">
          {/* Language Toggle (EN / Twi) */}
          <div
            className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200/80"
            role="group"
            aria-label="Language selector"
          >
            <button
              onClick={() => setLanguage("en")}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                language === "en"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              aria-pressed={language === "en"}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage("twi")}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                language === "twi"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              aria-pressed={language === "twi"}
            >
              Twi
            </button>
          </div>

          {/* Call +233 30 804 8098 Button */}
          <a
            href="tel:+233308048098"
            className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors"
          >
            <Phone className="w-3.5 h-3.5 fill-current" />
            <span>Call +233 30 804 8098</span>
          </a>

          {/* Try Demo link to Dashboard */}
          <Link
            to="/dashboard/api"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl shadow-2xs transition-colors"
          >
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden xs:inline">Test MoMo</span>
            <span className="xs:hidden">Test</span>
          </Link>

          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-b border-slate-200 bg-white px-4 pt-3 pb-6 space-y-4 shadow-lg">
          <nav className="flex flex-col space-y-3 text-base font-medium text-slate-700">
            <a
              href="#why"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-emerald-700"
            >
              {t.nav.why}
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-emerald-700"
            >
              {t.nav.howItWorks}
            </a>
            <a
              href="#safety"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-emerald-700"
            >
              {t.nav.safety}
            </a>
            <a
              href="#who-its-for"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-emerald-700"
            >
              {t.nav.whoItsFor}
            </a>
            <a
              href="#languages"
              onClick={() => setMobileMenuOpen(false)}
              className="px-2 py-1.5 hover:text-emerald-700"
            >
              {t.nav.languages}
            </a>
          </nav>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5">
            <a
              href="tel:+233308048098"
              className="flex items-center justify-center gap-2 w-full py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs"
            >
              <Phone className="w-4 h-4 fill-current" />
              <span>Call +233 30 804 8098</span>
            </a>
            <Link
              to="/dashboard/api"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200"
            >
              <span>Test MoMo API &amp; Dashboard</span>
              <ArrowRight className="w-4 h-4 text-emerald-600" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
