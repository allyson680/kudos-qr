// src/app/admin/summary/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type TodayRow = {
  time: string;
  project: string;
  voterCode: string;
  voterName?: string;
  voterCompany?: string;
  targetCode: string;
  targetName?: string;
  targetCompany?: string;
  voteType?: "token" | "goodCatch";
};
type MonthRow = TodayRow;

type MonthTotal = {
  companyId: string;
  companyName: string;
  project: string;
  count: number;
};

// NEW: target totals
type TargetTotal = {
  project: string;
  targetCode?: string;
  targetName: string;
  targetCompany?: string;
  count: number;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getCurrentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
function prevYM(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextYM(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isValidYM(ym: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [votingOpen, setVotingOpen] = useState<boolean | null>(null);
  const [todayKey, setTodayKey] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [selectedYM, setSelectedYM] = useState<string>(getCurrentYM());

  const [todayRows, setTodayRows] = useState<TodayRow[]>([]);
  const [monthTotals, setMonthTotals] = useState<MonthTotal[]>([]);
  const [monthRows, setMonthRows] = useState<MonthRow[] | null>(null);

  // NEW:
  const [monthTargetTotals, setMonthTargetTotals] = useState<TargetTotal[]>([]);

  const exportRowsHref = useMemo(
    () => `/api/admin/summary/export?month=${encodeURIComponent(selectedYM)}&type=rows`,
    [selectedYM]
  );
  const exportTotalsHref = useMemo(
    () => `/api/admin/summary/export?month=${encodeURIComponent(selectedYM)}&type=totals`,
    [selectedYM]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedYM) params.set("month", selectedYM);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [selectedYM]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlYm = params.get("month");
    if (urlYm && isValidYM(urlYm)) setSelectedYM(urlYm);
  }, []);

  async function load(forYM?: string) {
    const raw = forYM ?? selectedYM ?? getCurrentYM();
    const ym = isValidYM(raw) ? raw : getCurrentYM();

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/summary?month=${encodeURIComponent(ym)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setVotingOpen(Boolean(json.votingOpen));
      setTodayKey(String(json.todayKey || ""));
      setMonthKey(String(json.monthKey || ym));

      const rows: TodayRow[] = Array.isArray(json.todayRows) ? json.todayRows : [];
      rows.sort((a, b) => +new Date(b.time) - +new Date(a.time));
      setTodayRows(rows);

      setMonthTotals(Array.isArray(json.monthTotals) ? json.monthTotals : []);

      const mRows: MonthRow[] | null = Array.isArray(json.monthRows) ? json.monthRows : null;
      if (mRows) mRows.sort((a, b) => +new Date(b.time) - +new Date(a.time));
      setMonthRows(mRows);

      // NEW:
      setMonthTargetTotals(Array.isArray(json.monthTargetTotals) ? json.monthTargetTotals : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load summary");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYM]);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(+d)) return "—";
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const monthVotesLabel = useMemo(() => {
    if (!selectedYM) return "Votes";
    return `Votes — ${selectedYM}`;
  }, [selectedYM]);

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Summary</h1>
        <div className="flex items-center gap-2">
          {loading && <span className="text-sm text-gray-500">Loading…</span>}
          <button
            onClick={() => load()}
            disabled={loading}
            className="px-3 py-2 border rounded disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 text-red-700 p-3 text-sm">
          {error}
        </div>
      )}

      {/* KPI cards */}
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-gray-500">Selected Month</div>
              <div className="text-lg">{monthKey || selectedYM || "—"}</div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1">
                <button
                  className="px-2 py-1 border rounded text-sm"
                  onClick={() => setSelectedYM((ym) => prevYM(ym || getCurrentYM()))}
                  aria-label="Previous month"
                  title="Previous month"
                >
                  ◀
                </button>
                <input
                  className="border rounded px-2 py-1 text-sm"
                  type="month"
                  value={selectedYM}
                  onChange={(e) => setSelectedYM(e.target.value)}
                />
                <button
                  className="px-2 py-1 border rounded text-sm"
                  onClick={() => setSelectedYM((ym) => nextYM(ym || getCurrentYM()))}
                  aria-label="Next month"
                  title="Next month"
                >
                  ▶
                </button>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/api/admin/summary/export?month=${encodeURIComponent(selectedYM)}&type=rows`}
                  className="px-3 py-2 border rounded text-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Export Month CSV
                </a>
                <a
                  href={`/api/admin/summary/export?month=${encodeURIComponent(
                    selectedYM
                  )}&type=totals`}
                  className="px-3 py-2 border rounded text-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Export Totals CSV
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Month votes (or Today as fallback) */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">
            {monthRows
              ? `${monthVotesLabel} (${monthRows.length})`
              : `Today’s Votes (${todayRows.length})`}
          </h2>
          {!monthRows && (
            <div className="text-xs text-gray-500">
              (Tip: return <code>monthRows</code> from your API to see month history here)
            </div>
          )}
        </div>

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
              {(monthRows ?? todayRows).map((r, i) => (
                <tr key={(r as any)?.id ?? `${r.time}-${r.voterCode}-${i}`}>
                  <td className="border px-2 py-1">{fmtTime(r.time)}</td>
                  <td className="border px-2 py-1">{r.project}</td>
                  <td className="border px-2 py-1">{r.voterName || r.voterCode}</td>
                  <td className="border px-2 py-1">{r.voterCompany || "—"}</td>
                  <td className="border px-2 py-1">{r.targetName || r.targetCode}</td>
                  <td className="border px-2 py-1">{r.targetCompany || "—"}</td>
                </tr>
              ))}
              {(monthRows ?? todayRows).length === 0 && (
                <tr>
                  <td className="border px-2 py-2 text-center text-gray-500" colSpan={6}>
                    {monthRows ? "No votes in this month." : "No votes today."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totals by Voter Company */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">By Company — {monthKey || selectedYM}</h2>
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
                <tr key={`${m.project}-${m.companyId || m.companyName}-${i}`}>
                  <td className="border px-2 py-1">{m.project}</td>
                  <td className="border px-2 py-1">{m.companyName}</td>
                  <td className="border px-2 py-1 text-right">{m.count}</td>
                </tr>
              ))}
              {monthTotals.length === 0 && (
                <tr>
                  <td className="border px-2 py-2 text-center text-gray-500" colSpan={3}>
                    No votes in this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* NEW: Top Targets (Most Tokens Received) */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          Top Targets — Tokens Received ({monthKey || selectedYM})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Project</th>
                <th className="border px-2 py-1 text-left">Target</th>
                <th className="border px-2 py-1 text-left">Target Company</th>
                <th className="border px-2 py-1 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {monthTargetTotals.map((t, i) => (
                <tr key={`${t.project}-${t.targetCode || t.targetName}-${i}`}>
                  <td className="border px-2 py-1">{t.project}</td>
                  <td className="border px-2 py-1">{t.targetName}</td>
                  <td className="border px-2 py-1">{t.targetCompany || "—"}</td>
                  <td className="border px-2 py-1 text-right">{t.count}</td>
                </tr>
              ))}
              {monthTargetTotals.length === 0 && (
                <tr>
                  <td className="border px-2 py-2 text-center text-gray-500" colSpan={4}>
                    No token receivers this month.
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
