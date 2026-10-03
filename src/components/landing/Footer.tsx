import React from "react";
import { Link } from "react-router-dom";
import { Shield, Heart, Terminal, Zap } from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const Footer: React.FC = () => {
  const { t } = useThemeLanguage();

  return (
    <footer className="bg-white border-t border-slate-200 py-14 text-sm text-slate-600">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Col 1: Wordmark & Team */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔊</span>
              <span className="text-lg font-bold text-slate-900">
                Ɔkwankyerɛfo Pa
              </span>
              <span className="text-xs font-serif italic text-amber-700 font-semibold">
                &quot;The Good Guide&quot;
              </span>
            </div>
            <p className="text-xs leading-relaxed max-w-md text-slate-500">
              A voice accessibility and transaction safety layer for Ghana&apos;s Digital Financial Services. Built for the visually impaired, the elderly, low-text literacy citizens, and rural traders.
            </p>
            <div className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5 pt-1">
              <Heart className="w-3.5 h-3.5 fill-current text-rose-600" />
              <span>{t.footer.builtBy}</span>
            </div>
          </div>

          {/* Col 2: Navigation Links */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Product &amp; Safety
            </div>
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li><a href="#why" className="hover:text-emerald-700">Why Voice Matters</a></li>
              <li><a href="#how-it-works" className="hover:text-emerald-700">How It Works</a></li>
              <li><a href="#safety" className="hover:text-emerald-700">The 4 Safety Pillars</a></li>
              <li><a href="#languages" className="hover:text-emerald-700">Akan Twi &amp; English</a></li>
              <li><a href="tel:+233308048098" className="hover:text-emerald-700">Call +233 30 804 8098</a></li>
            </ul>
          </div>

          {/* Col 3: Developer & QA Links */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
              Developers &amp; QA
            </div>
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li>
                <Link to="/dashboard/api" className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline">
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span>Test MoMo API Live</span>
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-emerald-700">
                  <Terminal className="w-3 h-3" />
                  <span>{t.footer.developerLink}</span>
                </Link>
              </li>
              <li><Link to="/dashboard/voice" className="hover:text-emerald-700">Interactive Voice Tester</Link></li>
              <li><Link to="/dashboard/ledger" className="hover:text-emerald-700">MoMo Transaction Ledger</Link></li>
              <li><Link to="/dashboard/kyc" className="hover:text-emerald-700">KYC &amp; Subscribers</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Accessibility Statement & Privacy */}
        <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            <span>Zero-PIN Voice Policy: No caller PIN is ever spoken, recorded, or transmitted over voice.</span>
          </div>
          <div className="text-[11px] font-mono">
            WCAG 2.1 AAA Contrast • Ghana DFS MoMo Pilot
          </div>
        </div>
      </div>
    </footer>
  );
};
