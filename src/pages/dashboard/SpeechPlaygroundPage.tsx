import React, { useState } from "react";
import { Mic, MicOff, Play, Send, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { useSpeechRecognition, SpeechMatchResult } from "../../hooks/useSpeechRecognition";

const GHANAIAN_PRESETS = [
  // Akan Twi Presets
  { lang: "twi" as const, text: "Me pɛ sɛ me sendi sika", expectedDigit: "1", label: "I want to send money (Twi)" },
  { lang: "twi" as const, text: "Pene so baako", expectedDigit: "1", label: "Confirm with one (Twi)" },
  { lang: "twi" as const, text: "Sikakorabea mmienu", expectedDigit: "2", label: "Banking services two (Twi)" },
  { lang: "twi" as const, text: "Tɔ airtime anaa bundle", expectedDigit: "3", label: "Buy airtime or bundle (Twi)" },
  { lang: "twi" as const, text: "San kɔ akyi", expectedDigit: "8", label: "Step back (Twi Key 8)" },
  { lang: "twi" as const, text: "Tie bio biom", expectedDigit: "9", label: "Repeat audio (Twi Key 9)" },
  { lang: "twi" as const, text: "Twa transaction no mu", expectedDigit: "0", label: "Cancel transfer (Twi Key 0)" },
  // Ghanaian English Presets
  { lang: "en" as const, text: "Send mobile money", expectedDigit: "1", label: "Send money (English)" },
  { lang: "en" as const, text: "Confirm transfer one", expectedDigit: "1", label: "Confirm one (English)" },
  { lang: "en" as const, text: "Banking services two", expectedDigit: "2", label: "Banking two (English)" },
  { lang: "en" as const, text: "Go back to previous menu", expectedDigit: "8", label: "Go back (English Key 8)" },
  { lang: "en" as const, text: "Please repeat that again", expectedDigit: "9", label: "Repeat instruction (English Key 9)" },
  { lang: "en" as const, text: "Cancel and exit call", expectedDigit: "0", label: "Exit call (English Key 0)" },
];

export const SpeechPlaygroundPage: React.FC = () => {
  const [selectedLang, setSelectedLang] = useState<"en" | "twi">("twi");
  const [typedInput, setTypedInput] = useState("");
  const [currentResult, setCurrentResult] = useState<SpeechMatchResult | null>(null);
  const [testResults, setTestResults] = useState<Array<{ text: string; expected: string; actual?: string; pass: boolean }>>([]);

  const speech = useSpeechRecognition({
    language: selectedLang,
    isMuted: false,
    onMatch: (res) => {
      setCurrentResult(res);
    },
  });

  const handleTestPhrase = (phrase: string) => {
    const res = speech.resolveSpokenText(phrase, selectedLang);
    setCurrentResult(res);
  };

  const runAllPresets = () => {
    const results = GHANAIAN_PRESETS.filter((p) => p.lang === selectedLang).map((p) => {
      const res = speech.resolveSpokenText(p.text, p.lang);
      return {
        text: p.text,
        expected: p.expectedDigit,
        actual: res.resolvedDigit,
        pass: res.resolvedDigit === p.expectedDigit,
      };
    });
    setTestResults(results);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
          Speech &amp; NLU Playground
        </h1>
        <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-0.5">
          Test spoken and typed Akan Twi (`ak-GH`) and Ghanaian English (`en-US`) phrases to see resolved intent, confidence, and rule mapping.
        </p>
      </div>

      {/* Language Track Selector */}
      <div className="flex items-center gap-2 bg-white dark:bg-[#101B15] p-2 rounded-xl border border-[#0F382A]/10 w-fit">
        <span className="text-xs font-bold text-[#5E7265] px-2">Active Language:</span>
        <button
          onClick={() => setSelectedLang("twi")}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
            selectedLang === "twi"
              ? "bg-[#0F382A] text-white"
              : "text-[#3D4F44] dark:text-[#D4DFD8] hover:bg-[#0F382A]/5"
          }`}
        >
          Akan Twi (ak-GH)
        </button>
        <button
          onClick={() => setSelectedLang("en")}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
            selectedLang === "en"
              ? "bg-[#0F382A] text-white"
              : "text-[#3D4F44] dark:text-[#D4DFD8] hover:bg-[#0F382A]/5"
          }`}
        >
          Ghanaian English (en-US)
        </button>
      </div>

      {/* Main Testing Panel (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Interactive Input & Mic */}
        <div className="bg-white dark:bg-[#101B15] p-6 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#111A15] dark:text-[#F8FAF8]">
              Live Spoken or Typed Input
            </h2>
            {speech.supported && (
              <button
                onClick={() => (speech.isListening ? speech.stopListening() : speech.startListening())}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  speech.isListening
                    ? "bg-[#A32828] text-white animate-pulse"
                    : "bg-[#0F382A] text-white hover:bg-[#1A543F]"
                }`}
              >
                {speech.isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span>{speech.isListening ? "Stop Microphone" : "Speak into Mic"}</span>
              </button>
            )}
          </div>

          {speech.isListening && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Listening for {selectedLang === "twi" ? "Akan Twi" : "English"}... Try saying "baako", "mmienu", or "tie bio"</span>
            </div>
          )}

          {/* Text Input Box */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#5E7265]">Type a phrase to test:</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && typedInput && handleTestPhrase(typedInput)}
                placeholder={selectedLang === "twi" ? "e.g. Me pɛ sɛ me sendi sika..." : "e.g. Send 500 cedis to Kwame..."}
                className="flex-1 px-3.5 py-2 rounded-xl border border-[#0F382A]/20 bg-[#FAF9F5] dark:bg-[#16241D] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
              <button
                onClick={() => typedInput && handleTestPhrase(typedInput)}
                className="px-4 py-2 bg-[#0F382A] text-white rounded-xl text-xs font-bold hover:bg-[#1A543F] flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Resolve</span>
              </button>
            </div>
          </div>

          {/* Colloquial Ghanaian Presets */}
          <div className="space-y-2 pt-2 border-t border-[#0F382A]/10 dark:border-white/10">
            <span className="text-xs font-bold text-[#5E7265] block">Colloquial Presets:</span>
            <div className="flex flex-wrap gap-1.5">
              {GHANAIAN_PRESETS.filter((p) => p.lang === selectedLang).map((preset) => (
                <button
                  key={preset.text}
                  onClick={() => {
                    setTypedInput(preset.text);
                    handleTestPhrase(preset.text);
                  }}
                  className="px-2.5 py-1 text-xs bg-[#FAF9F5] dark:bg-[#16241D] hover:bg-[#D4AF37]/20 border border-[#0F382A]/10 dark:border-white/10 rounded-lg text-left"
                >
                  <span className="font-semibold text-[#111A15] dark:text-[#F8FAF8]">{preset.text}</span>
                  <span className="text-[10px] text-[#5E7265] block truncate max-w-[200px]">{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Resolved Intent Inspector */}
        <div className="bg-white dark:bg-[#101B15] p-6 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#0F382A]/10 dark:border-white/10">
              <h2 className="text-sm font-bold text-[#111A15] dark:text-[#F8FAF8]">
                Resolution Telemetry
              </h2>
              <span className="text-xs font-mono text-[#D4AF37]">
                {currentResult ? `${(currentResult.confidence * 100).toFixed(0)}% Confidence` : "Awaiting Input"}
              </span>
            </div>

            {currentResult ? (
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border border-[#0F382A]/10 dark:border-white/10 space-y-1">
                  <div className="text-[10px] text-[#5E7265]">INPUT TRANSCRIPT:</div>
                  <div className="text-sm font-bold text-[#111A15] dark:text-[#F8FAF8]">
                    "{currentResult.transcript}"
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border border-[#0F382A]/10 dark:border-white/10">
                    <div className="text-[10px] text-[#5E7265]">RESOLVED DTMF DIGIT:</div>
                    <div className="text-xl font-black text-[#D4AF37]">
                      {currentResult.resolvedDigit || "None (Fallback)"}
                    </div>
                  </div>

                  <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border border-[#0F382A]/10 dark:border-white/10">
                    <div className="text-[10px] text-[#5E7265]">RESOLVER ENGINE:</div>
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {currentResult.resolverType === "local_pattern" ? "Pattern Matching" : "NLU Model Fallback"}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border border-[#0F382A]/10 dark:border-white/10 space-y-1">
                  <div className="text-[10px] text-[#5E7265]">RESOLVED INTENT &amp; RULE:</div>
                  <div className="font-bold text-[#111A15] dark:text-[#F8FAF8]">
                    {currentResult.resolvedIntent}
                  </div>
                  <div className="text-[11px] text-[#5E7265]">{currentResult.matchedRule}</div>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-[#5E7265]">
                Pick a preset or speak into the microphone to see real-time dialect resolution.
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[#0F382A]/10 dark:border-white/10 flex items-center justify-between">
            <button
              onClick={runAllPresets}
              className="text-xs font-bold text-[#0F382A] dark:text-[#D4AF37] hover:underline"
            >
              Run Batch Test On All {selectedLang.toUpperCase()} Presets
            </button>
            <span className="text-[11px] font-mono text-[#5E7265]">Latency: &lt; 50ms</span>
          </div>
        </div>
      </div>

      {/* Batch Test Result Table */}
      {testResults.length > 0 && (
        <div className="bg-white dark:bg-[#101B15] p-6 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-[#111A15] dark:text-[#F8FAF8]">
            Batch Test Case Execution Results
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#0F382A]/10 dark:border-white/10 text-[#5E7265] uppercase font-mono">
                  <th className="py-2">Status</th>
                  <th className="py-2">Phrase</th>
                  <th className="py-2">Expected Digit</th>
                  <th className="py-2">Actual Digit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F382A]/5">
                {testResults.map((r, i) => (
                  <tr key={i} className="hover:bg-[#FAF9F5] dark:hover:bg-[#16241D]">
                    <td className="py-2 font-mono">
                      {r.pass ? (
                        <span className="text-emerald-500 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                        </span>
                      ) : (
                        <span className="text-red-500 font-bold flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> FAIL
                        </span>
                      )}
                    </td>
                    <td className="py-2 font-medium">{r.text}</td>
                    <td className="py-2 font-mono font-bold">{r.expected}</td>
                    <td className="py-2 font-mono">{r.actual || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
