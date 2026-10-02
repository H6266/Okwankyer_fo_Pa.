import React, { useState } from "react";
import { Settings, Shield, Key, Eye, EyeOff, AlertTriangle, CheckCircle2 } from "lucide-react";

export const SettingsPage: React.FC = () => {
  const [showKeys, setShowKeys] = useState(false);
  const [envMode, setEnvMode] = useState<"sandbox" | "live">("sandbox");
  const [confirmLiveModal, setConfirmLiveModal] = useState(false);

  // Config timers
  const [recipientTimeout, setRecipientTimeout] = useState(40);
  const [amountTimeout, setAmountTimeout] = useState(30);

  const handleToggleLive = () => {
    if (envMode === "sandbox") {
      setConfirmLiveModal(true);
    } else {
      setEnvMode("sandbox");
    }
  };

  const confirmSwitchToLive = () => {
    setEnvMode("live");
    setConfirmLiveModal(false);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
          Settings &amp; Configuration
        </h1>
        <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-0.5">
          Audit masked environment credentials, adjust accessibility input timers, and inspect system feature flags.
        </p>
      </div>

      {/* Environment Mode Selector */}
      <div className="bg-white dark:bg-[#101B15] p-5 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs flex items-center justify-between">
        <div>
          <div className="text-xs font-bold text-[#111A15] dark:text-[#F8FAF8]">
            Deployment Target Environment
          </div>
          <p className="text-[11px] text-[#5E7265] dark:text-[#95A99E] mt-0.5">
            Default sandbox mode uses test currency and simulated telco transactions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold ${
              envMode === "sandbox" ? "bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40" : "bg-red-500/20 text-red-500 border border-red-500/40"
            }`}
          >
            {envMode.toUpperCase()}
          </span>
          <button
            onClick={handleToggleLive}
            className="px-3 py-1 bg-[#0F382A] text-white hover:bg-[#1A543F] text-xs font-bold rounded-lg"
          >
            Switch to {envMode === "sandbox" ? "Live" : "Sandbox"}
          </button>
        </div>
      </div>

      {/* Masked Credentials Card */}
      <div className="bg-white dark:bg-[#101B15] p-6 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#0F382A]/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-[#D4AF37]" />
            <h2 className="text-sm font-bold text-[#111A15] dark:text-[#F8FAF8]">
              Server-Side API Credentials (Masked)
            </h2>
          </div>
          <button
            onClick={() => setShowKeys(!showKeys)}
            className="flex items-center gap-1.5 text-xs text-[#5E7265] hover:text-[#0F382A]"
          >
            {showKeys ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showKeys ? "Mask Keys" : "Reveal (Masked)"}</span>
          </button>
        </div>

        <div className="space-y-3 font-mono text-xs">
          <div className="flex justify-between items-center py-2 border-b border-[#0F382A]/5">
            <span className="text-[#5E7265]">AT_VOICE_NUMBER</span>
            <span className="font-bold text-[#111A15] dark:text-[#F8FAF8]">+233 30 804 8098</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-[#0F382A]/5">
            <span className="text-[#5E7265]">AT_USERNAME</span>
            <span className="text-[#111A15] dark:text-[#F8FAF8]">{showKeys ? "sandbox" : "s*******"}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-[#0F382A]/5">
            <span className="text-[#5E7265]">AT_API_KEY</span>
            <span className="text-[#111A15] dark:text-[#F8FAF8]">{showKeys ? "atsk_live_********************8464" : "********************************"}</span>
          </div>

          <div className="flex justify-between items-center py-2">
            <span className="text-[#5E7265]">GEMINI_API_KEY (Speech &amp; Dialect STT)</span>
            <span className="text-[#111A15] dark:text-[#F8FAF8]">{showKeys ? "AIzaSy********************921" : "********************************"}</span>
          </div>
        </div>
      </div>

      {/* Input Windows Config */}
      <div className="bg-white dark:bg-[#101B15] p-6 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs space-y-4">
        <h2 className="text-sm font-bold text-[#111A15] dark:text-[#F8FAF8]">
          Accessibility Timer Calibration
        </h2>
        <p className="text-xs text-[#5E7265]">
          Unlike standard USSD 15-second timeouts, Ɔkwankyerɛfo Pa allows extended entry windows.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="text-[11px] font-semibold text-[#5E7265] block mb-1">
              Recipient Phone Window (Seconds):
            </label>
            <input
              type="number"
              value={recipientTimeout}
              onChange={(e) => setRecipientTimeout(parseInt(e.target.value) || 40)}
              className="w-full px-3 py-1.5 rounded-lg border bg-[#FAF9F5] dark:bg-[#16241D] font-mono font-bold"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-[#5E7265] block mb-1">
              Transfer Amount Window (Seconds):
            </label>
            <input
              type="number"
              value={amountTimeout}
              onChange={(e) => setAmountTimeout(parseInt(e.target.value) || 30)}
              className="w-full px-3 py-1.5 rounded-lg border bg-[#FAF9F5] dark:bg-[#16241D] font-mono font-bold"
            />
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Live Switch */}
      {confirmLiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#121E17] rounded-2xl border border-red-500 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Switch to Live Telco Environment?</h3>
            </div>
            <p className="text-xs text-[#3D4F44] dark:text-[#D4DFD8] leading-relaxed">
              Live mode connects directly to production telecommunication trunks and active Mobile Money settlement accounts. Real currency will be debited upon authorization.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmLiveModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-lg border"
              >
                Cancel
              </button>
              <button
                onClick={confirmSwitchToLive}
                className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg"
              >
                I Understand, Enable Live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
