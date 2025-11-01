// src/app/admin/summary/SummaryClient.tsx
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
  companyId?: string;
  companyName: string;
  project: string;
  count: number;
};

type TargetTotal = {
  project: string;
  targetCode?: string;
  targetName: string;
  targetCompany?: string;
  count: number;
};

type CompanyReceivedTotal = {
  project: string;
  companyName: string;
  count: number;
};

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

export default function SummaryClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [votingOpen, setVotingOpen] = useState<boolean | null>(null);
  const [todayKey, setTodayKey] = useState("");
  const [monthKey, setMonthKey] = useState("");
  const [selectedYM, setSelectedYM] = useState<string>(getCurrentYM());

  const [todayRows, setTodayRows] = useState<TodayRow[]>([]);
  const [monthTotals, setMonthTotals] = useState<MonthTotal[]>([]);
  const [monthRows, setMonthRows] = useState<MonthRow[] | null>(null);

  // Tokens leaderboards from API
  const [monthTargetTotals, setMonthTargetTotals] = useState<TargetTotal[]>([]);
  const [monthCompanyReceivedTotals, setMonthCompanyReceivedTotals] = useState<
    CompanyReceivedTotal[]
  >([]);

  // Keep ?month in URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (selectedYM) params.set("month", selectedYM);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, "", newUrl);
    } catch {}
  }, [selectedYM]);

  // Read ?month once
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlYm = params.get("month");
      if (urlYm && isValidYM(urlYm)) setSelectedYM(urlYm);
    } catch {}
  }, []);

  async function load(forYM?: string) {
    const raw = forYM ?? selectedYM ?? getCurrentYM();
    const ym = isValidYM(raw) ? raw : getCurrentYM();

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/summary?month=${encodeURIComponent(ym)}`,
        {
          cache: "no-store",
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      setVotingOpen(Boolean(json.votingOpen));
      setTodayKey(String(json.todayKey || ""));
      setMonthKey(String(json.monthKey || ym));

      const rows: TodayRow[] = Array.isArray(json.todayRows)
        ? json.todayRows
        : [];
      rows.sort((a, b) => +new Date(b.time) - +new Date(a.time));
      setTodayRows(rows);

      setMonthTotals(Array.isArray(json.monthTotals) ? json.monthTotals : []);

      const mRows: MonthRow[] | null = Array.isArray(json.monthRows)
        ? json.monthRows
        : null;
      if (mRows) mRows.sort((a, b) => +new Date(b.time) - +new Date(a.time));
      setMonthRows(mRows);

      setMonthTargetTotals(
        Array.isArray(json.monthTargetTotals) ? json.monthTargetTotals : []
      );
      setMonthCompanyReceivedTotals(
        Array.isArray(json.monthCompanyReceivedTotals)
          ? json.monthCompanyReceivedTotals
          : []
      );
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

  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(+d)) return { date: "—", time: "" };
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const date = `${yyyy}-${mm}-${dd}`;
    const time = d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    return { date, time };
  };

  const monthVotesLabel = useMemo(() => {
    if (!selectedYM) return "Votes";
    return `Votes — ${selectedYM}`;
  }, [selectedYM]);

  // ---------- Good Catch derivations (all client-side) ----------
  // Use month rows when available; otherwise fall back to today's rows
  const sourceRows: MonthRow[] = useMemo(
    () => monthRows ?? todayRows,
    [monthRows, todayRows]
  );

  const goodCatchRows = useMemo(
    () => sourceRows.filter((r) => r.voteType === "goodCatch"),
    [sourceRows]
  );

  // Totals for goodCatch by target (person)
  const goodCatchTargetTotals: TargetTotal[] = useMemo(() => {
    const map = new Map<string, TargetTotal>();
    for (const r of goodCatchRows) {
      const project = r.project || "";
      const tName = r.targetName || r.targetCode || "(Unknown)";
      const tCompany = r.targetCompany || undefined;
      const key = `${project}|${tName}|${tCompany ?? ""}`;
      const cur = map.get(key) || {
        project,
        targetCode: r.targetCode,
        targetName: tName,
        targetCompany: tCompany,
        count: 0,
      };
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [goodCatchRows]);

  // Totals for goodCatch by company (received)
  const goodCatchCompanyTotals: CompanyReceivedTotal[] = useMemo(() => {
    const map = new Map<string, CompanyReceivedTotal>();
    for (const r of goodCatchRows) {
      const project = r.project || "";
      const cName = (r.targetCompany || "(Unknown)").trim();
      const key = `${project}|${cName}`;
      const cur = map.get(key) || { project, companyName: cName, count: 0 };
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [goodCatchRows]);

  // --------------------------------------------------------------

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

        {/* Selected Month card */}
        <div className="border rounded p-4">
          <div className="space-y-2">
            <div className="text-sm text-gray-500">Selected Month</div>
            <div className="flex items-center justify-between gap-2">
              <div className="text-lg">{monthKey || selectedYM || "—"}</div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  className="px-2 py-1 border rounded text-sm"
                  onClick={() =>
                    setSelectedYM((ym) => prevYM(ym || getCurrentYM()))
                  }
                  aria-label="Previous month"
                  title="Previous month"
                >
                  ◀
                </button>
                <input
                  className="border rounded px-2 py-1 text-sm w-[120px] text-center"
                  type="month"
                  value={selectedYM}
                  onChange={(e) => setSelectedYM(e.target.value)}
                />
                <button
                  className="px-2 py-1 border rounded text-sm"
                  onClick={() =>
                    setSelectedYM((ym) => nextYM(ym || getCurrentYM()))
                  }
                  aria-label="Next month"
                  title="Next month"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Votes table */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">
            {monthRows
              ? `${monthVotesLabel} (${monthRows.length})`
              : `Today’s Votes (${todayRows.length})`}
          </h2>
          {!monthRows && (
            <div className="text-xs text-gray-500">
              (Tip: return <code>monthRows</code> from your API to see month
              history here)
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Date</th>
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
                  <td className="border px-2 py-1 leading-tight">
                    {(() => {
                      const dt = fmtDateTime(r.time);
                      return (
                        <>
                          <div>{dt.date}</div>
                          <div className="text-xs text-gray-500">{dt.time}</div>
                        </>
                      );
                    })()}
                  </td>
                  <td className="border px-2 py-1">{r.project}</td>
                  <td className="border px-2 py-1">
                    {r.voterName || r.voterCode}
                  </td>
                  <td className="border px-2 py-1">{r.voterCompany || "—"}</td>
                  <td className="border px-2 py-1">
                    {r.targetName || r.targetCode}
                  </td>
                  <td className="border px-2 py-1">{r.targetCompany || "—"}</td>
                </tr>
              ))}
              {(monthRows ?? todayRows).length === 0 && (
                <tr>
                  <td
                    className="border px-2 py-2 text-center text-gray-500"
                    colSpan={6}
                  >
                    {monthRows ? "No votes in this month." : "No votes today."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* By Company — Given (tokens) */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          By Company — {monthKey || selectedYM}
        </h2>
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
                <tr key={`${m.project}-${m.companyName}-${i}`}>
                  <td className="border px-2 py-1">{m.project}</td>
                  <td className="border px-2 py-1">{m.companyName}</td>
                  <td className="border px-2 py-1 text-right">{m.count}</td>
                </tr>
              ))}
              {monthTotals.length === 0 && (
                <tr>
                  <td
                    className="border px-2 py-2 text-center text-gray-500"
                    colSpan={3}
                  >
                    No votes in this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tokens — Top Targets */}
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
                  <td
                    className="border px-2 py-2 text-center text-gray-500"
                    colSpan={4}
                  >
                    No token receivers this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tokens — Company Received */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          By Company — Tokens Received ({monthKey || selectedYM})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Project</th>
                <th className="border px-2 py-1 text-left">Company</th>
                <th className="border px-2 py-1 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {monthCompanyReceivedTotals.map((t, i) => (
                <tr key={`${t.project}-${t.companyName}-${i}`}>
                  <td className="border px-2 py-1">{t.project}</td>
                  <td className="border px-2 py-1">{t.companyName}</td>
                  <td className="border px-2 py-1 text-right">{t.count}</td>
                </tr>
              ))}
              {monthCompanyReceivedTotals.length === 0 && (
                <tr>
                  <td
                    className="border px-2 py-2 text-center text-gray-500"
                    colSpan={3}
                  >
                    No token receivers this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Good Catches — rows */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          Good Catches — {monthKey || selectedYM} ({goodCatchRows.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Date</th>
                <th className="border px-2 py-1 text-left">Proj</th>
                <th className="border px-2 py-1 text-left">Reporter</th>
                <th className="border px-2 py-1 text-left">Reporter Company</th>
                <th className="border px-2 py-1 text-left">Target</th>
                <th className="border px-2 py-1 text-left">Target Company</th>
              </tr>
            </thead>
            <tbody>
              {goodCatchRows.map((r, i) => (
                <tr key={`${r.time}-${r.voterCode}-gc-${i}`}>
                  <td className="border px-2 py-1 leading-tight">
                    {(() => {
                      const dt = fmtDateTime(r.time);
                      return (
                        <>
                          <div>{dt.date}</div>
                          <div className="text-xs text-gray-500">{dt.time}</div>
                        </>
                      );
                    })()}
                  </td>
                  <td className="border px-2 py-1">{r.project}</td>
                  <td className="border px-2 py-1">
                    {r.voterName || r.voterCode}
                  </td>
                  <td className="border px-2 py-1">{r.voterCompany || "—"}</td>
                  <td className="border px-2 py-1">
                    {r.targetName || r.targetCode}
                  </td>
                  <td className="border px-2 py-1">{r.targetCompany || "—"}</td>
                </tr>
              ))}
              {goodCatchRows.length === 0 && (
                <tr>
                  <td
                    className="border px-2 py-2 text-center text-gray-500"
                    colSpan={6}
                  >
                    No good catches {monthRows ? "this month" : "today"}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Good Catches — totals by target */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          Good Catches — Top Targets ({monthKey || selectedYM})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Project</th>
                <th className="border px-2 py-1 text-left">Target</th>
                <th className="border px-2 py-1 text-left">Target Company</th>
                <th className="border px-2 py-1 text-right">Reports</th>
              </tr>
            </thead>
            <tbody>
              {goodCatchTargetTotals.map((t, i) => (
                <tr key={`${t.project}-${t.targetName}-${i}`}>
                  <td className="border px-2 py-1">{t.project}</td>
                  <td className="border px-2 py-1">{t.targetName}</td>
                  <td className="border px-2 py-1">{t.targetCompany || "—"}</td>
                  <td className="border px-2 py-1 text-right">{t.count}</td>
                </tr>
              ))}
              {goodCatchTargetTotals.length === 0 && (
                <tr>
                  <td
                    className="border px-2 py-2 text-center text-gray-500"
                    colSpan={4}
                  >
                    No good catches this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Good Catches — totals by company */}
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          Good Catches — By Company ({monthKey || selectedYM})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1 text-left">Project</th>
                <th className="border px-2 py-1 text-left">Company</th>
                <th className="border px-2 py-1 text-right">Reports</th>
              </tr>
            </thead>
            <tbody>
              {goodCatchCompanyTotals.map((c, i) => (
                <tr key={`${c.project}-${c.companyName}-${i}`}>
                  <td className="border px-2 py-1">{c.project}</td>
                  <td className="border px-2 py-1">{c.companyName}</td>
                  <td className="border px-2 py-1 text-right">{c.count}</td>
                </tr>
              ))}
              {goodCatchCompanyTotals.length === 0 && (
                <tr>
                  <td
                    className="border px-2 py-2 text-center text-gray-500"
                    colSpan={3}
                  >
                    No good catches this month.
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
