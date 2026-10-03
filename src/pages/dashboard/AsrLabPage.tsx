import React, { useState } from "react";
import {
  Mic2,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  Lock,
  Layers,
  Sparkles,
  FileAudio,
} from "lucide-react";

interface AsrTestCase {
  id: string;
  language: "en-GH" | "ak-GH";
  spokenPhrase: string;
  transcription: string;
  category: "Send Money" | "Airtime" | "Balance Inquiry";
  status: "pending" | "pass" | "evaluating";
  confidence: number;
}

export const AsrLabPage: React.FC = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<"all" | "en-GH" | "ak-GH">("all");
  const [isRecording, setIsRecording] = useState(false);
  const [recognizedText, setRecognizedText] = useState<string | null>(null);

  const [testCases, setTestCases] = useState<AsrTestCase[]>([
    {
      id: "ASR-01",
      language: "en-GH",
      spokenPhrase: "Send twenty cedis to Kwame Nyamebere",
      transcription: "Send 20 cedis to Kwame Nyamebere",
      category: "Send Money",
      status: "pending",
      confidence: 0.94,
    },
    {
      id: "ASR-02",
      language: "ak-GH",
      spokenPhrase: "Fa sidi aduonu kɔma Kwame Nyamebere",
      transcription: "Fa sidi aduonu kɔma Kwame Nyamebere",
      category: "Send Money",
      status: "pending",
      confidence: 0.89,
    },
    {
      id: "ASR-03",
      language: "en-GH",
      spokenPhrase: "Buy five cedis airtime for my phone",
      transcription: "Buy 5 cedis airtime for my phone",
      category: "Airtime",
      status: "pending",
      confidence: 0.96,
    },
    {
      id: "ASR-04",
      language: "ak-GH",
      spokenPhrase: "Tɔ mframa sidi anum ma me",
      transcription: "Tɔ mframa sidi anum ma me",
      category: "Airtime",
      status: "pending",
      confidence: 0.87,
    },
    {
      id: "ASR-05",
      language: "en-GH",
      spokenPhrase: "How much is left in my MoMo wallet?",
      transcription: "How much is left in my MoMo wallet",
      category: "Balance Inquiry",
      status: "pending",
      confidence: 0.95,
    },
  ]);

  const handleTestAudioSample = (phrase: string) => {
    setIsRecording(true);
    setRecognizedText(null);
    setTimeout(() => {
      setIsRecording(false);
      setRecognizedText(phrase);
    }, 1200);
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
            ASR Security Mandate
          </div>
          <p className="text-xs text-amber-900 mt-0.5">
            Voice recognition models must NEVER transcribe, record, or accept personal MTN MoMo PINs.
            Customer PIN entry occurs only on the handset via MTN network USSD prompt.
          </p>
        </div>
      </div>

      {/* ── Phase Status Banner ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                ASR Laboratory (Speech Recognition)
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                Phase 2 Roadmap
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Benchmarking acoustic speech-to-text models for Ghanaian English and Akan (Twi) financial commands.
              Scheduled for activation following MoMo Phase 1 stability verification.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              Target WER: &lt; 8.5%
            </span>
          </div>
        </div>

        {/* Phase Timeline Tracker */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Dialects Supported</span>
            <div className="font-extrabold text-slate-800 mt-0.5">en-GH &amp; Akan (Asante/Fante Twi)</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Acoustic Seam</span>
            <div className="font-extrabold text-slate-800 mt-0.5">Africa&apos;s Talking 8kHz Telephony Audio</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Laboratory Readiness</span>
            <div className="font-extrabold text-emerald-700 mt-0.5">Scaffolding &amp; Corpus Defined</div>
          </div>
        </div>
      </div>

      {/* ── Interactive Spoken Command Tester ─────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-extrabold text-slate-900">
          Spoken Command Benchmark Runner
        </h2>
        <p className="text-xs text-slate-500">
          Select or simulate audio clips to test phonetic accuracy on local banking terminology.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="text-xs font-bold text-slate-700">Preset Sample Voice Clips:</div>
            {testCases.map((tc) => (
              <div
                key={tc.id}
                onClick={() => handleTestAudioSample(tc.transcription)}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition-all flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-slate-800">{tc.spokenPhrase}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {tc.language === "en-GH" ? "Ghanaian English" : "Akan (Twi)"} • {tc.category}
                  </div>
                </div>
                <button
                  type="button"
                  className="p-2 bg-white text-emerald-700 rounded-lg shadow-2xs hover:bg-emerald-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                </button>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 rounded-2xl p-5 text-white flex flex-col justify-between">
            <div>
              <div className="text-xs font-mono text-slate-400 pb-2 border-b border-slate-800">
                ASR MODEL INFERENCE LOGS
              </div>
              <div className="mt-4 font-mono text-xs space-y-3">
                {isRecording ? (
                  <div className="text-amber-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    Processing telecom audio stream...
                  </div>
                ) : recognizedText ? (
                  <div className="space-y-2">
                    <div className="text-slate-400 text-[11px]">TRANSCRIBED UTTERANCE:</div>
                    <div className="text-sm font-bold text-emerald-400 bg-slate-950 p-3 rounded-xl border border-slate-800">
                      &quot;{recognizedText}&quot;
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Confidence Score: <span className="text-emerald-400 font-bold">94.8%</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500 py-10 text-center">
                    Select a sample clip on the left to benchmark recognition.
                  </div>
                )}
              </div>
            </div>
            <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-800">
              Phase 2 ASR Pipeline Interface
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
