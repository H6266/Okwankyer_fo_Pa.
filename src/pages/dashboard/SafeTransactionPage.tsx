import React, { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, ArrowRight, Shield, RefreshCw } from "lucide-react";
import { api, KycLookupResponse } from "../../lib/api";

type ScenarioType =
  | "positive_standard"
  | "negative_wrong_number"
  | "negative_declined_push"
  | "negative_timeout"
  | "negative_user_cancelled";

export const SafeTransactionPage: React.FC = () => {
  const [scenario, setScenario] = useState<ScenarioType>("positive_standard");
  const [stepIndex, setStepIndex] = useState(0);
  const [phoneInput, setPhoneInput] = useState("0553838464");
  const [amountInput, setAmountInput] = useState("500");
  const [kycResult, setKycResult] = useState<KycLookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const handleStartFlow = async () => {
    setStepIndex(1);
    setLogs([]);
    addLog(`Starting walkthrough: Scenario "${scenario}"`);

    if (scenario === "negative_wrong_number") {
      setPhoneInput("0249999999");
    } else {
      setPhoneInput("0553838464");
    }
  };

  const handleLookupKyc = async () => {
    setLoading(true);
    addLog(`Step 1 -> 2: Performing KYC registry lookup for ${phoneInput}`);
    try {
      const res = await api.lookupKyc(phoneInput);
      setKycResult(res);
      addLog(`KYC Result: Valid=${res.valid}, Name="${res.record?.name || "Unknown"}"`);
      setStepIndex(2);
    } catch (e: any) {
      addLog(`KYC Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmKyc = () => {
    if (scenario === "negative_wrong_number") {
      addLog("SAFETY GATE TRIGGERED: Caller rejected name readback! Transaction aborted safely.");
      setStepIndex(5); // Aborted safely
      return;
    }
    addLog(`Step 2 -> 3: Recipient verified as "${kycResult?.record?.name}". Moving to amount entry.`);
    setStepIndex(3);
  };

  const handleConfirmAmount = () => {
    addLog(`Step 3 -> 4: Amount confirmed as GH₵ ${amountInput}. Initiating Zero-PIN handoff to private screen.`);
    setStepIndex(4);
  };

  const handleSimulateHandsetPin = (approved: boolean) => {
    if (approved) {
      addLog("Step 4 -> Complete: Handset push approved with secret PIN on private screen.");
      addLog("Receipt issued: Reference OKP-847291.");
      setStepIndex(6); // Success
    } else {
      addLog("Step 4 -> Aborted: User declined USSD prompt on handset screen.");
      setStepIndex(7); // Declined
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Safe Transaction Guided Walkthrough
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Step-by-step verification of Ɔkwankyerɛfo Pa&apos;s four core safety gates: Spoken KYC Readback,
            Confirmation, Zero-PIN Handset Handoff, and Receipt Generation.
          </p>
        </div>
      </div>

      {/* Scenario Selector Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">Select Test Scenario</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => {
              setScenario("positive_standard");
              setStepIndex(0);
            }}
            className={`p-3.5 rounded-xl text-left border text-xs transition-all ${
              scenario === "positive_standard"
                ? "bg-emerald-50 border-emerald-600 text-slate-900 font-bold shadow-2xs"
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            }`}
          >
            <div className="font-bold text-slate-900">1. Standard Happy Path</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Known subscriber (Kwame Nyamebere), approved transfer</div>
          </button>

          <button
            onClick={() => {
              setScenario("negative_wrong_number");
              setStepIndex(0);
            }}
            className={`p-3.5 rounded-xl text-left border text-xs transition-all ${
              scenario === "negative_wrong_number"
                ? "bg-rose-50 border-rose-600 text-slate-900 font-bold shadow-2xs"
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            }`}
          >
            <div className="font-bold text-slate-900">2. Wrong Number Case</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Unregistered / unknown number prevents transfer</div>
          </button>

          <button
            onClick={() => {
              setScenario("negative_declined_push");
              setStepIndex(0);
            }}
            className={`p-3.5 rounded-xl text-left border text-xs transition-all ${
              scenario === "negative_declined_push"
                ? "bg-rose-50 border-rose-600 text-slate-900 font-bold shadow-2xs"
                : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
            }`}
          >
            <div className="font-bold text-slate-900">3. Handset USSD Declined</div>
            <div className="text-[11px] text-slate-500 mt-0.5">User declines prompt on phone screen</div>
          </button>
        </div>

        <button
          onClick={handleStartFlow}
          className="mt-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
        >
          Begin Guided Walkthrough
        </button>
      </div>

      {/* Interactive Step Card */}
      {stepIndex > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
              STEP {stepIndex} OF 4
            </span>
            <span className="text-xs font-mono text-slate-500 font-bold">
              {scenario.toUpperCase()}
            </span>
          </div>

          {/* Step 1: Input Recipient Phone */}
          {stepIndex === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">1. Recipient Phone Number Entry</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Caller punches beneficiary phone number into voice call followed by #.
                </p>
              </div>
              <div className="max-w-xs space-y-1.5">
                <input
                  type="text"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                />
              </div>
              <button
                onClick={handleLookupKyc}
                disabled={loading}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                <span>Submit Number (#)</span>
              </button>
            </div>
          )}

          {/* Step 2: KYC Readback Confirmation */}
          {stepIndex === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">2. Spoken KYC Name Readback</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Before any cash moves, the system reads back the verified real name from national telecom core.
                </p>
              </div>

              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs text-slate-800 space-y-1">
                <div className="text-[11px] text-emerald-800 font-semibold uppercase">Spoken Voice Prompt:</div>
                <div className="text-sm font-bold text-slate-900">
                  &quot;You are about to send money to {kycResult?.record?.name || "Unknown Subscriber"}, phone ending with {phoneInput.slice(-4)}. To confirm and send, press 1.&quot;
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleConfirmKyc}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  1: Yes, Name Matches
                </button>
                <button
                  onClick={() => {
                    addLog("Caller pressed 8 to return and re-enter phone number.");
                    setStepIndex(1);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl border border-slate-200"
                >
                  8: Back / Wrong Name
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Amount Confirmation */}
          {stepIndex === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">3. Transfer Amount Entry</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enter amount in Ghana cedis.
                </p>
              </div>
              <div className="max-w-xs space-y-1.5">
                <input
                  type="text"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                />
              </div>
              <button
                onClick={handleConfirmAmount}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Submit Amount (#)
              </button>
            </div>
          )}

          {/* Step 4: Zero-PIN Handset Handoff */}
          {stepIndex === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">4. Zero-PIN Security Gate Handoff</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  The voice call informs the user that confirmation is complete and mutes the microphone.
                </p>
              </div>

              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="font-bold">📱 Simulated Handset Push Notification:</div>
                <div className="text-slate-700">
                  Authorize payment of GH₵ {amountInput} to {kycResult?.record?.name}?
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSimulateHandsetPin(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Simulate User Approved on Handset
                </button>
                <button
                  onClick={() => handleSimulateHandsetPin(false)}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl"
                >
                  Simulate User Cancelled on Handset
                </button>
              </div>
            </div>
          )}

          {/* Outcome 5: Aborted Safely */}
          {stepIndex === 5 && (
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Protection Gate Verified: Zero Financial Loss</span>
              </div>
              <p className="text-slate-600">
                Because the caller rejected the spoken KYC name readback, zero money was deducted. The transaction was cancelled cleanly.
              </p>
              <button
                onClick={handleStartFlow}
                className="mt-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs"
              >
                Reset Walkthrough
              </button>
            </div>
          )}

          {/* Outcome 6: Completed Receipt */}
          {stepIndex === 6 && (
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Transaction Completed Successfully</span>
              </div>
              <p className="text-slate-600">
                Payment of GH₵ {amountInput} to {kycResult?.record?.name} succeeded. Spoken receipt reference OKP-847291 logged.
              </p>
              <button
                onClick={handleStartFlow}
                className="mt-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs"
              >
                Run Another Test
              </button>
            </div>
          )}

          {/* Outcome 7: Push Declined */}
          {stepIndex === 7 && (
            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-rose-800">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Handset Prompt Declined</span>
              </div>
              <p className="text-slate-600">
                The user chose not to authorize the prompt on their phone screen. No funds were debited.
              </p>
              <button
                onClick={handleStartFlow}
                className="mt-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors"
              >
                Reset Walkthrough
              </button>
            </div>
          )}
        </div>
      )}

      {/* Real-time Event Execution Log */}
      {logs.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <span className="text-xs font-bold text-slate-900">Walkthrough Event Execution Log</span>
          <pre className="p-4 bg-slate-50 border border-slate-200 text-slate-800 font-mono text-[11px] rounded-xl overflow-x-auto max-h-48 shadow-2xs">
            {logs.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
};
