import React, { useState } from "react";
import {
  Sparkles,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
  Terminal,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface IntentResult {
  operation: "SEND_MONEY" | "BUY_AIRTIME" | "BUY_DATA" | "CHECK_BALANCE" | "REJECTED_PIN";
  recipient?: string;
  amount?: number;
  currency?: string;
  bundle?: string;
  securityViolation?: boolean;
  rawText: string;
}

export const LlmLabPage: React.FC = () => {
  const [inputText, setInputText] = useState("Send 50 cedis to 0241234567");
  const [parsing, setParsing] = useState(false);
  const [intentOutput, setIntentOutput] = useState<IntentResult | null>(null);

  const samplePrompts = [
    { text: "Send 50 cedis to 0241234567", type: "SEND_MONEY" },
    { text: "Buy 10 cedis airtime for 0553838464", type: "BUY_AIRTIME" },
    { text: "How much money do I have in my wallet?", type: "CHECK_BALANCE" },
    { text: "Transfer 25 cedis to sister on 0209876543", type: "SEND_MONEY" },
    { text: "Send 100 cedis with PIN 1234", type: "SECURITY_TEST" },
  ];

  const handleParseIntent = (textToParse: string = inputText) => {
    setParsing(true);
    setIntentOutput(null);

    setTimeout(() => {
      setParsing(false);
      const lower = textToParse.toLowerCase();

      // STRICT SECURITY CHECK
      if (lower.includes("pin") || lower.includes("secret") || lower.includes("password")) {
        setIntentOutput({
          operation: "REJECTED_PIN",
          securityViolation: true,
          rawText: textToParse,
        });
        return;
      }

      // Check balance
      if (lower.includes("balance") || lower.includes("how much")) {
        setIntentOutput({
          operation: "CHECK_BALANCE",
          currency: "GHS",
          rawText: textToParse,
        });
        return;
      }

      // Airtime
      if (lower.includes("airtime") || lower.includes("credit") || lower.includes("top up")) {
        const amountMatch = textToParse.match(/\b\d+(\.\d+)?\b/);
        const phoneMatch = textToParse.match(/\b0\d{9}\b/);
        setIntentOutput({
          operation: "BUY_AIRTIME",
          amount: amountMatch ? parseFloat(amountMatch[0]) : 10,
          recipient: phoneMatch ? phoneMatch[0] : "0553838464",
          currency: "GHS",
          rawText: textToParse,
        });
        return;
      }

      // Send money default
      const amountMatch = textToParse.match(/\b\d+(\.\d+)?\b/);
      const phoneMatch = textToParse.match(/\b0\d{9}\b/);

      setIntentOutput({
        operation: "SEND_MONEY",
        amount: amountMatch ? parseFloat(amountMatch[0]) : 50,
        recipient: phoneMatch ? phoneMatch[0] : "0241234567",
        currency: "GHS",
        rawText: textToParse,
      });
    }, 600);
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
            LLM Intent Guardrails
          </div>
          <p className="text-xs text-amber-900 mt-0.5">
            The LLM layer extracts structured transaction intent (operation, recipient, amount), but is strictly barred from handling PINs.
            Any user attempt to speak or enter a PIN is rejected immediately before reaching the transaction orchestrator.
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
                LLM / Intent Laboratory
              </h1>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                Phase 4 Roadmap
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Convert spoken or natural language queries into deterministic, structured JSON intent for the MoMo Transaction Orchestrator.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-100 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Deterministic Output</span>
            <div className="font-extrabold text-slate-800 mt-0.5">JSON Schema Enforced</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Security Guardrail</span>
            <div className="font-extrabold text-emerald-700 mt-0.5">PIN Redaction &amp; Intercept Active</div>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-400 uppercase font-bold text-[10px]">Downstream Consumer</span>
            <div className="font-extrabold text-slate-800 mt-0.5">Transaction Orchestrator</div>
          </div>
        </div>
      </div>

      {/* ── Interactive Intent Parser ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-base font-extrabold text-slate-900">
            Natural Language Query Input
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Enter or Speak Spoken Query:
              </label>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={3}
                className="w-full text-xs border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 rounded-xl p-3 text-slate-900 outline-none font-medium"
                placeholder="e.g. Send 50 cedis to 0241234567"
              />
            </div>

            <button
              onClick={() => handleParseIntent(inputText)}
              disabled={parsing || !inputText.trim()}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              {parsing ? "Extracting Intent..." : "Extract Structured Intent"}
            </button>

            <div className="pt-3">
              <div className="text-xs font-bold text-slate-600 mb-2">Preset Benchmark Prompts:</div>
              <div className="space-y-1.5">
                {samplePrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputText(p.text);
                      handleParseIntent(p.text);
                    }}
                    className={`w-full text-left p-2.5 text-xs rounded-xl border transition-all flex items-center justify-between ${
                      p.type === "SECURITY_TEST"
                        ? "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="font-mono text-[11px]">&quot;{p.text}&quot;</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200">
                      {p.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Structured Output */}
        <div className="lg:col-span-5 bg-slate-900 rounded-2xl border border-slate-800 p-5 text-white shadow-sm flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-800 text-xs font-mono text-slate-400">
              STRUCTURED INTENT JSON
            </div>
            <div className="mt-4 font-mono text-xs">
              {intentOutput ? (
                intentOutput.securityViolation ? (
                  <div className="p-4 bg-rose-950 border border-rose-700 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-rose-400 font-bold">
                      <XCircle className="w-4 h-4" />
                      SECURITY VIOLATION DETECTED
                    </div>
                    <p className="text-[11px] text-rose-200 leading-relaxed">
                      User query contained secret PIN references. Intent extraction rejected.
                      System rule: MoMo PIN must never be processed by the LLM or server.
                    </p>
                    <pre className="text-[10px] bg-slate-950 p-2 rounded text-rose-300">
                      {JSON.stringify(intentOutput, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Intent Successfully Extracted
                    </div>
                    <pre className="text-xs bg-slate-950 p-3 rounded-xl border border-slate-800 text-emerald-300 overflow-x-auto">
                      {JSON.stringify(
                        {
                          operation: intentOutput.operation,
                          recipient: intentOutput.recipient,
                          amount: intentOutput.amount,
                          currency: intentOutput.currency,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )
              ) : (
                <div className="text-slate-500 py-12 text-center">
                  Structured intent will be rendered here.
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-800 flex items-center justify-between">
            <span>Ready for Orchestrator</span>
            <span className="text-emerald-400">Zero-PIN Compliant</span>
          </div>
        </div>
      </div>
    </div>
  );
};
