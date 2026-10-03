import React, { useState, useEffect } from "react";
import { Download, Filter, Search, CheckCircle2, Clock, XCircle, ShieldCheck } from "lucide-react";
import { api, LedgerItem } from "../../lib/api";

export const LedgerPage: React.FC = () => {
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLedger();
  }, []);

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const data = await api.getLedger();
      setLedger(data);
    } catch (e) {
      console.warn("Ledger fetch failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = ledger.filter((item) => {
    const matchesSearch =
      item.referenceId.toLowerCase().includes(search.toLowerCase()) ||
      item.msisdn.includes(search) ||
      (item.recipientName && item.recipientName.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const exportCsv = () => {
    const headers = [
      "Reference ID",
      "Type",
      "Carrier",
      "MSISDN",
      "Recipient",
      "Amount",
      "Status",
      "Timestamp",
    ];
    const rows = filtered.map((l) => [
      l.referenceId,
      l.type,
      "MTN",
      l.msisdn,
      `"${l.recipientName || ""}"`,
      l.amount.toFixed(2),
      l.status,
      l.createdAt,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `okp_momo_ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const volumeByCurrency = filtered.reduce<Record<string, number>>((totals, item) => {
    totals[item.currency] = (totals[item.currency] || 0) + item.amount;
    return totals;
  }, {});

  return (
    <div className="space-y-6 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            MTN MoMo Transaction Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Collection and disbursement records returned by the MTN MoMo integration.
          </p>
        </div>

        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl shadow-xs transition-colors"
        >
          <Download className="w-4 h-4 text-emerald-600" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Metrics Row (Clean White Theme) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Total Transactions</span>
          <div className="text-2xl font-black font-mono mt-1 text-slate-900">{filtered.length}</div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Volume by Currency</span>
          <div className="text-xl font-black font-mono mt-1 text-emerald-700">
            {Object.keys(volumeByCurrency).length
              ? Object.entries(volumeByCurrency).map(([currency, amount]) => `${currency} ${amount.toFixed(2)}`).join(" · ")
              : "—"}
          </div>
        </div>

        <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-mono text-slate-500 uppercase font-semibold">Status Source</span>
          <div className="text-2xl font-black font-mono mt-1 text-emerald-700 flex items-center gap-1.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <span>MTN MoMo</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ref ID, phone, or name..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-600 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:bg-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESSFUL">SUCCESSFUL</option>
            <option value="PENDING">PENDING</option>
            <option value="FAILED">FAILED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="TIMEOUT">TIMEOUT</option>
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading ledger records...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No transactions match current filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Reference ID</th>
                  <th className="px-5 py-3.5">Type</th>
                  <th className="px-5 py-3.5">Provider</th>
                  <th className="px-5 py-3.5">Phone &amp; Name</th>
                  <th className="px-5 py-3.5">Amount (GHS)</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Status Source</th>
                  <th className="px-5 py-3.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-900">{item.referenceId}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                          item.type === "COLLECTION_REQUEST_TO_PAY"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-blue-50 text-blue-800 border border-blue-200"
                        }`}
                      >
                        {item.type === "COLLECTION_REQUEST_TO_PAY" ? "COLLECTION" : "DISBURSEMENT"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-800">MTN</td>
                    <td className="px-5 py-3.5">
                      <div className="font-mono text-slate-900 font-bold">{item.msisdn}</div>
                      {item.recipientName && (
                        <div className="text-[11px] text-slate-500">{item.recipientName}</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                      {item.currency} {item.amount.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          item.status === "SUCCESSFUL"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {item.status === "SUCCESSFUL" && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        {item.status === "PENDING" && <Clock className="w-3 h-3 text-amber-600" />}
                        {["FAILED", "REJECTED", "TIMEOUT"].includes(item.status) && <XCircle className="w-3 h-3 text-rose-600" />}
                        <span>{item.status}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-bold">
                        MTN status
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[11px] text-slate-400">
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
