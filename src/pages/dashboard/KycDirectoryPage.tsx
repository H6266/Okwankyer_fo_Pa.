import React, { useState } from "react";
import { Search, Plus, UserCheck, Volume2, ShieldCheck } from "lucide-react";

interface SubscriberRecord {
  phone: string;
  name: string;
  network: "MTN" | "Telecel" | "AT";
  tier: "Tier 1" | "Tier 2" | "Tier 3";
  verified: boolean;
}

const INITIAL_SUBSCRIBERS: SubscriberRecord[] = [
  { phone: "0553838464", name: "Kwame Nyamebere", network: "MTN", tier: "Tier 2", verified: true },
  { phone: "0241234567", name: "Kwame Nyameba", network: "MTN", tier: "Tier 1", verified: true },
  { phone: "0543546010", name: "Hannes Aboagye", network: "MTN", tier: "Tier 3", verified: true },
  { phone: "0244123456", name: "Kwame Mensah", network: "MTN", tier: "Tier 2", verified: true },
  { phone: "0201234567", name: "Ama Serwaa", network: "Telecel", tier: "Tier 2", verified: true },
  { phone: "0271234567", name: "Yaw Osei", network: "AT", tier: "Tier 1", verified: true },
  { phone: "0551234567", name: "Abena Mansa", network: "MTN", tier: "Tier 2", verified: true },
  { phone: "0249876543", name: "Kofi Annan", network: "MTN", tier: "Tier 3", verified: true },
];

export const KycDirectoryPage: React.FC = () => {
  const [subscribers, setSubscribers] = useState<SubscriberRecord[]>(INITIAL_SUBSCRIBERS);
  const [search, setSearch] = useState("");
  const [previewContact, setPreviewContact] = useState<SubscriberRecord | null>(INITIAL_SUBSCRIBERS[0]);
  const [previewAmount, setPreviewAmount] = useState("500");

  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newNetwork, setNewNetwork] = useState<"MTN" | "Telecel" | "AT">("MTN");

  const handleAddSubscriber = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone || !newName) return;
    const added: SubscriberRecord = {
      phone: newPhone.replace(/[^0-9]/g, ""),
      name: newName,
      network: newNetwork,
      tier: "Tier 2",
      verified: true,
    };
    setSubscribers([added, ...subscribers]);
    setPreviewContact(added);
    setNewPhone("");
    setNewName("");
  };

  const filtered = subscribers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.phone.includes(search)
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-extrabold text-[#111A15] dark:text-[#F8FAF8]">
          KYC &amp; Subscribers Directory
        </h1>
        <p className="text-xs text-[#5E7265] dark:text-[#95A99E] mt-0.5">
          Search the mock subscriber directory, add test phone numbers, and preview the synthesized spoken KYC name readback before money moves.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Subscriber Directory Table */}
        <div className="lg:col-span-8 bg-white dark:bg-[#101B15] p-5 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-[#5E7265] absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or phone..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[#0F382A]/15 bg-[#FAF9F5] dark:bg-[#16241D] text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>
            <span className="text-xs font-mono text-[#5E7265]">
              {filtered.length} Registered Accounts
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#0F382A]/10 dark:border-white/10 text-[#5E7265] uppercase font-mono">
                  <th className="py-2.5 px-3">Subscriber Name</th>
                  <th className="py-2.5 px-3">Phone Number</th>
                  <th className="py-2.5 px-3">Carrier</th>
                  <th className="py-2.5 px-3">KYC Tier</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0F382A]/5">
                {filtered.map((sub) => (
                  <tr
                    key={sub.phone}
                    onClick={() => setPreviewContact(sub)}
                    className={`cursor-pointer transition-colors ${
                      previewContact?.phone === sub.phone
                        ? "bg-[#D4AF37]/15 dark:bg-[#D4AF37]/20 font-bold"
                        : "hover:bg-[#FAF9F5] dark:hover:bg-[#16241D]"
                    }`}
                  >
                    <td className="py-3 px-3 flex items-center gap-2">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>{sub.name}</span>
                    </td>
                    <td className="py-3 px-3 font-mono">{sub.phone}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[#0F382A]/10">
                        {sub.network}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[#5E7265]">{sub.tier}</td>
                    <td className="py-3 px-3 text-right">
                      <button className="text-[11px] text-[#0F382A] dark:text-[#D4AF37] font-semibold hover:underline">
                        Preview Spoken Readback
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Spoken Name Readback Preview & Add Form */}
        <div className="lg:col-span-4 space-y-4">
          {/* Spoken Name Readback Preview Box */}
          <div className="bg-white dark:bg-[#101B15] p-5 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-[#0F382A]/10 dark:border-white/10">
              <Volume2 className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#111A15] dark:text-[#F8FAF8]">
                Spoken Readback Preview
              </h2>
            </div>

            {previewContact ? (
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <label className="text-[10px] text-[#5E7265] block mb-1">Transfer Amount (GHS):</label>
                  <input
                    type="text"
                    value={previewAmount}
                    onChange={(e) => setPreviewAmount(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border bg-[#FAF9F5] dark:bg-[#16241D] font-mono font-bold"
                  />
                </div>

                <div className="p-3.5 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border border-[#D4AF37]/30 space-y-1.5">
                  <div className="text-[10px] text-[#D4AF37] font-bold">ENGLISH SPOKEN READBACK:</div>
                  <div className="text-xs text-[#111A15] dark:text-neutral-200 italic font-sans font-medium">
                    "You are about to send {previewAmount} Ghana Cedis to {previewContact.name}, whose phone number ends with {previewContact.phone.slice(-4)}. To confirm and send, press 1."
                  </div>
                </div>

                <div className="p-3.5 bg-[#FAF9F5] dark:bg-[#16241D] rounded-xl border border-[#D4AF37]/30 space-y-1.5">
                  <div className="text-[10px] text-[#D4AF37] font-bold">AKAN TWI SPOKEN READBACK:</div>
                  <div className="text-xs text-[#111A15] dark:text-neutral-200 italic font-sans font-medium">
                    "Me pɛ sɛ wo bɛ sendi sika cedi {previewAmount} kɔ {previewContact.name} fɔn so, number a ɛwie {previewContact.phone.slice(-4)}. Sɛ wopene so a, mia baako (1)."
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-[#5E7265]">Select a contact to test audio readback.</div>
            )}
          </div>

          {/* Add Test Contact Form */}
          <div className="bg-white dark:bg-[#101B15] p-5 rounded-2xl border border-[#0F382A]/10 dark:border-[#D4AF37]/20 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#111A15] dark:text-[#F8FAF8] flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Test Subscriber</span>
            </h3>

            <form onSubmit={handleAddSubscriber} className="space-y-2 text-xs">
              <div>
                <label className="text-[10px] font-semibold text-[#5E7265]">Phone (10 digits):</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="024XXXXXXX"
                  required
                  className="w-full px-2.5 py-1.5 rounded-lg border bg-[#FAF9F5] dark:bg-[#16241D] font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-[#5E7265]">Verified Full Name:</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Kofi Annan"
                  required
                  className="w-full px-2.5 py-1.5 rounded-lg border bg-[#FAF9F5] dark:bg-[#16241D]"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-[#5E7265]">Carrier:</label>
                <select
                  value={newNetwork}
                  onChange={(e) => setNewNetwork(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-lg border bg-[#FAF9F5] dark:bg-[#16241D]"
                >
                  <option value="MTN">MTN Ghana</option>
                  <option value="Telecel">Telecel Ghana</option>
                  <option value="AT">AirtelTigo (AT)</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-2 bg-[#0F382A] text-white hover:bg-[#1A543F] font-bold rounded-lg shadow-xs transition-colors"
              >
                Register Mock Contact
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
