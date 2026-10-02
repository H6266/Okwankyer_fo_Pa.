import React, { useState } from "react";
import { BookOpen, Code, FileText } from "lucide-react";

export const DocsPage: React.FC = () => {
  const [activeDoc, setActiveDoc] = useState<"architecture" | "ivr_script" | "grammar">("architecture");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
          Technical Documentation &amp; VoiceXML Flow
        </h1>
        <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-0.5">
          In-app specifications for Africa's Talking IVR integration, VoiceXML grammar specifications, and Zero-PIN security standards.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-white dark:bg-[#101B15] border border-[#0F382A]/10 w-fit rounded-xl">
        <button
          onClick={() => setActiveDoc("architecture")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeDoc === "architecture" ? "bg-[#0F382A] text-white" : "text-[#5E7265]"
          }`}
        >
          1. System Architecture
        </button>
        <button
          onClick={() => setActiveDoc("ivr_script")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeDoc === "ivr_script" ? "bg-[#0F382A] text-white" : "text-[#5E7265]"
          }`}
        >
          2. Complete 10-Step IVR Script
        </button>
        <button
          onClick={() => setActiveDoc("grammar")}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeDoc === "grammar" ? "bg-[#0F382A] text-white" : "text-[#5E7265]"
          }`}
        >
          3. Universal DTMF Grammar
        </button>
      </div>

      {/* Content Container */}
      <div className="bg-white dark:bg-[#101B15] p-6 sm:p-8 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs space-y-6 text-xs text-[#3D4F44] dark:text-[#D4DFD8] leading-relaxed">
        {activeDoc === "architecture" && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[#111A15] dark:text-[#F8FAF8]">
              The Voice Accessibility Layer Architecture
            </h2>
            <p>
              <strong>Ɔkwankyerɛfo Pa</strong> does not replace existing telecommunications or mobile money networks in Ghana (MTN, Telecel, AT). Instead, it sits between citizens and existing USSD/digital services as an independent voice accessibility and safety layer.
            </p>

            <div className="p-4 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl font-mono text-[11px] border border-[#0F382A]/10">
              Caller (GSM Call) ➔ Africa's Talking Trunk (+233 30 804 8098)<br />
              ➔ Express VoiceXML Webhook (/voice-menu)<br />
              ➔ Dual-Track Audio Catalog (/audio/English &amp; /audio/Twi)<br />
              ➔ Simulated Telco Core KYC Lookup (Subscriber Database)<br />
              ➔ Zero-PIN Handset Handoff (RequestToPay USSD Push)<br />
              ➔ Voice Receipt + Reference ID (OKP-XXXXXX)
            </div>

            <h3 className="text-sm font-bold text-[#111A15] dark:text-[#F8FAF8] pt-2">
              The 4 Safety Pillars
            </h3>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Strict Dual-Track Language Isolation:</strong> Once chosen, 100% of prompts remain in that language.</li>
              <li><strong>Zero-PIN Voice Security Gate:</strong> PIN is never spoken or captured over voice.</li>
              <li><strong>Spoken KYC Name Readback:</strong> Verified full name readback before debit.</li>
              <li><strong>Universal Keypad Grammar:</strong> # submit, * pesewas, 8 back, 9 repeat, 0 exit.</li>
            </ul>
          </div>
        )}

        {activeDoc === "ivr_script" && (
          <div className="space-y-4 font-mono text-xs">
            <h2 className="text-base font-bold text-[#111A15] dark:text-[#F8FAF8] font-sans">
              Complete 10-Step Dual-Language IVR Script
            </h2>
            <div className="space-y-4">
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border">
                <strong>STEP 1: WELCOME &amp; LANGUAGE</strong><br />
                EN: "Welcome to Ɔkwankyerɛfo Pa. For English, press 1. For Twi, press 2."<br />
                TWI: "Akwaaba kɔ Ɔkwankyerɛfo Pa. Borɔfo, mia 1. Twi firi mu, mia 2."
              </div>
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border">
                <strong>STEP 2: SERVICE SELECTION</strong><br />
                EN: "For telecom or mobile money services, press 1. For banking services, press 2."<br />
                TWI: "Sɛ wopɛ sɛ wosende sika kɔ Mobile Money a, mia 1. Sikakorabea, mia 2."
              </div>
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border">
                <strong>STEP 3: NETWORK PROVIDER</strong><br />
                EN: "Select your network. For MTN, press 1. For Telecel, press 2. For AirtelTigo, press 3."<br />
                TWI: "Afei selecte wo network. Sɛ MTN a, mia 1. Sɛ Telecel a, mia 2. Sɛ AirtelTigo a, mia 3."
              </div>
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border">
                <strong>STEP 6: KYC NAME READBACK</strong><br />
                EN: "You are about to send money to Kwame Nyamebere, ending in 8464. To confirm, press 1."<br />
                TWI: "Me pɛ sɛ wo bɛ sendi sika kɔ Kwame Nyamebrɛ fɔn so, number a ɛwie 8464. Sɛ wopene so a, mia 1."
              </div>
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border">
                <strong>STEP 9: ZERO-PIN SCREEN HANDOFF</strong><br />
                EN: "Confirmed. Now please check your phone screen and enter your MoMo PIN accurately."<br />
                TWI: "Me pɛ sɛ ɔfa ɛsi wo phone no so na bɔ wo MoMo PIN."
              </div>
            </div>
          </div>
        )}

        {activeDoc === "grammar" && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-[#111A15] dark:text-[#F8FAF8]">
              Standardized Voice Keypad Grammar
            </h2>
            <p>
              Users with visual impairments and low text literacy need absolute predictability across menus:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono">
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-lg border">
                <strong>Key '#' (Submit):</strong> Immediately submits entered phone number or amount. Eliminates dead silence waiting for gateway timeout.
              </div>
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-lg border">
                <strong>Key '*' (Pesewas):</strong> Serves as decimal separator. Example: '50*50#' submits GH₵ 50.50.
              </div>
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-lg border">
                <strong>Key '8' (Back):</strong> Returns to the immediate previous menu level without restarting the call.
              </div>
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-lg border">
                <strong>Key '9' (Repeat):</strong> Replays current prompt cleanly if caller is in a noisy market or bus.
              </div>
              <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-lg border">
                <strong>Key '0' (Cancel/Exit):</strong> Immediately terminates call safely with guaranteed zero wallet deduction.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
