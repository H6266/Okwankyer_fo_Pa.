import React, { useState } from "react";
import {
  PhoneCall,
  PhoneOff,
  Volume2,
  Mic2,
  Lock,
  Layers,
  CheckCircle2,
  Terminal,
  Activity,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { api } from "../../lib/api";

export const IvrLabPage: React.FC = () => {
  const [callerNumber, setCallerNumber] = useState("+233543546010");
  const [callActive, setCallActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("idle");
  const [pressedDigits, setPressedDigits] = useState<string[]>([]);
  const [voiceXmlLog, setVoiceXmlLog] = useState<string[]>([]);
  const [simulatedVoiceXml, setSimulatedVoiceXml] = useState<string | null>(null);

  const startCall = async () => {
    setCallActive(true);
    setCurrentStep("welcome");
    setPressedDigits([]);
    const xml = `<Response>\n  <Say voice="woman">Akwaaba. Welcome to Okwankyerɛfo Pa. Press 1 for English, Press 2 for Akan Twi.</Say>\n  <GetDigits timeout="10" finishOnKey="#" numDigits="1" callbackUrl="/api/voice/callback?step=language">\n  </GetDigits>\n</Response>`;
    setSimulatedVoiceXml(xml);
    setVoiceXmlLog([`[CALL INITIATED] Caller: ${callerNumber}`, `[OUTBOUND XML] Welcome & Language Selection`]);
  };

  const endCall = () => {
    setCallActive(false);
    setCurrentStep("idle");
    setSimulatedVoiceXml(null);
    setVoiceXmlLog((prev) => [...prev, `[CALL TERMINATED]`]);
  };

  const handlePressKeypad = (digit: string) => {
    if (!callActive) return;
    setPressedDigits((prev) => [...prev, digit]);
    setVoiceXmlLog((prev) => [...prev, `[DTMF KEYPAD PRESSED] Key: ${digit}`]);

    if (currentStep === "welcome") {
      if (digit === "1") {
        setCurrentStep("english_menu");
        setSimulatedVoiceXml(
          `<Response>\n  <Say voice="woman">English selected. Press 1 to Send Money, Press 2 to Check Balance, Press 3 to Buy Airtime.</Say>\n  <GetDigits timeout="10" numDigits="1" callbackUrl="/api/voice/callback?step=action"></GetDigits>\n</Response>`
        );
      } else {
        setCurrentStep("twi_menu");
        setSimulatedVoiceXml(
          `<Response>\n  <Play>https://okwankyer-fo-pa.onrender.com/audio/prompts/twi_menu.wav</Play>\n  <GetDigits timeout="10" numDigits="1" callbackUrl="/api/voice/callback?step=action"></GetDigits>\n</Response>`
        );
      }
    } else if (currentStep === "english_menu" || currentStep === "twi_menu") {
      if (digit === "1") {
        setCurrentStep("send_money_amount");
        setSimulatedVoiceXml(
          `<Response>\n  <Say voice="woman">Enter the amount in Ghana Cedis followed by the hash key.</Say>\n  <GetDigits timeout="10" finishOnKey="#" callbackUrl="/api/voice/callback?step=amount"></GetDigits>\n</Response>`
        );
      } else if (digit === "2") {
        setCurrentStep("balance_result");
        setSimulatedVoiceXml(
          `<Response>\n  <Say voice="woman">Your MTN MoMo wallet balance is 1,000 Ghana Cedis. Medaase.</Say>\n</Response>`
        );
      }
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans pb-16">
      {/* ── Security Rule Reminder ────────────────────────────────────────── */}
      <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
        <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
          <Lock className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-amber-900">
            IVR Handset Authorization Mandate
          </div>
          <p className="text-xs text-amber-900 mt-0.5">
            The IVR never prompts for customer PINs.
            Once the user confirms the transaction amount and recipient on the call, the system triggers MTN&apos;s network prompt and tells the user:
            &quot;Please approve the MoMo prompt on your phone screen.&quot;
          </p>
        </div>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                IVR / Africa&apos;s Talking Laboratory
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                Phase 5 Integration
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              End-to-end telephone call simulator and Africa&apos;s Talking webhook inspector with DTMF keypad and dual-language IVR prompts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">AT Dedicated Line</span>
            <div className="font-extrabold text-slate-800 mt-0.5">+233 30 804 8098</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Webhook Route</span>
            <div className="font-extrabold text-slate-800 mt-0.5 font-mono">POST /api/voice/callback</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Audio Format</span>
            <div className="font-extrabold text-emerald-700 mt-0.5">8kHz Linear PCM / MP3</div>
          </div>
        </div>
      </div>

      {/* ── Telephone Simulator & Keypad ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900">
              Interactive Telephone Keypad (DTMF)
            </h2>
            <div className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              callActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
            }`}>
              <span className={`w-2 h-2 rounded-full ${callActive ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
              {callActive ? "CALL CONNECTED" : "OFF-HOOK / IDLE"}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Simulated Inbound Caller ID
            </label>
            <input
              type="text"
              value={callerNumber}
              onChange={(e) => setCallerNumber(e.target.value)}
              disabled={callActive}
              className="w-full text-xs border border-slate-300 rounded-xl px-3.5 py-2 font-mono text-slate-900 outline-none"
            />
          </div>

          {/* Keypad Grid */}
          <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto py-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePressKeypad(key)}
                disabled={!callActive}
                className="h-12 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-xl text-base font-extrabold text-slate-800 active:scale-95 transition-all flex items-center justify-center shadow-2xs"
              >
                {key}
              </button>
            ))}
          </div>

          {/* Call / Hangup Buttons */}
          <div className="flex gap-3">
            {!callActive ? (
              <button
                type="button"
                onClick={startCall}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Simulate Inbound Call</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={endCall}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Hang Up Call</span>
              </button>
            )}
          </div>
        </div>

        {/* VoiceXML & Session Log */}
        <div className="lg:col-span-6 bg-slate-900 rounded-2xl border border-slate-800 p-5 text-white shadow-sm flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-800 text-xs font-mono text-slate-400 flex items-center justify-between">
              <span>AFRICA&apos;S TALKING VOICEXML RESPONSE</span>
              <span className="text-emerald-400 font-bold">200 OK</span>
            </div>

            <div className="mt-4 font-mono text-xs space-y-4">
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  Active VoiceXML:
                </div>
                <pre className="text-[11px] bg-slate-950 p-3 rounded-xl border border-slate-800 text-emerald-300 overflow-x-auto">
                  {simulatedVoiceXml || "<!-- No active call session -->"}
                </pre>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  Session Events &amp; DTMF Trace:
                </div>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 max-h-48 overflow-y-auto text-[11px] text-slate-300">
                  {voiceXmlLog.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-800">
            Africa&apos;s Talking Webhook Engine
          </div>
        </div>
      </div>
    </div>
  );
};
