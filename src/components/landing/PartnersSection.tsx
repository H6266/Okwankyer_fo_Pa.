import React from "react";
import { CheckCircle2, Clock } from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";

export const PartnersSection: React.FC = () => {
  const { t } = useThemeLanguage();

  const providers = [
    {
      name: "MTN Mobile Money",
      role: "Live API Sandbox Integration",
      badge: "Active",
      statusNote: "Collections & Disbursements Gateway Active",
    },
    {
      name: "Telecel Cash",
      role: "National Telco Core Integration",
      badge: "Roadmap",
      statusNote: "Architecture stubbed; adapter planned for pilot phase 2",
    },
    {
      name: "AT Money (AirtelTigo)",
      role: "National Telco Core Integration",
      badge: "Roadmap",
      statusNote: "Architecture stubbed; adapter planned for pilot phase 2",
    },
    {
      name: "GhIPSS & Bank Partners",
      role: "Interoperability & Proxy Banking",
      badge: "Roadmap",
      statusNote: "Direct clearinghouse settlement adapter on roadmap",
    },
  ];

  return (
    <section className="py-20 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            {t.partners.heading}
          </h2>
          <p className="mt-3 text-lg text-slate-600 leading-relaxed font-normal">
            {t.partners.liveWith}
          </p>
        </div>

        {/* Partners Grid */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {providers.map((p) => (
            <div
              key={p.name}
              className={`p-6 rounded-2xl border shadow-xs flex flex-col justify-between ${
                p.badge === "Live" || p.badge === "Active"
                  ? "bg-emerald-50/40 border-emerald-300"
                  : "bg-slate-50/60 border-slate-200"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      p.badge === "Live" || p.badge === "Active"
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {p.badge}
                  </span>
                  {p.badge === "Live" || p.badge === "Active" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-slate-400" />
                  )}
                </div>

                <h3 className="text-lg font-bold text-slate-900">{p.name}</h3>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">{p.role}</p>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-200/80 text-[11px] font-mono text-slate-500">
                {p.statusNote}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
