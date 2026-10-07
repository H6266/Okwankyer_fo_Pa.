import React, { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  PhoneCall,
  Mic2,
  FileAudio,
  Code2,
  ShieldCheck,
  Users,
  ReceiptText,
  History,
  CheckSquare,
  Settings,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Activity,
  Menu,
  X,
  ExternalLink,
  Zap,
  Rocket,
  Smartphone,
} from "lucide-react";
import { useThemeLanguage } from "../../context/ThemeLanguageContext";
import { api, HealthResponse } from "../../lib/api";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { path: "/dashboard/preach", label: "📖 Preach Mode (Study)", icon: BookOpen, badge: "AI PEN" },
  { path: "/dashboard/momo", label: "🟢 MoMo Laboratory", icon: Code2, badge: "Phase 1" },
  { path: "/dashboard/asr", label: "⚪ ASR Laboratory", icon: Mic2, badge: "Phase 2" },
  { path: "/dashboard/tts", label: "⚪ TTS Laboratory", icon: FileAudio, badge: "Phase 3" },
  { path: "/dashboard/llm", label: "⚪ LLM / Intent Lab", icon: Zap, badge: "Phase 4" },
  { path: "/dashboard/ivr", label: "📞 IVR / Africa's Talking", icon: PhoneCall, badge: "Phase 5" },
  { path: "/dashboard/tests", label: "🧪 Integration Tests", icon: ShieldCheck },
  { path: "/dashboard/tasks", label: "📋 Hackathon Tasks", icon: CheckSquare },
  {
    path: "/dashboard/phone",
    label: "📱 Phone Simulator",
    icon: Smartphone,
    badge: "NEW",
  },
  { path: "/dashboard/settings", label: "⚙ Settings", icon: Settings },
];

export const DashboardLayout: React.FC = () => {
  const { language, setLanguage } = useThemeLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const location = useLocation();

  useEffect(() => {
    api
      .getHealth()
      .then(setHealth)
      .catch((e) => console.warn("Dashboard health poll failed:", e));
    const interval = setInterval(() => {
      api.getHealth().then(setHealth).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Global '?' keyboard shortcut for help overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "?" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        setShowHelp((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const currentNav =
    NAV_ITEMS.find((item) =>
      item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path)
    ) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans">
      {/* ── Desktop Sidebar (Clean White) ───────────────────────────────── */}
      <aside
        className={`hidden md:flex flex-col border-r border-slate-200 bg-white transition-all duration-300 z-30 shadow-xs ${
          collapsed ? "w-18" : "w-64"
        }`}
      >
        {/* Brand & App Link */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
          <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
            <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg shrink-0 border border-emerald-200/60 shadow-2xs">
              🔊
            </span>
            {!collapsed && (
              <div className="truncate">
                <div className="font-extrabold text-sm text-slate-900 truncate leading-tight tracking-tight">
                  Ɔkwankyerɛfo Pa
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate">
                  Dev &amp; QA Console
                </div>
              </div>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Dashboard sidebar">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isApiTester = item.path === "/dashboard/api";
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.exact}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-emerald-700 text-white shadow-sm font-bold"
                      : isApiTester
                      ? "text-emerald-800 bg-emerald-50/80 hover:bg-emerald-100/70 border border-emerald-200/60 font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                  } ${collapsed ? "justify-center px-0" : ""}`
                }
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isApiTester ? "text-emerald-600" : ""}`} />
                {!collapsed && (
                  <div className="flex items-center justify-between w-full">
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-emerald-600 text-white">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom Section: Sandbox & Landing Link */}
        <div className="p-3 border-t border-slate-100 space-y-2">
          {!collapsed && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600">
              <div className="font-bold text-slate-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>MTN MoMo Sandbox</span>
                </span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded">
                  Active
                </span>
              </div>
              <div className="truncate font-mono mt-1 text-slate-500 font-medium">+233 30 804 8098</div>
            </div>
          )}
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Public Landing Page</span>}
          </Link>
        </div>
      </aside>

      {/* ── Main Viewport Canvas (Clean White Architecture) ─────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar: Pure White Surface */}
        <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-20 shadow-2xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Open navigation drawer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Link to="/dashboard" className="hover:text-emerald-700 transition-colors">
                Console
              </Link>
              <span className="text-slate-300" aria-hidden="true">
                /
              </span>
              <span className="text-slate-900 font-bold">{currentNav.label}</span>
            </div>
          </div>

          {/* Right Action & Status Group */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Preach Mode Document Study Button */}
            <Link
              to="/dashboard/preach"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-2xs transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-slate-950" />
              <span>Preach Mode</span>
            </Link>

            {/* Quick Test MoMo API Button */}
            <Link
              to="/dashboard/api"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Test MoMo API</span>
            </Link>

            {/* Environment Badge */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              SANDBOX
            </span>

            {/* Server Health Status Indicator */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-800 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200/60">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-semibold">{health?.status === "ok" ? "Online" : "Connecting..."}</span>
            </div>

            {/* Language Quick Toggle */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-xs font-bold border border-slate-200/80">
              <button
                onClick={() => setLanguage("en")}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  language === "en" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage("twi")}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  language === "twi" ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Twi
              </button>
            </div>

            {/* Help / Shortcuts Button */}
            <button
              onClick={() => setShowHelp(true)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Viewport Content Outlet */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-50/70">
          <Outlet />
        </main>

        {/* ── Mobile Bottom Navigation Bar ─────────────────────────────── */}
        <nav
          className="md:hidden border-t border-slate-200 bg-white px-2 py-1.5 flex items-center justify-around z-30 shadow-xs"
          aria-label="Mobile bottom navigation"
        >
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive =
              item.exact ? location.pathname === item.path : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors ${
                  isActive ? "text-emerald-700 font-bold" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <Icon className="w-5 h-5 mb-0.5" />
                <span className="truncate max-w-[56px]">{item.label.split(" ")[0]}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* ── Mobile Sidebar Drawer ───────────────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-4/5 max-w-xs bg-white h-full flex flex-col p-4 z-10 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="font-bold text-sm text-slate-900">Dashboard Navigation</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.exact}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                        isActive
                          ? "bg-emerald-700 text-white font-bold"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`
                    }
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* ── Help / Keyboard Shortcuts Modal ────────────────────────────── */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-600" />
                Keyboard Shortcuts &amp; Grammar
              </h3>
              <button
                onClick={() => setShowHelp(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span>Toggle this help window</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-800">
                  ?
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span>Voice keypad digits</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-800">
                  0 - 9
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span>Submit / Enter in voice flow</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-800">
                  # or Enter
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span>Decimal / Pesewas</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-800">
                  * or .
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span>Step back in IVR menu</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-800">
                  8
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span>Repeat current audio prompt</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-800">
                  9
                </kbd>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>Cancel / Clean call exit</span>
                <kbd className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-800">
                  0
                </kbd>
              </div>
            </div>

            <button
              onClick={() => setShowHelp(false)}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
