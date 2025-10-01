// src/app/admin/summary/page.tsx
"use client";

import { useEffect, useState } from "react";

type TodayRow = {
  time: string;                  // ISO string from API
  project: string;               // "NBK" | "JP"
  voterCode: string;
  voterName?: string;
  voterCompany?: string;         // <-- added (you render this)
  targetCode: string;
  targetName?: string;
  targetCompany?: string;        // <-- added (you render this)
  voteType?: "token" | "goodCatch";
};

type MonthTotal = {
  companyId: string;
  companyName: string;
  project: string;               // "NBK" | "JP"
  count: number;
};

export default function AdminSummary() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [votingOpen, setVotingOpen] = useState<boolean | null>(null);
  const [todayKey, setTodayKey] = useState("");
  const [monthKey, setMonthKey] = useState("");

  const [todayRows, setTodayRows] = useState<TodayRow[]>([]);
  const [monthTotals, setMonthTotals] = useState<MonthTotal[]>([]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/summary", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setVotingOpen(Boolean(json.votingOpen));
      setTodayKey(String(json.todayKey || ""));
      setMonthKey(String(json.monthKey || ""));

      const rows: TodayRow[] = Array.isArray(json.todayRows) ? json.todayRows : [];
      // Optional: sort newest first
      rows.sort((a, b) => +new Date(b.time) - +new Date(a.time));
      setTodayRows(rows);

      setMonthTotals(Array.isArray(json.monthTotals) ? json.monthTotals : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(+d)) return "—";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Summary</h1>
        <div className="flex items-center gap-2">
          {loading && <span className="text-sm text-gray-500">Loading…</span>}
          <button onClick={load} className="px-3 py-2 border rounded">
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500">Voting window</div>
          <div className="text-lg">
            {votingOpen === null ? "—" : votingOpen ? "OPEN" : "CLOSED"}
          </div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500">Today</div>
          <div className="text-lg">{todayKey || "—"}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500">Month</div>
          <div className="text-lg">{monthKey || "—"}</div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Today’s Votes ({todayRows.length})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Time</th>
                <th className="border px-2 py-1 text-left">Proj</th>
                <th className="border px-2 py-1 text-left">Voter</th>
                <th className="border px-2 py-1 text-left">Voter Company</th>
                <th className="border px-2 py-1 text-left">Target</th>
                <th className="border px-2 py-1 text-left">Target Company</th>
              </tr>
            </thead>
            <tbody>
              {todayRows.map((r, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{fmtTime(r.time)}</td>
                  <td className="border px-2 py-1">{r.project}</td>
                  <td className="border px-2 py-1">{r.voterName || r.voterCode}</td>
                  <td className="border px-2 py-1">{r.voterCompany || "—"}</td>
                  <td className="border px-2 py-1">{r.targetName || r.targetCode}</td>
                  <td className="border px-2 py-1">{r.targetCompany || "—"}</td>
                </tr>
              ))}
              {todayRows.length === 0 && (
                <tr>
                  <td className="border px-2 py-2 text-center text-gray-500" colSpan={6}>
                    No votes today.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">This Month by Company</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Project</th>
                <th className="border px-2 py-1 text-left">Company</th>
                <th className="border px-2 py-1 text-right">Votes</th>
              </tr>
            </thead>
            <tbody>
              {monthTotals.map((m, i) => (
                <tr key={i}>
                  <td className="border px-2 py-1">{m.project}</td>
                  <td className="border px-2 py-1">{m.companyName}</td>
                  <td className="border px-2 py-1 text-right">{m.count}</td>
                </tr>
              ))}
              {monthTotals.length === 0 && (
                <tr>
                  <td className="border px-2 py-2 text-center text-gray-500" colSpan={3}>
                    No votes this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
