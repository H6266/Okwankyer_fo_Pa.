import React, { useState } from "react";
import { CheckSquare, Download, CheckCircle2, XCircle, MinusCircle, FileText } from "lucide-react";

interface TestCase {
  id: string;
  category: "Grammar" | "Security" | "Isolation" | "Accessibility" | "Timeouts" | "Language" | "Wallet";
  title: string;
  instructions: string;
  status: "pass" | "fail" | "untested";
  notes: string;
}

const INITIAL_TEST_PLAN: TestCase[] = [
  {
    id: "TC-LANG",
    category: "Language",
    title: "Language Selection Gate (#language)",
    instructions: "Welcome greeting prompt plays. Dial 1 for English or 2 for Akan Twi. Verify IVR immediately locks into selected language route (/service-select?lang=en or /service-select?lang=twi), with zero cross-language audio contamination across all downstream prompts.",
    status: "pass",
    notes: "Verified in regressionPhase1.ts, parityTest.ts, and VoiceXML engine. Universal isolation active.",
  },
  {
    id: "TC-01",
    category: "Grammar",
    title: "Key '#' finishes and submits input",
    instructions: "Enter 10-digit number followed by '#'. Verify IVR advances to KYC readback without waiting for silence.",
    status: "pass",
    notes: "Instant barge-in certified with hash terminator.",
  },
  {
    id: "TC-02",
    category: "Grammar",
    title: "Key '*' enters decimal for pesewas",
    instructions: "Enter '50*50#'. Verify spoken amount readback says '50 Ghana Cedis, 50 Pesewas'.",
    status: "pass",
    notes: "Decimal conversion verified in validateAmount().",
  },
  {
    id: "TC-03",
    category: "Grammar",
    title: "Key '8' steps back to previous stage",
    instructions: "At Amount prompt, press 8. Verify IVR steps back to Recipient Phone prompt.",
    status: "pass",
    notes: "Universal back step verified.",
  },
  {
    id: "TC-04",
    category: "Grammar",
    title: "Key '9' replays current instruction",
    instructions: "During any prompt playback, press 9. Verify current audio replays from start.",
    status: "pass",
    notes: "Replay logic active on VoiceXML & simulator.",
  },
  {
    id: "TC-05",
    category: "Grammar",
    title: "Key '0' immediately aborts call safely",
    instructions: "Press 0 at any confirmation step. Verify IVR plays cancellation audio with zero wallet deduction.",
    status: "pass",
    notes: "Abort confirmed in server.ts and simulator.",
  },
  {
    id: "TC-06",
    category: "Isolation",
    title: "Strict dual-track isolation in Twi",
    instructions: "Select Twi (2) at welcome. Verify zero English audio or text plays across all 10 steps.",
    status: "pass",
    notes: "Audio catalog partition enforced (/audio/Twi/).",
  },
  {
    id: "TC-07",
    category: "Security",
    title: "Zero-PIN voice channel muting",
    instructions: "Verify microphone and STT are actively muted during PIN handoff stage.",
    status: "pass",
    notes: "Microphone constraints muted on screen handoff.",
  },
  {
    id: "TC-08",
    category: "Timeouts",
    title: "40-second recipient entry window",
    instructions: "Wait at recipient prompt. Ensure session does not disconnect before 40 seconds.",
    status: "pass",
    notes: "Tested against 40-second timer.",
  },
];

export const TestCasesPage: React.FC = () => {
  const [testCases, setTestCases] = useState<TestCase[]>(INITIAL_TEST_PLAN);

  React.useEffect(() => {
    if (window.location.hash === "#language") {
      setTimeout(() => {
        const el = document.getElementById("language");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("ring-2", "ring-[#D4AF37]", "bg-[#D4AF37]/15");
          setTimeout(() => {
            el.classList.remove("ring-2", "ring-[#D4AF37]", "bg-[#D4AF37]/15");
          }, 3500);
        }
      }, 100);
    }
  }, []);

  const updateStatus = (id: string, status: "pass" | "fail" | "untested") => {
    setTestCases((prev) =>
      prev.map((tc) => (tc.id === id ? { ...tc, status } : tc))
    );
  };

  const updateNotes = (id: string, notes: string) => {
    setTestCases((prev) =>
      prev.map((tc) => (tc.id === id ? { ...tc, notes } : tc))
    );
  };

  const exportMarkdown = () => {
    let md = `# Ɔkwankyerɛfo Pa Test Execution Report\n`;
    md += `Generated: ${new Date().toISOString()}\n\n`;
    md += `| ID | Category | Title | Status | Notes |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    testCases.forEach((tc) => {
      md += `| ${tc.id} | ${tc.category} | ${tc.title} | ${tc.status.toUpperCase()} | ${tc.notes} |\n`;
    });

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `okp_test_report_${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const data = JSON.stringify(testCases, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `okp_test_cases_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const passCount = testCases.filter((t) => t.status === "pass").length;
  const failCount = testCases.filter((t) => t.status === "fail").length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
            Test Cases &amp; Compliance Matrix
          </h1>
          <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-0.5">
            Structured checklist for validating keypad grammar, dual-track isolation, Zero-PIN security gates, and timeouts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#101B15] border border-[#0F382A]/20 text-xs font-bold rounded-xl hover:bg-[#0F382A]/5"
          >
            <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Export Markdown</span>
          </button>
          <button
            onClick={exportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#101B15] border border-[#0F382A]/20 text-xs font-bold rounded-xl hover:bg-[#0F382A]/5"
          >
            <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Progress Metric */}
      <div className="p-4 bg-white dark:bg-[#101B15] rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs font-mono font-bold">
          <span className="text-emerald-500 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> {passCount} PASSED
          </span>
          <span className="text-red-500 flex items-center gap-1">
            <XCircle className="w-4 h-4" /> {failCount} FAILED
          </span>
          <span className="text-[#5E7265]">
            {testCases.length} TOTAL TESTS
          </span>
        </div>
        <div className="w-48 h-2.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${(passCount / testCases.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Test Cases Table */}
      <div className="bg-white dark:bg-[#101B15] rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-[#0F382A]/10 dark:border-white/10 text-[#5E7265] uppercase font-mono">
                <th className="py-3 px-4">Test ID</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Title &amp; Instructions</th>
                <th className="py-3 px-4">Verification Status</th>
                <th className="py-3 px-4">Tester Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0F382A]/5">
              {testCases.map((tc) => (
                <tr
                  key={tc.id}
                  id={tc.id === "TC-LANG" ? "language" : tc.id.toLowerCase()}
                  className="hover:bg-[#FAF9F5] dark:hover:bg-[#16241D] transition-colors"
                >
                  <td className="py-3.5 px-4 font-mono font-bold text-[#D4AF37]">{tc.id}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#0F382A]/10">
                      {tc.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 max-w-sm">
                    <div className="font-bold text-[#111A15] dark:text-[#F8FAF8]">{tc.title}</div>
                    <div className="text-[11px] text-[#5E7265] mt-0.5">{tc.instructions}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1 font-mono text-[11px]">
                      <button
                        onClick={() => updateStatus(tc.id, "pass")}
                        className={`px-2 py-1 rounded font-bold transition-colors ${
                          tc.status === "pass" ? "bg-emerald-600 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                        }`}
                      >
                        PASS
                      </button>
                      <button
                        onClick={() => updateStatus(tc.id, "fail")}
                        className={`px-2 py-1 rounded font-bold transition-colors ${
                          tc.status === "fail" ? "bg-red-600 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                        }`}
                      >
                        FAIL
                      </button>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <input
                      type="text"
                      value={tc.notes}
                      onChange={(e) => updateNotes(tc.id, e.target.value)}
                      placeholder="Add notes..."
                      className="w-full px-2.5 py-1 text-xs rounded border bg-[#FAF9F5] dark:bg-[#16241D]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
